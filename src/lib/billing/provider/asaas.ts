import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  BillingProviderError,
  type BillingProvider,
  type CobrancaEmitida,
  type EntradaVerificacaoWebhook,
  type EventoWebhookNormalizado,
  type NovaCobrancaDeCiclo,
  type NovoVinculo,
  type StatusAssinaturaProvider,
  type StatusCobranca,
  type TipoEventoNormalizado,
  type VinculoCriado,
} from "./types";

/**
 * Adapter do Asaas sobre a porta `BillingProvider` (#36, Fase 7).
 *
 * ## Por que o Asaas volta a existir
 *
 * O trilho ativo virou Mercado Pago em 03/08/2026 porque a conta de produção do
 * Asaas estava bloqueada e o Pix Automático indisponível (D12). Em 08/08/2026 a
 * conta foi aprovada e o produto liberado — e o Asaas resolve o problema que o
 * Mercado Pago **não** resolve: débito headless de valor variável. No MP isso
 * depende de MIT/CoF negociado com o suporte (gate externo, aberto). No Asaas é
 * o próprio desenho do Pix Automático: a clínica autoriza UMA vez e cada ciclo
 * é debitado com o valor realmente apurado. É exatamente o trilho pós-pago que
 * `types.ts` descreve.
 *
 * ## Como o trilho pós-pago se traduz para o Asaas
 *
 * | Porta                     | Asaas                                                    |
 * | ------------------------- | -------------------------------------------------------- |
 * | vínculo de pagamento      | `POST /pix/automatic/authorizations` (Jornada 3, sem `value`) |
 * | cobrança de ciclo         | `POST /payments` com `pixAutomaticAuthorizationId`        |
 * | consulta de cobrança      | `GET /payments/{id}`                                      |
 *
 * Duas regras do Pix Automático que o adapter não pode esconder:
 *
 * 1. **A autorização só fica `ACTIVE` depois que o QR Code imediato é pago.**
 *    Ou seja, existe um débito REAL no momento da ativação — não é possível
 *    autorizar "de graça". Ver `VALOR_ATIVACAO_PADRAO_CENTAVOS`.
 * 2. **A cobrança do ciclo só é aceita entre 2 e 10 dias úteis antes do
 *    vencimento.** Fora da janela o Asaas recusa com 400. Quem escolhe o
 *    vencimento é `fecharCiclosVencendo`, não este adapter — aqui a data só é
 *    formatada; a recusa sobe como `BillingProviderError` 4xx, que a varredura
 *    já sabe classificar como definitiva.
 *
 * ## Env — lidas por função, nunca no escopo do módulo
 *
 * Ler `process.env` no topo congela o valor na avaliação do módulo: quebra o
 * build (a var não existe em build-time) e impede `vi.stubEnv` no teste.
 *
 *   BILLING_PROVIDER_API_KEY  chave da API (header `access_token`) — secret
 *   ASAAS_BASE_URL            base COM `/v3` (sandbox: api-sandbox.asaas.com/v3)
 *   ASAAS_WEBHOOK_TOKEN       token que o Asaas devolve no header da entrega
 *
 * ## Dinheiro
 *
 * A fonte da verdade interna do Iris é **inteiro em centavos**. O Asaas fala
 * decimal em reais (`value`, `originalValue`), então a conversão acontece só na
 * borda deste arquivo. Nada fora daqui enxerga o decimal.
 */

/** Timeout de rede. Sem ele, um gateway pendurado prende o request inteiro. */
const TIMEOUT_MS = 10_000;

const BASE_URL_PADRAO = "https://api.asaas.com/v3";

/**
 * O Asaas exige `User-Agent` em contas raiz criadas a partir de 13/06/2024 —
 * requisição sem ele é recusada. Valor fixo e identificável de propósito: é o
 * que aparece no log de acesso do painel quando algo precisa ser rastreado.
 */
const USER_AGENT = "iris-clinica";

