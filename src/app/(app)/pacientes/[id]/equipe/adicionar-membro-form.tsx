"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { adicionarMembroEquipeAction } from "./actions";

export function AdicionarMembroForm({ patientId }: { patientId: string }) {
  const [state, formAction] = useActionState(
    adicionarMembroEquipeAction.bind(null, patientId),
    {},
  );
  return (
    <Form action={formAction} error={state.error}>
      <Field label="ID do terapeuta (userId)" htmlFor="userId">
        <Input id="userId" name="userId" required />
      </Field>
      <Field label="Disciplina" htmlFor="disciplina">
        <Input id="disciplina" name="disciplina" required />
      </Field>
      <Field label="Papel na equipe" htmlFor="papelNaEquipe">
        <Select name="papelNaEquipe" defaultValue="terapeuta_referencia">
          <SelectTrigger id="papelNaEquipe">
            <SelectValue placeholder="Selecione o papel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="terapeuta_referencia">Terapeuta de referência</SelectItem>
            <SelectItem value="coordenador_referencia">
              Coordenador de referência
            </SelectItem>
            <SelectItem value="substituto">Substituto</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Responsável técnico (opcional)" htmlFor="responsavelTecnicoId">
        <Input id="responsavelTecnicoId" name="responsavelTecnicoId" />
      </Field>
      <Button type="submit">Adicionar à equipe</Button>
    </Form>
  );
}
