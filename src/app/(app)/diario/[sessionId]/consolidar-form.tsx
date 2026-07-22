"use client";
import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { consolidarSessaoAction, type ConsolidarState } from "./actions";

/**
 * Consolidação da sessão: nota final que dispara a extração de IA e (na
 * primeira consolidação) popula `numeroSequencialPaciente`. Reconsolidar
 * (ex.: corrigir um erro de digitação) não incrementa o número — só
 * regrava o texto e reprocessa a extração.
 */
export function ConsolidarForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState<ConsolidarState, FormData>(
    consolidarSessaoAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Field label="Nota consolidada" htmlFor="texto-consolidado" error={state.error}>
        <textarea
          id="texto-consolidado"
          name="texto"
          required
          rows={6}
          aria-describedby={state.error ? "texto-consolidado-error" : undefined}
          className="bg-[var(--surface-card)] text-[var(--text-primary)] font-body border-[var(--border-brutal)] focus-visible:outline-focus min-h-32 w-full border-2 px-4 py-2.5 text-base outline-none rounded-[var(--radius-control)] focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Consolidando…" : "Consolidar sessão"}
      </Button>
      {state.ok ? (
        <Alert severidade="sucesso">
          {typeof state.numero === "number"
            ? `Sessão consolidada — sessão nº ${state.numero} deste paciente.`
            : "Sessão consolidada."}
        </Alert>
      ) : null}
    </form>
  );
}
