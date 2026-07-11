"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { checkInAction } from "./actions";

/**
 * Botão de check-in de uma sessão. Envolve a Server Action `checkInAction` num
 * form com o id da sessão; em erro, mostra a mensagem inline (aria-live) sem
 * derrubar a grade.
 */
export function CheckInButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(checkInAction, {});
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variante="neutra" disabled={pending}>
        {pending ? "Registrando…" : "Fazer check-in"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-terracotta text-sm">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
