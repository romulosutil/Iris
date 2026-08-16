import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { authDb } from "@/db/client";
import { billingCycle, subscription } from "@/db/schema";
import { conciliarPagamentoDeCiclo } from "./subscription";
import {
  BillingProviderError,
  getProviderPorId,
  type BillingProvider,
  type CobrancaEmitida,
  type CobrancaParaReuso,
  type FormaPagamentoCobranca,
  type MotivoCobrancaInexistente,
  type MotivoNaoReuso,
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
 * **Este número é medição, não estimativa** (15/08/2026, sandbox do Asaas —
 * registro cru em `infra/README.md`, seção "Runbook — sessão de medição no
 * sandbox do Asaas (#321)", Medição 6). Sondando `POST /payments` com
 * `billingType: "PIX"` em valores crescentes, a API recusa com `invalid_object`
 * e mensagem nomeada ("O valor da cobrança … menos o valor do desconto … não
 * pode ser menor que R$ 5,00") em R$ 0,01, R$ 0,50, R$ 1,00 e R$ 3,00, e aceita
 * exatamente em R$ 5,00. Ou seja: o `500` daqui **coincide com o piso real do
 * gateway**, não é folga por cima dele.
 *
 * A regra que o Asaas impõe é sobre o LÍQUIDO — `value − discount >= 500`, não
 * `value >= 500`. Hoje as duas coincidem apenas porque nenhum caminho de
 * emissão do Iris envia `discount` — são só dois, e os dois montam o corpo do
 * `POST /payments` sem esse campo: `emitirCobrancaDeCiclo` e
 * `emitirCobrancaAvulsa`, em `./provider/asaas.ts`. Verificado por varredura:
 * `discount` não aparece em nenhum outro ponto de `src/lib/billing/`. Quem
 * acrescentar desconto a uma emissão quebra a coincidência: uma
 * cobrança de R$ 5,00 com R$ 1,00 de desconto passa neste piso e — **pela regra
 * que a própria mensagem do gateway enuncia** — seria recusada lá. Isso é
 * dedução, não medição: as cinco sondagens da Medição 6 rodaram todas com
 * desconto R$ 0,00, e `discount ≠ 0` **não foi sondado**.
 *
 * O piso é do `POST /payments` e **não** vale para o QR imediato da autorização
 * de Pix Automático — lá a mesma sessão de medição criou autorizações com
 * `immediateQrCode.originalValue: 0.01` aceitas.
 *
 * Com o piso real conhecido, o que sobra é a consequência viva: o ramo `adiar`
 * existe porque o gateway recusa de fato abaixo daqui (não por precaução), e a
 * degradação 4xx de `resolverGateDeDebito` deixa de ser rede contra a nossa
 * ignorância do piso para ser rede contra o Asaas **mudá-lo** — se o piso subir
 * lá e não aqui, a emissão volta 4xx e o gate adia em vez de trancar a clínica
 * fora.
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
  /**
   * Âncora sob a qual este ciclo já foi agrupado numa cobrança anterior.
   *
   * **Sem este campo o gate cobra duas vezes na reentrada.** Uma cobrança de
   * débito cobre N ciclos: o id fica só na âncora (`provider_charge_id` é UNIQUE
   * parcial, `0075`) e os demais apontam para ela por `debito_agrupado_em`. Quem
   * lê apenas `providerChargeId` vê o ciclo agrupado como "ciclo sem cobrança",
   * elege-o âncora de uma cobrança NOVA — com `referenciaExterna` virgem, que a
   * idempotência do gateway não barra — e a clínica termina com duas cobranças
   * vivas somando mais do que deve, sendo que pagar a maior quita só uma parte.
   */
  agrupadoEm: string | null;
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
 * A ordem é determinística (mais antigo primeiro): a mesma entrada elege sempre
 * a mesma âncora, então a reentrada do gate encontra a cobrança já emitida em
 * vez de eleger outro ciclo e emitir uma segunda cobrança da mesma dívida.
 * Quem escolhe a âncora é `emitirConsolidada`, e ela escolhe o mais antigo SEM
 * cobrança prévia e NÃO agrupado — ver o P-4 lá.
 *
 * `debito_agrupado_em` entra na seleção porque é metade do vínculo ciclo↔cobrança:
 * a outra metade (`provider_charge_id`) mora só na âncora. Levantar um sem o
 * outro faz todo ciclo agrupado passar por "ciclo sem cobrança" na reentrada.
 */
export async function levantarDebito(
  subscriptionId: string,
): Promise<DebitoLevantado> {
  const ciclos = await authDb
    .select({
      id: billingCycle.id,
      valorCentavos: billingCycle.valorCentavos,
      providerChargeId: billingCycle.providerChargeId,
      agrupadoEm: billingCycle.debitoAgrupadoEm,
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
 *
 * ## Reuso da cobrança viva (#310)
 *
 * Antes de emitir, cada ciclo que já carrega `provider_charge_id` é consultado
 * no gateway. O que ainda é pagável é REAPRESENTADO como está — emitir por cima
 * de uma cobrança viva é a cobrança dupla que a issue existe para evitar. Só o
 * resto vira uma cobrança nova consolidada. Falha ao CONSULTAR é fail-closed
 * (`bloqueado`, nada emitido, nada reativado); falha ao EMITIR mantém a régua
 * de sempre (recusa 4xx adia, o resto propaga).
 *
 * Do lado do "não reaproveitável", **só o 404 segue para a cobrança nova**;
 * todo outro desfecho barra. A cobrança existir no gateway e não ser
 * REAPROVEITÁVEL por nós não significa que o cliente não consiga pagá-la — ver
 * o comentário do ramo `morta` lá embaixo.
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

  if (!assinatura.provider || !assinatura.providerCustomerId) {
    throw new BillingProviderError(
      `Assinatura ${assinatura.id} deve ${debito.totalCentavos} centavos mas não tem provedor/cliente gravado — não dá para saber onde cobrar.`,
    );
  }

  const provider = getProviderPorId(assinatura.provider);

  /**
   * Divisão do débito em dois conjuntos (#310, D-2).
   *
   * (a) ciclos com cobrança VIVA e pagável no gateway → cada um reapresenta a
   *     SUA cobrança. Consolidá-los numa cobrança nova exigiria cancelar as
   *     antigas, e o Asaas não documenta quais status o `DELETE /payments/{id}`
   *     aceita — emitir por cima da viva É a cobrança dupla que a issue existe
   *     para evitar.
   * (b) todo o resto (sem cobrança, ou com cobrança 404) → UMA cobrança nova
   *     consolidada, exatamente como antes desta issue.
   *
   * A divisão percorre só as ÂNCORAS. Ciclo agrupado não é uma terceira
   * categoria: ele já pertence à cobrança da âncora dele, e o destino dele é o
   * destino dela — cobrança reapresentada cobre os agrupados junto (o valor vem
   * do gateway, não da linha), cobrança liquidada os liquida pela cascata de
   * `liquidarCiclo`, cobrança 404 os arrasta para (b) atrás da mesma âncora.
   */
  const porAncora = indexarAgrupados(debito.ciclos);
  let reaproveitadas: CobrancaDoDebito[] = [];
  let paraConsolidar: CicloDevido[] = [];
  /** Alguma cobrança voltou já paga e foi liquidada dentro deste laço (D-4). */
  let houveLiquidacao = false;

  for (const ciclo of porAncora.ancoras) {
    const agrupados = porAncora.filhosDe.get(ciclo.id) ?? [];

    // Quem nunca teve cobrança não tem o que consultar: uma ida ao gateway por
    // ciclo é latência na porta de entrada da clínica, paga por quem não usa.
    if (!ciclo.providerChargeId) {
      paraConsolidar.push(ciclo, ...agrupados);
      continue;
    }

    let estado: CobrancaParaReuso;
    try {
      estado = await provider.consultarCobrancaParaReuso(
        ciclo.providerChargeId,
      );
    } catch (e) {
      /**
       * Fail-closed (D-3). Não dá para saber se a cobrança antiga está viva, e
       * emitir sem saber é cobrar duas vezes. NADA é emitido e a reativação NÃO
       * segue — os ciclos ficam `devido` e a próxima tentativa reabre a decisão.
       * Reativação barrada é reversível; cobrança dupla não é.
       */
      console.warn(
        "[billing-reuso] gateway indisponível na consulta de reuso",
        {
          clinicId,
          cicloId: ciclo.id,
          providerChargeId: ciclo.providerChargeId,
          err: e instanceof Error ? e.message : String(e),
        },
      );
      return {
        tipo: "bloqueado",
        totalCentavos: debito.totalCentavos,
        motivo: "gateway_indisponivel",
      };
    }

    if (estado.reuso === "paga") {
      /**
       * D-4 — dinheiro já recebido, webhook ainda não chegou. Liquida no mesmo
       * caminho do webhook (cascata de agrupados incluída) e sai do débito.
       *
       * Os agrupados entram em (b) e são retirados depois pela recontagem, em
       * vez de simplesmente sumirem aqui. A diferença aparece quando a cascata
       * NÃO alcança um deles: sumindo, ele viraria dívida que nunca mais é
       * cobrada; passando pela recontagem, quem continuar `devido` no banco é
       * cobrado. O banco decide, não a nossa expectativa sobre a cascata.
       */
      await conciliarPagamentoDeCiclo(ciclo.providerChargeId, "paga");
      houveLiquidacao = true;
      paraConsolidar.push(...agrupados);
      continue;
    }
    if (estado.reuso === "morta") {
      // D-7 — estado terminal é ramo explícito, nunca exceção: um `throw` aqui
      // travaria o gate desta clínica para sempre.
      console.warn("[billing-reuso] cobrança antiga não é reaproveitável", {
        clinicId,
        cicloId: ciclo.id,
        providerChargeId: ciclo.providerChargeId,
        motivo: estado.motivo,
      });
      /**
       * **Só `nao_encontrada` (404) segue para (b). Todo outro desfecho
       * não-pagável BLOQUEIA** — nunca consolida por cima.
       *
       * O 404 devolve o ciclo a (b) COMO SE ele nunca tivesse tido cobrança, e
       * essa distinção é o que impede o D-3 de virar o seu próprio oposto: a
       * âncora de (b) precisa de referência externa virgem (P-4), e o teste de
       * virgindade é `providerChargeId == null`. Um débito de um ciclo só, cujo
       * id o gateway não reconhece, não teria âncora nenhuma, cairia em
       * `irrecuperavel` e travaria a clínica em "fale com o suporte" para
       * sempre. É seguro porque o perigo do P-4 é a idempotência do adapter
       * (`GET /payments?externalReference=`) devolver a MESMA cobrança morta, e
       * isso exige que ela exista: um 404 é o gateway afirmando que não existe.
       *
       * Os demais motivos descrevem cobranças que EXISTEM no gateway, e mandar
       * o ciclo para (b) mantendo o id era duplamente errado:
       *
       * - **"não reaproveitável" não é "não pagável pelo cliente".** O adapter
       *   classifica por allow-list (`PENDING`/`OVERDUE`), então
       *   `status_nao_pagavel` engloba `DUNNING_REQUESTED`/`DUNNING_RECEIVED` —
       *   cobranças em cobrança automática que o cliente CONTINUA podendo pagar.
       *   Consolidar por cima delas emite uma segunda cobrança sobre uma viva:
       *   exatamente a cobrança dupla que a #310 existe para fechar.
       * - **Mantendo o id, a emissão nem chega a acontecer**: sem âncora virgem
       *   `emitirConsolidada` devolve `irrecuperavel`, e o resultado prático era
       *   `bloqueado/cobranca_irrecuperavel` permanente — a mesma parada, só que
       *   por acidente e sem log que a nomeasse.
       *
       * `removida` (cobrança apagada no painel) fica bloqueando DE PROPÓSITO.
       * Libertar o id ali arriscaria a idempotência de `debito:<âncora>`
       * ressuscitar a cobrança deletada, e **isso não está medido** — o Asaas
       * não documenta se `GET /payments?externalReference=` devolve removidas.
       * Entre supor e barrar, revisão humana é o desfecho honesto: barrar é
       * reversível, cobrança dupla não é.
       */
      if (!provaQueNaoExisteMais(estado.motivo)) {
        return {
          tipo: "bloqueado",
          totalCentavos: debito.totalCentavos,
          motivo: "cobranca_irrecuperavel",
        };
      }
      paraConsolidar.push({ ...ciclo, providerChargeId: null }, ...agrupados);
      continue;
    }

    reaproveitadas.push({
      cicloId: ciclo.id,
      providerChargeId: ciclo.providerChargeId,
      /**
       * O valor é o que o GATEWAY diz que esta cobrança cobra, não o do ciclo.
       *
       * Uma cobrança de débito pode ter sido consolidada sobre N ciclos: o
       * valor dela é a soma, e só a linha da âncora carrega o id. Ler
       * `ciclo.valorCentavos` mostraria na tela o valor de UM ciclo, e a copy
       * "pagar todas quita o total de {total}" ficaria factualmente falsa —
       * a clínica pagaria o QR e continuaria devendo, sem entender por quê.
       *
       * `em_processamento` não traz valor (não há forma de pagamento a exibir),
       * então ali a soma local — âncora + agrupados — é a melhor aproximação
       * que temos do que aquela cobrança cobre.
       */
      valorCentavos:
        estado.reuso === "pagavel"
          ? estado.valorCentavos
          : ciclo.valorCentavos + somaDe(agrupados.map((c) => c.valorCentavos)),
      reaproveitada: true,
      situacao:
        estado.reuso === "pagavel"
          ? { estado: "pagavel", pagamento: estado.pagamento }
          : { estado: "em_processamento" },
    });
  }

  /**
   * D-4 — recomputar o débito ANTES de montar (b), e não confiar no snapshot.
   *
   * `debito.ciclos` foi lido antes do laço. Liquidar uma cobrança já paga lá
   * dentro derruba a âncora **e os agrupados dela** (cascata de `liquidarCiclo`),
   * e qualquer um desses ciclos que já estivesse na mão viraria uma cobrança
   * nova por um débito que acabou de ser quitado — POST emitido por ciclo já
   * `pago`, com o gate ainda devolvendo `cobranca` em vez de liberar a
   * reativação. O banco é o oráculo do que sobrou; o snapshot não é.
   */
  if (houveLiquidacao) {
    const aindaDevido = new Set(
      (await levantarDebito(assinatura.id)).ciclos.map((c) => c.id),
    );
    paraConsolidar = paraConsolidar.filter((c) => aindaDevido.has(c.id));
    reaproveitadas = reaproveitadas.filter((c) => aindaDevido.has(c.cicloId));
  }

  const totalVivo =
    somaDe(reaproveitadas.map((c) => c.valorCentavos)) +
    somaDe(paraConsolidar.map((c) => c.valorCentavos));
  if (totalVivo <= 0) return { tipo: "sem_debito" };

  const totalConsolidar = somaDe(paraConsolidar.map((c) => c.valorCentavos));
  const novas = await emitirConsolidada({
    // O provider vai por PARÂMETRO, já resolvido. Resolver de novo lá dentro
    // reintroduziria a leitura da env que o D26 proíbe: o adapter é resolvido
    // POR LINHA (`subscription.provider`), nunca pelo ambiente.
    provider,
    clinicId,
    clienteId: assinatura.providerCustomerId,
    ciclos: paraConsolidar,
    totalCentavos: totalConsolidar,
  });

  if (novas.tipo === "irrecuperavel" && reaproveitadas.length === 0) {
    // Sem âncora de referência virgem, ou cobrança nova devolvida estornada:
    // toda emissão cairia na mesma cobrança morta por idempotência (P-4/P-5).
    // Se há cobrança viva, ela ainda vale — melhor a clínica pagar o que é
    // pagável do que barrar tudo.
    return {
      tipo: "bloqueado",
      totalCentavos: totalVivo,
      motivo: "cobranca_irrecuperavel",
    };
  }

  const cobrancas = [...reaproveitadas, ...novas.cobrancas];
  if (cobrancas.length === 0) {
    /**
     * Nada na mesa — mas por DUAS razões que não são o mesmo estado.
     *
     * Se a cobrança recém-emitida voltou já paga, `emitirConsolidada` a
     * conciliou ali mesmo: os ciclos de (b) estão `pago` e não sobrou dívida
     * nenhuma. O estado verdadeiro é `sem_debito`.
     *
     * `totalVivo` é somado ANTES da emissão e por isso não enxerga essa
     * liquidação — quem enxerga é o sinal que a emissão devolve. Sem ele, o
     * caso caía em `adiado` com `motivo: "abaixo_do_piso"`, e as duas metades
     * eram falsas: `adiado` afirma que sobrou dívida a cobrar na próxima volta
     * (não sobrou, o ciclo está `pago`), e `abaixo_do_piso` afirma que o valor
     * não alcançou o piso (alcançou — foi justamente por isso que a cobrança
     * chegou a ser emitida).
     *
     * A correção não é cosmética por os dois ramos seguirem hoje para a
     * ativação: `adiado.totalCentavos` é o campo que responde "quanto esta
     * clínica ainda deve", e devolver ali um valor de dívida viva para uma
     * dívida quitada é mentira que o próximo leitor do gate consome sem
     * reconferir no banco.
     */
    if (novas.conciliada) return { tipo: "sem_debito" };
    // Nada vivo e nada emitido: o conjunto (b) foi recusado pelo gateway ou
    // ficou abaixo do piso. A dívida NÃO é perdoada — os ciclos continuam
    // `devido` e voltam somados na próxima volta.
    return {
      tipo: "adiado",
      totalCentavos: totalVivo,
      motivo: novas.motivoAdiamento ?? "abaixo_do_piso",
    };
  }

  return { tipo: "cobranca", totalCentavos: totalVivo, cobrancas };
}

function somaDe(valores: number[]): number {
  return valores.reduce((soma, v) => soma + v, 0);
}

/**
 * O motivo prova que a cobrança não existe mais PARA NINGUÉM?
 *
 * Só quem passa aqui pode virar cobrança nova. A porta divide os motivos em dois
 * grupos justamente para esta pergunta (`MotivoCobrancaInexistente` versus
 * `MotivoReusoIndeterminado`), e o mapa abaixo é a tradução do grupo em código:
 * o `Record` sobre a união é o que faz o compilador exigir uma decisão explícita
 * se um motivo novo entrar no grupo "não existe mais". Uma comparação solta
 * (`motivo !== "nao_encontrada"`) aceitaria o motivo novo em silêncio — no lado
 * errado, que é o que emite cobrança em cima de cobrança viva.
 */
function provaQueNaoExisteMais(
  motivo: MotivoNaoReuso,
): motivo is MotivoCobrancaInexistente {
  const INEXISTENTES: Record<MotivoCobrancaInexistente, true> = {
    nao_encontrada: true,
  };
  return Object.hasOwn(INEXISTENTES, motivo);
}

/**
 * Separa os ciclos `devido` entre ÂNCORAS e AGRUPADOS (#310).
 *
 * Agrupado é ciclo que uma cobrança anterior já cobre: ele aponta para a âncora
 * por `debito_agrupado_em` e não carrega `provider_charge_id` (a coluna é UNIQUE
 * parcial, `0075`). Decidir sobre ele isoladamente é o que produz a segunda
 * cobrança na reentrada do gate.
 *
 * ## Ponteiro pendurado volta a ser âncora, de propósito
 *
 * Se a âncora apontada NÃO está mais entre os ciclos `devido` (foi paga, e a
 * cascata deveria ter liquidado este junto), o ponteiro é lixo: não há cobrança
 * NOSSA em aberto cobrindo este ciclo. Ele volta a ser âncora candidata, com o
 * ponteiro zerado aqui — deixá-lo em silêncio o tornaria dívida que nunca é
 * cobrada, e mantê-lo como agrupado de uma âncora inexistente derrubaria o gate
 * em `irrecuperavel` permanente, que é o "trancar a clínica fora" do D-3.
 * Zerar a coluna no banco é trabalho de `registrarCobrancaDeDebito` (P-6).
 */
function indexarAgrupados(ciclos: CicloDevido[]): {
  ancoras: CicloDevido[];
  filhosDe: Map<string, CicloDevido[]>;
} {
  const devidos = new Set(ciclos.map((c) => c.id));
  const ancoras: CicloDevido[] = [];
  const filhosDe = new Map<string, CicloDevido[]>();

  for (const ciclo of ciclos) {
    if (ciclo.agrupadoEm && devidos.has(ciclo.agrupadoEm)) {
      const filhos = filhosDe.get(ciclo.agrupadoEm) ?? [];
      filhos.push(ciclo);
      filhosDe.set(ciclo.agrupadoEm, filhos);
      continue;
    }
    if (ciclo.agrupadoEm) {
      console.warn("[billing-reuso] ciclo agrupado sob âncora que não deve", {
        cicloId: ciclo.id,
        agrupadoEm: ciclo.agrupadoEm,
      });
    }
    ancoras.push({ ...ciclo, agrupadoEm: null });
  }

  return { ancoras, filhosDe };
}

type ResultadoEmissao = {
  tipo: "ok" | "irrecuperavel";
  cobrancas: CobrancaDoDebito[];
  motivoAdiamento?: "abaixo_do_piso" | "recusa_do_gateway";
  /**
   * A cobrança emitida voltou JÁ PAGA e foi conciliada aqui dentro.
   *
   * Existe porque "lista de cobranças vazia" tem dois significados opostos —
   * "não deu para cobrar" (a dívida sobrevive) e "acabou de ser quitada" (não
   * sobrou dívida) — e o chamador não consegue distingui-los pela lista nem
   * pelo total, que é somado antes da emissão.
   */
  conciliada?: boolean;
};

/**
 * Emite UMA cobrança consolidada para o conjunto (b).
 *
 * ## A âncora é o mais antigo SEM cobrança prévia (#310, P-4)
 *
 * A `referenciaExterna` é `debito:<âncora>`, e é ela que dá idempotência no
 * gateway. Se a âncora fosse um ciclo que já carrega uma cobrança MORTA, o
 * adapter encontraria aquela mesma cobrança pela referência e a devolveria —
 * ressuscitando exatamente o estado que acabamos de classificar como não
 * pagável, e travando o gate para sempre. Uma âncora sem cobrança prévia
 * garante uma referência externa virgem.
 *
 * ## O erro de EMISSÃO continua com a régua de antes da #310 (P-9)
 *
 * `recusaDefinitivaDoGateway` ⇒ adia; 5xx/rede/4xx transitório ⇒ `throw`. O
 * fail-closed do D-3 fala da CONSULTA, que é caminho novo. A assimetria é
 * deliberada: instabilidade na emissão nunca virou reativação grátis, e mudar
 * isso aqui alargaria o diff sem a issue pedir.
 */
async function emitirConsolidada(dados: {
  provider: BillingProvider;
  clinicId: string;
  clienteId: string;
  ciclos: CicloDevido[];
  totalCentavos: number;
}): Promise<ResultadoEmissao> {
  if (dados.ciclos.length === 0) return { tipo: "ok", cobrancas: [] };
  if (decidirGate(dados.totalCentavos) !== "cobrar") {
    // Piso: só governa a EMISSÃO (P-8). Cobrança que já existe é apresentada
    // mesmo com total pequeno — ela já foi aceita pelo gateway uma vez, e
    // esconder um código de pagamento vivo seria pedir que a clínica pague por
    // um canal que a tela não mostra.
    return { tipo: "ok", cobrancas: [], motivoAdiamento: "abaixo_do_piso" };
  }

  /**
   * Âncora = mais antigo SEM cobrança prévia e NÃO agrupado.
   *
   * O `!c.agrupadoEm` é a metade nova (#310): um ciclo agrupado também tem
   * `provider_charge_id` nulo — o id mora na âncora dele —, então sem esta
   * cláusula ele passaria no teste de "referência virgem", viraria âncora de uma
   * cobrança nova e a dívida dele seria cobrada duas vezes: uma pela cobrança da
   * âncora antiga, que continua viva, outra por esta.
   */
  const ancora = dados.ciclos.find((c) => !c.providerChargeId && !c.agrupadoEm);
  if (!ancora) {
    console.warn("[billing-reuso] sem âncora de referência virgem no débito", {
      clinicId: dados.clinicId,
      cicloIds: dados.ciclos.map((c) => c.id),
    });
    return { tipo: "irrecuperavel", cobrancas: [] };
  }

  let cobranca: CobrancaEmitida;
  try {
    cobranca = await dados.provider.emitirCobrancaAvulsa({
      clienteId: dados.clienteId,
      valorCentavos: dados.totalCentavos,
      // Determinística por âncora: é ela que torna a reentrada idempotente no
      // gateway, mesmo que o processo morra entre o POST e o UPDATE local.
      referenciaExterna: `debito:${ancora.id}`,
      descricao:
        "Iris — débito do ciclo interrompido no cancelamento, para reativar a assinatura",
      vencimento: somarDias(new Date(), DIAS_VENCIMENTO_DEBITO),
    });
  } catch (e) {
    if (recusaDefinitivaDoGateway(e)) {
      console.warn("[billing-debito] gateway recusou a cobrança de débito", {
        clinicId: dados.clinicId,
        totalCentavos: dados.totalCentavos,
        status: e instanceof BillingProviderError ? e.status : undefined,
        err: e instanceof Error ? e.message : String(e),
      });
      return {
        tipo: "ok",
        cobrancas: [],
        motivoAdiamento: "recusa_do_gateway",
      };
    }
    // 5xx, rede e 4xx transitório continuam propagando, como antes da #310:
    // instabilidade do gateway não pode virar reativação grátis.
    throw e;
  }

  const outros = dados.ciclos
    .filter((c) => c.id !== ancora.id)
    .map((c) => c.id);
  await registrarCobrancaDeDebito(ancora.id, outros, cobranca);

  // Webhook atrasado: a cobrança já está paga no gateway e o estado local ainda
  // não sabe. Conciliar aqui (em vez de mandar a clínica esperar) é o mesmo
  // princípio do reaproveitamento de vínculo em `iniciarAtivacao`.
  if (cobranca.status === "paga") {
    await conciliarPagamentoDeCiclo(cobranca.providerChargeId, "paga");
    return { tipo: "ok", cobrancas: [], conciliada: true };
  }

  /**
   * Cobrança estornada é o único estado do qual não há saída automática — e ela
   * BARRA em vez de LANÇAR (#310, D-7 e P-5).
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
   * serve para queda de rede. `irrecuperavel` sobe para o chamador, que decide
   * entre barrar tudo (nada vivo) e apresentar só o que é pagável.
   *
   * `recusada` NÃO entra aqui: no Asaas ela vem de `OVERDUE`, e cobrança Pix
   * vencida continua pagável — devolver o mesmo copia-e-cola é o certo.
   */
  if (cobranca.status === "estornada") {
    console.warn("[billing-debito] cobrança de débito estornada trava o gate", {
      clinicId: dados.clinicId,
      providerChargeId: cobranca.providerChargeId,
      totalCentavos: dados.totalCentavos,
    });
    return { tipo: "irrecuperavel", cobrancas: [] };
  }

  return {
    tipo: "ok",
    cobrancas: [
      {
        cicloId: ancora.id,
        providerChargeId: cobranca.providerChargeId,
        valorCentavos: dados.totalCentavos,
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
      // P-6/#310: a âncora pode ter sido, num gate anterior, um ciclo AGRUPADO
      // sob outra âncora que não deve mais nada (ponteiro pendurado, ver
      // `indexarAgrupados`). Se o ponteiro velho ficar, o ciclo aponta para a
      // âncora antiga E carrega a cobrança nova, e a cascata de `liquidarCiclo`
      // o liquida de graça quando alguém pagar a cobrança daquela outra âncora.
      debitoAgrupadoEm: null,
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
