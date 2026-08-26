// Núcleo testável do Relatório Narrativo de Convênio (Fase 5 · Fatia 5).
// Espelha familia-logic.ts: funções ctx-accepting (server-only, NÃO
// "use server") — o ctx vem sempre do servidor via wrapper em actions.ts,
// nunca do request (padrão anti-ctx-forjável, issue #55). Máquina de
// estado: gerar rascunho (IA) → curar (coordenador) → exportar. TODAS as
// três ações são coordenador-only (diferente de família, que permite
// terapeuta on-team gerar).
import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import type { PdfRenderer } from "@/lib/report/renderer";
import { exportReport } from "@/lib/report/export";
import { buildConvenioNarrativoInput } from "@/lib/report/convenio-narrativo/build-input";
import { buildConvenioNarrativoHtml } from "@/lib/report/convenio-narrativo/build-html";
import { resolveConvenioNarrativoProvider } from "@/lib/report/convenio-narrativo/provider";
import type {
  CabecalhoConvenio,
  ConvenioNarrativoDraft,
  PayloadConvenioNarrativo,
} from "@/lib/report/convenio-narrativo/types";
import { playwrightRenderer } from "@/lib/report/playwright-renderer";
import { traduzirErroDeConsentimento } from "@/lib/consent/erros";
import { diagnosticarBloqueioDeConsentimentoSeguro } from "@/lib/consent/diagnostico";

// ─── Schemas de request ──────────────────────────────────────────────────────
const cabecalhoSchema: z.ZodType<CabecalhoConvenio> = z.object({
  operadora: z.string().min(1),
  cid: z.string().nullable(),
  finalidade: z.string().min(1),
});

const gerarConvenioNarrativoSchema = z
  .object({
    patientId: z.string().uuid(),
    periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cabecalho: cabecalhoSchema,
  })
  .refine((d) => d.periodoInicio <= d.periodoFim, {
    message: "A data de início deve ser anterior ou igual à data de fim.",
    path: ["periodoInicio"],
  });
export type GerarConvenioNarrativoInput = z.infer<
  typeof gerarConvenioNarrativoSchema
>;

const draftSchema: z.ZodType<ConvenioNarrativoDraft> = z.object({
  resumoClinico: z.string().min(1),
  evolucaoPorDominio: z.array(
    z.object({ dominio: z.string(), narrativa: z.string() }),
  ),
  justificativaContinuidade: z.string().min(1),
  objetivosProximoPeriodo: z.array(z.string()).max(5),
  periodoSemAvancoVisivel: z.boolean(),
  notaHonestidade: z.string().nullable(),
  status: z.literal("rascunho_para_revisao"),
});

const curarConvenioNarrativoSchema = z.object({
  reportId: z.string().uuid(),
  versaoEsperada: z.number().int().positive(),
  cabecalhoEditado: cabecalhoSchema,
  draftEditado: draftSchema,
});
export type CurarConvenioNarrativoInput = z.infer<
  typeof curarConvenioNarrativoSchema
>;

const exportarConvenioNarrativoSchema = z.object({
  reportId: z.string().uuid(),
});
export type ExportarConvenioNarrativoInput = z.infer<
  typeof exportarConvenioNarrativoSchema
>;

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

// ─── 1. Gerar rascunho (IA) — só coordenador ─────────────────────────────────
export async function gerarRascunhoConvenioNarrativo(
  ctx: TenantContext,
  input: GerarConvenioNarrativoInput,
): Promise<
  | { reportId: string; versao: number; draft: ConvenioNarrativoDraft }
  | { error: string }
