import type { BillingProvider } from "./types";
import { MercadoPagoProvider } from "./mercado-pago";

export * from "./types";
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
 * Default `mercado_pago`: é o trilho em produção hoje. `asaas` é reconhecido
 * mas ainda não implementado — falha explícita é melhor que cair no default em
 * silêncio e cobrar pelo gateway errado.
 */
export function getBillingProvider(): BillingProvider {
  const id = process.env.BILLING_PROVIDER || "mercado_pago";

  switch (id) {
    case "mercado_pago":
      return new MercadoPagoProvider();
    case "asaas":
      throw new Error("AsaasProvider ainda não implementado (#36)");
    default:
      throw new Error(`BILLING_PROVIDER desconhecido: ${id}`);
  }
}
