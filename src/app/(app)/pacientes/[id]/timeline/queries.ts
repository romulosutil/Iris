import "server-only";
import { and, desc, eq, gte, lte, inArray, or, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import {
  sessionSnapshot,
  goal,
  goalCandidacy,
  goalMilestoneMapping,
  milestone,
  patientProtocol,
  protocol,
  evidence,
  evidenceRevision,
  appUser,
  session,
} from "@/db/schema";
import {
  computarDadosEspectro,
  type AlvoEspectro,
  type ResultadoEspectro,
} from "@/lib/evidence/espectro";
import {
  calcularDelta,
  verificarProtocoloMudou,
  type DeltaSessao,
} from "./logic";
import { z } from "zod";
import {
  lerRepertorioState,
  lerSegmentacao,
  type RepertorioState,
  type Segmentacao,
} from "@/lib/evidence/snapshot-schema";

export interface TimelineSnapshot {
  sessionNumero: number;
  geradoEm: Date;
  /** `{ goal_id: { nivel_ajuda_recente, is_candidata, … } }` — ver snapshot-schema (A-06). */
  repertorioState: RepertorioState;
  /** `{ goal_id: { protocol_id: { rotulo, metrica, … } } }`. */
  segmentacao: Segmentacao;
  espectro: ResultadoEspectro;
}

export interface TimelineData {
  snapshots: TimelineSnapshot[];
  metasAtivas: Array<{
    id: string;
    descricao: string;
    disciplina: string | null;
  }>;
  protocolosAtivos: Array<{ id: string; nome: string; disciplina: string }>;
  milestonesAtivos: Array<{
    id: string;
    protocolId: string;
    dominioId: string;
    nome: string;
    nivel: string | null;
    tipoEstrutura: string;
    ordem: number | null;
    /** Metas mapeadas a este marco (`goal_milestone_mapping`). O snapshot é
     * indexado por META; é por aqui que a tela resolve o estado de um MARCO. */
    goalIds: string[];
  }>;
}

/**
 * Carrega a timeline completa do paciente (snapshots históricos + dados de espectro).
 * Leitura escopada por RLS (withTenant).
 */
export async function carregarTimeline(
  ctx: TenantContext,
  patientId: string,
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

    // 4. Alvos do Espectro: uma linha por META, com o eixo resolvido pelo MARCO
    //    mapeado a ela (`goal_milestone_mapping`).
    //
    //    Por que o marco e não a disciplina: `repertorio_state` é indexado por
    //    `goal_id` (ver `materializar.ts`), então a versão anterior — que
    //    procurava a chave em `mapeamentoMilestones[id]` — nunca encontrava
    //    marco nenhum e caía sempre no fallback por disciplina, empilhando toda
    //    meta de ABA num único eixo. O mapeamento meta→marco é o vínculo real.
    const metaIds = metas.map((m) => m.id);
    const mapeamentos = metaIds.length
      ? await tx
          .select({
            goalId: goalMilestoneMapping.goalId,
            milestoneId: goalMilestoneMapping.milestoneId,
          })
          .from(goalMilestoneMapping)
          .where(inArray(goalMilestoneMapping.goalId, metaIds))
      : [];

    const candidaturas = metaIds.length
      ? await tx
          .select({
            goalId: goalCandidacy.goalId,
            isCandidata: goalCandidacy.isCandidateDominada,
          })
          .from(goalCandidacy)
          .where(inArray(goalCandidacy.goalId, metaIds))
      : [];

    // Inverso do mapeamento: marco → metas. A tela usa para ler o estado de
    // um marco no `repertorio_state` (indexado por meta).
    const metasDoMarco = new Map<string, string[]>();
    for (const mm of mapeamentos) {
      const lista = metasDoMarco.get(mm.milestoneId) ?? [];
      lista.push(mm.goalId);
      metasDoMarco.set(mm.milestoneId, lista);
    }

    const PPMap = new Map(PP.map((p) => [p.id, p]));
    const milestoneMap = new Map(milestones.map((m) => [m.id, m]));
    const candidaturaMap = new Map(
      candidaturas.map((c) => [c.goalId, c.isCandidata]),
    );

    // Uma meta pode mapear vários marcos; o primeiro que resolve domínio define
    // o eixo. Rateio entre eixos exigiria um peso que ninguém declarou.
    const marcoDaMeta = new Map<string, (typeof milestones)[number]>();
    for (const mm of mapeamentos) {
      if (marcoDaMeta.has(mm.goalId)) continue;
      const marco = milestoneMap.get(mm.milestoneId);
      if (marco) marcoDaMeta.set(mm.goalId, marco);
    }

    const alvosEspectro: AlvoEspectro[] = metas.map((m) => {
      const marco = marcoDaMeta.get(m.id);
      const proto = marco ? PPMap.get(marco.protocolId) : undefined;
      const taxonomia = (proto?.taxonomiaAjuda ?? []) as string[];
      return {
        goalId: m.id,
        dominioId: marco?.dominioId ?? null,
        disciplina: m.disciplina,
        estado: m.estado as AlvoEspectro["estado"],
        // Ordinal máximo da escala. Sem taxonomia declarada fica 0, e o alvo
        // sai da média em vez de herdar uma escala inventada.
        totalNiveisAjuda: Math.max(0, taxonomia.length - 1),
        isCandidata: candidaturaMap.get(m.id) ?? false,
      };
    });

    // 5. Mapeia cada snapshot e anexa o espectro pré-calculado
    const snapshots: TimelineSnapshot[] = snaps.map((s) => {
      const rep = lerRepertorioState(s.repertorioState);
      const seg = lerSegmentacao(s.segmentacao);
      const espectro = computarDadosEspectro(rep, alvosEspectro);

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
      .map((m) => ({
        id: m.id,
        descricao: m.descricao,
        disciplina: m.disciplina,
      }));

    const activeProtocolIds = PP.filter((p) => p.desativadoEm === null).map(
      (p) => p.id,
    );

    const protocolosAtivos = PP.filter((p) => p.desativadoEm === null).map(
      (p) => ({ id: p.id, nome: p.nome, disciplina: p.disciplina }),
    );

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
        goalIds: metasDoMarco.get(m.id) ?? [],
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
  tx: Tx,
  patientId: string,
  sessionNumero: number,
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
        eq(sessionSnapshot.sessionNumero, sessionNumero),
      ),
    )
    .limit(1);
  // Forma única do snapshot (A-06): quem consome (`calcularDelta`,
  // `verificarProtocoloMudou`) recebe o tipo, não o jsonb cru.
  return snap
    ? {
        ...snap,
        repertorioState: lerRepertorioState(snap.repertorioState),
        segmentacao: lerSegmentacao(snap.segmentacao),
      }
    : null;
}

/**
 * Carrega o snapshot de uma sessão específica.
 */
export async function carregarSnapshotAsOf(
  ctx: TenantContext,
  patientId: string,
  sessionNumero: number,
) {
  return withTenant(ctx, async (tx) => {
    return obterSnapshotAsOf(tx, patientId, sessionNumero);
  });
}

/**
 * Helper interno para resolver descrições e nomes legíveis de metas e marcos
 * a partir de seus IDs obtidos do snapshot/delta.
 */
async function resolverMetasEMilestones(tx: Tx, goalIds: string[]) {
  if (!goalIds.length) {
    return { metas: [], milestones: [] };
  }

  const metasResolvidas = await tx
    .select({
      id: goal.id,
      descricao: goal.descricao,
      disciplina: goal.disciplina,
    })
    .from(goal)
    .where(inArray(goal.id, goalIds));

  const milestonesResolvidos = await tx
    .select({
      id: milestone.id,
      nome: milestone.nome,
      dominioId: milestone.dominioId,
    })
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
  sessionNumero: number,
) {
  return withTenant(ctx, async (tx) => {
    const snapB = await obterSnapshotAsOf(tx, patientId, sessionNumero);
    // Limiar > 0 (e não >= 0): para o marco 0 (sessionNumero = 0) o anterior seria -1
    // (o marco 0 não tem anterior). Para a Sessão 1 (sessionNumero = 1), o anterior é o
    // marco 0 (sessionNumero = 0). Sem marco 0 existente, obterSnapshotAsOf devolve null.
    const snapA =
      sessionNumero > 0
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
  sessaoM: number,
) {
  return withTenant(ctx, async (tx) => {
    const sessaoMenor = Math.min(sessaoN, sessaoM);
    const sessaoMaior = Math.max(sessaoN, sessaoM);

    const snapAntigo = await obterSnapshotAsOf(tx, patientId, sessaoMenor);
    const snapNovo = await obterSnapshotAsOf(tx, patientId, sessaoMaior);

    if (!snapAntigo || !snapNovo) {
      return null;
    }

    const delta = calcularDelta(
      snapAntigo.repertorioState,
      snapNovo.repertorioState,
    );
    const protocoloMudou = verificarProtocoloMudou(
      snapAntigo.segmentacao,
      snapNovo.segmentacao,
    );

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

/** Campos de `evidence.classificacao_original` que o drill-down lê (A-06). */
const ClassificacaoOriginalSchema = z.object({
  descricao: z.string().optional(),
  polaridade: z.enum(["positiva", "negativa"]).optional(),
  nivel_ajuda: z
    .union([z.string(), z.number().transform(String)])
    .nullable()
    .optional(),
});

export interface ResumoEvidenciaTrecho {
  id: string;
  sessionNumero: number;
  dataSessao: Date;
  aprovadorNome: string;
  descricao: string;
  polaridade: "positiva" | "negativa";
  nivelAjuda: string | null;
  revisao: {
    acao: string;
    justificativa: string | null;
    autorNome: string | null;
    criadoEm: Date;
  } | null;
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
  sessaoFim: number,
): Promise<ResumoEvidenciaTrecho[]> {
  return withTenant(ctx, async (tx) => {
    // Última revisão (evidence_revision) por evidência — apenas a mais recente
    // interessa à timeline (governança V4 passiva).
    const ultimaRevisao = tx
      .selectDistinctOn([evidenceRevision.evidenceId], {
        evidenceId: evidenceRevision.evidenceId,
        acao: evidenceRevision.acao,
        justificativa: evidenceRevision.justificativa,
        autorId: evidenceRevision.autorId,
        criadoEm: evidenceRevision.criadoEm,
      })
      .from(evidenceRevision)
      .orderBy(evidenceRevision.evidenceId, desc(evidenceRevision.criadoEm))
      .as("ultima_revisao");

    const revisorUser = alias(appUser, "revisor_user");

    const rows = await tx
      .select({
        id: evidence.id,
        sessionNumero: evidence.sessionNumero,
        dataSessao: session.agendadaPara,
        aprovadorNome: appUser.name,
        classificacaoOriginal: evidence.classificacaoOriginal,
        aprovadoEm: evidence.aprovadoEm,
        revisaoAcao: ultimaRevisao.acao,
        revisaoJustificativa: ultimaRevisao.justificativa,
        revisaoCriadoEm: ultimaRevisao.criadoEm,
        revisaoAutorNome: revisorUser.name,
      })
      .from(evidence)
      .innerJoin(session, eq(evidence.sessionId, session.id))
      .leftJoin(appUser, eq(evidence.aprovadoPor, appUser.id))
      .leftJoin(ultimaRevisao, eq(ultimaRevisao.evidenceId, evidence.id))
      .leftJoin(revisorUser, eq(revisorUser.id, ultimaRevisao.autorId))
      .where(
        and(
          eq(evidence.patientId, patientId),
          or(
            eq(evidence.goalId, goalOrMilestoneId),
            eq(evidence.milestoneId, goalOrMilestoneId),
          ),
          gte(evidence.sessionNumero, sessaoInicio),
          lte(evidence.sessionNumero, sessaoFim),
        ),
      )
      .orderBy(desc(evidence.sessionNumero), desc(evidence.id)) // Ordenação determinística com ID de desempate
      .limit(15); // limite rígido de performance (Revisão Adversarial 5)

    return rows.map((r) => {
      // Leniente: classificação fora da forma vira os fallbacks abaixo, não
      // um drill-down quebrado (o texto do relato é o dado que importa aqui).
      const classif =
        ClassificacaoOriginalSchema.safeParse(r.classificacaoOriginal ?? {})
          .data ?? {};
      return {
        id: r.id,
        sessionNumero: r.sessionNumero,
        dataSessao: r.dataSessao,
        aprovadorNome: r.aprovadorNome || "Em Revisão",
        descricao: classif.descricao || "Evidência de sessão",
        polaridade: classif.polaridade || "positiva",
        nivelAjuda: classif.nivel_ajuda || null,
        revisao: r.revisaoAcao
          ? {
              acao: r.revisaoAcao,
              justificativa: r.revisaoJustificativa,
              autorNome: r.revisaoAutorNome,
              criadoEm: r.revisaoCriadoEm!,
            }
          : null,
      };
    });
  });
}
