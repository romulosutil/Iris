"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
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
        terapeuta; ela não será mostrada de novo):
        <br />
        <code className="mt-2 inline-block font-mono text-lg">
          {state.senhaTemporaria}
        </code>
      </Alert>
    );
  }

  if (state.sucesso) {
    return (
      <Alert severidade="sucesso" titulo="Profissional adicionado à equipe">
        O profissional já possui uma conta cadastrada no Iris e foi vinculado com sucesso à equipe da clínica.
        Ele deve realizar o login utilizando sua senha de acesso atual.
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
        <Select name="papel" defaultValue="terapeuta">
          <SelectTrigger id="papel">
            <SelectValue placeholder="Selecione o papel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="terapeuta">Terapeuta</SelectItem>
            <SelectItem value="admin_recepcao">Recepção/Administrativo</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Conselho (opcional)" htmlFor="conselho">
          <Input id="conselho" name="conselho" placeholder="Ex.: CRP, CRFa, CREFITO" />
        </Field>
        <Field label="Nº de Registro (opcional)" htmlFor="registroNumero">
          <Input id="registroNumero" name="registroNumero" placeholder="Ex.: 123456" />
        </Field>
        <Field label="UF do Registro (opcional)" htmlFor="registroUf">
          <Input id="registroUf" name="registroUf" placeholder="Ex.: SP" maxLength={2} />
        </Field>
      </div>
      <Button type="submit">Convidar</Button>
    </Form>
  );
}
