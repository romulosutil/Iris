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
 *    No trilho de redirect (checkout) nada é cobrado nesse momento; no trilho
 *    de Pix Automático, cobra — ver `AutorizacaoPendente` abaixo.
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

/**
 * Provedores conhecidos. Só `asaas` — o Mercado Pago foi removido (#36, D24).
 */
export type ProviderId = "asaas";

/** Meio de pagamento escolhido pela clínica no checkout. */
export type MetodoPagamento = "cartao" | "pix";

/**
 * Status do VÍNCULO de pagamento — vocabulário do Iris, não do gateway.
 * Nome preservado da versão anterior para não quebrar os call sites de
 * `estadoInterno`; o que mudou é o que ele descreve (autorização do meio de
 * pagamento, não de uma recorrência de valor fixo).
 */
export type StatusAssinaturaProvider =
  "pendente" | "autorizada" | "pausada" | "cancelada";

/** Status de uma COBRANÇA de ciclo. */
export type StatusCobranca = "pendente" | "paga" | "recusada" | "estornada";

/** Quem paga. Só o mínimo que qualquer gateway brasileiro exige. */
interface DadosAssinante {
  clinicId: string;
  nomeClinica: string;
  emailResponsavel: string;
  /** Só dígitos, sem máscara. Opcional: nem todo gateway exige na criação. */
  cpfCnpj?: string;
}

/**
 * Pedido de criação do vínculo de pagamento.
 *
 * Não tem `valorCentavos` de mensalidade: o vínculo não é a cobrança do ciclo.
 * Mas **"não cobra nada" é falso no trilho de Pix Automático**, e essa frase
 * ficou escrita aqui até o débito D22: a Jornada 3 do Bacen só marca uma
 * autorização como ativa depois que o QR imediato é LIQUIDADO, então o adapter
 * do Asaas precisa cobrar algo para que a autorização exista. Quanto ele cobrou
 * sai em `AutorizacaoPendente`, não entra aqui — o valor é escolha do adapter
 * (é ele que conhece a exigência do trilho), e o chamador só precisa saber o
 * que foi cobrado para poder dizer isso à clínica.
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
  /**
   * Teto autorizado para débitos futuros, em centavos. Opcional, e **só um
   * limite** — nunca o valor de uma cobrança.
   *
   * Adapter que não tem teto simplesmente ignora: a autorização de Pix
   * Automático de valor variável (Jornada 3) não admite limite superior, e o
   * Asaas descarta este campo de propósito. Até o D22 ele era lido lá como
   * "valor da ativação", o que fazia um campo chamado _teto_ decidir quanto sai
   * da conta da clínica.
   */
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
      /**
       * Quanto este QR **cobra de verdade**, em centavos. Obrigatório, e é o
       * ponto do débito D22: no Pix Automático a autorização só vai a ativa
       * depois que o QR imediato é liquidado, então produzir esta forma sem
       * dizer o preço é produzir uma cobrança silenciosa.
       *
       * Sendo obrigatório, nenhum adapter consegue emitir um BR Code de
       * ativação sem declarar o valor, e nenhuma tela consegue renderizá-lo sem
       * ter o número em mãos para mostrar. Opcional teria deixado exatamente o
       * estado de hoje representável — e ele foi o débito.
       */
      valorAtivacaoCentavos: number;
    };

