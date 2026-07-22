"use client";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { criarMetaAction, type CriarMetaState } from "./actions";

export type MilestoneOpcao = { id: string; rotulo: string };

/**
 * Criação de meta (wireframe 4.4). O critério de domínio é formulário
 * estruturado — dois campos numéricos (N acertos / M sessões), nunca texto
 * livre — porque é ele que a máquina de "candidata a dominada" precisa avaliar
 * deterministicamente. Mapear a marco(s) é opcional (só aparece se o paciente
 * tem protocolos ativos com marcos catalogados).
 */
export function NovaMetaForm({
  patientId,
  milestones,
}: {
  patientId: string;
  milestones: MilestoneOpcao[];
}) {
  const [state, formAction] = useActionState<CriarMetaState, FormData>(
    criarMetaAction.bind(null, patientId),
    {},
  );
  return (
    <Form action={formAction} error={state.error}>
      <Field label="Descrição (linguagem simples)" htmlFor="descricao">
        <Input
          id="descricao"
          name="descricao"
          required
          placeholder="Ex.: Pedir água sozinho, sem dica"
        />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-ink font-display text-sm font-semibold">
          Disciplina
        </legend>
        <div className="flex flex-wrap gap-4">
          {(["ABA", "Fono", "TO"] as const).map((d, i) => (
            <label key={d} className="text-ink inline-flex items-center gap-2">
              <input
                type="radio"
                name="disciplina"
                value={d}
                defaultChecked={i === 0}
                className="size-4"
              />
              {d}
            </label>
          ))}
        </div>
      </fieldset>

      {milestones.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-ink font-display text-sm font-semibold">
            Mapear a marco(s) — opcional
          </legend>
          <div className="flex flex-col gap-2">
            {milestones.map((m) => (
              <label key={m.id} className="text-ink inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  name="milestoneIds"
                  value={m.id}
                  className="size-4"
                />
                {m.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="border-[var(--border-brutal)] flex flex-col gap-3 border-2 p-4 rounded-[var(--radius-control)]">
        <legend className="text-[var(--text-primary)] font-display px-1 text-sm font-semibold">
          Critério de domínio
        </legend>
        <div className="flex flex-wrap gap-4">
          <Field label="N acertos independentes" htmlFor="criterioN" className="w-40">
            <Input
              id="criterioN"
              name="criterioN"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              defaultValue={3}
              required
            />
          </Field>
          <Field label="em M sessões consecutivas" htmlFor="criterioM" className="w-48">
            <Input
              id="criterioM"
              name="criterioM"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              defaultValue={3}
              required
            />
          </Field>
        </div>
        <p className="text-ink text-sm">
          Formulário estruturado (não texto livre) — evita ambiguidade e permite
          a avaliação automática de domínio.
        </p>
      </fieldset>

      <Field label="Ciclo de revisão (semanas, 8–12)" htmlFor="cicloRevisaoSemanas" className="w-56">
        <Input
          id="cicloRevisaoSemanas"
          name="cicloRevisaoSemanas"
          type="number"
          inputMode="numeric"
          min={8}
          max={12}
          defaultValue={10}
          required
        />
      </Field>

      <Button type="submit">Criar meta</Button>
    </Form>
  );
}
