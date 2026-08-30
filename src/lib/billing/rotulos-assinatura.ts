import type { BadgesVariantes } from "@/components/ui/patterns/status-badge";
import type { AssinaturaStatus } from "@/app/(app)/assinatura/queries";

/**
 * Vocabulário do banco → vocabulário da clínica (#36, bloco B1). Espelha
 * `rotulos-ciclo.ts`, que faz o mesmo para `billing_cycle_status`.
 *
 * `Record<AssinaturaStatus, …>` e não um objeto solto: o tipo é exaustivo,
 * então um valor novo em `subscription_status` quebra o `pnpm typecheck` em vez
 * de renderizar o identificador cru do Postgres na tela de quem paga.
 *
 * `past_due` NÃO é rotulado como "suspensa" nem "bloqueada": em `past_due` a
 * clínica continua escrevendo (`estado-conta.ts`, ramo `permitir`), e chamar
 * isso de suspensão descreveria um bloqueio que não existe.
 */
export const ROTULOS_ASSINATURA: Record<
  AssinaturaStatus,
  { rotulo: string; variante: BadgesVariantes }
> = {
  free_tier: { rotulo: "Sem assinatura", variante: "neutral" },
  setup_pending: { rotulo: "Ativação em andamento", variante: "info" },
  active: { rotulo: "Assinatura ativa", variante: "success" },
  past_due: { rotulo: "Pagamento em atraso", variante: "warning" },
  canceled: { rotulo: "Assinatura cancelada", variante: "neutral" },
};
