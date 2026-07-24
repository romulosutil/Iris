"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import {
  checkInSessao,
  marcarEstado,
  type MarcarEstadoInput,
  type SessionEstado,
} from "./logic";

export type { SessaoDoDia, SessionEstado } from "./logic";

// ─── Wrappers para `useActionState` (resolvem o tenant do request) ────────────

export async function marcarEstadoAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const ctx = await getTenantContext();
  const atendido = String(formData.get("atendidoPorId") ?? "").trim();
  try {
    const r = await marcarEstado(ctx, {
      sessionId: String(formData.get("sessionId") ?? "").trim(),
      estado: formData.get("estado") as SessionEstado,
      justificada: formData.get("justificada") === "true",
      atendidoPorId: atendido === "" ? undefined : atendido,
      modalidade: (formData.get("modalidade") as MarcarEstadoInput["modalidade"]) || undefined,
    });
    if (r.ok) revalidatePath("/agenda");
    return r;
  } catch (err) {
    if (err instanceof RoleError) return { error: "Você não tem permissão para atualizar a sessão." };
    console.error("marcarEstadoAction:", err);
    return { error: "Não foi possível atualizar a sessão." };
  }
}

export async function checkInAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  try {
    const resultado = await checkInSessao(ctx, sessionId);
    if (!resultado.error) revalidatePath("/agenda");
    return resultado;
  } catch (err) {
    console.error("checkInAction: erro inesperado", err);
    return { error: "Não foi possível registrar o check-in." };
  }
}
