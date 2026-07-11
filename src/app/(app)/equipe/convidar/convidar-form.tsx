"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { convidarUsuarioAction, type ConvidarState } from "./actions";

export function ConvidarForm() {
  const [state, formAction] = useActionState<ConvidarState, FormData>(
    convidarUsuarioAction,
    {},
  );

  if (state.senhaTemporaria) {
    return (
      <Alert severidade="sucesso" titulo="Convite criado">
        Senha temporária (exibida uma única vez — copie e repasse manualmente ao
        profissional; ela não será mostrada de novo):
        <br />
        <code className="mt-2 inline-block font-mono text-lg">
          {state.senhaTemporaria}
        </code>
      </Alert>
    );
  }

  return (
    <Form action={formAction} error={state.error}>
      <Field label="Nome" htmlFor="nome">
        <Input id="nome" name="nome" required />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Field label="Papel" htmlFor="papel">
        <select
          id="papel"
          name="papel"
          required
          className="border-ink-anchor rounded-md border-2 px-3 py-2"
        >
          <option value="terapeuta">Terapeuta</option>
          <option value="admin_recepcao">Recepção/Administrativo</option>
        </select>
      </Field>
      <Button type="submit">Convidar</Button>
    </Form>
  );
}
