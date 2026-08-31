"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/primitives/pill";
import {
  apagarAudioLocal,
  escolherCodec,
  purgarLote,
  salvarAudioLocal,
} from "@/lib/audio/local-store";
import {
  enviarLoteAsrAction,
  limparTranscricaoLoteAction,
  obterEstadoLoteAction,
  obterLoteMaisRecenteAction,
} from "./actions";
import {
  POLLING_INTERVALO_MS,
  POLLING_TETO_MS,
  type EstadoClipeAsr,
} from "./logic";

export interface ClipeLocal {
  idLocal: string;
  blob: Blob;
  url: string;
  duracaoSegundos: number;
  status: "gravado" | "enviando" | "enviado";
}

/**
 * Teto de 2 minutos (120 segundos) por clipe conforme R1.
 * O corte automático encerra a gravação de forma graciosa ao atingir o limite.
 */
const TETO_CLIPE_MS = 120_000;

/**
 * Gravador de áudio local multi-clipe do diário (#72, T11/T12).
 *
 * Por que persist-on-record?
 * O áudio é gravado em memória e salvo imediatamente no IndexedDB do
 * dispositivo local (`iris-audio-rascunho`) ao terminar de gravar cada clipe,
 * evitando perda de dados clínicos mesmo que a página seja recarregada antes de
 * enviar o lote.
 *
 * Por que polling com resumos?
 * O envio do lote é totalmente assíncrono (R9). A UI faz polling periódicos
 * para acompanhar o status no worker ASR e retoma automaticamente no reload
 * buscando o lote mais recente da sessão no servidor (R26).
 *
 * Por que o botão "Enviar" desabilita no primeiro clique?
 * R24 exige idempotência e prevenção de chamadas duplicadas. O estado do lote
 * é congelado ao iniciar o envio, bloqueando novos cliques.
 */
