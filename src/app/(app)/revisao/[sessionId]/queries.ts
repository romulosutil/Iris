import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { extraction, patient, session } from "@/db/schema";
import type { ExtractionSubtipo } from "@/lib/extraction/provider";
import {
  avaliarFriccao,
  type FriccaoNivel,
} from "@/lib/extraction/review-policy";
import { ehProfissionalResponsavel } from "@/lib/sessao/responsavel";
import { chaveDominio, resumirPayload, type LinhaResumo } from "./resumo";

// Item do histórico do paciente (extração já aprovada/editada) exibido lado a
// lado quando a sugestão atual é inconsistente com o passado. Derivado em
// LEITURA (não é um snapshot do que a IA comparou — decisão registrada no
// BACKLOG): mostra o registro efetivo atual do mesmo domínio para o terapeuta
// julgar "regressão real vs. erro de extração".
export type HistoricoItem = {
  id: string;
  trechoFonte: string;
  resumo: LinhaResumo[];
  revisadoEm: Date | null;
};

export type ExtracaoRevisavel = {
  id: string;
  subtipo: ExtractionSubtipo;
  trechoFonte: string;
  confianca: "alta" | "media" | "baixa";
  justificativaConfianca: string | null;
  inconsistenteComHistorico: boolean;
  /** Nível de fricção da §3 (fonte única: avaliarFriccao). */
  nivelFriccao: FriccaoNivel;
  resumo: LinhaResumo[];
  /** Só populado para inconsistentes: histórico do MESMO domínio, mais recente primeiro. */
  historico: HistoricoItem[];
};

export type DadosRevisao = {
  sessionId: string;
  pacienteNome: string | null;
  ehDono: boolean;
  extracoes: ExtracaoRevisavel[];
};

/**
 * Carrega a tela de revisão de uma sessão: as extrações `sugerida` a revisar +
 * (para as inconsistentes) o histórico aprovado do paciente no mesmo domínio.
 * O RLS (`extraction_select` / `session_select`) já escopa por clínica/equipe;
 * aqui só filtramos por estado. Retorna `null` se a sessão não existe ou não é
 * visível ao contexto — a página traduz em `notFound()`.
 */
export async function carregarRevisao(
  ctx: TenantContext,
  sessionId: string,
): Promise<DadosRevisao | null> {
  return withTenant(ctx, async (tx) => {
    const [sess] = await tx
      .select({
        id: session.id,
        patientId: session.patientId,
        terapeutaId: session.terapeutaId,
        atendidoPorId: session.atendidoPorId,
      })
      .from(session)
      .where(eq(session.id, sessionId));
    if (!sess) return null;

    const [pac] = await tx
      .select({ nome: patient.nome })
      .from(patient)
      .where(eq(patient.id, sess.patientId));

    const sugeridas = await tx
      .select({
        id: extraction.id,
        subtipo: extraction.subtipo,
        trechoFonte: extraction.trechoFonte,
        confianca: extraction.confianca,
        justificativaConfianca: extraction.justificativaConfianca,
        inconsistente: extraction.inconsistenteComHistorico,
        payload: extraction.payload,
      })
      .from(extraction)
      .where(
        and(
          eq(extraction.sessionId, sessionId),
          eq(extraction.estado, "sugerida"),
        ),
      )
      .orderBy(desc(extraction.criadoEm));

    // Histórico do paciente só é necessário se houver alguma inconsistente.
    const temInconsistente = sugeridas.some((s) => s.inconsistente);
    const historicoPaciente = temInconsistente
      ? await tx
          .select({
            id: extraction.id,
            subtipo: extraction.subtipo,
            trechoFonte: extraction.trechoFonte,
            payload: extraction.payload,
            revisadoEm: extraction.revisadoEm,
          })
          .from(extraction)
          .innerJoin(session, eq(session.id, extraction.sessionId))
          // extrações já revisadas como registro efetivo (aprovada/editada) do
          // MESMO paciente, exceto as desta própria sessão.
          .where(
            and(
              eq(session.patientId, sess.patientId),
              inArray(extraction.estado, ["aprovada", "editada"]),
              ne(extraction.sessionId, sessionId),
            ),
          )
          .orderBy(desc(extraction.revisadoEm))
      : [];

    const historicoPorDominio = new Map<string, HistoricoItem[]>();
    for (const h of historicoPaciente) {
      const dominio = chaveDominio(h.subtipo, h.payload);
      if (!dominio) continue;
      const lista = historicoPorDominio.get(dominio) ?? [];
      lista.push({
        id: h.id,
        trechoFonte: h.trechoFonte,
        resumo: resumirPayload(h.subtipo, h.payload),
        revisadoEm: h.revisadoEm,
      });
      historicoPorDominio.set(dominio, lista);
    }

    const extracoes: ExtracaoRevisavel[] = sugeridas.map((s) => {
      const { nivel } = avaliarFriccao({
        confianca: s.confianca,
        inconsistenteComHistorico: s.inconsistente,
      });
      const dominio = chaveDominio(s.subtipo, s.payload);
      return {
        id: s.id,
        subtipo: s.subtipo,
        trechoFonte: s.trechoFonte,
        confianca: s.confianca,
        justificativaConfianca: s.justificativaConfianca,
        inconsistenteComHistorico: s.inconsistente,
        nivelFriccao: nivel,
        resumo: resumirPayload(s.subtipo, s.payload),
        historico:
          s.inconsistente && dominio
            ? (historicoPorDominio.get(dominio) ?? [])
            : [],
      };
    });

    return {
      sessionId,
      pacienteNome: pac?.nome ?? null,
      // #539 (D-AUD-7): titular OU substituto — mesma régua da RLS de
      // `extraction_update` (`app_session_profissional_responsavel`, 0142).
      ehDono: ehProfissionalResponsavel(ctx.userId, sess),
      extracoes,
    };
  });
}
