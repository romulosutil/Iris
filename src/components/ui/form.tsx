"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";

export interface FormProps extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  "action"
> {
  action?: React.FormHTMLAttributes<HTMLFormElement>["action"];
  /** Mensagem de erro exibida via <Alert severidade="erro"> acima do formulário. */
  error?: string;
}

/**
 * Wrapper client de <form>: expõe `submitting` (via useFormStatus-friendly
 * onSubmit) e centraliza a exibição de erro no <Alert> existente — nenhuma
 * tela deve renderizar seu próprio bloco de erro ad hoc (princípio: todo
 * elemento visível consome um componente do DS).
 */
export const Form = React.forwardRef<HTMLFormElement, FormProps>(function Form(
  { className, action, onSubmit, error, children, ...props },
  ref,
) {
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (event) => {
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      onSubmit(event);
    } finally {
      // onSubmit síncrono do React não expõe promise — para fluxos
      // assíncronos (ex.: chamada de API), o consumidor controla o fim do
      // envio via `action` (server action) em vez de `onSubmit`.
      setSubmitting(false);
    }
  };

  return (
    <form
      ref={ref}
      action={action}
      onSubmit={onSubmit ? handleSubmit : undefined}
      data-submitting={submitting || undefined}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    >
      {error ? (
        <Alert severidade="erro" titulo="Não foi possível continuar">
          {error}
        </Alert>
      ) : null}
      {children}
    </form>
  );
});
