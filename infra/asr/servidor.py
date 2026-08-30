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

import json
import logging
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("iris-asr")

# Tamanho do modelo definido por env, não hardcoded: T06 mede small vs medium
# na VPS real e o runbook.md registra qual ficou escolhido — este código não
# decide, só honra a escolha.
MODELO = os.environ.get("ASR_MODEL_SIZE", "small")
IDIOMA = os.environ.get("ASR_LANGUAGE", "pt")

# Bearer comparado com timingSafeEqual do lado do app (T07); aqui a
# verificação é simples porque o serviço só é alcançável dentro da rede
# interna do Swarm — não exposto à internet.
TOKEN = os.environ.get("ASR_SERVICE_TOKEN")

log.info("Carregando modelo faster-whisper (%s)...", MODELO)
_modelo = WhisperModel(MODELO, device="cpu", compute_type="int8")
log.info("Modelo carregado.")


class Handler(BaseHTTPRequestHandler):
    server_version = "iris-asr/1.0"

    def log_message(self, format, *args):  # noqa: A002 - assinatura da stdlib
        log.info("%s - %s", self.address_string(), format % args)

    def _autorizado(self) -> bool:
        if not TOKEN:
            return False
        recebido = self.headers.get("Authorization", "")
        return recebido == f"Bearer {TOKEN}"

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

        tamanho = int(self.headers.get("Content-Length", 0))
        if tamanho <= 0:
            self._responder(400, {"erro": "corpo vazio"})
            return

        corpo = self.rfile.read(tamanho)

        # Arquivo temporário: faster-whisper/ffmpeg exigem um caminho no
        # disco, não aceitam bytes em memória diretamente.
        with tempfile.NamedTemporaryFile(suffix=".webm") as tmp:
            tmp.write(corpo)
            tmp.flush()
            try:
                segmentos, _info = _modelo.transcribe(tmp.name, language=IDIOMA)
                texto = " ".join(s.text.strip() for s in segmentos).strip()
            except Exception as exc:  # noqa: BLE001 - reporta a mensagem crua, não afirma causa
                log.exception("Falha ao transcrever")
                self._responder(500, {"erro": str(exc)})
                return

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
    log.info("Serviço ASR de pé na porta %s (modelo=%s, idioma=%s)", porta, MODELO, IDIOMA)
    servidor.serve_forever()


if __name__ == "__main__":
    main()
