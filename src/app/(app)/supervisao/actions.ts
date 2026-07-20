"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import type { SinalTipo } from "@/lib/supervisao/sinais";

export type SupervisaoResult = { ok?: boolean; error?: string };
export type SupervisaoState = { ok?: boolean; error?: string };

const baseInputSchema = z.object({
  chaveNatural: z.string().min(1),
  tipo: z.enum(["estagnacao", "regressao", "faltas_excessivas"]),
  patientId: z.string().uuid(),
  goalId: z.string().uuid().nullable(),
  protocolId: z.string().uuid().nullable(),
  detalhe: z.record(z.unknown()),
});

type BaseInput = z.infer<typeof baseInputSchema>;

export async function reconhecerAlerta(
  ctx: TenantContext,
  input: BaseInput,
): Promise<SupervisaoResult> {
  const p = baseInputSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  return withTenant(ctx, async (tx) => {
    // lock por paciente para concorrência
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${p.data.patientId}::text, 0))`
    );

    const existentes = (await tx.execute(
      sql`SELECT status FROM alerta WHERE chave_natural = ${p.data.chaveNatural} AND deletado_em IS NULL`
    )) as unknown as { status: string }[];

    if (existentes.length > 0) return { error: "CONCURRENCY_ERROR" };

    const inserida = (await tx.execute(sql`
      INSERT INTO alerta
        (clinic_id, patient_id, tipo, status, chave_natural, goal_id, protocol_id, detalhe, criado_por, atualizado_por)
      VALUES
        (${ctx.clinicId}::uuid, ${p.data.patientId}::uuid, ${p.data.tipo}, 'reconhecido',
         ${p.data.chaveNatural}, ${p.data.goalId}::uuid, ${p.data.protocolId}::uuid,
         ${JSON.stringify(p.data.detalhe)}::jsonb, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      RETURNING id
    `)) as unknown as { id: string }[];

    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'reconhecimento_alerta', 'alerta',
              ${inserida[0]!.id}::uuid, ${p.data.patientId}::uuid,
              jsonb_build_object('chave_natural', ${p.data.chaveNatural}::text, 'tipo', ${p.data.tipo}::text))
    `);

    return { ok: true };
  });
}

const resolverSchema = baseInputSchema.extend({
  nota: z.string().trim().min(1, "Nota de resolução obrigatória."),
});

export async function resolverAlerta(
  ctx: TenantContext,
  input: BaseInput & { nota: string },
): Promise<SupervisaoResult> {
  const p = resolverSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  return withTenant(ctx, async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${p.data.patientId}::text, 0))`
    );

    const existentes = (await tx.execute(
      sql`SELECT id, status FROM alerta WHERE chave_natural = ${p.data.chaveNatural} AND deletado_em IS NULL`
    )) as unknown as { id: string; status: string }[];

    const existente = existentes[0];

    if (!existente) {
      const inserida = (await tx.execute(sql`
        INSERT INTO alerta
          (clinic_id, patient_id, tipo, status, chave_natural, goal_id, protocol_id, detalhe, nota, criado_por, atualizado_por)
        VALUES
          (${ctx.clinicId}::uuid, ${p.data.patientId}::uuid, ${p.data.tipo}, 'resolvido',
           ${p.data.chaveNatural}, ${p.data.goalId}::uuid, ${p.data.protocolId}::uuid,
           ${JSON.stringify(p.data.detalhe)}::jsonb, ${p.data.nota}, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
        RETURNING id
      `)) as unknown as { id: string }[];

      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
        VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'resolucao_alerta', 'alerta',
                ${inserida[0]!.id}::uuid, ${p.data.patientId}::uuid,
                jsonb_build_object('chave_natural', ${p.data.chaveNatural}::text, 'tipo', ${p.data.tipo}::text, 'nota', ${p.data.nota}::text))
      `);
      return { ok: true };
    }

    if (existente.status === "reconhecido") {
      await tx.execute(sql`
        UPDATE alerta
        SET status = 'resolvido',
            nota = ${p.data.nota},
            atualizado_por = ${ctx.userId}::uuid,
            atualizado_em = now()
        WHERE id = ${existente.id}::uuid
      `);

      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
        VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'resolucao_alerta', 'alerta',
                ${existente.id}::uuid, ${p.data.patientId}::uuid,
                jsonb_build_object('chave_natural', ${p.data.chaveNatural}::text, 'tipo', ${p.data.tipo}::text, 'nota', ${p.data.nota}::text))
      `);
      return { ok: true };
    }

    return { error: "CONCURRENCY_ERROR" };
  });
}

const descartarSchema = baseInputSchema.extend({
  motivo: z.string().trim().min(1, "Motivo de descarte obrigatório."),
});

export async function descartarAlerta(
  ctx: TenantContext,
  input: BaseInput & { motivo: string },
): Promise<SupervisaoResult> {
  const p = descartarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  return withTenant(ctx, async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${p.data.patientId}::text, 0))`
    );

    const existentes = (await tx.execute(
      sql`SELECT id, status FROM alerta WHERE chave_natural = ${p.data.chaveNatural} AND deletado_em IS NULL`
    )) as unknown as { id: string; status: string }[];

    const existente = existentes[0];

    if (!existente) {
      const inserida = (await tx.execute(sql`
        INSERT INTO alerta
          (clinic_id, patient_id, tipo, status, chave_natural, goal_id, protocol_id, detalhe, motivo, criado_por, atualizado_por)
        VALUES
          (${ctx.clinicId}::uuid, ${p.data.patientId}::uuid, ${p.data.tipo}, 'descartado',
           ${p.data.chaveNatural}, ${p.data.goalId}::uuid, ${p.data.protocolId}::uuid,
           ${JSON.stringify(p.data.detalhe)}::jsonb, ${p.data.motivo}, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
        RETURNING id
      `)) as unknown as { id: string }[];

      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
        VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'descarte_alerta', 'alerta',
                ${inserida[0]!.id}::uuid, ${p.data.patientId}::uuid,
                jsonb_build_object('chave_natural', ${p.data.chaveNatural}::text, 'tipo', ${p.data.tipo}::text, 'motivo', ${p.data.motivo}::text))
      `);
      return { ok: true };
    }

    if (existente.status === "reconhecido") {
      await tx.execute(sql`
        UPDATE alerta
        SET status = 'descartado',
            motivo = ${p.data.motivo},
            atualizado_por = ${ctx.userId}::uuid,
            atualizado_em = now()
        WHERE id = ${existente.id}::uuid
      `);

      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
        VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'descarte_alerta', 'alerta',
                ${existente.id}::uuid, ${p.data.patientId}::uuid,
                jsonb_build_object('chave_natural', ${p.data.chaveNatural}::text, 'tipo', ${p.data.tipo}::text, 'motivo', ${p.data.motivo}::text))
      `);
      return { ok: true };
    }

    return { error: "CONCURRENCY_ERROR" };
  });
}

