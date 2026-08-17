"use client";

import * as React from "react";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { reenviarEmailVerificacao, type EstadoReenvio } from "./actions";

const ESTADO_INICIAL: EstadoReenvio = {};

/**
 * Formulário de reenvio do e-mail de verificação (#168).
 * Permite ao profissional solicitar o envio de um novo link de confirmação.
 * Integra Toast do Design System e feedback em tempo real com diretrizes de UX Writing.
 */
export function ReenvioForm() {
  const [estado, formAction, pending] = useActionState(
    reenviarEmailVerificacao,
    ESTADO_INICIAL,
  );
  const [email, setEmail] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
  const estadoAnteriorRef = React.useRef<EstadoReenvio>(ESTADO_INICIAL);

  // Exibe toast e move o foco para a mensagem de status/erro ao completar (Acessibilidade WCAG 2.4.7)
  React.useEffect(() => {
    if (estado === estadoAnteriorRef.current) return;
    estadoAnteriorRef.current = estado;

    if (estado?.message) {
      addToast({
        titulo: "E-mail enviado",
        mensagem: estado.message,
        severidade: "sucesso",
      });
    } else if (estado?.error) {
      addToast({
        titulo: "Não foi possível enviar",
        mensagem: estado.error,
        severidade: "erro",
      });
    }

    const alerta = containerRef.current?.querySelector(
      '[role="alert"], [role="status"]',
    );
    if (alerta instanceof HTMLElement) {
      alerta.setAttribute("tabindex", "-1");
      alerta.focus();
    }
  }, [estado, addToast]);

  return (
    <div
      ref={containerRef}
      className="mt-2 flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-4"
    >
      <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
        Reenviar e-mail de verificação
      </h2>

      {estado?.message && (
        <Alert severidade="sucesso" titulo="E-mail de confirmação enviado!">
          {estado.message}
        </Alert>
      )}

      {estado?.error && (
        <Alert severidade="erro" titulo="Atenção">
          {estado.error}
        </Alert>
      )}

      <Form action={formAction} error={estado?.error}>
        <Field label="Seu e-mail profissional" htmlFor="email-reenvio">
          <Input
            id="email-reenvio"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seu.nome@clinica.com.br"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Button
          type="submit"
          variante="secundaria"
          isLoading={pending}
          className="w-full"
        >
          {pending ? "Enviando mensagem…" : "Reenviar e-mail de verificação"}
        </Button>
      </Form>
    </div>
  );
}