/**
 * Valor, em centavos, do QR Code imediato que ATIVA a autorização.
 *
 * ⚠️ Isto é uma cobrança REAL, não um teto. O Pix Automático (Jornada 3) só
 * ativa a autorização depois que o QR imediato é liquidado — não existe
 * autorização sem débito inicial.
 *
 * D22, decisão de produto tomada em 09/08/2026: **fica em um centavo**, o menor
 * débito representável, e a tela de ativação passa a dizer isso antes do QR. O
 * valor é constante de módulo, não env: mudá-lo em produção exige expirar as
 * autorizações pendentes, porque o BR Code já entregue carrega o valor antigo
 * gravado dentro do payload EMV — não é configuração, é migração.
 *
 * `NovoVinculo.tetoCentavos` deliberadamente NÃO entra aqui: teto é limite, não
 * cobrança, e ler um campo chamado "teto" como valor a debitar foi metade do
 * D22. Jornada 3 de valor variável não tem teto para respeitar.
 */
const VALOR_ATIVACAO_PADRAO_CENTAVOS = 1;

/** Validade do QR imediato de ativação. 24h é o que cabe num onboarding humano. */
const EXPIRACAO_QR_ATIVACAO_SEGUNDOS = 24 * 60 * 60;

/**
 * `contractId` do Asaas tem limite de 35 caracteres, e a `referenciaExterna` da
 * porta (`clinic:<uuid>`) tem 43. UUID sem hífen tem 32 e continua único, então
 * é ele que vai no campo — a referência completa continua indo em
 * `description`/`externalReference`, que não têm esse limite.
 */
const LIMITE_CONTRACT_ID = 35;

function baseUrl(): string {
  return process.env.ASAAS_BASE_URL || BASE_URL_PADRAO;
}

function apiKey(): string {
  const chave = process.env.BILLING_PROVIDER_API_KEY;
  if (!chave) {
    throw new BillingProviderError(
      "BILLING_PROVIDER_API_KEY não configurada (chave da API do Asaas)",
    );
  }
  return chave;
}

/**
 * Centavos (inteiro, fonte da verdade) → reais decimal com 2 casas.
 * `Number(x.toFixed(2))` é determinístico e não depende de locale.
 */
function centavosParaReais(valorCentavos: number): number {
  return Number((valorCentavos / 100).toFixed(2));
}

/** Reais decimal → centavos inteiros, para a volta (consulta). */
function reaisParaCentavos(valorReais: number): number {
  return Math.round(valorReais * 100);
}

/**
 * `Date` → `YYYY-MM-DD` no fuso de São Paulo, que é o fuso em que o Asaas lê
 * `dueDate` e `startDate`.
 *
 * `toISOString().slice(0, 10)` daria o dia em UTC: um fechamento rodando às
 * 22h de Brasília viraria o dia seguinte, e o vencimento sairia 24h adiantado —
 * o suficiente para cair fora da janela de 2 a 10 dias úteis que o Pix
 * Automático exige. `en-CA` é usado porque é o locale cujo formato de data
 * curta É `YYYY-MM-DD`; o fuso vem explícito, não do relógio do servidor.
 */
