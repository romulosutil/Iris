// Núcleo testável do Relatório de Família (Fase 5 · Fatia 4). Espelha
// export-logic.ts: funções ctx-accepting (server-only, NÃO "use server") — o
// ctx vem sempre do servidor via wrapper em actions.ts, nunca do request
// (padrão anti-ctx-forjável, issue #55). Máquina de estado: gerar rascunho
// (IA) → curar (coordenador) → exportar. Spec §6.
import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import type { PdfRenderer } from "@/lib/report/renderer";
import { exportReport } from "@/lib/report/export";
import { buildFamiliaInput } from "@/lib/report/familia/build-input";
import { buildFamiliaHtml } from "@/lib/report/familia/build-html";
import { resolveFamilyReportProvider } from "@/lib/report/familia/provider";
import type {
  FamilyReportDraft,
  PayloadFamilia,
} from "@/lib/report/familia/types";
import { playwrightRenderer } from "@/lib/report/playwright-renderer";

// ─── Schemas de request ──────────────────────────────────────────────────────
export const gerarFamiliaSchema = z.object({
  patientId: z.string().uuid(),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type GerarFamiliaInput = z.infer<typeof gerarFamiliaSchema>;

const draftSchema: z.ZodType<FamilyReportDraft> = z.object({
  conquistaDestaque: z.string().min(1),
  trabalhandoAgora: z.array(z.string()).max(4),
  comoApoiarEmCasa: z.array(z.string()).max(3),
  periodoSemAvancoVisivel: z.boolean(),
  notaHonestidade: z.string().nullable(),
  anexoDados: z.object({
    evidenciasPorMeta: z.array(
      z.object({ meta: z.string(), contagemPeriodo: z.number().int() }),
    ),
    avaliacoesFormaisPeriodo: z.array(z.string()),
  }),
  status: z.literal("rascunho_para_revisao"),
});

export const curarFamiliaSchema = z.object({
  reportId: z.string().uuid(),
  versaoEsperada: z.number().int().positive(),
  draftEditado: draftSchema,
});
export type CurarFamiliaInput = z.infer<typeof curarFamiliaSchema>;

export const exportarFamiliaSchema = z.object({ reportId: z.string().uuid() });
export type ExportarFamiliaInput = z.infer<typeof exportarFamiliaSchema>;

function roleError(err: unknown): { error: string } {
  if (err instanceof RoleError) return { error: err.message };
  throw err;
}

async function clinicaDemo(tx: Tx, clinicId: string): Promise<boolean> {
  const rows = (await tx.execute(sql`
    SELECT is_demo FROM clinic WHERE id = ${clinicId}::uuid
  `)) as unknown as Array<{ is_demo: boolean }>;
  return rows[0]?.is_demo === true;
}

async function nomePaciente(tx: Tx, patientId: string): Promise<string | null> {
  const rows = (await tx.execute(sql`
    SELECT nome FROM patient WHERE id = ${patientId}::uuid
  `)) as unknown as Array<{ nome: string }>;
  return rows[0]?.nome ?? null;
}

// ─── 1. Gerar rascunho (IA) — coordenador OU terapeuta on-team ───────────────
export async function gerarRascunhoFamilia(
  ctx: TenantContext,
  input: GerarFamiliaInput,
): Promise<
  { reportId: string; versao: number; draft: FamilyReportDraft } | { error: string }
> {
  const parsed = gerarFamiliaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador", "terapeuta");
  } catch (err) {
    return roleError(err);
  }
  const { patientId, periodoInicio, periodoFim } = parsed.data;

  return withTenant(ctx, async (tx) => {
    // RLS já escopa o paciente: terapeuta fora da equipe não o enxerga → null.
    const nome = await nomePaciente(tx, patientId);
    if (!nome) return { error: "Paciente não encontrado ou fora do seu acesso." };

    const isDemo = await clinicaDemo(tx, ctx.clinicId);
    const provider = resolveFamilyReportProvider({ isDemo });
    const entrada = await buildFamiliaInput(tx, {
      patientId,
      nomeCrianca: nome,
      periodoInicio,
      periodoFim,
    });
    const iaOriginal = await provider.gerar(entrada);

    const payload: PayloadFamilia = {
      versao: 1,
      crianca: { nome },
      periodo: { inicio: periodoInicio, fim: periodoFim },
      geradoEm: new Date().toISOString(),
      // sempre "stub" até o ClaudeProvider ser habilitado pós-DPA (spec §5)
      provider: "stub",
      iaOriginal,
      curado: null,
    };

    const rows = (await tx.execute(sql`
      INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload, gerado_por_ia)
      VALUES (${ctx.clinicId}::uuid, ${patientId}::uuid, 'familia', ${periodoInicio}::date, ${periodoFim}::date, 'rascunho', ${JSON.stringify(payload)}::jsonb, true)
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    const reportId = rows[0]!.id;

    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'relatorio_rascunho_gerado', 'report', ${reportId}::uuid, ${patientId}::uuid,
              jsonb_build_object('tipo', 'familia'::text))
    `);
    return { reportId, versao: 1, draft: iaOriginal };
  });
}

// ─── 2. Curar (editar + revisar) — só coordenador; trava otimista ────────────
export async function curarFamilia(
  ctx: TenantContext,
  input: CurarFamiliaInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = curarFamiliaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    return roleError(err);
  }
  const { reportId, versaoEsperada, draftEditado } = parsed.data;

  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      UPDATE report
      SET payload = jsonb_set(payload, '{curado}', ${JSON.stringify(draftEditado)}::jsonb, true),
          payload_versao = payload_versao + 1,
          status = 'revisado',
          revisado_por = ${ctx.userId}::uuid
      WHERE id = ${reportId}::uuid AND tipo = 'familia'
        AND status IN ('rascunho', 'revisado')
        AND payload_versao = ${versaoEsperada}
      RETURNING id, patient_id
    `)) as unknown as Array<{ id: string; patient_id: string }>;
    if (rows.length === 0) {
      return {
        error:
          "Não foi possível salvar: o rascunho mudou ou já foi exportado. Recarregue e tente de novo.",
      };
    }
    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'relatorio_revisado', 'report', ${reportId}::uuid, ${rows[0]!.patient_id}::uuid,
              jsonb_build_object('tipo', 'familia'::text))
    `);
    return { ok: true };
  });
}

// ─── 3. Exportar — só coordenador; exige status 'revisado' (gate F9) ─────────
export async function exportarFamilia(
  ctx: TenantContext,
  input: ExportarFamiliaInput,
  renderer: PdfRenderer = playwrightRenderer,
): Promise<{ reportId: string; hash: string } | { error: string }> {
  const parsed = exportarFamiliaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    return roleError(err);
  }
  const { reportId } = parsed.data;

  return withTenant(ctx, async (tx) => {
    // Gate F9 (D6): família só exporta APÓS curadoria humana (status revisado).
    const pre = (await tx.execute(sql`
      SELECT status FROM report WHERE id = ${reportId}::uuid AND tipo = 'familia'
    `)) as unknown as Array<{ status: string }>;
    if (!pre[0]) return { error: "Relatório não encontrado." };
    if (pre[0].status !== "revisado") {
      return {
        error:
          "O relatório precisa ser revisado pelo coordenador antes de exportar.",
      };
    }
    const { hash } = await exportReport(tx, {
      reportId,
      atorId: ctx.userId,
      buildHtml: (pl) => buildFamiliaHtml(pl as PayloadFamilia),
      renderer,
    });
    return { reportId, hash };
  });
}
