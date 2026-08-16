import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { authDb } from "@/db/client";
import { billingCycle, subscription } from "@/db/schema";
import { conciliarPagamentoDeCiclo } from "./subscription";
import {
  BillingProviderError,
  getProviderPorId,
  type CobrancaEmitida,
  type FormaPagamentoCobranca,
} from "./provider";

/**
 * Débito de reativação — "cliente que cancela vira devedor" (#290).
 *
 * A #287/PR #307 entregou a metade de cima: no cancelamento, o ciclo
 * interrompido é apurado, congelado em pro-rata e fechado como `devido`, **sem
 * cobrança emitida** (a autorização de Pix Automático acabou de ser revogada —
 * não existe trilho para cobrar naquele instante). Este módulo é a metade de
 * baixo: quem cobra aquilo, e quando.
 *
 * ## O débito não tem tabela própria
 *
 * Ele É a soma dos `billing_cycle` em `devido` da assinatura. Uma entidade
 * "débito" paralela duplicaria a fonte da verdade do valor e do memorial
 * (`pacientes_contados`, `inicio`, `fim`) que a `0097` acabou de consolidar na
 * linha do ciclo — e valor de cobrança em dois lugares é valor que descola.
 *
 * ## Por que cobrar na PORTA DE ENTRADA
 *
 * A alternativa considerada e descartada era somar o débito à primeira fatura do
 * ciclo novo. Ela não fecha o buraco: bastaria cancelar de novo antes daquele
 * fechamento e repetir indefinidamente. Cobrar antes de reabrir é o que torna o
 * loop inútil — cada volta custa exatamente os dias usados na ida. É pela mesma
 * razão que não existe carência de escrita depois do cancelamento (ver o
 * comentário de `derivarSituacao`): carência é o dia grátis que o loop procura.
 */

/**
 * Piso da cobrança AVULSA que o Iris emite (gate de reativação, #290). Não
 * confundir com `PISO_TETO_AUTORIZACAO_CENTAVOS`, que é o piso do teto que o
 * PAGADOR autoriza no banco (#317) — sentidos opostos, mesmo domínio.
 *
 * Abaixo dele o débito ACUMULA — não é perdoado, não caduca e não trava a
 * reativação.
 *
 * **Este número é escolha conservadora, NÃO medição.** O valor mínimo de uma
 * cobrança Pix no Asaas não foi verificado contra a API nem contra a
 * documentação. A direção do erro é segura por construção:
 *
 * - piso real MENOR que R$ 5,00 → o único efeito é que débitos entre o piso real
 *   e R$ 5,00 esperam mais um cancelamento para serem cobrados;
 * - piso real MAIOR → a emissão volta 4xx, e o gate degrada (ver
 *   `resolverGateDeDebito`) em vez de trancar a clínica fora.
 *
 * Verificação pendente: emitir no sandbox uma cobrança de R$ 1,00 e uma de
 * R$ 3,00 contra um cliente de teste e registrar a resposta no runbook do
 * `infra/README.md`.
 */
export const PISO_COBRANCA_AVULSA_CENTAVOS = 500;

/** Prazo de vencimento da cobrança de débito, em dias. */
const DIAS_VENCIMENTO_DEBITO = 5;

/** Estados de ciclo que compõem o débito. Só `devido` — ver `RISCO-2` da spec. */
const STATUS_DEVIDO = "devido" as const;

/** Um ciclo `devido`, com o que o gate precisa saber para decidir sobre ele. */
export interface CicloDevido {
  id: string;
  valorCentavos: number;
  /**
   * Cobrança já emitida para este ciclo, se houver.
   *
   * Chega povoado por dois caminhos — cobrança de débito de um gate anterior, e
   * cobrança de CICLO de um ciclo `falhou` congelado no corte por carência
   * (`congelarCiclosComoDebito` preserva a coluna).
   */
  providerChargeId: string | null;
}

