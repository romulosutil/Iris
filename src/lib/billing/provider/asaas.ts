import "server-only";

import { timingSafeEqual } from "node:crypto";
import { logarAvisoSemPII } from "@/lib/observabilidade/logar-erro";
import { logger } from "@/lib/observabilidade/logger";
import { PISO_TETO_AUTORIZACAO_CENTAVOS } from "../calculator";
import {
  BillingProviderError,
  type BillingProvider,
  type CobrancaEmitida,
  type CobrancaParaReuso,
  type EntradaVerificacaoWebhook,
  type EventoWebhookNormalizado,
  type InstrucaoParaRetentativa,
  type MotivoRecusaDeRetentativa,
  type NovaCobrancaAvulsa,
  type NovaCobrancaDeCiclo,
  type NovoVinculo,
  type ResultadoRetentativa,
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
 * 2. **A cobrança do ciclo só é aceita dentro de uma janela antes do
 *    vencimento** — e a unidade da janela é indeterminada: a doc de
 *    Implementação do Asaas diz "entre 2 e 10 dias **úteis**", os Motivos de
 *    Recusa dizem "menos de 2 dias" / "superior a 10 dias" sem qualificar, e o
 *    BACEN fala em dias corridos. A medição no sandbox (#321, 15/08/2026) não
 *    resolveu: autorização não ativa lá, e todo `POST /payments` devolve o
 *    mesmo 400 de autorização inativa, inclusive dentro da janela. Fora dela o
 *    Asaas recusa com 400. Quem escolhe o vencimento é
 *    `vencimentoCobrancaDeCiclo` (`../vencimento.ts`), que satisfaz a leitura
 *    mais restritiva das duas; aqui a data só é formatada, e a recusa sobe
 *    como `BillingProviderError` 4xx, que a varredura já sabe classificar como
 *    definitiva.
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
 * o suficiente para cair fora da janela que o Pix Automático exige (unidade
 * indeterminada — ver o topo do arquivo). `en-CA` é usado porque é o locale
 * cujo formato de data
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
 * A mensagem humana de um erro do Asaas, extraída do corpo
 * `{errors:[{code, description}]}`.
 *
 * Junta TODAS as descrições porque o Asaas pode devolver mais de uma; perder a
 * segunda apagaria metade do diagnóstico. Corpo sem `errors` legível cai no
 * texto cru — HTML de proxy também é diagnóstico, e é melhor que string vazia.
 */
function mensagemDeErroAsaas(corpo: unknown): string {
  const erros = comoRegistro(corpo).errors;
  if (Array.isArray(erros)) {
    const descricoes = erros
      .map((erro) => comoTexto(comoRegistro(erro).description))
      .filter((d): d is string => d !== null);
    if (descricoes.length > 0) return descricoes.join(" | ");
  }
  if (typeof corpo === "string") return corpo;
  try {
    return JSON.stringify(corpo) ?? "";
  } catch {
    return String(corpo);
  }
}

/**
 * As CINCO validações que o Asaas aplica ao comando de retentativa extradia
 * (`POST /pix/automatic/paymentInstructions/{id}/retries`), todas devolvidas
 * como `400` (issue #317, comentário "As validações que a orquestração tem que
 * respeitar"; #322 §1/D-3).
 *
 * | Regra                                              | Mensagem literal do Asaas |
 * | :------------------------------------------------- | :------------------------ |
 * | Máximo 3 tentativas                                | `Limite de retentativas excedido. A regra permite no máximo 3 tentativas.` |
 * | 7 dias corridos do vencimento original             | `A data solicitada ultrapassa o limite de 7 dias corridos permitidos após o vencimento original.` |
 * | Comando até 23h59 do dia **anterior** à data       | `O agendamento da retentativa deve ser enviado até as 23h59 do dia anterior à data desejada para liquidação.` |
 * | Não coincidir nem passar do início do próximo ciclo| `A data da retentativa não pode coincidir ou ultrapassar o dia de início do próximo ciclo da recorrência.` |
 * | Autorização sem política de retentativa            | `A autorização desta cobrança não permite retentativas extradia (Política N).` |
 *
 * ## Por que o casamento é por TRECHO, e não pela mensagem inteira
 *
 * O Asaas **não publica código de erro dedicado** para estas cinco: o que chega
 * é `code: "invalid_object"`/`"invalid_action"` genérico e uma `description` em
 * português. Comparar a frase inteira quebraria com qualquer ajuste de
 * pontuação, plural ou acentuação do lado deles — e o modo de falha seria mudo
 * (tudo viraria `desconhecido`). Cada trecho abaixo é a parte estável e
 * discriminante da frase, e nenhum deles aparece em duas mensagens diferentes.
 *
 * ## O que NÃO se faz aqui
 *
 * **Nunca inventar código de erro do gateway.** Mensagem que não casa vira
 * `desconhecido` e sobe com o texto cru em `mensagemGateway` — que é o único
 * jeito de a sexta validação (quando existir) aparecer no relatório em vez de
 * ser silenciosamente classificada como uma das cinco.
 *
 * A comparação é feita sobre texto **sem acento e em caixa baixa** porque a
 * mensagem vem em português e transporte/normalização de acento não é contrato.
 */
const TRECHOS_DE_VALIDACAO: ReadonlyArray<
  readonly [string, MotivoRecusaDeRetentativa]
> = [
  ["limite de retentativas excedido", "limite_de_tentativas"],
  ["7 dias corridos", "fora_da_janela_de_7_dias"],
  ["23h59", "fora_do_horario_de_comando"],
  ["proximo ciclo", "colide_com_proximo_ciclo"],
  ["nao permite retentativas extradia", "autorizacao_sem_politica"],
];

/** Caixa baixa + sem diacrítico. Só para COMPARAR; nada normalizado é exibido. */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function classificarRecusaDeRetentativa(
  mensagem: string,
): MotivoRecusaDeRetentativa {
  const normalizada = semAcento(mensagem);
  for (const [trecho, motivo] of TRECHOS_DE_VALIDACAO) {
    if (normalizada.includes(trecho)) return motivo;
  }
  return "desconhecido";
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
 * `paymentInstruction.purpose` → `retentativa.proposito` (#322, D-5).
 *
 * ## ⚠️ NENHUM DOS DOIS CAMPOS FOI OBSERVADO EM PAYLOAD REAL
 *
 * `purpose` e `retryAttempt` são **contrato lido da doc** do Asaas ("Processo de
 * retentativas — Jornada 3 API", registrado no comentário da #317), não medição.
 * E não é descuido de método: no sandbox **nenhuma autorização de Pix Automático
 * chega a `ACTIVE`** (medido em 15/08/2026, #321 — quatro tentativas de criar
 * instrução devolveram o mesmo 400 de "autorização deve estar ativa"), então não
 * existe instrução, não existe retentativa e não existe evento de retentativa
 * para inspecionar. O primeiro payload real só aparece em PRODUÇÃO.
 *
 * ## O que acontece se a doc estiver errada
 *
 * Nome de campo diferente, aninhamento diferente, ou vocabulário diferente
 * (`RETRY` em vez de `RETRY_AFTER_DUE_DATE`) produzem todos o **mesmo desfecho**:
 * `proposito` volta `null`, o consumidor não distingue a retentativa da
 * instrução original, e o mesmo ciclo é recarimbado `past_due` a cada recusa —
 * até três vezes. **Fechado o silêncio em 24/08/2026 (D46):** todo evento com
 * `paymentInstruction` real que não produzir os dois campos esperados grava
 * `[billing-retentativa-envelope-inesperado]` com os valores crus — o teste
 * continua verde contra o payload que a doc descreve, mas o log é quem acorda
 * quando um evento real discordar da doc.
 *
 * `bruto` do evento continua sendo a rede de segurança para inspeção manual: o
 * payload inteiro fica gravado, e o log acima aponta QUANDO ler o primeiro
 * `..._INSTRUCTION_REFUSED` que chegar depois de uma retentativa comandada por
 * nós. Enquanto a medição em produção não acontecer, este mapeamento é
 * **suposição declarada** — o log fecha a lacuna de "nunca saberíamos", não a
 * lacuna de "nunca medimos".
 *
 * Valor fora do vocabulário conhecido vira `null` e **nunca** é repassado cru:
 * uma string desconhecida chegando ao consumidor viraria comparação por
 * adivinhação, que é o defeito que a #318 existe para matar.
 */
function propositoDaInstrucao(
  valor: unknown,
): "SCHEDULE" | "RETRY_AFTER_DUE_DATE" | null {
  return valor === "SCHEDULE" || valor === "RETRY_AFTER_DUE_DATE"
    ? valor
    : null;
}

/**
 * `paymentInstruction.retryAttempt` → `retentativa.tentativa` (#322, D-5).
 *
 * Vale a mesma ressalva de medição de `propositoDaInstrucao`: não observado em
 * payload real.
 *
 * Só vira número se for **inteiro entre 1 e 3**, que é o teto da política
 * `ALLOW_THREE_IN_SEVEN_DAYS`. Tudo mais — `0`, `4`, `"2"` (string), decimal,
 * ausente — vira `null`. A régua é estrita de propósito: `Number("2")` daria 2 e
 * um `4` aceito significaria que a doc mudou, o que é justamente a informação
 * que não pode ser apagada por uma coerção complacente.
 */
function tentativaDaInstrucao(valor: unknown): number | null {
  return typeof valor === "number" &&
    Number.isInteger(valor) &&
    valor >= 1 &&
    valor <= 3
    ? valor
    : null;
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
   * Id da INSTRUÇÃO. É um id diferente do da cobrança e serve para OUTRA coisa:
   * `GET /pix/automatic/paymentInstructions/{id}`, que é o único recurso do
   * Asaas que expõe `refusalReason`.
   *
   * Até o D35 esta linha não existia — o normalizador enxergava o objeto
   * `paymentInstruction`, lia dele status e `paymentId`, e jogava o `id` fora.
   * Sem ele, `consultarCobranca` só tinha o `payment` para consultar, e o
   * `payment` não tem campo de motivo nenhum: o motivo era `null` por
   * construção, não por o gateway não informar.
   */
  const idInstrucao = comoTexto(instrucao.id);

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

  const retentativa = {
    proposito: propositoDaInstrucao(instrucao.purpose),
    tentativa: tentativaDaInstrucao(instrucao.retryAttempt),
  };

  /**
   * D46 — o único jeito de descobrir se `purpose`/`retryAttempt` vieram com
   * nome ou vocabulário diferente do previsto é medir, e a medição não pode
   * depender de alguém lembrar de ler o `bruto` manualmente em produção. Todo
   * evento com `paymentInstruction` real (id presente) que não produziu os
   * dois campos esperados grava um log próprio e greppável com os valores
   * crus — é o sinal que substitui a leitura manual do `bruto` como
   * conferência do D45/D46.
   */
  if (
    idInstrucao &&
    (retentativa.proposito === null ||
      (retentativa.proposito === "RETRY_AFTER_DUE_DATE" &&
        retentativa.tentativa === null))
  ) {
    // `purposeBruto`/`retryAttemptBruto` são o valor CRU do envelope do
    // gateway, e é o ponto do log: descobrir o código novo que a doc não
    // lista. São campos de contrato de faturamento — nunca dado do paciente.
    logger.warn("billing-retentativa.envelope-inesperado", {
      providerInstructionId: idInstrucao,
      purposeBruto: instrucao.purpose,
      retryAttemptBruto: instrucao.retryAttempt,
    });
  }

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
    providerInstructionId: idInstrucao,
    referenciaExterna,
    retentativa,
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
   * com o valor velho).
   *
   * `retryPolicy: ALLOW_THREE_IN_SEVEN_DAYS` **não pode ser mudado depois**: o
   * Asaas só aceita a configuração na criação da autorização. Autorização
   * criada sem ela fica permanentemente sem direito a retentativa, e não há
   * migração — só recriar, o que significa novo QR e novo consentimento do
   * cliente, um a um. Por isso a flag entrou antes da orquestração: ela é
   * inerte sozinha (quem comanda cada retentativa extradia é o recebedor, via
   * `POST /pix/automatic/paymentInstructions/{id}/retries` — issue #322), mas
   * a ausência dela é irreparável. NÃO REMOVER achando que dá para religar.
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
          retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
          immediateQrCode: {
            expirationSeconds: EXPIRACAO_QR_ATIVACAO_SEGUNDOS,
            originalValue: centavosParaReais(valorAtivacao),
          },
          // `value` OMITIDO de propósito: é o que caracteriza a Jornada 3 de
          // valor variável. Preenchê-lo travaria o débito mensal no valor de
          // hoje — a origem exata do subfaturamento descrito em `types.ts`.
          //
          // `minLimitValue` só é incompatível com autorização de valor FIXO
          // (com `value`). Sem `value`, convivem: medido em 15/08/2026 (#321),
          // HTTP 200 com `"minLimitValue":39` e `"value":null` na resposta.
          minLimitValue: centavosParaReais(PISO_TETO_AUTORIZACAO_CENTAVOS),
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

  /**
   * Revoga a autorização de Pix Automático. **Idempotente de propósito**: se a
   * autorização não existe mais no gateway, ou já está cancelada lá, o objetivo
   * desta chamada já está atingido e ela retorna normalmente.
   *
   * ## Por que a tolerância existe (#319)
   *
   * `chamar` traduz TODO não-2xx em `BillingProviderError`, e o corte por
   * carência vencida é fail-closed: falha aqui aborta o corte daquela
   * assinatura. Com o `DELETE` cru, dois cenários rotineiros viravam loop
   * preso — o Asaas processa o DELETE e a resposta se perde no timeout, ou a
   * clínica revoga a autorização pelo app do banco antes de nós. Nos dois a
   * autorização JÁ está morta, mas toda passada diária responderia erro e a
   * assinatura NUNCA seria cortada. Como `past_due` libera escrita
   * (`estado-conta.ts`), o resultado é a clínica inadimplente escrevendo para
   * sempre — exatamente o defeito que a #319 existe para matar, de volta com
   * cara de fail-closed.
   *
   * ## ⚠️ Desenho defensivo, NÃO medição
   *
   * O status que o `DELETE` devolve para uma autorização **já cancelada** não
   * foi medido contra o Asaas (o sandbox não leva autorização nenhuma a
   * `ACTIVE`, memória `sandbox-asaas-nao-ativa-pix-automatico`). O que a doc do
   * endpoint declara é 200, 400 (`{errors:[{code,description}]}`), 401 e 404
   * ("Not found"). Daí a régua:
   *
   * - **404** → sucesso direto: não existe autorização para revogar;
   * - **400** → ambíguo (pode ser `invalid_environment`, chave do ambiente
   *   errado, que NÃO pode virar corte). Então reconsulta o `GET` e só aceita
   *   como sucesso se o próprio gateway disser que a autorização está cancelada
   *   (`CANCELLED`/`REFUSED`/`EXPIRED`). É medição do estado real, não palpite
   *   sobre o código de erro;
   * - qualquer outra coisa — rede, timeout, 401, 5xx — sobe intacta. Aí ninguém
   *   sabe se o DELETE chegou, e fail-closed é a resposta certa.
   */
  async cancelarVinculo(providerVinculoId: string): Promise<void> {
    try {
      await chamar(
        "DELETE",
        `/pix/automatic/authorizations/${encodeURIComponent(providerVinculoId)}`,
      );
    } catch (e) {
      if (!(e instanceof BillingProviderError)) throw e;
      if (e.status === 404) return;
      if (e.status !== 400) throw e;

      // Leitura pura: repeti-la não muda nada no gateway, e é a única forma de
      // distinguir "já estava cancelada" de uma recusa real.
      let atual: { status: StatusAssinaturaProvider };
      try {
        atual = await this.consultarVinculo(providerVinculoId);
      } catch (erroConsulta) {
        // A autorização sumiu entre o DELETE e o GET: mesmo caso do 404 acima.
        if (
          erroConsulta instanceof BillingProviderError &&
          erroConsulta.status === 404
        ) {
          return;
        }
        // Reconsulta inconclusiva não vira permissão para cortar: sobe o erro
        // ORIGINAL, que é o que descreve a recusa do gateway.
        throw e;
      }
      if (atual.status !== "cancelada") throw e;
    }
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

  /**
   * Cobrança avulsa contra o cliente (#290 — débito de reativação).
   *
   * Difere de `emitirCobrancaDeCiclo` em dois pontos, e os dois são o motivo de
   * o método existir separado:
   *
   * 1. **O cliente vem por parâmetro, não da autorização.** Lá o `customerId` é
   *    lido de `GET /pix/automatic/authorizations/{id}` porque a autorização é a
   *    fonte da verdade. Aqui essa autorização foi REVOGADA — é o ato que
   *    produziu o cancelamento — e consultá-la seria pedir 404 (ou pior, um
   *    `customerId` de um trilho morto). O id vem de
   *    `subscription.provider_customer_id`, gravado na ativação.
   * 2. **Sem `pixAutomaticAuthorizationId`.** Anexar o id da autorização faria o
   *    Asaas tentar debitar automaticamente algo que a clínica revogou. Esta
   *    cobrança é Pix comum: a pessoa lê o QR e paga à mão.
   */
  async emitirCobrancaAvulsa(
    dados: NovaCobrancaAvulsa,
  ): Promise<CobrancaEmitida> {
    const jaEmitida = await this.buscarCobrancaPorReferencia(
      dados.referenciaExterna,
    );
    if (jaEmitida) {
      return {
        ...jaEmitida,
        ...(jaEmitida.pixCopiaECola
          ? {}
          : await this.brCodeDe(jaEmitida.providerChargeId)),
      };
    }

    const resposta = comoRegistro(
      await chamar("POST", "/payments", {
        corpo: {
          customer: dados.clienteId,
          billingType: "PIX",
          value: centavosParaReais(dados.valorCentavos),
          dueDate: dataAsaas(dados.vencimento),
          description: dados.descricao,
          externalReference: dados.referenciaExterna,
        },
      }),
    );

    const providerChargeId = comoTexto(resposta.id);
    if (!providerChargeId) {
      throw new BillingProviderError("resposta do Asaas sem `id` de cobrança", {
        corpo: resposta,
      });
    }

    const urlPagamento = comoTexto(resposta.invoiceUrl) ?? undefined;
    return {
      providerChargeId,
      status: mapearStatusCobranca(resposta.status),
      ...(urlPagamento ? { urlPagamento } : {}),
      ...(await this.brCodeDe(providerChargeId)),
    };
  }

  /**
   * BR Code de uma cobrança Pix já criada (`GET /payments/{id}/pixQrCode`).
   *
   * **Nunca lança.** A cobrança já existe neste ponto — deixar uma falha na
   * busca do QR derrubar a emissão obrigaria a próxima tentativa a reconciliar
   * uma cobrança órfã, trocando um QR ausente por um problema pior. Sem o
   * copia-e-cola a tela cai no `invoiceUrl`, que é a fatura hospedada do Asaas.
   *
   * `encodedImage` (o QR em base64) segue ignorado, mesmo motivo da autorização:
   * é uma renderização deste mesmo `payload`, e a UI desenha o QR localmente.
   */
  private async brCodeDe(
    providerChargeId: string,
  ): Promise<{ pixCopiaECola?: string }> {
    try {
      const qr = comoRegistro(
        await chamar(
          "GET",
          `/payments/${encodeURIComponent(providerChargeId)}/pixQrCode`,
        ),
      );
      const payload = comoTexto(qr.payload);
      return payload ? { pixCopiaECola: payload } : {};
    } catch (e) {
      // MUDANÇA DE COMPORTAMENTO (#560, F2): `err: e.message` era o corpo cru
      // devolvido pelo Asaas. Sai a classe do erro + o HTTP status.
      logarAvisoSemPII("billing-debito.falha-ao-obter-br-code", e, {
        providerChargeId,
      });
      return {};
    }
  }

  async consultarCobranca(
    providerChargeId: string,
    opcoes?: { providerInstructionId?: string | null },
  ): Promise<{
    status: StatusCobranca;
    valorCentavos: number;
    motivoRecusa: string | null;
  }> {
    const resposta = comoRegistro(
      await chamar("GET", `/payments/${encodeURIComponent(providerChargeId)}`),
    );
    const valor = resposta.value;
    const status = mapearStatusCobranca(resposta.status);

    return {
      status,
      // Volta ao inteiro na entrada do sistema: nenhum decimal atravessa a porta.
      valorCentavos:
        typeof valor === "number" && Number.isFinite(valor)
          ? reaisParaCentavos(valor)
          : 0,
      // O motivo NÃO sai daqui: `payment` não tem campo de motivo (ver
      // `motivoDaRecusa`). Sai do recurso que tem.
      motivoRecusa: await this.motivoDaRecusa(
        providerChargeId,
        opcoes?.providerInstructionId ?? null,
        status,
      ),
    };
  }

  /**
   * Status crus do Asaas em que uma cobrança AINDA PODE SER PAGA (#310).
   *
   * ALLOW-LIST, não deny-list, e a diferença é o modo de falha: o catálogo de
   * status do Asaas cresce sem versionar (`DUNNING_*`, `AWAITING_RISK_ANALYSIS`
   * já estão lá), e uma deny-list deixaria todo status futuro passar como
   * pagável. Errar para "não é pagável" custa uma cobrança nova consolidada;
   * errar para "é pagável" custa uma cobrança que o cliente paga duas vezes.
   *
   * `OVERDUE` está aqui de propósito, e é o coração da issue: esgotadas as
   * retentativas do Pix Automático o `Payment` vai a OVERDUE, a autorização
   * segue Ativa, e o Asaas MANTÉM o link com boleto e Pix Copia e Cola. É essa
   * cobrança que estava sendo duplicada.
   */
  private static readonly STATUS_PAGAVEIS = new Set(["PENDING", "OVERDUE"]);

  /** Status crus que significam dinheiro já recebido. */
  private static readonly STATUS_PAGOS = new Set([
    "RECEIVED",
    "CONFIRMED",
    "RECEIVED_IN_CASH",
  ]);

  /**
   * Status crus de cobrança terceirizada (recuperação de crédito do Asaas).
   *
   * Ficam FORA de `STATUS_PAGAVEIS` porque nós não os reapresentamos — a
   * cobrança está em outro trilho, com outro cobrador. Mas eles seguem
   * **pagáveis pelo pagador**, e é por isso que ganham motivo próprio em vez de
   * cair no `status_nao_pagavel` genérico: quem lê o motivo precisa saber que
   * emitir uma segunda cobrança aqui é cobrança dupla, não substituição.
   *
   * A doc do Asaas não deixa claro se `DUNNING_RECEIVED` é "recuperada"
   * (dinheiro entrou) ou "em recuperação" — não medimos. Os dois desfechos
   * proíbem emitir outra cobrança, então o grupo é o mesmo e a ignorância não
   * muda a decisão.
   */
  private static readonly STATUS_COBRANCA_TERCEIRIZADA = new Set([
    "DUNNING_REQUESTED",
    "DUNNING_RECEIVED",
  ]);

  async consultarCobrancaParaReuso(
    providerChargeId: string,
  ): Promise<CobrancaParaReuso> {
    let resposta: Record<string, unknown>;
    try {
      resposta = comoRegistro(
        await chamar(
          "GET",
          `/payments/${encodeURIComponent(providerChargeId)}`,
        ),
      );
    } catch (e) {
      // 404 é o ÚNICO erro que vira "morta": o gateway não reconhece o id, e
      // ninguém consegue pagar o que não existe. Todo o resto (rede, timeout,
      // 5xx, 401/408/429) SOBE — "não consegui verificar" virando "não existe"
      // é o caminho direto para a cobrança dupla (precedente #157).
      if (e instanceof BillingProviderError && e.status === 404) {
        logger.warn("billing-reuso.cobranca-nao-encontrada-no-gateway", {
          providerChargeId,
        });
        return { reuso: "morta", motivo: "nao_encontrada" };
      }
      throw e;
    }

    // O Asaas não tem status "cancelada": remoção é o boolean `deleted`. Checar
    // antes do status, porque uma removida continua carregando o status que
    // tinha quando foi removida.
    if (resposta.deleted === true) {
      return { reuso: "morta", motivo: "removida" };
    }

    const statusCru = comoTexto(resposta.status) ?? "";
    if (AsaasProvider.STATUS_PAGOS.has(statusCru)) return { reuso: "paga" };
    if (!AsaasProvider.STATUS_PAGAVEIS.has(statusCru)) {
      // O motivo distingue "morta, pode emitir outra" de "não sei / ainda
      // pagável, não emita nada" — ver `MotivoNaoReuso`. Nenhum dos três aqui é
      // do primeiro grupo: nem estorno, nem cobrança terceirizada, nem status
      // que o Asaas inventou depois provam que ninguém consegue pagar aquilo.
      const motivo = AsaasProvider.STATUS_COBRANCA_TERCEIRIZADA.has(statusCru)
        ? "em_cobranca_terceirizada"
        : mapearStatusCobranca(statusCru) === "estornada"
          ? "estornada"
          : "status_nao_pagavel";
      return { reuso: "morta", motivo };
    }

    // D-6: instrução pendente É o sinal da janela crítica. Não se calcula hora
    // nem fuso — a existência da instrução é o fato. Duas consultas com filtro
    // explícito, e não uma sem filtro: `?paymentId=..&status=..` é a forma já
    // medida e em uso (`instrucaoRecusadaDaCobranca`), e passar vários status
    // num parâmetro só não foi medido.
    if (await this.temInstrucaoPendente(providerChargeId)) {
      return { reuso: "em_processamento" };
    }

    // O valor sai do MESMO `GET /payments/{id}` que já foi feito, pela MESMA
    // conversão de `consultarCobranca` — nenhum arredondamento novo. Sem ele a
    // tela mostra o valor de UM ciclo para uma cobrança que pode ter sido
    // consolidada sobre N, e a copy do total fica falsa.
    const valorBruto = resposta.value;
    if (typeof valorBruto !== "number" || !Number.isFinite(valorBruto)) {
      // Viva e pagável no gateway, mas sem valor legível. Não é `pagavel`:
      // apresentar um copia-e-cola ao lado de "R$ 0,00" é a mesma mentira do QR
      // vazio. E não é do grupo "pode emitir outra" — a cobrança segue viva.
      logger.warn("billing-reuso.cobranca-pagavel-sem-valor-legivel", {
        providerChargeId,
        valor: valorBruto,
      });
      return { reuso: "morta", motivo: "valor_indeterminado" };
    }
    const valorCentavos = reaisParaCentavos(valorBruto);

    const urlPagamento = comoTexto(resposta.invoiceUrl) ?? undefined;
    const { pixCopiaECola } = await this.brCodeDe(providerChargeId);

    if (pixCopiaECola) {
      return {
        reuso: "pagavel",
        valorCentavos,
        pagamento: {
          forma: "pix_copia_e_cola",
          brCode: pixCopiaECola,
          ...(urlPagamento ? { urlPagamento } : {}),
        },
      };
    }
    if (urlPagamento) {
      return {
        reuso: "pagavel",
        valorCentavos,
        pagamento: { forma: "link", urlPagamento },
      };
    }
    // Existe e está pagável no gateway, mas não veio forma nenhuma de pagar.
    // Não é `pagavel`: renderizar um QR vazio faria a clínica achar que pagou o
    // que não pagou. Vira cobrança nova consolidada.
    logger.warn("billing-reuso.cobranca-pagavel-sem-forma-de-pagamento", {
      providerChargeId,
    });
    return { reuso: "morta", motivo: "sem_forma_de_pagamento" };
  }

  /**
   * Há débito automático a caminho para esta cobrança?
   *
   * **Não engole erro de propósito.** Se a listagem falha, não sabemos se
   * existe instrução pendente — e apresentar o copia-e-cola sem saber é
   * exatamente o pagamento em duplicidade que o D-6 existe para evitar. Difere
   * de `motivoDaRecusa`, que degrada porque o motivo é ENRIQUECIMENTO; aqui a
   * resposta decide se um código de pagamento vai para a tela.
   *
   * ## A assimetria 4xx × 5xx, e por que ela não é frouxidão
   *
   * `404` e `400` da listagem viram "não há instrução pendente"; `5xx`, rede e
   * timeout continuam subindo. A razão é o caso MAIS COMUM deste método: a
   * cobrança de débito que o próprio gate emite é **Pix comum**
   * (`emitirCobrancaAvulsa`, `billingType: "PIX"`, sem
   * `pixAutomaticAuthorizationId`) — ela não tem instrução de Pix Automático
   * nenhuma, e um índice que responde 404/400 para "instruções de um pagamento
   * que não é do trilho" está dizendo justamente isso. Fazer esse caso lançar
   * mandava o gate para `bloqueado/gateway_indisponivel` com a copy "tente
   * novamente em alguns instantes" — que NUNCA resolveria, em toda reentrada.
   *
   * `5xx`/rede/timeout são outra coisa: ali o gateway não respondeu à pergunta,
   * e é exatamente onde a ignorância é perigosa (pode haver instrução a caminho
   * e não sabemos). Esses seguem fail-closed.
   */
  private async temInstrucaoPendente(
    providerChargeId: string,
  ): Promise<boolean> {
    for (const status of ["AWAITING_REQUEST", "SCHEDULED"]) {
      let resposta: Record<string, unknown>;
      try {
        resposta = comoRegistro(
          await chamar(
            "GET",
            `/pix/automatic/paymentInstructions?paymentId=${encodeURIComponent(providerChargeId)}&status=${status}`,
          ),
        );
      } catch (e) {
        if (
          e instanceof BillingProviderError &&
          (e.status === 404 || e.status === 400)
        ) {
          // "Esta cobrança não tem instrução deste tipo" — resposta à pergunta,
          // não falha em respondê-la. Segue para o próximo filtro.
          continue;
        }
        throw e;
      }
      const lista = Array.isArray(resposta.data) ? resposta.data : [];
      if (lista.length > 0) return true;
    }
    return false;
  }

  /**
   * Motivo da recusa — lido da INSTRUÇÃO DE PAGAMENTO, que é o recurso que o
   * possui. Fecha o débito D35.
   *
   * ## Por que não é lido da cobrança
   *
   * A versão anterior lia `refusalReason`, `failureReason` e
   * `pixTransaction.failureReason` do corpo de `GET /payments/{id}`. Medido
   * contra o OpenAPI do Asaas: o `PaymentGetResponseDTO` **não declara nenhum
   * dos três**, e `pixTransaction` é `string` (o id da transação), não objeto —
   * o terceiro fallback não tinha nem onde procurar. Não era leitura defensiva:
   * era vazia por construção, e em produção `motivoRecusa` seria `null` sempre,
   * com o teste passando porque o dublê devolvia o literal esperado.
   *
   * `PixAutomaticRecurringPaymentInstructionGetResponseDTO` declara
   * `refusalReason` (string, descrição: "Reason why the payment instruction was
   * refused"). É esse o dono do campo.
   *
   * ## Dois caminhos, um destino
   *
   * 1. **Com o id da instrução** (veio no evento, via `providerInstructionId`):
   *    `GET /pix/automatic/paymentInstructions/{id}`. Uma chamada, sem
   *    ambiguidade.
   * 2. **Sem ele** — é o caso da varredura de pendentes, que recebe só o id da
   *    cobrança: `GET /pix/automatic/paymentInstructions?paymentId=…&status=REFUSED`.
   *    Não é um segundo mecanismo, é o mesmo recurso pelo índice que o Asaas
   *    oferece. Sem este caminho, o gêmeo do webhook (`reprocessarEventosPendentes`)
   *    ficaria permanentemente sem motivo.
   *
   * ## Quando NÃO busca
   *
   * Cobrança paga ou estornada não tem recusa para explicar, e cobrança
   * pendente sem instrução no evento também não (é o `PAYMENT_CREATED` de
   * sempre). Sem essas duas guardas, todo evento de cobrança do dia a dia
   * pagaria uma chamada HTTP extra para receber `null`.
   *
   * ## Falha na busca degrada para "sem motivo", e grita
   *
   * **Escolha deliberada: nunca lança.** O motivo é ENRIQUECIMENTO — quem
   * decide o destino do ciclo é o `status` da cobrança, que já veio. Deixar uma
   * falha aqui derrubar `consultarCobranca` faria a conciliação inteira falhar
   * por causa do campo acessório: o ciclo não cairia em `falhou`, o evento
   * voltaria para a fila e a clínica ficaria em `aguardando_pagamento` — trocar
   * um motivo ausente por uma cobrança não conciliada é o pior negócio possível
   * (mesmo raciocínio de `brCodeDe`).
   *
   * O que NÃO se faz é engolir em silêncio: 404/4xx aqui significa contrato
   * quebrado (id que não resolve, endpoint mudado), e vai para o log com a tag
   * fixa `[billing-recusa]` — a mesma que `conciliarPagamentoDeCiclo` usa, para
   * que um grep só traga as duas metades.
   *
   * ## O retorno é `string`, e continua sendo
   *
   * O catálogo de motivos é ABERTO: o OpenAPI declara `refusalReason` sem
   * `enum`, e a doc de Motivos de Recusa lista ~24 códigos avisando que a lista
   * cresce sem versionar. O adapter repassa o código bruto e não interpreta;
   * qualquer classificação futura precisa de ramo para o desconhecido.
   */
  private async motivoDaRecusa(
    providerChargeId: string,
    providerInstructionId: string | null,
    status: StatusCobranca,
  ): Promise<string | null> {
    if (status === "paga" || status === "estornada") return null;
    if (!providerInstructionId && status !== "recusada") return null;

    try {
      const instrucao = providerInstructionId
        ? comoRegistro(
            await chamar(
              "GET",
              `/pix/automatic/paymentInstructions/${encodeURIComponent(providerInstructionId)}`,
            ),
          )
        : await this.instrucaoRecusadaDaCobranca(providerChargeId);

      return comoTexto(instrucao.refusalReason);
    } catch (e) {
      // MUDANÇA DE COMPORTAMENTO (#560, F2): `err: e.message` era o corpo cru
      // devolvido pelo Asaas.
      logarAvisoSemPII(
        "billing-recusa.falha-ao-ler-instrucao-de-pagamento",
        e,
        {
          providerChargeId,
          providerInstructionId,
        },
      );
      return null;
    }
  }

  /**
   * A instrução recusada de uma cobrança, quando só se tem o id da cobrança.
   *
   * `status=REFUSED` no filtro é o que evita ler a instrução errada: uma mesma
   * cobrança pode ter VÁRIAS instruções (a política de retentativa em vigor é
   * `ALLOW_THREE_IN_SEVEN_DAYS`), e as agendadas não têm motivo nenhum. Sem o
   * filtro, a primeira da lista poderia ser uma `SCHEDULED` e o motivo voltaria
   * `null` com a recusa existindo ao lado.
   *
   * ## Qual das recusadas, quando há mais de uma
   *
   * O filtro por `status` não desempata: sob `ALLOW_THREE_IN_SEVEN_DAYS` uma
   * cobrança pode acumular até três instruções `REFUSED`, e a API não promete
   * ordem nenhuma. Pegar `lista[0]` fazia tanto o motivo da recusa quanto o
   * alvo do `POST .../retries` dependerem do humor do índice do gateway — dois
   * desfechos diferentes para o mesmo estado.
   *
   * A escolha é a **mais recente por data de criação**, com o `id` como
   * desempate estável: é a última coisa que aconteceu com a cobrança, e é dela
   * que sai o diagnóstico atual. Instrução sem data legível vai para o fim da
   * ordem em vez de virar `NaN` no meio da comparação.
   *
   * **D45 (#446), fechado por invariante de código, não por medição:** a doc
   * fala em "3 tentativas em 7 dias" sem dizer de que entidade é o contador
   * (por INSTRUÇÃO ou por cobrança), e o endpoint nunca foi exercitado
   * (nenhuma autorização chega a `ACTIVE` no sandbox, #321). Não importa: quem
   * decide QUANTAS vezes o gateway é chamado é `MAXIMO_RETENTATIVAS_POR_CICLO`
   * em `subscription.ts` (CAS pré-chamada, barrado no `WHERE` da varredura) —
   * este método só decide QUAL instrução, nunca quantas. O sistema nunca emite
   * a 4ª chamada, então "abrir orçamento além de 3" não pode acontecer do
   * nosso lado, seja o contador do Asaas por instrução ou por cobrança. Um 400
   * `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` antes da 3ª (se o contador real for por
   * instrução e mais apertado) já cai no caminho existente de
   * `recusada_pelo_gateway` — tentativa gasta, motivo nomeado, sem retentar na
   * mesma passada. Prova: `retentativa-extradia.int.test.ts` — "comanda as 3
   * retentativas em passadas sucessivas, esgota" — 4ª passada faz ZERO
   * chamadas ao gateway.
   *
   * Lista vazia devolve `{}` — "nenhuma instrução recusada" é resposta válida,
   * não erro.
   */
  private async instrucaoRecusadaDaCobranca(
    providerChargeId: string,
  ): Promise<Record<string, unknown>> {
    const resposta = comoRegistro(
      await chamar(
        "GET",
        `/pix/automatic/paymentInstructions?paymentId=${encodeURIComponent(providerChargeId)}&status=REFUSED`,
      ),
    );
    const lista: unknown[] = Array.isArray(resposta.data) ? resposta.data : [];

    // Sem data legível ⇒ `-Infinity`: a instrução vai para o fim da ordem sem
    // contaminar a comparação, e o desempate por `id` ainda a torna estável.
    const criadaEm = (item: Record<string, unknown>): number =>
      parsarDataAsaas(item.dateCreated)?.getTime() ?? -Infinity;

    let escolhida: Record<string, unknown> | null = null;
    for (const bruto of lista) {
      const atual = comoRegistro(bruto);
      if (!escolhida) {
        escolhida = atual;
        continue;
      }
      const [novaEm, atualEm] = [criadaEm(atual), criadaEm(escolhida)];
      if (novaEm !== atualEm) {
        if (novaEm > atualEm) escolhida = atual;
        continue;
      }
      // Empate de data (ou duas sem data): o maior `id` vence. Arbitrário de
      // propósito — o que importa é ser o MESMO em toda passada.
      const idNovo = comoTexto(atual.id) ?? "";
      const idAtual = comoTexto(escolhida.id) ?? "";
      if (idNovo > idAtual) escolhida = atual;
    }

    return escolhida ?? {};
  }

  /**
   * Comanda UMA retentativa extradia da instrução recusada (#322).
   *
   * ## O que este método é, e o que ele não é
   *
   * `retryPolicy: ALLOW_THREE_IN_SEVEN_DAYS` na autorização **apenas permite** a
   * retentativa extradia; ela não acontece sozinha. Quem dispara cada uma das 3
   * é o RECEBEDOR, por este endpoint. (A retentativa **intradia** — 18h–21h do
   * mesmo dia — é outra coisa: o PSP Pagador executa por conta própria e ela
   * **não consome** nenhuma das 3.)
   *
   * O adapter **não escolhe data**: `dueDate` chega pronta, já calculada contra
   * as quatro restrições (D-3 da #322). Corrigir data aqui esconderia da
   * varredura o fato de que a janela acabou.
   *
   * ## A fronteira entre `{ok:false}` e exceção
   *
   * - **2xx** ⇒ `{ ok: true }`. Comandada.
   * - **400** ⇒ `{ ok: false, motivo, mensagemGateway }`. O gateway respondeu e
   *   disse não: é uma das cinco validações (ver `TRECHOS_DE_VALIDACAO`), e a
   *   varredura registra o motivo nomeado sem insistir.
   * - **Qualquer outra coisa — rede, timeout, 5xx, 401, 404 — SOBE.** Não vira
   *   `{ok:false}`, e a razão é a mesma de `consultarCobrancaParaReuso`: "não
   *   consegui perguntar" não pode virar "o gateway recusou". Um 5xx traduzido
   *   em recusa faria a varredura gravar um desfecho definitivo sobre uma
   *   pergunta que nunca foi respondida — e o comando pode ter sido aceito do
   *   outro lado. Quem decide o que fazer com indisponibilidade é a varredura,
   *   que tem o contador de tentativas em mãos.
   */
  async comandarRetentativa(
    providerInstructionId: string,
    dueDate: string,
  ): Promise<ResultadoRetentativa> {
    try {
      await chamar(
        "POST",
        `/pix/automatic/paymentInstructions/${encodeURIComponent(providerInstructionId)}/retries`,
        { corpo: { dueDate } },
      );
      return { ok: true };
    } catch (e) {
      if (!(e instanceof BillingProviderError) || e.status !== 400) throw e;
      const mensagemGateway = mensagemDeErroAsaas(e.corpo);
      return {
        ok: false,
        motivo: classificarRecusaDeRetentativa(mensagemGateway),
        mensagemGateway,
      };
    }
  }

  /**
   * A instrução a retentar de uma cobrança, e se já existe uma a caminho
   * (#322, D-4 — Guarda 1 e o argumento de `comandarRetentativa`).
   *
   * ## Duas listagens, e a ordem importa
   *
   * `AWAITING_REQUEST`/`SCHEDULED` é perguntado ANTES de procurar a recusada:
   * havendo instrução a caminho, o id da recusada é irrelevante — a varredura
   * não vai comandar nada, e uma segunda ida ao gateway seria round-trip
   * desperdiçado dentro do orçamento de 30s do job.
   *
   * ## Por que reusa os dois privados em vez de uma consulta nova
   *
   * `temInstrucaoPendente` e `instrucaoRecusadaDaCobranca` já existem, já
   * filtram por `status` (uma cobrança tem VÁRIAS instruções sob
   * `ALLOW_THREE_IN_SEVEN_DAYS`, e pegar a primeira da lista traria uma
   * `SCHEDULED` sem motivo nenhum) e já têm a assimetria 4xx × 5xx medida. O
   * que faltava era um ponto PÚBLICO por onde a varredura os alcançasse — ela
   * não pode depender de detalhe interno do adapter, e nenhum outro adapter é
   * obrigado a ter instrução de débito (por isso o método é opcional na porta).
   *
   * Instrução recusada ausente devolve `providerInstructionId: null` em vez de
   * lançar: "esta cobrança não tem nada a retentar" é resposta à pergunta, e
   * quem decide o que fazer com ela é a varredura.
   */
  async instrucaoParaRetentativa(
    providerChargeId: string,
  ): Promise<InstrucaoParaRetentativa> {
    if (await this.temInstrucaoPendente(providerChargeId)) {
      return { providerInstructionId: null, pendente: true };
    }
    const instrucao = await this.instrucaoRecusadaDaCobranca(providerChargeId);
    return {
      providerInstructionId: comoTexto(instrucao.id),
      pendente: false,
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
