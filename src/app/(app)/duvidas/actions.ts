"use server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { drizzleMaterializarQueries, materializarSnapshot } from "@/lib/evidence/materializar";
import type { Alvo } from "@/lib/evidence/resolver";
import { montarClassificacaoNova, validarAlvo } from "../validacao/alvos";

// "Responder query" — lado do terapeuta (Fase 5 · Fatia 1 · Task 5). Espelha
// o padrão de `validacao/actions.ts`: core `fn(ctx, input)` testável, guarda
// de concorrência via advisory lock por paciente, `withTenant`. Diferente de
// `validacao/actions.ts`, a entrada aqui é o `evidenceQueryId` (não o
// `evidenceId` direto) — primeiro resolvemos evidência+paciente a partir da
// query, DEPOIS travamos.
//
// Ordem de escrita importa (RLS depende disso):
//  1. resolver evidence_query → evidence → patient_id, travar por paciente.
//  2. se `novoAlvo`: validar + INSERT evidence_revision(acao=reclassificar)
//     — `evidence_revision_insert` só permite o terapeuta enquanto a query
//     segue ABERTA (respondido_em IS NULL), então isso tem que vir ANTES do
//     UPDATE que fecha a query.
//  3. UPDATE evidence_query SET resposta_texto, respondido_em=now(),
//     resultante_evidence_revision_id=<id|null> WHERE id=… AND
//     respondido_em IS NULL — a condição extra é a guarda de concorrência
//     (RLS já reforça `respondido_em IS NULL` na USING, mas conferimos
//     rowCount para distinguir "já respondida por outra ação" de "RLS
//     bloqueou por falta de acesso à equipe").
//  4. se o UPDATE afetou 0 linhas → CONCURRENCY_ERROR.
//  5. materializarSnapshot: fechar a query re-inclui a evidência no cômputo.

export type ValidacaoResult = { ok?: boolean; error?: string };
export type ValidacaoState = { ok?: boolean; error?: string };

type EvidenciaDaQuery = {
  evidenceId: string;
  patientId: string;
  sessionNumero: number;
  classificacaoAtual: unknown;
  milestoneId: string | null;
};
type LeituraErro = { erro: "NAO_ENCONTRADA" | "CONCURRENCY_ERROR" };

/**
 * Resolve `evidenceQueryId` → evidência/paciente e trava por paciente
 * (advisory lock), depois re-lê `evidence_current` sob o lock para pegar o
 * estado corrente (mesmo padrão de `lerEvidenciaParaValidar`).
 */
async function lerEvidenciaDaQuery(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  evidenceQueryId: string,
): Promise<EvidenciaDaQuery | LeituraErro> {
  const rows0 = (await tx.execute(sql`
    SELECT eq.id, eq.evidence_id, e.patient_id
    FROM evidence_query eq
    JOIN evidence e ON e.id = eq.evidence_id
    WHERE eq.id = ${evidenceQueryId}
  `)) as unknown as { id: string; evidence_id: string; patient_id: string }[];
  const alvo = rows0[0];
  if (!alvo) return { erro: "NAO_ENCONTRADA" };

  // ⚠️ BLINDAGEM DE ADVISORY LOCK: mesmo padrão de `lerEvidenciaParaValidar`
  // — lock por paciente antes de reler o estado.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${alvo.patient_id}::text, 0))`,
  );

  // Guarda de concorrência: se a query já foi respondida (por outra ação
  // concorrente, ou já foi tratada antes do lock), não prossiga — evita
  // cair no INSERT evidence_revision, que a RLS `evidence_revision_insert`
  // rejeitaria (exige query ABERTA) com um erro cru do Postgres.
  const rowsQ = (await tx.execute(
    sql`SELECT respondido_em FROM evidence_query WHERE id = ${evidenceQueryId}`,
  )) as unknown as { respondido_em: Date | string | null }[];
  if (rowsQ[0]?.respondido_em != null) return { erro: "CONCURRENCY_ERROR" };

  const rows = (await tx.execute(sql`
    SELECT ec.patient_id, ec.session_numero, ec.classificacao_atual, ec.milestone_id
    FROM evidence_current ec WHERE ec.id = ${alvo.evidence_id}
  `)) as unknown as {
    patient_id: string;
    session_numero: number;
    classificacao_atual: unknown;
    milestone_id: string | null;
  }[];
  const e = rows[0];
  if (!e) return { erro: "NAO_ENCONTRADA" };

  return {
    evidenceId: alvo.evidence_id,
    patientId: e.patient_id,
    sessionNumero: e.session_numero,
    classificacaoAtual: e.classificacao_atual,
    milestoneId: e.milestone_id,
  };
}

