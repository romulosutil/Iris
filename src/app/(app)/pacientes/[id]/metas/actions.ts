"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import {
  criarMeta,
  manterMetaAtiva,
  marcarDominada,
  transicionarEstadoMeta,
  TRANSICOES_EQUIPE,
} from "./logic";
import { DISCIPLINAS, type CriterioDominio } from "./schemas";

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
