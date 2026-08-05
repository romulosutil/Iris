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
        <legend className="text-[var(--text-primary)] font-display text-sm font-bold">
          Disciplina
        </legend>
        <div className="flex flex-wrap gap-4">
          {(["ABA", "Fono", "TO"] as const).map((d, i) => (
            <label key={d} className="text-[var(--text-primary)] font-semibold inline-flex min-h-11 items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="disciplina"
                value={d}
                defaultChecked={i === 0}
                className="size-5 accent-[var(--action-primary)] border-2 border-[var(--border-brutal)] focus-visible:outline-focus"
              />
              {d}
            </label>
          ))}
        </div>
      </fieldset>

      {milestones.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[var(--text-primary)] font-display text-sm font-bold">
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
      <fieldset className="border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow-sm)] flex flex-col gap-3">
        <legend className="text-[var(--text-primary)] font-display px-1.5 text-sm font-bold flex items-center gap-1.5">
          <span>🎯</span> Critério de Domínio Automático
        </legend>

        <p className="text-xs text-[var(--text-secondary)] font-body leading-relaxed">
          Defina a regra objetiva para a IA avaliar quando esta meta for conquistada pelo paciente.
        </p>

        {/* Frase clínica interativa com inputs fluídos */}
        <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] border border-[var(--border-brutal)]/20 text-sm font-body text-[var(--text-primary)]">
          <span className="font-semibold">Atingir</span>

          <Input
            id="criterioN"
            name="criterioN"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={criterioN}
            onChange={(e) => setCriterioN(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="w-16 h-10 text-center font-bold text-base px-1"
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
            onChange={(e) => setCriterioM(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="w-16 h-10 text-center font-bold text-base px-1"
            required
          />

          <span className="font-medium">sessão(ões) consecutiva(s).</span>
        </div>

        {/* Feedback Dinâmico / Preview em Tempo Real */}
        <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-sm)] bg-[var(--action-primary-tint,rgba(242,183,5,0.08))] border border-[var(--border-brutal)]/30 text-xs">
          <span className="text-base leading-none">⚡</span>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-[var(--text-primary)]">Avaliação Automática por IA:</span>
            <span className="text-[var(--text-secondary)] leading-relaxed">
              A meta será marcada como <strong className="text-black font-semibold">&quot;Candidata a Dominada&quot;</strong> assim que o paciente alcançar <strong>{criterioN} acerto(s) independente(s)</strong> em <strong>{criterioM} sessão(ões) consecutiva(s)</strong>.
            </span>
          </div>
        </div>
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
