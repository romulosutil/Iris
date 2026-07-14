import "server-only";
import { and, desc, eq, gte, lte, inArray, or, isNull, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  sessionSnapshot,
  goal,
  milestone,
  patientProtocol,
  protocol,
  evidence,
  appUser,
  session,
} from "@/db/schema";
import { computarDadosEspectro, type DadosEixoRadar, type MilestoneMetadata, type GoalMetadata } from "@/lib/evidence/espectro";
import { calcularDelta, verificarProtocoloMudou, type DeltaSessao } from "./logic";

export interface TimelineSnapshot {
  sessionNumero: number;
  geradoEm: Date;
  repertorioState: any;
  segmentacao: any;
  espectro: DadosEixoRadar[];
}

export interface TimelineData {
  snapshots: TimelineSnapshot[];
  metasAtivas: Array<{ id: string; descricao: string; disciplina: string | null }>;
  protocolosAtivos: Array<{ id: string; nome: string; disciplina: string }>;
  milestonesAtivos: Array<{
    id: string;
    protocolId: string;
    dominioId: string;
    nome: string;
    nivel: string | null;
    tipoEstrutura: string;
    ordem: number | null;
  }>;
}

/**
 * Carrega a timeline completa do paciente (snapshots históricos + dados de espectro).
 * Leitura escopada por RLS (withTenant).
 */
export async function carregarTimeline(
  ctx: TenantContext,
  patientId: string
): Promise<TimelineData | null> {
  return withTenant(ctx, async (tx) => {
    // 1. Carrega os snapshots em ordem decrescente de número
    const snaps = await tx
      .select({
        sessionNumero: sessionSnapshot.sessionNumero,
        repertorioState: sessionSnapshot.repertorioState,
        segmentacao: sessionSnapshot.segmentacao,
        geradoEm: sessionSnapshot.geradoEm,
      })
      .from(sessionSnapshot)
      .where(eq(sessionSnapshot.patientId, patientId))
      .orderBy(desc(sessionSnapshot.sessionNumero));

    // 2. Carrega TODAS as metas do paciente (ativas e concluídas) p/ recálculo histórico preciso
    const metas = await tx
      .select({
        id: goal.id,
        descricao: goal.descricao,
        disciplina: goal.disciplina,
        estado: goal.estado,
      })
      .from(goal)
      .where(eq(goal.patientId, patientId));

    // 3. Carrega TODOS os protocolos (ativos e antigos) e seus milestones
    const PP = await tx
      .select({
        id: protocol.id,
        nome: protocol.nome,
        disciplina: protocol.disciplina,
        taxonomiaAjuda: protocol.taxonomiaAjuda,
        desativadoEm: patientProtocol.desativadoEm,
      })
      .from(patientProtocol)
      .innerJoin(protocol, eq(patientProtocol.protocolId, protocol.id))
      .where(eq(patientProtocol.patientId, patientId));

    const protocolIds = PP.map((p) => p.id);
    const milestones = protocolIds.length
      ? await tx
          .select({
            id: milestone.id,
            protocolId: milestone.protocolId,
            dominioId: milestone.dominioId,
            tipoEstrutura: milestone.tipoEstrutura,
            nome: milestone.nome,
            nivel: milestone.nivel,
            ordem: milestone.ordem,
          })
          .from(milestone)
          .where(inArray(milestone.protocolId, protocolIds))
      : [];

    // 4. Constrói o dicionário de metadados de milestones para o cômputo do Espectro
    const PPMap = new Map(PP.map((p) => [p.id, p]));
    const mapeamentoMilestones: Record<string, MilestoneMetadata> = {};
    for (const m of milestones) {
      const p = PPMap.get(m.protocolId);
      const taxonomia = (p?.taxonomiaAjuda ?? []) as string[];
      mapeamentoMilestones[m.id] = {
        dominioId: m.dominioId,
        protocolId: m.protocolId,
        tipoEstrutura: m.tipoEstrutura as MilestoneMetadata["tipoEstrutura"],
        totalNiveisAjuda: Math.max(0, taxonomia.length - 1),
      };
    }

    const goalsMeta: GoalMetadata[] = metas.map((m) => ({
      id: m.id,
      disciplina: m.disciplina,
    }));

    // 5. Mapeia cada snapshot e anexa o espectro pré-calculado
    const snapshots: TimelineSnapshot[] = snaps.map((s) => {
      const rep = (s.repertorioState ?? {}) as any;
      const seg = (s.segmentacao ?? {}) as any;
      const espectro = computarDadosEspectro(rep, mapeamentoMilestones, goalsMeta);

      return {
        sessionNumero: s.sessionNumero,
        geradoEm: s.geradoEm,
        repertorioState: rep,
        segmentacao: seg,
        espectro,
      };
    });

    // Filtra em memória para o retorno dos eixos que estão ATIVOS HOJE
    const metasAtivas = metas
      .filter((m) => m.estado === "ativa")
      .map((m) => ({ id: m.id, descricao: m.descricao, disciplina: m.disciplina }));

    const activeProtocolIds = PP
      .filter((p) => p.desativadoEm === null)
      .map((p) => p.id);

    const protocolosAtivos = PP
      .filter((p) => p.desativadoEm === null)
      .map((p) => ({ id: p.id, nome: p.nome, disciplina: p.disciplina }));

    const milestonesAtivos = milestones
      .filter((m) => activeProtocolIds.includes(m.protocolId))
      .map((m) => ({
        id: m.id,
        protocolId: m.protocolId,
        dominioId: m.dominioId,
        nome: m.nome,
        nivel: m.nivel,
        tipoEstrutura: m.tipoEstrutura,
        ordem: m.ordem,
      }));

    return {
      snapshots,
      metasAtivas,
      protocolosAtivos,
      milestonesAtivos,
    };
  });
}

