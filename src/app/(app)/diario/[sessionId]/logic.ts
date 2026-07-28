import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
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
import type { ExtractionDraft } from "@/lib/extraction/provider";
import type { AlertaRiscoAgente } from "@/lib/extraction/agent-output-schema";
import { registrarAlertaRisco } from "@/lib/risco/registrar";
import { loadCanonicalContext } from "@/lib/extraction/context-loader";
import { deveReextrair } from "@/lib/extraction/reextraction-policy";

// Draft de fallback quando a extração (LLM) falha: mantém a nota salva e marca
// pendente de reprocessamento (flow 2.4 dos wireframes) — nunca perde o diário.
const PENDENTE_DRAFT: ExtractionDraft = {
  subtipo: "pendente",
  trechoFonte: "",
  confianca: "baixa",
  inconsistenteComHistorico: false,
  parContrasteId: null,
  payload: { motivo: "extracao_falhou_retry" },
  estado: "pendente_reprocessamento",
};

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

  const novoTexto = parsed.data.texto;
  const sid = parsed.data.sessionId;

  try {
    // ── Fase A (transação): grava nota + número, coleta o estado necessário
    //    para decidir a re-extração e monta o contexto canônico do agente.
    const prep = await withTenant(ctx, async (tx) => {
      // texto anterior (antes do upsert) → sabemos se o diário mudou
      const [notaAntiga] = await tx
        .select({ texto: sessionNote.texto })
        .from(sessionNote)
        .where(
          and(
            eq(sessionNote.sessionId, sid),
            eq(sessionNote.tipo, "nota_consolidada"),
          ),
        );
      const textoMudou = (notaAntiga?.texto ?? null) !== novoTexto;

      // 1) grava/atualiza a nota consolidada (upsert na chave única sessão+tipo)
      await tx
        .insert(sessionNote)
        .values({
          sessionId: sid,
          clinicId: ctx.clinicId,
          tipo: "nota_consolidada",
          texto: novoTexto,
          autorId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: { texto: novoTexto, atualizadoEm: new Date() },
        });

      // 2) popula numero_sequencial_paciente só se ainda nulo (idempotente):
      //    próximo inteiro por paciente, resolvido via helper SECURITY DEFINER
      //    (app_proximo_numero_sequencial) — precisa enxergar TODAS as sessões
      //    do paciente na clínica, não só as que o RLS deixa este terapeuta
      //    ver (um terapeuta de cobertura, fora da equipe, subestimaria o
      //    MAX() se calculado sob o próprio RLS). O índice único
      //    `uq_session_numero_por_paciente` fecha a corrida remanescente
      //    entre duas consolidações concorrentes: se o UPDATE colidir, relemos
      //    o número já gravado pela outra transação (idempotente).
      const [sess] = await tx
        .select({ patientId: session.patientId, numero: session.numeroSequencialPaciente })
        .from(session)
        .where(eq(session.id, sid));
      let numero = sess!.numero ?? null;
      if (numero === null) {
        try {
          const upd = await tx.execute(sql`
            UPDATE session SET numero_sequencial_paciente =
              app_proximo_numero_sequencial(${sess!.patientId})
            WHERE id = ${sid} AND numero_sequencial_paciente IS NULL
            RETURNING numero_sequencial_paciente AS numero`);
          const row = (upd as unknown as Array<{ numero: number }>)[0];
          numero = row?.numero ?? sess!.numero ?? null;
        } catch (err) {
          // Corrida: outra consolidação concorrente já gravou o número
          // (violação de uq_session_numero_por_paciente). Relemos o valor
          // já persistido — mantém a operação idempotente.
          if (
            err instanceof Error &&
            "code" in err &&
            (err as { code?: string }).code === "23505"
          ) {
            const [atual] = await tx
              .select({ numero: session.numeroSequencialPaciente })
              .from(session)
              .where(eq(session.id, sid));
            numero = atual?.numero ?? null;
          } else {
            throw err;
          }
        }
      }

      // 3) política de re-extração (P0): não re-chama o LLM nem apaga extrações
      //    já revisadas quando o texto não mudou (e não há pendência).
      const exEstados = await tx
        .select({ estado: extraction.estado })
        .from(extraction)
        .where(eq(extraction.sessionId, sid));
      const reextrair = deveReextrair({
        textoMudou,
        temExtracoes: exEstados.length > 0,
        temPendente: exEstados.some((e) => e.estado === "pendente_reprocessamento"),
      });

      const [cl] = await tx
        .select({ isDemo: clinic.isDemo })
        .from(clinic)
        .where(eq(clinic.id, ctx.clinicId));
      const metas = await tx
        .select({ id: goal.id, descricao: goal.descricao })
        .from(goal)
        .where(
          and(
            eq(goal.clinicId, ctx.clinicId),
            eq(goal.patientId, sess!.patientId),
            eq(goal.estado, "ativa"),
          ),
        );

      // Monta o contrato canônico do agente só se formos re-extrair.
      const contexto = reextrair
        ? await loadCanonicalContext(tx, {
            sessionId: sid,
            patientId: sess!.patientId,
            clinicId: ctx.clinicId,
          })
        : null;

      return {
        numero,
        reextrair,
        isDemo: cl!.isDemo,
        metas,
        contexto,
        patientId: sess!.patientId,
      };
    });

    // Texto inalterado (e sem pendência) → não chama LLM, não apaga nada.
    if (!prep.reextrair) {
      return { numeroSequencial: prep.numero ?? undefined };
    }

    // ── Fase B: chama o provider (LLM) FORA da transação — não segura conexão
    //    nem locks durante a chamada de vários segundos.
    const provider = resolveProvider({ isDemo: prep.isDemo });
    let drafts: ExtractionDraft[];
    let alertaRisco: AlertaRiscoAgente | null = null;
    try {
      const saida = await provider.extrair({
        sessionId: sid,
        clinicId: ctx.clinicId,
        notaConsolidada: novoTexto,
        metasAtivas: prep.metas,
        contextoCanonico: prep.contexto,
      });
      drafts = saida.drafts;
      alertaRisco = saida.alertaRisco;
    } catch (err) {
      console.error("extração falhou (marcando pendente):", err);
      drafts = [PENDENTE_DRAFT];
    }

    // ── Fase C: regrava só sugestões/pendências; PRESERVA linhas já revisadas
    //    (aprovada/editada/descartada, quando existirem — Plano 2).
    await withTenant(ctx, async (tx) => {
      await tx.delete(extraction).where(
        and(
          eq(extraction.sessionId, sid),
          inArray(extraction.estado, ["sugerida", "pendente_reprocessamento"]),
        ),
      );
      if (drafts.length > 0) {
        await tx.insert(extraction).values(
          drafts.map((d) => ({
            sessionId: sid,
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
    });

    // ── Fase D: sinal de risco transversal (#122, R20 / R5-TC).
    //    FORA da fila de validação por exceção do coordenador (V1) e depois da
    //    gravação das extrações, mas em transação própria: um erro ao gravar
    //    extração não pode engolir um alerta de risco, e vice-versa.
    if (alertaRisco) {
      const r = await registrarAlertaRisco(ctx, {
        patientId: prep.patientId,
        sessionId: sid,
        risco: alertaRisco,
      });
      if ("erro" in r) {
        // Não derruba a consolidação (o texto do terapeuta já está salvo), mas
        // devolve o erro para a UI — o terapeuta precisa saber que o alerta
        // não subiu, senão presume que a clínica foi avisada e não foi.
        return { numeroSequencial: prep.numero ?? undefined, error: r.erro };
      }
    }

    return { numeroSequencial: prep.numero ?? undefined };
  } catch (err) {
    console.error("consolidarSessao:", err);
    return { error: "Não foi possível consolidar a sessão." };
  }
}
