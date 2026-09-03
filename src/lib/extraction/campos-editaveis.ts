import type { ExtractionSubtipo } from "./provider";

/**
 * Campos que o diálogo "Editar sugestão" (`revisao-lista.tsx`) sabe corrigir,
 * e que `editarExtracaoAction` (`actions.ts`) sabe gravar (#582).
 *
 * FONTE ÚNICA para as duas pontas — cliente (o que renderizar) e servidor (o
 * que aceitar). Duplicar esta lista arriscaria a mesma deriva escrita×leitura
 * que originou a issue: um campo que o form oferece mas nenhum leitor
 * consome.
 */
export const CAMPO_EDITAVEL = ["funcao", "nivel_ajuda", "resultado"] as const;
export type CampoEditavel = (typeof CAMPO_EDITAVEL)[number];

export const ROTULO_CAMPO_EDITAVEL: Record<CampoEditavel, string> = {
  funcao: "Função",
  nivel_ajuda: "Nível de ajuda",
  resultado: "Resultado",
};

/**
 * Varredura medida em 03/09/2026 contra `agent-output-schema.ts` (Zod) — para
 * cada subtipo, quais dos três campos acima existem na RAIZ do payload
 * gravado por `payloadDoSubtipo` (`llm-provider.ts`), forma canônica FLAT
 * (#553).
 *
 * | subtipo                    | funcao | nivel_ajuda           | resultado |
 * |-----------------------------|--------|------------------------|-----------|
 * | evidencia                   | raiz   | raiz                   | raiz      |
 * | registro_abc                | —      | —                      | —         |
 * | ausencia_comportamento      | —      | —                      | —         |
 * | cadeia                      | —      | por etapa (`etapas[]`) | —         |
 * | preferencia_reforcador      | —      | —                      | —         |
 * | registro_pensamento         | —      | —                      | —         |
 * | aplicacao_escala_relatada   | —      | —                      | —         |
 * | tarefa_casa                 | —      | —                      | —         |
 * | pendente (sentinela)        | —      | —                      | —         |
 *
 * `cadeia` guarda nível de ajuda POR ETAPA, não na raiz — editar etapa a
 * etapa é feature própria (fora de escopo de #582; ver BACKLOG.md). Nenhum
 * outro subtipo tem qualquer um dos três campos em lugar nenhum do payload:
 * o diálogo genérico de três campos simplesmente não se aplica a eles.
 */
export const CAMPOS_EDITAVEIS_POR_SUBTIPO: Record<
  ExtractionSubtipo,
  readonly CampoEditavel[]
> = {
  evidencia: ["funcao", "nivel_ajuda", "resultado"],
  registro_abc: [],
  ausencia_comportamento: [],
  cadeia: [],
  preferencia_reforcador: [],
  registro_pensamento: [],
  aplicacao_escala_relatada: [],
  tarefa_casa: [],
  pendente: [],
};

export function camposEditaveisDe(subtipo: string): readonly CampoEditavel[] {
  return CAMPOS_EDITAVEIS_POR_SUBTIPO[subtipo as ExtractionSubtipo] ?? [];
}
