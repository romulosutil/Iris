import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { avaliarFriccao } from "@/lib/extraction/review-policy";
import {
  drizzleMaterializarQueries,
  materializarSnapshot,
} from "@/lib/evidence/materializar";
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

export type ValidacaoResult = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
  /** Quantidade aprovada — só populado pela aprovação em lote. */
  aprovadas?: number;
};
export type ValidacaoState = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
  aprovadas?: number;
};

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

  const tratada =
    (
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

type TxDeTenant = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * INSERT da revisão "confirmar" — compartilhado entre a confirmação individual
 * e a aprovação em lote (mesma ação, justificativas/nova classificação
 * diferentes). `evidence_revision` é append-only: só INSERT.
 */
async function inserirRevisaoConfirmar(
  tx: TxDeTenant,
  ctx: TenantContext,
  evidenceId: string,
  args: {
    classificacaoAnterior: unknown;
    classificacaoNova: unknown | null;
    justificativa: string;
  },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
    VALUES (${evidenceId}, 'confirmar', ${JSON.stringify(args.classificacaoAnterior)}::jsonb, ${
      args.classificacaoNova === null
        ? null
        : JSON.stringify(args.classificacaoNova)
    }::jsonb, ${args.justificativa}, ${ctx.userId}::uuid)
  `);
}

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
      return {
        error:
          e.erro === "NAO_ENCONTRADA"
            ? "Evidência não encontrada."
            : "CONCURRENCY_ERROR",
      };
    }
    await inserirRevisaoConfirmar(tx, ctx, p.data.evidenceId, {
      classificacaoAnterior: e.classificacaoAtual,
      classificacaoNova: null,
      justificativa: "Confirmado pelo coordenador.",
    });
    await desarquivarPacienteSeArquivado(
      tx,
      ctx,
      e.patientId,
      "validacao_evidencia",
    );
    return { ok: true };
  });
}

export const confirmarEvidencia = comEscrita(confirmarEvidenciaCore);

// ─── Aprovação em lote (#248) ──────────────────────────────────────────────
// Só evidências de BAIXA fricção entram em lote (confiança alta E consistente
// com o histórico — fonte única: `avaliarFriccao`). A elegibilidade é
// RE-DERIVADA no servidor a partir da `extraction`, nunca confiada ao cliente.
// Atomicidade: UMA transação; qualquer item inelegível/não encontrado/já
// tratado aborta o lote inteiro (throw → rollback do `withTenant`).

// Teto do lote: protege a transação (locks + INSERTs em série) de payloads
// gigantes — acima disso o coordenador aprova em levas.
const LOTE_MAX = 50;

const loteSchema = z.object({
  evidenceIds: z
    .array(z.string().uuid())
    .min(1, "Lote vazio.")
    .max(
      LOTE_MAX,
      `Lote acima do limite de ${LOTE_MAX} evidências — divida em levas menores.`,
    ),
});

/** Sentinela interna: aborta (rollback) o lote e vira `{ error }` na borda. */
class LoteAbortadoError extends Error {}

async function aprovarEvidenciasLoteCore(
  ctx: TenantContext,
  input: { evidenceIds: string[] },
): Promise<ValidacaoResult> {
  const p = loteSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  const ids = [...new Set(p.data.evidenceIds)];

  try {
    return await withTenant(ctx, async (tx) => {
      // 1) Elegibilidade re-derivada da extração, para TODOS os ids, antes de
      // qualquer escrita: alta confiança E consistente (avaliarFriccao.podeLote).
      const elegRows = (await tx.execute(sql`
        SELECT ec.id, ec.patient_id, x.confianca, x.inconsistente_com_historico
        FROM evidence_current ec
        JOIN extraction x ON x.id = ec.extraction_id
        WHERE ec.id IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `)) as unknown as {
        id: string;
        patient_id: string;
        confianca: "alta" | "media" | "baixa";
        inconsistente_com_historico: boolean;
      }[];
      const porId = new Map(elegRows.map((r) => [r.id, r]));
      for (const id of ids) {
        const r = porId.get(id);
        if (!r)
          throw new LoteAbortadoError(
            "Evidência não encontrada — nada foi aplicado.",
          );
        const { podeLote } = avaliarFriccao({
          confianca: r.confianca,
          inconsistenteComHistorico: r.inconsistente_com_historico,
        });
        if (!podeLote) {
          throw new LoteAbortadoError(
            "Lote contém evidência inelegível (exige revisão individual) — nada foi aplicado.",
          );
        }
      }

      // ⚠️ ORDEM DETERMINÍSTICA DE LOCK: os advisory locks são por paciente e
      // adquiridos dentro do loop — se dois lotes concorrentes percorressem os
      // ids na ordem enviada pelo cliente, poderiam travar pacientes em ordens
      // opostas (deadlock). Ordenar por (patient_id, id) garante que qualquer
      // par de lotes adquire os locks na mesma ordem.
      const idsOrdenados = [...ids].sort((a, b) => {
        const pa = porId.get(a)!.patient_id;
        const pb = porId.get(b)!.patient_id;
        return pa < pb ? -1 : pa > pb ? 1 : a < b ? -1 : a > b ? 1 : 0;
      });

      // 2) Confirmação por evidência sob o mesmo lock/guarda de concorrência
      // da confirmação individual.
      const snapshots = new Map<
        string,
        { patientId: string; sessionNumero: number }
      >();
      for (const id of idsOrdenados) {
        const e = await lerEvidenciaParaValidar(tx, id);
        if ("erro" in e) {
          throw new LoteAbortadoError(
            e.erro === "NAO_ENCONTRADA"
              ? "Evidência não encontrada — nada foi aplicado."
              : "Evidência já tratada por outra ação — nada foi aplicado.",
          );
        }
        // Paridade com a confirmação individual: "confirmar" não muda a
        // classificação → `classificacao_nova` fica NULL; justificativa é
        // frase humana (o token de máquina fica só no `detalhe` do audit_log).
        await inserirRevisaoConfirmar(tx, ctx, id, {
          classificacaoAnterior: e.classificacaoAtual,
          classificacaoNova: null,
          justificativa: "Aprovado em lote pelo coordenador.",
        });
        await tx.execute(sql`
          INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
          VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'evidencia_aprovada_lote', 'evidence', ${id}::uuid, ${e.patientId}::uuid, jsonb_build_object('justificativa', 'aprovacao_em_lote', 'lote_tamanho', ${ids.length}::int))
        `);
        snapshots.set(`${e.patientId}|${e.sessionNumero}`, {
          patientId: e.patientId,
          sessionNumero: e.sessionNumero,
        });
      }

      // 3) Efeitos por paciente/sessão, uma vez só: desarquivamento (paridade
      // com a confirmação individual) e rematerialização do snapshot.
      const pacientes = new Set(
        [...snapshots.values()].map((s) => s.patientId),
      );
      for (const patientId of pacientes) {
        await desarquivarPacienteSeArquivado(
          tx,
          ctx,
          patientId,
          "validacao_evidencia",
        );
      }
      for (const s of snapshots.values()) {
        await materializarSnapshot(
          drizzleMaterializarQueries(tx),
          s.patientId,
          s.sessionNumero,
        );
      }

      return { ok: true, aprovadas: ids.length };
    });
  } catch (err) {
    if (err instanceof LoteAbortadoError) return { error: err.message };
    throw err;
  }
}

export const aprovarEvidenciasLote = comEscrita(aprovarEvidenciasLoteCore);

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
      return {
        error:
          e.erro === "NAO_ENCONTRADA"
            ? "Evidência não encontrada."
            : "CONCURRENCY_ERROR",
      };
    }
    await tx.execute(sql`
      INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${p.data.evidenceId}, 'invalidar', ${JSON.stringify(e.classificacaoAtual)}::jsonb, NULL, ${p.data.motivo}, ${ctx.userId}::uuid)
    `);
    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'invalidacao', 'evidence', ${p.data.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('motivo', ${p.data.motivo}::text))
    `);
    await materializarSnapshot(
      drizzleMaterializarQueries(tx),
      e.patientId,
      e.sessionNumero,
    );
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
      return {
        error:
          e.erro === "NAO_ENCONTRADA"
            ? "Evidência não encontrada."
            : "CONCURRENCY_ERROR",
      };
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
    await desarquivarPacienteSeArquivado(
      tx,
      ctx,
      e.patientId,
      "validacao_evidencia",
    );
    await materializarSnapshot(
      drizzleMaterializarQueries(tx),
      e.patientId,
      e.sessionNumero,
    );
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
      return {
        error:
          e.erro === "NAO_ENCONTRADA"
            ? "Evidência não encontrada."
            : "CONCURRENCY_ERROR",
      };
    }
    await tx.execute(sql`
      INSERT INTO evidence_query (evidence_id, coordenador_id, pergunta)
      VALUES (${p.data.evidenceId}, ${ctx.userId}::uuid, ${p.data.pergunta})
    `);
    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'devolucao', 'evidence', ${p.data.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('pergunta', ${p.data.pergunta}::text))
    `);
    await materializarSnapshot(
      drizzleMaterializarQueries(tx),
      e.patientId,
      e.sessionNumero,
    );
    return { ok: true };
  });
}

export const devolverComDuvida = comEscrita(devolverComDuvidaCore);
