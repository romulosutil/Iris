"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cadastrar, type EstadoCadastro } from "./actions";

const ESTADO_INICIAL: EstadoCadastro = {};

const CONSELHOS = [
  { valor: "crp", rotulo: "CRP" },
  { valor: "crfa", rotulo: "CRFa" },
  { valor: "crefito", rotulo: "CREFITO" },
  { valor: "crm", rotulo: "CRM" },
  { valor: "outro", rotulo: "Outro" },
] as const;

/**
 * Formulário de cadastro self-service. `cadastrar` (Task 7) colapsa toda
 * saída não-erro em `redirect("/cadastro/verifique-email")` — este
 * componente nunca vê um estado de "sucesso", só o de erro (uma string
 * genérica) ou o `pending` do próprio envio.
 */
export function CadastroForm() {
  const [estado, formAction, pending] = useActionState(
    cadastrar,
    ESTADO_INICIAL,
  );
  // Radix Select não participa de FormData nativamente — controla o valor
  // via estado e injeta num <input type="hidden"> lido por `validarCadastro`.
  const [conselho, setConselho] = React.useState("");

  return (
    <Form action={formAction} error={estado?.error}>
      <Field label="Nome completo" htmlFor="nome">
        <Input
          id="nome"
          name="nome"
          type="text"
          autoComplete="name"
          required
        />
      </Field>

      <Field label="E-mail" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>

      <Field label="Senha" htmlFor="senha">
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          aria-describedby="senha-dica"
        />
      </Field>
      <p id="senha-dica" className="text-[var(--text-secondary)] -mt-3 text-sm">
        Mínimo 12 caracteres.
      </p>

      <Field label="Nome da clínica" htmlFor="nomeClinica">
        <Input
          id="nomeClinica"
          name="nomeClinica"
          type="text"
          autoComplete="organization"
          required
        />
      </Field>

      <Field label="Conselho profissional" htmlFor="conselho-trigger">
        <input type="hidden" name="conselho" value={conselho} />
        <Select value={conselho} onValueChange={setConselho} required>
          <SelectTrigger id="conselho-trigger" aria-label="Conselho profissional">
            <SelectValue placeholder="Selecione seu conselho" />
          </SelectTrigger>
          <SelectContent>
            {CONSELHOS.map((c) => (
              <SelectItem key={c.valor} value={c.valor}>
                {c.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Número do registro" htmlFor="registroNumero">
        <Input
          id="registroNumero"
          name="registroNumero"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
        />
      </Field>

      <Field label="UF do registro" htmlFor="registroUf">
        <Input
          id="registroUf"
          name="registroUf"
          type="text"
          maxLength={2}
          autoComplete="address-level1"
          className="uppercase"
          required
        />
      </Field>

      <Checkbox
        name="termos"
        required
        label={
          <span>
            Li e aceito os{" "}
            <Link
              href="/termos"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              Política de Privacidade
            </Link>{" "}
            do Iris.
          </span>
        }
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Criando conta…" : "Criar conta"}
      </Button>
    </Form>
  );
}
