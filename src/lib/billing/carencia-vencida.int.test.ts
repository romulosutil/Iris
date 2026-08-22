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
 * O gateway destes casos é o provedor FAKE (`db/tests/provedor-fake.ts`), pelas
 * mesmas duas razões do teste do D26:
 *
 * 1. o corte resolve o adapter POR LINHA (`getProviderPorId`), e usar um fake
 *    registrado só aqui prova que a resolução é pela coluna, não pela env;
 * 2. ele fala HTTP de verdade contra um host próprio, então "o gateway foi
 *    chamado" e "o gateway NÃO foi chamado" viram observação — que é o oráculo
 *    do caso fail-closed e do `dryRun`, invisíveis no valor de retorno.
 */
vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE ? new ProvedorFake() : real.getProviderPorId(id),
  };
});

const {
  aplicarStatusProvider,
  cancelarAssinaturasComCarenciaVencida,
  conciliarPagamentoDeCiclo,
} = await import("./subscription");
const { levantarDebito } = await import("./debito");

/**
 * #319 — `past_due` ganha saída: a carência vencida corta a assinatura.
 *
 * Antes desta varredura `past_due` era TERMINAL na prática. Três comentários da
 * base afirmavam que "a carência leva a `canceled`" e nenhuma linha fazia isso.
 *
 * ## O oráculo é sempre o banco relido
 *
 * O retorno da função diz `cortada: true` mesmo que o UPDATE tenha sido um
 * no-op — foi assim que um no-op silencioso já passou verde nesta base. Todos
 * os casos abaixo releem `subscription` / `billing_cycle` pela conexão dona.
 *
 * ## A BORDA DO LIMITE É INCLUSIVA
 *
 * O predicado é `past_due_desde + carencia_dias <= agora`. Com a soma
 * EXATAMENTE igual a `agora`, a assinatura É cortada — o décimo dia de carência
 * termina no instante em que completa, não no fim daquele dia. O caso
 * "carência exatamente no limite" abaixo fixa isso, e o vizinho de 1 segundo
 * dentro fixa o outro lado.
 *
 * Nunca rodou nesta máquina (Postgres local fora do ar); gated por `hasDb`.
 */

const CLINICA_A = "00000000-0000-0000-0000-000000319a01";
const CLINICA_B = "00000000-0000-0000-0000-000000319a02";
const CLINICA_C = "00000000-0000-0000-0000-000000319a03";

/**
 * Teto de cortes por passada, escrito À MÃO — não importado de `subscription.ts`.
 *
 * É o ponto do caso do teto: se alguém mudar `TETO_CORTES_POR_PASSADA` sem
 * decidir, este número diverge e o caso fica vermelho. Importar a constante
 * faria o teste concordar com qualquer valor, inclusive com um teto que não
 * cabe nos 30s do cliente do job.
 */
const TETO_ESPERADO = 20;

/** Uma clínica a MAIS que o teto: é o excedente que prova o truncamento. */
const CLINICAS_TETO = Array.from(
  { length: TETO_ESPERADO + 1 },
  (_, i) => `00000000-0000-0000-0000-0003190000${String(i).padStart(2, "0")}`,
);
const SUBS_TETO = Array.from(
  { length: TETO_ESPERADO + 1 },
  (_, i) => `00000000-0000-0000-0000-0003190001${String(i).padStart(2, "0")}`,
);

const CLINICAS = [CLINICA_A, CLINICA_B, CLINICA_C, ...CLINICAS_TETO];

const SUB_A = "00000000-0000-0000-0000-000000319b01";
const SUB_B = "00000000-0000-0000-0000-000000319b02";
const SUB_C = "00000000-0000-0000-0000-000000319b03";

const VINCULO_A = "vinculo-fake-319-aaaa";
const VINCULO_B = "vinculo-fake-319-bbbb";
const VINCULO_C = "vinculo-fake-319-cccc";

const CLIENTE_FAKE = "cli-fake-319";

/** Instante de referência de todos os casos com data chumbada. */
const AGORA = new Date("2026-08-15T12:00:00.000Z");

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

// ── Dublê do gateway ─────────────────────────────────────────────────────────

let chamadasGateway: { url: string; metodo: string }[] = [];

/** URLs de cancelamento de vínculo efetivamente pedidas ao gateway. */
function cancelamentosPedidos(): string[] {
  return chamadasGateway
    .filter((c) => c.url.endsWith("/cancelamento"))
    .map((c) => c.url);
}