function dataAsaas(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Datas que o Asaas devolve — quatro formatos convivendo, medidos no payload
 * real do sandbox (`docs/evidencias/2026-08-03-asaas-sandbox-evento-real.json`):
 *
 *   `2026-08-03 19:55:12`   (envelope `dateCreated`)
 *   `08/09/2026`            (`authorization.startDate`)
 *   `03/08/2026 20:55:10`   (`immediateQrCode.expirationDate`)
 *   `2026-08-03`            (`payment.dateCreated`)
 *
 * Nenhum traz fuso. São horários de Brasília, que não tem horário de verão
 * desde 2019 — daí o `-03:00` fixo. `new Date("2026-08-03 19:55:12")` sem isso
 * seria interpretado no fuso do SERVIDOR (UTC em produção), errando 3 horas, e
 * `new Date("08/09/2026")` seria lido como 9 de AGOSTO (convenção americana),
 * errando um mês inteiro sem estourar nada.
 *
 * Nunca lança: formato desconhecido devolve `null`, porque quem chama é o
 * normalizador de webhook, que não pode falhar.
 */
function parsarDataAsaas(valor: unknown): Date | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;

  const brasileiro = texto.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/,
  );
  const iso = texto.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[\sT](\d{2}):(\d{2}):(\d{2}))?$/,
  );

  const m = brasileiro ?? iso;
  if (!m) return null;

  // No formato brasileiro a ordem dos grupos é dia/mês/ano; no ISO, ano/mês/dia.
  const [ano, mes, dia] = brasileiro
    ? [m[3]!, m[2]!, m[1]!]
    : [m[1]!, m[2]!, m[3]!];
  const hora = m[4] ?? "00";
  const minuto = m[5] ?? "00";
  const segundo = m[6] ?? "00";

  const d = new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Status da AUTORIZAÇÃO de Pix Automático → vocabulário do Iris.
 *
 * `CREATED` é autorização emitida e ainda não paga (o QR imediato não foi
 * liquidado): é `pendente`, não `autorizada` — tratá-la como autorizada
 * liberaria o cadastro de paciente de uma clínica que ainda não autorizou nada.
 *
 * `REFUSED` e `EXPIRED` viram `cancelada` porque são terminais: o Asaas não
 * permite retomar uma autorização nesses estados, só criar outra. Mapear para
 * `pausada` (que a porta tem) sugeriria que dá para religar, e não dá.
 *
 * Desconhecido cai em `pendente` — default seguro: não libera nada e não
 * cancela nada. Estado novo do gateway não pode virar exceção no meio do
 * webhook.
 */
function mapearStatusAutorizacao(status: unknown): StatusAssinaturaProvider {
  switch (status) {
    case "ACTIVE":
      return "autorizada";
    case "CANCELLED":
    case "REFUSED":
    case "EXPIRED":
      return "cancelada";
    case "CREATED":
      return "pendente";
    default:
      return "pendente";
  }
}

/**
 * Status de COBRANÇA do Asaas → `StatusCobranca` do Iris.
 *
 * ⚠️ `CONFIRMED` é tratado como **paga**, com a ressalva documentada pelo
 * próprio Asaas: em Pix de pessoa física ele pode ser um bloqueio cautelar de
 * até 72h que depois vira `RECEIVED` **ou `REFUNDED`**. Tratar `CONFIRMED` como
 * `pendente` deixaria o ciclo em `aguardando_pagamento` por três dias com o
 * dinheiro já debitado da clínica — e o caminho do estorno já existe e é
 * tratado (`REFUNDED` → `estornada`), então o erro reversível é o certo aqui.
 *
 * `OVERDUE` vira `recusada`: vencida sem pagamento é, para o ciclo, o mesmo
 * desfecho de uma recusa — cai em `falhou` → `past_due`. A porta não tem
 * "vencida" de propósito (ver `StatusCobranca`).
 *
 * `AWAITING_RISK_ANALYSIS` e os `DUNNING_*` continuam `pendente`: é dinheiro em
 * trânsito, não decidido.
 */
function mapearStatusCobranca(status: unknown): StatusCobranca {
  switch (status) {
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
    case "CONFIRMED":
      return "paga";
    case "OVERDUE":
      return "recusada";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "estornada";
    default:
      return "pendente";
  }
}

/**
 * Chamada HTTP à API do Asaas.
 *
 * Não-2xx vira `BillingProviderError` com `status` e corpo preservado — o corpo
 * do Asaas é `{errors:[{code, description}]}` e é ele que distingue "chave do
 * ambiente errado" (`invalid_environment`) de "fora da janela de cobrança"
 * (`invalid_action`). Erro de rede/timeout **não** é embrulhado: sobe como veio,
 * porque é transitório e a decisão de retry é diferente (ver a distinção que
 * `reprocessarEventosPendentes` faz entre 4xx definitivo e transitório).
 */
