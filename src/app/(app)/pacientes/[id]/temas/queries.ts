import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { session, sessionNote } from "@/db/schema";

export type NotaDeSessao = {
  sessionId: string;
  numeroSequencial: number | null;
  agendadaPara: Date;
  texto: string;
  atualizadoEm: Date;
};

/**
 * Modalidade convencional (`R7`, #388): o registro estruturado é narrativo —
 * `resumo_sessao`/`temas[]` que o agente de extração promete (`prompt.ts`,
 * `CONVENTIONAL_SYSTEM_PROMPT`) NÃO são persistidos hoje. `ClaudeProvider.extrair`
 * (`src/lib/extraction/claude-provider.ts`) descarta `resumo_sessao` no retorno
 * (`ExtractionResult` só carrega `drafts`/`alertaRisco`) e o schema de saída
 * (`agent-output-schema.ts`) não modela `temas` como array — é texto livre
 * dentro do resumo. Até essa lacuna fechar (fora de escopo desta tarefa), esta
 * tela lê o dado real mais próximo: a nota consolidada de cada sessão.
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
        texto: sessionNote.texto,
        atualizadoEm: sessionNote.atualizadoEm,
      })
      .from(sessionNote)
      .innerJoin(session, eq(session.id, sessionNote.sessionId))
      .where(
        and(
          eq(session.patientId, patientId),
          eq(sessionNote.tipo, "nota_consolidada"),
        ),
      )
      .orderBy(desc(session.agendadaPara));
  });
}
