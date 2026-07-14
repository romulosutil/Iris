/**
 * Resolvedor determinístico slug→UUID (Fase 4 · decisão
 * docs/superpowers/specs/2026-07-13-fase-4-resolucao-slug-uuid.md, §2).
 *
 * O agente NÃO emite UUID de protocolo/marco no alvo — só `goal_id` (UUID real,
 * ecoado do contexto), `protocol_id` (slug de `familia`, ex. "vbmapp") e
 * `dominio_id` (slug de domínio, ex. "mando"). `milestone_id` não existe no
 * alvo. Este módulo resolve o que dá para resolver SEM adivinhar:
 *
 *   - goalId: aceita `alvo.goal_id` só se for UUID que existe em `goal` do
 *     paciente (identidade, RLS/tenant já escopam).
 *   - protocolId: soma `protocol.familia = slug` + `patient_protocol` ATIVO
 *     (`desativado_em IS NULL`) do paciente. Determinístico só com EXATAMENTE
 *     1 protocolo ativo dessa família — caso ambíguo (>1) ou inexistente (0)
 *     vira `null`.
 *   - milestoneId: só quando `(protocolId, dominioId)` tem EXATAMENTE 1 marco
 *     (decisão §3 opção C — nível fica indeterminado por ora; nulo é o
 *     resultado esperado quando há N marcos por domínio).
 *
 * Sempre preserva os refs CRUS do agente (`protocolSlug`/`dominioId`/`goalRef`)
 * — são a fonte da verdade para reprocessamento futuro caso a resolução
 * determinística mude (ex.: decisão (A)/(B) do §3).
 *
 * Driver-agnostic: recebe uma `ResolverQueries` (3 lookups) em vez de um
 * cliente de banco concreto — permite chamar tanto de dentro de uma
 * transação Drizzle com RLS (`withTenant`, request-time) quanto de uma
 * conexão owner crua (`postgres.Sql`, backfill/scripts administrativos).
 * Ver `drizzleResolverQueries` / `postgresResolverQueries` abaixo.
 */
import { and, eq, isNull } from "drizzle-orm";
import type postgres from "postgres";
import { goal, milestone, patientProtocol, protocol } from "@/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export type Alvo = {
  goal_id?: string | null;
  protocol_id?: string | null;
  dominio_id?: string | null;
};

export type ResolvedFks = {
  protocolId: string | null;
  goalId: string | null;
  milestoneId: string | null;
  // refs crus do agente, preservados independente de resolução
  protocolSlug: string | null;
  dominioId: string | null;
  goalRef: string | null;
};

/** Interface mínima de consulta que o resolvedor precisa — implementável tanto
 * sobre uma transação Drizzle (RLS aplicado) quanto sobre `postgres.Sql` cru. */
export type ResolverQueries = {
  /** true se `goalId` existir em `goal` para este paciente. */
  goalExists(patientId: string, goalId: string): Promise<boolean>;
  /** ids de `protocol` ativos (via patient_protocol) desta família/clínica/paciente. */
  protocolosAtivos(clinicId: string, patientId: string, familia: string): Promise<string[]>;
  /** ids de `milestone` para (protocolId, dominioId). */
  marcos(protocolId: string, dominioId: string): Promise<string[]>;
};

/** Adapter para uso dentro de `withTenant` (transação Drizzle, RLS aplicado).
 * `tx` é tipado frouxo de propósito (não acoplar este módulo ao tipo interno
 * de transação — `db.transaction()`/`Tx` vivem em `src/db/rls.ts`). */
