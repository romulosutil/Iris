// Regras puras do Briefing Pré-Sessão (sem `server-only` nem `@/db` — mesmo
// padrão de `revisao/[sessionId]/resumo.ts`): rodam no servidor dentro de
// `queries.ts`, mas são testáveis isoladas em jsdom sem mockar o banco.

export type AlertaManejo = {
  extractionId: string;
  antecedente: string | null;
  comportamento: string | null;
  consequenciaRegulacao: string | null;
  sessionNumero: number | null;
  revisadoEm: Date | null;
};

export type ReforcadorAtual = {
  item: string;
  valencia: "alta" | "baixa";
};

type RegistroAbcPayload = {
  antecedente?: string;
  comportamento?: string;
  consequencia_regulacao?: string;
  severidade?: "leve" | "moderada" | "grave";
};

type ReinforcerRow = {
  itemAtividade: string;
  valencia: "alta" | "baixa" | "saciado";
  sessionNumero: number;
};

/**
 * Reduz a série de observações de reforçador ao estado ATUAL: 1 linha por item
 * (a mais recente, por `sessionNumero`), com `saciado` DEMOVENDO/excluindo o
 * item (R17 — recência manda), e "alta" surfaçando primeiro.
 */
export function reforcadoresAtuaisDe(rows: ReinforcerRow[]): ReforcadorAtual[] {
  const maisRecentePorItem = new Map<string, ReinforcerRow>();
  for (const r of rows) {
    const atual = maisRecentePorItem.get(r.itemAtividade);
    if (!atual || r.sessionNumero > atual.sessionNumero) {
      maisRecentePorItem.set(r.itemAtividade, r);
    }
  }
  return [...maisRecentePorItem.values()]
    .filter(
      (r): r is ReinforcerRow & { valencia: "alta" | "baixa" } =>
        r.valencia !== "saciado",
    )
    .sort((a, b) =>
      a.valencia === b.valencia ? 0 : a.valencia === "alta" ? -1 : 1,
    )
    .map((r) => ({ item: r.itemAtividade, valencia: r.valencia }));
}

type ExtracaoAbcRow = {
  id: string;
  estado: string;
  payload: unknown;
  payloadEditado: unknown;
  sessionNumero: number | null;
  revisadoEm: Date | null;
};

/**
 * Filtra extrações `registro_abc` aprovadas/editadas com severidade "grave" —
 * o conteúdo EFETIVO é `payloadEditado ?? payload` (edição humana vence a
 * sugestão original da IA, mesma regra do resto do produto).
 */
export function alertasGraveDe(rows: ExtracaoAbcRow[]): AlertaManejo[] {
  return rows
    .filter((r) => r.estado === "aprovada" || r.estado === "editada")
    .map((r) => ({
      row: r,
      payload: (r.payloadEditado ?? r.payload ?? {}) as RegistroAbcPayload,
    }))
    .filter(({ payload }) => payload.severidade === "grave")
    .map(({ row, payload }) => ({
      extractionId: row.id,
      antecedente: payload.antecedente ?? null,
      comportamento: payload.comportamento ?? null,
      consequenciaRegulacao: payload.consequencia_regulacao ?? null,
      sessionNumero: row.sessionNumero,
      revisadoEm: row.revisadoEm,
    }));
}
