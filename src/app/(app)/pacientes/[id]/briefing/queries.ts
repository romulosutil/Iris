import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  extraction,
  goal,
  patient,
  reinforcerProfile,
  session,
  sessionSnapshot,
  type sessionEstado,
} from "@/db/schema";
import {
  alertasGraveDe,
  reforcadoresAtuaisDe,
  type AlertaManejo,
  type ReforcadorAtual,
} from "./logic";

export type { AlertaManejo, ReforcadorAtual };

type SessionEstado = (typeof sessionEstado.enumValues)[number];

type ProximaSessao = {
  id: string;
  agendadaPara: Date;
  estado: SessionEstado;
  numeroSequencial: number | null;
};

type LinhaUltimaSessao = {
  chave: string;
  rotulo: string;
  metrica: string;
  isCandidata: boolean;
};

export type UltimaSessao = {
  sessionNumero: number;
  geradoEm: Date;
  linhas: LinhaUltimaSessao[];
  /** Contagem de episódios ABC aprovados/editados na mesma sessão (recorte leve, não recomputa o snapshot). */
  episodiosAbc: number;
};

type MetaAtiva = {
  id: string;
  descricao: string;
  disciplina: string | null;
};

export type BriefingData = {
  paciente: { id: string; nome: string };
  proximaSessao: ProximaSessao | null;
  ultimaSessao: UltimaSessao | null;
  metasAtivas: MetaAtiva[];
  alertasManejo: AlertaManejo[];
  reforcadoresAtuais: ReforcadorAtual[];
};

/** Janela de recência p/ o alerta de manejo (grave, registro_abc). Assumida em 90
 * dias — nada no wireframe/backlog fixa o corte; ajustar com o Rômulo se for
 * curto/longo demais na prática de campo. */
const JANELA_ALERTA_MANEJO_DIAS = 90;

/**
 * Carrega o Briefing Pré-Sessão (fluxos-e-wireframes.md §1.1): as 5 seções da
 * tela escaneável em 30s. RLS (`withTenant`) já escopa por clínica/equipe;
 * aqui só orquestramos as leituras. ÚLTIMA SESSÃO lê o `session_snapshot`
 * MATERIALIZADO (nunca recomputa repertório aqui) — o único recorte adicional
 * é uma contagem leve de episódios ABC da mesma sessão (agregado, não estado
 * clínico derivado).
 */