export interface DebitoLevantado {
  totalCentavos: number;
  /**
   * Ordenados por `inicio`, depois `id`. O primeiro é o mais antigo — a âncora.
   * A ordem é determinística de propósito: é ela que faz a reentrada do gate
   * eleger sempre a mesma âncora, em vez de eleger outra e emitir uma segunda
   * cobrança da mesma dívida.
   */
  ciclos: CicloDevido[];
}

/**
 * Forma de pagamento do débito, do jeito que a tela precisa renderizar.
 *
 * Reexportado da porta (#310): quem sabe montar a forma de pagamento é o
 * adapter, que é quem tem o `invoiceUrl` e o copia-e-cola na mão. O nome antigo
 * fica de propósito, para não mexer no import de `logic.ts`.
 */
export type FormaPagamentoDebito = FormaPagamentoCobranca;

/**
 * UMA cobrança do débito. O débito pode ter mais de uma (#310).
 *
 * ## Por que mais de uma
 *
 * Um ciclo `devido` pode já carregar uma cobrança VIVA e pagável no gateway.
 * Consolidar tudo numa cobrança nova exigiria cancelar a antiga, e o Asaas não
 * documenta quais status o `DELETE /payments/{id}` aceita — emitir por cima da
 * viva É a cobrança dupla que a #310 existe para evitar. Então cada cobrança
 * viva é reapresentada como está, e só o resto vira uma cobrança consolidada.
 *
 * Enquanto a política de reuso não entra (fatia seguinte), a lista sai sempre
 * com um elemento: o contrato muda de FORMA aqui, e de POLÍTICA depois.
 */
export interface CobrancaDoDebito {
  /** Ciclo âncora desta cobrança. */
  cicloId: string;
  providerChargeId: string;
  /** Quanto ESTA cobrança cobra — não o total do débito. */
  valorCentavos: number;
  /** `true` = reapresentada do gateway; `false` = emitida agora. */
  reaproveitada: boolean;
  situacao:
    | { estado: "pagavel"; pagamento: FormaPagamentoDebito }
    /**
     * Débito automático a caminho: há instrução `AWAITING_REQUEST`/`SCHEDULED`
     * nesta cobrança. Apresentar o copia-e-cola aqui é pedir pagamento em
     * duplicidade dentro da janela crítica do Pix Automático.
     */
    | { estado: "em_processamento" };
}

export type ResultadoGateDebito =
  /** Nada devido: segue o fluxo de ativação normal. */
  | { tipo: "sem_debito" }
  /**
   * Devido, mas pequeno demais para o gateway emitir — ou recusado por ele.
   * A clínica reativa mesmo assim e os ciclos CONTINUAM `devido`: o débito não
   * é perdoado, só adiado para a próxima volta, quando terá somado.
   */
  | {
      tipo: "adiado";
      totalCentavos: number;
      motivo: "abaixo_do_piso" | "recusa_do_gateway";
    }
  /**
   * Não deu para decidir com segurança: NADA foi emitido e a reativação NÃO
   * segue. É diferente de `adiado` — ali a clínica volta a usar o Iris, aqui
   * não. Reativação barrada é reversível por nova tentativa; cobrança dupla
   * não é (#310, D-3).
   */
  | {
      tipo: "bloqueado";
      totalCentavos: number;
      motivo: "gateway_indisponivel" | "cobranca_irrecuperavel";
    }
  /** Cobrança(s) na mesa: só depois de pagas a reativação segue. */
  | {
      tipo: "cobranca";
      totalCentavos: number;
      cobrancas: CobrancaDoDebito[];
    };

/**
 * A decisão, isolada do I/O para ser testável sem banco nem gateway.
 *
 * Três faixas, e a do meio é a que não é óbvia: débito abaixo do piso **passa**.
 * Bloquear ali seria um deadlock — a clínica não conseguiria reativar por dever
 * um valor que nenhum gateway aceita cobrar. Perdoar seria contradizer o
 * "débito não caduca" da #290 e devolver ao loop uns dias grátis por volta.
 * Adiar preserva as duas coisas: a dívida sobrevive e a porta continua aberta.
 */