async function chamar(
  metodo: "GET" | "POST" | "PUT" | "DELETE",
  caminho: string,
  opcoes?: { corpo?: unknown },
): Promise<unknown> {
  const cabecalhos: Record<string, string> = {
    access_token: apiKey(),
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  if (opcoes?.corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
  }

  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    // GET com corpo preenchido leva 403 do CloudFront na frente do Asaas — por
    // isso o corpo é estritamente opcional e nunca é forçado a `"{}"`.
    body:
      opcoes?.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const texto = await resposta.text();
  let corpo: unknown = texto;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      // Mantém o texto cru: HTML de erro de proxy também é diagnóstico útil.
    }
  }

  if (!resposta.ok) {
    throw new BillingProviderError(
      `Asaas respondeu ${resposta.status} em ${metodo} ${caminho}`,
      { status: resposta.status, corpo },
    );
  }

  return corpo;
}

function comoRegistro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object"
    ? (valor as Record<string, unknown>)
    : {};
}

function comoTexto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

/**
 * Verificação da entrega de webhook do Asaas.
 *
 * O Asaas não assina o corpo: ele devolve, no header `asaas-access-token`, o
 * mesmo token que foi cadastrado no painel. Os dois cuidados que a versão
 * ingênua erra estão preservados de `src/app/api/hooks/asaas/route.ts`, que é
 * o precedente deste código:
 *
 * 1. `timingSafeEqual` LANÇA com buffers de tamanhos diferentes — e um throw
 *    aqui viraria 500, que o Asaas reentrega em loop. Compara-se o tamanho
 *    antes (o tamanho do token não é segredo).
 * 2. Env ausente → `false`, nunca "passa porque não há token configurado".
 *    Deploy sem o secret rejeita tudo, não aceita tudo.
 *
 * Consequência que vale registrar: como a autenticação é um token fixo e não um
 * HMAC sobre o corpo, **o corpo não é autenticado**. Quem tiver o token pode
 * mandar qualquer payload. É por isso que a rota nunca acredita no estado que
 * vem no evento — ela reconsulta o gateway pelo id (mesma decisão do adapter do
 * Mercado Pago, por um motivo diferente).
 */
function verificarEntregaAsaas(input: EntradaVerificacaoWebhook): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  const recebido = input.cabecalhos.get("asaas-access-token");
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Envelope do Asaas → evento normalizado.
 *
 * O envelope é `{id, event, dateCreated, account, <entidade>}`, e a chave da
 * entidade varia por família: `payment` (cobrança), `authorization`
 * (autorização de Pix Automático), `paymentInstruction` (instrução de débito).
 *
 * A classificação é feita pela **entidade presente e pelo status dela**, não
 * pelo nome do evento. Dois motivos: a lista de eventos `PAYMENT_*` do Asaas
 * cresce sem aviso (a doc avisa que novos atributos e eventos aparecem sem
 * versionar), e o nome do evento não distingue "recebido" de "estornado" com a
 * mesma granularidade que `status` distingue. Nunca lança: desconhecido é
 * `desconhecido`, e o handler responde 200 mesmo assim — 5xx aqui pararia a
 * fila do Asaas (15 falhas consecutivas interrompem a entrega, e evento não
 * entregue some em 14 dias).
 */