/**
 * Helper interno para obter o snapshot de uma sessão sem iniciar uma nova transação / withTenant.
 */
async function obterSnapshotAsOf(
  tx: any,
  patientId: string,
  sessionNumero: number
) {
  const [snap] = await tx
    .select({
      sessionNumero: sessionSnapshot.sessionNumero,
      repertorioState: sessionSnapshot.repertorioState,
      segmentacao: sessionSnapshot.segmentacao,
      geradoEm: sessionSnapshot.geradoEm,
    })
    .from(sessionSnapshot)
    .where(
      and(
        eq(sessionSnapshot.patientId, patientId),
        eq(sessionSnapshot.sessionNumero, sessionNumero)
      )
    )
    .limit(1);
  return snap || null;
}

/**
 * Carrega o snapshot de uma sessão específica.
 */
export async function carregarSnapshotAsOf(
  ctx: TenantContext,
  patientId: string,
  sessionNumero: number
) {
  return withTenant(ctx, async (tx) => {
    return obterSnapshotAsOf(tx, patientId, sessionNumero);
  });
}

/**
 * Helper interno para resolver descrições e nomes legíveis de metas e marcos
 * a partir de seus IDs obtidos do snapshot/delta.
 */
async function resolverMetasEMilestones(tx: any, goalIds: string[]) {
  if (!goalIds.length) {
    return { metas: [], milestones: [] };
  }

  const metasResolvidas = await tx
    .select({ id: goal.id, descricao: goal.descricao, disciplina: goal.disciplina })
    .from(goal)
    .where(inArray(goal.id, goalIds));

  const milestonesResolvidos = await tx
    .select({ id: milestone.id, nome: milestone.nome, dominioId: milestone.dominioId })
    .from(milestone)
    .where(inArray(milestone.id, goalIds));

  return {
    metas: metasResolvidas,
    milestones: milestonesResolvidos,
  };
}

/**
 * Carrega e calcula o delta da sessão N com a sessão anterior N-1.
 */