export function decidirGate(
  totalCentavos: number,
  piso: number = PISO_COBRANCA_AVULSA_CENTAVOS,
): "sem_debito" | "adiar" | "cobrar" {
  if (totalCentavos <= 0) return "sem_debito";
  if (totalCentavos < piso) return "adiar";
  return "cobrar";
}

/**
 * Levanta o débito de uma assinatura a partir dos ciclos `devido`.
 *
 * A âncora é o ciclo mais ANTIGO, por determinismo: a mesma entrada elege sempre
 * a mesma âncora, então a reentrada do gate encontra a cobrança já emitida em
 * vez de eleger outro ciclo e emitir uma segunda cobrança da mesma dívida.
 */
export async function levantarDebito(
  subscriptionId: string,
): Promise<DebitoLevantado> {
  const ciclos = await authDb
    .select({
      id: billingCycle.id,
      valorCentavos: billingCycle.valorCentavos,
      providerChargeId: billingCycle.providerChargeId,
    })
    .from(billingCycle)
    .where(
      and(
        eq(billingCycle.subscriptionId, subscriptionId),
        eq(billingCycle.status, STATUS_DEVIDO),
      ),
    )
    .orderBy(asc(billingCycle.inicio), asc(billingCycle.id));

  return {
    totalCentavos: ciclos.reduce((soma, c) => soma + c.valorCentavos, 0),
    ciclos,
  };
}

/**
 * Gate de reativação: cobra o que se deve ANTES de reabrir a assinatura.
 *
 * Chamado por `iniciarAtivacaoAssinatura` antes de `iniciarAtivacao`. Devolve
 * `sem_debito`/`adiado` quando o chamador deve seguir para a autorização de
 * R$ 0,01, e `cobranca` quando não deve.
 *
 * ## Falha fechada em estado impossível, degrada em recusa do gateway
 *
 * São coisas diferentes e o desenho as separa de propósito:
 *
 * - **Assinatura sem `provider`/`provider_customer_id`** é estado impossível
 *   para quem já esteve `active` (a ativação grava os dois juntos). Aqui o gate
 *   LANÇA: deixar passar abriria a conta sem cobrar, e o modo de falha caro é
 *   esse.
 * - **Gateway recusou o valor (4xx)** é o caso do piso mal calibrado. Falhar
 *   fechado aqui trancaria a clínica fora PARA SEMPRE — protegeria a receita de
 *   um ciclo e destruiria a de todos os seguintes. O gate degrada para `adiado`,
 *   mantendo os ciclos em `devido`: nada é perdoado, só adiado.
 * - **Rede, timeout, 5xx, 401/408/429** continuam propagando. Instabilidade do
 *   Asaas não pode virar reativação grátis para quem estiver tentando naquele
 *   minuto — é a mesma régua de `reprocessarEventosPendentes`.
 */
