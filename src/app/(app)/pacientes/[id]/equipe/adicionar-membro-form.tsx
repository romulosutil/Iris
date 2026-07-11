"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adicionarMembroEquipeAction } from "./actions";

export function AdicionarMembroForm({ patientId }: { patientId: string }) {
  const [state, formAction] = useActionState(
    adicionarMembroEquipeAction.bind(null, patientId),
    {},
  );
  return (
    <Form action={formAction} error={state.error}>
      <Field label="ID do profissional (userId)" htmlFor="userId">
        <Input id="userId" name="userId" required />
      </Field>
      <Field label="Disciplina" htmlFor="disciplina">
        <Input id="disciplina" name="disciplina" required />
      </Field>
      <Field label="Papel na equipe" htmlFor="papelNaEquipe">
        <select
          id="papelNaEquipe"
          name="papelNaEquipe"
          required
          className="border-ink-anchor rounded-md border-2 px-3 py-2"
        >
          <option value="terapeuta_referencia">Terapeuta de referência</option>
          <option value="coordenador_referencia">
            Coordenador de referência
          </option>
          <option value="substituto">Substituto</option>
        </select>
      </Field>
      <Field label="Responsável técnico (opcional)" htmlFor="responsavelTecnicoId">
        <Input id="responsavelTecnicoId" name="responsavelTecnicoId" />
      </Field>
      <Button type="submit">Adicionar à equipe</Button>
    </Form>
  );
}
