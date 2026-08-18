"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  exportarConvenioBruto,
  exportarSchema,
  type ExportarInput,
} from "./export-logic";
import { previewConvenioBruto } from "./queries";
import {
  gerarRascunhoFamilia,
  curarFamilia,
  exportarFamilia,
  type GerarFamiliaInput,
  type CurarFamiliaInput,
  type ExportarFamiliaInput,
} from "./familia-logic";
import {
  gerarRascunhoConvenioNarrativo,
  curarConvenioNarrativo,
  exportarConvenioNarrativo,
  type GerarConvenioNarrativoInput,
  type CurarConvenioNarrativoInput,
  type ExportarConvenioNarrativoInput,
} from "./convenio-narrativo-logic";

/** Wrapper de request — deriva o tenant do servidor. */
export async function exportarConvenioBrutoAction(input: ExportarInput) {
  const ctx = await getTenantContext();
  const res = await exportarConvenioBruto(ctx, input);
  revalidatePath("/relatorios");
  return res;
}

/**
 * Wrapper de request p/ o preview FACTUAL (Task 7 — UI de `/relatorios`).
 * Mesmo schema de validação da exportação; sem `requireRole` explícito aqui
 * porque `previewConvenioBruto` só lê sob RLS (`withTenant`) — não grava, não
 * expõe nada que o papel já não veja na tela (contagens do próprio paciente).
 */
export async function previewConvenioBrutoAction(input: ExportarInput): Promise<
  | {
      sessoesRealizadas: number;
      faltasJustificadas: number;
      evidenciasAprovadas: number;
    }
  | { error: string }
> {
  const parsed = exportarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const ctx = await getTenantContext();
  return previewConvenioBruto(ctx, parsed.data);
}

// ─── Relatório de Família (Fatia 4) — wrappers derivam ctx do servidor ───────
export async function gerarRascunhoFamiliaAction(input: GerarFamiliaInput) {
  const ctx = await getTenantContext();
  const res = await gerarRascunhoFamilia(ctx, input);
  revalidatePath("/relatorios");
  return res;
}

export async function curarFamiliaAction(input: CurarFamiliaInput) {
  const ctx = await getTenantContext();
  const res = await curarFamilia(ctx, input);
  revalidatePath("/relatorios");
  return res;
}

export async function exportarFamiliaAction(input: ExportarFamiliaInput) {
  const ctx = await getTenantContext();
  const res = await exportarFamilia(ctx, input);
  revalidatePath("/relatorios");
  return res;
}

// ─── Relatório Narrativo de Convênio (Fatia 5) — coordenador-only ────────────
export async function gerarRascunhoConvenioNarrativoAction(
  input: GerarConvenioNarrativoInput,
) {
  const ctx = await getTenantContext();
  const res = await gerarRascunhoConvenioNarrativo(ctx, input);
  revalidatePath("/relatorios");
  return res;
}

export async function curarConvenioNarrativoAction(
  input: CurarConvenioNarrativoInput,
) {
  const ctx = await getTenantContext();
  const res = await curarConvenioNarrativo(ctx, input);
  revalidatePath("/relatorios");
  return res;
}

export async function exportarConvenioNarrativoAction(
  input: ExportarConvenioNarrativoInput,
) {
  const ctx = await getTenantContext();
  const res = await exportarConvenioNarrativo(ctx, input);
  revalidatePath("/relatorios");
  return res;
}