function normalizarEventoAsaas(payload: unknown): EventoWebhookNormalizado {
  const p = comoRegistro(payload);
  const evento = comoTexto(p.event) ?? "";
  const pagamento = comoRegistro(p.payment);
  const autorizacao = comoRegistro(p.authorization);
  const instrucao = comoRegistro(p.paymentInstruction);

  let tipo: TipoEventoNormalizado = "desconhecido";

  /**
   * Id da COBRANÇA. Vem direto em `payment.id` nos eventos de cobrança, e em
   * `paymentInstruction.paymentId` nos eventos de instrução do Pix Automático —
   * `paymentInstruction.id` é o id da INSTRUÇÃO, que não é consultável em
   * `GET /payments/{id}` e faria a conciliação tomar 404 em loop.
   */
  const idCobranca =
    comoTexto(pagamento.id) ?? comoTexto(instrucao.paymentId) ?? null;

  /**
   * Id do VÍNCULO (autorização). Nos eventos de autorização é `authorization.id`;
   * nos de instrução, a autorização vem aninhada em
   * `paymentInstruction.authorization.id`.
   */
  const idVinculo =
    comoTexto(autorizacao.id) ??
    comoTexto(comoRegistro(instrucao.authorization).id) ??
    null;

  const referenciaExterna = comoTexto(pagamento.externalReference);

  if (idCobranca) {
    const statusCobranca = mapearStatusCobranca(
      comoTexto(pagamento.status) ?? comoTexto(instrucao.status),
    );
    const vencida = comoTexto(pagamento.status) === "OVERDUE";
    if (referenciaExterna) {
      // Cobrança que NÓS emitimos (`cycle:<id>`): é conciliável com o ciclo.
      if (statusCobranca === "paga") tipo = "cobranca.paga";
      else if (vencida) tipo = "cobranca.vencida";
      else if (statusCobranca === "recusada") tipo = "cobranca.recusada";
      else tipo = "desconhecido";
    } else if (statusCobranca === "paga") tipo = "pagamento.aprovado";
    else if (statusCobranca === "recusada") tipo = "pagamento.recusado";
  } else if (idVinculo) {
    switch (mapearStatusAutorizacao(comoTexto(autorizacao.status))) {
      case "autorizada":
        tipo = "assinatura.autorizada";
        break;
      case "cancelada":
        tipo = "assinatura.cancelada";
        break;
      default:
        // `CREATED` (autorização emitida, QR ainda não pago) não é transição
        // nenhuma. Fica `desconhecido` de propósito — mas `providerSubscriptionId`
        // continua preenchido, então a rota ainda reconsulta o gateway e
        // carimba o evento como aplicado em vez de deixá-lo na fila.
        tipo = "desconhecido";
    }
  }

  /**
   * A instrução de pagamento REFUSED (saldo insuficiente, recusa do banco do
   * pagador) é o principal modo de falha do débito automático, e ela chega SEM
   * `payment.status` — só com `paymentInstruction.status`. Sem esta linha o
   * evento viraria `desconhecido` e a clínica ficaria em `aguardando_pagamento`
   * para sempre, sem nunca cair em `past_due`.
   */
  if (
    tipo === "desconhecido" &&
    comoTexto(instrucao.status) === "REFUSED" &&
    idCobranca
  ) {
    tipo = referenciaExterna ? "cobranca.recusada" : "pagamento.recusado";
  }

  return {
    eventId: comoTexto(p.id) ?? "",
    tipo,
    providerSubscriptionId: idVinculo,
    providerChargeId: idCobranca,
    referenciaExterna,
    ocorridoEm: parsarDataAsaas(p.dateCreated),
    bruto: payload,
  };
}

/** Implementação da porta. Sem estado: pode ser instanciada a cada chamada. */
export class AsaasProvider implements BillingProvider {
  readonly id = "asaas" as const;

