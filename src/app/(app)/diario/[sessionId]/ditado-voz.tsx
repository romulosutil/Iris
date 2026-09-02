"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import {
  apagarAudioLocal,
  chaveClipe,
  lerAudioLocal,
  purgarLote,
  salvarAudioLocal,
} from "@/lib/audio/local-store";
import {
  formatarDuracao,
  TETO_CLIPE_MS,
  useGravador,
} from "@/lib/audio/use-gravador";
import { POLLING_INTERVALO_MS, POLLING_TETO_MS } from "@/lib/asr/polling";
import {
  aceitarTranscricaoLoteAction,
  enviarLoteAsrAction,
  obterEstadoLoteAction,
  obterLoteMaisRecenteAction,
} from "./actions";

type Clipe = {
  ordem: number;
  duracaoSegundos: number;
  url: string | null;
};

/**
 * Fase do LOTE, não do clipe (R24): "enviando" cobre o lote inteiro, então um
 * segundo clique em "Enviar" não tem botão para acertar.
 */
type Fase =
  | "montando"
  | "enviando"
  | "acompanhando"
  | "concluido"
  | "expirado"
  | "aceito";

type EstadoClipe = {
  ordem: number;
  asrStatus:
    "nao_solicitado" | "na_fila" | "transcrevendo" | "transcrito" | "falhou";
  transcricaoTexto: string | null;
};

