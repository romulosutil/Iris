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
  BASE_URL_FAKE,
  ID_PROVEDOR_FAKE,
  ProvedorFake,
} from "@tests/provedor-fake";

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor puxam
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

/**
 * O gateway destes casos é o provedor FAKE, pelas mesmas razões da #319: o
 * backstop resolve o adapter POR LINHA (`getProviderPorId`), e o fake fala HTTP
 * de verdade — então "o gateway foi consultado", "o gateway foi chamado para
 * REVOGAR" e "o gateway não foi tocado" viram observação. É o oráculo dos casos
 * de fail-closed do G3, invisíveis no valor de retorno.
 */
vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE ? new ProvedorFake() : real.getProviderPorId(id),
  };
});

const { aplicarBackstopDePrazo } = await import("./subscription");

/**
 * #318 (Decisão 2) — o backstop de D+7: **recusa operacional compra tempo, não
 * imunidade**.
 *
 * A entrega anterior fez a classificação governar o desfecho, e três grupos
 * deixaram de carimbar `past_due` no ato: G7 (falha do banco), G0 (código
 * desconhecido — e `null`, que é o estado de PRODUÇÃO enquanto o D35 não for
 * medido lá) e G3 (autorização morta, que exige confirmação antes de qualquer
 * ato irreversível). Sem esta varredura, uma recusa desses grupos não produz
 * consequência nenhuma: assinatura gratuita vitalícia, sem erro em lugar
 * nenhum.
 *
 * ## O oráculo é sempre a COLUNA relida
 *
 * O retorno diz `acao: "carimbada"` a partir de um `.returning()` que pode ter
 * sido um no-op em outra ordem de escrita. Todos os casos releem `subscription`
 * e `billing_cycle` pela conexão dona.
 *
 * ## A régua da Decisão 2: D+6 não carimba, D+7 carimba
 *
 * O número **não é escolha**: em D+7 do vencimento o
 * `POST /pix/automatic/paymentInstructions/{id}/retries` passa a devolver 400
 * pelo limite `7D`. Os dois casos vizinhos abaixo são o que impede alguém de
 * "afinar" o prazo sem descolá-lo do limite do gateway. As datas são escritas à
 * mão de propósito: importar `DIAS_ATE_BACKSTOP` faria o teste concordar com
 * qualquer valor que a constante tivesse.
 *
 * ## Não medido
 *
 * Nenhuma recusa real do Pix Automático é observável fora de produção — o
 * sandbox do Asaas não ativa autorização nenhuma (#321). O que estes casos
 * medem é o COMPORTAMENTO da varredura dado um código persistido; que o código
 * chegue, e com qual literal, só o ensaio em produção responde.
 */

const CLINICA_A = "00000000-0000-0000-0000-000000318a01";
const CLINICA_B = "00000000-0000-0000-0000-000000318a02";
const CLINICA_C = "00000000-0000-0000-0000-000000318a03";
const CLINICA_D = "00000000-0000-0000-0000-000000318a04";

const SUB_A = "00000000-0000-0000-0000-000000318b01";
const SUB_B = "00000000-0000-0000-0000-000000318b02";
const SUB_C = "00000000-0000-0000-0000-000000318b03";
const SUB_D = "00000000-0000-0000-0000-000000318b04";

const VINCULO_A = "vinculo-fake-318-aaaa";
const VINCULO_B = "vinculo-fake-318-bbbb";
const VINCULO_C = "vinculo-fake-318-cccc";
const VINCULO_D = "vinculo-fake-318-dddd";

/**
 * Teto de linhas por passada, escrito À MÃO — não importado de
 * `subscription.ts`. Mesma razão do teto da #319: importar a constante faria o
 * caso concordar com qualquer valor, inclusive com um que não cabe nos 30s do
 * cliente do job.
 */
const TETO_ESPERADO = 20;

