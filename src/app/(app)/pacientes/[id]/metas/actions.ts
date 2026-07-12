"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { goal, goalMilestoneMapping } from "@/db/schema";
import {
  atualizarSchema,
  criarSchema,
  DISCIPLINAS,
  type CriterioDominio,
} from "./schemas";

/**
 * `proxima_revisao_em` é uma coluna `date` — Drizzle espera string YYYY-MM-DD.
 * Ancoramos "hoje + ciclo" em UTC: a data é um marco de agenda de revisão, não
 * um horário — não precisa do fuso da clínica (diferente de `session`).
 */
function proximaRevisaoISO(semanas: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + semanas * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Cria a meta já em `ativa` (wireframe: formulário do critério → "Meta ativa";
 * não há fluxo de edição de rascunho no MVP). Coordenador e terapeuta da equipe
 * criam — o RLS `goal_insert` fecha o tenant/equipe e exige `criado_por =
 * app.user_id`. Mapeamento a marco(s) é opcional (Tema 2: uma meta pode combinar
 * marcos de protocolos diferentes).
 */
export async function criarMeta(
  ctx: TenantContext,
  input: z.input<typeof criarSchema>,
): Promise<{ error?: string; id?: string }> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = criarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const d = parsed.data;
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(goal)
        .values({
          patientId: d.patientId,
          clinicId: ctx.clinicId,
          descricao: d.descricao,
          disciplina: d.disciplina,
          estado: "ativa",
          criterioDominio: d.criterioDominio,
          cicloRevisaoSemanas: d.cicloRevisaoSemanas,
          proximaRevisaoEm: proximaRevisaoISO(d.cicloRevisaoSemanas),
          criadoPor: ctx.userId,
        })
        .returning({ id: goal.id });
      if (d.milestoneIds.length > 0) {
        await tx.insert(goalMilestoneMapping).values(
          d.milestoneIds.map((milestoneId) => ({ goalId: row!.id, milestoneId })),
        );
      }
      return { id: row!.id };
    });
  } catch (err) {
    console.error("criarMeta:", err);
    return { error: "Não foi possível criar a meta." };
  }
}

/**
 * Edita o conteúdo clínico da meta (descrição, disciplina, critério, ciclo).
 * Coordenador e terapeuta da equipe — o RLS `goal_update` fecha tenant/equipe e
 * o GRANT por coluna barra reatribuir a meta a outro paciente. Trocar o ciclo
 * reancora `proxima_revisao_em` a partir de hoje (a revisão passa a valer do
 * novo ritmo). NÃO muda `estado` — transições têm ações próprias.
 */
export async function atualizarMeta(
  ctx: TenantContext,
  input: z.input<typeof atualizarSchema>,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = atualizarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const d = parsed.data;
  try {
    await withTenant(ctx, (tx) =>
      tx
        .update(goal)
        .set({
          descricao: d.descricao,
          disciplina: d.disciplina,
          criterioDominio: d.criterioDominio,
          cicloRevisaoSemanas: d.cicloRevisaoSemanas,
          proximaRevisaoEm: proximaRevisaoISO(d.cicloRevisaoSemanas),
          atualizadoEm: new Date(),
        })
        .where(eq(goal.id, d.goalId)),
    );
    return {};
  } catch (err) {
    console.error("atualizarMeta:", err);
    return { error: "Não foi possível salvar a meta." };
  }
}

// Transições que coordenador OU terapeuta da equipe podem fazer. `dominada` NÃO
// está aqui — é decisão do coordenador (ver marcarDominada). `rascunho` também
// não: uma meta não volta a rascunho depois de ativa.
const TRANSICOES_EQUIPE = ["ativa", "pausada", "descontinuada"] as const;

const transicaoSchema = z.object({
  goalId: z.string().uuid(),
  estado: z.enum(TRANSICOES_EQUIPE),
});

/**
 * Pausa / reativa / descontinua uma meta (coordenador ou terapeuta da equipe).
 * A transição para `dominada` fica fora deste conjunto de propósito: dominar é
 * um julgamento clínico reservado ao coordenador (marcarDominada).
 */
export async function transicionarEstadoMeta(
  ctx: TenantContext,
  input: z.input<typeof transicaoSchema>,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = transicaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    await withTenant(ctx, (tx) =>
      tx
        .update(goal)
        .set({ estado: parsed.data.estado, atualizadoEm: new Date() })
        .where(eq(goal.id, parsed.data.goalId)),
    );
    return {};
  } catch (err) {
    console.error("transicionarEstadoMeta:", err);
    return { error: "Não foi possível mudar o estado da meta." };
  }
}

const dominarSchema = z.object({ goalId: z.string().uuid() });

/**
 * Marca a meta como `dominada` — decisão de domínio, ato do COORDENADOR (fluxo
 * 4.4: "Coordenador decide: dominar / manter / ajustar"). O RLS `goal_update`
 * por si só deixaria um terapeuta da equipe escrever `estado`; o gate de papel é
 * na camada de ação (mesmo padrão do resto do app: RLS isola tenant/dado,
 * requireRole restringe a AÇÃO). Fase posterior liga a máquina de candidatura
 * (`goal_candidacy`) que sugere quais metas o coordenador deve olhar aqui.
 */
