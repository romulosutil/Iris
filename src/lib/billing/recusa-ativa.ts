import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";

/**
 * D36 — a leitura que faltava. `billing_cycle.erro` é escrito desde a #318 e
 * nunca foi lido por tela nenhuma; `recusa_codigo` (0100) guarda o código cru.
 * Aqui ele finalmente sai do banco para a interface.
 *
 * **Uma consulta só, e sempre o ciclo MAIS RECENTE.** Duas idas (ciclo de um
 * lado, assinatura do outro) leriam instantes diferentes, e um webhook de
 * liquidação concorrente produziria "cobrança recusada" numa clínica que acabou
 * de pagar. O `JOIN` com `clinic` traz o `timezone` na mesma imagem, porque o
 * prazo de carência é contado em dias civis do fuso da clínica.
 *
 * **Por que não filtrar por `subscription.status`:** G3 (`corteImediato`) não
 * carimba `past_due` — filtrar por carência esconderia justamente a recusa cuja
 * consequência é o corte. A régua é o ciclo, não a assinatura.
 *
 * Sob RLS (`app_role`), coberto pelas policies `billing_cycle_select` e
 * `subscription_select` (0071, reescritas na 0085 para resolver o tenant pelo
 * helper) e pelos grants de `SELECT` de 0071 + 0100. Crase é proibida aqui:
 * este SQL mora num template literal de JS.
 */
export interface RecusaAtiva {
  recusaCodigo: string | null;
  statusAssinatura: string;
  pastDueDesde: Date | null;
  carenciaDias: number;
  timezone: string;
}

type Linha = {
  ciclo_status: string;
  recusa_codigo: string | null;
  status_assinatura: string;
  past_due_desde: Date | string | null;
  carencia_dias: number | string;
  timezone: string;
};

export async function obterRecusaAtiva(
  tx: Tx,
  clinicId: string,
): Promise<RecusaAtiva | null> {
  const resultado = await tx.execute<Linha>(sql`
    SELECT
      bc.status::text AS ciclo_status,
      bc.recusa_codigo,
      s.status::text AS status_assinatura,
      s.past_due_desde,
      s.carencia_dias,
      c.timezone
    FROM billing_cycle bc
    JOIN subscription s ON s.id = bc.subscription_id
    JOIN clinic c ON c.id = bc.clinic_id
    WHERE bc.clinic_id = ${clinicId}
    ORDER BY bc.fim DESC
    LIMIT 1
  `);

  const linha = (resultado as unknown as Linha[])[0];
  if (!linha) return null;

  // O filtro fica AQUI, e não no WHERE, de propósito: no WHERE, um ciclo pago
  // mais recente deixaria a consulta cair no ciclo `falhou` ANTERIOR e a faixa
  // voltaria a acusar uma recusa já resolvida.
  if (linha.ciclo_status !== "falhou") return null;

  return {
    recusaCodigo: linha.recusa_codigo,
    statusAssinatura: linha.status_assinatura,
    // O driver devolve timestamptz como string em consulta crua; `Number` no
    // numeric pelo mesmo motivo de `estado-conta.ts`.
    pastDueDesde:
      linha.past_due_desde == null
        ? null
        : linha.past_due_desde instanceof Date
          ? linha.past_due_desde
          : new Date(linha.past_due_desde),
    carenciaDias: Number(linha.carencia_dias),
    timezone: linha.timezone,
  };
}
