"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { salvarRPD } from "./logic";
import { aprovarRPDSugestao, descartarRPDSugestao } from "./sugestoes";

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

function parseRpdFormData(formData: FormData) {
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
  const evidenciasFavor = parseOptionalString(formData.get("evidenciasFavor"));
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

  return {
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
  };
}

export async function salvarRPDAction(
  patientId: string,
  _prev: SalvarRpdState,
  formData: FormData,
): Promise<SalvarRpdState> {
  const ctx = await getTenantContext();
  try {
    const dados = parseRpdFormData(formData);

    const res = await salvarRPD(ctx, {
      patientId,
      ...dados,
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

// ─── #392 — fila de sugestões de RPD (ponte agente → RPD) ───────────────────

export type AprovarRpdSugestaoState = { error?: string; ok?: boolean };

/**
 * Aprovação de uma sugestão: o formulário reaproveitado (`rpd-form.tsx`) tem
 * os MESMOS campos do caminho manual — ao contrário de `salvarRPDAction`
 * (que só lê o subconjunto que já existia antes de #392), esta action lê
 * todos, porque a aprovação precisa gravar o RPD completo com proveniência
 * (`aprovarRPDSugestao`, RQ4). `extractionId` é `bind`ado pelo componente
 * cliente (`rpd-sugestoes.tsx`), nunca vem do FormData — não é campo editável
 * pelo usuário.
 */
export async function aprovarRPDSugestaoAction(
  extractionId: string,
  patientId: string,
  _prev: AprovarRpdSugestaoState,
  formData: FormData,
): Promise<AprovarRpdSugestaoState> {
  const ctx = await getTenantContext();
  try {
    const dados = parseRpdFormData(formData);

    const res = await aprovarRPDSugestao(ctx, {
      extractionId,
      patientId,
      ...dados,
    });

    if (res.error) {
      // `sugestoes.ts` usa "CONCURRENCY_ERROR" como sentinela interna (2
      // abas/terapeutas aprovando a mesma sugestão) — traduz para o
      // terapeuta em vez de vazar a string técnica.
      return {
        error:
          res.error === "CONCURRENCY_ERROR"
            ? "Esta sugestão já foi tratada (aprovada ou descartada) em outra aba."
            : res.error,
      };
    }

    revalidatePath(`/pacientes/${patientId}/tcc`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) {
      return {
        error:
          "Apenas terapeutas e coordenadores podem aprovar uma sugestão de RPD.",
      };
    }
    console.error("aprovarRPDSugestaoAction:", err);
    return { error: "Não foi possível aprovar a sugestão de RPD." };
  }
}

export type DescartarRpdSugestaoState = { error?: string; ok?: boolean };

export async function descartarRPDSugestaoAction(
  extractionId: string,
  patientId: string,
  _prev: DescartarRpdSugestaoState,
  _formData: FormData,
): Promise<DescartarRpdSugestaoState> {
  const ctx = await getTenantContext();
  try {
    const res = await descartarRPDSugestao(ctx, { extractionId });
    if (res.error) {
      return { error: res.error };
    }
    revalidatePath(`/pacientes/${patientId}/tcc`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) {
      return {
        error:
          "Apenas terapeutas e coordenadores podem descartar uma sugestão de RPD.",
      };
    }
    console.error("descartarRPDSugestaoAction:", err);
    return { error: "Não foi possível descartar a sugestão de RPD." };
  }
}
