"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { criarBloqueioAction, type BloqueioState } from "@/app/(app)/agenda/bloqueio-actions";

type Bloqueio = { id: string; dataInicio: string; dataFim: string; motivo: string };

export function AusenciasForm({ patientId, bloqueios }: { patientId: string; bloqueios: Bloqueio[] }) {
  const [state, formAction] = useActionState<BloqueioState, FormData>(criarBloqueioAction, {});
  return (
    <section className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1">
        {bloqueios.map((b) => (
          <li key={b.id} className="font-body text-ink">{b.dataInicio} — {b.dataFim}: {b.motivo}</li>
        ))}
      </ul>
      <Form action={formAction} error={state.error}>
        <input type="hidden" name="escopo" value="paciente" />
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="caminho" value={`/pacientes/${patientId}/ausencias`} />
        <Field label="Início" htmlFor="dataInicio"><Input id="dataInicio" name="dataInicio" type="date" required /></Field>
        <Field label="Fim" htmlFor="dataFim"><Input id="dataFim" name="dataFim" type="date" required /></Field>
        <Field label="Motivo" htmlFor="motivo"><Input id="motivo" name="motivo" required placeholder="Férias, viagem…" /></Field>
        <Button type="submit">Registrar ausência</Button>
      </Form>
    </section>
  );
}