// ─── Wrappers para useActionState ──────────────────────────────────────────

async function comCtx(
  fn: (ctx: TenantContext) => Promise<SupervisaoResult>
): Promise<SupervisaoState> {
  try {
    const ctx = await getTenantContext();
    const r = await fn(ctx);
    if (r.ok) {
      revalidatePath("/supervisao");
      return { ok: true };
    }
    return { error: r.error };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o coordenador supervisiona." };
    console.error("wrapper supervisao:", err);
    return { error: "Erro interno no servidor." };
  }
}

export async function reconhecerAlertaAction(
  _prev: SupervisaoState,
  fd: FormData
): Promise<SupervisaoState> {
  return comCtx((ctx) =>
    reconhecerAlerta(ctx, {
      chaveNatural: String(fd.get("chaveNatural") ?? ""),
      tipo: String(fd.get("tipo") ?? "") as SinalTipo,
      patientId: String(fd.get("patientId") ?? ""),
      goalId: fd.get("goalId") && String(fd.get("goalId")) !== "" ? String(fd.get("goalId")) : null,
      protocolId: fd.get("protocolId") && String(fd.get("protocolId")) !== "" ? String(fd.get("protocolId")) : null,
      detalhe: JSON.parse(String(fd.get("detalhe") ?? "{}")),
    })
  );
}

export async function resolverAlertaAction(
  _prev: SupervisaoState,
  fd: FormData
): Promise<SupervisaoState> {
  return comCtx((ctx) =>
    resolverAlerta(ctx, {
      chaveNatural: String(fd.get("chaveNatural") ?? ""),
      tipo: String(fd.get("tipo") ?? "") as SinalTipo,
      patientId: String(fd.get("patientId") ?? ""),
      goalId: fd.get("goalId") && String(fd.get("goalId")) !== "" ? String(fd.get("goalId")) : null,
      protocolId: fd.get("protocolId") && String(fd.get("protocolId")) !== "" ? String(fd.get("protocolId")) : null,
      detalhe: JSON.parse(String(fd.get("detalhe") ?? "{}")),
      nota: String(fd.get("nota") ?? ""),
    })
  );
}

export async function descartarAlertaAction(
  _prev: SupervisaoState,
  fd: FormData
): Promise<SupervisaoState> {
  return comCtx((ctx) =>
    descartarAlerta(ctx, {
      chaveNatural: String(fd.get("chaveNatural") ?? ""),
      tipo: String(fd.get("tipo") ?? "") as SinalTipo,
      patientId: String(fd.get("patientId") ?? ""),
      goalId: fd.get("goalId") && String(fd.get("goalId")) !== "" ? String(fd.get("goalId")) : null,
      protocolId: fd.get("protocolId") && String(fd.get("protocolId")) !== "" ? String(fd.get("protocolId")) : null,
      detalhe: JSON.parse(String(fd.get("detalhe") ?? "{}")),
      motivo: String(fd.get("motivo") ?? ""),
    })
  );
}
