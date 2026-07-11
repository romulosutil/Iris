"use client";
import { useActionState, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Stack } from "@/components/ui/layout";
import {
  capturarDiarioAction,
  corrigirEscopoProtocoloAction,
  type CapturarDiarioState,
  type CorrigirEscopoState,
} from "./actions";
import { AudioLocal } from "./audio-local";

type Protocolo = { id: string; nome: string };

/**
 * Captura rápida do diário: alterna Texto/Áudio (`Tabs`) e mostra o escopo de
 * protocolos como chips "toca pra trocar" — a inferência por disciplina já
 * vem pré-marcada (`protocolIdsPreSelecionados`); tocar um chip liga/desliga
 * e salva o ajuste manual imediatamente via `corrigirEscopoProtocoloAction`.
 */
export function CapturaForm({
  sessionId,
  protocolos,
  protocolIdsPreSelecionados,
}: {
  sessionId: string;
  protocolos: Protocolo[];
  protocolIdsPreSelecionados: string[];
}) {
  const [textoState, textoAction] = useActionState<CapturarDiarioState, FormData>(
    capturarDiarioAction,
    {},
  );
  const [escopoState, escopoAction, escopoPending] = useActionState<
    CorrigirEscopoState,
    FormData
  >(corrigirEscopoProtocoloAction, {});
  const [selecionados, setSelecionados] = useState<string[]>(
    protocolIdsPreSelecionados,
  );
  const [audioConfirmado, setAudioConfirmado] = useState(false);

  function alternar(protocolId: string) {
    const proximos = selecionados.includes(protocolId)
      ? selecionados.filter((id) => id !== protocolId)
      : [...selecionados, protocolId];
    setSelecionados(proximos);
    if (proximos.length === 0) return;
    const formData = new FormData();
    formData.set("sessionId", sessionId);
    proximos.forEach((id) => formData.append("protocolIds", id));
    escopoAction(formData);
  }

  return (
    <Stack gap="md">
      {protocolos.length > 0 ? (
        <Stack gap="sm">
          <p className="text-ink font-display text-sm font-semibold">
            Protocolos desta sessão — toca pra trocar
          </p>
          <ChipGroup rotulo="Protocolos desta sessão">
            {protocolos.map((p) => (
              <Chip
                key={p.id}
                selecionado={selecionados.includes(p.id)}
                onSelecionar={() => alternar(p.id)}
              >
                {p.nome}
              </Chip>
            ))}
          </ChipGroup>
        </Stack>
      ) : null}
      {escopoState.error ? <Alert severidade="erro">{escopoState.error}</Alert> : null}
      {escopoPending ? (
        <p className="text-ink-muted text-sm" role="status">
          Salvando protocolos…
        </p>
      ) : null}

      <Tabs defaultValue="texto">
        <TabsList>
          <TabsTrigger value="texto">Texto</TabsTrigger>
          <TabsTrigger value="audio">Áudio</TabsTrigger>
        </TabsList>

        <TabsContent value="texto">
          <form action={textoAction} className="flex flex-col gap-4">
            <input type="hidden" name="sessionId" value={sessionId} />
            <Field label="Anotação rápida" htmlFor="texto" error={textoState.error}>
              <textarea
                id="texto"
                name="texto"
                required
                rows={4}
                aria-describedby={textoState.error ? "texto-error" : undefined}
                className="bg-surface text-ink font-body border-ink-anchor focus-visible:outline-focus min-h-24 w-full border-2 px-4 py-2.5 text-base outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
              />
            </Field>
            <Button type="submit">Salvar captura</Button>
            {textoState.id ? (
              <Alert severidade="sucesso">Captura salva.</Alert>
            ) : null}
          </form>
        </TabsContent>

        <TabsContent value="audio">
          <Stack gap="sm">
            <AudioLocal
              sessionId={sessionId}
              aoConfirmar={() => setAudioConfirmado(true)}
            />
            {audioConfirmado ? (
              <Alert severidade="sucesso">Áudio registrado nesta sessão.</Alert>
            ) : null}
          </Stack>
        </TabsContent>
      </Tabs>
    </Stack>
  );
}