export async function marcarDominada(
  ctx: TenantContext,
  input: z.input<typeof dominarSchema>,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  const parsed = dominarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    await withTenant(ctx, (tx) =>
      tx
        .update(goal)
        .set({ estado: "dominada", atualizadoEm: new Date() })
        // Só domina o que está `ativa` — dominar uma meta pausada/descontinuada
        // não faz sentido clínico e blindaria uma requisição forjada.
        .where(and(eq(goal.id, parsed.data.goalId), eq(goal.estado, "ativa"))),
    );
    return {};
  } catch (err) {
    console.error("marcarDominada:", err);
    return { error: "Não foi possível marcar a meta como dominada." };
  }
}

const manterSchema = z.object({ goalId: z.string().uuid() });

/**
 * "Manter ativa" no ciclo de revisão: reancora `proxima_revisao_em` para hoje +
 * ciclo atual, sem mudar o estado. É o ramo "segue ativa, próxima revisão
 * agendada" do fluxo 4.4 quando a meta não é candidata a dominada.
 */
export async function manterMetaAtiva(
  ctx: TenantContext,
  input: z.input<typeof manterSchema>,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = manterSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    await withTenant(ctx, async (tx) => {
      const [g] = await tx
        .select({ ciclo: goal.cicloRevisaoSemanas })
        .from(goal)
        .where(eq(goal.id, parsed.data.goalId));
      if (!g) return;
      await tx
        .update(goal)
        .set({ proximaRevisaoEm: proximaRevisaoISO(g.ciclo), atualizadoEm: new Date() })
        .where(eq(goal.id, parsed.data.goalId));
    });
    return {};
  } catch (err) {
    console.error("manterMetaAtiva:", err);
    return { error: "Não foi possível reagendar a revisão." };
  }
}

// ─── Wrappers para `useActionState` / <form action> (resolvem o tenant) ───────

function parseCriterio(formData: FormData): CriterioDominio | null {
  const n = Number(formData.get("criterioN"));
  const m = Number(formData.get("criterioM"));
  if (!Number.isFinite(n) || !Number.isFinite(m)) return null;
  return { tipo: "n_acertos_m_sessoes", n, m };
}

function parseDisciplina(formData: FormData): (typeof DISCIPLINAS)[number] | undefined {
  const d = String(formData.get("disciplina") ?? "");
  return (DISCIPLINAS as readonly string[]).includes(d)
    ? (d as (typeof DISCIPLINAS)[number])
    : undefined;
}

export type CriarMetaState = { error?: string; ok?: boolean };
export async function criarMetaAction(
  patientId: string,
  _prev: CriarMetaState,
  formData: FormData,
): Promise<CriarMetaState> {
  const ctx = await getTenantContext();
  try {
    const criterio = parseCriterio(formData);
    if (!criterio) return { error: "Preencha os números do critério de domínio." };
    const r = await criarMeta(ctx, {
      patientId,
      descricao: String(formData.get("descricao") ?? ""),
      disciplina: parseDisciplina(formData),
      criterioDominio: criterio,
      cicloRevisaoSemanas: Number(formData.get("cicloRevisaoSemanas")),
      milestoneIds: formData.getAll("milestoneIds").map(String),
    });
    if (r.error) return { error: r.error };
    revalidatePath(`/pacientes/${patientId}/metas`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError)
      return { error: "Só coordenador ou terapeuta da equipe cria metas." };
    console.error("criarMetaAction:", err);
    return { error: "Não foi possível criar a meta." };
  }
}

export async function marcarDominadaAction(
  patientId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await getTenantContext();
  try {
    await marcarDominada(ctx, { goalId: String(formData.get("goalId") ?? "") });
    revalidatePath(`/pacientes/${patientId}/metas`);
  } catch (err) {
    if (err instanceof RoleError) return; // botão só aparece p/ coordenador; ignora forja
    console.error("marcarDominadaAction:", err);
  }
}

export async function manterMetaAtivaAction(
  patientId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await getTenantContext();
  try {
    await manterMetaAtiva(ctx, { goalId: String(formData.get("goalId") ?? "") });
    revalidatePath(`/pacientes/${patientId}/metas`);
  } catch (err) {
    console.error("manterMetaAtivaAction:", err);
  }
}

export async function transicionarEstadoMetaAction(
  patientId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await getTenantContext();
  try {
    await transicionarEstadoMeta(ctx, {
      goalId: String(formData.get("goalId") ?? ""),
      estado: String(formData.get("estado") ?? "") as (typeof TRANSICOES_EQUIPE)[number],
    });
    revalidatePath(`/pacientes/${patientId}/metas`);
  } catch (err) {
    console.error("transicionarEstadoMetaAction:", err);
  }
}