  /**
   * Cria o vínculo de pagamento: cliente + autorização de Pix Automático
   * (Jornada 3) SEM `value` — é a autorização de valor variável que torna o
   * trilho pós-pago possível.
   *
   * `paymentCreationMode: MANUAL` é obrigatório aqui: o modo `SUBSCRIPTION` do
   * Asaas exige `value` fixo, que é exatamente a armadilha descrita em
   * `types.ts` (gateway gerando a cobrança do próximo ciclo com antecedência e
   * com o valor velho). `retryPolicy: NOT_ALLOWED` porque a retentativa de
   * débito é decisão de cobrança do Iris, não do gateway — quem decide o que
   * acontece com um ciclo recusado é `conciliarPagamentoDeCiclo`.
   */
  async iniciarVinculoPagamento(dados: NovoVinculo): Promise<VinculoCriado> {
    const cpfCnpj = dados.assinante.cpfCnpj?.replace(/\D/g, "");
    if (!cpfCnpj) {
      // O Asaas exige `cpfCnpj` na criação do cliente. Falhar aqui, com o
      // motivo nomeado, é melhor que mandar sem e receber um 400 genérico —
      // e MUITO melhor que inventar um documento.
      throw new BillingProviderError(
        "Asaas exige CPF/CNPJ do responsável para criar o cliente",
      );
    }

    const cliente = comoRegistro(
      await chamar("POST", "/customers", {
        corpo: {
          name: dados.assinante.nomeClinica,
          cpfCnpj,
          email: dados.assinante.emailResponsavel,
          externalReference: dados.referenciaExterna,
        },
      }),
    );
    const customerId = comoTexto(cliente.id);
    if (!customerId) {
      throw new BillingProviderError("resposta do Asaas sem `id` de cliente", {
        corpo: cliente,
      });
    }

    const valorAtivacao = VALOR_ATIVACAO_PADRAO_CENTAVOS;

    const autorizacao = comoRegistro(
      await chamar("POST", "/pix/automatic/authorizations", {
        corpo: {
          frequency: "MONTHLY",
          contractId: dados.assinante.clinicId
            .replace(/-/g, "")
            .slice(0, LIMITE_CONTRACT_ID),
          startDate: dataAsaas(new Date()),
          customerId,
          description: "Iris — mensalidade por ficha ativa",
          paymentCreationMode: "MANUAL",
          retryPolicy: "NOT_ALLOWED",
          immediateQrCode: {
            expirationSeconds: EXPIRACAO_QR_ATIVACAO_SEGUNDOS,
            originalValue: centavosParaReais(valorAtivacao),
          },
          // `value` OMITIDO de propósito: é o que caracteriza a Jornada 3 de
          // valor variável. `value` e `minLimitValue` são mutuamente
          // exclusivos no Asaas, e qualquer um dos dois travaria o valor do
          // débito mensal — que é justamente o que muda a cada apuração.
        },
      }),
    );

    const providerVinculoId = comoTexto(autorizacao.id);
    /**
     * O Asaas **não devolve URL de checkout** para uma autorização de Pix
     * Automático — devolve o BR Code (`payload`, copia-e-cola). Até o D21 isso
     * era gravado em `VinculoCriado.checkoutUrl` por falta de lugar melhor na
     * porta; hoje a porta tem a forma certa (`pix_copia_e_cola`) e o adapter
     * não precisa mais mentir.
     *
     * `encodedImage` (o QR em base64) segue ignorado de propósito: é uma
     * renderização deste mesmo `payload`, e a UI desenha o QR localmente.
     */
    const checkout = comoTexto(autorizacao.payload);
    if (!providerVinculoId || !checkout) {
      // 2xx sem `id`/`payload` é contrato quebrado: falhar alto é melhor que
      // persistir vínculo sem identificador (ficaria órfão e invisível).
      throw new BillingProviderError(
        "resposta do Asaas sem `id` ou `payload` na autorização",
        { corpo: autorizacao },
      );
    }

    return {
      providerVinculoId,
      // O Asaas separa cliente e autorização: sem este id, a única forma de
      // reencontrar o cliente já criado é criar outro (D32). Ele sobe pela porta
      // e é gravado junto com `provider`.
      providerCustomerId: customerId,
      // D22: o valor sobe junto com o BR Code. Ele foi cobrado de verdade neste
      // QR, e quem renderiza precisa dizê-lo antes — devolver só o `brCode`
      // deixava a cobrança invisível da borda para dentro.
      autorizacao: {
        forma: "pix_copia_e_cola",
        brCode: checkout,
        valorAtivacaoCentavos: valorAtivacao,
      },
      status: mapearStatusAutorizacao(autorizacao.status),
    };
  }