export async function carregarDeltaSessao(
  ctx: TenantContext,
  patientId: string,
  sessionNumero: number
) {
  return withTenant(ctx, async (tx) => {
    const snapB = await obterSnapshotAsOf(tx, patientId, sessionNumero);
    const snapA =
      sessionNumero > 1
        ? await obterSnapshotAsOf(tx, patientId, sessionNumero - 1)
        : null;

    const stateA = snapA ? snapA.repertorioState : null;
    const stateB = snapB ? snapB.repertorioState : null;

    const delta = calcularDelta(stateA, stateB);

    const goalIds = delta.itens.map((i) => i.id);
    const { metas, milestones } = await resolverMetasEMilestones(tx, goalIds);

    return {
      delta,
      metas,
      milestones,
    };
  });
}

/**
 * Carrega a comparação detalhada de duas sessões com o guard G7.
 * Enforça a comparação cronológica (menor -> maior) para evitar reversão de deltas.
 */
export async function carregarComparacao(
  ctx: TenantContext,
  patientId: string,
  sessaoN: number,
  sessaoM: number
) {
  return withTenant(ctx, async (tx) => {
    const sessaoMenor = Math.min(sessaoN, sessaoM);
    const sessaoMaior = Math.max(sessaoN, sessaoM);

    const snapAntigo = await obterSnapshotAsOf(tx, patientId, sessaoMenor);
    const snapNovo = await obterSnapshotAsOf(tx, patientId, sessaoMaior);

    if (!snapAntigo || !snapNovo) {
      return null;
    }

    const delta = calcularDelta(snapAntigo.repertorioState, snapNovo.repertorioState);
    const protocoloMudou = verificarProtocoloMudou(snapAntigo.segmentacao, snapNovo.segmentacao);

    const goalIds = delta.itens.map((i) => i.id);
    const { metas, milestones } = await resolverMetasEMilestones(tx, goalIds);

    return {
      delta,
      protocoloMudou,
      snapAntigo,
      snapNovo,
      metas,
      milestones,
    };
  });
}

export interface ResumoEvidenciaTrecho {
  id: string;
  sessionNumero: number;
  dataSessao: Date;
  aprovadorNome: string;
  descricao: string;
  polaridade: "positiva" | "negativa";
  nivelAjuda: string | null;
}

/**
 * Drill-down da trajetória: busca as evidências associadas a uma meta/marco no trecho.
 * Limita a busca a 15 evidências e traz payloads leves para garantir performance (DoD/Revisão).
 */
export async function carregarEvidenciasPorTrecho(
  ctx: TenantContext,
  patientId: string,
  goalOrMilestoneId: string,
  sessaoInicio: number,
  sessaoFim: number
): Promise<ResumoEvidenciaTrecho[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: evidence.id,
        sessionNumero: evidence.sessionNumero,
        dataSessao: session.agendadaPara,
        aprovadorNome: appUser.name,
        classificacaoOriginal: evidence.classificacaoOriginal,
        aprovadoEm: evidence.aprovadoEm,
      })
      .from(evidence)
      .innerJoin(session, eq(evidence.sessionId, session.id))
      .leftJoin(appUser, eq(evidence.aprovadoPor, appUser.id))
      .where(
        and(
          eq(evidence.patientId, patientId),
          or(
            eq(evidence.goalId, goalOrMilestoneId),
            eq(evidence.milestoneId, goalOrMilestoneId)
          ),
          gte(evidence.sessionNumero, sessaoInicio),
          lte(evidence.sessionNumero, sessaoFim)
        )
      )
      .orderBy(desc(evidence.sessionNumero), desc(evidence.id)) // Ordenação determinística com ID de desempate
      .limit(15); // limite rígido de performance (Revisão Adversarial 5)

    return rows.map((r) => {
      const classif = (r.classificacaoOriginal || {}) as any;
      return {
        id: r.id,
        sessionNumero: r.sessionNumero,
        dataSessao: r.dataSessao,
        aprovadorNome: r.aprovadorNome || "Em Revisão",
        descricao: classif.descricao || "Evidência de sessão",
        polaridade: classif.polaridade || "positiva",
        nivelAjuda: classif.nivel_ajuda || null,
      };
    });
  });
}
