"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { esqueciSenha, type EstadoEsqueciSenha } from "./actions";

const ESTADO_INICIAL: EstadoEsqueciSenha = {};

/**
 * Formulário de recuperação de senha. `esqueciSenha` (Task 9) NUNCA
 * redireciona: todo desfecho pós-validação de formato — e-mail existente,
 * inexistente, throttle, falha de e-mail/banco — volta como
 * `{ mensagem: mensagemUniforme() }`, sempre o mesmo texto. Este componente
 * troca o formulário por essa mensagem assim que ela chega, para não
 * convidar reenvio (cada envio consome throttle) e para deixar claro que a
 * ação terminou — sem nunca dizer se a conta existe.
 *
 * Único campo controlado é o e-mail: sem Select/Checkbox aqui, então o
 * problema do reset nativo do Radix (ver `../cadastro/cadastro-form.tsx`)
 * não se aplica — mas o campo continua controlado e o foco continua
 * indo para o alerta em qualquer desfecho (erro de formato OU mensagem
 * final), pelo mesmo motivo de acessibilidade.
 */
export function EsqueciSenhaForm() {
  const [estado, formAction, pending] = useActionState(
    esqueciSenha,
    ESTADO_INICIAL,
  );
  const [email, setEmail] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!estado?.error && !estado?.mensagem) return;
    const alerta = containerRef.current?.querySelector('[role="alert"], [role="status"]');
    if (alerta instanceof HTMLElement) {
      alerta.setAttribute("tabindex", "-1");
      alerta.focus();
    }
  }, [estado]);

  if (estado?.mensagem) {
    return (
      <div ref={containerRef} className="flex flex-col gap-4">
        <Alert severidade="info" titulo="Verifique seu e-mail">
          {estado.mensagem}
        </Alert>
        <Link
          href="/login"
          className="text-[var(--text-primary)] text-center text-sm font-semibold underline underline-offset-2"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <Form action={formAction} error={estado?.error}>
        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Button type="submit" isLoading={pending}>
          {pending ? "Enviando…" : "Enviar link de redefinição"}
        </Button>
      </Form>
    </div>
  );
}