  async consultarVinculo(providerVinculoId: string): Promise<{
    status: StatusAssinaturaProvider;
  }> {
    const resposta = comoRegistro(
      await chamar(
        "GET",
        `/pix/automatic/authorizations/${encodeURIComponent(providerVinculoId)}`,
      ),
    );
    // Deliberadamente NÃO devolve valor: a autorização é de valor variável, e
    // devolver algum número aqui reintroduziria a confusão que motivou o
    // contrato atual da porta.
    return { status: mapearStatusAutorizacao(resposta.status) };
  }

  /**
   * Atualiza os dados cadastrais do cliente no Asaas (#262). Só envia os
   * campos presentes: mandar `cpfCnpj: null` num PUT poderia apagar o
   * documento do cadastro — omitir preserva o valor atual no gateway.
   */
  async atualizarCliente(dados: {
    providerCustomerId: string;
    nome: string;
    cpfCnpj?: string | null;
    email?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cep?: string | null;
  }): Promise<void> {
    const corpo: Record<string, string> = { name: dados.nome };
    const cpfCnpj = dados.cpfCnpj?.replace(/\D/g, "");
    if (cpfCnpj) corpo.cpfCnpj = cpfCnpj;
    if (dados.email) corpo.email = dados.email;
    // Endereço alimenta boleto/NFS-e no gateway: mesmo padrão truthy-skip dos
    // demais campos. Cidade/UF o Asaas deriva do postalCode.
    if (dados.logradouro) corpo.address = dados.logradouro;
    if (dados.numero) corpo.addressNumber = dados.numero;
    if (dados.complemento) corpo.complement = dados.complemento;
    if (dados.bairro) corpo.province = dados.bairro;
    const cep = dados.cep?.replace(/\D/g, "");
    if (cep) corpo.postalCode = cep;

    await chamar(
      "PUT",
      `/customers/${encodeURIComponent(dados.providerCustomerId)}`,
      { corpo },
    );
  }

  async cancelarVinculo(providerVinculoId: string): Promise<void> {
    await chamar(
      "DELETE",
      `/pix/automatic/authorizations/${encodeURIComponent(providerVinculoId)}`,
    );
  }

  /**
   * Emite a cobrança de um ciclo já apurado, debitada dentro da autorização.
   *
   * `pixAutomaticAuthorizationId` é o campo que faz o débito ser headless.
   * Omiti-lo geraria "uma cobrança Pix convencional" (palavras da doc): um QR
   * que alguém precisa pagar à mão — a clínica não seria debitada e o ciclo
   * ficaria pendente sem ninguém perceber.
   *
   * ## Idempotência
   *
   * O Asaas **não tem** header de idempotência, e a própria doc avisa que a API
   * permite duplicatas. Como uma segunda emissão cobraria a clínica duas vezes
   * pelo mesmo ciclo, a barreira é procurar antes por `externalReference`
   * (`cycle:<id>`, que é único por ciclo) e devolver a cobrança já existente.
   * A busca falhar NÃO é motivo para pular a emissão — mas também não é motivo
   * para emitir às cegas: um erro na busca sobe, e o ciclo é retentado na
   * próxima varredura com o estado ainda em `apurado`.
   */
  async emitirCobrancaDeCiclo(
    dados: NovaCobrancaDeCiclo,
  ): Promise<CobrancaEmitida> {
    const jaEmitida = await this.buscarCobrancaPorReferencia(
      dados.referenciaExterna,
    );
    if (jaEmitida) return jaEmitida;

    // O `POST /payments` do Asaas exige `customer`, e a porta só nos dá o id do
    // vínculo. O cliente é lido da própria autorização — é a fonte da verdade,
    // e evita guardar no Iris um id que o Asaas já guarda.
    const autorizacao = comoRegistro(
      await chamar(
        "GET",
        `/pix/automatic/authorizations/${encodeURIComponent(dados.vinculoId)}`,
      ),
    );
    const customerId = comoTexto(autorizacao.customerId);
    if (!customerId) {
      throw new BillingProviderError(
        "autorização do Asaas sem `customerId` — impossível emitir cobrança",
        { corpo: autorizacao },
      );
    }

    const resposta = comoRegistro(
      await chamar("POST", "/payments", {
        corpo: {
          customer: customerId,
          billingType: "PIX",
          // Conversão centavos → decimal só aqui, na borda do adapter.
          value: centavosParaReais(dados.valorCentavos),
          dueDate: dataAsaas(dados.vencimento),
          description: dados.descricao,
          externalReference: dados.referenciaExterna,
          pixAutomaticAuthorizationId: dados.vinculoId,
        },
      }),
    );

    const providerChargeId = comoTexto(resposta.id);
    if (!providerChargeId) {
      // Sem id não há como reconciliar o webhook com o ciclo.
      throw new BillingProviderError("resposta do Asaas sem `id` de cobrança", {
        corpo: resposta,
      });
    }

    const urlPagamento = comoTexto(resposta.invoiceUrl) ?? undefined;
    return {
      providerChargeId,
      status: mapearStatusCobranca(resposta.status),
      ...(urlPagamento ? { urlPagamento } : {}),
    };
  }