/** Uma clínica a MAIS que o teto: é o excedente que prova o truncamento. */
const CLINICAS_TETO = Array.from(
  { length: TETO_ESPERADO + 1 },
  (_, i) => `00000000-0000-0000-0000-0003180000${String(i).padStart(2, "0")}`,
);
const SUBS_TETO = Array.from(
  { length: TETO_ESPERADO + 1 },
  (_, i) => `00000000-0000-0000-0000-0003180001${String(i).padStart(2, "0")}`,
);

const CLINICAS = [CLINICA_A, CLINICA_B, CLINICA_C, CLINICA_D, ...CLINICAS_TETO];

/** Instante de referência de todos os casos com data chumbada. */
const AGORA = new Date("2026-08-15T12:00:00.000Z");

/**
 * Vencimento cuja soma com 7 dias dá EXATAMENTE `AGORA`. A comparação é `<=`,
 * então este é o primeiro instante em que o backstop morde.
 */
const VENCIMENTO_D7 = new Date("2026-08-08T12:00:00.000Z");

/** Um segundo do lado de DENTRO do prazo: a soma cai depois de `AGORA`. */
const VENCIMENTO_D7_MENOS_1S = new Date("2026-08-08T12:00:01.000Z");

/** D+6 cheio: um dia inteiro dentro do prazo. */
const VENCIMENTO_D6 = new Date("2026-08-09T12:00:00.000Z");

/** Bem vencido — para os casos em que a borda não é o assunto. */
const VENCIMENTO_ANTIGO = new Date("2026-07-01T12:00:00.000Z");

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

// ── Dublê do gateway ─────────────────────────────────────────────────────────

let chamadasGateway: { url: string; metodo: string }[] = [];

/** Revogações de autorização efetivamente pedidas ao gateway. */
function revogacoesPedidas(): string[] {
  return chamadasGateway
    .filter((c) => c.url.endsWith("/cancelamento"))
    .map((c) => c.url);
}

/** Reconsultas da autorização (o `GET` que confirma, ou não, a morte do G3). */
function consultasPedidas(): string[] {
  return chamadasGateway
    .filter((c) => c.metodo === "GET" && !c.url.endsWith("/cancelamento"))
    .map((c) => c.url);
}

/**
 * `estadoDaAutorizacao` é o eixo do fail-closed: `CANCELADO` é a única resposta
 * que autoriza a revogação. `AUTORIZADO` significa que o código de recusa
 * mentiu, e `falhaNaConsulta` é o caso em que não se leu nada.
 */
