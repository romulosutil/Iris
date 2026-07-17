"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  cadastrarPacienteAdministrativo,
  type CadastroAdminState,
} from "./actions";

export function NovoPacienteForm() {
  const [state, formAction] = useActionState<CadastroAdminState, FormData>(
    cadastrarPacienteAdministrativo,
    {},
  );
  return (
    <Form action={formAction} error={state.error}>
      <Field label="Nome do paciente" htmlFor="nome">
        <Input id="nome" name="nome" required />
      </Field>
      <Field label="Data de nascimento" htmlFor="nascimento">
        <Input id="nascimento" name="nascimento" type="date" />
      </Field>
      <Field label="Contato do responsável" htmlFor="responsavelContato">
        <Input id="responsavelContato" name="responsavelContato" />
      </Field>
      <Field label="Escola" htmlFor="escola">
        <Input id="escola" name="escola" />
      </Field>
      <Field label="Convênio" htmlFor="convenio">
        <Input id="convenio" name="convenio" />
      </Field>
      {/* Alvo de carga por disciplina (Agenda 2.0) — opcional na v1: uma linha.
          Campos vazios são ignorados pela action; repetição dinâmica de linhas
          fica para a UI da Etapa B. */}
      <Field label="Disciplina do alvo de carga (opcional)" htmlFor="alvoDisciplina">
        <Input
          id="alvoDisciplina"
          name="alvoDisciplina"
          placeholder="ex.: aba, fono, to"
        />
      </Field>
      <Field label="Horas-alvo por semana" htmlFor="alvoHorasSemana">
        <Input
          id="alvoHorasSemana"
          name="alvoHorasSemana"
          type="number"
          min="0"
          step="0.5"
          inputMode="decimal"
        />
      </Field>
      <Field
        label="Responsável que assina o Consentimento LGPD"
        htmlFor="responsavelSignatario"
      >
        <Input id="responsavelSignatario" name="responsavelSignatario" required />
      </Field>
      <Button type="submit">Salvar e continuar para o cadastro clínico</Button>
    </Form>
  );
}
