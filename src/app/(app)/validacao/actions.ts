"use server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { drizzleMaterializarQueries, materializarSnapshot } from "@/lib/evidence/materializar";

// Ações "confirmar" e "invalidar" da fila de validação do coordenador (Fase 5
// · Fatia 1). Espelha o padrão de `revisao/[sessionId]/actions.ts`: core
// testável recebendo `ctx` + `withTenant`, guarda de concorrência via
// advisory lock por paciente, wrapper `comCtx` que re-deriva o tenant do
// request (o cliente nunca fornece ctx). `evidence`/`evidence_revision` são
// append-only (RLS revoga UPDATE/DELETE) — toda ação aqui é só INSERT.

export type ValidacaoResult = { ok?: boolean; error?: string };
export type ValidacaoState = { ok?: boolean; error?: string };

type LeituraOk = {
  patientId: string;
  sessionNumero: number;
  classificacaoAtual: unknown;
};
type LeituraErro = { erro: "NAO_ENCONTRADA" | "CONCURRENCY_ERROR" };

/**
 * Lê `evidence_current` sob advisory lock (por paciente) e re-checa que a
 * evidência ainda está elegível para tratamento — guarda de concorrência:
 * se já foi invalidada, já tem `evidence_revision`, ou tem `evidence_query`
 * aberta, outra ação já a tratou (ou está tratando) → `CONCURRENCY_ERROR`.
 */
async function lerEvidenciaParaValidar(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  evidenceId: string,
): Promise<LeituraOk | LeituraErro> {
  const rows0 = (await tx.execute(
    sql`SELECT patient_id FROM evidence WHERE id = ${evidenceId}`,
  )) as unknown as { patient_id: string }[];
  const alvo = rows0[0];
  if (!alvo) return { erro: "NAO_ENCONTRADA" };

  // ⚠️ BLINDAGEM DE ADVISORY LOCK: lock por paciente para serializar
  // validações concorrentes (mesmo padrão de `inserirEvidenciasOnApprove`).
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${alvo.patient_id}::text, 0))`,
  );

  const rows = (await tx.execute(sql`
    SELECT ec.id, ec.patient_id, ec.session_numero, ec.classificacao_atual, ec.invalidada
    FROM evidence_current ec WHERE ec.id = ${evidenceId}
  `)) as unknown as {
    id: string;
    patient_id: string;
    session_numero: number;
    classificacao_atual: unknown;
    invalidada: boolean;
  }[];
  const e = rows[0];
  if (!e) return { erro: "NAO_ENCONTRADA" };
  if (e.invalidada) return { erro: "CONCURRENCY_ERROR" };

  const tratada = (
    (await tx.execute(sql`
      SELECT 1 FROM evidence_revision WHERE evidence_id = ${evidenceId}
      UNION ALL
      SELECT 1 FROM evidence_query WHERE evidence_id = ${evidenceId} AND respondido_em IS NULL
      LIMIT 1
    `)) as unknown as unknown[]
  ).length > 0;
  if (tratada) return { erro: "CONCURRENCY_ERROR" };

  return {
    patientId: e.patient_id,
    sessionNumero: e.session_numero,
    classificacaoAtual: e.classificacao_atual,
  };
}

const evidenceIdSchema = z.object({ evidenceId: z.string().uuid() });

export async function confirmarEvidencia(
  ctx: TenantContext,
  input: { evidenceId: string },
): Promise<ValidacaoResult> {
  const p = evidenceIdSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  return withTenant(ctx, async (tx) => {
    const e = await lerEvidenciaParaValidar(tx, p.data.evidenceId);
    if ("erro" in e) {
      return { error: e.erro === "NAO_ENCONTRADA" ? "Evidência não encontrada." : "CONCURRENCY_ERROR" };
    }
    await tx.execute(sql`
      INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${p.data.evidenceId}, 'confirmar', ${JSON.stringify(e.classificacaoAtual)}::jsonb, NULL, 'Confirmado pelo coordenador.', ${ctx.userId}::uuid)
    `);
    return { ok: true };
  });
}

const invalidarSchema = z.object({
  evidenceId: z.string().uuid(),
  motivo: z.string().trim().min(1, "Motivo obrigatório."),
});

export async function invalidarEvidencia(
  ctx: TenantContext,
  input: { evidenceId: string; motivo: string },
): Promise<ValidacaoResult> {
  const p = invalidarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  return withTenant(ctx, async (tx) => {
    const e = await lerEvidenciaParaValidar(tx, p.data.evidenceId);
    if ("erro" in e) {
      return { error: e.erro === "NAO_ENCONTRADA" ? "Evidência não encontrada." : "CONCURRENCY_ERROR" };
    }
    await tx.execute(sql`
      INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${p.data.evidenceId}, 'invalidar', ${JSON.stringify(e.classificacaoAtual)}::jsonb, NULL, ${p.data.motivo}, ${ctx.userId}::uuid)
    `);
    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'invalidacao', 'evidence', ${p.data.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('motivo', ${p.data.motivo}::text))
    `);
    await materializarSnapshot(drizzleMaterializarQueries(tx), e.patientId, e.sessionNumero);
    return { ok: true };
  });
}

// ─── Wrappers para `useActionState` ────────────────────────────────────────

async function comCtx(
  fd: FormData,
  fn: (ctx: TenantContext) => Promise<ValidacaoResult>,
): Promise<ValidacaoState> {
  const ctx = await getTenantContext();
  try {
    const r = await fn(ctx);
    if (r.error) return { error: r.error };
    revalidatePath("/validacao");
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o coordenador valida." };
    console.error("wrapper validação:", err);
    return { error: "Não foi possível registrar a validação." };
  }
}

export async function confirmarEvidenciaAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) => confirmarEvidencia(ctx, { evidenceId: String(fd.get("evidenceId") ?? "") }));
}

export async function invalidarEvidenciaAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) =>
    invalidarEvidencia(ctx, {
      evidenceId: String(fd.get("evidenceId") ?? ""),
      motivo: String(fd.get("motivo") ?? ""),
    }),
  );
}
