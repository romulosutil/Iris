"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apagarAudioLocal, salvarAudioLocal } from "@/lib/audio/local-store";
import {
  formatarDuracao,
  TETO_CLIPE_MS,
  usarGravador,
} from "@/lib/audio/usar-gravador";
import { registrarAudioLocalAction } from "./actions";
import { DitadoVoz } from "./ditado-voz";

type Estado = "vazio" | "gravado" | "enviando";

/**
 * Gravador de áudio local do diário. O blob é persistido no IndexedDB do
 * dispositivo (`iris-audio-rascunho`) assim que a gravação termina —
 * persist-on-record — então mesmo um reload antes de "Confirmar" não perde
 * o áudio. "Descartar" apaga o rascunho local de verdade e "Regravar" apaga
 * o anterior antes de iniciar uma nova gravação. Ninguém além do terapeuta
 * ouve o áudio antes da consolidação.
 *
 * Com o ditado de voz ligado (`asrHabilitado`, #72/R21), a aba entrega a UI
 * multi-clipe (`DitadoVoz`) no lugar deste registro de 1 clipe: são fluxos
 * diferentes — aqui o áudio VIRA a captura, lá ele vira texto para revisão.
 * O booleano chega pronto do server component; nunca se lê `process.env` no
 * cliente, onde a flag não existe e cairia para "desligado" em silêncio.
 */
export function AudioLocal({
  sessionId,
  aoConfirmar,
  asrHabilitado = false,
  aoAceitarTranscricao,
}: {
  sessionId: string;
  aoConfirmar: (audioCaptureId: string) => void;
  asrHabilitado?: boolean;
  aoAceitarTranscricao?: (paragrafos: string[]) => void;
}) {
  const [estado, setEstado] = useState<Estado>("vazio");
  const [erro, setErro] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const blobRef = useRef<Blob | null>(null);
  const duracaoRef = useRef<number>(1);
  const idLocalRef = useRef<string>("");
  const contadorIdRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const gerarIdLocal = useCallback((): string => {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    contadorIdRef.current += 1;
    return `${sessionId}-${Date.now()}-${contadorIdRef.current}`;
  }, [sessionId]);

  const aoFinalizar = useCallback(
    async (blob: Blob, duracaoSegundos: number) => {
      blobRef.current = blob;
      duracaoRef.current = duracaoSegundos;
      idLocalRef.current = gerarIdLocal();
      setAudioUrl(URL.createObjectURL(blob));
      setEstado("gravado");
      try {
        // persist-on-record: o áudio sobrevive a um reload antes de confirmar
        await salvarAudioLocal(idLocalRef.current, blob);
      } catch {
        setErro(
          "Não foi possível salvar o áudio neste dispositivo. Evite recarregar a página antes de confirmar.",
        );
      }
    },
    [gerarIdLocal],
  );

  const gravador = usarGravador({ aoFinalizar });

  const descartar = useCallback(async () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (idLocalRef.current) {
      try {
        await apagarAudioLocal(idLocalRef.current);
      } catch {
        // best-effort — o rascunho pode já não existir mais
      }
      idLocalRef.current = "";
    }
    blobRef.current = null;
    setAudioUrl(null);
    setEstado("vazio");
    setErro(null);
  }, [audioUrl]);

  const regravar = useCallback(async () => {
    await descartar();
    gravador.iniciar();
  }, [descartar, gravador]);

  const confirmar = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setEstado("enviando");
    setErro(null);
    try {
      const formData = new FormData();
      formData.set("sessionId", sessionId);
      formData.set("duracaoSegundos", String(duracaoRef.current));
      const resultado = await registrarAudioLocalAction({}, formData);
      if (resultado.error || !resultado.id) {
        setErro(resultado.error ?? "Não foi possível registrar o áudio.");
        setEstado("gravado");
        return;
      }
      // re-salva o blob sob o id definitivo do audio_capture e apaga o
      // rascunho local — a partir daqui a chave no IndexedDB é a mesma do
      // registro no banco, sem mapeamento adicional a manter.
      await salvarAudioLocal(resultado.id, blob);
      const idLocalAnterior = idLocalRef.current;
      if (idLocalAnterior && idLocalAnterior !== resultado.id) {
        try {
          await apagarAudioLocal(idLocalAnterior);
        } catch {
          // best-effort — não bloqueia a confirmação
        }
      }
      idLocalRef.current = "";
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      blobRef.current = null;
      setEstado("vazio");
      aoConfirmar(resultado.id);
    } catch {
      setErro("Não foi possível salvar o áudio. Tente novamente.");
      setEstado("gravado");
    }
  }, [audioUrl, sessionId, aoConfirmar]);

  if (asrHabilitado) {
    return (
      <DitadoVoz
        sessionId={sessionId}
        aoAceitar={aoAceitarTranscricao ?? (() => {})}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted text-sm">
        Nota de privacidade: o áudio fica só neste dispositivo — ninguém, nem a
        equipe, ouve até você confirmar e a sessão ser consolidada.
      </p>

      {erro ? <Alert severidade="erro">{erro}</Alert> : null}
      {gravador.erro ? <Alert severidade="erro">{gravador.erro}</Alert> : null}

      {estado === "vazio" && gravador.estado === "ocioso" ? (
        <Button type="button" variante="neutra" onClick={gravador.iniciar}>
          Gravar áudio
        </Button>
      ) : null}

      {gravador.estado === "gravando" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span role="status" className="text-sm font-semibold">
              Gravando… {formatarDuracao(gravador.decorridoMs)}
            </span>
            <Button type="button" onClick={gravador.parar}>
              Parar
            </Button>
          </div>
          <Progress
            value={(gravador.decorridoMs / TETO_CLIPE_MS) * 100}
            aria-label="Tempo da gravação em relação ao teto de 2 minutos"
          />
        </div>
      ) : null}

      {(estado === "gravado" || estado === "enviando") && audioUrl ? (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audioUrl} controls className="w-full" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variante="neutra"
              onClick={confirmar}
              disabled={estado === "enviando"}
            >
              {estado === "enviando" ? "Salvando…" : "Confirmar"}
            </Button>
            <Button
              type="button"
              variante="neutra"
              onClick={() => void regravar()}
              disabled={estado === "enviando"}
            >
              Regravar
            </Button>
            <Button
              type="button"
              variante="neutra"
              onClick={() => void descartar()}
              disabled={estado === "enviando"}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
