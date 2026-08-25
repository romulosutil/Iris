import type {
  StatusAssinaturaProvider,
  StatusCobranca,
} from "@/lib/billing/provider/types";

/**
 * Conciliação de billing (#375) — comparação SOMENTE LEITURA entre o estado
 * local (`billing_cycle` / `subscription`) e o estado real no gateway.
 *
 * Nada aqui escreve. Nem no banco, nem no Asaas. O motivo não é preguiça: a
 * correção de uma divergência de faturamento é irreversível na maioria dos
 * ramos (emitir cobrança, revogar autorização de Pix Automático), e um
 * relatório que se auto-corrige é um segundo caminho de emissão convivendo com
 * `fecharCiclosVencendo` — sem a idempotência que o UNIQUE parcial de
 * `provider_charge_id` dá àquele. O que sai daqui é diagnóstico; a reação está
 * escrita em `infra/billing/runbook.md`.
 */

/** O que o gateway respondeu sobre UMA cobrança, já normalizado. */
export type EstadoRemotoCobranca =
  | { encontrada: true; status: StatusCobranca; valorCentavos: number }
  | { encontrada: false };

export type ClasseDivergenciaCiclo =
  /** O gateway não conhece o `provider_charge_id` que gravamos (404). */
  | "cobranca_inexistente_no_gateway"
  /** Pago no gateway, ciclo não fechado aqui — webhook perdido. */
  | "pagamento_nao_conciliado"
  /** Recusado no gateway, ciclo ainda esperando pagamento aqui. */
  | "recusa_nao_aplicada"
  /** Estornado no gateway; o ciclo não tem estado que represente isso. */
  | "estorno_nao_tratado"
  /** Ciclo `pago` aqui sem pagamento correspondente lá. */
  | "pago_sem_lastro"
  /** Mesmo status, valores diferentes. */
  | "valor_divergente";

export interface EntradaClassificacaoCiclo {
  statusLocal: string;
  valorLocalCentavos: number;
  /**
   * `true` quando OUTROS ciclos apontam para este via `debito_agrupado_em`
   * (#290): a cobrança da âncora carrega a soma da dívida, não o
   * `valor_centavos` desta linha. Comparar valor aqui acusaria divergência em
   * todo agrupamento — o status continua sendo conferido normalmente.
   */
  agrupaDebito: boolean;
  remoto: EstadoRemotoCobranca;
}

/**
 * A ORDEM dos ramos é a regra, não um detalhe de escrita:
 *
 * 1. "o gateway não conhece a cobrança" invalida qualquer outra leitura;
 * 2. estorno antes de `pago_sem_lastro`, porque estorno é o diagnóstico
 *    específico do mesmo sintoma genérico (pago aqui, não pago lá) e é o único
 *    que muda a reação do operador — há dinheiro a devolver ou já devolvido;
 * 3. valor por último, porque só faz sentido perguntar sobre valor quando os
 *    status já concordam.
 */
export function classificarDivergenciaCiclo(
  entrada: EntradaClassificacaoCiclo,
): ClasseDivergenciaCiclo | null {
  const { statusLocal, valorLocalCentavos, agrupaDebito, remoto } = entrada;

  if (!remoto.encontrada) return "cobranca_inexistente_no_gateway";

  if (remoto.status === "estornada") return "estorno_nao_tratado";

  if (statusLocal === "pago") {
    return remoto.status === "paga" ? null : "pago_sem_lastro";
  }

  if (remoto.status === "paga") return "pagamento_nao_conciliado";

  if (remoto.status === "recusada") {
    // `falhou` é justamente o estado que registra a recusa: concordam.
    return statusLocal === "falhou" ? null : "recusa_nao_aplicada";
  }

  // Status remoto `pendente` daqui para baixo. Só resta conferir valor.
  if (agrupaDebito) return null;
  if (remoto.valorCentavos !== valorLocalCentavos) return "valor_divergente";

  return null;
}

export type ClasseDivergenciaVinculo =
  | "vinculo_cancelado_no_gateway"
  | "vinculo_pausado_no_gateway"
  | "ativacao_nao_aplicada"
  | "vinculo_nao_autorizado";

/**
 * `statusLocal` é `subscription.status` como texto — `free_tier` e `canceled`
 * não chegam aqui porque a varredura não os seleciona (o primeiro não tem
 * vínculo; o segundo é terminal e concordar com um gateway que também cancelou
 * é o esperado).
 */
export function classificarDivergenciaVinculo(
  statusLocal: string,
  statusRemoto: StatusAssinaturaProvider,
): ClasseDivergenciaVinculo | null {
  if (statusRemoto === "cancelada") return "vinculo_cancelado_no_gateway";

  if (statusLocal === "setup_pending") {
    return statusRemoto === "autorizada" ? "ativacao_nao_aplicada" : null;
  }

  // `active` e `past_due` daqui para baixo: os dois exigem autorização viva.
  if (statusRemoto === "pausada") return "vinculo_pausado_no_gateway";
  if (statusRemoto === "pendente") return "vinculo_nao_autorizado";

  return null;
}
