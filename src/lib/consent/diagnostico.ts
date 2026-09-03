import { sql } from "drizzle-orm";
import { withTenant, type Tx, type TenantContext } from "@/db/rls";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

/**
 * DIAGNÓSTICO A POSTERIORI — NÃO É AUTORIZAÇÃO.
 *
 * A autorização é, e continua sendo, a RLS do Postgres: quem decide se a
 * escrita passa ou não é o banco, nunca este arquivo. O problema que esta
 * função resolve é outro: quando a RLS nega, o Postgres devolve SEMPRE o mesmo
 * SQLSTATE `42501` / "new row violates row-level security policy", seja a
 * negação por gate de consentimento, por multi-tenant, por "terapeuta não é
 * dono da sessão" ou por qualquer outro predicado da policy. O código de erro
 * NÃO distingue o motivo.
 *
 * Adivinhar o motivo pelo SQLSTATE seria mentir para o usuário (dizer
 * "consentimento revogado" para quem só não é dono da sessão). Em vez de
 * adivinhar, esta função PERGUNTA AO BANCO, depois da recusa, se algum gate de
 * consentimento explica aquela recusa — chamando as mesmas funções
 * (`app_prontuario_somente_leitura*` / `app_finalidade_revogada*`) que a policy
 * usa no predicado.
 *
 * Devolve `null` quando NENHUM gate de consentimento explica a negação. Nesse
 * caso o chamador NÃO pode inventar uma explicação: deve restaurar o
 * comportamento que teria sem este diagnóstico (propagar o erro, ou devolver a
 * mensagem genérica que já devolvia antes).
 */

const MSG_SOMENTE_LEITURA =
  "Este prontuário está em somente-leitura: o consentimento (menor/curatelado) foi revogado e não há regime vigente. Para voltar a escrever, registre um novo consentimento (reconsentimento ou renovação por maioridade).";

const MSG_IA_REVOGADA =
  "O titular revogou o consentimento para uso de IA no processamento dos dados desta sessão. Registre um novo consentimento dessa finalidade antes de tentar novamente.";

const MSG_EXPORTACAO_REVOGADA =
  "O titular revogou o consentimento para exportação de relatórios deste paciente. Registre um novo consentimento dessa finalidade antes de exportar.";

export type AlvoDiagnostico = { patientId?: string; sessionId?: string };

async function booleano(tx: Tx, consulta: ReturnType<typeof sql>) {
  const linhas = (await tx.execute(consulta)) as unknown as Array<{
    resultado: boolean | null;
  }>;
  return linhas[0]?.resultado === true;
}

/**
 * Consulta os gates de consentimento para o alvo informado e devolve a
 * mensagem amigável do primeiro gate que explique a recusa, ou `null` se
 * nenhum explicar. Roda numa transação de tenant PRÓPRIA — a transação em que
 * a recusa aconteceu já foi abortada.
 */
async function diagnosticarBloqueioDeConsentimento(
  tx: Tx,
  alvo: AlvoDiagnostico,
): Promise<string | null> {
  const { patientId, sessionId } = alvo;

  if (sessionId) {
    if (
      await booleano(
        tx,
        sql`SELECT app_prontuario_somente_leitura_por_sessao(${sessionId}::uuid) AS resultado`,
      )
    ) {
      return MSG_SOMENTE_LEITURA;
    }
    if (
      await booleano(
        tx,
        sql`SELECT app_finalidade_revogada_por_sessao(${sessionId}::uuid, 'uso_ia_processamento') AS resultado`,
      )
    ) {
      return MSG_IA_REVOGADA;
    }
  }

  if (patientId) {
    if (
      await booleano(
        tx,
        sql`SELECT app_prontuario_somente_leitura(${patientId}::uuid) AS resultado`,
      )
    ) {
      return MSG_SOMENTE_LEITURA;
    }
    if (
      await booleano(
        tx,
        sql`SELECT app_finalidade_revogada(${patientId}::uuid, 'uso_ia_processamento') AS resultado`,
      )
    ) {
      return MSG_IA_REVOGADA;
    }
    if (
      await booleano(
        tx,
        sql`SELECT app_finalidade_revogada(${patientId}::uuid, 'exportacao_relatorios') AS resultado`,
      )
    ) {
      return MSG_EXPORTACAO_REVOGADA;
    }
  }

  return null;
}

/**
 * Envelope de conveniência para os chamadores: abre a transação de tenant e
 * nunca lança. Uma falha DO DIAGNÓSTICO (banco fora, função inexistente) não
 * pode mascarar nem substituir o erro original — devolve `null` e o chamador
 * segue com o comportamento que já tinha.
 */
export async function diagnosticarBloqueioDeConsentimentoSeguro(
  ctx: TenantContext,
  alvo: AlvoDiagnostico,
): Promise<string | null> {
  if (!alvo.patientId && !alvo.sessionId) return null;
  try {
    return await withTenant(ctx, (tx) =>
      diagnosticarBloqueioDeConsentimento(tx, alvo),
    );
  } catch (err) {
    logarErroSemPII("diagnosticarBloqueioDeConsentimento falhou:", err);
    return null;
  }
}
