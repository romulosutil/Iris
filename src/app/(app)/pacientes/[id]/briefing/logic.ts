// Regras puras do Briefing Pré-Sessão (sem `server-only` nem `@/db` — mesmo
// padrão de `revisao/[sessionId]/resumo.ts`): rodam no servidor dentro de
// `queries.ts`, mas são testáveis isoladas em jsdom sem mockar o banco.

import { registroAbcSchema } from "@/lib/extraction/agent-output-schema";
import {
  formatarMetricaSegmentacao,
  type Segmentacao,
} from "@/lib/evidence/snapshot-schema";

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
 * Conteúdo efetivo de um registro ABC: `payloadEditado` vence o `payload`
 * original SÓ quando tem a forma de um registro ABC (schema Zod do agente).
 * Objeto fora do formato — o `{error}` que o DLQ antigo gravava em
 * `payload_editado` (#532, Q-01), ou qualquer lixo — é ignorado, e vale o
 * `payload` da IA; nunca vira "sem severidade" em silêncio.
 */
const CHAVES_ABC = Object.keys(registroAbcSchema.shape);

/**
 * `payloadEditado` é rejeitado quando (a) traz a chave `error` — assinatura
 * do DLQ antigo — ou (b) não tem NENHUMA chave conhecida do registro ABC
 * (lixo). Fora isso, parse NÃO-strict: uma edição humana legítima com um
 * campo extra continua vencendo o payload da IA (`.strict()` a descartaria
 * em silêncio — achado da revisão pós-PR de #532). O schema tem todos os
 * campos opcionais, por isso a checagem de chaves vem ANTES do parse: sem
 * ela `{error: msg}` passaria como `{}` e apagaria a severidade.
 */
function editadoAbcAceitavel(editado: unknown): boolean {
  if (typeof editado !== "object" || editado === null) return false;
  const chaves = Object.keys(editado);
  if (chaves.includes("error")) return false;
  return chaves.some((k) => CHAVES_ABC.includes(k));
}

function conteudoAbcEfetivo(r: ExtracaoAbcRow): RegistroAbcPayload {
  if (r.payloadEditado != null && editadoAbcAceitavel(r.payloadEditado)) {
    const editado = registroAbcSchema.safeParse(r.payloadEditado);
    if (editado.success) return editado.data;
  }
  return (r.payload ?? {}) as RegistroAbcPayload;
}

/**
 * Filtra extrações `registro_abc` aprovadas/editadas com severidade "grave" —
 * o conteúdo EFETIVO é `payloadEditado ?? payload` (edição humana vence a
 * sugestão original da IA, mesma regra do resto do produto), com o
 * `payloadEditado` validado pelo schema (ver `conteudoAbcEfetivo`).
 */
export function alertasGraveDe(rows: ExtracaoAbcRow[]): AlertaManejo[] {
  return rows
    .filter((r) => r.estado === "aprovada" || r.estado === "editada")
    .map((r) => ({
      row: r,
      payload: conteudoAbcEfetivo(r),
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

type EstadoRepertorioBriefing = {
  metrica_recente?: unknown;
  contagem?: unknown;
  is_candidata?: boolean;
};

export type LinhaUltimaSessao = {
  chave: string;
  rotulo: string;
  metrica: string;
  isCandidata: boolean;
};

/**
 * Monta as linhas de "Última sessão" a partir do snapshot materializado.
 *
 * A métrica sai do formatador único (`formatarMetricaSegmentacao`) — antes era
 * `String(primeiroSeg?.metrica)`, que renderizava `[object Object]` para todo
 * snapshot de sessão normal, cuja `metrica` é objeto (#567). O fallback segue
 * a mesma ordem de antes: segmentação → repertório → copy de ausência.
 */
export function linhasUltimaSessaoDe({
  repertorio,
  segmentacao,
  descricaoPorGoal,
}: {
  repertorio: Record<string, EstadoRepertorioBriefing>;
  segmentacao: Segmentacao;
  descricaoPorGoal: Map<string, string>;
}): LinhaUltimaSessao[] {
  return Object.keys(repertorio).map((chave) => {
    const estado = repertorio[chave] ?? {};
    const primeiroSeg = Object.values(segmentacao[chave] ?? {})[0];
    const rotulo = descricaoPorGoal.get(chave) ?? primeiroSeg?.rotulo ?? chave;

    const daSegmentacao = formatarMetricaSegmentacao(primeiroSeg?.metrica);
    const doRepertorio = estado.metrica_recente ?? estado.contagem;
    const metrica =
      daSegmentacao ??
      (doRepertorio != null ? String(doRepertorio) : "sem métrica registrada");

    return {
      chave,
      rotulo,
      metrica,
      isCandidata: estado.is_candidata === true,
    };
  });
}
