import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { withTenant } from "@/db/rls";
import {
  goal,
  goalMilestoneMapping,
  instrumentoAplicacao,
  milestone,
  patient,
  patientProtocol,
  protocol,
  session,
  sessionProtocolScope,
  sessionSnapshot,
  sessionTema,
} from "@/db/schema";
import { lerRepertorioState } from "@/lib/evidence/snapshot-schema";
import {
  buildCanonicalContext,
  type AssemblerInput,
} from "./context-assembler";
import {
  JANELA_SESSOES_TEMA,
  projetarHistoricoDeInstrumentos,
  projetarHistoricoDeRepertorio,
  projetarHistoricoDeTemas,
} from "./historico-relevante";
import { MAX_TEMAS_POR_SESSAO } from "./normalizar-tema";

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

function resolverModoExtracao(
  modality?: "protocol_driven" | "conventional" | "cognitive_behavioral" | null,
): "terapia_convencional" | "protocol_driven" | "tcc" {
  switch (modality) {
    case "conventional":
      return "terapia_convencional";
    case "cognitive_behavioral":
      return "tcc";
    case "protocol_driven":
    default:
      return "protocol_driven";
  }
}

/**
 * `historico_relevante` do modo `protocol_driven`: o `repertorio_state` do
 * snapshot MAIS RECENTE do paciente.
 *
 * `materializar.ts` só grava snapshot para números de sessão que tiveram ao
 * menos uma evidência — não há 1 linha por sessão. Por isso a leitura é
 * "última linha por `session_numero`", nunca "linha da sessão N". A tabela
 * está sob RLS (`session_snapshot_select`, 0014/0015): a transação com tenant
 * já escopa por clínica.
 */
async function carregarRepertorioRecente(tx: Tx, patientId: string) {
  const [snap] = await tx
    .select({ repertorioState: sessionSnapshot.repertorioState })
    .from(sessionSnapshot)
    .where(eq(sessionSnapshot.patientId, patientId))
    .orderBy(desc(sessionSnapshot.sessionNumero))
    .limit(1);
  return snap ? lerRepertorioState(snap.repertorioState) : {};
}

