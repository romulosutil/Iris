import type { BillingProvider } from "./types";
import { AsaasProvider } from "./asaas";
import { MercadoPagoProvider } from "./mercado-pago";

export * from "./types";
export { AsaasProvider } from "./asaas";
export { MercadoPagoProvider } from "./mercado-pago";

/**
 * Resolve o gateway de pagamento ativo a partir de `BILLING_PROVIDER`.
 *
 * **Resolve a cada chamada, de propósito — sem cache em módulo.** Guardar a
 * instância numa `const` de módulo congelaria a env no momento em que o módulo
 * é avaliado, o que quebra `vi.stubEnv` no teste (o primeiro teste que importar
 * o módulo define o provider de todos os outros) e esconderia troca de env em
 * runtime. O adapter não tem estado, então instanciar é barato.
 *
 * Default `mercado_pago`: continua sendo o trilho ativo em produção enquanto a
 * virada de chave para o Asaas não acontece. Desde 08/08/2026 os DOIS adapters
 * existem (conta Asaas de produção aprovada, D12 fechado) — o que decide é a
 * env, e `subscription.provider` é persistido POR LINHA: assinatura criada num
 * gateway nunca é reinterpretada por outro porque a env mudou.
 *
 * O default continua explícito (e não "o que estiver na env") porque um deploy
 * sem `BILLING_PROVIDER` não pode trocar de gateway em silêncio. Valor
 * desconhecido estoura: já custou um incidente em produção — `mercadopago` sem
 * underscore derrubou todo POST do webhook com 500 (04/08/2026).
 */
export function getBillingProvider(): BillingProvider {
  const id = process.env.BILLING_PROVIDER || "mercado_pago";

  switch (id) {
    case "mercado_pago":
      return new MercadoPagoProvider();
    case "asaas":
      return new AsaasProvider();
    default:
      throw new Error(`BILLING_PROVIDER desconhecido: ${id}`);
  }
}
