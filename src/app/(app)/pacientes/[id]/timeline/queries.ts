import "server-only";
import { and, desc, eq, gte, lte, inArray, sql } from "drizzle-orm";
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

    // 2. Carrega as metas ativas
    const metas = await tx
      .select({
        id: goal.id,
        descricao: goal.descricao,
        disciplina: goal.disciplina,
      })
      .from(goal)
      .where(and(eq(goal.patientId, patientId), eq(goal.estado, "ativa")));

    // 3. Carrega os protocolos ativos e seus milestones
    const PP = await tx
      .select({
        id: protocol.id,
        nome: protocol.nome,
        disciplina: protocol.disciplina,
        taxonomiaAjuda: protocol.taxonomiaAjuda,
      })
      .from(patientProtocol)
      .innerJoin(protocol, eq(patientProtocol.protocolId, protocol.id))
      .where(
        and(
          eq(patientProtocol.patientId, patientId),
          sql`${patientProtocol.desativadoEm} IS NULL`
        )
      );

    const protocolIds = PP.map((p) => p.id);
    const milestones = protocolIds.length
      ? await tx
          .select({
            id: milestone.id,
            protocolId: milestone.protocolId,
            dominioId: milestone.dominioId,
            tipoEstrutura: milestone.tipoEstrutura,
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
        tipoEstrutura: m.tipoEstrutura as any,
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

    return {
      snapshots,
      metasAtivas: metas,
      protocolosAtivos: PP.map((p) => ({
        id: p.id,
        nome: p.nome,
        disciplina: p.disciplina,
      })),
    };
  });
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
  });
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
    const snapB = await carregarSnapshotAsOf(ctx, patientId, sessionNumero);
    const snapA =
      sessionNumero > 1
        ? await carregarSnapshotAsOf(ctx, patientId, sessionNumero - 1)
        : null;

    const stateA = snapA ? snapA.repertorioState : null;
    const stateB = snapB ? snapB.repertorioState : null;

    const delta = calcularDelta(stateA, stateB);

    // Resolve as descrições de metas e milestones no delta para que a UI exiba textos legíveis
    const goalIds = delta.itens.map((i) => i.id);
    
    const metasResolvidas = goalIds.length
      ? await tx
          .select({ id: goal.id, descricao: goal.descricao, disciplina: goal.disciplina })
          .from(goal)
          .where(inArray(goal.id, goalIds))
      : [];

    const milestonesResolvidos = goalIds.length
      ? await tx
          .select({ id: milestone.id, nome: milestone.nome, dominioId: milestone.dominioId })
          .from(milestone)
          .where(inArray(milestone.id, goalIds))
      : [];

    return {
      delta,
      metas: metasResolvidas,
      milestones: milestonesResolvidos,
    };
  });
}

/**
 * Carrega a comparação detalhada de duas sessões com o guard G7.
 */
export async function carregarComparacao(
  ctx: TenantContext,
  patientId: string,
  sessaoN: number,
  sessaoM: number
) {
  return withTenant(ctx, async (tx) => {
    const snapN = await carregarSnapshotAsOf(ctx, patientId, sessaoN);
    const snapM = await carregarSnapshotAsOf(ctx, patientId, sessaoM);

    if (!snapN || !snapM) {
      return null;
    }

    const delta = calcularDelta(snapN.repertorioState, snapM.repertorioState);
    const protocoloMudou = verificarProtocoloMudou(snapN.segmentacao, snapM.segmentacao);

    const goalIds = delta.itens.map((i) => i.id);

    const metasResolvidas = goalIds.length
      ? await tx
          .select({ id: goal.id, descricao: goal.descricao, disciplina: goal.disciplina })
          .from(goal)
          .where(inArray(goal.id, goalIds))
      : [];

    const milestonesResolvidos = goalIds.length
      ? await tx
          .select({ id: milestone.id, nome: milestone.nome, dominioId: milestone.dominioId })
          .from(milestone)
          .where(inArray(milestone.id, goalIds))
      : [];

    return {
      delta,
      protocoloMudou,
      snapN,
      snapM,
      metas: metasResolvidas,
      milestones: milestonesResolvidos,
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
      .innerJoin(appUser, eq(evidence.aprovadoPor, appUser.id))
      .where(
        and(
          eq(evidence.patientId, patientId),
          sql`${evidence.goalId} = ${goalOrMilestoneId} OR ${evidence.milestoneId} = ${goalOrMilestoneId}`,
          gte(evidence.sessionNumero, sessaoInicio),
          lte(evidence.sessionNumero, sessaoFim)
        )
      )
      .orderBy(desc(evidence.sessionNumero))
      .limit(15); // limite rígido de performance (Revisão Adversarial 5)

    return rows.map((r) => {
      const classif = (r.classificacaoOriginal || {}) as any;
      return {
        id: r.id,
        sessionNumero: r.sessionNumero,
        dataSessao: r.dataSessao,
        aprovadorNome: r.aprovadorNome,
        descricao: classif.descricao || "Evidência de sessão",
        polaridade: classif.polaridade || "positiva",
        nivelAjuda: classif.nivel_ajuda || null,
      };
    });
  });
}
