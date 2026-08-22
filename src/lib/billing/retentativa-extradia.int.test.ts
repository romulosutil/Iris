import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";
import {
  chamadasDeRetentativaFake,
  definirInstrucaoFake,
  enfileirarRetentativasFake,
  ID_PROVEDOR_FAKE,
  limparRetentativasFake,
  PREFIXO_INSTRUCAO_FAKE,
  ProvedorFake,
} from "@tests/provedor-fake";

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor puxam
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

/**
 * O gateway destes casos é o provedor FAKE, pelas mesmas razões da #318/#319: a
 * varredura resolve o adapter POR LINHA (`getProviderPorId`), e é no fake que
 * mora o registro ordenado de comandos (`chamadasDeRetentativaFake`) — o
 * oráculo do caso de idempotência, que é invisível no valor de retorno.
 */
/**
 * Ponto de encontro OPCIONAL na consulta de instrução, instalado só pelo caso
 * de concorrência.
 *
 * Sem ele o teste de idempotência é uma loteria: as duas passadas disputam o
 * event loop e, na ordem em que o Node quis, a segunda pode ler o banco DEPOIS
 * da escrita da primeira — aí ela comanda a tentativa 2 legitimamente e o caso
 * falha sem que exista defeito nenhum (medido: verde sozinho, vermelho em
 * suíte). A barreira força o que o compare-and-set existe para resolver: as
 * duas leram `retentativas_comandadas = 0` antes de qualquer escrita.
 *
 * Fica na consulta de instrução porque ela roda DEPOIS do SELECT de elegíveis e
 * ANTES da reserva — exatamente a janela de corrida da D-4.
 */
let barreiraDeInstrucao: (() => Promise<void>) | null = null;

class ProvedorFakeComBarreira extends ProvedorFake {
  override async instrucaoParaRetentativa(providerChargeId: string) {
    if (barreiraDeInstrucao) await barreiraDeInstrucao();
    return super.instrucaoParaRetentativa(providerChargeId);
  }
}

vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE
        ? new ProvedorFakeComBarreira()
        : real.getProviderPorId(id),
  };
});

const {
  cancelarAssinaturasComCarenciaVencida,
  comandarRetentativasPendentes,
  conciliarPagamentoDeCiclo,
} = await import("./subscription");

/**
 * #322 — orquestração da retentativa extradia do Pix Automático.
 *
 * ## O que estes casos medem
 *
 * O COMPORTAMENTO da varredura e da conciliação dado um estado de banco. O que
 * eles **não** medem, e nenhum teste fora de produção mede, é o payload real: o
 * sandbox do Asaas não ativa autorização nenhuma (#321), então nem o envelope
 * com `purpose`/`retryAttempt` nem o `POST .../retries` foram observados de
 * verdade. Que o gateway aceite `dueDate` de sábado no trilho de retentativa é
 * dedução da medição do trilho avulso (ver `retentativa-data.ts`).
 *
 * ## O oráculo é sempre a COLUNA relida
 *
 * O retorno diz `acao: "comandada"` a partir de um `.returning()` que poderia
 * ter sido no-op noutra ordem de escrita. Todos os casos releem `billing_cycle`
 * e `subscription` pela conexão dona.
 *
 * ## Datas escritas à mão
 *
 * Nenhuma constante de janela é importada: importar faria o caso concordar com
 * qualquer valor que a constante tivesse. Os números (7 dias de janela, 10 de
 * carência) são o limite publicado pelo Asaas e a coluna da assinatura.
 */

const CLINICA_A = "00000000-0000-0000-0000-000000322a01";
const CLINICA_B = "00000000-0000-0000-0000-000000322a02";
const CLINICA_C = "00000000-0000-0000-0000-000000322a03";
const CLINICA_D = "00000000-0000-0000-0000-000000322a04";
const CLINICA_E = "00000000-0000-0000-0000-000000322a05";

const SUB_A = "00000000-0000-0000-0000-000000322b01";
const SUB_B = "00000000-0000-0000-0000-000000322b02";
const SUB_C = "00000000-0000-0000-0000-000000322b03";
const SUB_D = "00000000-0000-0000-0000-000000322b04";
const SUB_E = "00000000-0000-0000-0000-000000322b05";

const CLINICAS = [CLINICA_A, CLINICA_B, CLINICA_C, CLINICA_D, CLINICA_E];

/**
 * Vencimento da cobrança recusada — o marco do teto A (vencimento + 7 dias
 * corridos ⇒ a última data comandável é 17/08).
 */
const VENCIMENTO = new Date("2026-08-10T12:00:00.000Z");

/** Entrada em `past_due`: a carência de 10 dias vence em 20/08 às 12:00Z. */
const PAST_DUE_DESDE = new Date("2026-08-10T12:00:00.000Z");

/** Início do próximo ciclo bem longe: o teto B não é o assunto destes casos. */
const PROXIMO_CICLO = new Date("2026-09-05T00:00:00.000Z");

/** 12:00 de São Paulo do dia indicado — o instante de cada passada. */
function meioDiaSp(dia: string): Date {
  return new Date(`${dia}T15:00:00.000Z`);
}

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

// ── Dublê do gateway (só o corte por carência fala HTTP) ─────────────────────

/**
 * Estado que a consulta de cobrança devolve na Guarda 1b da varredura.
 *
 * `PENDENTE` é o default — "a cobrança não liquidou", o caminho de toda
 * retentativa legítima. Um caso que precise medir a auto-cura do webhook
 * perdido troca por `LIQUIDADA` antes de chamar a varredura.
 */
