"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

  const [criterioN, setCriterioN] = useState<number>(3);
  const [criterioM, setCriterioM] = useState<number>(3);

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

      <fieldset className="flex flex-col gap-2">
        <legend className="font-display text-sm font-bold text-[var(--text-primary)]">
          Disciplina
        </legend>
        <div className="flex flex-wrap gap-4">
          {(["ABA", "Fono", "TO"] as const).map((d, i) => (
            <label
              key={d}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[var(--text-primary)]"
            >
              <input
                type="radio"
                name="disciplina"
                value={d}
                defaultChecked={i === 0}
                className="focus-visible:outline-focus size-5 border-2 border-[var(--border-brutal)] accent-[var(--action-primary)]"
              />
              {d}
            </label>
          ))}
        </div>
      </fieldset>

      {milestones.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-display text-sm font-bold text-[var(--text-primary)]">
            Mapear a marco(s) — opcional
          </legend>
          <div className="flex flex-col gap-1">
            {milestones.map((m) => (
              <Checkbox
                key={m.id}
                name="milestoneIds"
                value={m.id}
                label={m.rotulo}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* Critério de Domínio Estruturado Redesenhado (/impeccable) */}
      <fieldset className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow-sm)]">
        <legend className="font-display flex items-center gap-1.5 px-1.5 text-sm font-bold text-[var(--text-primary)]">
          <span>🎯</span> Critério de Domínio Automático
        </legend>

        <p className="font-body text-xs leading-relaxed text-[var(--text-secondary)]">
          Defina a regra objetiva para a IA avaliar quando esta meta for
          conquistada pelo paciente.
        </p>

        {/* Frase clínica interativa com inputs fluídos */}
        <div className="font-body flex flex-wrap items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border-brutal)]/20 bg-[var(--surface-elevated)] p-3 text-sm text-[var(--text-primary)]">
          <span className="font-semibold">Atingir</span>

          <Input
            id="criterioN"
            name="criterioN"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={criterioN}
            onChange={(e) =>
              setCriterioN(
                Math.max(1, Math.min(99, Number(e.target.value) || 1)),
              )
            }
            className="h-10 w-16 px-1 text-center text-base font-bold"
            required
          />

          <span className="font-medium">acerto(s) independente(s) em</span>

          <Input
            id="criterioM"
            name="criterioM"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={criterioM}
            onChange={(e) =>
              setCriterioM(
                Math.max(1, Math.min(99, Number(e.target.value) || 1)),
              )
            }
            className="h-10 w-16 px-1 text-center text-base font-bold"
            required
          />

          <span className="font-medium">sessão(ões) consecutiva(s).</span>
        </div>

        {/* Feedback Dinâmico / Preview em Tempo Real */}
        <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border-brutal)]/30 bg-[var(--action-primary-tint,rgba(242,183,5,0.08))] p-3 text-xs">
          <span className="text-base leading-none">⚡</span>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-[var(--text-primary)]">
              Avaliação Automática por IA:
            </span>
            <span className="leading-relaxed text-[var(--text-secondary)]">
              A meta será marcada como{" "}
              <strong className="font-semibold text-black">
                &quot;Candidata a Dominada&quot;
              </strong>{" "}
              assim que o paciente alcançar{" "}
              <strong>{criterioN} acerto(s) independente(s)</strong> em{" "}
              <strong>{criterioM} sessão(ões) consecutiva(s)</strong>.
            </span>
          </div>
        </div>
      </fieldset>

      <Field
        label="Ciclo de revisão (semanas, 8–12)"
        htmlFor="cicloRevisaoSemanas"
        className="w-56"
      >
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