export function AudioLocal({
  sessionId,
  aoConfirmar,
  onAplicarTexto,
}: {
  sessionId: string;
  aoConfirmar?: (loteId: string) => void;
  onAplicarTexto?: (texto: string) => void;
}) {
  const [clipes, setClipes] = useState<ClipeLocal[]>([]);
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [loteIdAtivo, setLoteIdAtivo] = useState<string | null>(null);
  const [estadoLote, setEstadoLote] = useState<EstadoClipeAsr[] | null>(null);
  const [pollingAtivo, setPollingAtivo] = useState(false);
  const [tempoPollingExcedido, setTempoPollingExcedido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucessoMensagem, setSucessoMensagem] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const inicioRef = useRef<number>(0);
  const idLocalAtualRef = useRef<string>("");
  const timerAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipesRef = useRef<ClipeLocal[]>([]);

  useEffect(() => {
    clipesRef.current = clipes;
  }, [clipes]);

  // Por que limpar streams e URLs no unmount?
  // Garante liberação dos recursos do microfone e da memória do navegador ao
  // fechar ou mudar de página (R25).
  useEffect(() => {
    return () => {
      if (timerAutoStopRef.current) clearTimeout(timerAutoStopRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clipesRef.current.forEach((c) => URL.revokeObjectURL(c.url));
    };
  }, []);

  // Por que verificar o lote mais recente ao carregar?
  // R26: se o terapeuta fechar a aba durante o polling, o processamento segue
  // no servidor. Ao recarregar a página, a UI re-estabelece o acompanhamento
  // sem reenviar o áudio ou perder o estado do lote.
  useEffect(() => {
    let cancelado = false;
    async function verificarLoteEmVoo() {
      const res = await obterLoteMaisRecenteAction(sessionId);
      if (cancelado || !res.loteId) return;

      const estadoRes = await obterEstadoLoteAction(res.loteId);
      if (cancelado || !estadoRes.clipes || estadoRes.clipes.length === 0)
        return;

      setLoteIdAtivo(res.loteId);
      setEstadoLote(estadoRes.clipes);

      const temPendente = estadoRes.clipes.some(
        (c) => c.asrStatus === "na_fila" || c.asrStatus === "transcrevendo",
      );
      if (temPendente) {
        setPollingAtivo(true);
      }
    }

    void verificarLoteEmVoo();
    return () => {
      cancelado = true;
    };
  }, [sessionId]);

  // Por que o loop de polling tem teto fixo (POLLING_TETO_MS)?
  // R20: evita requisições infinitas ao servidor em abas esquecidas. Ao bater o teto,
  // informa ao terapeuta que o lote segue em processamento sem assumir erro.
  useEffect(() => {
    if (!pollingAtivo || !loteIdAtivo) return;

    let tempoDecorrido = 0;
    const interval = setInterval(() => {
      tempoDecorrido += POLLING_INTERVALO_MS;
      if (tempoDecorrido >= POLLING_TETO_MS) {
        setPollingAtivo(false);
        setTempoPollingExcedido(true);
        clearInterval(interval);
        return;
      }

      void (async () => {
        const res = await obterEstadoLoteAction(loteIdAtivo);
        if (!res.clipes) return;

        setEstadoLote(res.clipes);
        const temPendente = res.clipes.some(
          (c) => c.asrStatus === "na_fila" || c.asrStatus === "transcrevendo",
        );
        if (!temPendente) {
          setPollingAtivo(false);
          clearInterval(interval);
        }
      })();
    }, POLLING_INTERVALO_MS);

    return () => clearInterval(interval);
  }, [pollingAtivo, loteIdAtivo]);

  const pararGravacao = useCallback(() => {
    if (timerAutoStopRef.current) clearTimeout(timerAutoStopRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerAutoStopRef.current = null;
    timerIntervalRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const iniciarGravacao = useCallback(async () => {
    setErro(null);
    setSucessoMensagem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const idLocal =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${sessionId}-${Date.now()}-${clipesRef.current.length + 1}`;
      idLocalAtualRef.current = idLocal;

      const mimeType = escolherCodec();
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (timerAutoStopRef.current) clearTimeout(timerAutoStopRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        const finalMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const duracaoSegundos = Math.max(
          1,
          Math.round((Date.now() - inicioRef.current) / 1000),
        );

        try {
          // Por que salvar no IndexedDB antes de atualizar o estado?
          // Persist-on-record: garante que o áudio sobreviva localmente mesmo
          // que a renderização ou a navegação ocorram imediatamente.
          await salvarAudioLocal(idLocal, blob);
        } catch {
          setErro(
            "Não foi possível salvar o clipe neste dispositivo. Evite recarregar a página antes de enviar.",
          );
        }

        const url = URL.createObjectURL(blob);
        const novoClipe: ClipeLocal = {
          idLocal,
          blob,
          url,
          duracaoSegundos,
          status: "gravado",
        };

        setClipes((prev) => [...prev, novoClipe]);
        setGravando(false);
        setTempoGravacao(0);
      };

      inicioRef.current = Date.now();
      recorder.start();
      setGravando(true);
      setTempoGravacao(0);

      timerIntervalRef.current = setInterval(() => {
        setTempoGravacao(Math.floor((Date.now() - inicioRef.current) / 1000));
      }, 1000);

      // Por que definir o timer de 2 minutos (R1)?
      // Limita o tempo de gravação por clipe e aciona a finalização graciosa
      // sem cortar no silêncio.
      timerAutoStopRef.current = setTimeout(() => {
        pararGravacao();
      }, TETO_CLIPE_MS);
    } catch {
      setErro(
        "Não foi possível acessar o microfone — verifique a permissão do navegador. O texto do diário continua salvo normalmente.",
      );
      setGravando(false);
    }
  }, [sessionId, pararGravacao]);

  const descartarClipe = useCallback(async (idLocal: string) => {
    const clipe = clipesRef.current.find((c) => c.idLocal === idLocal);
    if (clipe) {
      URL.revokeObjectURL(clipe.url);
      try {
        await apagarAudioLocal(idLocal);
      } catch {
        // best-effort em caso de erro no IndexedDB
      }
    }
    setClipes((prev) => prev.filter((c) => c.idLocal !== idLocal));
  }, []);

  const regravarClipe = useCallback(
    async (idLocal: string) => {
      await descartarClipe(idLocal);
      void iniciarGravacao();
    },
    [descartarClipe, iniciarGravacao],
  );

  // Por que desabilitar o envio no primeiro clique (R24)?
  // Previne chamadas duplas a `enviarLoteAsrAction` sob cliques múltiplos rápidos.
  const enviarLote = useCallback(async () => {
    if (clipes.length === 0 || enviandoLote) return;

    setEnviandoLote(true);
    setErro(null);

    const novoLoteId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${sessionId}-${Date.now()}`;

    try {
      const payloadClipes = clipes.map((c, index) => ({
        ordem: index,
        blob: c.blob,
      }));

      const res = await enviarLoteAsrAction({
        sessionId,
        loteId: novoLoteId,
        clipes: payloadClipes,
      });

      if (res.error || !res.loteId) {
        setErro(res.error ?? "Não foi possível enviar o lote para transcrição.");
        setEnviandoLote(false);
        return;
      }

      setClipes((prev) => prev.map((c) => ({ ...c, status: "enviado" })));
      setLoteIdAtivo(res.loteId);
      setEnviandoLote(false);
      setPollingAtivo(true);
      setTempoPollingExcedido(false);
    } catch {
      setErro("Não foi possível enviar os áudios. Tente novamente.");
      setEnviandoLote(false);
    }
  }, [clipes, enviandoLote, sessionId]);

  // Por que permitir a aplicação do rascunho no editor e limpar o banco (R19)?
  // Transfere o texto consolidado para o diário mantendo o terapeuta como autor
  // explícito do salvamento, e apaga a transcrição temporária do servidor.
  const aplicarNoEditor = useCallback(async () => {
    if (!estadoLote || !loteIdAtivo) return;

    const ordensOrdenadas = [...estadoLote].sort((a, b) => a.ordem - b.ordem);
    const paragrafos = ordensOrdenadas.map((c) => {
      if (c.asrStatus === "transcrito" && c.transcricaoTexto) {
        return c.transcricaoTexto.trim();
      }
      return "[Trecho não transcrito]";
    });

    const textoFormatado = paragrafos.join("\n\n");
    if (onAplicarTexto) {
      onAplicarTexto(textoFormatado);
    }

    try {
      await limparTranscricaoLoteAction(loteIdAtivo);
      await purgarLote(loteIdAtivo);
    } catch {
      // best-effort de limpeza
    }

    if (aoConfirmar) {
      aoConfirmar(loteIdAtivo);
    }

    setSucessoMensagem("Rascunho inserido no diário com sucesso.");
  }, [estadoLote, loteIdAtivo, onAplicarTexto, aoConfirmar]);

  const temLoteConcluido =
    estadoLote &&
    estadoLote.length > 0 &&
    !estadoLote.some(
      (c) => c.asrStatus === "na_fila" || c.asrStatus === "transcrevendo",
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Nota de privacidade: o áudio fica salvo neste dispositivo até você enviar.
        Cada clipe tem teto de 2 minutos com corte automático.
      </p>

      {erro ? <Alert severidade="erro">{erro}</Alert> : null}
      {sucessoMensagem ? (
        <Alert severidade="sucesso">{sucessoMensagem}</Alert>
      ) : null}

      {/* Controles de gravação */}
      <div className="flex flex-wrap items-center gap-3">
        {!gravando ? (
          <Button
            type="button"
            variante="neutra"
            onClick={() => void iniciarGravacao()}
            disabled={enviandoLote || pollingAtivo}
          >
            {clipes.length === 0 ? "Gravar áudio" : "Gravar outro clipe"}
          </Button>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-border-brutal bg-surface-card p-3">
            <span role="status" className="font-semibold text-text-primary text-sm">
              Gravando… ({Math.floor(tempoGravacao / 60)}:
              {(tempoGravacao % 60).toString().padStart(2, "0")} / 2:00)
            </span>
            <Button type="button" onClick={pararGravacao}>
              Parar clipe
            </Button>
          </div>
        )}

        {clipes.some((c) => c.status === "gravado") && !gravando ? (
          <Button
            type="button"
            onClick={() => void enviarLote()}
            disabled={enviandoLote || pollingAtivo}
          >
            {enviandoLote ? "Enviando lote…" : "Enviar pra Iris analisar"}
          </Button>
        ) : null}
      </div>

      {/* Lista de clipes gravados */}
      {clipes.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-md border border-border-brutal bg-surface-card p-4">
          <h3 className="font-display font-bold text-text-primary text-sm">
            Clipes gravados ({clipes.length})
          </h3>
          <ul className="flex flex-col gap-3">
            {clipes.map((clipe, index) => (
              <li
                key={clipe.idLocal}
                className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-subtle p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary text-sm">
                    Clipe {index + 1} ({Math.floor(clipe.duracaoSegundos / 60)}:
                    {(clipe.duracaoSegundos % 60).toString().padStart(2, "0")})
                  </span>
                  {clipe.status === "enviado" ? (
                    <Pill colorScheme="azul" size="sm">
                      Enviado
                    </Pill>
                  ) : null}
                </div>
                <audio src={clipe.url} controls className="w-full" />
                {/* R27: desabilita/esconde botões de descartar e regravar se já enviado */}
                {clipe.status === "gravado" ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variante="neutra"
                      onClick={() => void regravarClipe(clipe.idLocal)}
                    >
                      Regravar
                    </Button>
                    <Button
                      type="button"
                      variante="neutra"
                      onClick={() => void descartarClipe(clipe.idLocal)}
                    >
                      Descartar
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Status do polling e progresso ASR */}
      {pollingAtivo ? (
        <div className="flex items-center gap-3 rounded-md border border-border-brutal bg-surface-subtle p-4">
          <Pill colorScheme="violeta" size="md">
            IA em processamento
          </Pill>
          <span className="text-sm text-text-primary font-medium" role="status">
            A Iris está analisando e transcrevendo seus clipes de áudio…
          </span>
        </div>
      ) : null}

      {tempoPollingExcedido ? (
        <Alert severidade="info">
          O processamento do lote está demorando mais que o esperado. Ele segue
          sendo processado em segundo plano. Recarregue a página para verificar.
        </Alert>
      ) : null}

      {/* Resultado da transcrição (T12) */}
      {temLoteConcluido && estadoLote ? (
        <div className="flex flex-col gap-4 rounded-md border border-border-brutal bg-surface-card p-4">
          <div className="flex items-center gap-2">
            <Pill colorScheme="violeta" size="md">
              Transcrito por IA
            </Pill>
            <span className="text-xs text-text-secondary">
              Revise o texto abaixo antes de salvar no diário
            </span>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-subtle p-3">
            {[...estadoLote]
              .sort((a, b) => a.ordem - b.ordem)
              .map((item) => (
                <div key={item.ordem} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">
                    Parágrafo {item.ordem + 1}:
                  </span>
                  {item.asrStatus === "transcrito" && item.transcricaoTexto ? (
                    <p className="text-sm text-text-primary whitespace-pre-wrap">
                      {item.transcricaoTexto}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-medium text-status-error-fg">
                        [Trecho não transcrito]
                      </p>
                      <span className="text-xs text-text-secondary">
                        Não foi possível transcrever este clipe. Você pode
                        digitar este trecho à mão ao inserir no editor.
                      </span>
                    </div>
                  )}
                </div>
              ))}
          </div>

          <Button type="button" onClick={() => void aplicarNoEditor()}>
            Inserir rascunho no diário
          </Button>
        </div>
      ) : null}
    </div>
  );
}
