/**
 * Porta (interface) do gateway de pagamento — camada de abstração de billing.
 *
 * Regra de ouro deste arquivo: **nenhum tipo, nome de campo ou vocabulário de
 * um provedor específico pode vazar para cá.** Não existe `preapproval`,
 * `init_point`, `auto_recurring` nem `subscription` do Asaas nessas assinaturas.
 * O critério prático: um `AsaasProvider` futuro (#36) tem que implementar esta
 * interface sem que nenhuma linha aqui mude.
 *
 * ## O contrato mudou: vínculo de pagamento + cobrança por ciclo
 *
 * A versão anterior deste arquivo se contradizia dentro do mesmo parágrafo —
 * registrava a decisão de **cobrança avulsa** e definia o contrato como
 * **assinatura recorrente**. O contrato recorrente nunca chega a pós-pago de
 * verdade: o gateway gera a cobrança do próximo ciclo com muita antecedência e
 * com o valor vigente naquele momento, então o que se cobra é sempre a apuração
 * de um ciclo anterior. Foi a origem do `DIAS_ANTECEDENCIA_APURACAO` e de um
 * subfaturamento sistemático e silencioso.
 *
 * O contrato agora separa as duas coisas que de fato existem:
 *
 * 1. **Vínculo de pagamento** — a clínica autoriza uma vez um meio debitável.
 *    Nenhum valor é cobrado nesse momento.
 * 2. **Cobrança de ciclo** — emitida por NÓS, no fechamento, com o valor
 *    realmente apurado. É quem tem `referenciaExterna`, e é ela que o webhook
 *    reconcilia.
 *
 * 🔒 **Gate externo, fora do código:** o débito headless (sem CVV a cada
 * cobrança) exige capacidade de MIT/CoF habilitada na conta do gateway. Essa
 * negociação é pré-requisito da VIRADA DE CHAVE, não da implementação — a porta
 * abstrai os dois caminhos e o adapter concreto se decide com a resposta.
 *
 * ## Dinheiro é sempre inteiro em centavos
 *
 * Toda quantia nesta porta é `number` inteiro de **centavos**. A conversão para
 * o decimal que este ou aquele gateway exige acontece DENTRO do adapter, nunca
 * aqui e nunca no chamador. Fonte da verdade interna = centavos.
 */

/** Provedores conhecidos. `asaas` ainda não tem implementação (#36). */
export type ProviderId = "mercado_pago" | "asaas";

/** Meio de pagamento escolhido pela clínica no checkout. */
export type MetodoPagamento = "cartao" | "pix";

/**
 * Status do VÍNCULO de pagamento — vocabulário do Iris, não do gateway.
 * Nome preservado da versão anterior para não quebrar os call sites de
 * `estadoInterno`; o que mudou é o que ele descreve (autorização do meio de
 * pagamento, não de uma recorrência de valor fixo).
 */
export type StatusAssinaturaProvider =
  | "pendente"
  | "autorizada"
  | "pausada"
  | "cancelada";

/** Status de uma COBRANÇA de ciclo. */
export type StatusCobranca = "pendente" | "paga" | "recusada" | "estornada";

/** Quem paga. Só o mínimo que qualquer gateway brasileiro exige. */
export interface DadosAssinante {
  clinicId: string;
  nomeClinica: string;
  emailResponsavel: string;
  /** Só dígitos, sem máscara. Opcional: nem todo gateway exige na criação. */
  cpfCnpj?: string;
}

/**
 * Pedido de criação do vínculo de pagamento.
 *
 * Não tem `valorCentavos`: **a ativação não cobra**. Alguns gateways exigem um
 * teto autorizado para o débito futuro — é o que `tetoCentavos` cobre, e é um
 * limite, não uma cobrança.
 */
export interface NovoVinculo {
  assinante: DadosAssinante;
  metodo: MetodoPagamento;
  /** Para onde o gateway devolve o usuário depois do checkout. */
  urlRetorno: string;
  /**
   * Chave nossa que amarra o vínculo do gateway ao registro local.
   * Também serve de chave de idempotência na criação.
   */
  referenciaExterna: string;
  /** Teto autorizado para débitos futuros, em centavos. Opcional. */
  tetoCentavos?: number;
}

/**
 * Como a clínica termina de autorizar o vínculo.
 *
 * São duas formas genuinamente diferentes, e não intercambiáveis: um gateway
 * de checkout devolve uma URL para onde o navegador vai; o Pix Automático
 * devolve um BR Code (copia-e-cola) que a pessoa lê no app do banco. Tratar as
 * duas como "uma URL" foi o débito D21 — o adapter do Asaas gravava o
 * copia-e-cola em `checkoutUrl`, e qualquer leitor que confiasse no nome
 * renderizaria um link quebrado.
 *
 * Nenhuma das duas formas é vocabulário de provedor: "redirecionar o
 * navegador" e "mostrar um BR Code" são fatos sobre a interação com a pessoa,
 * não sobre o Asaas ou o Mercado Pago. Um provedor novo cai em uma das duas ou
 * ganha a sua — o que a porta não admite é fingir.
 */
export type AutorizacaoPendente =
  | { forma: "redirect"; url: string }
  | {
      forma: "pix_copia_e_cola";
      /**
       * BR Code (EMV) do Pix. O QR **não** vem junto de propósito: ele é uma
       * renderização deste mesmo texto, e guardar a imagem em base64 seria
       * duplicar estado (e engordar a linha) para nada — a UI desenha o QR a
       * partir daqui.
       */
      brCode: string;
    };

