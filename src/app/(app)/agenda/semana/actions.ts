"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import {
  carregarSemana,
  ConflitoError,
  contarFuturasDaRegra,
  criarAvulsa,
  criarRegra,
  encerrarRegra,
  listarPacientes,
  materializarRegra,
  type CarregarSemanaParams,
  type NovaAvulsa,
  type NovaRegra,
  type SemanaCarregada,
} from "@/app/(app)/agenda/queries";
import { horizontePadrao } from "@/lib/agenda/materializar";

export type EstadoAcao = { error?: string; ok?: boolean };

function trata(e: unknown): EstadoAcao {
  if (e instanceof ConflitoError) return { error: e.message };
  if (e instanceof RoleError) return { error: "Sem permissão para alocar." };
  throw e;
}

export async function criarRegraAction(
  _prev: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const ctx = await getTenantContext();
  const dados: NovaRegra = {
    patientId: String(formData.get("patientId")),
    terapeutaId: String(formData.get("terapeutaId")),
    disciplina: String(formData.get("disciplina")),
    diaSemana: Number(formData.get("diaSemana")),
    horaInicio: String(formData.get("horaInicio")),
    duracaoMin: Number(formData.get("duracaoMin")),
    semanaVisivelISO: String(formData.get("semanaVisivelISO")),
    hojeISO: String(formData.get("hojeISO")),
  };
  try {
    await criarRegra(ctx, dados);
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/agenda/semana");
  return { ok: true };
}

/** Leitura reativa fina: o shell client dispara isto no `useEffect` sempre
 * que eixo/semana/entidade mudam. `carregarSemana` já valida tenant+papel
 * internamente — esta action só resolve o contexto e repassa. */
export async function carregarSemanaAction(
  params: CarregarSemanaParams,
): Promise<SemanaCarregada> {
  const ctx = await getTenantContext();
  return carregarSemana(ctx, params);
}

/** Leitura fina p/ busca do combobox de pacientes (debounce fica no client). */
export async function listarPacientesAction(
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  const ctx = await getTenantContext();
  return listarPacientes(ctx, termo);
}

export async function criarAvulsaAction(
  _prev: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const ctx = await getTenantContext();
  const dados: NovaAvulsa = {
    patientId: String(formData.get("patientId")),
    terapeutaId: String(formData.get("terapeutaId")),
    disciplina: String(formData.get("disciplina")),
    tipo: formData.get("tipo") as NovaAvulsa["tipo"],
    dataISO: String(formData.get("dataISO")),
    horaInicio: String(formData.get("horaInicio")),
    duracaoMin: Number(formData.get("duracaoMin")),
    modalidade: (formData.get("modalidade") as NovaAvulsa["modalidade"]) ?? "presencial",
  };
  try {
    await criarAvulsa(ctx, dados);
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/agenda/semana");
  return { ok: true };
}

export type EstadoEstender = EstadoAcao & { geradas?: number; puladas?: number };

export async function estenderAction(
  _prev: EstadoEstender,
  formData: FormData,
): Promise<EstadoEstender> {
  const ctx = await getTenantContext();
  const regraId = String(formData.get("regraId"));
  const hojeISO = String(formData.get("hojeISO"));
  try {
    const { geradas, puladas } = await materializarRegra(ctx, regraId, horizontePadrao(hojeISO));
    revalidatePath("/agenda/semana");
    return { ok: true, geradas, puladas: puladas.length };
  } catch (e) {
    return trata(e);
  }
}

export async function encerrarRegraAction(
  _prev: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const ctx = await getTenantContext();
  try {
    await encerrarRegra(ctx, String(formData.get("regraId")), String(formData.get("ateFimISO")));
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/agenda/semana");
  return { ok: true };
}

/** Leitura fina p/ a confirmação de encerramento (F5): quantas futuras sairão. */
export async function contarFuturasAction(regraId: string, ateFimISO: string): Promise<number> {
  const ctx = await getTenantContext();
  return contarFuturasDaRegra(ctx, regraId, ateFimISO);
}
