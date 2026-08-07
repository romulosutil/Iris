import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { auditLog } from "@/db/schema";
import {
  ACAO_ARQUIVADO_AUTOMATICAMENTE,
  ACAO_AVISO_PREVIO,
  ACAO_DESARQUIVADO_AUTOMATICAMENTE,
} from "@/lib/jobs/auto-arquivamento";

/** Ações manuais desta pasta (`logic.ts`). */
const ACAO_ARQUIVADO_MANUAL = "paciente_arquivado";
const ACAO_DESARQUIVADO_MANUAL = "paciente_desarquivado";

/**
 * Toda ação que MUDA o estado de arquivamento. O aviso prévio não entra: ele
 * anuncia uma mudança, não é uma.
 */
const ACOES_DE_ESTADO = [
  ACAO_ARQUIVADO_MANUAL,
  ACAO_DESARQUIVADO_MANUAL,
  ACAO_ARQUIVADO_AUTOMATICAMENTE,
  ACAO_DESARQUIVADO_AUTOMATICAMENTE,
] as const;

export interface AvisosArquivamento {
  /** Instante do desarquivamento AUTOMÁTICO ainda vigente, se houver. */
  desarquivadoAutomaticamenteEm: Date | null;
  /** Instante do aviso prévio de 7 dias ainda vigente, se houver. */
  avisoPrevioEm: Date | null;
}

/**
 * #174 — a metade "aviso in-app" do débito D6.
 *
 * Dois eventos do job de arquivamento mexem no que a clínica paga sem ninguém
 * ter clicado em nada, e hoje não aparecem em lugar nenhum da interface:
 *
 * 1. **Desarquivamento automático.** Registrar um atendimento devolve o
 *    paciente à contagem de ativos. A clínica volta a ser cobrada por ele e
 *    descobre na fatura.
 * 2. **Aviso prévio.** 83 dias sem registro clínico: faltam 7 dias para o
 *    arquivamento automático. É a única janela em que a clínica pode agir.
 *
 * Derivado da trilha, nunca de coluna nova: `audit_log` já é a fonte de
 * verdade de quem mexeu no estado e quando, e uma flag persistida passaria a
 * mentir na primeira mudança feita por outro caminho.
 *
 * Vigência é o ponto sutil. Um aviso prévio de três meses atrás, seguido de
 * arquivamento e desarquivamento manual, não descreve mais o presente — por
 * isso os dois avisos só valem se forem POSTERIORES à última mudança de
 * estado. Sem esse corte a tela mostraria aviso de um ciclo encerrado.
 */
export async function carregarAvisosArquivamento(
  ctx: TenantContext,
  patientId: string,
): Promise<AvisosArquivamento> {
  const linhas = await withTenant(ctx, (tx) =>
    tx
      .select({ acao: auditLog.acao, criadoEm: auditLog.criadoEm })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.patientId, patientId),
          inArray(auditLog.acao, [...ACOES_DE_ESTADO, ACAO_AVISO_PREVIO]),
        ),
      )
      .orderBy(desc(auditLog.criadoEm))
      .limit(20),
  );

  const ultimaMudanca = linhas.find((l) =>
    (ACOES_DE_ESTADO as readonly string[]).includes(l.acao),
  );

  const posteriorAMudanca = (quando: Date) =>
    !ultimaMudanca || quando > ultimaMudanca.criadoEm;

  const avisoPrevio = linhas.find(
    (l) => l.acao === ACAO_AVISO_PREVIO && posteriorAMudanca(l.criadoEm),
  );

  return {
    desarquivadoAutomaticamenteEm:
      ultimaMudanca?.acao === ACAO_DESARQUIVADO_AUTOMATICAMENTE
        ? ultimaMudanca.criadoEm
        : null,
    avisoPrevioEm: avisoPrevio?.criadoEm ?? null,
  };
}
