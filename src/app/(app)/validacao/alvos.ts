/**
 * Alvos válidos de reclassificação (Fase 5 · Fatia 1 · Task 3).
 *
 * Reusa o resolvedor determinístico slug→UUID de `@/lib/evidence/resolver`
 * (mesma fonte usada na extração) para dois propósitos:
 *  1. `alvosValidosDoPaciente` — lista os alvos elegíveis (goals do paciente +
 *     marcos dos protocolos ATIVOS) para popular a UI de reclassificação.
 *  2. `validarAlvo` — antes de gravar `evidence_revision`, confirma que o
 *     `novoAlvo` informado pelo coordenador de fato resolve para algo real
 *     (goal do paciente, ou marco de um protocolo ativo do paciente) — nunca
 *     confia cegamente no payload do cliente.
 */
import { and, eq, isNull } from "drizzle-orm";
import { goal, milestone, patientProtocol, protocol } from "@/db/schema";
import {
  drizzleResolverQueries,
  resolverAlvoParaFks,
  type Alvo,
  type ResolvedFks,
} from "@/lib/evidence/resolver";

export type AlvoValido = {
  goal_id: string | null;
  protocol_id: string | null; // slug de família (ex. "vbmapp")
  dominio_id: string | null;
  tipo_estrutura: string | null;
};

/** Tipo mínimo de transação exigido — mesmo padrão frouxo de `resolver.ts`. */
type Tx = any;

/**
 * Alvos elegíveis para reclassificação: goals do paciente (independente de
 * protocolo) + marcos dos protocolos ATIVOS do paciente
 * (`patient_protocol.desativado_em IS NULL`).
 */
export async function alvosValidosDoPaciente(
  tx: Tx,
  patientId: string,
): Promise<AlvoValido[]> {
  const goals = await tx
    .select({ id: goal.id })
    .from(goal)
    .where(eq(goal.patientId, patientId));

  const protocolosAtivos = await tx
    .select({ protocolId: protocol.id, familia: protocol.familia })
    .from(protocol)
    .innerJoin(patientProtocol, eq(patientProtocol.protocolId, protocol.id))
    .where(
      and(
        eq(patientProtocol.patientId, patientId),
        isNull(patientProtocol.desativadoEm),
      ),
    );

  const alvos: AlvoValido[] = goals.map((g: { id: string }) => ({
    goal_id: g.id,
    protocol_id: null,
    dominio_id: null,
    tipo_estrutura: null,
  }));

  for (const p of protocolosAtivos as {
    protocolId: string;
    familia: string;
  }[]) {
    const marcos = await tx
      .select({
        dominioId: milestone.dominioId,
        tipoEstrutura: milestone.tipoEstrutura,
      })
      .from(milestone)
      .where(eq(milestone.protocolId, p.protocolId));
    for (const m of marcos as { dominioId: string; tipoEstrutura: string }[]) {
      alvos.push({
        goal_id: null,
        protocol_id: p.familia,
        dominio_id: m.dominioId,
        tipo_estrutura: m.tipoEstrutura,
      });
    }
  }

  return alvos;
}

export type ValidacaoAlvo =
  { ok: true; fks: ResolvedFks } | { ok: false; error: string };

async function tipoEstruturaDoMarco(
  tx: Tx,
  milestoneId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ tipoEstrutura: milestone.tipoEstrutura })
    .from(milestone)
    .where(eq(milestone.id, milestoneId));
  return (row?.tipoEstrutura as string | undefined) ?? null;
}