export async function resolverGateDeDebito(
  clinicId: string,
): Promise<ResultadoGateDebito> {
  const [assinatura] = await authDb
    .select({
      id: subscription.id,
      provider: subscription.provider,
      providerCustomerId: subscription.providerCustomerId,
    })
    .from(subscription)
    .where(eq(subscription.clinicId, clinicId))
    .limit(1);

  // Sem assinatura não há ciclo, e sem ciclo não há débito — é o caso de quem
  // nunca ativou (cancelou no trial, ou está ativando pela primeira vez).
  if (!assinatura) return { tipo: "sem_debito" };

  const debito = await levantarDebito(assinatura.id);
  const decisao = decidirGate(debito.totalCentavos);

  if (decisao === "sem_debito") return { tipo: "sem_debito" };
  if (decisao === "adiar") {
    return {
      tipo: "adiado",
      totalCentavos: debito.totalCentavos,
      motivo: "abaixo_do_piso",
    };
  }

  const ancoraId = debito.ciclos[0]?.id ?? null;
  if (!ancoraId) {
    // Total > 0 sem âncora é impossível: o total vem das mesmas linhas.
    throw new Error(
      `Débito de ${debito.totalCentavos} centavos sem ciclo âncora na assinatura ${assinatura.id}`,
    );
  }

  if (!assinatura.provider || !assinatura.providerCustomerId) {
    throw new BillingProviderError(
      `Assinatura ${assinatura.id} deve ${debito.totalCentavos} centavos mas não tem provedor/cliente gravado — não dá para saber onde cobrar.`,
    );
  }

  const provider = getProviderPorId(assinatura.provider);

  let cobranca: CobrancaEmitida;
  try {
    cobranca = await provider.emitirCobrancaAvulsa({
      clienteId: assinatura.providerCustomerId,
      valorCentavos: debito.totalCentavos,
      // Determinística por âncora: é ela que torna a reentrada idempotente no
      // gateway, mesmo que o processo morra entre o POST e o UPDATE local.
      referenciaExterna: `debito:${ancoraId}`,
      descricao:
        "Iris — débito do ciclo interrompido no cancelamento, para reativar a assinatura",
      vencimento: somarDias(new Date(), DIAS_VENCIMENTO_DEBITO),
    });
  } catch (e) {
    if (recusaDefinitivaDoGateway(e)) {
      console.warn("[billing-debito] gateway recusou a cobrança de débito", {
        clinicId,
        totalCentavos: debito.totalCentavos,
        status: e instanceof BillingProviderError ? e.status : undefined,
        err: e instanceof Error ? e.message : String(e),
      });
      return {
        tipo: "adiado",
        totalCentavos: debito.totalCentavos,
        motivo: "recusa_do_gateway",
      };
    }
    throw e;
  }

  await registrarCobrancaDeDebito(
    ancoraId,
    debito.ciclos.slice(1).map((c) => c.id),
    cobranca,
  );

  // Webhook atrasado: a cobrança já está paga no gateway e o estado local ainda
  // não sabe. Conciliar aqui (em vez de mandar a clínica esperar) é o mesmo
  // princípio do reaproveitamento de vínculo em `iniciarAtivacao`.
  if (cobranca.status === "paga") {
    await conciliarPagamentoDeCiclo(cobranca.providerChargeId, "paga");
    return { tipo: "sem_debito" };
  }

  /**
   * Cobrança estornada é o único estado do qual não há saída automática — e
   * agora ela BARRA em vez de LANÇAR (#310, D-7 e P-5).
   *
   * A idempotência do adapter é por `externalReference`, e ela é o que impede
   * cobrar duas vezes a mesma dívida — inclusive no caso em que o processo morre
   * entre o POST e o UPDATE local. O preço disso é que uma cobrança ESTORNADA
   * seria devolvida para sempre, com um copia-e-cola que nenhum banco aceita, e
   * o gate ficaria congelado sem nada acusar.
   *
   * Emitir outra automaticamente seria pior: o estorno é decisão comercial
   * humana (é o que `conciliarPagamentoDeCiclo` já diz sobre `estornada`), e
   * cobrar de novo por cima dela é justamente o que ninguém quer que um job
   * faça sozinho. O que mudou é a FORMA de barrar: o `throw` daqui atravessava
   * as camadas e caía na copy genérica de "fale com o suporte", que também
   * serve para queda de rede. `bloqueado` diz exatamente o que é, com a copy
   * certa, e sem exceção — mesma semântica (barulhento, exige decisão humana,
   * não reativa).
   *
   * `recusada` NÃO entra aqui: no Asaas ela vem de `OVERDUE`, e cobrança Pix
   * vencida continua pagável — devolver o mesmo copia-e-cola é o certo.
   */
  if (cobranca.status === "estornada") {
    console.warn("[billing-debito] cobrança de débito estornada trava o gate", {
      clinicId,
      providerChargeId: cobranca.providerChargeId,
      totalCentavos: debito.totalCentavos,
    });
    return {
      tipo: "bloqueado",
      totalCentavos: debito.totalCentavos,
      motivo: "cobranca_irrecuperavel",
    };
  }

  /**
   * Uma entrada só: a política continua a de hoje — todo o débito vira UMA
   * cobrança nova, ancorada no ciclo mais antigo. A lista existe porque o
   * reuso da cobrança viva (#310) produz N, e mudar a forma antes da política
   * é o que deixa o teste do reuso falhar por um motivo só.
   */
  return {
    tipo: "cobranca",
    totalCentavos: debito.totalCentavos,
    cobrancas: [
      {
        cicloId: ancoraId,
        providerChargeId: cobranca.providerChargeId,
        valorCentavos: debito.totalCentavos,
        reaproveitada: false,
        situacao: { estado: "pagavel", pagamento: formaDePagamento(cobranca) },
      },
    ],
  };
}