const alvoSchema = z.object({
  goal_id: z.string().nullable().optional(),
  protocol_id: z.string().nullable().optional(),
  dominio_id: z.string().nullable().optional(),
});

const responderSchema = z.object({
  evidenceQueryId: z.string().uuid(),
  respostaTexto: z.string().trim().min(1, "Resposta obrigatória."),
  novoAlvo: alvoSchema.optional(),
});

export async function responderQuery(
  ctx: TenantContext,
  input: { evidenceQueryId: string; respostaTexto: string; novoAlvo?: Alvo },
): Promise<ValidacaoResult> {
  const p = responderSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  try {
    requireRole(ctx, "terapeuta", "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  return withTenant(ctx, async (tx) => {
    const e = await lerEvidenciaDaQuery(tx, p.data.evidenceQueryId);
    if ("erro" in e) {
      return { error: e.erro === "NAO_ENCONTRADA" ? "Query não encontrada." : "CONCURRENCY_ERROR" };
    }

    let resultanteId: string | null = null;
    let classificacaoNova: unknown = null;
    if (p.data.novoAlvo) {
      const validacao = await validarAlvo(
        tx,
        { clinicId: ctx.clinicId, patientId: e.patientId },
        p.data.novoAlvo,
        { milestoneId: e.milestoneId },
      );
      if (!validacao.ok) return { error: validacao.error };

      classificacaoNova = montarClassificacaoNova(e.classificacaoAtual, p.data.novoAlvo, validacao.fks);

      const revRows = (await tx.execute(sql`
        INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
        VALUES (${e.evidenceId}, 'reclassificar', ${JSON.stringify(e.classificacaoAtual)}::jsonb, ${JSON.stringify(classificacaoNova)}::jsonb, ${p.data.respostaTexto}, ${ctx.userId}::uuid)
        RETURNING id
      `)) as unknown as { id: string }[];
      resultanteId = revRows[0]!.id;
    }

    const updateResult = (await tx.execute(sql`
      UPDATE evidence_query
      SET resposta_texto = ${p.data.respostaTexto},
          respondido_em = now(),
          resultante_evidence_revision_id = ${resultanteId}
      WHERE id = ${p.data.evidenceQueryId} AND respondido_em IS NULL
    `)) as unknown as { rowCount?: number; count?: number };
    const rowCount = updateResult.rowCount ?? updateResult.count ?? 0;
    if (rowCount === 0) return { error: "CONCURRENCY_ERROR" };

    // Atribuição de governança: TODA resposta que fecha uma query precisa
    // registrar quem autorizou — mesmo sem reclassificar, fechar a query
    // re-inclui a evidência no cômputo (materializarSnapshot). Por isso o
    // audit_log é incondicional aqui; só a forma do `detalhe`/`acao` varia
    // conforme houve novoAlvo (paridade com `reclassificarEvidencia`) ou não.
    if (p.data.novoAlvo) {
      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
        VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'reclassificacao', 'evidence', ${e.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('de', ${JSON.stringify(e.classificacaoAtual)}::jsonb, 'para', ${JSON.stringify(classificacaoNova)}::jsonb, 'justificativa', ${p.data.respostaTexto}::text))
      `);
    } else {
      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
        VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'resposta_duvida', 'evidence', ${e.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('resposta', ${p.data.respostaTexto}::text))
      `);
    }

    await materializarSnapshot(drizzleMaterializarQueries(tx), e.patientId, e.sessionNumero);
    return { ok: true };
  });
}

// ─── Wrapper para `useActionState` ─────────────────────────────────────────

async function comCtx(
  fd: FormData,
  fn: (ctx: TenantContext) => Promise<ValidacaoResult>,
): Promise<ValidacaoState> {
  const ctx = await getTenantContext();
  try {
    const r = await fn(ctx);
    if (r.error) return { error: r.error };
    revalidatePath("/duvidas");
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só terapeuta da equipe ou coordenador respondem." };
    console.error("wrapper duvidas:", err);
    return { error: "Não foi possível registrar a resposta." };
  }
}

export async function responderQueryAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  const novoAlvoRaw = String(fd.get("novoAlvo") ?? "");
  return comCtx(fd, (ctx) =>
    responderQuery(ctx, {
      evidenceQueryId: String(fd.get("evidenceQueryId") ?? ""),
      respostaTexto: String(fd.get("respostaTexto") ?? ""),
      novoAlvo: novoAlvoRaw ? (JSON.parse(novoAlvoRaw) as Alvo) : undefined,
    }),
  );
}