/** Resultado da criação do vínculo — o suficiente para persistir e autorizar. */
export interface VinculoCriado {
  providerVinculoId: string;
  autorizacao: AutorizacaoPendente;
  status: StatusAssinaturaProvider;
}

/** Pedido de emissão da cobrança de um ciclo fechado. */
export interface NovaCobrancaDeCiclo {
  /** Id do vínculo de pagamento autorizado pela clínica. */
  vinculoId: string;
  valorCentavos: number;
  /**
   * `cycle:${cycleId}`. É isto que permite reconciliar o webhook com o ciclo —
   * o id do vínculo não identifica ciclo nenhum.
   */
  referenciaExterna: string;
  descricao: string;
  vencimento: Date;
}

export interface CobrancaEmitida {
  providerChargeId: string;
  status: StatusCobranca;
  /** Presente quando o pagamento exige ação do usuário (ex.: Pix). */
  urlPagamento?: string;
}

/** Tipos de evento que o Iris sabe tratar. Tudo mais é `desconhecido`. */
export type TipoEventoNormalizado =
  | "assinatura.autorizada"
  | "assinatura.pausada"
  | "assinatura.cancelada"
  | "pagamento.aprovado"
  | "pagamento.recusado"
  | "cobranca.paga"
  | "cobranca.recusada"
  | "cobranca.vencida"
  | "desconhecido";

/**
 * Evento de webhook traduzido para o vocabulário do Iris.
 *
 * `bruto` guarda o payload original: é ele que permite reprocessar quando a
 * apuração mudar, sem depender de o normalizador ter acertado de primeira.
 * Campos que o gateway não fornece vêm `null` — normalizar NUNCA lança.
 */
export interface EventoWebhookNormalizado {
  /** Chave de deduplicação. Vazia só se o gateway não mandar nada utilizável. */
  eventId: string;
  tipo: TipoEventoNormalizado;
  providerSubscriptionId: string | null;
  /** Id da COBRANÇA de ciclo, quando o evento é de pagamento avulso. */
  providerChargeId: string | null;
  referenciaExterna: string | null;
  ocorridoEm: Date | null;
  bruto: unknown;
}

/**
 * Entrada da verificação de assinatura de webhook.
 *
 * Inclui `url` porque alguns gateways (Mercado Pago, notadamente) assinam um
 * manifest que mistura header, query param da URL de notificação e timestamp —
 * o corpo sozinho não basta. Adapters que só precisam do corpo simplesmente
 * ignoram o campo; a porta continua agnóstica porque `url` é do protocolo HTTP,
 * não do vocabulário de nenhum provedor.
 */
export interface EntradaVerificacaoWebhook {
  corpoBruto: string;
  cabecalhos: Headers;
  /** URL completa da requisição recebida (com query string). */
  url: string;
}

/** Porta do gateway. Ver regra de ouro no topo do arquivo. */
export interface BillingProvider {
  readonly id: ProviderId;

  /** Registra o meio de pagamento. **Não cobra nada.** */
  iniciarVinculoPagamento(dados: NovoVinculo): Promise<VinculoCriado>;

  consultarVinculo(providerVinculoId: string): Promise<{
    status: StatusAssinaturaProvider;
  }>;

  cancelarVinculo(providerVinculoId: string): Promise<void>;

  /**
   * Emite a cobrança de UM ciclo já apurado, com o valor real. Chamada por nós,
   * no fechamento — não pelo calendário do gateway. É o que torna o trilho
   * pós-pago de fato.
   */
  emitirCobrancaDeCiclo(dados: NovaCobrancaDeCiclo): Promise<CobrancaEmitida>;

  consultarCobranca(providerChargeId: string): Promise<{
    status: StatusCobranca;
    valorCentavos: number;
  }>;

  /**
   * Autentica a entrega do webhook. **Nunca lança e nunca revela o motivo da
   * recusa** — segredo ausente, header ausente, header malformado e assinatura
   * errada devolvem todos o mesmo `false`. Ver `src/app/api/hooks/asaas/route.ts`
   * para o precedente: a resposta HTTP não pode distinguir "não configurei o
   * segredo" de "sua assinatura está errada".
   */
  verificarAssinaturaWebhook(input: EntradaVerificacaoWebhook): boolean;

  /** Traduz o payload do gateway. Nunca lança; desconhecido vira `desconhecido`. */
  normalizarEvento(payload: unknown): EventoWebhookNormalizado;
}

/**
 * Falha vinda do gateway (resposta não-2xx), distinta de falha de rede.
 *
 * O chamador precisa dessa distinção para decidir retry: `BillingProviderError`
 * com `status` 4xx é recusa do gateway (retentar não adianta), enquanto um
 * `TypeError`/`DOMException` de `fetch` (timeout, DNS, conexão) é transitório.
 * Por isso o adapter NÃO embrulha erro de rede nesta classe.
 */
export class BillingProviderError extends Error {
  readonly status?: number;
  readonly corpo?: unknown;

  constructor(mensagem: string, opcoes?: { status?: number; corpo?: unknown }) {
    super(mensagem);
    this.name = "BillingProviderError";
    this.status = opcoes?.status;
    this.corpo = opcoes?.corpo;
  }
}
