"""Servidor HTTP mínimo do serviço ASR self-hosted (Iris, #72).

POR QUE ISTO EXISTE: transcrição de áudio clínico não pode atravessar a
internet (R11 do spec) — roda num container Python separado, na mesma rede
Swarm do app, sem framework web (evita puxar dependência não auditada; mesmo
espírito de "zero lógica extra" do infra/billing/agendador.sh).

Duas rotas:
  GET  /saude       -> 200 sempre que o processo está de pé e o modelo carregado.
  POST /transcrever  -> corpo = bytes crus do áudio (webm/opus); resposta = {"texto": "..."}.

Sem framework (Flask/FastAPI não estão na imagem, de propósito — molde de
`infra/billing/`: dependência listada à mão, nada herdado). `http.server` da
stdlib é suficiente para um serviço interno de baixo tráfego.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import socket
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("iris-asr")

# Tamanho do modelo definido por env, não hardcoded: T06 mede small vs medium
# na VPS real e o runbook.md registra qual ficou escolhido — este código não
# decide, só honra a escolha.
MODELO = os.environ.get("ASR_MODEL_SIZE", "small")
IDIOMA = os.environ.get("ASR_LANGUAGE", "pt")

# Bearer comparado com timingSafeEqual do lado do app (T07); aqui a comparação
# é `hmac.compare_digest` — tempo constante. O isolamento na rede interna do
# Swarm é defesa em profundidade, não a única barreira.
TOKEN = os.environ.get("ASR_SERVICE_TOKEN")

# Teto de corpo. R1 limita o clipe a 2 minutos; 2 min de webm/opus a 128 kbps
# dá ~1,9 MB. 10 MiB é folga de ~5x e ainda impede que um Content-Length
# abusivo estoure a RAM do container (16 GB dividida com todo o resto da VPS).
MAX_BYTES = int(os.environ.get("ASR_MAX_BYTES", str(10 * 1024 * 1024)))

# Teto de transcrições simultâneas. A VPS tem 4 vCPU sem GPU e o modelo é
# compartilhado entre as threads do ThreadingHTTPServer: sem este teto, N
# requisições concorrentes disputam toda a CPU e degradam todos os serviços do
# Iris juntos. O agendador (T08) também tem um teto — este é o backstop do
# lado do serviço, para o teto do chamador não ser a única barreira.
MAX_CONCORRENTES = int(os.environ.get("ASR_MAX_CONCORRENTES", "2"))
_vagas = threading.BoundedSemaphore(MAX_CONCORRENTES)

# Timeout de socket por conexão: cliente que abre e não fala nunca segura uma
# thread para sempre.
TIMEOUT_CONEXAO_S = int(os.environ.get("ASR_TIMEOUT_CONEXAO_S", "300"))

if not TOKEN:
    # Fail-fast, não fail-silent: sem token o serviço responderia 401 a todo
    # /transcrever enquanto o /saude segue 200 — "verde e morto", exatamente o
    # modo de falha que o runbook não consegue diagnosticar de fora. Crashloop
    # visível no Easypanel é o sinal correto.
    log.error("ASR_SERVICE_TOKEN ausente — serviço não sobe sem token configurado.")
    sys.exit(1)

log.info("Carregando modelo faster-whisper (%s)...", MODELO)
_modelo = WhisperModel(MODELO, device="cpu", compute_type="int8")
log.info("Modelo carregado.")


class Handler(BaseHTTPRequestHandler):
    server_version = "iris-asr/1.0"
    timeout = TIMEOUT_CONEXAO_S

    def log_message(self, format, *args):  # noqa: A002 - assinatura da stdlib
        log.info("%s - %s", self.address_string(), format % args)

    def _autorizado(self) -> bool:
        # Encode antes: compare_digest com `str` exige ASCII puro e levanta
        # TypeError num header com byte alto — em bytes qualquer entrada compara.
        recebido = self.headers.get("Authorization", "").encode("utf-8", "surrogateescape")
        return hmac.compare_digest(recebido, f"Bearer {TOKEN}".encode("utf-8"))

    def do_GET(self):
        if self.path == "/saude":
            self._responder(200, {"status": "ok", "modelo": MODELO})
            return
        self._responder(404, {"erro": "rota inexistente"})

    def do_POST(self):
        if self.path != "/transcrever":
            self._responder(404, {"erro": "rota inexistente"})
            return
        if not self._autorizado():
            self._responder(401, {"erro": "token ausente ou inválido"})
            return

        bruto = self.headers.get("Content-Length")
        try:
            tamanho = int(bruto) if bruto is not None else 0
        except ValueError:
            # Header malformado sem este guard sobe exceção crua e a conexão
            # fecha sem resposta — o chamador vê "connection reset", não 400.
            self._responder(400, {"erro": "Content-Length inválido"})
            return

        if tamanho <= 0:
            # Sem Content-Length não há corpo a ler: o provider (T05) manda
            # Uint8Array, que o fetch mede. Corpo em chunked cai aqui de
            # propósito, em vez de transcrever um arquivo vazio.
            self._responder(400, {"erro": "corpo vazio"})
            return
        if tamanho > MAX_BYTES:
            self._responder(413, {"erro": f"corpo acima do teto de {MAX_BYTES} bytes"})
            return

        if not _vagas.acquire(blocking=False):
            # 503 imediato em vez de fila: o chamador é o worker, que já sabe
            # devolver o clipe para `na_fila` sem gastar tentativa.
            self._responder(503, {"erro": "serviço saturado, tente no próximo tick"})
            return

        try:
            try:
                corpo = self.rfile.read(tamanho)
            except (TimeoutError, socket.timeout):
                self._responder(408, {"erro": "corpo não chegou dentro do timeout"})
                return

            if len(corpo) != tamanho:
                # Upload interrompido devolve MENOS bytes. Sem esta checagem o
                # áudio truncado transcreve normalmente e um trecho parcial
                # volta como se fosse a nota inteira — erro clínico silencioso.
                self._responder(400, {"erro": "corpo truncado antes do Content-Length"})
                return

            # Arquivo temporário: faster-whisper/ffmpeg exigem um caminho no
            # disco, não aceitam bytes em memória diretamente.
            with tempfile.NamedTemporaryFile(suffix=".webm") as tmp:
                tmp.write(corpo)
                tmp.flush()
                try:
                    segmentos, _info = _modelo.transcribe(tmp.name, language=IDIOMA)
                    texto = " ".join(s.text.strip() for s in segmentos).strip()
                except Exception:  # noqa: BLE001 - causa fica no log, não na resposta
                    # Traceback completo no log do container; a resposta não
                    # carrega str(exc) para não vazar caminho interno nem
                    # afirmar causa que não foi medida.
                    log.exception("Falha ao transcrever")
                    self._responder(500, {"erro": "falha ao transcrever"})
                    return
        finally:
            _vagas.release()

        self._responder(200, {"texto": texto})

    def _responder(self, status: int, corpo: dict):
        payload = json.dumps(corpo).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    porta = int(os.environ.get("PORT", "8080"))
    servidor = ThreadingHTTPServer(("0.0.0.0", porta), Handler)
    log.info(
        "Serviço ASR de pé na porta %s (modelo=%s, idioma=%s, max_bytes=%s, concorrentes=%s)",
        porta,
        MODELO,
        IDIOMA,
        MAX_BYTES,
        MAX_CONCORRENTES,
    )
    servidor.serve_forever()


if __name__ == "__main__":
    main()
