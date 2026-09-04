import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDiario } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  audioCapture,
  session,
  sessionNote,
  sessionProtocolScope,
} from "@/db/schema";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import {
  assertPodeDocumentar,
  ProntuarioIncompletoError,
} from "@/lib/patient/assert-pode-documentar";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { mensagemDeConsentimento } from "./diario-comum";

/**
 * Escrita de rotina do diário de sessão: captura rápida, ajuste manual do
 * escopo de protocolos e registro de áudio local (#559, F4 — extraído de
 * `diario/[sessionId]/logic.ts`). O guard de escrita por situação da conta e o
 * tradutor de recusa de consentimento moram em `./diario-comum`.
 */

const capturaSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "Escreva algo antes de salvar."),
  visibilityLevel: z.enum(["multidisciplinary", "discipline_only"]).optional(),
});

/**
 * Captura rápida de diário — texto livre do terapeuta durante/após a sessão.
 * O RLS (`session_note_insert`) exige que `ctx.userId` seja o profissional
 * responsável pela sessão — titular OU substituto designado na agenda
 * (`app_session_profissional_responsavel`, 0143, #539); quem não é cai no
 * catch e recebe mensagem genérica (RLS não deixa distinguir "não existe" de
 * "sem permissão").
 */
async function capturarDiarioCore(
  ctx: TenantContext,
  input: {
    sessionId: string;
    texto: string;
    visibilityLevel?: "multidisciplinary" | "discipline_only";
  },
): Promise<{ error?: string; id?: string; bloqueioConta?: BloqueioConta }> {
  requireDiario(ctx);
  const parsed = capturaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const row = await withTenant(ctx, async (tx) => {
      // T07/T07b — a MESMA leitura que já existia (antes só para o
      // desarquivamento, #174 regra 6): resolve o paciente ANTES de qualquer
      // escrita, na mesma transação da régua e do INSERT. A régua
      // (`assertPodeDocumentar`) precisa correr aqui dentro, e não na action:
      // a action é alcançável sem passar pela página `/sessoes/[id]`, então
      // era a única leitura da regra e nenhuma escrita.
      //
      // Task 7c — só colunas de `session` aqui. O `leftJoin` em `patient` que
      // trazia `clinicalModality` SUMIU, e com ele a ambiguidade que ele
      // criava: sob `patient_select` (RLS por equipe, sem recorte de
      // cobertura) o terapeuta de COBERTURA não lê a linha `patient`, então a
      // modalidade chegava `null` e a régua recusava por "modalidade
      // ausente" um caso clinicamente autorizado. A modalidade agora sai por
      // `app_fatos_prontidao` (migração `0149`), pela MESMA porta e sob o
      // MESMO guard dos seis fatos — quem lê os fatos lê a modalidade, e
      // ninguém mais.
      const [sess] = await tx
        .select({ patientId: session.patientId })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      // Fail-closed. Sem o join, `sess` só falta quando a PRÓPRIA `session` é
      // ilegível — e aí a escrita não pode seguir: o `if (sess)` que existia
      // aqui pulava a régua e caía direto no `insert` abaixo. Erro genérico
      // de propósito: quem não enxerga a sessão não deve aprender pela
      // mensagem se ela existe.
      if (!sess) throw new Error("capturarDiario: sessão ilegível ou ausente");
      await assertPodeDocumentar(ctx, tx, sess.patientId);

      const [nota] = await tx
        .insert(sessionNote)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          tipo: "captura_rapida",
          texto: parsed.data.texto,
          autorId: ctx.userId,
          visibilityLevel: parsed.data.visibilityLevel ?? "multidisciplinary",
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: {
            texto: parsed.data.texto,
            atualizadoEm: new Date(),
            ...(parsed.data.visibilityLevel
              ? { visibilityLevel: parsed.data.visibilityLevel }
              : {}),
          },
        })
        .returning({ id: sessionNote.id });

      // #174 regra 6, na MESMA transação da nota: ou o registro clínico e o
      // desarquivamento existem juntos, ou nenhum dos dois existe. Sem
      // `if (sess)`: o guard fail-closed acima já garantiu a sessão.
      await desarquivarPacienteSeArquivado(
        tx,
        ctx,
        sess.patientId,
        "registro_clinico",
      );

      return nota;
    });
    return { id: row!.id };
  } catch (err) {
    // Repassa intacto para o `actions.ts` traduzir: é recusa de regra de
    // negócio, não falha de infra — `mensagemDeConsentimento` não a explica
    // (não é RLS de consentimento) e `console.error` a trataria como bug.
    if (err instanceof ProntuarioIncompletoError) throw err;
    const msg = await mensagemDeConsentimento(ctx, err, {
      sessionId: parsed.data.sessionId,
    });
    if (msg) return { error: msg };
    logarErroSemPII("capturarDiario:", err);
    return { error: "Não foi possível salvar a captura." };
  }
}

export const capturarDiario = comEscrita(capturarDiarioCore);

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
async function corrigirEscopoProtocoloCore(
  ctx: TenantContext,
  input: { sessionId: string; protocolIds: string[] },
): Promise<{ error?: string; bloqueioConta?: BloqueioConta }> {
  requireDiario(ctx);
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
            target: [
              sessionProtocolScope.sessionId,
              sessionProtocolScope.protocolId,
            ],
            set: { origem: "ajustado_manualmente", ajustadoPor: ctx.userId },
          });
      }

      const [sess] = await tx
        .select({ patientId: session.patientId })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      if (sess) {
        await desarquivarPacienteSeArquivado(
          tx,
          ctx,
          sess.patientId,
          "escopo_protocolo",
        );
      }
    });
    return {};
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, {
      sessionId: parsed.data.sessionId,
    });
    if (msg) return { error: msg };
    logarErroSemPII("corrigirEscopoProtocolo:", err);
    return { error: "Não foi possível ajustar os protocolos." };
  }
}

export const corrigirEscopoProtocolo = comEscrita(corrigirEscopoProtocoloCore);

const audioSchema = z.object({
  sessionId: z.string().uuid(),
  duracaoSegundos: z.number().int().positive().optional(),
});

/**
 * Registra que um áudio foi capturado localmente (IndexedDB) e ainda não foi
 * enviado. O `id` retornado é a chave usada pelo cliente para encontrar o
 * blob local — o upload real do objeto é de fase posterior.
 */
async function registrarAudioLocalCore(
  ctx: TenantContext,
  input: { sessionId: string; duracaoSegundos?: number },
): Promise<{ error?: string; id?: string; bloqueioConta?: BloqueioConta }> {
  requireDiario(ctx);
  const parsed = audioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const row = await withTenant(ctx, async (tx) => {
      const [audioRow] = await tx
        .insert(audioCapture)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          statusUpload: "rascunho_local",
          duracaoSegundos: parsed.data.duracaoSegundos,
        })
        .returning({ id: audioCapture.id });

      const [sess] = await tx
        .select({ patientId: session.patientId })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      if (sess) {
        await desarquivarPacienteSeArquivado(
          tx,
          ctx,
          sess.patientId,
          "audio_local",
        );
      }

      return audioRow;
    });
    return { id: row!.id };
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, {
      sessionId: parsed.data.sessionId,
    });
    if (msg) return { error: msg };
    logarErroSemPII("registrarAudioLocal:", err);
    return { error: "Não foi possível registrar o áudio." };
  }
}

// Grava linha em `audio_capture` (mesmo que o blob ainda seja local) — é
// escrita, entra no guard.
export const registrarAudioLocal = comEscrita(registrarAudioLocalCore);
