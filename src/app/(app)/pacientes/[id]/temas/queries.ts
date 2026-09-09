import "server-only";
import { and, countDistinct, desc, eq, isNotNull, max, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { session, sessionNote, sessionTema } from "@/db/schema";

export type NotaDeSessao = {
  sessionId: string;
  numeroSequencial: number | null;
  agendadaPara: Date;
  disciplina: string | null;
  texto: string | null;
  atualizadoEm: Date | null;
};

/**
 * Notas consolidadas da modalidade convencional (`R7`, #388): o registro
 * narrativo integral de cada sessão.
 *
 * Até a #645 esta era a única leitura da tela — um paliativo, porque `temas[]`
 * saía do agente e nada o persistia. A #645 fechou a lacuna
 * (`obterTemasRecorrentes` abaixo lê `session_tema`), e a lista de notas
 * PERMANECE por mérito próprio: é o texto integral da sessão, não um
 * substituto de tema.
 *
 * Usa LEFT JOIN a partir de `session` (#119): sessões com notas sob sigilo da
 * disciplina permanecem listadas com data e presença confirmadas, retornando
 * `texto = null` para profissionais não autorizados pelo RLS.
 */
export async function obterNotasDeSessao(
  ctx: TenantContext,
  patientId: string,
): Promise<NotaDeSessao[]> {
  requireRole(ctx, "coordenador", "terapeuta", "admin_recepcao");
  return withTenant(ctx, async (tx) => {
    return tx
      .select({
        sessionId: session.id,
        numeroSequencial: session.numeroSequencialPaciente,
        agendadaPara: session.agendadaPara,
        disciplina: session.disciplina,
        texto: sessionNote.texto,
        atualizadoEm: sessionNote.atualizadoEm,
      })
      .from(session)
      .leftJoin(
        sessionNote,
        and(
          eq(sessionNote.sessionId, session.id),
          eq(sessionNote.tipo, "nota_consolidada"),
        ),
      )
      .where(
        and(
          eq(session.patientId, patientId),
          isNotNull(session.numeroSequencialPaciente),
        ),
      )
      .orderBy(desc(session.agendadaPara));
  });
}

export type TemaRecorrente = {
  /** Chave canônica (`normalizarTema`) — o agrupador. */
  temaChave: string;
  /** Grafia da sessão mais recente em que o tema apareceu. */
  tema: string;
  /** Em quantas SESSÕES distintas o tema foi aprovado. */
  ocorrencias: number;
  ultimaEm: Date | null;
};

/**
 * #645 — temas do paciente, agrupados por `tema_chave`.
 *
 * Só `estado = 'aprovado'`: tema `sugerido` é leitura da IA que ninguém
 * confirmou, e a tela do prontuário não é lugar de sugestão pendente (a mesma
 * régua que separa `extraction` de `evidence`).
 *
 * A agregação é feita no Postgres, não em memória: um paciente de anos pode ter
 * centenas de linhas, e trazer todas para contar no Node só para descartá-las
 * seria varredura sem motivo. `array_agg(... ORDER BY ...)[1]` devolve a grafia
 * da sessão mais recente — a que o terapeuta acabou de ler.
 *
 * O RLS de `session_tema` (`0159`) já escopa por clínica e equipe.
 */
export async function obterTemasRecorrentes(
  ctx: TenantContext,
  patientId: string,
): Promise<TemaRecorrente[]> {
  requireRole(ctx, "coordenador", "terapeuta", "admin_recepcao");
  return withTenant(ctx, async (tx) => {
    return tx
      .select({
        temaChave: sessionTema.temaChave,
        tema: sql<string>`(array_agg(${sessionTema.tema} ORDER BY ${session.agendadaPara} DESC))[1]`,
        ocorrencias: countDistinct(sessionTema.sessionId),
        ultimaEm: max(session.agendadaPara),
      })
      .from(sessionTema)
      .innerJoin(session, eq(sessionTema.sessionId, session.id))
      .where(
        and(
          eq(sessionTema.patientId, patientId),
          eq(sessionTema.estado, "aprovado"),
        ),
      )
      .groupBy(sessionTema.temaChave)
      .orderBy(
        desc(countDistinct(sessionTema.sessionId)),
        desc(max(session.agendadaPara)),
      );
  });
}
