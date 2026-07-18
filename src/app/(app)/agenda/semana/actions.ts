"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import {
  ConflitoError,
  criarAvulsa,
  criarRegra,
  type NovaAvulsa,
  type NovaRegra,
} from "@/app/(app)/agenda/queries";

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
