"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { salvarRPD } from "./logic";

export type SalvarRpdState = { error?: string; ok?: boolean };

function parseOptionalString(val: FormDataEntryValue | null): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
}

function parseOptionalInt(val: FormDataEntryValue | null): number | null {
  if (val === null || val === undefined || String(val).trim() === "") {
    return null;
  }
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

export async function salvarRPDAction(
  patientId: string,
  _prev: SalvarRpdState,
  formData: FormData,
): Promise<SalvarRpdState> {
  const ctx = await getTenantContext();
  try {
    const situacao = String(formData.get("situacao") ?? "").trim();
    const pensamentoAutomatico = String(
      formData.get("pensamentoAutomatico") ?? "",
    ).trim();
    const emocao = String(formData.get("emocao") ?? "").trim();
    const intensidadeRaw = formData.get("intensidade");
    const intensidade =
      intensidadeRaw !== null &&
      intensidadeRaw !== undefined &&
      String(intensidadeRaw).trim() !== ""
        ? Number(intensidadeRaw)
        : NaN;

    const credibilidadeInicial = parseOptionalInt(
      formData.get("credibilidadeInicial"),
    );
    const evidenciasFavor = parseOptionalString(
      formData.get("evidenciasFavor"),
    );
    const evidenciasContra = parseOptionalString(
      formData.get("evidenciasContra"),
    );
    const respostaRacional = parseOptionalString(
      formData.get("respostaRacional"),
    );
    const credibilidadeAlternativa = parseOptionalInt(
      formData.get("credibilidadeAlternativa"),
    );
    const distorcoesCognitivas = formData
      .getAll("distorcoesCognitivas")
      .map(String)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const comportamentoResultante = parseOptionalString(
      formData.get("comportamentoResultante"),
    );
    const intensidadePos = parseOptionalInt(formData.get("intensidadePos"));
    const sessionId = parseOptionalString(formData.get("sessionId"));

    const res = await salvarRPD(ctx, {
      patientId,
      situacao,
      pensamentoAutomatico,
      emocao,
      intensidade,
      credibilidadeInicial,
      evidenciasFavor,
      evidenciasContra,
      respostaRacional,
      credibilidadeAlternativa,
      distorcoesCognitivas,
      comportamentoResultante,
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
      return {
        error: "Apenas terapeutas e coordenadores podem salvar um RPD.",
      };
    }
    console.error("salvarRPDAction:", err);
    return { error: "Erro ao salvar o Registro de Pensamentos Distorcidos." };
  }
}
