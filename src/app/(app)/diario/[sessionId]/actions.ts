"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  audioCapture,
  clinic,
  extraction,
  goal,
  session,
  sessionNote,
  sessionProtocolScope,
} from "@/db/schema";
import { resolveProvider } from "@/lib/extraction/provider";

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

const consolidarSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "A nota consolidada não pode ficar vazia."),
});

/**
 * Consolida a sessão: grava a nota final, popula `numero_sequencial_paciente`
 * (só na primeira consolidação — reconsolidar não incrementa) e dispara a
 * costura de extração (`ExtractionProvider`: stub demo gera 'sugerida',
 * produção fica 'pendente_reprocessamento' até a Fase 3 ligar o LLM real).
 *
 * Roda no contexto do terapeuta dono da sessão — `extraction_insert` e
 * `extraction_delete` (RLS) exigem `app_session_terapeuta_id(session_id) =
 * app.user_id`, então `requireRole` sozinho não bastaria sem essa condição.
 */
export async function consolidarSessao(
  ctx: TenantContext,
  input: { sessionId: string; texto: string },
): Promise<{ error?: string; numeroSequencial?: number }> {
  requireRole(ctx, "terapeuta");
  const parsed = consolidarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    return await withTenant(ctx, async (tx) => {
      // 1) grava/atualiza a nota consolidada (upsert na chave única sessão+tipo)
      await tx
        .insert(sessionNote)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          tipo: "nota_consolidada",
          texto: parsed.data.texto,
          autorId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: { texto: parsed.data.texto, atualizadoEm: new Date() },
        });

      // 2) popula numero_sequencial_paciente só se ainda nulo (idempotente):
      //    próximo inteiro por paciente, resolvido no banco.
      const [sess] = await tx
        .select({ patientId: session.patientId, numero: session.numeroSequencialPaciente })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      let numero = sess!.numero ?? null;
      if (numero === null) {
        const upd = await tx.execute(sql`
          UPDATE session SET numero_sequencial_paciente = (
            COALESCE((SELECT MAX(numero_sequencial_paciente) FROM session
                      WHERE patient_id = ${sess!.patientId}), 0) + 1)
          WHERE id = ${parsed.data.sessionId} AND numero_sequencial_paciente IS NULL
          RETURNING numero_sequencial_paciente AS numero`);
        const row = (upd as unknown as Array<{ numero: number }>)[0];
        numero = row?.numero ?? sess!.numero ?? null;
      }

      // 3) dispara a extração via costura (stub demo / null produção).
      const [cl] = await tx
        .select({ isDemo: clinic.isDemo })
        .from(clinic)
        .where(eq(clinic.id, ctx.clinicId));
      const metas = await tx
        .select({ id: goal.id, descricao: goal.descricao })
        .from(goal)
        .where(and(eq(goal.clinicId, ctx.clinicId), eq(goal.estado, "ativa")));
      const provider = resolveProvider({ isDemo: cl!.isDemo });
      const drafts = await provider.extrair({
        sessionId: parsed.data.sessionId,
        clinicId: ctx.clinicId,
        notaConsolidada: parsed.data.texto,
        metasAtivas: metas,
      });
      // regrava extrações desta sessão (consolidação re-roda o provider)
      await tx.delete(extraction).where(eq(extraction.sessionId, parsed.data.sessionId));
      if (drafts.length > 0) {
        await tx.insert(extraction).values(
          drafts.map((d) => ({
            sessionId: parsed.data.sessionId,
            clinicId: ctx.clinicId,
            estado: d.estado,
            subtipo: d.subtipo,
            trechoFonte: d.trechoFonte,
            confianca: d.confianca,
            justificativaConfianca: d.justificativaConfianca,
            inconsistenteComHistorico: d.inconsistenteComHistorico,
            parContrasteId: d.parContrasteId,
            payload: d.payload as object,
          })),
        );
      }
      return { numeroSequencial: numero ?? undefined };
    });
  } catch (err) {
    console.error("consolidarSessao:", err);
    return { error: "Não foi possível consolidar a sessão." };
  }
}

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