> {
  const parsed = gerarConvenioNarrativoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    return roleError(err);
  }
  const { patientId, periodoInicio, periodoFim, cabecalho } = parsed.data;

  try {
    return await withTenant(ctx, async (tx) => {
      // RLS já escopa o paciente.
      const nome = await nomePaciente(tx, patientId);
      if (!nome)
        return { error: "Paciente não encontrado ou fora do seu acesso." };

      const isDemo = await clinicaDemo(tx, ctx.clinicId);
      const provider = resolveConvenioNarrativoProvider({ isDemo });
      const entrada = await buildConvenioNarrativoInput(tx, {
        patientId,
        nomePaciente: nome,
        periodoInicio,
        periodoFim,
        cabecalho,
      });
      const iaOriginal = await provider.gerar(entrada);

      const payload: PayloadConvenioNarrativo = {
        versao: 1,
        paciente: { nome },
        periodo: { inicio: periodoInicio, fim: periodoFim },
        cabecalho,
        geradoEm: new Date().toISOString(),
        // sempre "stub" até o GeminiProvider ser implementado (prompt/parsing)
        provider: "stub",
        dossie: entrada.dossie,
        iaOriginal,
        curado: null,
      };

      const rows = (await tx.execute(sql`
      INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload, gerado_por_ia)
      VALUES (${ctx.clinicId}::uuid, ${patientId}::uuid, 'convenio_narrativo', ${periodoInicio}::date, ${periodoFim}::date, 'rascunho', ${JSON.stringify(payload)}::jsonb, true)
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
      const reportId = rows[0]!.id;

      await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'relatorio_rascunho_gerado', 'report', ${reportId}::uuid, ${patientId}::uuid,
              jsonb_build_object('tipo', 'convenio_narrativo'::text))
    `);
      return { reportId, versao: 1, draft: iaOriginal };
    });
  } catch (err) {
    // Tradutor puro primeiro (constraints/RAISE, inequívocos); depois o
    // diagnóstico que PERGUNTA ao banco se algum gate de consentimento explica
    // a negação genérica de RLS. Se ninguém explicar, o erro propaga como
    // propagava antes deste gate — erro não explicado não pode ser engolido.
    const msg =
      traduzirErroDeConsentimento(err) ??
      (await diagnosticarBloqueioDeConsentimentoSeguro(ctx, { patientId }));
    if (msg) return { error: msg };
    throw err;
  }
}

// ─── 2. Curar (editar + revisar) — só coordenador; trava otimista ────────────
export async function curarConvenioNarrativo(
  ctx: TenantContext,
  input: CurarConvenioNarrativoInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = curarConvenioNarrativoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    return roleError(err);
  }
  const { reportId, versaoEsperada, cabecalhoEditado, draftEditado } =
    parsed.data;

  try {
    return await withTenant(ctx, async (tx) => {
      const rows = (await tx.execute(sql`
      UPDATE report
      SET payload = jsonb_set(
            jsonb_set(payload, '{curado}', ${JSON.stringify(draftEditado)}::jsonb, true),
            '{cabecalho}', ${JSON.stringify(cabecalhoEditado)}::jsonb, true
          ),
          payload_versao = payload_versao + 1,
          status = 'revisado',
          revisado_por = ${ctx.userId}::uuid
      WHERE id = ${reportId}::uuid AND tipo = 'convenio_narrativo'
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
              jsonb_build_object('tipo', 'convenio_narrativo'::text))
    `);
      return { ok: true };
    });
  } catch (err) {
    const mensagemConsentimento = traduzirErroDeConsentimento(err);
    if (mensagemConsentimento) return { error: mensagemConsentimento };
    throw err;
  }
}

// ─── 3. Exportar — só coordenador; exige status 'revisado' ───────────────────
export async function exportarConvenioNarrativo(
  ctx: TenantContext,
  input: ExportarConvenioNarrativoInput,
  renderer: PdfRenderer = playwrightRenderer,
): Promise<{ reportId: string; hash: string } | { error: string }> {
  const parsed = exportarConvenioNarrativoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    return roleError(err);
  }
  const { reportId } = parsed.data;

  try {
    return await withTenant(ctx, async (tx) => {
      // Gate: convênio narrativo só exporta APÓS curadoria humana (status revisado).
      const pre = (await tx.execute(sql`
      SELECT status FROM report WHERE id = ${reportId}::uuid AND tipo = 'convenio_narrativo'
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
        buildHtml: (pl) =>
          buildConvenioNarrativoHtml(pl as PayloadConvenioNarrativo),
        renderer,
      });
      return { reportId, hash };
    });
  } catch (err) {
    const mensagemConsentimento = traduzirErroDeConsentimento(err);
    if (mensagemConsentimento) return { error: mensagemConsentimento };
    throw err;
  }
}
