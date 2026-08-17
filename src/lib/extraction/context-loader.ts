import { and, eq, isNull } from "drizzle-orm";
import type { withTenant } from "@/db/rls";
import {
  goal,
  goalMilestoneMapping,
  milestone,
  patient,
  patientProtocol,
  protocol,
  sessionProtocolScope,
} from "@/db/schema";
import {
  buildCanonicalContext,
  type AssemblerInput,
} from "./context-assembler";

// Tipo da transação que withTenant entrega ao callback (evita reimportar o tipo
// interno do drizzle/postgres).
type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

function idadeEmMeses(nascimento: string | null): number | null {
  if (!nascimento) return null;
  const n = new Date(nascimento);
  const hoje = new Date();
  const bruto =
    (hoje.getFullYear() - n.getFullYear()) * 12 +
    (hoje.getMonth() - n.getMonth());
  return hoje.getDate() < n.getDate() ? bruto - 1 : bruto;
}

// Carrega do banco o contrato canônico que o agente recebe. Roda DENTRO de uma
// transação com tenant (RLS ativo). historico_relevante fica vazio na Fase 3
// (não há tabela evidence; fonte futura = extrações aprovadas — Plano 2/Fase 4).
export async function loadCanonicalContext(
  tx: Tx,
  args: { sessionId: string; patientId: string; clinicId: string },
) {
  const [pac] = await tx
    .select({
      nascimento: patient.nascimento,
      clinicalModality: patient.clinicalModality,
    })
    .from(patient)
    .where(eq(patient.id, args.patientId));

  // Escopo de protocolos desta sessão (SessionProtocolScope). Se houver linhas,
  // restringe os protocolos ativos aos escopados (Caso 9 — sessão de TO só vê PEDI).
  const scopes = await tx
    .select({ protocolId: sessionProtocolScope.protocolId })
    .from(sessionProtocolScope)
    .where(eq(sessionProtocolScope.sessionId, args.sessionId));
  const scopeIds = new Set(scopes.map((s) => s.protocolId));

  const pps = await tx
    .select({
      protocolId: protocol.id,
      familia: protocol.familia,
      nome: protocol.nome,
      disciplina: protocol.disciplina,
      taxonomiaAjuda: protocol.taxonomiaAjuda,
    })
    .from(patientProtocol)
    .innerJoin(protocol, eq(patientProtocol.protocolId, protocol.id))
    .where(
      and(
        eq(patientProtocol.patientId, args.patientId),
        isNull(patientProtocol.desativadoEm),
      ),
    );
  const ativos = pps.filter(
    (p) => scopeIds.size === 0 || scopeIds.has(p.protocolId),
  );

  const protocolos: AssemblerInput["protocolos"] = [];
  for (const p of ativos) {
    const doms = await tx
      .select({
        dominioId: milestone.dominioId,
        nome: milestone.nome,
        nivel: milestone.nivel,
      })
      .from(milestone)
      .where(eq(milestone.protocolId, p.protocolId));
    // um item por dominio_id (marcos podem ter vários níveis do mesmo domínio)
    const porDominio = new Map<
      string,
      { dominioId: string; nome: string; nivel: string | null }
    >();
    for (const d of doms) {
      if (!porDominio.has(d.dominioId)) {
        porDominio.set(d.dominioId, {
          dominioId: d.dominioId,
          nome: d.nome,
          nivel: d.nivel,
        });
      }
    }
    protocolos.push({
      familia: p.familia,
      nome: p.nome,
      disciplina: p.disciplina,
      taxonomiaAjuda: (p.taxonomiaAjuda as string[]) ?? [],
      dominios: [...porDominio.values()],
    });
  }

  const metasRows = await tx
    .select({
      id: goal.id,
      descricao: goal.descricao,
      disciplina: goal.disciplina,
    })
    .from(goal)
    .where(
      and(
        eq(goal.patientId, args.patientId),
        eq(goal.clinicId, args.clinicId),
        eq(goal.estado, "ativa"),
      ),
    );

  const metas: AssemblerInput["metas"] = [];
  for (const m of metasRows) {
    const maps = await tx
      .select({
        familia: protocol.familia,
        dominioId: milestone.dominioId,
        nivel: milestone.nivel,
      })
      .from(goalMilestoneMapping)
      .innerJoin(milestone, eq(goalMilestoneMapping.milestoneId, milestone.id))
      .innerJoin(protocol, eq(milestone.protocolId, protocol.id))
      .where(eq(goalMilestoneMapping.goalId, m.id));
    metas.push({
      id: m.id,
      descricao: m.descricao,
      disciplina: m.disciplina,
      mapeamentos: maps,
    });
  }

  const modo =
    pac?.clinicalModality === "conventional"
      ? "terapia_convencional"
      : "protocol_driven";

  return buildCanonicalContext({
    paciente: { idadeMeses: idadeEmMeses(pac?.nascimento ?? null) },
    modo,
    protocolos,
    metas,
    historico: [],
  });
}