function instalarGateway(
  opcoes: {
    estadoDaAutorizacao?: "CANCELADO" | "AUTORIZADO" | "PAUSADO";
    falhaNaConsulta?: boolean;
  } = {},
): void {
  vi.stubGlobal("fetch", async (entrada: unknown, init?: RequestInit) => {
    const url = String(entrada);
    chamadasGateway.push({
      url,
      metodo: (init?.method ?? "GET").toUpperCase(),
    });

    if (url.endsWith("/cancelamento")) {
      return Response.json({ estado: "CANCELADO" });
    }
    if (url.includes("/vinculos/")) {
      if (opcoes.falhaNaConsulta) {
        // 500 = indisponibilidade do gateway. `pedir` do fake traduz não-2xx em
        // `BillingProviderError`, exatamente como o adapter real.
        return new Response("indisponivel", { status: 500 });
      }
      return Response.json({
        estado: opcoes.estadoDaAutorizacao ?? "CANCELADO",
      });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function criarAssinatura(opcoes: {
  clinicId: string;
  subscriptionId: string;
  vinculoId: string;
  status?: "active" | "past_due" | "canceled";
  pastDueDesde?: Date | null;
}): Promise<void> {
  await owner!`
    INSERT INTO clinic (id, nome)
    VALUES (${opcoes.clinicId}, ${`Clínica #318 ${opcoes.clinicId.slice(-4)}`})`;

  await owner!`
    INSERT INTO subscription
      (id, clinic_id, status, provider, provider_subscription_id,
       provider_customer_id, ciclo_dias, carencia_dias, past_due_desde)
    VALUES (
      ${opcoes.subscriptionId}, ${opcoes.clinicId},
      ${opcoes.status ?? "active"}::subscription_status,
      ${ID_PROVEDOR_FAKE}, ${opcoes.vinculoId}, ${"cli-fake-318"},
      30, 10, ${opcoes.pastDueDesde ?? null}
    )`;
}

async function criarCiclo(opcoes: {
  clinicId: string;
  subscriptionId: string;
  inicio: Date;
  fim: Date;
  status: "aberto" | "apurado" | "falhou" | "aguardando_pagamento" | "pago";
  vencimentoCobranca?: Date | null;
  recusaCodigo?: string | null;
  erro?: string | null;
  valorCentavos?: number;
}): Promise<string> {
  const linhas = (await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
       provider_charge_id, cobranca_emitida_em, vencimento_cobranca,
       recusa_codigo, erro)
    VALUES (
      ${opcoes.clinicId}, ${opcoes.subscriptionId},
      ${opcoes.inicio}, ${opcoes.fim},
      ${opcoes.status}::billing_cycle_status, ${opcoes.valorCentavos ?? 3900},
      ${`pay_318_${opcoes.inicio.toISOString()}_${opcoes.clinicId.slice(-4)}`},
      ${opcoes.inicio},
      ${opcoes.vencimentoCobranca ?? null},
      ${opcoes.recusaCodigo ?? null},
      ${opcoes.erro ?? null}
    )
    RETURNING id`) as unknown as { id: string }[];
  return linhas[0]!.id;
}

/** Ciclo já cobrado e vencido há muito, no formato mais comum destes casos. */
async function criarCicloVencido(opcoes: {
  clinicId: string;
  subscriptionId: string;
  vencimentoCobranca: Date;
  status?: "aguardando_pagamento" | "falhou" | "pago" | "aberto" | "apurado";
  recusaCodigo?: string | null;
  erro?: string | null;
}): Promise<string> {
  return criarCiclo({
    clinicId: opcoes.clinicId,
    subscriptionId: opcoes.subscriptionId,
    inicio: new Date("2026-06-01T00:00:00.000Z"),
    fim: new Date("2026-07-01T00:00:00.000Z"),
    status: opcoes.status ?? "aguardando_pagamento",
    vencimentoCobranca: opcoes.vencimentoCobranca,
    recusaCodigo: opcoes.recusaCodigo,
    erro: opcoes.erro,
  });
}

interface LinhaAssinatura {
  status: string;
  cancelada_em: Date | null;
  past_due_desde: Date | null;
}

async function lerAssinatura(id: string): Promise<LinhaAssinatura> {
  const linhas = (await owner!`
    SELECT status::text AS status, cancelada_em, past_due_desde
      FROM subscription WHERE id = ${id}`) as unknown as LinhaAssinatura[];
  return linhas[0]!;
}

interface LinhaCiclo {
  id: string;
  status: string;
  erro: string | null;
  recusa_codigo: string | null;
  vencimento_cobranca: Date | null;
}

async function lerCiclo(id: string): Promise<LinhaCiclo> {
  const linhas = (await owner!`
    SELECT id, status::text AS status, erro, recusa_codigo, vencimento_cobranca
      FROM billing_cycle WHERE id = ${id}`) as unknown as LinhaCiclo[];
  return linhas[0]!;
}

/** ISO do instante gravado, para comparar com literal escrito à mão. */
function iso(d: Date | null): string | null {
  return d === null ? null : new Date(d).toISOString();
}

async function limpar(): Promise<void> {
  await owner!`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
  // Fichas saem por DELETE ESCOPADO e NÃO entram no TRUNCATE: pôr `patient` lá
  // alarga a superfície de lock o bastante para colidir com o `TRUNCATE clinic`
  // de outros arquivos de integração (medido como deadlock na #319).
  await owner!`DELETE FROM patient WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM clinic WHERE id = ANY(${CLINICAS}::uuid[])`;
}

describe.skipIf(!hasDb)("#318 · backstop de D+7", () => {
  beforeEach(async () => {
    chamadasGateway = [];
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

  // ── 1. A régua da Decisão 2: D+6 × D+7 ─────────────────────────────────────

  it("D+6 NÃO carimba e D+7 carimba, medido na coluna", async () => {
    // As três com o MESMO motivo (`null` = G0, o estado de produção). O que
    // separa os desfechos é só a data — que é exatamente o ponto da Decisão 2.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    const cicloD7 = await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_D7,
    });

    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
    });
    const cicloD6 = await criarCicloVencido({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vencimentoCobranca: VENCIMENTO_D6,
    });

    await criarAssinatura({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      vinculoId: VINCULO_C,
    });
    const cicloQuase = await criarCicloVencido({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      vencimentoCobranca: VENCIMENTO_D7_MENOS_1S,
    });

    await aplicarBackstopDePrazo({ agora: AGORA });

    // D+7 exato: carimbada. A borda é INCLUSIVA (`<=`).
    const a = await lerAssinatura(SUB_A);
    expect(a.status).toBe("past_due");
    expect((await lerCiclo(cicloD7)).status).toBe("falhou");

    // D+6: intocada. Se este caso ficar vermelho, o prazo encurtou.
    const b = await lerAssinatura(SUB_B);
    expect(b.status).toBe("active");
    expect(b.past_due_desde).toBeNull();
    expect((await lerCiclo(cicloD6)).status).toBe("aguardando_pagamento");

    // Um segundo antes de completar D+7: ainda intocada.
    const c = await lerAssinatura(SUB_C);
    expect(c.status).toBe("active");
    expect((await lerCiclo(cicloQuase)).status).toBe("aguardando_pagamento");
  });

  it("`past_due_desde` recebe o instante do CARIMBO, não o vencimento", async () => {
    // Decisão 2, e é intencional: o relógio da carência começa quando
    // concluímos que a clínica deve, então ela fica com 7 + 10 = 17 dias. Um
    // carimbo com a data do vencimento (ou da recusa) entregaria a assinatura
    // já com 7 dos 10 dias de carência consumidos.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
    });

    await aplicarBackstopDePrazo({ agora: AGORA });

    const linha = await lerAssinatura(SUB_A);
    expect(iso(linha.past_due_desde)).toBe("2026-08-15T12:00:00.000Z");
    expect(iso(linha.past_due_desde)).not.toBe(iso(VENCIMENTO_ANTIGO));
  });

  it("leva o ciclo a `falhou` — sem isso a dívida nunca congela", async () => {
    // `congelarCiclosComoDebito` congela `aberto`/`apurado`/`falhou`, e
    // `aguardando_pagamento` NÃO está na lista. Um ciclo carimbado e deixado em
    // `aguardando_pagamento` produziria past_due, corte por carência 10 dias
    // depois e `levantarDebito` = 0 — o gate de reativação da #290 abriria e a
    // clínica cortada voltaria de graça.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    const cicloId = await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
    });

    await aplicarBackstopDePrazo({ agora: AGORA });

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.erro).toContain("7 dias após o vencimento");
    // O backstop é decisão NOSSA; `recusa_codigo` é fato do gateway e continua
    // como estava (aqui, ausente).
    expect(ciclo.recusa_codigo).toBeNull();
  });

  it("preserva o diagnóstico que o ciclo já tinha (`coalesce`, não sobrescrita)", async () => {
    // Um ciclo G3 já foi a `falhou` com o motivo REAL da recusa. Trocá-lo pelo
    // texto do backstop apagaria a causa em favor da consequência.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    const cicloId = await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      recusaCodigo: "PAYMENT_OVERDUE",
      erro: "recusada: sem saldo ou limite na conta no momento do débito [G2]",
    });

    await aplicarBackstopDePrazo({ agora: AGORA });

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.erro).toBe(
      "recusada: sem saldo ou limite na conta no momento do débito [G2]",
    );
    expect(ciclo.recusa_codigo).toBe("PAYMENT_OVERDUE");
  });

  // ── 2. G6: defeito nosso é custo nosso ─────────────────────────────────────

  it("G6 NÃO tem backstop: ciclo e assinatura ficam intocados", async () => {
    // Os códigos de G6 dizem que a INSTRUÇÃO estava errada — e o vencimento a
    // partir do qual o backstop conta é justamente o que NÓS calculamos.
    // Carimbar aqui seria cobrar a clínica pelo nosso bug.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    const cicloId = await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      // Vencido há 45 dias: se o guard cair, o carimbo é imediato.
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      recusaCodigo: "DUE_DATE_MISMATCH",
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    const linha = await lerAssinatura(SUB_A);
    expect(linha.status).toBe("active");
    expect(linha.past_due_desde).toBeNull();
    expect((await lerCiclo(cicloId)).status).toBe("falhou");
    expect(revogacoesPedidas()).toEqual([]);

    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.grupo).toBe("G6");
    expect(resultados[0]!.acao).toBe("ignorada_g6");
  });

  it("o vizinho de G6 no MESMO prazo é carimbado", async () => {
    // O contraste é o que impede o caso acima de passar por um backstop que
    // simplesmente não roda. Duas clínicas, mesmo vencimento, códigos de grupos
    // diferentes: uma sai carimbada, a outra não.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      recusaCodigo: "AMOUNT_MISMATCH",
    });

    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
    });
    await criarCicloVencido({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      // G7 — falha do banco pagador. Compra tempo, não imunidade.
      recusaCodigo: "EXTERNAL_INSTITUTION_ERROR",
    });

    await aplicarBackstopDePrazo({ agora: AGORA });

    expect((await lerAssinatura(SUB_A)).status).toBe("active");
    expect((await lerAssinatura(SUB_B)).status).toBe("past_due");
  });

  // ── 3. G3: o fail-closed do corte ──────────────────────────────────────────

  it("G3 com autorização morta CONFIRMADA pelo gateway: corta e congela", async () => {
    instalarGateway({ estadoDaAutorizacao: "CANCELADO" });
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    const cicloId = await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      recusaCodigo: "INVALID_RECURRING_PAYMENT_ID",
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    // A reconsulta acontece ANTES da revogação — é ela que autoriza o ato
    // irreversível.
    expect(consultasPedidas()).toEqual([
      `${BASE_URL_FAKE}/vinculos/${VINCULO_A}`,
    ]);
    expect(revogacoesPedidas()).toEqual([
      `${BASE_URL_FAKE}/vinculos/${VINCULO_A}/cancelamento`,
    ]);

    const linha = await lerAssinatura(SUB_A);
    expect(linha.status).toBe("canceled");
    expect(iso(linha.cancelada_em)).toBe("2026-08-15T12:00:00.000Z");
    expect(linha.past_due_desde).toBeNull();
    // O ciclo vira DÍVIDA — é o que mantém o gate da #290 fechado.
    expect((await lerCiclo(cicloId)).status).toBe("devido");

    expect(resultados[0]!.acao).toBe("cortada");
    expect(resultados[0]!.erro).toBeUndefined();
  });

  it("G3 com autorização VIVA: não corta, carimba — o código mentiu", async () => {
    // Revogar por um código espúrio mataria uma autorização de Pix Automático
    // ativa, que não volta sem novo consentimento no app do banco.
    instalarGateway({ estadoDaAutorizacao: "AUTORIZADO" });
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    const cicloId = await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      recusaCodigo: "RECURRING_PAYMENT_NOT_CONFIRMED",
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    expect(consultasPedidas()).toHaveLength(1);
    // O oráculo do fail-closed: nenhuma revogação foi pedida.
    expect(revogacoesPedidas()).toEqual([]);

    const linha = await lerAssinatura(SUB_A);
    expect(linha.status).toBe("past_due");
    expect(linha.cancelada_em).toBeNull();
    expect(iso(linha.past_due_desde)).toBe("2026-08-15T12:00:00.000Z");
    expect((await lerCiclo(cicloId)).status).toBe("falhou");

    expect(resultados[0]!.acao).toBe("carimbada");
    expect(resultados[0]!.erro).toContain("autorizada");
  });

  it("G3 com estado que não é nem morto nem vivo: não corta", async () => {
    // `mapearStatusAutorizacao` manda todo status DESCONHECIDO para `pendente`.
    // Um estado novo do gateway nunca pode virar permissão para revogar.
    instalarGateway({ estadoDaAutorizacao: "PAUSADO" });
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      recusaCodigo: "PAYMENT_INSTRUCTION_WITHOUT_AUTHORIZATION",
    });

    await aplicarBackstopDePrazo({ agora: AGORA });

    expect(revogacoesPedidas()).toEqual([]);
    expect((await lerAssinatura(SUB_A)).status).toBe("past_due");
  });

  it("G3 com o gateway fora do ar: corte BARRADO, carimbo acontece", async () => {
    // Rede, timeout e 5xx barram o ato irreversível — não se age sobre o que
    // não se leu. O carimbo, que é reversível por pagamento, segue: o ciclo
    // está vencido há 45 dias qualquer que seja a resposta do gateway. Toda
    // degradação leva ao mesmo lugar seguro — corte 10 dias depois, pela
    // carência, em vez de corte agora sem prova.
    instalarGateway({ falhaNaConsulta: true });
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      recusaCodigo: "INVALID_RECURRING_PAYMENT_ID",
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    expect(revogacoesPedidas()).toEqual([]);

    const linha = await lerAssinatura(SUB_A);
    expect(linha.status).toBe("past_due");
    expect(linha.cancelada_em).toBeNull();

    expect(resultados[0]!.acao).toBe("carimbada");
    // A falha do corte sobe no resultado mesmo com a ação degradada tendo
    // acontecido: o job publica isto, e "carimbada sem erro" esconderia que o
    // gateway está fora do ar.
    expect(resultados[0]!.erro).toContain("corte barrado");
  });

  // ── 4. O conjunto elegível ─────────────────────────────────────────────────

  it("ciclo sem `vencimento_cobranca` nunca é varrido", async () => {
    // Coluna nula = nunca houve cobrança emitida (ou a linha é anterior à
    // 0100). Sem vencimento não há D+7 nenhum para medir, e inventar um a
    // partir de outro carimbo é o que a coluna existe para evitar.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: null as unknown as Date,
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    expect(resultados).toEqual([]);
    expect((await lerAssinatura(SUB_A)).status).toBe("active");
  });

  it("ciclo `pago`, `aberto` ou `apurado` não entra; só o que foi cobrado e não liquidado", async () => {
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "pago",
    });

    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
    });
    await criarCicloVencido({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "apurado",
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    expect(resultados).toEqual([]);
    expect((await lerAssinatura(SUB_A)).status).toBe("active");
    expect((await lerAssinatura(SUB_B)).status).toBe("active");
  });

  it("assinatura já em `past_due` ou `canceled` fica fora", async () => {
    // `past_due` já tem consequência e relógio próprio (a carência da #319);
    // agir de novo aqui só poderia adiantar um corte por um caminho que não é o
    // da carência. E recarimbar zeraria a carência que já estava correndo.
    const carimboAntigo = new Date("2026-08-01T09:00:00.000Z");
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: carimboAntigo,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
    });

    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
      status: "canceled",
    });
    await criarCicloVencido({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    expect(resultados).toEqual([]);
    // O carimbo antigo sobrevive intacto: a carência não foi reiniciada.
    expect(iso((await lerAssinatura(SUB_A)).past_due_desde)).toBe(
      "2026-08-01T09:00:00.000Z",
    );
    expect((await lerAssinatura(SUB_B)).status).toBe("canceled");
  });

  it("a segunda passada não encontra nada — carimbar é idempotente", async () => {
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
    });

    await aplicarBackstopDePrazo({ agora: AGORA });
    const carimboOriginal = iso((await lerAssinatura(SUB_A)).past_due_desde);

    // Um dia depois: a assinatura já saiu do conjunto elegível.
    const segunda = await aplicarBackstopDePrazo({
      agora: new Date("2026-08-16T12:00:00.000Z"),
    });

    expect(segunda).toEqual([]);
    expect(iso((await lerAssinatura(SUB_A)).past_due_desde)).toBe(
      carimboOriginal,
    );
  });

  // ── 5. Dry-run e teto ──────────────────────────────────────────────────────

  it("dry-run não escreve nada e não toca o gateway", async () => {
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
    });
    const cicloId = await criarCicloVencido({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
      status: "falhou",
      // G3: no ensaio, o caminho que MAIS precisa não acontecer.
      recusaCodigo: "INVALID_RECURRING_PAYMENT_ID",
    });

    const resultados = await aplicarBackstopDePrazo({
      agora: AGORA,
      dryRun: true,
    });

    expect(chamadasGateway).toEqual([]);
    expect((await lerAssinatura(SUB_A)).status).toBe("active");
    expect((await lerCiclo(cicloId)).status).toBe("falhou");

    // O ensaio ainda RESPONDE quem seria alcançado.
    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.acao).toBe("nenhuma");
    expect(resultados[0]!.grupo).toBe("G3");
  });

  it("trunca no teto da passada e sinaliza em todos os itens", async () => {
    for (const [i, clinicId] of CLINICAS_TETO.entries()) {
      await criarAssinatura({
        clinicId,
        subscriptionId: SUBS_TETO[i]!,
        vinculoId: `vinculo-fake-318-teto-${i}`,
      });
      await criarCiclo({
        clinicId,
        subscriptionId: SUBS_TETO[i]!,
        // Vencimentos distintos e crescentes: a ordenação é `vencimento` asc, e
        // é ela que torna a passada seguinte capaz de retomar de onde esta
        // parou. Todos bem além de D+7.
        inicio: new Date(Date.UTC(2026, 4, 1 + i)),
        fim: new Date(Date.UTC(2026, 5, 1 + i)),
        status: "aguardando_pagamento",
        vencimentoCobranca: new Date(Date.UTC(2026, 5, 1 + i)),
      });
    }

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    expect(resultados).toHaveLength(TETO_ESPERADO);
    expect(resultados.every((r) => r.truncado === true)).toBe(true);
    // O excedente não se perde: sobra exatamente uma assinatura `active`.
    const restantes = (await owner!`
      SELECT count(*)::int AS total FROM subscription
       WHERE id = ANY(${SUBS_TETO}::uuid[]) AND status = 'active'`) as unknown as {
      total: number;
    }[];
    expect(restantes[0]!.total).toBe(1);
  });

  it("uma clínica sem vínculo no gateway não derruba a varredura das outras", async () => {
    // Isolamento por linha, mesmo idioma da #319 e de `fecharCiclosVencendo`.
    await criarAssinatura({
      clinicId: CLINICA_D,
      subscriptionId: SUB_D,
      vinculoId: VINCULO_D,
    });
    // G3 sem vínculo consultável: o corte não pode ser confirmado.
    await owner!`
      UPDATE subscription SET provider_subscription_id = NULL
       WHERE id = ${SUB_D}`;
    await criarCicloVencido({
      clinicId: CLINICA_D,
      subscriptionId: SUB_D,
      vencimentoCobranca: new Date("2026-06-01T12:00:00.000Z"),
      status: "falhou",
      recusaCodigo: "INVALID_RECURRING_PAYMENT_ID",
    });

    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
    });
    await criarCicloVencido({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vencimentoCobranca: VENCIMENTO_ANTIGO,
    });

    const resultados = await aplicarBackstopDePrazo({ agora: AGORA });

    expect(resultados).toHaveLength(2);
    expect(revogacoesPedidas()).toEqual([]);
    // A vizinha foi carimbada normalmente.
    expect((await lerAssinatura(SUB_B)).status).toBe("past_due");
    // E a sem vínculo caiu no carimbo, não no corte.
    const semVinculo = await lerAssinatura(SUB_D);
    expect(semVinculo.status).toBe("past_due");
    expect(semVinculo.cancelada_em).toBeNull();
  });
});