/** Resultado da criação do vínculo — o suficiente para persistir e autorizar. */
export interface VinculoCriado {
  providerVinculoId: string;
  /**
   * Identificador do **assinante** no gateway, quando o gateway tem um.
   *
   * Opcional de propósito, e não por conveniência: nem todo trilho separa
   * "quem paga" de "o vínculo de pagamento". Há gateways em que criar a
   * autorização já é criar o cliente — o vínculo é a única entidade, e não
   * existe segundo id para devolver. Obrigatório forçaria esses adapters a
   * repetir `providerVinculoId` aqui, que é afirmar uma identidade de assinante
   * que o gateway nunca emitiu (o mesmo tipo de mentira do D21, onde a porta
   * exigia uma URL de quem só tinha um BR Code).
   *
   * Quando vem, é persistido em `subscription.provider_customer_id` junto com
   * `provider` — o id só faz sentido dentro do gateway que o emitiu, então
   * gravar um sem o outro produz uma linha que ninguém consegue reinterpretar.
   * Ausente, a coluna vai a `null` explicitamente, nunca fica com o resíduo da
   * tentativa anterior.
   */
  providerCustomerId?: string;
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

/**
 * Cobrança avulsa contra o CLIENTE, sem passar por vínculo de recorrência
 * (#290 — débito de reativação).
 *
 * Existe separada de `NovaCobrancaDeCiclo` porque as duas cobram por trilhos
 * incompatíveis, e a diferença não é cosmética: a cobrança de ciclo debita a
 * autorização de Pix Automático (`vinculoId`), e no cancelamento essa
 * autorização acabou de ser REVOGADA — é literalmente o ato que produziu o
 * cancelamento. Reaproveitar `NovaCobrancaDeCiclo` aqui mandaria o adapter
 * consultar uma autorização morta e anexar `pixAutomaticAuthorizationId` a uma
 * cobrança que ninguém consegue pagar por débito automático.
 *
 * O que sobra é Pix comum: QR que a pessoa lê no app do banco e paga à mão.
 */
export interface NovaCobrancaAvulsa {
  /** Cliente no gateway (`subscription.provider_customer_id`). */
  clienteId: string;
  valorCentavos: number;
  /**
   * `debito:${cycleIdAncora}`. Mesmo papel do `cycle:` da cobrança de ciclo:
   * reconciliar o webhook com a linha certa, e servir de chave de idempotência
   * na reemissão.
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
  /**
   * BR Code (copia-e-cola) do Pix, quando o gateway o fornece. Só a cobrança
   * AVULSA produz isto: a cobrança de ciclo é debitada automaticamente e não
   * tem ninguém para ler QR nenhum.
   *
   * `undefined` não é erro — é o caso em que a busca do QR falhou ou o trilho
   * não tem copia-e-cola. A cobrança existe do mesmo jeito, e `urlPagamento` é
   * a saída de contingência.
   */
  pixCopiaECola?: string;
}

/**
 * Como uma cobrança se paga, do jeito que a tela precisa renderizar.
 *
 * Mora aqui, e não em `debito.ts`, porque agora é a PORTA que devolve isto:
 * quem sabe montar a forma de pagamento é o adapter, que tem o `invoiceUrl` e o
 * copia-e-cola. `debito.ts` reexporta como `FormaPagamentoDebito`.
 */
export type FormaPagamentoCobranca =
  | { forma: "pix_copia_e_cola"; brCode: string; urlPagamento?: string }
  | { forma: "link"; urlPagamento: string };

/**
 * Motivo que prova que a cobrança **não existe mais para ninguém** — nem para
 * nós, nem para o pagador. É o único grupo em que emitir OUTRA cobrança por
 * cima é seguro.
 *
 * Hoje tem um membro só, e isso é o ponto: só o 404 é uma prova. Todo o resto
 * é "não consigo reapresentar", que é uma frase sobre NÓS, não sobre a
 * cobrança.
 */
export type MotivoCobrancaInexistente =
  /** O gateway não reconhece o id (404). Ninguém consegue pagar aquilo. */
  "nao_encontrada";

/**
 * Motivo em que a cobrança **não é reapresentável por nós**, mas pode
 * perfeitamente seguir pagável pelo pagador.
 *
 * Emitir uma segunda cobrança em qualquer um destes casos é o risco de
 * **cobrança dupla**: o cliente paga a que está viva no gateway e a nova que a
 * gente acabou de criar. Quem consome trata este grupo como "não sei / não
 * emita nada", nunca como "morreu".
 */
export type MotivoReusoIndeterminado =
  /** Removida no gateway. No Asaas não há status "cancelada": é o boolean `deleted`. */
  | "removida"
  /** Estornada/chargeback — decisão comercial humana, nunca reapresentada. */
  | "estornada"
  /**
   * Em cobrança terceirizada (`DUNNING_*` no Asaas). Segue pagável pelo
   * pagador pelo trilho da recuperação, e é justamente por isso que não é um
   * "morta, pode emitir outra": seria a segunda cobrança por cima de uma viva.
   */
  | "em_cobranca_terceirizada"
  /** Status fora da allow-list de pagáveis (inclui todo status futuro desconhecido). */
  | "status_nao_pagavel"
  /** Viva e pagável, mas o gateway não devolveu um valor legível. */
  | "valor_indeterminado"
  /** Existe e é pagável, mas o gateway não devolveu link nem copia-e-cola. */
  | "sem_forma_de_pagamento";

/**
 * Por que uma cobrança já emitida NÃO pode ser reapresentada por nós.
 *
 * **A união é deliberadamente dividida em dois grupos**, e a divisão vale
 * dinheiro: "não reaproveitável" ≠ "não pagável pelo cliente". Quem decide
 * emitir uma cobrança nova tem que perguntar a qual grupo o motivo pertence —
 * `MotivoCobrancaInexistente` libera, `MotivoReusoIndeterminado` bloqueia.
 * Tratar os dois como a mesma coisa é fail-OPEN para cobrança dupla.
 */
export type MotivoNaoReuso =
  MotivoCobrancaInexistente | MotivoReusoIndeterminado;

/**
 * Estado de uma cobrança JÁ EMITIDA, do ponto de vista de quem quer
 * reapresentá-la em vez de emitir outra (#310).
 *
 * ## Por que não é `consultarCobranca` alargada
 *
 * `consultarCobranca` devolve `StatusCobranca`, cujo `default` é `pendente`:
 * `DUNNING_*`, `AWAITING_RISK_ANALYSIS` e todo status que o gateway inventar
 * chegariam como "pendente" e seriam reaproveitados. Decidir reuso por ali é
 * fail-OPEN por construção, e o modo de falha é cobrança dupla. Aqui a decisão
 * é por ALLOW-LIST de status cru, dentro do adapter, que é o único lugar que vê
 * o vocabulário do gateway.
 *
 * Os dois chamadores de `consultarCobranca` (a rota do webhook e a varredura de
 * pendentes) também ficam intocados — eles não devem pagar as chamadas extras
 * de QR e de instrução que só o gate precisa.
 */
export type CobrancaParaReuso =
  /** Viva, pagável, e com forma de pagamento na mão. */
  | {
      reuso: "pagavel";
      pagamento: FormaPagamentoCobranca;
      /**
       * Quanto ESTA cobrança cobra, em centavos, do jeito que o gateway a
       * emitiu.
       *
       * Obrigatório, e não opcional: uma cobrança reaproveitada pode ter sido
       * consolidada sobre N ciclos, e sem este número a tela só tem o valor
       * apurado de UM ciclo para mostrar. A copy "pagar todas quita o total de
       * {total}" fica então falsa — soma de ciclos que não é o que o cliente
       * vai pagar. Opcional deixaria exatamente esse estado representável.
       */
      valorCentavos: number;
    }
  /**
   * Viva, mas com débito automático a caminho (instrução `AWAITING_REQUEST` ou
   * `SCHEDULED`). Não apresentar como pagável: a janela crítica do Pix
   * Automático bloqueia o recebimento por outro meio das 22h de D-1 até D, e
   * quem paga por fora paga duas vezes. A existência da instrução pendente É o
   * fato — não se calcula hora nem fuso.
   */
  | { reuso: "em_processamento" }
  /** Já paga no gateway. Quem chama liquida o ciclo e recomputa o débito. */
  | { reuso: "paga" }
  /** Não reapresentável. Quem chama manda o ciclo para a cobrança consolidada. */
  | { reuso: "morta"; motivo: MotivoNaoReuso };

/**
 * Por que o gateway recusou o COMANDO de retentativa extradia (#322).
 *
 * União **fechada**, ao contrário de `motivoRecusa` da cobrança — e a diferença
 * não é descuido. `refusalReason` é catálogo do BANCO PAGADOR, declarado como
 * `string` sem `enum` no OpenAPI e crescendo sem versionar. Isto aqui é outra
 * coisa: são as **validações do próprio Asaas** sobre um comando NOSSO, uma
 * lista curta e conhecida, e cada item exige uma decisão diferente da varredura.
 * `desconhecido` é o ramo obrigatório para o que não casar — nunca se inventa
 * código de erro do gateway a partir de texto.
 */
export type MotivoRecusaDeRetentativa =
  /** "Limite de retentativas excedido. A regra permite no máximo 3 tentativas." */
  | "limite_de_tentativas"
  /**
   * "A data solicitada ultrapassa o limite de 7 dias corridos permitidos após o
   * vencimento original."
   */
  | "fora_da_janela_de_7_dias"
  /**
   * "O agendamento da retentativa deve ser enviado até as 23h59 do dia anterior
   * à data desejada para liquidação."
   */
  | "fora_do_horario_de_comando"
  /**
   * "A data da retentativa não pode coincidir ou ultrapassar o dia de início do
   * próximo ciclo da recorrência."
   */
  | "colide_com_proximo_ciclo"
  /**
   * "A autorização desta cobrança não permite retentativas extradia (Política
   * N)." — autorização criada sem `retryPolicy`. É **irreparável**: o Asaas só
   * aceita a política na criação, então o conserto é novo QR e novo
   * consentimento da clínica no app do banco.
   */
  | "autorizacao_sem_politica"
  /** 400 cuja mensagem não casa com nenhuma das cinco validações conhecidas. */
  | "desconhecido";

/**
 * Desfecho do comando de retentativa extradia. União discriminada por `ok`:
 * quem chama não consegue ler o motivo sem antes provar que houve recusa.
 *
 * ⚠️ `{ ok: false }` significa **o gateway respondeu e disse não** — decisão
 * definitiva, sobre a qual a varredura age (registra o motivo nomeado e não
 * insiste). Indisponibilidade NÃO vem por aqui: erro de rede, timeout e 5xx
 * SOBEM como exceção, porque "não consegui perguntar" virando "o gateway
 * recusou" é a mesma troca que `consultarCobrancaParaReuso` proíbe.
 */
export type ResultadoRetentativa =
  | { ok: true }
  | {
      ok: false;
      motivo: MotivoRecusaDeRetentativa;
      /** A mensagem do gateway, crua, para o log e o relatório do job. */
      mensagemGateway: string;
    };

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
  /**
   * Id da INSTRUÇÃO de débito, quando o gateway modela o débito automático como
   * um recurso separado da cobrança (é o caso do Pix Automático).
   *
   * Não é redundante com `providerChargeId`, e a diferença é o débito D35: o
   * motivo da recusa **não mora na cobrança** — mora na instrução. O evento traz
   * os dois ids, o normalizador descartava este, e a consulta do motivo ficava
   * sem o único identificador que a torna possível.
   *
   * `null` quando o evento não é de instrução (cobrança comum, autorização) ou
   * quando o gateway não tem essa entidade. Quem consome trata como "sem
   * instrução para consultar", nunca como erro.
   */
  providerInstructionId: string | null;
  referenciaExterna: string | null;
  /**
   * Onde este evento cai dentro da política de retentativa `3R_7D` (#322, D-5).
   *
   * **Existe SEMPRE**, com os dois campos `null` quando não há instrução no
   * evento (cobrança comum, autorização) ou quando o gateway não modela isso.
   * Opcional (`retentativa?`) obrigaria todo consumidor a escrever `?.`, e o
   * caminho que importa — "esta recusa é de uma RETENTATIVA, então não
   * recarimbe `past_due`" — é justamente o que não pode depender de o
   * consumidor ter lembrado do encadeamento opcional.
   *
   * - `proposito`: `SCHEDULE` é a instrução original do ciclo;
   *   `RETRY_AFTER_DUE_DATE` é uma retentativa extradia comandada por nós.
   *   Qualquer outro valor vira `null` — vocabulário desconhecido nunca é
   *   repassado cru, senão a comparação do consumidor vira adivinhação.
   * - `tentativa`: 1, 2 ou 3. Fora disso, `null`.
   */
  retentativa: {
    proposito: "SCHEDULE" | "RETRY_AFTER_DUE_DATE" | null;
    tentativa: number | null;
  };
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