// Carrega do banco o contrato canônico que o agente recebe. Roda DENTRO de uma
// transação com tenant (RLS ativo).
//
// #464 — `historico_relevante` deixou de ser `[]` fixo. O comentário anterior
// aqui dizia "fonte futura = Fase 4": a Fase 4 já entrou (`evidence` + view
// `evidence_current` na 0014, `session_snapshot` na 0015/0017), e o que
// faltava era a fiação. Ligado agora para os dois modos cuja fonte existe:
//
//   - `protocol_driven` ← `session_snapshot.repertorio_state`;
//   - `tcc`             ← `instrumento_aplicacao` (PHQ-9/GAD-7).
//
//   - `terapia_convencional` ← `session_tema` (#645).
//
// #645 fechou o terceiro ramo: `temas[]` era produzido pelo agente
// (`agent-output-schema.ts`) e descartado pelo provider — nada o persistia.
// Agora a consolidação grava `sugerido` e a aprovação promove a `aprovado`, e
// só o APROVADO é lido aqui: sugestão nunca vira contexto do agente, senão o
// R14 estaria conferindo a IA contra a própria IA.
export async function loadCanonicalContext(
  tx: Tx,
  args: { sessionId: string; patientId: string; clinicId: string },
) {
  const [pac] = await tx
    .select({
      nascimento: patient.nascimento,
      clinicalModality: patient.clinicalModality,
      familiaAbordagem: patient.familiaAbordagem,
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

  const modo = resolverModoExtracao(pac?.clinicalModality);

  const [sess] = await tx
    .select({ numero: session.numeroSequencialPaciente })
    .from(session)
    .where(eq(session.id, args.sessionId));

  // #464 — a projeção do histórico é por modo. Cada ramo faz a SUA leitura:
  // nenhum modo paga a query do outro.
  let historico: AssemblerInput["historico"] = [];
  if (modo === "protocol_driven") {
    historico = projetarHistoricoDeRepertorio({
      repertorio: await carregarRepertorioRecente(tx, args.patientId),
      // Escopado às metas ativas que já vão no contrato — são as únicas que o
      // agente pode tocar nesta sessão, e é o que mantém o histórico curto.
      metas: metas.map((m) => ({
        id: m.id,
        mapeamentos: m.mapeamentos.map((mp) => ({
          familia: mp.familia,
          dominioId: mp.dominioId,
        })),
      })),
      taxonomiaPorFamilia: new Map(
        protocolos.map((p) => [p.familia, p.taxonomiaAjuda]),
      ),
    });
  } else if (modo === "terapia_convencional") {
    const temas = await tx
      .select({
        sessionNumero: session.numeroSequencialPaciente,
        tema: sessionTema.tema,
        temaChave: sessionTema.temaChave,
        quando: session.agendadaPara,
      })
      .from(sessionTema)
      .innerJoin(session, eq(sessionTema.sessionId, session.id))
      .where(
        and(
          eq(sessionTema.patientId, args.patientId),
          eq(sessionTema.estado, "aprovado"),
          isNotNull(session.numeroSequencialPaciente),
        ),
      )
      .orderBy(desc(session.numeroSequencialPaciente))
      // Teto de leitura: a projeção só usa as `JANELA_SESSOES_TEMA` sessões
      // mais recentes COM tema, e cada sessão grava no máximo
      // `MAX_TEMAS_POR_SESSAO` linhas. O produto das duas é, no pior caso, a
      // janela inteira — ordenado por número de sessão desc, cobre a janela
      // sem varrer o histórico de anos de um paciente. O filtro está no
      // WHERE, antes do LIMIT: cortar primeiro e filtrar depois devolveria
      // menos sessões do que a janela pede.
      .limit(JANELA_SESSOES_TEMA * MAX_TEMAS_POR_SESSAO);
    historico = projetarHistoricoDeTemas({
      temas: temas.map((t) => ({
        // `isNotNull` acima garante o número; o cast só convence o TS.
        sessionNumero: t.sessionNumero!,
        tema: t.tema,
        temaChave: t.temaChave,
        quando: t.quando,
      })),
    });
  } else if (modo === "tcc") {
    const aplicacoes = await tx
      .select({
        tipoInstrumento: instrumentoAplicacao.tipoInstrumento,
        escoreTotal: instrumentoAplicacao.escoreTotal,
        criadoEm: instrumentoAplicacao.criadoEm,
      })
      .from(instrumentoAplicacao)
      .where(eq(instrumentoAplicacao.patientId, args.patientId))
      .orderBy(desc(instrumentoAplicacao.criadoEm))
      // Teto de leitura: a projeção só usa a ÚLTIMA aplicação de cada
      // instrumento, e são dois (PHQ-9/GAD-7). Ordenado por `criado_em DESC`,
      // 20 linhas cobrem folgadamente os dois mais recentes sem varrer a
      // série inteira de um paciente de anos.
      .limit(20);
    historico = projetarHistoricoDeInstrumentos({ aplicacoes });
  }

  return buildCanonicalContext({
    paciente: {
      idadeMeses: idadeEmMeses(pac?.nascimento ?? null),
      sessaoNumero: sess?.numero ?? null,
    },
    modo,
    // #331 — só passa adiante quando o modo é convencional; em qualquer
    // outro modo a coluna pode ter lixo de um cadastro mal feito no
    // passado, mas nunca deve vazar pro contrato (defesa em profundidade).
    familiaAbordagem:
      modo === "terapia_convencional"
        ? (pac?.familiaAbordagem ?? undefined)
        : undefined,
    protocolos,
    metas,
    historico,
  });
}
