"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { type FaixaDia } from "@/lib/agenda/janela";
import { salvarJanelas } from "./queries";

export type SalvarJanelasState = { error?: string; ok?: boolean };

export async function salvarJanelasAction(_prev: SalvarJanelasState, formData: FormData): Promise<SalvarJanelasState> {
  const ctx = await getTenantContext();
  const terapeutaId = String(formData.get("terapeutaId") ?? "");
  let faixas: FaixaDia[];
  try {
    faixas = JSON.parse(String(formData.get("faixas") ?? "[]"));
  } catch {
    return { error: "Dados de disponibilidade inválidos." };
  }
  try {
    await salvarJanelas(ctx, terapeutaId, faixas);
    revalidatePath(`/equipe/${terapeutaId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Você não tem permissão para editar disponibilidade." };
    console.error("salvarJanelasAction:", err);
    return { error: "Não foi possível salvar. Tente novamente." };
  }
}