function instalarGateway(
  opcoes: {
    cancelamentoFalha?: boolean;
    cancelamentoNaoEncontrado?: boolean;
  } = {},
): void {
  vi.stubGlobal("fetch", async (entrada: unknown, init?: RequestInit) => {
    const url = String(entrada);
    chamadasGateway.push({
      url,
      metodo: (init?.method ?? "GET").toUpperCase(),
    });

    if (url.endsWith("/cancelamento")) {
      if (opcoes.cancelamentoFalha) {
        // 500 = indisponibilidade do gateway. `pedir` do fake traduz não-2xx em
        // `BillingProviderError`, exatamente como o adapter real.
        return new Response("indisponivel", { status: 500 });
      }
      if (opcoes.cancelamentoNaoEncontrado) {
        // 404 = o vínculo não existe mais no gateway. Acontece quando a clínica
        // revoga a autorização pelo app do banco antes de nós, ou quando o
        // gateway processou um cancelamento cuja resposta se perdeu no timeout.
        return new Response("nao encontrado", { status: 404 });
      }
      return Response.json({ estado: "CANCELADO" });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function criarAssinatura(opcoes: {
  clinicId: string;
  subscriptionId: string;
  vinculoId: string;
  status: "past_due" | "active";
  pastDueDesde?: Date | null;
  carenciaDias?: number;
}): Promise<void> {
  await owner!`
    INSERT INTO clinic (id, nome)
    VALUES (${opcoes.clinicId}, ${`Clínica #319 ${opcoes.clinicId.slice(-4)}`})`;

  await owner!`
    INSERT INTO subscription
      (id, clinic_id, status, provider, provider_subscription_id,
       provider_customer_id, ciclo_dias, carencia_dias, past_due_desde)
    VALUES (
      ${opcoes.subscriptionId}, ${opcoes.clinicId},
      ${opcoes.status}::subscription_status,
      ${ID_PROVEDOR_FAKE}, ${opcoes.vinculoId}, ${CLIENTE_FAKE},
      30, ${opcoes.carenciaDias ?? 10}, ${opcoes.pastDueDesde ?? null}
    )`;
}

/** Ciclo com datas ABSOLUTAS — para os casos ancorados em `AGORA`. */
async function criarCiclo(opcoes: {
  clinicId: string;
  subscriptionId: string;
  inicio: Date;
  fim: Date;
  status: "aberto" | "apurado" | "falhou" | "aguardando_pagamento";
  valorCentavos: number;
  providerChargeId?: string;
}): Promise<string> {
  const linhas = (await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
       provider_charge_id)
    VALUES (
      ${opcoes.clinicId}, ${opcoes.subscriptionId},
      ${opcoes.inicio}, ${opcoes.fim},
      ${opcoes.status}::billing_cycle_status, ${opcoes.valorCentavos},
      ${opcoes.providerChargeId ?? null}
    )
    RETURNING id`) as unknown as { id: string }[];
  return linhas[0]!.id;
}

interface LinhaAssinatura {
  status: string;
  cancelada_em: Date | null;
  past_due_desde: Date | null;
  carencia_dias: number;
}

async function lerAssinatura(id: string): Promise<LinhaAssinatura> {
  const linhas = (await owner!`
    SELECT status::text AS status, cancelada_em, past_due_desde, carencia_dias
      FROM subscription WHERE id = ${id}`) as unknown as LinhaAssinatura[];
  return linhas[0]!;
}

interface LinhaCiclo {
  id: string;
  status: string;
  valor_centavos: number;
  provider_charge_id: string | null;
}

async function lerCiclos(clinicId: string): Promise<LinhaCiclo[]> {
  return (await owner!`
    SELECT id, status::text AS status, valor_centavos, provider_charge_id
      FROM billing_cycle
     WHERE clinic_id = ${clinicId}
     ORDER BY inicio`) as unknown as LinhaCiclo[];
}

async function lerAuditLog(subscriptionId: string): Promise<
  {
    clinic_id: string;
    ator_id: string | null;
    acao: string;
    entidade: string;
    entidade_id: string;
    patient_id: string | null;
    detalhe: Record<string, unknown> | null;
    criado_em: Date;
  }[]
> {
  const linhas = (await owner!`
    SELECT clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe, criado_em
      FROM audit_log
     WHERE entidade = 'subscription' AND entidade_id = ${subscriptionId}
     ORDER BY criado_em ASC`) as unknown as {
    clinic_id: string;
    ator_id: string | null;
    acao: string;
    entidade: string;
    entidade_id: string;
    patient_id: string | null;
    detalhe: Record<string, unknown> | null;
    criado_em: Date;
  }[];
  return linhas;
}

/** ISO do instante gravado, para comparar com literal escrito à mão. */
function iso(d: Date | null): string | null {
  return d === null ? null : new Date(d).toISOString();
}

async function limpar(): Promise<void> {
  await owner!`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
  // Fichas saem por DELETE ESCOPADO e NÃO entram no TRUNCATE: pôr `patient`
  // lá alarga a superfície de lock o bastante para colidir com o `TRUNCATE
  // clinic` de outros arquivos de integração — medido como `deadlock detected`
  // e violação de FK no gate da #290.
  await owner!`DELETE FROM audit_log WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM patient WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM clinic WHERE id = ANY(${CLINICAS}::uuid[])`;
}

describe.skipIf(!hasDb)("#319 · corte por carência vencida", () => {
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

  // ── 1. A transição ─────────────────────────────────────────────────────────

  it("past_due além da carência vira canceled, medido no banco", async () => {
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      // 45 dias antes de AGORA, com carência de 10.
      pastDueDesde: new Date("2026-07-01T12:00:00.000Z"),
      carenciaDias: 10,
    });

    const resultados = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
    });

    // O gateway foi chamado ANTES da escrita — é o que impede autorização de
    // Pix Automático viva com assinatura morta no Iris.
    expect(cancelamentosPedidos()).toEqual([
      `${BASE_URL_FAKE}/vinculos/${VINCULO_A}/cancelamento`,
    ]);

    // O oráculo: a linha relida, não o retorno.
    const linha = await lerAssinatura(SUB_A);
    expect(linha.status).toBe("canceled");
    expect(iso(linha.cancelada_em)).toBe("2026-08-15T12:00:00.000Z");
    // Zerado — sem isto a próxima inadimplência nasceria com a carência vencida
    // (ver o caso ida-volta-ida abaixo).
    expect(linha.past_due_desde).toBeNull();

    // Retorno como asserção SECUNDÁRIA, depois do banco.
    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.cortada).toBe(true);
    expect(resultados[0]!.erro).toBeUndefined();
    expect(resultados[0]!.carenciaDias).toBe(10);
    expect(iso(resultados[0]!.pastDueDesde)).toBe("2026-07-01T12:00:00.000Z");

    // D34: Emissão atômica de trilha em audit_log com acao 'assinatura_cancelada_por_inadimplencia'
    const logs = await lerAuditLog(SUB_A);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.clinic_id).toBe(CLINICA_A);
    expect(logs[0]!.ator_id).toBeNull();
    expect(logs[0]!.acao).toBe("assinatura_cancelada_por_inadimplencia");
    expect(logs[0]!.entidade).toBe("subscription");
    expect(logs[0]!.entidade_id).toBe(SUB_A);
    expect(logs[0]!.patient_id).toBeNull();
    expect(logs[0]!.detalhe).toMatchObject({
      motivo: "past_due vencido",
      provider: ID_PROVEDOR_FAKE,
      providerSubscriptionId: VINCULO_A,
      pastDueDesde: "2026-07-01T12:00:00.000Z",
      carenciaDias: 10,
    });
    expect(iso(logs[0]!.criado_em)).toBe("2026-08-15T12:00:00.000Z");
  });

  // ── 2. O negativo, com a borda exata ───────────────────────────────────────

  it("dentro da carência não mexe em nada; a borda EXATA do limite corta", async () => {
    // Carência de 10 dias para as três, `agora` = 2026-08-15T12:00:00Z.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      // 2026-08-05T12:00:00Z + 10 dias == agora, EXATAMENTE. `<=` → corta.
      pastDueDesde: new Date("2026-08-05T12:00:00.000Z"),
      carenciaDias: 10,
    });
    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
      status: "past_due",
      // Um segundo do lado de DENTRO: a soma dá 12:00:01, depois de `agora`.
      pastDueDesde: new Date("2026-08-05T12:00:01.000Z"),
      carenciaDias: 10,
    });
    await criarAssinatura({
      clinicId: CLINICA_C,
      subscriptionId: SUB_C,
      vinculoId: VINCULO_C,
      status: "past_due",
      // Cinco dias de carência corridos, longe do limite.
      pastDueDesde: new Date("2026-08-10T12:00:00.000Z"),
      carenciaDias: 10,
    });

    const resultados = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
    });

    // Só a da borda foi ao gateway. Um cancelamento a mais aqui seria uma
    // autorização de Pix revogada sem carência vencida.
    expect(cancelamentosPedidos()).toEqual([
      `${BASE_URL_FAKE}/vinculos/${VINCULO_A}/cancelamento`,
    ]);

    const naBorda = await lerAssinatura(SUB_A);
    expect(naBorda.status).toBe("canceled");
    expect(naBorda.past_due_desde).toBeNull();
    expect(await lerAuditLog(SUB_A)).toHaveLength(1);

    // As duas de dentro: intocadas, inclusive o carimbo — recarimbar zeraria a
    // carência a cada passada e a assinatura nunca venceria.
    const umSegundoDentro = await lerAssinatura(SUB_B);
    expect(umSegundoDentro.status).toBe("past_due");
    expect(umSegundoDentro.cancelada_em).toBeNull();
    expect(iso(umSegundoDentro.past_due_desde)).toBe(
      "2026-08-05T12:00:01.000Z",
    );
    expect(await lerAuditLog(SUB_B)).toEqual([]);

    const bemDentro = await lerAssinatura(SUB_C);
    expect(bemDentro.status).toBe("past_due");
    expect(bemDentro.cancelada_em).toBeNull();
    expect(iso(bemDentro.past_due_desde)).toBe("2026-08-10T12:00:00.000Z");
    expect(await lerAuditLog(SUB_C)).toEqual([]);

    // A varredura sequer as AVALIOU: o filtro é do banco, não peneira em JS.
    expect(resultados.map((r) => r.subscriptionId)).toEqual([SUB_A]);
  });

  // ── 3. A carência sai da LINHA ─────────────────────────────────────────────

  it("lê carencia_dias de cada linha: 10 corta, 30 não, com o MESMO past_due_desde", async () => {
    // 15 dias de inadimplência para as duas. O que decide é só a coluna.
    const quinzeDiasAtras = new Date("2026-07-31T12:00:00.000Z");

    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: quinzeDiasAtras,
      carenciaDias: 10,
    });
    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
      status: "past_due",
      pastDueDesde: quinzeDiasAtras,
      carenciaDias: 30,
    });

    await cancelarAssinaturasComCarenciaVencida({ agora: AGORA });

    // Qualquer número chumbado no código (7, 10, 15, 30) faria as duas caírem
    // do mesmo lado — é exatamente o que este caso proíbe.
    expect(await lerAssinatura(SUB_A).then((l) => l.status)).toBe("canceled");
    const longa = await lerAssinatura(SUB_B);
    expect(longa.status).toBe("past_due");
    expect(longa.carencia_dias).toBe(30);
    expect(iso(longa.past_due_desde)).toBe("2026-07-31T12:00:00.000Z");

    expect(cancelamentosPedidos()).toEqual([
      `${BASE_URL_FAKE}/vinculos/${VINCULO_A}/cancelamento`,
    ]);
  });

  // ── 4. Fail-closed ─────────────────────────────────────────────────────────

  it("falha do gateway aborta o corte INTEIRO: nada é escrito, nem assinatura nem ciclo", async () => {
    // O caso mais importante do lote. Transicionar mesmo com o gateway fora
    // deixaria a autorização de Pix Automático VIVA no Asaas com a assinatura
    // morta no Iris — o banco continuaria autorizado a debitar uma clínica que
    // o produto já cortou, e nada nos dois lados acusaria a divergência.
    vi.unstubAllGlobals();
    chamadasGateway = [];
    instalarGateway({ cancelamentoFalha: true });

    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: new Date("2026-07-01T12:00:00.000Z"),
      carenciaDias: 10,
    });
    const cicloFalhou = await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-05-15T12:00:00.000Z"),
      fim: new Date("2026-06-14T12:00:00.000Z"),
      status: "falhou",
      valorCentavos: 3900,
      providerChargeId: "pay-fake-319-recusado",
    });

    const resultados = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
    });

    // A tentativa ACONTECEU — sem isto o teste passaria por não ter feito nada.
    expect(cancelamentosPedidos()).toEqual([
      `${BASE_URL_FAKE}/vinculos/${VINCULO_A}/cancelamento`,
    ]);

    // A assinatura fica exatamente como estava: a próxima passada tenta de novo.
    const linha = await lerAssinatura(SUB_A);
    expect(linha.status).toBe("past_due");
    expect(linha.cancelada_em).toBeNull();
    expect(iso(linha.past_due_desde)).toBe("2026-07-01T12:00:00.000Z");

    // E o ciclo NÃO virou dívida — nem `devido`, nem `apurado` (que seria o
    // rastro de `billing_apurar_ciclo` ter rodado antes de abortar).
    const ciclos = await lerCiclos(CLINICA_A);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]!.id).toBe(cicloFalhou);
    expect(ciclos[0]!.status).toBe("falhou");
    expect(ciclos[0]!.valor_centavos).toBe(3900);

    // O gate da #290 continua sem enxergar dívida nenhuma: `devido` é o único
    // estado que ele soma, e nada virou `devido`.
    expect((await levantarDebito(SUB_A)).totalCentavos).toBe(0);

    // O erro é reportado, não engolido — quem lê o log do job vê a clínica.
    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.cortada).toBe(false);
    expect(resultados[0]!.erro).toContain("500");
  });

  // ── 5. `falhou` vira `devido` e o gate da #290 enxerga o VALOR ─────────────

  it("o corte congela o ciclo `falhou` como devido, e o débito passa a valer 3900", async () => {
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: new Date("2026-07-01T12:00:00.000Z"),
      carenciaDias: 10,
    });
    // O ciclo cuja recusa produziu o `past_due`: cobrança emitida (tem
    // `provider_charge_id`) e valor já faturado de R$ 39,00. Nenhuma ficha
    // sobrevive na janela dele, então a REAPURAÇÃO conta 0 e o pro-rata
    // devolveria 0 — o piso "nunca abaixo do que já foi faturado" é o que
    // mantém 3900. Sem o piso, este caso mede 0 e falha.
    const cicloFalhou = await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-05-15T12:00:00.000Z"),
      fim: new Date("2026-06-14T12:00:00.000Z"),
      status: "falhou",
      valorCentavos: 3900,
      providerChargeId: "pay-fake-319-recusado",
    });

    await cancelarAssinaturasComCarenciaVencida({ agora: AGORA });

    const ciclos = await lerCiclos(CLINICA_A);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]!.id).toBe(cicloFalhou);
    expect(ciclos[0]!.status).toBe("devido");
    // VALOR, não só status: um congelamento que zerasse o número deixaria a
    // clínica cortada devendo nada e voltando de graça.
    expect(ciclos[0]!.valor_centavos).toBe(3900);

    // E é isto que fecha o gate da #290: o débito existe e vale o mesmo.
    const debito = await levantarDebito(SUB_A);
    expect(debito.totalCentavos).toBe(3900);
    expect(debito.ciclos[0]?.id).toBe(cicloFalhou);
  });

  // ── 6. O negativo do 5: revogação voluntária não leva `falhou` junto ───────

  it("revogação voluntária congela só aberto/apurado — o ciclo `falhou` fica de pé", async () => {
    // Protege o caminho da #310: na revogação da autorização, o ciclo `falhou`
    // é uma cobrança que ainda pode ser paga no gateway. Congelá-lo aqui viraria
    // cobrança dupla sem que ninguém tivesse decidido isso.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "active",
    });

    // Ciclo velho, cobrado e recusado. Nenhuma ficha na janela dele.
    const velho = (await owner!`
      INSERT INTO billing_cycle
        (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
         provider_charge_id)
      VALUES (
        ${CLINICA_A}, ${SUB_A},
        now() - interval '70 days', now() - interval '40 days',
        'falhou'::billing_cycle_status, 3900, 'pay-fake-319-recusado'
      ) RETURNING id`) as unknown as { id: string }[];

    // Ciclo vigente, 9d12h consumidos de 30 → 10 dias por arredondamento.
    const vigente = (await owner!`
      INSERT INTO billing_cycle
        (clinic_id, subscription_id, inicio, fim, status, valor_centavos)
      VALUES (
        ${CLINICA_A}, ${SUB_A},
        now() - interval '9 days 12 hours', now() + interval '20 days 12 hours',
        'aberto'::billing_cycle_status, 0
      ) RETURNING id`) as unknown as { id: string }[];

    // Uma ficha criada AGORA — dentro de [inicio, fim) do vigente e fora do
    // velho. Faixa de R$ 39, 10 dias de 30 → R$ 13,00.
    await owner!`INSERT INTO patient (clinic_id, nome)
                 VALUES (${CLINICA_A}, 'Ficha do ciclo vigente')`;

    await aplicarStatusProvider(VINCULO_A, "cancelada");

    const ciclos = await lerCiclos(CLINICA_A);
    const cicloVelho = ciclos.find((c) => c.id === velho[0]!.id)!;
    const cicloVigente = ciclos.find((c) => c.id === vigente[0]!.id)!;

    // O `falhou` intocado: status e VALOR.
    expect(cicloVelho.status).toBe("falhou");
    expect(cicloVelho.valor_centavos).toBe(3900);
    // O `aberto` congelado em pro-rata.
    expect(cicloVigente.status).toBe("devido");
    expect(cicloVigente.valor_centavos).toBe(1300);

    // O oráculo que mata o mutante "incluirFalhou vazou para cá": o débito é
    // 1300, não 5200. Contar linhas `devido` não enxergaria a diferença.
    expect((await levantarDebito(SUB_A)).totalCentavos).toBe(1300);
  });

  // ── 7. Ida-volta-ida ───────────────────────────────────────────────────────

  it("depois do corte, uma recusa NOVA reinicia a carência do zero", async () => {
    // O defeito que este caso persegue: se `past_due_desde` sobrevivesse ao
    // corte, o `?? agora` de `conciliarPagamentoDeCiclo` preservaria o carimbo
    // VELHO na recusa seguinte, a carência nasceria vencida e a clínica seria
    // cortada na primeira recusa depois de voltar. É a mesma classe de defeito
    // do `cancelada_em` não limpo na reativação (#290).
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: new Date("2026-01-15T12:00:00.000Z"),
      carenciaDias: 10,
    });

    // ── Ida: cortada ────────────────────────────────────────────────────────
    await cancelarAssinaturasComCarenciaVencida({ agora: AGORA });

    // Medição DIRETA do carimbo zerado. É esta linha — e não o fim do caso —
    // que morre se alguém tirar o `pastDueDesde: null` do corte.
    const aposCorte = await lerAssinatura(SUB_A);
    expect(aposCorte.status).toBe("canceled");
    expect(aposCorte.past_due_desde).toBeNull();

    // ── Volta: reativação ───────────────────────────────────────────────────
    await aplicarStatusProvider(VINCULO_A, "autorizada");
    expect(await lerAssinatura(SUB_A).then((l) => l.status)).toBe("active");

    // ── Ida de novo: UMA recusa nova, muito depois ──────────────────────────
    await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-06-10T12:00:00.000Z"),
      fim: new Date("2026-07-10T12:00:00.000Z"),
      status: "aguardando_pagamento",
      valorCentavos: 3900,
      providerChargeId: "pay-fake-319-recusa-nova",
    });

    const antesDaRecusa = new Date();
    // O CÓDIGO é obrigatório desde a #318: o desfecho depende dele. Sem motivo
    // a recusa é G0 (desconhecido) e não carimba `past_due` nenhum — este caso
    // mede a carência, então precisa de uma recusa que a produza. `PAYMENT_OVERDUE`
    // é G2, saldo insuficiente: o caso canônico de inadimplência.
    await conciliarPagamentoDeCiclo(
      "pay-fake-319-recusa-nova",
      "recusada",
      "PAYMENT_OVERDUE",
    );
    const depoisDaRecusa = new Date();

    const aposRecusa = await lerAssinatura(SUB_A);
    expect(aposRecusa.status).toBe("past_due");
    const carimbo = new Date(aposRecusa.past_due_desde!);
    // O carimbo é da recusa NOVA, não o de janeiro.
    expect(carimbo.getTime()).toBeGreaterThanOrEqual(antesDaRecusa.getTime());
    expect(carimbo.getTime()).toBeLessThanOrEqual(depoisDaRecusa.getTime());

    // E a carência NÃO nasceu vencida: nenhuma varredura corta agora, nem no
    // nono dia. Com o carimbo de janeiro sobrevivendo, a primeira já cortaria.
    const agoraReal = new Date();
    const noveDiasDepois = new Date(
      agoraReal.getTime() + 9 * 24 * 60 * 60 * 1000,
    );
    const onzeDiasDepois = new Date(
      agoraReal.getTime() + 11 * 24 * 60 * 60 * 1000,
    );

    expect(
      await cancelarAssinaturasComCarenciaVencida({ agora: agoraReal }),
    ).toEqual([]);
    expect(
      await cancelarAssinaturasComCarenciaVencida({ agora: noveDiasDepois }),
    ).toEqual([]);
    expect(await lerAssinatura(SUB_A).then((l) => l.status)).toBe("past_due");

    // ...e no décimo primeiro dia corta, provando que o relógio andou a partir
    // da recusa nova em vez de estar parado (ou vencido) desde janeiro.
    const cortes = await cancelarAssinaturasComCarenciaVencida({
      agora: onzeDiasDepois,
    });
    expect(cortes).toHaveLength(1);
    expect(await lerAssinatura(SUB_A).then((l) => l.status)).toBe("canceled");
  });

  // ── 8. dryRun ──────────────────────────────────────────────────────────────

  it("dryRun lista os elegíveis, não chama o gateway e não escreve nada", async () => {
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: new Date("2026-07-01T12:00:00.000Z"),
      carenciaDias: 10,
    });
    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
      status: "past_due",
      pastDueDesde: new Date("2026-06-01T12:00:00.000Z"),
      carenciaDias: 30,
    });
    const ciclo = await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-05-15T12:00:00.000Z"),
      fim: new Date("2026-06-14T12:00:00.000Z"),
      status: "falhou",
      valorCentavos: 3900,
      providerChargeId: "pay-fake-319-recusado",
    });

    const resultados = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
      dryRun: true,
    });

    // Reporta QUEM seria cortado, com a carência de cada linha.
    expect(resultados).toHaveLength(2);
    expect(resultados.every((r) => r.cortada === false)).toBe(true);
    expect(resultados.every((r) => r.erro === undefined)).toBe(true);
    expect(new Set(resultados.map((r) => r.carenciaDias))).toEqual(
      new Set([10, 30]),
    );

    // Zero round-trip: cancelar vínculo é irreversível do lado do banco, então
    // um ensaio que tocasse o gateway não seria ensaio nenhum.
    expect(chamadasGateway).toEqual([]);

    // E nada foi escrito — as duas linhas exatamente como entraram.
    for (const [id, carimbo] of [
      [SUB_A, "2026-07-01T12:00:00.000Z"],
      [SUB_B, "2026-06-01T12:00:00.000Z"],
    ] as const) {
      const linha = await lerAssinatura(id);
      expect(linha.status).toBe("past_due");
      expect(linha.cancelada_em).toBeNull();
      expect(iso(linha.past_due_desde)).toBe(carimbo);
    }

    const ciclos = await lerCiclos(CLINICA_A);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]!.id).toBe(ciclo);
    expect(ciclos[0]!.status).toBe("falhou");
    expect(ciclos[0]!.valor_centavos).toBe(3900);
  });

  // ── 9. A ORDEM da escrita: congelar antes, e atômico com o UPDATE ──────────

  it("congelamento que falha deixa a assinatura em past_due, sem estado meio-aplicado, e a passada seguinte se cura", async () => {
    // O defeito que este caso persegue: com o congelamento POR ÚLTIMO, uma
    // falha ali acontecia depois do `canceled` já commitado. A passada seguinte
    // não reencontra a linha (o predicado é `status = 'past_due'`), nada mais
    // congela, `levantarDebito` fica 0, o gate da #290 abre e a clínica cortada
    // reativa de graça.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: new Date("2026-07-01T12:00:00.000Z"),
      carenciaDias: 10,
    });
    const cicloFalhou = await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-05-15T12:00:00.000Z"),
      fim: new Date("2026-06-14T12:00:00.000Z"),
      status: "falhou",
      valorCentavos: 3900,
      providerChargeId: "pay-fake-319-recusado",
    });

    // Falha determinística NO CONGELAMENTO, e ESCOPADA por clínica: outros
    // arquivos de integração escrevem em `billing_cycle` em paralelo, e um
    // gatilho que estourasse para qualquer linha derrubaria os vizinhos. O
    // `clinic_id` entra por interpolação de texto (constante deste arquivo)
    // porque bind parameter não atravessa o corpo `$$ … $$` da função.
    await owner!.unsafe(`
      CREATE OR REPLACE FUNCTION teste_319_falha_congelamento() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'devido'
           AND NEW.clinic_id = '${CLINICA_A}'::uuid THEN
          RAISE EXCEPTION 'falha simulada no congelamento (#319)';
        END IF;
        RETURN NEW;
      END $$`);
    await owner!.unsafe(`
      CREATE TRIGGER teste_319_falha_congelamento
        BEFORE UPDATE ON billing_cycle
        FOR EACH ROW EXECUTE FUNCTION teste_319_falha_congelamento()`);

    try {
      const resultados = await cancelarAssinaturasComCarenciaVencida({
        agora: AGORA,
      });

      // A revogação no gateway ACONTECEU — é o que torna o resto interessante.
      expect(cancelamentosPedidos()).toEqual([
        `${BASE_URL_FAKE}/vinculos/${VINCULO_A}/cancelamento`,
      ]);

      // A linha continua VIVA: é o que faz a próxima passada reencontrá-la.
      const linha = await lerAssinatura(SUB_A);
      expect(linha.status).toBe("past_due");
      expect(linha.cancelada_em).toBeNull();
      expect(iso(linha.past_due_desde)).toBe("2026-07-01T12:00:00.000Z");

      // E nada meio-aplicado no ciclo: nem `devido`, nem o `apurado` que
      // `billing_apurar_ciclo` grava ANTES do UPDATE que estourou — a transação
      // levou os dois embora. Sem transação, este `falhou` viraria `apurado`.
      const ciclos = await lerCiclos(CLINICA_A);
      expect(ciclos).toHaveLength(1);
      expect(ciclos[0]!.id).toBe(cicloFalhou);
      expect(ciclos[0]!.status).toBe("falhou");
      expect(ciclos[0]!.valor_centavos).toBe(3900);

      // O erro diz ONDE parou: gateway (nada aconteceu) e congelamento
      // (autorização já revogada) pedem ações opostas de quem lê o log.
      expect(resultados).toHaveLength(1);
      expect(resultados[0]!.cortada).toBe(false);
      expect(resultados[0]!.etapaFalha).toBe("congelamento");
      expect(resultados[0]!.erro).toContain("[congelamento]");
      expect(resultados[0]!.erro).toContain("falha simulada");
    } finally {
      await owner!.unsafe(
        `DROP TRIGGER IF EXISTS teste_319_falha_congelamento ON billing_cycle`,
      );
      await owner!.unsafe(
        `DROP FUNCTION IF EXISTS teste_319_falha_congelamento()`,
      );
    }

    // ── A auto-cura: a passada seguinte completa o corte ─────────────────────
    const segunda = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
    });
    expect(segunda).toHaveLength(1);
    expect(segunda[0]!.cortada).toBe(true);

    const curada = await lerAssinatura(SUB_A);
    expect(curada.status).toBe("canceled");
    expect(iso(curada.cancelada_em)).toBe("2026-08-15T12:00:00.000Z");
    expect(curada.past_due_desde).toBeNull();

    // E o débito existe com o VALOR certo — é ele que fecha o gate da #290.
    const ciclosDepois = await lerCiclos(CLINICA_A);
    expect(ciclosDepois[0]!.status).toBe("devido");
    expect(ciclosDepois[0]!.valor_centavos).toBe(3900);
    expect((await levantarDebito(SUB_A)).totalCentavos).toBe(3900);
  });

  // ── 10. Idempotência da revogação ─────────────────────────────────────────

  it("gateway que responde 'não encontrado' no cancelamento NÃO trava o corte", async () => {
    // Fail-closed não pode virar loop preso: se o vínculo já não existe no
    // gateway (clínica revogou pelo app do banco, ou a resposta de um DELETE
    // aceito se perdeu no timeout), o objetivo JÁ está atingido. Tratar isso
    // como falha fazia toda passada diária responder 404 e a assinatura nunca
    // ser cortada — com `past_due` liberando escrita o tempo todo, que é
    // exatamente o defeito que a #319 existe para matar.
    vi.unstubAllGlobals();
    chamadasGateway = [];
    instalarGateway({ cancelamentoNaoEncontrado: true });

    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: new Date("2026-07-01T12:00:00.000Z"),
      carenciaDias: 10,
    });
    const cicloFalhou = await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-05-15T12:00:00.000Z"),
      fim: new Date("2026-06-14T12:00:00.000Z"),
      status: "falhou",
      valorCentavos: 3900,
      providerChargeId: "pay-fake-319-recusado",
    });

    const resultados = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
    });

    // A tentativa aconteceu — o corte não pula o gateway, ele ABSORVE o 404.
    expect(cancelamentosPedidos()).toEqual([
      `${BASE_URL_FAKE}/vinculos/${VINCULO_A}/cancelamento`,
    ]);

    // E o corte foi até o fim. O par deste caso é o do 500 acima: lá o corte é
    // abortado, aqui ele prossegue — a diferença entre "não sei se revogou" e
    // "não há o que revogar".
    const linha = await lerAssinatura(SUB_A);
    expect(linha.status).toBe("canceled");
    expect(iso(linha.cancelada_em)).toBe("2026-08-15T12:00:00.000Z");
    expect(linha.past_due_desde).toBeNull();

    const ciclos = await lerCiclos(CLINICA_A);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]!.id).toBe(cicloFalhou);
    expect(ciclos[0]!.status).toBe("devido");
    expect(ciclos[0]!.valor_centavos).toBe(3900);
    expect((await levantarDebito(SUB_A)).totalCentavos).toBe(3900);

    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.cortada).toBe(true);
    expect(resultados[0]!.erro).toBeUndefined();
  });

  // ── 11. O corte NÃO é reversível por não pagar ────────────────────────────

  it("assinatura já cortada cuja cobrança vence continua canceled e NÃO ganha carência nova", async () => {
    // O caminho: clínica cortada pede o débito da #290, não paga, a cobrança
    // vai a OVERDUE. Sem guard de status no ramo `recusada`, a assinatura
    // voltava de `canceled` para `past_due` — recuperava o direito de escrever
    // (`estado-conta.ts` deixa `past_due` escrever) e ganhava 10 dias novos de
    // carência. Cortar viraria reversível POR NÃO PAGAR.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: new Date("2026-07-01T12:00:00.000Z"),
      carenciaDias: 10,
    });
    await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-05-15T12:00:00.000Z"),
      fim: new Date("2026-06-14T12:00:00.000Z"),
      status: "falhou",
      valorCentavos: 3900,
      providerChargeId: "pay-fake-319-debito",
    });

    await cancelarAssinaturasComCarenciaVencida({ agora: AGORA });
    expect(await lerAssinatura(SUB_A).then((l) => l.status)).toBe("canceled");

    // A cobrança da dívida vence sem pagamento. Código G2 (#318): o que este
    // caso prova é que nem uma recusa que CARIMBA ressuscita a assinatura já
    // cortada — com G0 o guard nem seria exercitado, porque nada seria escrito.
    await conciliarPagamentoDeCiclo(
      "pay-fake-319-debito",
      "recusada",
      "PAYMENT_OVERDUE",
    );

    const depois = await lerAssinatura(SUB_A);
    expect(depois.status).toBe("canceled");
    // Carência NOVA não nasceu: o carimbo continua zerado.
    expect(depois.past_due_desde).toBeNull();
    // E o instante do corte não foi reescrito.
    expect(iso(depois.cancelada_em)).toBe("2026-08-15T12:00:00.000Z");

    // O ciclo, esse, registra a falha normalmente — é a cobrança que falhou.
    const ciclos = await lerCiclos(CLINICA_A);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]!.status).toBe("falhou");

    // E a varredura, quase um ano depois, não tem o que cortar: não há
    // carência correndo para uma assinatura que já está cortada.
    expect(
      await cancelarAssinaturasComCarenciaVencida({
        agora: new Date("2027-06-15T12:00:00.000Z"),
      }),
    ).toEqual([]);
  });

  // ── 12. Teto por passada ──────────────────────────────────────────────────

  it("corta até o teto da passada, sinaliza o truncamento e a passada seguinte corta o resto", async () => {
    // 21 elegíveis para um teto de 20: a varredura faz N round-trips
    // SEQUENCIAIS ao gateway dentro de um request cujo cliente
    // (`scripts/fechamento-ciclo-billing.mjs`) desiste em 30s. Estourando, o
    // job perde a lista de quem foi cortado enquanto o servidor continua
    // revogando autorizações — perder o registro de um ato irreversível é pior
    // que cortar devagar.
    for (let i = 0; i < TETO_ESPERADO + 1; i++) {
      const dia = String(1 + i).padStart(2, "0");
      await criarAssinatura({
        clinicId: CLINICAS_TETO[i]!,
        subscriptionId: SUBS_TETO[i]!,
        vinculoId: `vinculo-fake-319-teto-${dia}`,
        status: "past_due",
        // Um dia de diferença entre elas: a de índice 20 (2026-06-21) é a mais
        // NOVA, e é ela que tem de sobrar. Todas já venceram a carência de 10
        // dias em relação a 2026-08-15.
        pastDueDesde: new Date(`2026-06-${dia}T12:00:00.000Z`),
        carenciaDias: 10,
      });
    }

    const primeira = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
    });

    // Exatamente o teto — nem mais (estouraria o cliente), nem menos.
    expect(primeira).toHaveLength(20);
    expect(primeira.every((r) => r.cortada)).toBe(true);
    // O truncamento é VISÍVEL: silêncio aqui viraria "cobri tudo" sem ter
    // coberto. Está em todos os itens porque o retorno é uma lista.
    expect(primeira.every((r) => r.truncado === true)).toBe(true);
    expect(cancelamentosPedidos()).toHaveLength(20);

    // A ordem é determinística: sobra a MAIS NOVA, não uma linha arbitrária.
    // Sem `ORDER BY`, uma linha azarada poderia nunca sair.
    expect(primeira.map((r) => r.subscriptionId)).not.toContain(
      SUBS_TETO[TETO_ESPERADO],
    );
    const sobrou = await lerAssinatura(SUBS_TETO[TETO_ESPERADO]!);
    expect(sobrou.status).toBe("past_due");
    expect(iso(sobrou.past_due_desde)).toBe("2026-06-21T12:00:00.000Z");
    const primeiraCortada = await lerAssinatura(SUBS_TETO[0]!);
    expect(primeiraCortada.status).toBe("canceled");

    // ── A passada seguinte retoma de onde esta parou ─────────────────────────
    const segunda = await cancelarAssinaturasComCarenciaVencida({
      agora: AGORA,
    });
    expect(segunda).toHaveLength(1);
    expect(segunda[0]!.subscriptionId).toBe(SUBS_TETO[TETO_ESPERADO]);
    expect(segunda[0]!.cortada).toBe(true);
    // Sem excedente, sem marca de truncamento.
    expect(segunda[0]!.truncado).toBeUndefined();
    expect(
      await lerAssinatura(SUBS_TETO[TETO_ESPERADO]!).then((l) => l.status),
    ).toBe("canceled");
  });
});
