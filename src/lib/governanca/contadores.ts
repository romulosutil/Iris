import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

export type BadgesGovernanca = {
  /** Itens na fila de `/validacao` — MESMO predicado de `contarFilaValidacao`
   * (`src/app/(app)/validacao/queries.ts`); o int-test cruza os dois. */
  validacao: number;
  /** Alertas `aberto` — mesmo número do cabeçalho de `/alertas-risco`
   * (`aguardando = status === "aberto"`). Escalados (estágio 1/2) ficam com o
   * banner global de `AppLayout`, tom mais alto que um badge. */
  alertasAbertos: number;
};

/**
 * #533 (revisão pós-PR, 02/09) — os dois badges de governança da nav do
 * coordenador numa ÚNICA ida ao banco (um `withTenant`, um statement, duas
 * subqueries escalares), em vez de duas transações por request.
 *
 * Por que não cache (`React.cache`/`unstable_cache` de 30 s):
 *  - o número precisa cair no MESMO request em que o coordenador confirma
 *    ou reconhece — um badge que continua "2" por meio minuto depois do
 *    gesto é a nav mentindo, e é exatamente o que o `revalidatePath` das
 *    actions existe para evitar;
 *  - `unstable_cache` roda fora do request e não enxerga a sessão RLS
 *    (`app.clinic_id`/`app.user_id`); teríamos de reimplementar o escopo
 *    de tenant na chave do cache — o tipo de duplicação que #128/#165
 *    ensinaram a não fazer;
 *  - as duas contagens são `count(*)` sobre conjuntos pequenos e indexados
 *    (`evidence_current` filtrada por fricção + `alerta_risco_clinico`
 *    por status); o custo real era a 2ª transação, não a query.
 * `React.cache` (dedupe por request) não ajuda: o layout é o único leitor.
 */
export async function contarBadgesGovernanca(
  ctx: TenantContext,
): Promise<BadgesGovernanca> {
  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT
        (
          SELECT count(*)::int
          FROM evidence_current ec
          JOIN extraction x ON x.id = ec.extraction_id
          WHERE ec.invalidada = false
            AND (x.confianca = 'baixa' OR x.inconsistente_com_historico = true)
            AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
            AND NOT EXISTS (
              SELECT 1 FROM evidence_query q
              WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL
            )
        ) AS validacao,
        (
          SELECT count(*)::int
          FROM alerta_risco_clinico a
          WHERE a.deletado_em IS NULL
            AND a.status = 'aberto'
        ) AS alertas_abertos
    `)) as unknown as Array<{ validacao: number; alertas_abertos: number }>;
    return {
      validacao: Number(rows[0]?.validacao ?? 0),
      alertasAbertos: Number(rows[0]?.alertas_abertos ?? 0),
    };
  });
}
