"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Split, Cluster, Stack } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { control, surface } from "@/components/ui/primitives/surface";
import {
  reprocessarExtracaoAction,
  type ReprocessarState,
} from "../diario/[sessionId]/actions";
import type { ExtracaoPendente } from "./queries";

const linkClasses = cn(
  control("sm"),
  surface("solida"),
  "inline-flex shrink-0 items-center justify-center px-5 py-2.5",
  "bg-[var(--surface-card)] text-[var(--text-primary)] font-display text-base font-semibold",
  "transition-[transform,box-shadow,background-color] duration-100 ease-out",
  "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-hover",
  "active:translate-x-0 active:translate-y-0 active:shadow-none",
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
);

/**
 * Item da fila para uma extração que FALHOU (estado
 * `pendente_reprocessamento`). A nota consolidada continua salva (o diário nunca
 * se perde — flow 2.4); aqui o terapeuta re-dispara a extração sobre o mesmo
 * texto. O selo é deliberadamente distinto de "Conquistado"/"Candidato" — falha
 * de etapa não é dado clínico, é estado de pipeline.
 */
export function ItemPendente({ item }: { item: ExtracaoPendente }) {
  const [state, formAction, pending] = useActionState<ReprocessarState, FormData>(
    reprocessarExtracaoAction,
    {},
  );

  return (
    <Stack
      gap="md"
      className={cn(
        "bg-[var(--surface-card)] relative p-5 pt-8",
        surface("solida")
      )}
    >
      <span
        aria-hidden
        className="bg-brand-primary absolute inset-x-0 top-0 h-2"
      />
      <Split alinha="start">
        <Stack gap="sm">
          <span className="border-[var(--border-brutal)] bg-[var(--action-primary)] text-[var(--action-primary-fg)] inline-flex w-fit items-center border-2 px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
            Extração pendente
          </span>
          <span className="text-[var(--text-primary)] text-base">
            {item.pacienteNome ?? "Paciente (acesso restrito)"}
          </span>
        </Stack>
        <Cluster gap="sm">
          <Link href={`/diario/${item.sessionId}`} className={linkClasses}>
            Abrir diário
          </Link>
          <form action={formAction} className="contents">
            <input type="hidden" name="sessionId" value={item.sessionId} />
            <Button type="submit" disabled={pending}>
              {pending ? "Reprocessando…" : "Reprocessar"}
            </Button>
          </form>
        </Cluster>
      </Split>
      {state.error ? <Alert severidade="erro">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert severidade="sucesso">
          Reprocessamento disparado. Se a extração vier, aparece em Sugestões da IA.
        </Alert>
      ) : null}
    </Stack>
  );
}