function novoLoteId(sessionId: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${sessionId}-${Date.now()}`;
}

const terminal = (s: EstadoClipe["asrStatus"]) =>
  s === "transcrito" || s === "falhou";

/**
 * Ditado de voz multi-clipe (#72, T11/T12). Grava clipes de até 2 min (R1),
 * sem teto de quantidade (R2), monta a lista revisável (R4) e só envia o lote
 * no clique explícito (R5) — nada sobe ao terminar de gravar.
 *
 * A ordem da lista É a ordem enviada e a ordem dos parágrafos que voltam (R6):
 * `ordem` nasce da posição no array e nunca é recalculada depois do envio.
 *
 * O texto transcrito NUNCA vai direto para a nota (R18): ele fica num rascunho
 * revisável, marcado como saída de IA (R17), e só entra no diário quando o
 * terapeuta clica em "Usar no diário" — que é também o momento em que a
 * transcrição é apagada do servidor (R19, decisão C de 31/08/2026).
 */
export function DitadoVoz({
  sessionId,
  aoAceitar,
}: {
  sessionId: string;
  /** Entrega os parágrafos aceitos ao rascunho do diário. Nunca salva sozinho. */
  aoAceitar: (paragrafos: string[]) => void;
}) {
  const [loteId, setLoteId] = useState<string>(() => novoLoteId(sessionId));
  const [clipes, setClipes] = useState<Clipe[]>([]);
  const [fase, setFase] = useState<Fase>("montando");
  const [erro, setErro] = useState<string | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [estados, setEstados] = useState<EstadoClipe[]>([]);
  // Lote que entrou pela metade: reenviar com o MESMO `loteId` retoma só os
  // clipes que ficaram para trás (idempotência de R24 no servidor).
  const [retomavel, setRetomavel] = useState(false);

  const blobsRef = useRef<Map<number, Blob>>(new Map());
  const proximaOrdemRef = useRef(0);
  const urlsRef = useRef<string[]>([]);
  const inicioPollingRef = useRef(0);

  const registrarUrl = useCallback((url: string) => {
    urlsRef.current.push(url);
    return url;
  }, []);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const aoFinalizarClipe = useCallback(
    async (blob: Blob, duracaoSegundos: number) => {
      // A `ordem` sai de um ref, não do updater de `setClipes`: o updater roda
      // durante o render seguinte, então ler `atuais.length` ali e usar o valor
      // aqui fora entregaria sempre 0 — e o blob iria para a chave errada, com
      // a lista na tela certinha. R6 morre em silêncio assim.
      const ordem = ++proximaOrdemRef.current;
      blobsRef.current.set(ordem, blob);
      setClipes((atuais) => [
        ...atuais,
        {
          ordem,
          duracaoSegundos,
          url: registrarUrl(URL.createObjectURL(blob)),
        },
      ]);
      try {
        // persist-on-record: o clipe sobrevive a um reload antes do envio, e é
        // dele que sai o reenvio de um clipe que falhou na transcrição (R13).
        await salvarAudioLocal(chaveClipe(loteId, ordem), blob);
      } catch {
        setErro(
          "Não foi possível guardar o clipe neste dispositivo. Evite recarregar a página antes de enviar.",
        );
      }
    },
    [loteId, registrarUrl],
  );

  const gravador = useGravador({ aoFinalizar: aoFinalizarClipe });

  // R26 — ao reabrir o diário, retoma o lote mais recente da sessão em vez de
  // começar do zero. Sem isso, um envio feito antes de fechar a aba fica
  // invisível e o terapeuta regrava o que já está transcrito.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await obterLoteMaisRecenteAction(sessionId);
      if (!vivo || !r.loteId) return;
      const estado = await obterEstadoLoteAction(r.loteId);
      if (!vivo || estado.error) return;
      const lidos = (estado.clipes ?? []) as EstadoClipe[];
      // Só retoma o que ainda tem o que mostrar: lote com clipe em andamento,
      // ou já transcrito e ainda não aceito. Um lote cujo texto o terapeuta já
      // levou para o diário tem `transcricao_texto` zerado (R19) — retomá-lo
      // renderizaria um rascunho vazio por cima de uma gravação nova.
      const pendente = lidos.some((c) => !terminal(c.asrStatus));
      const revisavel = lidos.some((c) => c.transcricaoTexto !== null);
      if (!pendente && !revisavel) return;
      setLoteId(r.loteId);
      setEstados(lidos);
      setFase(pendente ? "acompanhando" : "concluido");
    })();
    return () => {
      vivo = false;
    };
  }, [sessionId]);

  // Polling do estado do lote (R20). Para de pedir quando todo clipe chega a um
  // estado terminal, ou no teto de 10 min — e o teto NÃO afirma falha: o lote
  // pode seguir processando, então a UI diz exatamente isso.
  useEffect(() => {
    if (fase !== "acompanhando") return;
    if (!inicioPollingRef.current) inicioPollingRef.current = Date.now();

    let vivo = true;
    const ler = async () => {
      const r = await obterEstadoLoteAction(loteId);
      if (!vivo) return;
      if (r.error) {
        // Falha de LEITURA não é falha da transcrição: mantém o último estado
        // conhecido na tela em vez de trocá-lo por uma lista vazia, que o
        // terapeuta leria como "nada foi transcrito".
        setErroLeitura(r.error);
        return;
      }
      setErroLeitura(null);
      const lidos = (r.clipes ?? []) as EstadoClipe[];
      setEstados(lidos);
      if (lidos.length > 0 && lidos.every((c) => terminal(c.asrStatus))) {
        setFase("concluido");
        return;
      }
      if (Date.now() - inicioPollingRef.current >= POLLING_TETO_MS) {
        setFase("expirado");
      }
    };

    void ler();
    const id = setInterval(() => void ler(), POLLING_INTERVALO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [fase, loteId]);

  const descartar = useCallback(
    async (ordem: number) => {
      const alvo = clipes.find((c) => c.ordem === ordem);
      if (alvo?.url) URL.revokeObjectURL(alvo.url);
      blobsRef.current.delete(ordem);
      try {
        await apagarAudioLocal(chaveClipe(loteId, ordem));
      } catch {
        // best-effort — o rascunho local pode já não existir
      }
      // Renumera para manter `ordem` contígua e igual à posição na lista (R6).
      // A renumeração dos blobs fica FORA do updater de propósito: o React
      // invoca o updater mais de uma vez (StrictMode), e uma segunda passada
      // sobre o mapa já renumerado não acharia mais as chaves antigas —
      // esvaziaria os blobs com a lista intacta na tela.
      const restantes = clipes.filter((c) => c.ordem !== ordem);
      const antigos = blobsRef.current;
      const renumerados = new Map<number, Blob>();
      restantes.forEach((c, i) => {
        const b = antigos.get(c.ordem);
        if (b) renumerados.set(i + 1, b);
      });
      blobsRef.current = renumerados;
      proximaOrdemRef.current = restantes.length;
      setClipes(restantes.map((c, i) => ({ ...c, ordem: i + 1 })));
    },
    [clipes, loteId],
  );

  const regravar = useCallback(
    async (ordem: number) => {
      await descartar(ordem);
      gravador.iniciar();
    },
    [descartar, gravador],
  );

  const enviar = useCallback(async () => {
    if (clipes.length === 0) return;
    setFase("enviando");
    setErro(null);
    const payload = clipes
      .map((c) => ({ ordem: c.ordem, blob: blobsRef.current.get(c.ordem) }))
      .filter((c): c is { ordem: number; blob: Blob } => Boolean(c.blob));

    const r = await enviarLoteAsrAction({ sessionId, loteId, clipes: payload });
    if (r.error || !r.loteId) {
      setErro(r.error ?? "Não foi possível enviar o áudio para transcrição.");
      // R24: só uma FALHA reabre o botão. Sucesso nunca volta para "montando".
      setFase("montando");
      return;
    }
    if (r.clipesComFalha && r.clipesComFalha > 0) {
      // O lote entrou pela metade. Dizer o número é o que impede a UI de ficar
      // fazendo polling de um clipe que nunca chegou a ser enfileirado — e o
      // terapeuta precisa saber QUE trecho vai faltar antes de revisar.
      setErro(
        `${r.clipesComFalha} clipe(s) não subiram e não serão transcritos enquanto isso.`,
      );
      setRetomavel(true);
    } else {
      setRetomavel(false);
    }
    // Adota o `loteId` que o SERVIDOR devolveu: é ele que o polling precisa
    // consultar. Seguir usando o id gerado no cliente faria a UI perguntar por
    // um lote que pode não ser o mesmo, e o resultado voltaria vazio.
    setLoteId(r.loteId);
    inicioPollingRef.current = 0;
    setFase("acompanhando");
  }, [clipes, loteId, sessionId]);

  const reenviarFalhos = useCallback(async () => {
    const falhos = estados.filter((e) => e.asrStatus === "falhou");
    if (falhos.length === 0) return;
    const novoId = novoLoteId(sessionId);
    const payload: Array<{ ordem: number; blob: Blob }> = [];
    for (const [i, f] of falhos.entries()) {
      const blob =
        blobsRef.current.get(f.ordem) ??
        (await lerAudioLocal(chaveClipe(loteId, f.ordem)));
      if (blob) payload.push({ ordem: i + 1, blob });
    }
    if (payload.length === 0) {
      setErro(
        "O áudio destes clipes não está mais neste dispositivo. Digite o trecho à mão no diário.",
      );
      return;
    }
    setFase("enviando");
    setErro(null);
    const r = await enviarLoteAsrAction({
      sessionId,
      loteId: novoId,
      clipes: payload,
    });
    if (r.error || !r.loteId) {
      setErro(r.error ?? "Não foi possível reenviar os clipes.");
      setFase("concluido");
      return;
    }
    setLoteId(novoId);
    setEstados([]);
    inicioPollingRef.current = 0;
    setFase("acompanhando");
  }, [estados, loteId, sessionId]);

  const aceitar = useCallback(async () => {
    const r = await aceitarTranscricaoLoteAction(loteId);
    if (r.error || !r.paragrafos) {
      setErro(r.error ?? "Não foi possível usar a transcrição no diário.");
      return;
    }
    aoAceitar(r.paragrafos);
    setFase("aceito");
    // O áudio já cumpriu seu papel: some do dispositivo junto com o texto que
    // some do servidor (R11 + R19).
    await purgarLote(loteId);
  }, [aoAceitar, loteId]);

  const lote = fase !== "montando" && fase !== "enviando";
  const transcritos = estados.filter((e) => e.asrStatus === "transcrito");
  const falhos = estados.filter((e) => e.asrStatus === "falhou");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-muted text-sm">
        O áudio fica só neste dispositivo até você tocar em enviar. A Iris
        transcreve, você revisa, e nada entra no diário sem o seu clique.
      </p>

      {erro ? <Alert severidade="erro">{erro}</Alert> : null}
      {gravador.erro ? <Alert severidade="erro">{gravador.erro}</Alert> : null}

      {gravador.estado === "gravando" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span role="status" className="text-sm font-semibold">
              Gravando clipe {clipes.length + 1} — {""}
              {formatarDuracao(gravador.decorridoMs)}
            </span>
            <span className="text-ink-muted font-mono text-xs">
              encerra em {formatarDuracao(TETO_CLIPE_MS - gravador.decorridoMs)}
            </span>
          </div>
          <Progress
            value={(gravador.decorridoMs / TETO_CLIPE_MS) * 100}
            aria-label="Tempo do clipe em relação ao teto de 2 minutos"
          />
          <div>
            <Button type="button" onClick={gravador.parar}>
              Parar clipe
            </Button>
          </div>
        </div>
      ) : null}

      {gravador.estado === "ocioso" && !lote ? (
        <div>
          <Button
            type="button"
            variante="neutra"
            onClick={gravador.iniciar}
            disabled={fase === "enviando"}
          >
            {clipes.length === 0 ? "Gravar clipe" : "Gravar mais um clipe"}
          </Button>
        </div>
      ) : null}

      {clipes.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label="Clipes deste ditado">
          {clipes.map((c) => (
            <li
              key={c.ordem}
              className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--border-brutal)] pb-2 last:border-b-0"
            >
              <span className="font-mono text-sm font-semibold tabular-nums">
                {c.ordem}.
              </span>
              <span className="text-ink-muted font-mono text-sm">
                {formatarDuracao(c.duracaoSegundos * 1000)}
              </span>
              {c.url ? (
                <audio src={c.url} controls className="min-w-0 flex-1" />
              ) : null}
              {/* R27 — clipe já enviado não oferece descartar/regravar: essas
                  ações só existem enquanto o lote está sendo montado. */}
              {!lote && fase !== "enviando" ? (
                <span className="flex gap-2">
                  <Button
                    type="button"
                    variante="terciaria"
                    tamanho="sm"
                    onClick={() => void regravar(c.ordem)}
                  >
                    Regravar
                  </Button>
                  <Button
                    type="button"
                    variante="terciaria"
                    tamanho="sm"
                    onClick={() => void descartar(c.ordem)}
                  >
                    Descartar
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {!lote && clipes.length > 0 ? (
        <div>
          <Button
            type="button"
            onClick={() => void enviar()}
            disabled={fase === "enviando"}
            isLoading={fase === "enviando"}
          >
            {fase === "enviando" ? "Enviando…" : "Enviar pra Iris analisar"}
          </Button>
        </div>
      ) : null}

      {fase === "acompanhando" ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm font-semibold">
            A Iris está transcrevendo {estados.length || clipes.length}{" "}
            clipe(s). Você pode continuar escrevendo no diário enquanto isso.
          </p>
          <Progress value={null} aria-label="Transcrição em andamento" />
          {erroLeitura ? (
            <Alert severidade="erro">
              {erroLeitura} O envio não foi perdido — a leitura do estado é que
              falhou.
            </Alert>
          ) : null}
          {retomavel ? (
            <div>
              <Button
                type="button"
                variante="neutra"
                onClick={() => void enviar()}
              >
                Tentar subir os clipes que faltaram
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {fase === "expirado" ? (
        <Alert severidade="info" titulo="A transcrição está demorando">
          <p>
            Passaram-se 10 minutos e parei de consultar. O lote pode seguir
            processando no servidor — isto não é uma falha, é o tempo acabando
            de esperar.
          </p>
          <p className="mt-2">
            <Button
              type="button"
              variante="neutra"
              tamanho="sm"
              onClick={() => {
                // Reabre a janela de polling em vez de mandar o terapeuta
                // recarregar a página: um F5 no meio do diário custa o que ele
                // digitou e ainda não salvou.
                inicioPollingRef.current = 0;
                setFase("acompanhando");
              }}
            >
              Verificar de novo
            </Button>
          </p>
        </Alert>
      ) : null}

      {(fase === "concluido" || fase === "expirado") && estados.length > 0 ? (
        <section
          aria-labelledby="rascunho-ia-titulo"
          className="flex flex-col gap-3 border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="rascunho-ia-titulo"
              className="font-display text-base font-bold"
            >
              Rascunho da transcrição
            </h3>
            {/* R17 — o marcador de IA é visível, não só leitura de tela. */}
            <StatusBadge estado="sugerida">Transcrito pela IA</StatusBadge>
          </div>

          <ol className="flex flex-col gap-3">
            {estados.map((e) => (
              <li key={e.ordem} className="flex flex-col gap-1">
                {e.asrStatus === "transcrito" ? (
                  <p className="text-sm text-[var(--text-primary)]">
                    {e.transcricaoTexto}
                  </p>
                ) : (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge variante="warning">Não transcrito</StatusBadge>
                    <span className="text-ink-muted">
                      Clipe {e.ordem} — reenvie o áudio ou digite o trecho à mão
                      na aba Texto.
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void aceitar()}
              disabled={transcritos.length === 0}
            >
              Usar no diário
            </Button>
            {falhos.length > 0 ? (
              <Button
                type="button"
                variante="neutra"
                onClick={() => void reenviarFalhos()}
              >
                Reenviar {falhos.length} clipe(s) que falharam
              </Button>
            ) : null}
          </div>
          <p className="text-ink-muted text-sm">
            &quot;Usar no diário&quot; leva o texto para o rascunho da anotação
            — revisar e salvar continua sendo seu.
          </p>
        </section>
      ) : null}

      {fase === "aceito" ? (
        <Alert severidade="sucesso" titulo="Texto no rascunho do diário">
          <p>
            Revise na aba Texto e toque em &quot;Salvar captura&quot;. A
            transcrição foi apagada do servidor.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
