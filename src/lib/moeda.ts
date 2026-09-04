/**
 * Formata centavos como moeda brasileira ("R$ 745,00").
 *
 * Atenção: o `Intl` usa espaço não-quebrável (U+00A0) entre o símbolo e o
 * número — comparar a string inteira com `"R$ 745,00"` digitado à mão falha.
 * Compare o trecho numérico, ou normalize o espaço antes.
 */
export function formatarBRL(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}
