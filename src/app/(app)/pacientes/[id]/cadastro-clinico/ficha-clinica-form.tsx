"use client";
import { useActionState, useEffect } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
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
  const [state, formAction, isPending] = useActionState<FichaClinicaState, FormData>(
    salvarFichaClinicaAction.bind(null, patientId),
    {},
  );
  const { addToast } = useToast();

  useEffect(() => {
    if (state.ok) {
      addToast({
        titulo: "Salvo com sucesso",
        mensagem: "A ficha clínica do paciente foi atualizada.",
        severidade: "sucesso",
      });
    }
  }, [state.ok, addToast]);

  return (
    <Form action={formAction} error={state.error}>
      {state.ok ? (
        <Alert severidade="sucesso">Ficha clínica salva com sucesso.</Alert>
      ) : null}
      <Field label="Diagnóstico Clínico" htmlFor="diagnostico">
        <Input
          id="diagnostico"
          name="diagnostico"
          placeholder="Ex: Transtorno do Espectro Autista (TEA) - Nível 2 de Suporte"
          defaultValue={perfil?.diagnostico ?? ""}
        />
      </Field>
      <Field label="Medicações em Uso" htmlFor="medicacoes">
        <Input
          id="medicacoes"
          name="medicacoes"
          placeholder="Ex: Risperidona 1mg pela manhã"
          defaultValue={perfil?.medicacoes ?? ""}
        />
      </Field>
      <Field label="Alergias e Restrições Alimentares" htmlFor="alergias">
        <Input
          id="alergias"
          name="alergias"
          placeholder="Ex: APLV, Lactose, Dipirona"
          defaultValue={perfil?.alergias ?? ""}
        />
      </Field>
      <Field label="Histórico de Convulsões" htmlFor="convulsoes">
        <Input
          id="convulsoes"
          name="convulsoes"
          placeholder="Ex: Sem histórico recente ou data do último episódio"
          defaultValue={perfil?.convulsoes ?? ""}
        />
      </Field>
      <Field label="Contatos de Emergência" htmlFor="contatosEmergencia">
        <Input
          id="contatosEmergencia"
          name="contatosEmergencia"
          placeholder="Ex: Mãe (Maria) - (11) 99999-9999"
          defaultValue={perfil?.contatosEmergencia ?? ""}
        />
      </Field>
      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Salvando Ficha Clínica..." : "Salvar Ficha Clínica"}
      </Button>
    </Form>
  );
}
