/**
 * Porta (interface) do gateway de pagamento — camada de abstração de billing.
 *
 * Regra de ouro deste arquivo: **nenhum tipo, nome de campo ou vocabulário de
 * um provedor específico pode vazar para cá.** Não existe `preapproval`,
 * `init_point`, `auto_recurring` nem `subscription` do Asaas nessas assinaturas.
 * O critério prático: um `AsaasProvider` futuro (#36) tem que implementar esta
 * interface sem que nenhuma linha aqui mude.
 *
 * Por que a porta existe: o trilho de cobrança do Iris já trocou uma vez (Pix
 * Automático → cobrança avulsa, com a conta Asaas bloqueada no meio do caminho).
 * O que muda é o gateway; o que não muda é "criar assinatura recorrente,
 * atualizar o valor quando a contagem de pacientes ativos muda, e receber
 * webhook autenticado". Essas três coisas são o contrato.
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

/** Status de assinatura normalizado — vocabulário do Iris, não do gateway. */
export type StatusAssinaturaProvider =
  | "pendente"
  | "autorizada"
  | "pausada"
  | "cancelada";

/** Quem paga. Só o mínimo que qualquer gateway brasileiro exige. */
export interface DadosAssinante {
  clinicId: string;
  nomeClinica: string;
  emailResponsavel: string;
  /** Só dígitos, sem máscara. Opcional: nem todo gateway exige na criação. */
  cpfCnpj?: string;
}

/** Pedido de criação de assinatura recorrente mensal. */
export interface NovaAssinatura {
  assinante: DadosAssinante;
  /** Valor mensal em CENTAVOS (inteiro). Ex.: 3900 = R$ 39,00. */
  valorCentavos: number;
  metodo: MetodoPagamento;
  /** Para onde o gateway devolve o usuário depois do checkout. */
  urlRetorno: string;
  /**
   * Chave nossa que amarra a assinatura do gateway ao registro local.
   * Também serve de chave de idempotência na criação.
   */
  referenciaExterna: string;
}

/** Resultado da criação — o suficiente para persistir e redirecionar. */
export interface AssinaturaCriada {
  providerSubscriptionId: string;
  checkoutUrl: string;
  status: StatusAssinaturaProvider;
}

/** Tipos de evento que o Iris sabe tratar. Tudo mais é `desconhecido`. */
export type TipoEventoNormalizado =
  | "assinatura.autorizada"
  | "assinatura.pausada"
  | "assinatura.cancelada"
  | "pagamento.aprovado"
  | "pagamento.recusado"
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

  criarAssinatura(dados: NovaAssinatura): Promise<AssinaturaCriada>;

  /**
   * Reajusta o valor da recorrência (a contagem de pacientes ativos mudou).
   * Valor em CENTAVOS.
   */
  atualizarValorRecorrente(
    providerSubscriptionId: string,
    valorCentavos: number,
  ): Promise<void>;

  consultarAssinatura(providerSubscriptionId: string): Promise<{
    status: StatusAssinaturaProvider;
    valorCentavos: number;
  }>;

  cancelarAssinatura(providerSubscriptionId: string): Promise<void>;

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
