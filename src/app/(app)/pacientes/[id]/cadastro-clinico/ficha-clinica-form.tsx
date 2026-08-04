"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { salvarFichaClinicaAction } from "./actions";
import { type FichaClinicaState } from "./logic";

type Perfil = {
  diagnostico?: string | null;
  medicacoes?: string | null;
  alergias?: string | null;
  convulsoes?: string | null;
  contatosEmergencia?: string | null;
};

export function FichaClinicaForm({
  patientId,
  perfil,
}: {
  patientId: string;
  perfil?: Perfil;
}) {
  const [state, formAction] = useActionState<FichaClinicaState, FormData>(
    salvarFichaClinicaAction.bind(null, patientId),
    {},
  );
  return (
    <Form action={formAction} error={state.error}>
      {state.ok ? (
        <Alert severidade="sucesso">Ficha clínica salva com sucesso.</Alert>
      ) : null}
      <Field label="Diagnóstico" htmlFor="diagnostico">
        <Input
          id="diagnostico"
          name="diagnostico"
          defaultValue={perfil?.diagnostico ?? ""}
        />
      </Field>
      <Field label="Medicações" htmlFor="medicacoes">
        <Input
          id="medicacoes"
          name="medicacoes"
          defaultValue={perfil?.medicacoes ?? ""}
        />
      </Field>
      <Field label="Alergias" htmlFor="alergias">
        <Input
          id="alergias"
          name="alergias"
          defaultValue={perfil?.alergias ?? ""}
        />
      </Field>
      <Field label="Convulsões" htmlFor="convulsoes">
        <Input
          id="convulsoes"
          name="convulsoes"
          defaultValue={perfil?.convulsoes ?? ""}
        />
      </Field>
      <Field label="Contatos de emergência" htmlFor="contatosEmergencia">
        <Input
          id="contatosEmergencia"
          name="contatosEmergencia"
          defaultValue={perfil?.contatosEmergencia ?? ""}
        />
      </Field>
      <Button type="submit">Salvar ficha clínica</Button>
    </Form>
  );
}
