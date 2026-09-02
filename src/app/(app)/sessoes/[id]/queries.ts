import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  careTeamMembership,
  patient,
  patientProtocol,
  protocol,
  session,
  sessionNote,
  extraction,
} from "@/db/schema";
import {
  deriveEstadoSessao,
  type EntradaSessao,
  type ResultadoEstado,
} from "@/lib/sessao/estado";
import { podeAutoValidar } from "@/lib/sessao/aprovacao";
import { ehProfissionalResponsavel } from "@/lib/sessao/responsavel";

export type ProtocoloOpcao = { id: string; nome: string; disciplina: string };

export type DadosSessao = {
  sessionId: string;
  patientId: string;
  pacienteNome: string | null;
  terapeutaId: string;
  /** `true` para o terapeuta dono da sessão OU coordenação (defesa em profundidade). */
  podeVer: boolean;
  ehDono: boolean;
  /** T05 — `podeAutoValidar`: coordenador que É o terapeuta desta sessão. */
  podeColapsarAprovacao: boolean;
  resultado: ResultadoEstado;
  /** Existe `session_note` `captura_rapida` com texto não vazio (R-36/R-38). */
  temCaptura: boolean;
  /**
   * #513 — a `nota_consolidada` já gravada, quando existe. Alimenta a correção
   * da nota (`CorrigirNota`): sem o texto atual em mão, "corrigir" só poderia
   * ser redigitar tudo, e o upsert de `consolidarSessaoCore` sobrescreveria a
   * nota salva por um texto parcial. `visibilityLevel` vem junto pelo mesmo
   * motivo: `consolidarSessaoAction` deriva o nível do checkbox e SEMPRE grava
   * um valor (checkbox ausente ⇒ `multidisciplinary`), então um form sem o
   * estado atual rebaixaria o sigilo de uma nota `discipline_only` em silêncio.
   */
  notaConsolidada: {
    texto: string;
    visibilityLevel: "multidisciplinary" | "discipline_only";
  } | null;
  protocolos: ProtocoloOpcao[];
  protocolIdsPreSelecionados: string[];
};

/**
 * Carrega tudo que `/sessoes/[id]` precisa para derivar o estado (T01) e
 * montar o passo em foco (T06). Reusa a leitura de protocolos/disciplina de
 * `/diario/[sessionId]/page.tsx` e o predicado da fila de validação de uma
 * sessão (mesmo texto SQL de `src/lib/sessao/fila.ts` / spec A5 — reescrito
 * aqui porque aquele é interno ao módulo da fila de listagem, não porque a
 * regra diverge).
 */
export async function carregarSessao(
  ctx: TenantContext,
  sessionId: string,
  agora: Date,
): Promise<DadosSessao | null> {
  return withTenant(ctx, async (tx) => {
    const [sess] = await tx
      .select({
        id: session.id,
        patientId: session.patientId,
        terapeutaId: session.terapeutaId,
        atendidoPorId: session.atendidoPorId,
        estado: session.estado,
        agendadaPara: session.agendadaPara,
        numeroSequencialPaciente: session.numeroSequencialPaciente,
      })
      .from(session)
      .where(eq(session.id, sessionId));
    if (!sess) return null;

    const [pac] = await tx
      .select({ nome: patient.nome })
      .from(patient)
      .where(eq(patient.id, sess.patientId));

    const notas = await tx
      .select({
        tipo: sessionNote.tipo,
        texto: sessionNote.texto,
        visibilityLevel: sessionNote.visibilityLevel,
      })
      .from(sessionNote)
      .where(eq(sessionNote.sessionId, sessionId));
    const nota = notas.find((n) => n.tipo === "nota_consolidada") ?? null;
    const temNotaConsolidada = nota !== null;
    const temCaptura = notas.some(
      (n) => n.tipo === "captura_rapida" && n.texto.trim().length > 0,
    );

    const extracoes = await tx
      .select({ estado: extraction.estado })
      .from(extraction)
      .where(eq(extraction.sessionId, sessionId));

    // Itens na fila de validação DESTA sessão — texto idêntico ao predicado
    // canônico (spec A5 / validacao/queries.ts:17-19, espelhado também em
    // fila.ts). O casamento é por (patient_id, session_numero), não por
    // extraction_id — mesma razão documentada em fila.ts.
    let itensNaFilaValidacao = 0;
    if (sess.numeroSequencialPaciente != null) {
      const rows = (await tx.execute(sql`
        SELECT count(*)::int AS total
        FROM evidence_current ec
        JOIN extraction xf ON xf.id = ec.extraction_id
        WHERE ec.patient_id = ${sess.patientId}::uuid
          AND ec.session_numero = ${sess.numeroSequencialPaciente}
          AND ec.invalidada = false
          AND (xf.confianca = 'baixa' OR xf.inconsistente_com_historico = true)
          AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
          AND NOT EXISTS (
            SELECT 1 FROM evidence_query q
            WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL
          )
      `)) as unknown as Array<{ total: number }>;
      itensNaFilaValidacao = rows[0]?.total ?? 0;
    }

    const entrada: EntradaSessao = {
      estado: sess.estado,
      agendadaPara: sess.agendadaPara,
      temNotaConsolidada,
      extracoes,
      itensNaFilaValidacao,
    };
    const resultado = deriveEstadoSessao(entrada, agora);

    const [membro] = await tx
      .select({ disciplina: careTeamMembership.disciplina })
      .from(careTeamMembership)
      .where(
        and(
          eq(careTeamMembership.patientId, sess.patientId),
          eq(careTeamMembership.userId, sess.terapeutaId),
          isNull(careTeamMembership.vigenciaFim),
        ),
      );

    const protocolosAtivos = await tx
      .select({
        id: protocol.id,
        nome: protocol.nome,
        disciplina: protocol.disciplina,
      })
      .from(patientProtocol)
      .innerJoin(protocol, eq(protocol.id, patientProtocol.protocolId))
      .where(
        and(
          eq(patientProtocol.patientId, sess.patientId),
          isNull(patientProtocol.desativadoEm),
        ),
      );

    const daDisciplina = membro?.disciplina
      ? protocolosAtivos.filter((p) => p.disciplina === membro.disciplina)
      : [];
    const protocolIdsPreSelecionados = (
      daDisciplina.length > 0 ? daDisciplina : protocolosAtivos
    ).map((p) => p.id);

    return {
      sessionId,
      patientId: sess.patientId,
      pacienteNome: pac?.nome ?? null,
      terapeutaId: sess.terapeutaId,
      // #539 (D-AUD-7): "dono" = profissional responsável = titular OU
      // substituto designado na agenda. Mesma régua da RLS
      // (`app_session_profissional_responsavel`, 0143) e de `fila.ts` — se as
      // três divergirem, a tela nega o formulário a quem o banco deixa escrever.
      ehDono: ehProfissionalResponsavel(ctx.userId, sess),
      podeVer:
        ctx.role === "coordenador" ||
        ehProfissionalResponsavel(ctx.userId, sess),
      podeColapsarAprovacao: podeAutoValidar(ctx, {
        terapeutaId: sess.terapeutaId,
      }),
      resultado,
      temCaptura,
      notaConsolidada: nota
        ? { texto: nota.texto, visibilityLevel: nota.visibilityLevel }
        : null,
      protocolos: protocolosAtivos,
      protocolIdsPreSelecionados,
    };
  });
}
