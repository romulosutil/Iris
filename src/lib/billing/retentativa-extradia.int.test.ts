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
      ${providerChargeId}, ${new Date("2026-08-05T00:00:00.000Z")}, ${VENCIMENTO},
      ${opcoes.recusaCodigo}, ${opcoes.erro ?? "recusa original"},
      ${opcoes.retentativasComandadas ?? 0},
      ${opcoes.ultimaRetentativaVencimento ?? null}
    )
    RETURNING id`) as unknown as { id: string }[];

  return { cicloId: linhas[0]!.id, providerChargeId };
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
