"use client";

import * as React from "react";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { reenviarEmailVerificacao, type EstadoReenvio } from "./actions";

const ESTADO_INICIAL: EstadoReenvio = {};

/**
 * Formulário de reenvio do e-mail de verificação (#168).
 * Permite ao profissional solicitar o envio de um novo link de confirmação.
 */
export function ReenvioForm() {
  const [estado, formAction, pending] = useActionState(
    reenviarEmailVerificacao,
    ESTADO_INICIAL,
  );
  const [email, setEmail] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Move o foco para a mensagem de status/erro ao completar (Acessibilidade WCAG 2.4.7)
  React.useEffect(() => {
    if (!estado?.error && !estado?.message) return;
    const alerta = containerRef.current?.querySelector('[role="alert"], [role="status"]');
    if (alerta instanceof HTMLElement) {
      alerta.setAttribute("tabindex", "-1");
      alerta.focus();
    }
  }, [estado]);

  return (
    <div ref={containerRef} className="flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-4 mt-2">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        Reenviar e-mail de verificação
      </h2>

      {estado?.message && (
        <Alert severidade="info" titulo="Solicitação enviada">
          {estado.message}
        </Alert>
      )}

      <Form action={formAction} error={estado?.error}>
        <Field label="E-mail profissional" htmlFor="email-reenvio">
          <Input
            id="email-reenvio"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com.br"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Button type="submit" variante="secundaria" isLoading={pending}>


          {pending ? "Reenviando…" : "Reenviar e-mail de verificação"}
        </Button>
      </Form>
    </div>
  );
}
