"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { salvarRPDAction, type SalvarRpdState } from "./actions";
import { DISTORCOES_COGNITIVAS_OPCOES } from "./constants";

interface RpdFormProps {
  patientId: string;
  estadoInicial?: SalvarRpdState;
}

export function RpdForm({ patientId, estadoInicial }: RpdFormProps) {
  const [state, formAction, isPending] = useActionState<
    SalvarRpdState,
    FormData
  >(salvarRPDAction.bind(null, patientId), estadoInicial ?? {});

  const [intensidade, setIntensidade] = useState<number>(80);
  const [intensidadePos, setIntensidadePos] = useState<number>(30);

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]">
      <div className="flex flex-col gap-1 border-b-2 border-[var(--border-brutal)] pb-3">
        <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
          📝 Novo Registro de Pensamentos Distorcidos (RPD)
        </h3>
        <p className="font-body text-xs text-[var(--text-secondary)]">
          Preencha a reestruturação cognitiva: situação, pensamento automático,
          emoção, distorção e resposta racional.
        </p>
      </div>

      {state.ok ? (
        <Alert severidade="sucesso" titulo="RPD Registrado com Sucesso">
          O registro de pensamentos distorcidos foi salvo no prontuário do
          paciente e incorporado ao gráfico de evolução cognitiva.
        </Alert>
      ) : null}

      <Form action={formAction} error={state.error}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Situação / Gatilho */}
          <Field
            label="1. Situação / Gatilho"
            htmlFor="situacao"
            hint="Onde estava, com quem, o que aconteceu?"
            className="md:col-span-2"
          >
            <Input
              id="situacao"
              name="situacao"
              required
              placeholder="Ex.: Apresentação da reunião de equipe na terça-feira"
            />
          </Field>

          {/* Pensamento Automático */}
          <Field
            label="2. Pensamento Automático"
            htmlFor="pensamentoAutomatico"
            hint="O que passou pela cabeça no momento?"
            className="md:col-span-2"
          >
            <Input
              id="pensamentoAutomatico"
              name="pensamentoAutomatico"
              required
              placeholder="Ex.: 'Vou gaguejar e todos vão ver que sou incompetente'"
            />
          </Field>

          {/* Emoção & Intensidade */}
          <Field
            label="3. Emoção Sentida"
            htmlFor="emocao"
            hint="Nome da emoção (Ansiedade, Tristeza, Raiva...)"
          >
            <Input
              id="emocao"
              name="emocao"
              required
              placeholder="Ex.: Ansiedade"
            />
          </Field>

          <Field
            label={`Intensidade Inicial: ${intensidade}%`}
            htmlFor="intensidade"
            hint="Escala de 0% a 100%"
          >
            <div className="flex items-center gap-3">
              <input
                id="intensidade"
                name="intensidade"
                type="range"
                min={0}
                max={100}
                value={intensidade}
                onChange={(e) => setIntensidade(Number(e.target.value))}
                className="h-3 w-full cursor-pointer rounded-lg border-2 border-[var(--border-brutal)] accent-[var(--action-primary)]"
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={intensidade}
                onChange={(e) =>
                  setIntensidade(
                    Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  )
                }
                className="w-20 text-center font-bold"
              />
            </div>
          </Field>

          {/* Distorção Cognitiva */}
          <Field
            label="4. Distorção Cognitiva Identificada"
            htmlFor="distorcaoCognitiva"
            hint="Selecione o viés cognitivo principal"
            className="md:col-span-2"
          >
            <select
              id="distorcaoCognitiva"
              name="distorcaoCognitiva"
              required
              defaultValue={DISTORCOES_COGNITIVAS_OPCOES[0]}
              className="font-body focus-visible:outline-focus flex min-h-11 w-full items-center justify-between rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-4 py-2.5 text-base text-[var(--text-primary)] outline-none"
            >
              {DISTORCOES_COGNITIVAS_OPCOES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>

          {/* Resposta Racional */}
          <Field
            label="5. Resposta Racional / Pensamento Alternativo"
            htmlFor="respostaRacional"
            hint="Quais as evidências reais? Qual o pensamento mais equilibrado?"
            className="md:col-span-2"
          >
            <Input
              id="respostaRacional"
              name="respostaRacional"
              required
              placeholder="Ex.: 'Já fiz diversas reuniões bem-sucedidas. Posso usar minhas anotações e respirar fundo.'"
            />
          </Field>

          {/* Reavaliação de Humor / Intensidade Pós */}
          <Field
            label={`6. Reavaliação de Humor (Pós-Resposta): ${intensidadePos}%`}
            htmlFor="intensidadePos"
            hint="Nova intensidade emocional após a resposta racional (0-100%)"
            className="md:col-span-2"
          >
            <div className="flex items-center gap-3">
              <input
                id="intensidadePos"
                name="intensidadePos"
                type="range"
                min={0}
                max={100}
                value={intensidadePos}
                onChange={(e) => setIntensidadePos(Number(e.target.value))}
                className="h-3 w-full cursor-pointer rounded-lg border-2 border-[var(--border-brutal)] accent-[var(--action-primary)]"
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={intensidadePos}
                onChange={(e) =>
                  setIntensidadePos(
                    Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  )
                }
                className="w-20 text-center font-bold"
              />
            </div>
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar RPD"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