  /**
   * Registra o meio de pagamento.
   *
   * **Cobra ou não conforme o trilho, e o retorno diz qual foi o caso.** No
   * trilho de redirect o gateway registra o meio sem debitar. No Pix
   * Automático isso é impossível: a Jornada 3 do Bacen só ativa a autorização
   * depois que o QR imediato é liquidado, então a forma `pix_copia_e_cola`
   * sempre volta com `valorAtivacaoCentavos` — quanto sai da conta da clínica
   * agora. Nunca é a mensalidade; ela nasce só no fechamento do 1º ciclo, em
   * `emitirCobrancaDeCiclo`.
   */
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

  /**
   * Emite cobrança avulsa contra o CLIENTE, fora de qualquer vínculo de
   * recorrência (#290). É o trilho do débito de reativação: a autorização de
   * Pix Automático foi revogada, então só resta Pix comum, pago à mão.
   *
   * Obrigatório na porta, e não opcional como `atualizarCliente`: um gateway
   * que não saiba cobrar avulso não consegue implementar o gate de reativação,
   * e degradar isso em silêncio abriria a conta sem cobrar o débito.
   */
  emitirCobrancaAvulsa(dados: NovaCobrancaAvulsa): Promise<CobrancaEmitida>;

  consultarCobranca(
    providerChargeId: string,
    /**
     * Contexto opcional vindo do evento. Existe porque em alguns trilhos o
     * motivo da recusa **não é um campo da cobrança**: é de outro recurso, que
     * só o evento sabe identificar (`providerInstructionId`). Sem isto o
     * adapter não tem como buscá-lo — foi exatamente o D35, em que três campos
     * eram lidos de um recurso que não os tem e `motivoRecusa` era `null` por
     * construção.
     *
     * Opcional, e não obrigatório, porque a consulta continua válida sem ele:
     * quem não tem o id perde o motivo, não a conciliação.
     */
    opcoes?: { providerInstructionId?: string | null },
  ): Promise<{
    status: StatusCobranca;
    valorCentavos: number;
    /**
     * Motivo bruto da recusa, do jeito que o gateway mandou, ou `null` quando
     * ele não informa.
     *
     * **`string`, nunca uma union de literais.** O catálogo é aberto por
     * contrato: o OpenAPI do Asaas declara `refusalReason` como `string` sem
     * `enum`, e a doc avisa que a lista cresce sem versionar. Fechar o tipo aqui
     * transformaria um código novo do gateway em erro de compilação num lado, e
     * em `default` silencioso no outro. Classificação (se um dia houver) é
     * decisão de camada acima, sempre com ramo para o desconhecido.
     *
     * `null` continua sendo caso esperado, não exceção: a instrução pode não
     * existir, a busca pode falhar, e o trilho pode simplesmente não informar.
     */
    motivoRecusa: string | null;
  }>;

