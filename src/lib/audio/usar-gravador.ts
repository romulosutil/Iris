"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { escolherCodec } from "./local-store";

export type EstadoGravacao = "ocioso" | "gravando";

/** Teto de 2 min por clipe (R1). Exportado para o teste medir o mesmo número. */
export const TETO_CLIPE_MS = 120_000;

export type Gravador = {
  estado: EstadoGravacao;
  /** Milissegundos já gravados no clipe em andamento. Zera ao parar. */
  decorridoMs: number;
  erro: string | null;
  limparErro: () => void;
  iniciar: () => void;
  parar: () => void;
};

/**
 * Máquina de gravação compartilhada entre o registro de áudio de 1 clipe
 * (`AudioLocal`, D1) e o ditado multi-clipe (`DitadoVoz`, T11). Existe porque
 * as duas telas precisam do MESMO comportamento de microfone: um segundo
 * `MediaRecorder` escrito à mão divergiria em permissão negada, em codec de
 * Safari (R7) e no encerramento das trilhas — e é justamente aí que a falha é
 * silenciosa (o usuário vê "gravando" com o microfone já liberado).
 *
 * O teto (R1) mora aqui e não no componente: encerrar a gravação é ato do
 * gravador, e deixar o timer na UI faria o clipe passar de 2 min sempre que a
 * aba fosse re-renderizada fora de hora.
 *
 * R25 — nada de estado intermediário persistido: uma gravação em andamento
 * morre com a aba, de propósito. O blob só existe depois do `onstop`.
 */
export function usarGravador({
  tetoMs = TETO_CLIPE_MS,
  aoFinalizar,
}: {
  tetoMs?: number;
  aoFinalizar: (blob: Blob, duracaoSegundos: number) => void | Promise<void>;
}): Gravador {
  const [estado, setEstado] = useState<EstadoGravacao>("ocioso");
  const [decorridoMs, setDecorridoMs] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const tetoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // `aoFinalizar` num ref: o callback do `onstop` é registrado uma única vez,
  // no início da gravação, e não pode congelar a versão antiga da closure
  // quando o componente re-renderiza no meio dos 2 minutos.
  const aoFinalizarRef = useRef(aoFinalizar);
  useEffect(() => {
    aoFinalizarRef.current = aoFinalizar;
  }, [aoFinalizar]);

  const limparCronometros = useCallback(() => {
    if (tetoRef.current) clearTimeout(tetoRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    tetoRef.current = null;
    tickRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      limparCronometros();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [limparCronometros]);

  const parar = useCallback(() => {
    limparCronometros();
    try {
      recorderRef.current?.stop();
    } catch {
      // recorder já encerrado (teto e clique manual podem correr juntos)
    }
  }, [limparCronometros]);

  const iniciar = useCallback(() => {
    setErro(null);
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;
        chunksRef.current = [];

        const mimeType = escolherCodec();
        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, { mimeType });
        } catch {
          // R7: navegador que rejeita o mimeType escolhido ainda grava no
          // default dele — melhor um clipe com codec inesperado que nenhum.
          recorder = new MediaRecorder(stream);
        }
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          limparCronometros();
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || mimeType,
          });
          const duracaoSegundos = Math.max(
            1,
            Math.round((Date.now() - inicioRef.current) / 1000),
          );
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          recorderRef.current = null;
          setDecorridoMs(0);
          setEstado("ocioso");
          void aoFinalizarRef.current(blob, duracaoSegundos);
        };

        inicioRef.current = Date.now();
        recorder.start();
        setDecorridoMs(0);
        setEstado("gravando");

        // R1 — o clipe encerra sozinho aos 2 min. O `parar` do teto é o mesmo
        // caminho do botão: quem finaliza o blob é sempre o `onstop`.
        tetoRef.current = setTimeout(() => {
          try {
            recorderRef.current?.stop();
          } catch {
            // idem `parar`
          }
        }, tetoMs);
        tickRef.current = setInterval(() => {
          setDecorridoMs(Date.now() - inicioRef.current);
        }, 250);
      } catch {
        setErro(
          "Não foi possível acessar o microfone — verifique a permissão do navegador. O texto do diário continua salvo normalmente.",
        );
      }
    })();
  }, [limparCronometros, tetoMs]);

  const limparErro = useCallback(() => setErro(null), []);

  return { estado, decorridoMs, erro, limparErro, iniciar, parar };
}

/** `125300` → `"2:05"`. Rótulo humano do cronômetro e da duração do clipe. */
export function formatarDuracao(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}