  async consultarCobranca(providerChargeId: string): Promise<{
    status: StatusCobranca;
    valorCentavos: number;
    motivoRecusa: string | null;
  }> {
    const resposta = comoRegistro(
      await chamar("GET", `/payments/${encodeURIComponent(providerChargeId)}`),
    );
    const valor = resposta.value;

    /**
     * Leitura defensiva: nenhum destes campos foi observado numa resposta real
     * (medição de 13/08/2026 — o `payment` recusado não trouxe motivo algum, e
     * `pixTransaction` veio `null`). Tentamos os nomes plausíveis e aceitamos
     * `null`; o diagnóstico com hipóteses ranqueadas fica em
     * `conciliarPagamentoDeCiclo`, não aqui. O adapter não adivinha causa.
     */
    const motivoRecusa =
      comoTexto(resposta.refusalReason) ??
      comoTexto(resposta.failureReason) ??
      comoTexto(comoRegistro(resposta.pixTransaction).failureReason) ??
      null;

    return {
      status: mapearStatusCobranca(resposta.status),
      // Volta ao inteiro na entrada do sistema: nenhum decimal atravessa a porta.
      valorCentavos:
        typeof valor === "number" && Number.isFinite(valor)
          ? reaisParaCentavos(valor)
          : 0,
      motivoRecusa,
    };
  }

  verificarAssinaturaWebhook(input: EntradaVerificacaoWebhook): boolean {
    return verificarEntregaAsaas(input);
  }

  normalizarEvento(payload: unknown): EventoWebhookNormalizado {
    return normalizarEventoAsaas(payload);
  }

  /**
   * Substituto da idempotência que o Asaas não oferece: procura uma cobrança já
   * emitida com a nossa `externalReference`.
   *
   * Devolve `null` quando não há nenhuma. Erro de rede ou 4xx/5xx do Asaas
   * **sobe** — não é engolido: engolir transformaria "não consegui verificar"
   * em "não existe", que é exatamente o caminho para cobrar duas vezes.
   */
  private async buscarCobrancaPorReferencia(
    referenciaExterna: string,
  ): Promise<CobrancaEmitida | null> {
    const resposta = comoRegistro(
      await chamar(
        "GET",
        `/payments?externalReference=${encodeURIComponent(referenciaExterna)}&limit=1`,
      ),
    );
    const lista = Array.isArray(resposta.data) ? resposta.data : [];
    const primeira = comoRegistro(lista[0]);
    const id = comoTexto(primeira.id);
    if (!id) return null;

    const urlPagamento = comoTexto(primeira.invoiceUrl) ?? undefined;
    return {
      providerChargeId: id,
      status: mapearStatusCobranca(primeira.status),
      ...(urlPagamento ? { urlPagamento } : {}),
    };
  }
}
