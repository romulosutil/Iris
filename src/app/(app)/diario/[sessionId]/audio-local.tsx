"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apagarAudioLocal, salvarAudioLocal } from "@/lib/audio/local-store";
import { registrarAudioLocalAction } from "./actions";

type Estado = "vazio" | "gravando" | "gravado" | "enviando";

/**
 * Gravador de áudio local do diário. O blob é persistido no IndexedDB do
 * dispositivo (`iris-audio-rascunho`) assim que a gravação termina —
 * persist-on-record — então mesmo um reload antes de "Confirmar" não perde
 * o áudio. "Descartar" apaga o rascunho local de verdade e "Regravar" apaga
 * o anterior antes de iniciar uma nova gravação. Ninguém além do terapeuta
 * ouve o áudio antes da consolidação.
 */
export function AudioLocal({
  sessionId,
  aoConfirmar,
}: {
  sessionId: string;
  aoConfirmar: (audioCaptureId: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>("vazio");
  const [erro, setErro] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const inicioRef = useRef<number>(0);
  const idLocalRef = useRef<string>("");
  const contadorIdRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const gerarIdLocal = useCallback((): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    contadorIdRef.current += 1;
    return `${sessionId}-${Date.now()}-${contadorIdRef.current}`;
  }, [sessionId]);

  const iniciarGravacao = useCallback(async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      idLocalRef.current = gerarIdLocal();
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        setEstado("gravado");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        try {
          // persist-on-record: o áudio sobrevive a um reload antes de confirmar
          await salvarAudioLocal(idLocalRef.current, blob);
        } catch {
          setErro(
            "Não foi possível salvar o áudio neste dispositivo. Evite recarregar a página antes de confirmar.",
          );
        }
      };
      inicioRef.current = Date.now();
      recorder.start();
      setEstado("gravando");
    } catch {
      setErro(
        "Não foi possível acessar o microfone — verifique a permissão do navegador. O texto do diário continua salvo normalmente.",
      );
    }
  }, [gerarIdLocal]);

  const pararGravacao = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

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
    void iniciarGravacao();
  }, [descartar, iniciarGravacao]);

  const confirmar = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setEstado("enviando");
    setErro(null);
    try {
      const duracaoSegundos = Math.max(1, Math.round((Date.now() - inicioRef.current) / 1000));
      const formData = new FormData();
      formData.set("sessionId", sessionId);
      formData.set("duracaoSegundos", String(duracaoSegundos));
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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted text-sm">
        Nota de privacidade: o áudio fica só neste dispositivo — ninguém, nem a
        equipe, ouve até você confirmar e a sessão ser consolidada.
      </p>

      {erro ? <Alert severidade="erro">{erro}</Alert> : null}

      {estado === "vazio" ? (
        <Button type="button" variante="neutra" onClick={() => void iniciarGravacao()}>
          Gravar áudio
        </Button>
      ) : null}

      {estado === "gravando" ? (
        <div className="flex items-center gap-3">
          <span role="status" className="text-sm font-semibold">
            Gravando…
          </span>
          <Button type="button" onClick={pararGravacao}>
            Parar
          </Button>
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
              risco="alto"
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
