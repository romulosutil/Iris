"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  criarBloqueioAction,
  type BloqueioState,
} from "@/app/(app)/agenda/bloqueio-actions";

type Bloqueio = {
  id: string;
  dataInicio: string;
  dataFim: string;
  motivo: string;
};

export function BloqueiosTerapeuta({
  terapeutaId,
  bloqueios,
}: {
  terapeutaId: string;
  bloqueios: Bloqueio[];
}) {
  const [state, formAction] = useActionState<BloqueioState, FormData>(
    criarBloqueioAction,
    {},
  );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-black text-[var(--text-primary)]">
        Bloqueios (férias, afastamento)
      </h2>
      <ul className="flex flex-col gap-1">
        {bloqueios.map((b) => (
          <li key={b.id} className="font-body text-[var(--text-primary)]">
            {b.dataInicio} — {b.dataFim}: {b.motivo}
          </li>
        ))}
      </ul>
      <Form action={formAction} error={state.error}>
        <input type="hidden" name="escopo" value="terapeuta" />
        <input type="hidden" name="terapeutaId" value={terapeutaId} />
        <input type="hidden" name="caminho" value={`/equipe/${terapeutaId}`} />
        <Field label="Início" htmlFor="dataInicio">
          <Input id="dataInicio" name="dataInicio" type="date" required />
        </Field>
        <Field label="Fim" htmlFor="dataFim">
          <Input id="dataFim" name="dataFim" type="date" required />
        </Field>
        <Field label="Motivo" htmlFor="motivo">
          <Input id="motivo" name="motivo" required />
        </Field>
        <Button type="submit">Adicionar bloqueio</Button>
      </Form>
    </section>
  );
}
