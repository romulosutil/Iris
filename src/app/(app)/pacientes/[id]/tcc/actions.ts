"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { salvarRPD } from "./logic";
import type { DISTORCOES_COGNITIVAS_OPCOES } from "./constants";

export type SalvarRpdState = { error?: string; ok?: boolean };

export async function salvarRPDAction(
  patientId: string,
  _prev: SalvarRpdState,
  formData: FormData,
): Promise<SalvarRpdState> {
  const ctx = await getTenantContext();
  try {
    const situacao = String(formData.get("situacao") ?? "");
    const pensamentoAutomatico = String(formData.get("pensamentoAutomatico") ?? "");
    const emocao = String(formData.get("emocao") ?? "");
    const intensidadeRaw = formData.get("intensidade");
    const intensidade = intensidadeRaw ? Number(intensidadeRaw) : NaN;
    // Cast de fronteira: FormData é string livre; zod (salvarRpdSchema, em
    // logic.ts) valida em runtime se o valor pertence ao enum e devolve
    // res.error se não pertencer — o cast só satisfaz o tipo estrito de
    // SalvarRpdInput sem reimplementar a validação aqui.
    const distorcaoCognitiva = String(
      formData.get("distorcaoCognitiva") ?? "",
    ) as (typeof DISTORCOES_COGNITIVAS_OPCOES)[number];
    const respostaRacional = String(formData.get("respostaRacional") ?? "");
    const intensidadePosRaw = formData.get("intensidadePos");
    const intensidadePos =
      intensidadePosRaw !== null && intensidadePosRaw !== "" && intensidadePosRaw !== undefined
        ? Number(intensidadePosRaw)
        : null;
    const sessionIdRaw = formData.get("sessionId");
    const sessionId = sessionIdRaw ? String(sessionIdRaw) : null;

    const res = await salvarRPD(ctx, {
      patientId,
      situacao,
      pensamentoAutomatico,
      emocao,
      intensidade,
      distorcaoCognitiva,
      respostaRacional,
      intensidadePos,
      sessionId,
    });

    if (res.error) {
      return { error: res.error };
    }

    revalidatePath(`/pacientes/${patientId}/tcc`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) {
      return { error: "Apenas terapeutas e coordenadores podem salvar um RPD." };
    }
    console.error("salvarRPDAction:", err);
    return { error: "Erro ao salvar o Registro de Pensamentos Distorcidos." };
  }
}
