"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { salvarRPDAction, type SalvarRpdState } from "./actions";
import { DISTORCOES_COGNITIVAS_OPCOES } from "./constants";

interface RpdFormProps {
  patientId: string;
  estadoInicial?: SalvarRpdState;
}

/**
 * #389 — formato Padesky. Ordem dos campos segue o fluxo de reestruturação
 * cognitiva (situação → pensamento automático → emoção → evidências →
 * pensamento alternativo), não mais o formato antigo (distorção logo após a
 * emoção). Só os 3 primeiros campos são obrigatórios — o restante é
 * enviável vazio (Zod do lado servidor reflete a mesma regra). Distorção
 * cognitiva é sempre opcional e nunca entra no cálculo de completude
 * (`../completude.ts`); por isso fica colapsada por padrão, depois da
 * reestruturação, não antes dela.
 */
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
          Registre a situação, o pensamento automático e a emoção. O restante
          — evidências, pensamento alternativo e categoria — é opcional e
          pode ser preenchido depois, conforme a reestruturação avança.
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
          {/* 1. Situação / Gatilho */}
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

          {/* 2. Pensamento Automático */}
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

          {/* 3. Emoção & Intensidade */}
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

          {/* 4. Credibilidade do pensamento inicial (opcional) */}
          <Field
            label="Credibilidade inicial (opcional)"
            htmlFor="credibilidadeInicial"
            hint="O quanto você acreditava nesse pensamento no momento, de 0 a 100%"
            className="md:col-span-2"
          >
            <Input
              id="credibilidadeInicial"
              name="credibilidadeInicial"
              type="number"
              min={0}
              max={100}
              placeholder="0-100"
              className="w-32"
            />
          </Field>

          {/* 5. Evidências a favor — núcleo da reestruturação */}
          <Field
            label="Evidências a favor do pensamento (opcional)"
            htmlFor="evidenciasFavor"
            hint="O que sustenta esse pensamento, de fato? Núcleo da reestruturação, junto com as evidências contra."
            className="md:col-span-2"
          >
            <Input
              id="evidenciasFavor"
              name="evidenciasFavor"
              multiline
              rows={3}
              placeholder="Ex.: 'Já gaguejei em outra reunião uma vez.'"
            />
          </Field>

          {/* 6. Evidências contra */}
          <Field
            label="Evidências contra o pensamento (opcional)"
            htmlFor="evidenciasContra"
            hint="O que contradiz esse pensamento? Fatos, não suposições."
            className="md:col-span-2"
          >
            <Input
              id="evidenciasContra"
              name="evidenciasContra"
              multiline
              rows={3}
              placeholder="Ex.: 'Fiz 5 apresentações este ano e recebi feedback positivo em 4 delas.'"
            />
          </Field>

          {/* 7. Pensamento alternativo (era "Resposta Racional") */}
          <Field
            label="Pensamento alternativo (opcional)"
            htmlFor="respostaRacional"
            hint="Considerando as evidências acima, qual pensamento é mais equilibrado?"
            className="md:col-span-2"
          >
            <Input
              id="respostaRacional"
              name="respostaRacional"
              placeholder="Ex.: 'Já fiz diversas reuniões bem-sucedidas. Posso usar minhas anotações e respirar fundo.'"
            />
          </Field>

          {/* 8. Credibilidade da alternativa (opcional) */}
          <Field
            label="Credibilidade da alternativa (opcional)"
            htmlFor="credibilidadeAlternativa"
            hint="O quanto você acredita no pensamento alternativo agora, de 0 a 100%"
            className="md:col-span-2"
          >
            <Input
              id="credibilidadeAlternativa"
              name="credibilidadeAlternativa"
              type="number"
              min={0}
              max={100}
              placeholder="0-100"
              className="w-32"
            />
          </Field>

          {/* 9. Distorção cognitiva — opcional, colapsada, depois da reestruturação */}
          <details className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-4 md:col-span-2">
            <summary className="font-display cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
              Mostrar categorias de pensamento
            </summary>

            <fieldset className="mt-4 flex flex-col gap-3 border-0 p-0">
              <legend className="font-display px-0 text-sm font-semibold text-[var(--text-primary)]">
                Que armadilha de pensamento parece ser? (opcional)
              </legend>
              <p className="font-body text-xs text-[var(--text-secondary)]">
                Pular este campo não prejudica o registro. As categorias se
                sobrepõem e nem os manuais concordam entre si — o que muda o
                quadro é examinar as evidências e formular uma alternativa, o
                que você já fez acima.
              </p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {DISTORCOES_COGNITIVAS_OPCOES.map((opcao) => (
                  <Checkbox
                    key={opcao.slug}
                    name="distorcoesCognitivas"
                    value={opcao.slug}
                    label={opcao.rotulo}
                  />
                ))}
              </div>
            </fieldset>
          </details>

          {/* 10. Reavaliação de Humor / Intensidade Pós */}
          <Field
            label={`Reavaliar intensidade (opcional): ${intensidadePos}%`}
            htmlFor="intensidadePos"
            hint="Nova intensidade emocional após examinar evidências e pensamento alternativo (0-100%)"
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

          {/* 11. Comportamento resultante */}
          <Field
            label="Comportamento resultante (opcional)"
            htmlFor="comportamentoResultante"
            hint="O que você fez (ou deixou de fazer) depois desse pensamento?"
            className="md:col-span-2"
          >
            <Input
              id="comportamentoResultante"
              name="comportamentoResultante"
              multiline
              rows={2}
              placeholder="Ex.: 'Evitei olhar para a plateia durante toda a apresentação.'"
            />
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