export function drizzleResolverQueries(tx: any): ResolverQueries {
  return {
    async goalExists(patientId, goalId) {
      const rows = await tx
        .select({ id: goal.id })
        .from(goal)
        .where(and(eq(goal.id, goalId), eq(goal.patientId, patientId)));
      return rows.length > 0;
    },
    async protocolosAtivos(clinicId, patientId, familia) {
      // 🔒 SEGURANÇA: Escopo duplo obrigatório (clinicId + patientId) e validação temporal ativa (desativado_em IS NULL)
      // Garante que o protocolo pertence à clínica e está atualmente ativo e associado ao paciente informado.
      const rows = await tx
        .select({ id: protocol.id })
        .from(protocol)
        .innerJoin(patientProtocol, eq(patientProtocol.protocolId, protocol.id))
        .where(
          and(
            eq(protocol.clinicId, clinicId),
            eq(protocol.familia, familia),
            eq(patientProtocol.patientId, patientId),
            isNull(patientProtocol.desativadoEm),
          ),
        );
      return rows.map((r: { id: string }) => r.id);
    },
    async marcos(protocolId, dominioId) {
      const rows = await tx
        .select({ id: milestone.id })
        .from(milestone)
        .where(and(eq(milestone.protocolId, protocolId), eq(milestone.dominioId, dominioId)));
      return rows.map((r: { id: string }) => r.id);
    },
  };
}

/** Adapter para uso com uma conexão `postgres.Sql` crua (owner/backfill —
 * bypassa RLS, por isso exige `clinicId`/`patientId` explícitos nas queries). */
export function postgresResolverQueries(sql: postgres.Sql): ResolverQueries {
  return {
    async goalExists(patientId, goalId) {
      const rows = await sql`
        SELECT id FROM goal WHERE id = ${goalId} AND patient_id = ${patientId}
      `;
      return rows.length > 0;
    },
    async protocolosAtivos(clinicId, patientId, familia) {
      // 🔒 SEGURANÇA: Escopo duplo obrigatório (clinicId + patientId) e validação temporal ativa (desativado_em IS NULL)
      // Garante que o protocolo pertence à clínica e está atualmente ativo e associado ao paciente informado.
      const rows = await sql`
        SELECT p.id FROM protocol p
        JOIN patient_protocol pp ON pp.protocol_id = p.id
        WHERE p.clinic_id = ${clinicId} AND p.familia = ${familia}
          AND pp.patient_id = ${patientId} AND pp.desativado_em IS NULL
      `;
      return rows.map((r) => r.id as string);
    },
    async marcos(protocolId, dominioId) {
      const rows = await sql`
        SELECT id FROM milestone WHERE protocol_id = ${protocolId} AND dominio_id = ${dominioId}
      `;
      return rows.map((r) => r.id as string);
    },
  };
}

/**
 * Resolve os refs de catálogo de um alvo em UUIDs de banco. Nunca adivinha:
 * qualquer ambiguidade ou ausência vira `null` no campo correspondente.
 */
export async function resolverAlvoParaFks(
  queries: ResolverQueries,
  ctx: { clinicId: string; patientId: string },
  alvo: Alvo,
): Promise<ResolvedFks> {
  const goalRef = typeof alvo.goal_id === "string" ? alvo.goal_id : null;
  const protocolSlug = typeof alvo.protocol_id === "string" ? alvo.protocol_id : null;
  const dominioId = typeof alvo.dominio_id === "string" ? alvo.dominio_id : null;

  let goalId: string | null = null;
  if (isUuid(alvo.goal_id) && (await queries.goalExists(ctx.patientId, alvo.goal_id))) {
    goalId = alvo.goal_id;
  }

  let protocolId: string | null = null;
  if (protocolSlug) {
    const ativos = await queries.protocolosAtivos(ctx.clinicId, ctx.patientId, protocolSlug);
    if (ativos.length === 1) protocolId = ativos[0]!;
  }

  let milestoneId: string | null = null;
  if (protocolId && dominioId) {
    const marcos = await queries.marcos(protocolId, dominioId);
    if (marcos.length === 1) milestoneId = marcos[0]!;
  }

  return { protocolId, goalId, milestoneId, protocolSlug, dominioId, goalRef };
}
