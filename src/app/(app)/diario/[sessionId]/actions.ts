"use server";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { audioCapture, sessionNote, sessionProtocolScope } from "@/db/schema";

const capturaSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "Escreva algo antes de salvar."),
});

/**
 * Captura rápida de diário — texto livre do terapeuta durante/após a sessão.
 * O RLS (`session_note_insert`) exige que `ctx.userId` seja o terapeuta dono
 * da sessão; um terapeuta que não é dono cai no catch e recebe mensagem
 * genérica (RLS não deixa distinguir "não existe" de "sem permissão").
 */
export async function capturarDiario(
  ctx: TenantContext,
  input: { sessionId: string; texto: string },
): Promise<{ error?: string; id?: string }> {
  requireRole(ctx, "terapeuta");
  const parsed = capturaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(sessionNote)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          tipo: "captura_rapida",
          texto: parsed.data.texto,
          autorId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: { texto: parsed.data.texto, atualizadoEm: new Date() },
        })
        .returning({ id: sessionNote.id }),
    );
    return { id: row!.id };
  } catch (err) {
    console.error("capturarDiario:", err);
    return { error: "Não foi possível salvar a captura." };
  }
}

const escopoSchema = z.object({
  sessionId: z.string().uuid(),
  protocolIds: z.array(z.string().uuid()).min(1),
});

/**
 * Ajuste manual do escopo de protocolos de uma sessão — o terapeuta corrige
 * quando a inferência automática por disciplina errou. Marca `origem =
 * "ajustado_manualmente"` e `ajustadoPor = ctx.userId` para auditoria; o RLS
 * (`sps_insert`/`sps_update`) barra forjar `ajustadoPor` de outro usuário.
 */
export async function corrigirEscopoProtocolo(
  ctx: TenantContext,
  input: { sessionId: string; protocolIds: string[] },
): Promise<{ error?: string }> {
  requireRole(ctx, "terapeuta");
  const parsed = escopoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    await withTenant(ctx, async (tx) => {
      for (const protocolId of parsed.data.protocolIds) {
        await tx
          .insert(sessionProtocolScope)
          .values({
            sessionId: parsed.data.sessionId,
            protocolId,
            origem: "ajustado_manualmente",
            ajustadoPor: ctx.userId,
          })
          .onConflictDoUpdate({
            target: [sessionProtocolScope.sessionId, sessionProtocolScope.protocolId],
            set: { origem: "ajustado_manualmente", ajustadoPor: ctx.userId },
          });
      }
    });
    return {};
  } catch (err) {
    console.error("corrigirEscopoProtocolo:", err);
    return { error: "Não foi possível ajustar os protocolos." };
  }
}

const audioSchema = z.object({
  sessionId: z.string().uuid(),
  duracaoSegundos: z.number().int().positive().optional(),
});

/**
 * Registra que um áudio foi capturado localmente (IndexedDB) e ainda não foi
 * enviado. O `id` retornado é a chave usada pelo cliente para encontrar o
 * blob local — o upload real do objeto é de fase posterior.
 */
export async function registrarAudioLocal(
  ctx: TenantContext,
  input: { sessionId: string; duracaoSegundos?: number },
): Promise<{ error?: string; id?: string }> {
  requireRole(ctx, "terapeuta");
  const parsed = audioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(audioCapture)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          statusUpload: "rascunho_local",
          duracaoSegundos: parsed.data.duracaoSegundos,
        })
        .returning({ id: audioCapture.id }),
    );
    return { id: row!.id };
  } catch (err) {
    console.error("registrarAudioLocal:", err);
    return { error: "Não foi possível registrar o áudio." };
  }
}
