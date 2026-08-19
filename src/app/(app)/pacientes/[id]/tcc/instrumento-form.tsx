"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  salvarInstrumentoAplicacaoAction,
  type SalvarInstrumentoAplicacaoState,
} from "./actions";

/**
 * #393 — item vindo de `instrumento_item_texto` (T3). `texto: null` é o
 * estado ESPERADO por padrão (conteúdo licenciado ainda pendente de
 * confirmação jurídica — design.md "Componentes" §1) — o form filtra esses
 * itens abaixo, nunca os renderiza sem rótulo.
 */
export interface ItemInstrumentoTexto {
  numeroItem: number;
  texto: string | null;
}

export interface InstrumentoFormProps {
  patientId: string;
  tipoInstrumento: "phq9" | "gad7";
  /** Buscado pelo componente SERVIDOR pai (page.tsx) via
   * `instrumento_item_texto` — este componente cliente nunca busca dados
   * sozinho (regra explícita da task). */
  itensTexto: ItemInstrumentoTexto[];
  sessionId?: string | null;
  estadoInicial?: SalvarInstrumentoAplicacaoState;
  aoSalvarComSucesso?: () => void;
}

const OPCOES_VALOR = [0, 1, 2, 3] as const;

const ROTULO_TIPO: Record<"phq9" | "gad7", string> = {
  phq9: "PHQ-9",
  gad7: "GAD-7",
};

/**
 * Formulário manual de aplicação de instrumento padronizado (PHQ-9/GAD-7).
 * Só renderiza um item se `instrumento_item_texto.texto` já tiver sido
 * carregado para ele (T3, config vazia por padrão — conteúdo licenciado
 * pendente). Enquanto NENHUM item tiver texto (estado default hoje, tabela
 * vazia), mostra um estado vazio explícito em vez de um formulário sem
 * rótulos — nunca um formulário "quebrado" silencioso.
 *
 * Escala de resposta é só numérica (0-3): a estrutura não é conteúdo
 * licenciado (design.md §4), mas os rótulos de frequência da escala oficial
 * (ex.: termos descrevendo "quantos dias") fazem parte do conteúdo
 * licenciado — por isso NÃO aparecem aqui, só os números.
 */
export function InstrumentoForm({
  patientId,
  tipoInstrumento,
  itensTexto,
  sessionId,
  estadoInicial,
  aoSalvarComSucesso,
}: InstrumentoFormProps) {
  const itensComTexto = useMemo(
    () =>
      itensTexto
        .filter(
          (item): item is { numeroItem: number; texto: string } =>
            item.texto !== null && item.texto.trim().length > 0,
        )
        .sort((a, b) => a.numeroItem - b.numeroItem),
    [itensTexto],
  );

  const [state, formAction, isPending] = useActionState<
    SalvarInstrumentoAplicacaoState,
    FormData
  >(
    salvarInstrumentoAplicacaoAction.bind(null, patientId),
    estadoInicial ?? {},
  );

  useEffect(() => {
    if (state.ok) {
      aoSalvarComSucesso?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const [respostas, setRespostas] = useState<Record<number, 0 | 1 | 2 | 3>>(
    {},
  );

  const respostasPorItemJson = useMemo(
    () =>
      JSON.stringify(
        Object.entries(respostas).map(([item, valor]) => ({
          item: Number(item),
          valor,
        })),
      ),
    [respostas],
  );

  if (itensComTexto.length === 0) {
    return (
      <EmptyState
        title="Conteúdo do instrumento pendente de configuração"
        description={`Os itens do ${ROTULO_TIPO[tipoInstrumento]} ainda não foram carregados nesta instância. A aplicação manual fica disponível assim que o conteúdo for confirmado.`}
        variant="compact"
      />
    );
  }

  const todasRespondidas = itensComTexto.every(
    (item) => respostas[item.numeroItem] !== undefined,
  );

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]">
      <div className="flex flex-col gap-1 border-b-2 border-[var(--border-brutal)] pb-3">
        <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
          Aplicar {ROTULO_TIPO[tipoInstrumento]}
        </h3>
        <p className="font-body text-xs text-[var(--text-secondary)]">
          Marque a resposta de 0 a 3 para cada item.
        </p>
      </div>

      {state.ok ? (
        <Alert severidade="sucesso" titulo="Aplicação registrada">
          A aplicação do {ROTULO_TIPO[tipoInstrumento]} foi salva no
          prontuário do paciente.
        </Alert>
      ) : null}

      {state.alertaRiscoErro ? (
        <Alert severidade="warning" titulo="Atenção necessária">
          {state.alertaRiscoErro}
        </Alert>
      ) : null}

      <Form action={formAction} error={state.error}>
        <input type="hidden" name="tipoInstrumento" value={tipoInstrumento} />
        <input type="hidden" name="sessionId" value={sessionId ?? ""} />
        <input
          type="hidden"
          name="respostasPorItem"
          value={respostasPorItemJson}
        />

        <div className="flex flex-col gap-4">
          {itensComTexto.map((item) => (
            <Field
              key={item.numeroItem}
              label={`${item.numeroItem}. ${item.texto}`}
              htmlFor={`item-${item.numeroItem}`}
            >
              <div
                id={`item-${item.numeroItem}`}
                role="radiogroup"
                aria-label={`Resposta do item ${item.numeroItem}`}
                className="flex gap-2"
              >
                {OPCOES_VALOR.map((valor) => {
                  const id = `item-${item.numeroItem}-valor-${valor}`;
                  const marcado = respostas[item.numeroItem] === valor;
                  return (
                    <label
                      key={valor}
                      htmlFor={id}
                      className={
                        "flex size-10 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border-2 font-bold " +
                        (marcado
                          ? "border-[var(--border-brutal)] bg-[var(--action-primary)] text-[var(--action-primary-fg)]"
                          : "border-[var(--border-brutal)]/40 bg-[var(--surface-card)] text-[var(--text-primary)]")
                      }
                    >
                      <input
                        type="radio"
                        id={id}
                        name={`item-${item.numeroItem}`}
                        value={valor}
                        checked={marcado}
                        onChange={() =>
                          setRespostas((prev) => ({
                            ...prev,
                            [item.numeroItem]: valor,
                          }))
                        }
                        className="sr-only"
                      />
                      {valor}
                    </label>
                  );
                })}
              </div>
            </Field>
          ))}
        </div>

        <Field
          label="Fonte do escore"
          htmlFor="fonteDoEscore"
          className="mt-4"
        >
          <Select name="fonteDoEscore" defaultValue="terapeuta_calculou_na_sessao">
            <SelectTrigger id="fonteDoEscore">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="terapeuta_calculou_na_sessao">
                Terapeuta calculou na sessão
              </SelectItem>
              <SelectItem value="paciente_informou">
                Paciente informou o total
              </SelectItem>
              <SelectItem value="nao_informado">Não informado</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isPending || !todasRespondidas}>
            {isPending ? "Salvando..." : "Salvar aplicação"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
