"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { sessionNote } from "@/db/schema";
import {
  capturarDiario,
  consolidarSessao,
  corrigirEscopoProtocolo,
  registrarAudioLocal,
} from "./logic";

// ─── Wrappers para `useActionState` (resolvem o tenant do request) ────────────

export type CapturarDiarioState = { error?: string; id?: string };
export async function capturarDiarioAction(
  _prev: CapturarDiarioState,
  formData: FormData,
): Promise<CapturarDiarioState> {
  const ctx = await getTenantContext();
  try {
    const r = await capturarDiario(ctx, {
      sessionId: String(formData.get("sessionId") ?? ""),
      texto: String(formData.get("texto") ?? ""),
    });
    if (r.error) return { error: r.error };
    revalidatePath(`/diario/${formData.get("sessionId")}`);
    return { id: r.id };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o terapeuta da sessão registra a captura." };
    console.error("capturarDiarioAction:", err);
    return { error: "Não foi possível salvar a captura." };
  }
}

export type CorrigirEscopoState = { error?: string; ok?: boolean };
export async function corrigirEscopoProtocoloAction(
  _prev: CorrigirEscopoState,
  formData: FormData,
): Promise<CorrigirEscopoState> {
  const ctx = await getTenantContext();
  try {
    const protocolIds = formData.getAll("protocolIds").map(String);
    const r = await corrigirEscopoProtocolo(ctx, {
      sessionId: String(formData.get("sessionId") ?? ""),
      protocolIds,
    });
    if (r.error) return { error: r.error };
    revalidatePath(`/diario/${formData.get("sessionId")}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o terapeuta da sessão ajusta os protocolos." };
    console.error("corrigirEscopoProtocoloAction:", err);
    return { error: "Não foi possível ajustar os protocolos." };
  }
}

export type RegistrarAudioState = { error?: string; id?: string };
export async function registrarAudioLocalAction(
  _prev: RegistrarAudioState,
  formData: FormData,
): Promise<RegistrarAudioState> {
  const ctx = await getTenantContext();
  try {
    const duracaoRaw = formData.get("duracaoSegundos");
    const duracaoSegundos = duracaoRaw ? Number(duracaoRaw) : undefined;
    const r = await registrarAudioLocal(ctx, {
      sessionId: String(formData.get("sessionId") ?? ""),
      duracaoSegundos:
        duracaoSegundos !== undefined && Number.isFinite(duracaoSegundos)
          ? duracaoSegundos
          : undefined,
    });
    if (r.error) return { error: r.error };
    revalidatePath(`/diario/${formData.get("sessionId")}`);
    return { id: r.id };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o terapeuta da sessão registra o áudio." };
    console.error("registrarAudioLocalAction:", err);
    return { error: "Não foi possível registrar o áudio." };
  }
}

export type ConsolidarState = { error?: string; ok?: boolean; numero?: number };
export async function consolidarSessaoAction(
  _prev: ConsolidarState,
  formData: FormData,
): Promise<ConsolidarState> {
  const ctx = await getTenantContext();
  try {
    const r = await consolidarSessao(ctx, {
      sessionId: String(formData.get("sessionId") ?? ""),
      texto: String(formData.get("texto") ?? ""),
    });
    if (r.error) return { error: r.error };
    revalidatePath("/pendencias");
    revalidatePath(`/diario/${formData.get("sessionId")}`);
    return { ok: true, numero: r.numeroSequencial };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o terapeuta da sessão consolida." };
    console.error("consolidarSessaoAction:", err);
    return { error: "Não foi possível consolidar." };
  }
}

// Reprocessamento manual da extração (Fase 3 Plano 3, flow 2.4). Quando o
// pipeline de IA falhou, a nota consolidada permanece salva e uma linha
// `pendente_reprocessamento` sinaliza a falha. Reprocessar = re-disparar a
// extração sobre o MESMO texto já salvo (o terapeuta não redigita nada):
// carregamos a nota e reusamos `consolidarSessao` — como o texto não mudou mas
// há pendência, `deveReextrair` retorna true, então re-chama o provider e
// PRESERVA as linhas já revisadas (mesma Fase C idempotente). Sem novo caminho
// de escrita: reprocessar herda P0, hardening e o gate de provider.
export type ReprocessarState = { error?: string; ok?: boolean };
export async function reprocessarExtracaoAction(
  _prev: ReprocessarState,
  formData: FormData,
): Promise<ReprocessarState> {
  const ctx = await getTenantContext();
  const sessionId = String(formData.get("sessionId") ?? "");
  try {
    const [nota] = await withTenant(ctx, (tx) =>
      tx
        .select({ texto: sessionNote.texto })
        .from(sessionNote)
        .where(
          and(
            eq(sessionNote.sessionId, sessionId),
            eq(sessionNote.tipo, "nota_consolidada"),
          ),
        ),
    );
    if (!nota?.texto) {
      return { error: "Não há nota consolidada para reprocessar." };
    }
    const r = await consolidarSessao(ctx, { sessionId, texto: nota.texto });
    if (r.error) return { error: r.error };
    revalidatePath("/pendencias");
    revalidatePath("/excecoes");
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) {
      return { error: "Só o terapeuta da sessão reprocessa a extração." };
    }
    console.error("reprocessarExtracaoAction:", err);
    return { error: "Não foi possível reprocessar a extração." };
  }
}