let estadoCobrancaNoGateway = "PENDENTE";

/**
 * `cancelarAssinaturasComCarenciaVencida` revoga a autorização no gateway antes
 * de escrever, e o `ProvedorFake` faz isso por `fetch` de verdade. O mesmo vale
 * para a Guarda 1b da varredura, que reconsulta a cobrança antes de reservar —
 * `comandarRetentativa` e `instrucaoParaRetentativa` continuam programáveis no
 * próprio fake, sem HTTP.
 */
function instalarGateway(): void {
  vi.stubGlobal("fetch", async (entrada: unknown) => {
    const url = String(entrada);
    if (url.endsWith("/cancelamento")) {
      return Response.json({ estado: "CANCELADO" });
    }
    if (url.includes("/vinculos/")) {
      return Response.json({ estado: "CANCELADO" });
    }
    if (url.includes("/cobrancas/")) {
      return Response.json({ estado: estadoCobrancaNoGateway, centavos: 3900 });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function criarAssinatura(opcoes: {
  clinicId: string;
  subscriptionId: string;
  status?: "active" | "past_due" | "canceled";
  pastDueDesde?: Date | null;
  proximoCicloInicio?: Date;
}): Promise<void> {
  await owner!`
    INSERT INTO clinic (id, nome)
    VALUES (${opcoes.clinicId}, ${`Clínica #322 ${opcoes.clinicId.slice(-4)}`})`;

  const fim = opcoes.proximoCicloInicio ?? PROXIMO_CICLO;
  const inicio = new Date(fim.getTime() - 30 * 86_400_000);

  await owner!`
    INSERT INTO subscription
      (id, clinic_id, status, provider, provider_subscription_id,
       provider_customer_id, ciclo_dias, carencia_dias, past_due_desde,
       ciclo_atual_inicio, ciclo_atual_fim)
    VALUES (
      ${opcoes.subscriptionId}, ${opcoes.clinicId},
      ${opcoes.status ?? "past_due"}::subscription_status,
      ${ID_PROVEDOR_FAKE}, ${`vinculo-fake-322-${opcoes.clinicId.slice(-4)}`},
      ${"cli-fake-322"}, 30, 10,
      ${opcoes.pastDueDesde === undefined ? PAST_DUE_DESDE : opcoes.pastDueDesde},
      ${inicio}, ${fim}
    )`;
}

async function criarCicloRecusado(opcoes: {
  clinicId: string;
  subscriptionId: string;
  recusaCodigo: string | null;
  status?: "falhou" | "aguardando_pagamento" | "pago";
  erro?: string | null;
  retentativasComandadas?: number;
  ultimaRetentativaVencimento?: string | null;
  providerChargeId?: string | null;
  /**
   * `undefined` usa o `VENCIMENTO` do arquivo; `null` grava a coluna vazia —
   * que é o estado em que o teto A é imensurável e a varredura tem de sair
   * fail-closed.
   */
  vencimentoCobranca?: Date | null;
}): Promise<{ cicloId: string; providerChargeId: string | null }> {
  const providerChargeId =
    opcoes.providerChargeId === undefined
      ? `pay_322_${opcoes.clinicId.slice(-4)}`
      : opcoes.providerChargeId;

  const linhas = (await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
       provider_charge_id, cobranca_emitida_em, vencimento_cobranca,
       recusa_codigo, erro, retentativas_comandadas,
       ultima_retentativa_vencimento)
    VALUES (
      ${opcoes.clinicId}, ${opcoes.subscriptionId},
      ${new Date("2026-07-05T00:00:00.000Z")}, ${new Date("2026-08-05T00:00:00.000Z")},
      ${opcoes.status ?? "falhou"}::billing_cycle_status, 3900,
      ${providerChargeId}, ${new Date("2026-08-05T00:00:00.000Z")},
      ${opcoes.vencimentoCobranca === undefined ? VENCIMENTO : opcoes.vencimentoCobranca},
      ${opcoes.recusaCodigo}, ${opcoes.erro ?? "recusa original"},
      ${opcoes.retentativasComandadas ?? 0},
      ${opcoes.ultimaRetentativaVencimento ?? null}
    )
    RETURNING id`) as unknown as { id: string }[];

  return { cicloId: linhas[0]!.id, providerChargeId };
}

/**
 * Início dos ciclos do LOTE, longe do ciclo avulso (05/07/2026) porque
 * `(clinic_id, inicio)` é UNIQUE: cada linha do lote anda um dia a partir daqui.
 */
const INICIO_BASE_DO_LOTE = new Date("2024-01-01T00:00:00.000Z");

/**
 * N ciclos `falhou`/G2 da MESMA assinatura, todos elegíveis, para os casos do
 * teto por passada.
 *
 * `generate_series` em vez de N `INSERT`s porque o que o caso mede é a fila com
 * 21 linhas dentro, não a inserção — e 21 idas ao banco por caso deixariam o
 * arquivo lento sem medir nada a mais. O deslocamento serve às duas colunas
 * únicas da tabela: `inicio` (UNIQUE com a clínica) e `provider_charge_id`
 * (UNIQUE parcial da 0075).
 */
async function criarCiclosRecusadosEmLote(opcoes: {
  clinicId: string;
  subscriptionId: string;
  quantidade: number;
  vencimento: Date;
  deslocamento: number;
}): Promise<string[]> {
  const linhas = (await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
       provider_charge_id, cobranca_emitida_em, vencimento_cobranca,
       recusa_codigo, erro)
    SELECT ${opcoes.clinicId}, ${opcoes.subscriptionId},
           ${INICIO_BASE_DO_LOTE}::timestamptz + make_interval(days => g),
           ${INICIO_BASE_DO_LOTE}::timestamptz + make_interval(days => g + 30),
           'falhou'::billing_cycle_status, 3900,
           'pay_322_lote_' || g,
           ${new Date("2026-08-05T00:00:00.000Z")}, ${opcoes.vencimento},
           'PAYMENT_OVERDUE', 'recusa original'
      FROM generate_series(
        ${opcoes.deslocamento}::int,
        ${opcoes.deslocamento + opcoes.quantidade - 1}::int
      ) AS g
    RETURNING id`) as unknown as { id: string }[];

  return linhas.map((linha) => linha.id);
}

interface LinhaCiclo {
  status: string;
  erro: string | null;
  recusa_codigo: string | null;
  retentativas_comandadas: number;
  ultima_retentativa_em: Date | null;
  ultima_retentativa_vencimento: string | null;
}

async function lerCiclo(id: string): Promise<LinhaCiclo> {
  const linhas = (await owner!`
    SELECT status::text AS status, erro, recusa_codigo,
           retentativas_comandadas,
           ultima_retentativa_em,
           ultima_retentativa_vencimento::text AS ultima_retentativa_vencimento
      FROM billing_cycle WHERE id = ${id}`) as unknown as LinhaCiclo[];
  return linhas[0]!;
}

interface LinhaAssinatura {
  status: string;
  past_due_desde: Date | null;
  atualizado_em: Date;
}

async function lerAssinatura(id: string): Promise<LinhaAssinatura> {
  const linhas = (await owner!`
    SELECT status::text AS status, past_due_desde, atualizado_em
      FROM subscription WHERE id = ${id}`) as unknown as LinhaAssinatura[];
  return linhas[0]!;
}

async function limpar(): Promise<void> {
  await owner!`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
  // Fichas e clínicas saem por DELETE ESCOPADO e NÃO entram no TRUNCATE: pôr
  // `patient` lá alarga a superfície de lock o bastante para colidir com o
  // `TRUNCATE clinic` de outros arquivos de integração (deadlock medido na
  // #319).
  await owner!`DELETE FROM patient WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM audit_log WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM clinic WHERE id = ANY(${CLINICAS}::uuid[])`;
}

describe.skipIf(!hasDb)("#322 · retentativa extradia", () => {
  beforeEach(async () => {
    limparRetentativasFake();
    barreiraDeInstrucao = null;
    estadoCobrancaNoGateway = "PENDENTE";
    instalarGateway();
    await limpar();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (owner) {
      await limpar();
      await owner.end();
    }
  });

  // ── 1. Fluxo completo: recusa G2 → 3 retentativas → esgotamento → corte ────

  it("comanda as 3 retentativas em passadas sucessivas, esgota, e o corte continua sendo o da carência de 10 dias", async () => {
    await criarAssinatura({ clinicId: CLINICA_A, subscriptionId: SUB_A });
    const { cicloId, providerChargeId } = await criarCicloRecusado({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    // ── Passada 1: comanda a 1ª tentativa para AMANHÃ ──────────────────────
    const passada1 = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });
    expect(passada1).toHaveLength(1);
    expect(passada1[0]).toMatchObject({
      cicloId,
      acao: "comandada",
      grupo: "G2",
      tentativa: 1,
      dueDate: "2026-08-12",
      providerInstructionId: `${PREFIXO_INSTRUCAO_FAKE}${providerChargeId}`,
      motivo: null,
      erro: null,
    });
    expect(chamadasDeRetentativaFake).toEqual([
      {
        providerInstructionId: `${PREFIXO_INSTRUCAO_FAKE}${providerChargeId}`,
        dueDate: "2026-08-12",
      },
    ]);

    const depoisDa1 = await lerCiclo(cicloId);
    expect(depoisDa1.retentativas_comandadas).toBe(1);
    expect(depoisDa1.ultima_retentativa_vencimento).toBe("2026-08-12");
    expect(depoisDa1.ultima_retentativa_em).not.toBeNull();

    // A retentativa é recusada pelo MESMO motivo (mesmo grupo): o webhook chega
    // com `purpose: RETRY_AFTER_DUE_DATE` e NÃO pode reescrever o diagnóstico
    // original nem recarimbar a assinatura (F5). Um código de OUTRO grupo aqui
    // não provaria preservação — provaria o guard engolindo causa nova, que é
    // o defeito consertado na revisão.
    const antesDoWebhook = await lerAssinatura(SUB_A);
    await conciliarPagamentoDeCiclo(
      providerChargeId!,
      "recusada",
      "PAYMENT_OVERDUE",
      { proposito: "RETRY_AFTER_DUE_DATE", tentativa: 1 },
    );
    const depoisDoWebhook = await lerCiclo(cicloId);
    expect(depoisDoWebhook.recusa_codigo).toBe("PAYMENT_OVERDUE");
    expect(depoisDoWebhook.erro).toBe("recusa original");
    expect(await lerAssinatura(SUB_A)).toEqual(antesDoWebhook);

    // ── Passada 2 ─────────────────────────────────────────────────────────
    const passada2 = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-13"),
    });
    expect(passada2[0]).toMatchObject({
      acao: "comandada",
      tentativa: 2,
      dueDate: "2026-08-14",
    });

    // ── Passada 3: a última que cabe na janela de 7 dias (teto: 17/08) ────
    const passada3 = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-15"),
    });
    expect(passada3[0]).toMatchObject({
      acao: "comandada",
      tentativa: 3,
      dueDate: "2026-08-16",
    });

    expect(chamadasDeRetentativaFake.map((c) => c.dueDate)).toEqual([
      "2026-08-12",
      "2026-08-14",
      "2026-08-16",
    ]);

    // ── Passada 4: orçamento esgotado ─────────────────────────────────────
    // O ciclo sai do conjunto elegível no PRÓPRIO `WHERE` (contador = 3), e não
    // depois do `LIMIT`: enquanto o filtro morava no laço, este ciclo — que
    // nunca mais muda de estado — ocupava uma das 20 vagas da passada para
    // sempre, e uma recusa nova atrás dele na fila jamais era avaliada.
    const passada4 = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-17"),
    });
    expect(passada4).toEqual([]);
    expect(chamadasDeRetentativaFake).toHaveLength(3);

    // ── D-6: esgotar não antecipa o corte ─────────────────────────────────
    // A carência é `past_due_desde (10/08 12:00Z) + 10 dias`. Em 19/08 a
    // assinatura continua viva, apesar de o orçamento ter acabado em 16/08.
    const semCorte = await cancelarAssinaturasComCarenciaVencida({
      agora: meioDiaSp("2026-08-19"),
    });
    expect(semCorte).toEqual([]);
    expect((await lerAssinatura(SUB_A)).status).toBe("past_due");

    // ...e o corte acontece no dia 10 da carência, pelo caminho de sempre.
    const comCorte = await cancelarAssinaturasComCarenciaVencida({
      agora: meioDiaSp("2026-08-20"),
    });
    expect(comCorte).toHaveLength(1);
    expect(comCorte[0]).toMatchObject({ subscriptionId: SUB_A, cortada: true });
    expect((await lerAssinatura(SUB_A)).status).toBe("canceled");
  });

  // ── 2. Grupo não retentável ───────────────────────────────────────────────

  it("G5 (ACCOUNT_CLOSED) não entra no conjunto elegível — nem ocupa vaga da passada", async () => {
    await criarAssinatura({ clinicId: CLINICA_B, subscriptionId: SUB_B });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      recusaCodigo: "ACCOUNT_CLOSED",
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    // O filtro por grupo mora no `WHERE` (`CODIGOS_RETENTAVEIS_AUTOMATICAMENTE`).
    // Reportar a linha como "avaliada" era o defeito: conta encerrada nunca
    // muda de estado, então ela reaparecia na frente da fila em toda passada.
    expect(resultado).toEqual([]);
    // O oráculo do "nunca chama": conta encerrada recusa igual na 1ª, na 2ª e
    // na 3ª — gastar tentativa aqui é queimar o orçamento do caso de saldo.
    expect(chamadasDeRetentativaFake).toEqual([]);
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(0);
  });

  /**
   * O caso do G5 acima NÃO distingue os dois campos da política: em G5
   * `valeGastarRetentativa` e `retentavelAutomaticamente` são AMBOS `false`, e
   * trocar um pelo outro no `CODIGOS_RETENTAVEIS_AUTOMATICAMENTE` deixaria o
   * conjunto elegível idêntico.
   *
   * Os dois códigos abaixo são exatamente onde os campos DIVERGEM
   * (`valeGastar = true`, `retentavel = false`): vale gastar tentativa **depois
   * que alguém agir** — a clínica sobe o limite no app do banco (G1), nós
   * consertamos o comando mal emitido (G6) —, e uma varredura não sobe limite
   * nem conserta bug nosso. Comandar aqui queima em teto baixo e em defeito
   * nosso as 3 tentativas de que o caso de saldo precisa.
   */
  it.each([
    ["MAXIMUM_AMOUNT_EXCEEDED", "G1"],
    ["RECEIVED_TOO_EARLY", "G6"],
  ])(
    "%s (%s) vale tentativa depois que a clínica agir, mas a varredura NÃO comanda sozinha",
    async (codigo) => {
      await criarAssinatura({ clinicId: CLINICA_B, subscriptionId: SUB_B });
      const { cicloId } = await criarCicloRecusado({
        clinicId: CLINICA_B,
        subscriptionId: SUB_B,
        recusaCodigo: codigo,
      });

      const resultado = await comandarRetentativasPendentes({
        agora: meioDiaSp("2026-08-11"),
      });

      expect(resultado).toEqual([]);
      expect(chamadasDeRetentativaFake).toEqual([]);
      expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(0);
    },
  );

  // ── 2b. O que o `WHERE` exige da LINHA ────────────────────────────────────

  it("assinatura `canceled` nunca é retentada, mesmo com ciclo `falhou` de G2", async () => {
    // Cortada, a autorização de Pix Automático já foi revogada: comandar aqui
    // é pedir débito de quem o produto desligou, e a chamada só poderia voltar
    // 400 — com a tentativa reservada antes dela (D-4).
    await criarAssinatura({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      status: "canceled",
    });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado).toEqual([]);
    expect(chamadasDeRetentativaFake).toEqual([]);
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(0);
  });

  it("ciclo `aguardando_pagamento` não é elegível — retentativa extradia é sobre instrução RECUSADA", async () => {
    // O código de recusa está gravado e a cobrança existe; o que falta é a
    // recusa ter acontecido de fato. Retentar um débito que ninguém recusou
    // gastaria tentativa contra uma cobrança que ainda pode liquidar sozinha.
    await criarAssinatura({ clinicId: CLINICA_D, subscriptionId: SUB_D });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_D,
      subscriptionId: SUB_D,
      status: "aguardando_pagamento",
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado).toEqual([]);
    expect(chamadasDeRetentativaFake).toEqual([]);
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(0);
  });

  it("ciclo sem `provider_charge_id` não é elegível — não há cobrança de onde sair instrução", async () => {
    await criarAssinatura({ clinicId: CLINICA_E, subscriptionId: SUB_E });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_E,
      subscriptionId: SUB_E,
      recusaCodigo: "PAYMENT_OVERDUE",
      providerChargeId: null,
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado).toEqual([]);
    expect(chamadasDeRetentativaFake).toEqual([]);
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(0);
  });

  it("ciclo sem `vencimento_cobranca` não é elegível (fail-closed do teto A)", async () => {
    // Sem o vencimento persistido, `vencimento + 7 dias corridos` é
    // imensurável — e recalculá-lo mediria de uma data que nunca foi enviada a
    // gateway nenhum. Fora do conjunto é o único desfecho seguro.
    await criarAssinatura({ clinicId: CLINICA_A, subscriptionId: SUB_A });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      recusaCodigo: "PAYMENT_OVERDUE",
      vencimentoCobranca: null,
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado).toEqual([]);
    expect(chamadasDeRetentativaFake).toEqual([]);
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(0);
  });

  // ── 2c. Teto de ciclos AVALIADOS por passada, e a ordem da fila ───────────

  it("21 elegíveis: a passada avalia 20, marca todos como truncados, e leva os de vencimento MAIS ANTIGO", async () => {
    // Os números são escritos à mão: importar `TETO_RETENTATIVAS_POR_PASSADA`
    // faria o caso concordar com qualquer valor que a constante tivesse.
    await criarAssinatura({ clinicId: CLINICA_B, subscriptionId: SUB_B });
    const antigos = await criarCiclosRecusadosEmLote({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      quantidade: 20,
      vencimento: new Date("2026-08-08T12:00:00.000Z"),
      deslocamento: 0,
    });
    const [maisNovo] = await criarCiclosRecusadosEmLote({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      quantidade: 1,
      // Dois dias DEPOIS dos outros vinte: é ele que sobra na ordem por
      // vencimento, e é ele que a passada seguinte pega.
      vencimento: new Date("2026-08-10T12:00:00.000Z"),
      deslocamento: 100,
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado).toHaveLength(20);
    expect(chamadasDeRetentativaFake).toHaveLength(20);
    expect(resultado.every((r) => r.truncado === true)).toBe(true);
    // Sem `ORDER BY` cada passada varreria um subconjunto arbitrário e uma
    // linha azarada poderia nunca sair da fila.
    expect([...resultado.map((r) => r.cicloId)].sort()).toEqual(
      [...antigos].sort(),
    );
    expect(resultado.map((r) => r.cicloId)).not.toContain(maisNovo);
  });

  it("20 elegíveis NÃO são truncados — é a sonda `+1` que distingue cheio de estourado", async () => {
    await criarAssinatura({ clinicId: CLINICA_C, subscriptionId: SUB_C });
    await criarCiclosRecusadosEmLote({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      quantidade: 20,
      vencimento: new Date("2026-08-08T12:00:00.000Z"),
      deslocamento: 0,
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado).toHaveLength(20);
    expect(chamadasDeRetentativaFake).toHaveLength(20);
    // Um `LIMIT` sem o `+1` daria exatamente estas 20 linhas e chamaria a
    // passada de truncada: é este caso, e não o de 21, que prova a sonda.
    expect(resultado.every((r) => r.truncado === false)).toBe(true);
  });

  // ── 3. Idempotência sob concorrência (D-4) ────────────────────────────────

  it("duas passadas concorrentes sobre o mesmo ciclo produzem UMA única chamada ao gateway", async () => {
    await criarAssinatura({ clinicId: CLINICA_C, subscriptionId: SUB_C });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    // Barreira de duas: nenhuma passada reserva enquanto as duas não tiverem
    // lido `retentativas_comandadas = 0`. É a corrida real da D-4, encenada de
    // forma determinística.
    let chegadas = 0;
    let liberar!: () => void;
    const asDuasChegaram = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    barreiraDeInstrucao = async () => {
      chegadas += 1;
      if (chegadas === 2) liberar();
      await asDuasChegaram;
    };

    const agora = meioDiaSp("2026-08-11");
    const [a, b] = await Promise.all([
      comandarRetentativasPendentes({ agora }),
      comandarRetentativasPendentes({ agora }),
    ]);

    // Uma comanda, a outra perde a reserva no compare-and-set. Qual delas ganha
    // é indeterminado de propósito — o invariante é a CONTAGEM.
    const acoes = [a[0]!.acao, b[0]!.acao].sort();
    expect(acoes).toEqual(["comandada", "nao_comandada"]);
    const perdida = [a[0]!, b[0]!].find((r) => r.acao === "nao_comandada")!;
    expect(perdida.motivo).toBe("reserva_perdida");

    // O oráculo real: o gateway foi chamado UMA vez, e o orçamento gasto é 1.
    expect(chamadasDeRetentativaFake).toHaveLength(1);
    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.retentativas_comandadas).toBe(1);
    expect(ciclo.ultima_retentativa_vencimento).toBe("2026-08-12");
  });

  // ── 4. Guarda 1: instrução já a caminho ───────────────────────────────────

  it("não comanda por cima de instrução pendente no gateway", async () => {
    await criarAssinatura({ clinicId: CLINICA_D, subscriptionId: SUB_D });
    const { cicloId, providerChargeId } = await criarCicloRecusado({
      clinicId: CLINICA_D,
      subscriptionId: SUB_D,
      recusaCodigo: "PAYMENT_OVERDUE",
      retentativasComandadas: 1,
      ultimaRetentativaVencimento: "2026-08-12",
    });
    definirInstrucaoFake(providerChargeId!, "pendente");

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado[0]).toMatchObject({
      acao: "nao_comandada",
      motivo: "instrucao_pendente",
    });
    expect(chamadasDeRetentativaFake).toEqual([]);
    // A reserva NÃO aconteceu: a guarda sai antes do compare-and-set.
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(1);
  });

  // ── 4b. Guarda 1b: a cobrança já liquidou (auto-cura do webhook perdido) ──

  it("cobrança já liquidada no gateway não vira SEGUNDO débito — e o ciclo se concilia sozinho", async () => {
    // A D-1 assume que webhook se perde. A consequência é que o ciclo continua
    // `falhou` com um `recusa_codigo` retentável, ou seja, dentro do conjunto
    // elegível — e a passada seguinte debitaria a mesma mensalidade de novo na
    // conta da clínica. "Cobrança já liquidada" não está entre as cinco
    // validações do `POST .../retries`: nada garante que o gateway recusaria.
    await criarAssinatura({ clinicId: CLINICA_A, subscriptionId: SUB_A });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      recusaCodigo: "PAYMENT_OVERDUE",
    });
    estadoCobrancaNoGateway = "LIQUIDADA";

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado[0]).toMatchObject({
      acao: "nao_comandada",
      motivo: "cobranca_ja_liquidada",
      // A data calculada vai junto: o relatório do job mostra o que TERIA sido
      // comandado, e é por ela que se enxerga a janela que não foi usada.
      dueDate: "2026-08-12",
      tentativa: null,
    });
    expect(chamadasDeRetentativaFake).toEqual([]);

    const ciclo = await lerCiclo(cicloId);
    // A guarda sai ANTES do compare-and-set: nenhuma das 3 é gasta.
    expect(ciclo.retentativas_comandadas).toBe(0);
    // ...e o estado se cura pelo mesmo caminho do webhook.
    expect(ciclo.status).toBe("pago");
    const assinatura = await lerAssinatura(SUB_A);
    expect(assinatura.status).toBe("active");
    expect(assinatura.past_due_desde).toBeNull();
  });

  // ── 5. Fora da janela de 7 dias ───────────────────────────────────────────

  it("não chama o gateway quando nenhuma data cabe na janela (fail-closed)", async () => {
    await criarAssinatura({ clinicId: CLINICA_E, subscriptionId: SUB_E });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_E,
      subscriptionId: SUB_E,
      recusaCodigo: "PAYMENT_OVERDUE",
      retentativasComandadas: 1,
      ultimaRetentativaVencimento: "2026-08-17",
    });

    // Vencimento 10/08 + 7 = 17/08, o último dia comandável. A passada de 16/08
    // tem 17/08 como candidata mínima, mas 17/08 JÁ foi comandada — o passo que
    // evita repetir data empurra para 18/08, que estoura a janela. Comandar
    // assim levaria 400 com a tentativa reservada.
    //
    // O pré-filtro do `WHERE` é grosso de propósito: ele deixa esta linha
    // passar (vencimento 10/08 ≥ 16/08 − 6), e quem diz "não há data" continua
    // sendo a função pura.
    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-16"),
    });

    expect(resultado[0]).toMatchObject({
      acao: "nao_comandada",
      motivo: "sem_data_possivel",
      dueDate: null,
    });
    expect(chamadasDeRetentativaFake).toEqual([]);
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(1);
  });

  // ── 6. Carência vencendo na mesma passada ─────────────────────────────────

  it("não gasta tentativa em quem o corte por carência leva nesta mesma passada", async () => {
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      // 10 dias de carência a partir de 05/08 ⇒ vencida em 15/08.
      pastDueDesde: new Date("2026-08-05T12:00:00.000Z"),
    });
    await criarCicloRecusado({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-16"),
    });

    expect(resultado[0]).toMatchObject({
      acao: "nao_comandada",
      motivo: "carencia_vence_nesta_passada",
    });
    expect(chamadasDeRetentativaFake).toEqual([]);
  });

  /**
   * A borda EXATA do predicado da carência.
   *
   * O caso acima roda com `agora` um dia além do vencimento da carência, e ali
   * `<` e `<=` dão o mesmo resultado — o limite inclusivo do predicado copiado
   * de `cancelarAssinaturasComCarenciaVencida` fica sem oráculo. O par abaixo
   * usa o INSTANTE do corte (05/08 12:00Z + 10 dias = 15/08 12:00Z) e o
   * segundo antes dele.
   *
   * ⚠️ Um segundo ANTES do corte o desfecho não é `comandada`, e não pode ser:
   * a candidata mínima é `hoje + 1` e o teto C exige `dueDate` estritamente
   * anterior ao DIA do corte — com o corte hoje, nenhuma data satisfaz as duas
   * coisas. O que o segundo caso prova é que o predicado da carência devolveu
   * FALSO (a linha andou até o cálculo da data), e não que a passada comandou.
   */
  it("carência que vence NO INSTANTE da passada já é `carencia_vence_nesta_passada`", async () => {
    await criarAssinatura({
      clinicId: CLINICA_D,
      subscriptionId: SUB_D,
      pastDueDesde: new Date("2026-08-05T12:00:00.000Z"),
    });
    await criarCicloRecusado({
      clinicId: CLINICA_D,
      subscriptionId: SUB_D,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    const resultado = await comandarRetentativasPendentes({
      agora: new Date("2026-08-15T12:00:00.000Z"),
    });

    expect(resultado[0]).toMatchObject({
      acao: "nao_comandada",
      motivo: "carencia_vence_nesta_passada",
    });
    expect(chamadasDeRetentativaFake).toEqual([]);
  });

  it("um segundo ANTES do corte a carência ainda não venceu — o motivo passa a ser a data", async () => {
    await criarAssinatura({
      clinicId: CLINICA_E,
      subscriptionId: SUB_E,
      pastDueDesde: new Date("2026-08-05T12:00:00.000Z"),
    });
    await criarCicloRecusado({
      clinicId: CLINICA_E,
      subscriptionId: SUB_E,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    const resultado = await comandarRetentativasPendentes({
      agora: new Date("2026-08-15T11:59:59.000Z"),
    });

    // Motivo DIFERENTE do caso acima: a linha passou pelo predicado da carência
    // e parou no teto C, que barra `dueDate` no próprio dia do corte.
    expect(resultado[0]).toMatchObject({
      acao: "nao_comandada",
      motivo: "sem_data_possivel",
      dueDate: null,
    });
    expect(chamadasDeRetentativaFake).toEqual([]);
  });

  // ── 7. Recusa do gateway ao COMANDO ───────────────────────────────────────

  it("recusa do gateway ao comando vira motivo nomeado, com a tentativa já gasta", async () => {
    await criarAssinatura({ clinicId: CLINICA_B, subscriptionId: SUB_B });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      recusaCodigo: "PAYMENT_OVERDUE",
    });
    enfileirarRetentativasFake({
      ok: false,
      motivo: "autorizacao_sem_politica",
      mensagemGateway:
        "A autorização desta cobrança não permite retentativas extradia (Política N).",
    });

    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
    });

    expect(resultado[0]).toMatchObject({
      acao: "recusada_pelo_gateway",
      motivo: "autorizacao_sem_politica",
      tentativa: 1,
      dueDate: "2026-08-12",
    });
    expect(resultado[0]!.erro).toContain("Política N");
    // A reserva veio ANTES da chamada (D-4) e fica gasta: insistir na mesma
    // passada repetiria a mesma recusa.
    expect((await lerCiclo(cicloId)).retentativas_comandadas).toBe(1);
  });

  // ── 8. Dry-run não escreve nada ───────────────────────────────────────────

  it("dry-run avalia, devolve a data, e não escreve nem chama o gateway", async () => {
    await criarAssinatura({ clinicId: CLINICA_C, subscriptionId: SUB_C });
    const { cicloId } = await criarCicloRecusado({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    const antes = await lerCiclo(cicloId);
    const resultado = await comandarRetentativasPendentes({
      agora: meioDiaSp("2026-08-11"),
      dryRun: true,
    });

    expect(resultado[0]).toMatchObject({
      acao: "nao_comandada",
      // Motivo NOMEADO: `null` punha "teria sido comandada" no mesmo balde de
      // "pulada por falha muda", e o relatório do ensaio não distinguia as duas.
      motivo: "dry_run",
      dueDate: "2026-08-12",
      tentativa: null,
    });
    expect(chamadasDeRetentativaFake).toEqual([]);
    // Contador ANTES e DEPOIS: o dry-run não pode reservar, senão o ensaio
    // consome tentativa de verdade.
    expect(await lerCiclo(cicloId)).toEqual(antes);
    expect(antes.retentativas_comandadas).toBe(0);
  });

  // ── 9. F5 — conciliação sob retentativa ───────────────────────────────────

  it("recusa de RETENTATIVA com causa DIFERENTE reescreve — o guard não engole fato novo", async () => {
    await criarAssinatura({ clinicId: CLINICA_D, subscriptionId: SUB_D });
    const { cicloId, providerChargeId } = await criarCicloRecusado({
      clinicId: CLINICA_D,
      subscriptionId: SUB_D,
      recusaCodigo: "PAYMENT_OVERDUE",
      erro: "diagnóstico da recusa original",
    });

    // Entre a recusa original (G2, sem saldo) e a retentativa, a clínica
    // revogou a autorização no app do banco: a retentativa volta G3. Este caso
    // AFIRMAVA que preservar `PAYMENT_OVERDUE` era o certo — e era o defeito:
    // `recusa_codigo` ficava mentindo e o backstop de prazo, que decide lendo
    // exatamente essa coluna, nunca veria a autorização morta.
    const aplicou = await conciliarPagamentoDeCiclo(
      providerChargeId!,
      "recusada",
      "PAYMENT_INSTRUCTION_WITHOUT_AUTHORIZATION",
      { proposito: "RETRY_AFTER_DUE_DATE", tentativa: 2 },
    );

    expect(aplicou).toBe(true);
    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.recusa_codigo).toBe(
      "PAYMENT_INSTRUCTION_WITHOUT_AUTHORIZATION",
    );
    expect(ciclo.erro).toContain("[G3]");
    // G3 não carimba `past_due` (o desfecho dele é corte, não carência), então
    // a assinatura fica como estava — mas pelo motivo certo, e não por o fato
    // ter sido descartado.
    expect((await lerAssinatura(SUB_D)).status).toBe("past_due");
  });

  it("a MESMA recusa como instrução original (SCHEDULE) reescreve — é o que prova o guard", async () => {
    await criarAssinatura({ clinicId: CLINICA_E, subscriptionId: SUB_E });
    const { cicloId, providerChargeId } = await criarCicloRecusado({
      clinicId: CLINICA_E,
      subscriptionId: SUB_E,
      recusaCodigo: "PAYMENT_OVERDUE",
      erro: "diagnóstico da recusa original",
    });

    await conciliarPagamentoDeCiclo(
      providerChargeId!,
      "recusada",
      "MAXIMUM_AMOUNT_EXCEEDED",
      { proposito: "SCHEDULE", tentativa: null },
    );

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.recusa_codigo).toBe("MAXIMUM_AMOUNT_EXCEEDED");
    expect(ciclo.erro).not.toBe("diagnóstico da recusa original");
  });

  /**
   * O guard da D-5 exige TRÊS coisas ao mesmo tempo: propósito de retentativa,
   * ciclo já `falhou` e MESMO grupo. Os casos acima cobrem o grupo; o par
   * abaixo cobre o `ciclo.status === "falhou"`, que nada exercitava.
   *
   * Um ciclo que não está `falhou` significa que a recusa ORIGINAL não foi
   * registrada (webhook perdido, ou reconsulta que discordou) — e aí a recusa
   * da retentativa é o único diagnóstico que existe. Engoli-la deixaria o ciclo
   * parado em `aguardando_pagamento` para sempre: não há varredura nenhuma que
   * olhe para ciclos nesse estado.
   */
  it("recusa de retentativa do MESMO grupo sobre ciclo `aguardando_pagamento` REGISTRA o estado", async () => {
    // Mesmo grupo (G2 dos dois lados) de propósito: com grupos diferentes o
    // guard já sairia pela comparação de grupo, e o caso não diria nada sobre
    // a condição de status. Aqui a única coisa que impede o guard de engolir a
    // recusa é o ciclo não estar `falhou`.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      status: "active",
      pastDueDesde: null,
    });
    const { cicloId, providerChargeId } = await criarCicloRecusado({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      status: "aguardando_pagamento",
      recusaCodigo: "PAYMENT_OVERDUE",
      erro: "recusa original",
    });

    const aplicou = await conciliarPagamentoDeCiclo(
      providerChargeId!,
      "recusada",
      "PAYMENT_OVERDUE",
      { proposito: "RETRY_AFTER_DUE_DATE", tentativa: 2 },
    );

    expect(aplicou).toBe(true);
    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.recusa_codigo).toBe("PAYMENT_OVERDUE");
    expect(ciclo.erro).not.toBe("recusa original");
    expect(ciclo.erro).toContain("[G2]");
    // A carência começa a correr AGORA: sem este carimbo o ciclo ficaria
    // devendo sem relógio nenhum, e a assinatura nunca seria cortada.
    const assinatura = await lerAssinatura(SUB_A);
    expect(assinatura.status).toBe("past_due");
    expect(assinatura.past_due_desde).not.toBeNull();
  });

  it("recusa de retentativa com causa NOVA sobre ciclo `aguardando_pagamento` também registra", async () => {
    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      status: "active",
      pastDueDesde: null,
    });
    const { cicloId, providerChargeId } = await criarCicloRecusado({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      status: "aguardando_pagamento",
      recusaCodigo: "PAYMENT_OVERDUE",
      erro: "recusa original",
    });

    await conciliarPagamentoDeCiclo(
      providerChargeId!,
      "recusada",
      "MAXIMUM_AMOUNT_EXCEEDED",
      { proposito: "RETRY_AFTER_DUE_DATE", tentativa: 1 },
    );

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.recusa_codigo).toBe("MAXIMUM_AMOUNT_EXCEEDED");
    expect(ciclo.erro).not.toBe("recusa original");
    // G1 carimba `past_due` como G2: o teto baixo também precisa do relógio da
    // carência, que é o prazo para a clínica subir o limite no app do banco.
    const assinatura = await lerAssinatura(SUB_B);
    expect(assinatura.status).toBe("past_due");
    expect(assinatura.past_due_desde).not.toBeNull();
  });

  it("pagamento de retentativa liquida o ciclo e tira a assinatura de past_due", async () => {
    await criarAssinatura({ clinicId: CLINICA_A, subscriptionId: SUB_A });
    const { cicloId, providerChargeId } = await criarCicloRecusado({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      recusaCodigo: "PAYMENT_OVERDUE",
      retentativasComandadas: 2,
    });

    const aplicou = await conciliarPagamentoDeCiclo(
      providerChargeId!,
      "paga",
      null,
      { proposito: "RETRY_AFTER_DUE_DATE", tentativa: 3 },
    );

    expect(aplicou).toBe(true);
    expect((await lerCiclo(cicloId)).status).toBe("pago");
    const assinatura = await lerAssinatura(SUB_A);
    expect(assinatura.status).toBe("active");
    expect(assinatura.past_due_desde).toBeNull();
  });
});