  /**
   * Estado de uma cobrança já emitida, para decidir se ela pode ser
   * REAPRESENTADA em vez de emitirmos outra (#310).
   *
   * Obrigatório na porta: um gateway que não saiba responder isto obrigaria o
   * gate a emitir cobrança nova por cima de uma cobrança viva — a cobrança
   * dupla que esta pergunta existe para evitar.
   *
   * **Nunca devolve "morta" por indisponibilidade.** Erro de rede, timeout, 5xx
   * e 4xx transitório SOBEM. "Não consegui verificar" virando "não existe" é
   * exatamente o caminho para cobrar duas vezes.
   */
  consultarCobrancaParaReuso(
    providerChargeId: string,
  ): Promise<CobrancaParaReuso>;

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

  /**
   * Atualiza os dados cadastrais do assinante no gateway (#262 — Dados da
   * Clínica). **Opcional de propósito**: nem todo gateway tem a entidade
   * "cliente" separada do vínculo, e obrigar todos os adapters a fingir uma
   * seria a mesma mentira do D21. Call site guarda com
   * `if (provider.atualizarCliente)` e pula em silêncio quando não existe.
   */
  atualizarCliente?(dados: {
    providerCustomerId: string;
    nome: string;
    cpfCnpj?: string | null;
    email?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cep?: string | null;
  }): Promise<void>;

  /**
   * Comanda UMA retentativa extradia da instrução de débito recusada (#322).
   *
   * **Opcional pelo mesmo critério de `atualizarCliente`**: "instrução de débito
   * automático retentável" é entidade do Pix Automático, não de todo gateway.
   * Obrigar todos os adapters a fingir uma seria a mentira do D21. Call site
   * guarda com `if (provider.comandarRetentativa)` e, sem o método, apenas não
   * comanda — a assinatura continua caindo na carência normal, que é o
   * comportamento de hoje.
   *
   * @param providerInstructionId id da INSTRUÇÃO recusada (não o da cobrança).
   * @param dueDate data desejada de liquidação, no formato `YYYY-MM-DD` — o
   *   mesmo do wire do Asaas. Quem chama já calculou contra as quatro
   *   restrições de data (D-3 da #322); o adapter não corrige data nenhuma.
   *
   * Devolve `{ ok: false }` só quando o gateway RESPONDEU recusando. Falha de
   * transporte sobe, e é a varredura que decide o que fazer com ela.
   */
  comandarRetentativa?(
    providerInstructionId: string,
    dueDate: string,
  ): Promise<ResultadoRetentativa>;
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
