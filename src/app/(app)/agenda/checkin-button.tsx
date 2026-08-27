"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { checkInAction } from "./actions";

/**
 * Botão de check-in de uma sessão. Envolve a Server Action `checkInAction` num
 * form com o id da sessão; em erro, mostra a mensagem inline (aria-live) sem
 * derrubar a grade.
 *
 * Com `checkInEm` presente, vira confirmação estática ("Check-in às HH:MM"):
 * o sucesso era invisível (o estado segue `agendada`) e o terapeuta re-clicava
 * achando que não tinha funcionado (QA mobile #249).
 */
export function CheckInButton({
  sessionId,
  checkInEm,
  fuso = "America/Sao_Paulo",
}: {
  sessionId: string;
  checkInEm?: Date | string | null;
  fuso?: string;
}) {
  const [state, formAction, pending] = useActionState(checkInAction, {});
  if (checkInEm) {
    const hora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(checkInEm));
    return (
      <span
        role="status"
        className="font-display inline-flex min-h-11 items-center rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--color-mint)] px-3 text-xs font-semibold tracking-wide uppercase"
      >
        Check-in às {hora}
      </span>
    );
  }
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variante="neutra" disabled={pending}>
        {pending ? "Registrando…" : "Fazer check-in"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-[var(--status-error-fg)]">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