/**
 * Grava a cobrança na âncora e agrupa os demais ciclos nela.
 *
 * Uma cobrança só para N ciclos: `provider_charge_id` é UNIQUE parcial (`0075`),
 * então o id não cabe nas N linhas — os outros apontam para a âncora por
 * `debito_agrupado_em` e são liquidados junto quando o webhook confirma.
 */
async function registrarCobrancaDeDebito(
  ancoraId: string,
  outrosIds: string[],
  cobranca: CobrancaEmitida,
): Promise<void> {
  await authDb
    .update(billingCycle)
    .set({
      providerChargeId: cobranca.providerChargeId,
      cobrancaEmitidaEm: new Date(),
      erro: null,
    })
    .where(eq(billingCycle.id, ancoraId));

  if (outrosIds.length === 0) return;

  await authDb
    .update(billingCycle)
    .set({ debitoAgrupadoEm: ancoraId })
    .where(
      and(
        // `ne(id, ancora)` além do `inArray`: o CHECK do banco proíbe a
        // autorreferência, e uma lista malformada derrubaria o UPDATE inteiro.
        ne(billingCycle.id, ancoraId),
        inArray(billingCycle.id, outrosIds),
      ),
    );
}

function formaDePagamento(cobranca: CobrancaEmitida): FormaPagamentoDebito {
  if (cobranca.pixCopiaECola) {
    return {
      forma: "pix_copia_e_cola",
      brCode: cobranca.pixCopiaECola,
      ...(cobranca.urlPagamento ? { urlPagamento: cobranca.urlPagamento } : {}),
    };
  }
  if (cobranca.urlPagamento) {
    return { forma: "link", urlPagamento: cobranca.urlPagamento };
  }
  // Cobrança existe no gateway mas não veio forma nenhuma de pagar. Falhar alto:
  // renderizar um QR vazio faria a clínica achar que pagou o que não pagou.
  throw new BillingProviderError(
    `Cobrança de débito ${cobranca.providerChargeId} emitida sem copia-e-cola nem URL de pagamento`,
  );
}

/**
 * 4xx do gateway que NÃO é transitório = recusa explícita do valor/da cobrança.
 * Mesma régua de `reprocessarEventosPendentes`: 401/408/429 são 4xx que voltam a
 * funcionar sozinhos, e tratá-los como recusa abriria a conta por instabilidade.
 */
function recusaDefinitivaDoGateway(e: unknown): boolean {
  const TRANSITORIOS_APESAR_DE_4XX = new Set([401, 408, 429]);
  return (
    e instanceof BillingProviderError &&
    typeof e.status === "number" &&
    e.status >= 400 &&
    e.status < 500 &&
    !TRANSITORIOS_APESAR_DE_4XX.has(e.status)
  );
}

function somarDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}
