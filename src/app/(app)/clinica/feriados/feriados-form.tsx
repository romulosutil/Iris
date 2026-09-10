"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { Alert } from "@/components/ui/alert";
import {
  criarBloqueioAction,
  type BloqueioState,
} from "@/lib/agenda/bloqueio-actions";

type Bloqueio = {
  id: string;
  dataInicio: string;
  dataFim: string;
  motivo: string;
};

export function FeriadosForm({ bloqueios }: { bloqueios: Bloqueio[] }) {
  const [state, formAction] = useActionState<BloqueioState, FormData>(
    criarBloqueioAction,
    {},
  );
  return (
    <section className="flex flex-col gap-6">
      {bloqueios.length === 0 ? (
        <Alert severidade="info">
          Nenhum feriado cadastrado para esta clínica.
        </Alert>
      ) : (
        <DataList como="ul" aria-label="Feriados da clínica">
          {bloqueios.map((b) => (
            <DataListRow
              key={b.id}
              inicio={b.dataInicio}
              titulo={b.motivo}
              detalhe={
                b.dataFim !== b.dataInicio ? `até ${b.dataFim}` : undefined
              }
            />
          ))}
        </DataList>
      )}
      <Form action={formAction} error={state.error}>
        <input type="hidden" name="escopo" value="clinica" />
        <input type="hidden" name="caminho" value="/clinica/feriados" />
        <Field label="Início" htmlFor="dataInicio">
          <Input id="dataInicio" name="dataInicio" type="date" required />
        </Field>
        <Field label="Fim" htmlFor="dataFim">
          <Input id="dataFim" name="dataFim" type="date" required />
        </Field>
        <Field label="Motivo" htmlFor="motivo">
          <Input
            id="motivo"
            name="motivo"
            required
            placeholder="Feriado nacional…"
          />
        </Field>
        <Button type="submit" variante="primaria">
          Adicionar feriado
        </Button>
      </Form>
    </section>
  );
}
