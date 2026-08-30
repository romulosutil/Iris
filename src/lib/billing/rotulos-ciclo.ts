import type { BadgesVariantes } from "@/components/ui/patterns/status-badge";
import type { CicloStatus } from "@/app/(app)/assinatura/queries";

/**
 * Vocabulário do banco → vocabulário da clínica (#36, bloco A2).
 *
 * `Record<CicloStatus, …>` e não um objeto solto: o tipo é exaustivo, então um
 * valor novo em `billing_cycle_status` quebra o `pnpm typecheck` em vez de
 * renderizar o identificador cru do Postgres na tela de quem paga.
 *
 * `cobrado` é LEGADO (ver `schema.ts`): ficou de quando o job carimbava o ciclo
 * sem emitir cobrança nenhuma. O rótulo diz isso em vez de fingir que houve
 * fatura.
 */
export const ROTULOS_CICLO: Record<
  CicloStatus,
  { rotulo: string; variante: BadgesVariantes }
> = {
  aberto: { rotulo: "Em aberto", variante: "info" },
  apurado: { rotulo: "Apurado", variante: "info" },
  cobrado: { rotulo: "Fechado (registro antigo)", variante: "neutral" },
  aguardando_pagamento: { rotulo: "Aguardando pagamento", variante: "warning" },
  pago: { rotulo: "Pago", variante: "success" },
  falhou: { rotulo: "Cobrança recusada", variante: "error" },
  devido: { rotulo: "Em débito", variante: "warning" },
};
