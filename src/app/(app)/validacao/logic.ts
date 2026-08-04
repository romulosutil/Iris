import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { drizzleMaterializarQueries, materializarSnapshot } from "@/lib/evidence/materializar";
import type { Alvo } from "@/lib/evidence/resolver";
import { montarClassificacaoNova, validarAlvo } from "./alvos";

// Ações "confirmar" e "invalidar" da fila de validação do coordenador (Fase 5
// · Fatia 1). Espelha o padrão de `revisao/[sessionId]/actions.ts`: core
// testável recebendo `ctx` + `withTenant`, guarda de concorrência via
// advisory lock por paciente, wrapper `comCtx` que re-deriva o tenant do
// request (o cliente nunca fornece ctx). `evidence`/`evidence_revision` são
// append-only (RLS revoga UPDATE/DELETE) — toda ação aqui é só INSERT.

// ─── Guard de escrita por situação da conta (#163+#159) ────────────────────
// Toda ação daqui insere (`evidence_revision`/`evidence_query`/`audit_log`) e
// remateriazaliza o snapshot — inclusive "confirmar", que parece leitura mas
// grava a revisão. Conta em somente-leitura não avança a fila de validação.
// O wrap fica na exportação do core, não no `actions.ts`, porque os testes de
// integração chamam o core direto com `ctx`.

export type ValidacaoResult = { ok?: boolean; error?: string; bloqueioConta?: BloqueioConta };
export type ValidacaoState = { ok?: boolean; error?: string; bloqueioConta?: BloqueioConta };

type LeituraOk = {
  patientId: string;
  sessionNumero: number;
  classificacaoAtual: unknown;
  milestoneId: string | null;
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
    SELECT ec.id, ec.patient_id, ec.session_numero, ec.classificacao_atual, ec.invalidada, ec.milestone_id
    FROM evidence_current ec WHERE ec.id = ${evidenceId}
  `)) as unknown as {
    id: string;
    patient_id: string;
    session_numero: number;
    classificacao_atual: unknown;
    invalidada: boolean;
    milestone_id: string | null;
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
    milestoneId: e.milestone_id,
  };
}

const evidenceIdSchema = z.object({ evidenceId: z.string().uuid() });

async function confirmarEvidenciaCore(
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

export const confirmarEvidencia = comEscrita(confirmarEvidenciaCore);

const invalidarSchema = z.object({
  evidenceId: z.string().uuid(),
  motivo: z.string().trim().min(1, "Motivo obrigatório."),
});

async function invalidarEvidenciaCore(
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

export const invalidarEvidencia = comEscrita(invalidarEvidenciaCore);

const alvoSchema = z.object({
  goal_id: z.string().nullable().optional(),
  protocol_id: z.string().nullable().optional(),
  dominio_id: z.string().nullable().optional(),
});

const reclassificarSchema = z.object({
  evidenceId: z.string().uuid(),
  novoAlvo: alvoSchema,
  justificativa: z.string().trim().min(1, "Justificativa obrigatória."),
});

async function reclassificarEvidenciaCore(
  ctx: TenantContext,
  input: { evidenceId: string; novoAlvo: Alvo; justificativa: string },
): Promise<ValidacaoResult> {
  const p = reclassificarSchema.safeParse(input);
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

    const validacao = await validarAlvo(
      tx,
      { clinicId: ctx.clinicId, patientId: e.patientId },
      p.data.novoAlvo,
      { milestoneId: e.milestoneId },
    );
    if (!validacao.ok) return { error: validacao.error };

    const classificacaoNova = montarClassificacaoNova(
      e.classificacaoAtual,
      p.data.novoAlvo,
      validacao.fks,
    );

    await tx.execute(sql`
      INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${p.data.evidenceId}, 'reclassificar', ${JSON.stringify(e.classificacaoAtual)}::jsonb, ${JSON.stringify(classificacaoNova)}::jsonb, ${p.data.justificativa}, ${ctx.userId}::uuid)
    `);
    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'reclassificacao', 'evidence', ${p.data.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('de', ${JSON.stringify(e.classificacaoAtual)}::jsonb, 'para', ${JSON.stringify(classificacaoNova)}::jsonb, 'justificativa', ${p.data.justificativa}::text))
    `);
    await materializarSnapshot(drizzleMaterializarQueries(tx), e.patientId, e.sessionNumero);
    return { ok: true };
  });
}

export const reclassificarEvidencia = comEscrita(reclassificarEvidenciaCore);

const devolverSchema = z.object({
  evidenceId: z.string().uuid(),
  pergunta: z.string().trim().min(1, "Pergunta obrigatória."),
});

async function devolverComDuvidaCore(
  ctx: TenantContext,
  input: { evidenceId: string; pergunta: string },
): Promise<ValidacaoResult> {
  const p = devolverSchema.safeParse(input);
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
      INSERT INTO evidence_query (evidence_id, coordenador_id, pergunta)
      VALUES (${p.data.evidenceId}, ${ctx.userId}::uuid, ${p.data.pergunta})
    `);
    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'devolucao', 'evidence', ${p.data.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('pergunta', ${p.data.pergunta}::text))
    `);
    await materializarSnapshot(drizzleMaterializarQueries(tx), e.patientId, e.sessionNumero);
    return { ok: true };
  });
}

export const devolverComDuvida = comEscrita(devolverComDuvidaCore);