export async function carregarBriefing(
  ctx: TenantContext,
  patientId: string,
): Promise<BriefingData | null> {
  return withTenant(ctx, async (tx) => {
    const [pac] = await tx
      .select({ nome: patient.nome })
      .from(patient)
      .where(eq(patient.id, patientId));
    if (!pac) return null;

    // Próxima sessão relevante deste paciente (hoje ou futura, ainda não
    // encerrada) — base do header e do "Iniciar sessão". Assunção: a mais
    // próxima no tempo. Uma sessão com check-in feito segue `agendada`
    // (presença é registrada em checkInEm, Agenda 2.0), então continua incluída.
    const [proxima] = await tx
      .select({
        id: session.id,
        agendadaPara: session.agendadaPara,
        estado: session.estado,
        numeroSequencial: session.numeroSequencialPaciente,
      })
      .from(session)
      .where(
        and(eq(session.patientId, patientId), eq(session.estado, "agendada")),
      )
      .orderBy(session.agendadaPara)
      .limit(1);

    // ÚLTIMA SESSÃO: a linha mais recente do snapshot materializado.
    const [snap] = await tx
      .select({
        sessionNumero: sessionSnapshot.sessionNumero,
        repertorioState: sessionSnapshot.repertorioState,
        segmentacao: sessionSnapshot.segmentacao,
        geradoEm: sessionSnapshot.geradoEm,
      })
      .from(sessionSnapshot)
      .where(eq(sessionSnapshot.patientId, patientId))
      .orderBy(desc(sessionSnapshot.sessionNumero))
      .limit(1);

    let ultimaSessao: UltimaSessao | null = null;
    if (snap) {
      const repertorio = (snap.repertorioState ?? {}) as Record<
        string,
        {
          metrica_recente?: unknown;
          contagem?: unknown;
          is_candidata?: boolean;
        }
      >;
      const segmentacao = (snap.segmentacao ?? {}) as Record<
        string,
        Record<
          string,
          { tipo_estrutura?: string; metrica?: unknown; rotulo?: string }
        >
      >;

      const idsGoal = Object.keys(repertorio);
      const metas = idsGoal.length
        ? await tx
            .select({ id: goal.id, descricao: goal.descricao })
            .from(goal)
            .where(inArray(goal.id, idsGoal))
        : [];
      const descricaoPorGoal = new Map(metas.map((m) => [m.id, m.descricao]));

      const linhas: LinhaUltimaSessao[] = idsGoal.map((chave) => {
        const estado = repertorio[chave] ?? {};
        const segPorProtocolo = segmentacao[chave] ?? {};
        const primeiroSeg = Object.values(segPorProtocolo)[0];
        const rotulo =
          descricaoPorGoal.get(chave) ?? primeiroSeg?.rotulo ?? chave;
        const metricaBruta =
          primeiroSeg?.metrica ?? estado.metrica_recente ?? estado.contagem;
        return {
          chave,
          rotulo,
          metrica:
            metricaBruta != null
              ? String(metricaBruta)
              : "sem métrica registrada",
          isCandidata: estado.is_candidata === true,
        };
      });

      // Sessão correspondente ao número do snapshot (p/ contar episódios ABC).
      const [sessAquela] = await tx
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.patientId, patientId),
            eq(session.numeroSequencialPaciente, snap.sessionNumero),
          ),
        );

      let episodiosAbc = 0;
      if (sessAquela) {
        const abcNaSessao = await tx
          .select({ estado: extraction.estado })
          .from(extraction)
          .where(
            and(
              eq(extraction.sessionId, sessAquela.id),
              eq(extraction.subtipo, "registro_abc"),
              inArray(extraction.estado, ["aprovada", "editada"]),
            ),
          );
        episodiosAbc = abcNaSessao.length;
      }

      ultimaSessao = {
        sessionNumero: snap.sessionNumero,
        geradoEm: snap.geradoEm,
        linhas,
        episodiosAbc,
      };
    }

    // METAS DE HOJE: metas ativas do paciente.
    const metasAtivasRows = await tx
      .select({
        id: goal.id,
        descricao: goal.descricao,
        disciplina: goal.disciplina,
      })
      .from(goal)
      .where(and(eq(goal.patientId, patientId), eq(goal.estado, "ativa")))
      .orderBy(goal.criadoEm);

    // ⚠ ALERTA DE MANEJO: registro_abc aprovado/editado, severidade grave,
    // sessões recentes (janela de dias, ver constante acima).
    const desde = new Date(
      Date.now() - JANELA_ALERTA_MANEJO_DIAS * 24 * 60 * 60 * 1000,
    );
    const abcRecentes = await tx
      .select({
        id: extraction.id,
        estado: extraction.estado,
        payload: extraction.payload,
        payloadEditado: extraction.payloadEditado,
        sessionNumero: session.numeroSequencialPaciente,
        revisadoEm: extraction.revisadoEm,
      })
      .from(extraction)
      .innerJoin(session, eq(session.id, extraction.sessionId))
      .where(
        and(
          eq(session.patientId, patientId),
          eq(extraction.subtipo, "registro_abc"),
          inArray(extraction.estado, ["aprovada", "editada"]),
          gte(session.agendadaPara, desde),
        ),
      )
      .orderBy(desc(session.agendadaPara));

    // REFORÇADORES ATUAIS: série completa (patient) — a redução p/ "mais
    // recente por item, sem saciado" é pura (reforcadoresAtuaisDe).
    const reforcadoresRows = await tx
      .select({
        itemAtividade: reinforcerProfile.itemAtividade,
        valencia: reinforcerProfile.valencia,
        sessionNumero: reinforcerProfile.sessionNumero,
      })
      .from(reinforcerProfile)
      .where(eq(reinforcerProfile.patientId, patientId))
      .orderBy(desc(reinforcerProfile.sessionNumero));

    return {
      paciente: { id: patientId, nome: pac.nome },
      proximaSessao: proxima
        ? {
            id: proxima.id,
            agendadaPara: proxima.agendadaPara,
            estado: proxima.estado,
            numeroSequencial: proxima.numeroSequencial,
          }
        : null,
      ultimaSessao,
      metasAtivas: metasAtivasRows,
      alertasManejo: alertasGraveDe(abcRecentes),
      reforcadoresAtuais: reforcadoresAtuaisDe(reforcadoresRows),
    };
  });
}
