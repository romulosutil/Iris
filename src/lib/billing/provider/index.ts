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
 * **Sem default.** Havia um (`mercado_pago`), e ele contradizia o próprio
 * comentário que o justificava: um deploy que PERCA `BILLING_PROVIDER` — env não
 * reaplicada no Easypanel, serviço recriado, typo — voltava para o Mercado Pago
 * em silêncio, ou seja, para o trilho onde o Pix nunca foi implementado (D24) e
 * onde quem escolhe Pix paga cartão. "Não trocar de gateway em silêncio" e "ter
 * um default" são requisitos incompatíveis; ficou o primeiro. Faltando a env, o
 * erro é alto e nomeia o que fazer.
 *
 * Valor desconhecido estoura pela mesma razão, e isso já custou um incidente:
 * `mercadopago` sem underscore derrubou todo POST do webhook com 500
 * (04/08/2026).
 *
 * ## O que esta função decide — e o que ela NÃO decide
 *
 * Decide o gateway de vínculo **NOVO**, e só. Não é "o gateway do sistema":
 * `subscription.provider` é persistido POR LINHA, e assinatura criada num
 * gateway continua sendo consultada, conciliada e cobrada NAQUELE gateway para
 * sempre. Quem precisa do adapter de uma linha existente usa
 * `getProviderPorId(linha.provider)`, nunca esta função — confundir os dois é a
 * família de bug do D25 (ativação), do D26 (fechamento de ciclo) e do webhook do
 * MP: em todos, um id de um gateway foi parar na API do outro.
 */
export function getBillingProvider(): BillingProvider {
  const id = process.env.BILLING_PROVIDER;
  if (!id) {
    throw new Error(
      "BILLING_PROVIDER não configurada — defina `asaas` (trilho ativo) ou `mercado_pago`",
    );
  }
  return getProviderPorId(id);
}

/**
 * Resolve o adapter de uma linha JÁ EXISTENTE, a partir de `subscription.provider`.
 *
 * Existe separada de `getBillingProvider()` porque os dois papéis do adapter são
 * de fato diferentes, e tratá-los como um só foi o que produziu três defeitos
 * seguidos: gateway de vínculo novo (decidido pela env, hoje Asaas) versus
 * leitor/liquidador de linha antiga (decidido pelo DADO, imutável). Enquanto
 * existir uma única assinatura do Mercado Pago viva, o segundo papel não pode
 * seguir a env — a cobrança dela precisa continuar saindo no MP.
 *
 * Valor fora do enum estoura em vez de cair num default: uma linha com
 * `provider` ilegível é corrupção de estado, e escolher um gateway por palpite
 * significaria cobrar a clínica errada no lugar errado.
 */
export function getProviderPorId(id: string): BillingProvider {
  switch (id) {
    case "mercado_pago":
      return new MercadoPagoProvider();
    case "asaas":
      return new AsaasProvider();
    default:
      throw new Error(`BILLING_PROVIDER desconhecido: ${id}`);
  }
}
