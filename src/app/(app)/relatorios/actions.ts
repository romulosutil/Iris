"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { exportarConvenioBruto, exportarSchema, type ExportarInput } from "./export-logic";
import { previewConvenioBruto } from "./queries";

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
export async function previewConvenioBrutoAction(
  input: ExportarInput,
): Promise<
  | { sessoesRealizadas: number; faltasJustificadas: number; evidenciasAprovadas: number }
  | { error: string }
> {
  const parsed = exportarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const ctx = await getTenantContext();
  return previewConvenioBruto(ctx, parsed.data);
}
