"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { agendarSessaoAction, type AgendarState } from "./actions";

/**
 * Agendar uma sessão na grade do dia. MVP: recebe `patientId`/`terapeutaId`
 * crus (mesma decisão da equipe na 1c — seletor por nome é polimento pós-MVP).
 * Só recepção/coordenação renderizam este form (a página faz o gate de papel).
 */
export function AgendarForm() {
  const [state, formAction] = useActionState<AgendarState, FormData>(
    agendarSessaoAction,
    {},
  );
  return (
    <Form action={formAction} error={state.error}>
      <Field label="ID do paciente" htmlFor="patientId">
        <Input id="patientId" name="patientId" required />
      </Field>
      <Field label="ID do profissional" htmlFor="terapeutaId">
        <Input id="terapeutaId" name="terapeutaId" required />
      </Field>
      <Field label="Data e hora" htmlFor="agendadaPara">
        <Input
          id="agendadaPara"
          name="agendadaPara"
          type="datetime-local"
          required
        />
      </Field>
      <Button type="submit">Agendar sessão</Button>
    </Form>
  );
}