/**
 * Valida que `novoAlvo` resolve para algo real dentro do escopo do paciente:
 * goal existente, OU marco de protocolo ATIVO do paciente (resolução
 * determinística — ambíguo/inexistente nunca é aceito, mesmo padrão de
 * `resolverAlvoParaFks`).
 *
 * Também impõe compatibilidade de `tipo_estrutura` (achado de review da
 * Task 3): se a evidência sendo reclassificada tem um marco original
 * resolvido (`evidenciaOriginal.milestoneId`) e o novo alvo TAMBÉM resolve
 * para um marco, os dois precisam ter o MESMO `tipo_estrutura` — reclassificar
 * entre estruturas diferentes (ex.: marco_simples → marco_com_barreira)
 * misturaria semânticas de segmentação incompatíveis (rótulo numérico vs.
 * "aguardando_avaliacao_formal"). Evidência original goal-only (sem marco) ou
 * novo alvo goal-only não passam por este check — não há `tipo_estrutura` a
 * comparar (decisão de escopo: permitido).
 */
export async function validarAlvo(
  tx: Tx,
  ctx: { clinicId: string; patientId: string },
  novoAlvo: Alvo,
  evidenciaOriginal?: { milestoneId: string | null },
): Promise<ValidacaoAlvo> {
  const temGoal =
    typeof novoAlvo.goal_id === "string" && novoAlvo.goal_id.length > 0;
  const temMarco =
    typeof novoAlvo.protocol_id === "string" &&
    novoAlvo.protocol_id.length > 0 &&
    typeof novoAlvo.dominio_id === "string" &&
    novoAlvo.dominio_id.length > 0;

  if (!temGoal && !temMarco) {
    return {
      ok: false,
      error: "Alvo inválido: informe goal_id ou protocol_id + dominio_id.",
    };
  }

  const resolved = await resolverAlvoParaFks(
    drizzleResolverQueries(tx),
    ctx,
    novoAlvo,
  );

  if (temGoal && !resolved.goalId) {
    return {
      ok: false,
      error: "Alvo inválido: goal não encontrado para este paciente.",
    };
  }
  if (temMarco) {
    if (!resolved.protocolId) {
      return {
        ok: false,
        error: "Alvo inválido: protocolo não está ativo para este paciente.",
      };
    }
    if (!resolved.milestoneId) {
      return {
        ok: false,
        error:
          "Alvo inválido: marco não encontrado (ou ambíguo) para este domínio.",
      };
    }
  }

  const marcoOriginalId = evidenciaOriginal?.milestoneId ?? null;
  if (marcoOriginalId && resolved.milestoneId) {
    const [tipoOriginal, tipoNovo] = await Promise.all([
      tipoEstruturaDoMarco(tx, marcoOriginalId),
      tipoEstruturaDoMarco(tx, resolved.milestoneId),
    ]);
    if (tipoOriginal && tipoNovo && tipoOriginal !== tipoNovo) {
      return {
        ok: false,
        error:
          "Alvo inválido: reclassificação entre estruturas diferentes não é permitida.",
      };
    }
  }

  return { ok: true, fks: resolved };
}

/**
 * Monta `classificacao_nova` para o `evidence_revision` de reclassificação —
 * espelha a forma canônica de `db/tests/fase4-materializar.int.test.ts`
 * ("recompute retroativo", ~L297): mescla o alvo novo por cima da
 * classificação anterior, preservando os demais campos (ex.: `nivel_ajuda`,
 * `polaridade`). `alvo_resolvido` (as FKs já resolvidas por `validarAlvo`) é a
 * fonte canônica que `materializar.ts` (`rowParaObservacao`) lê para religar
 * a evidência ao stream de segmentação correto — `alvo` (o ref cru enviado
 * pelo coordenador) permanece só para auditoria/exibição.
 */
export function montarClassificacaoNova(
  anterior: unknown,
  novoAlvo: Alvo,
  fksResolvidas: ResolvedFks,
): unknown {
  const base =
    anterior && typeof anterior === "object"
      ? (anterior as Record<string, unknown>)
      : {};
  return {
    ...base,
    alvo: novoAlvo,
    alvo_resolvido: {
      goal_id: fksResolvidas.goalId,
      protocol_id: fksResolvidas.protocolId,
      milestone_id: fksResolvidas.milestoneId,
    },
  };
}
