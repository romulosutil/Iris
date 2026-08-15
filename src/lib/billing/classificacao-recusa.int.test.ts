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

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor puxam
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

const { conciliarPagamentoDeCiclo } = await import("./subscription");
const { classificarRecusa } = await import("./classificacao-recusa");

/**
 * #318 — um caso por grupo de desfecho, com a régua de comportamento do §5.2:
 *
 * > Apagar a linha daquele grupo no mapa (`CATALOGO`, em
 * > `classificacao-recusa.ts`) derruba **aquele** caso e nenhum outro.
 *
 * Apagar a linha de um grupo joga os códigos dele em G0, e G0 não move estado
 * nenhum — então o caso do grupo fica vermelho pelo motivo certo (o desfecho
 * sumiu), e os demais seguem verdes porque cada caso só toca os códigos do seu
 * próprio grupo.
 *
 * ## O oráculo é sempre o banco relido
 *
 * `conciliarPagamentoDeCiclo` devolve `true` para praticamente tudo — inclusive
 * para os grupos que decidem NÃO escrever. Um caso que assertasse o retorno
 * passaria verde contra o código pré-#318, que gravava `falhou` + `past_due`
 * para os 25 códigos. Todos os casos abaixo releem `billing_cycle` e
 * `subscription` pela conexão dona.
 *
 * ## Por que os casos não asseriram o texto de `erro` como igualdade
 *
 * Comparar com a mesma constante que o código usa é o defeito catalogado
 * [teste-verde-que-nao-testa-nada]: passaria contra qualquer texto. O que os
 * casos medem de `erro` é a única propriedade que importa e que o código
 * pré-#318 NÃO tinha: que ele não é reescrito quando o grupo manda não escrever.
 */

const CLINICA_G1 = "00000000-0000-0000-0000-000000318a01";
const CLINICA_G2 = "00000000-0000-0000-0000-000000318a02";
const CLINICA_G3 = "00000000-0000-0000-0000-000000318a03";
const CLINICA_G4 = "00000000-0000-0000-0000-000000318a04";
const CLINICA_G5 = "00000000-0000-0000-0000-000000318a05";
const CLINICA_G6 = "00000000-0000-0000-0000-000000318a06";
const CLINICA_G7 = "00000000-0000-0000-0000-000000318a07";
const CLINICA_G8 = "00000000-0000-0000-0000-000000318a08";
const CLINICA_G0 = "00000000-0000-0000-0000-000000318a00";

const CLINICAS = [
  CLINICA_G0,
  CLINICA_G1,
  CLINICA_G2,
  CLINICA_G3,
  CLINICA_G4,
  CLINICA_G5,
  CLINICA_G6,
  CLINICA_G7,
  CLINICA_G8,
];

/** Carimbo de `past_due` anterior, para os casos que medem se ele sobrevive. */
const PAST_DUE_ANTIGO = new Date("2026-08-01T09:00:00.000Z");

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

// ── Fixtures ─────────────────────────────────────────────────────────────────

let seq = 0;

/**
 * Clínica + assinatura + ciclo, no estado em que a recusa chega. Devolve o
 * `provider_charge_id`, que é a chave pela qual a conciliação encontra o ciclo.
 */
async function cenario(opcoes: {
  clinicId: string;
  statusAssinatura: "active" | "past_due";
  pastDueDesde?: Date | null;
  statusCiclo: "aguardando_pagamento" | "falhou";
  erroCiclo?: string | null;
  recusaCodigoCiclo?: string | null;
}): Promise<{ subscriptionId: string; chargeId: string; cicloId: string }> {
  seq += 1;
  const subscriptionId = `00000000-0000-0000-0000-0000003180${String(seq).padStart(2, "0")}`;
  const chargeId = `pay-fake-318-${seq}`;

  await owner!`
    INSERT INTO clinic (id, nome)
    VALUES (${opcoes.clinicId}, ${`Clínica #318 ${opcoes.clinicId.slice(-3)}`})`;

  await owner!`
    INSERT INTO subscription
      (id, clinic_id, status, provider, provider_subscription_id,
       provider_customer_id, ciclo_dias, carencia_dias, past_due_desde)
    VALUES (
      ${subscriptionId}, ${opcoes.clinicId},
      ${opcoes.statusAssinatura}::subscription_status,
      'asaas', ${`vinculo-318-${seq}`}, ${`cli-318-${seq}`},
      30, 10, ${opcoes.pastDueDesde ?? null}
    )`;

  const linhas = (await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
       provider_charge_id, erro, recusa_codigo)
    VALUES (
      ${opcoes.clinicId}, ${subscriptionId},
      ${new Date("2026-07-01T00:00:00.000Z")}, ${new Date("2026-07-31T00:00:00.000Z")},
      ${opcoes.statusCiclo}::billing_cycle_status, 3900,
      ${chargeId}, ${opcoes.erroCiclo ?? null}, ${opcoes.recusaCodigoCiclo ?? null}
    )
    RETURNING id`) as unknown as { id: string }[];

  return { subscriptionId, chargeId, cicloId: linhas[0]!.id };
}

interface LinhaCiclo {
  id: string;
  status: string;
  erro: string | null;
  recusa_codigo: string | null;
  cobrado_em: Date | null;
}

async function lerCiclo(id: string): Promise<LinhaCiclo> {
  const linhas = (await owner!`
    SELECT id, status::text AS status, erro, recusa_codigo, cobrado_em
      FROM billing_cycle WHERE id = ${id}`) as unknown as LinhaCiclo[];
  return linhas[0]!;
}

interface LinhaAssinatura {
  status: string;
  past_due_desde: Date | null;
}

async function lerAssinatura(id: string): Promise<LinhaAssinatura> {
  const linhas = (await owner!`
    SELECT status::text AS status, past_due_desde
      FROM subscription WHERE id = ${id}`) as unknown as LinhaAssinatura[];
  return linhas[0]!;
}

async function limpar(): Promise<void> {
  await owner!`DELETE FROM billing_cycle WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM subscription WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM clinic WHERE id = ANY(${CLINICAS}::uuid[])`;
}

/**
 * Espião do `console.warn`.
 *
 * Não é zelo: para **G6, G7 e G0 o log é o único canal que existe**. Os três não
 * escrevem nada no banco (a tabela da #318 diz "a clínica vê: nada"), então sem
 * observar o aviso os três casos ficariam indistinguíveis entre si — e um mapa
 * que jogasse G6 em G0 passaria verde medindo só o banco. É exatamente o defeito
 * [teste-verde-que-nao-testa-nada].
 */
let aviso: ReturnType<typeof vi.spyOn>;

/** O grupo que a linha `[billing-recusa]` publicou. */
function grupoAvisado(): unknown {
  const chamada = aviso.mock.calls.find(
    (c) => c[0] === "[billing-recusa] cobrança de ciclo recusada",
  );
  return (chamada?.[1] as { grupo?: unknown } | undefined)?.grupo;
}

/** Se a tag PRÓPRIA do código desconhecido saiu. */
function avisouDesconhecida(): boolean {
  return aviso.mock.calls.some(
    (c) =>
      c[0] === "[billing-recusa-desconhecida] código fora do catálogo da #318",
  );
}

describe.skipIf(!hasDb)("#318 · desfecho da recusa por grupo", () => {
  beforeEach(async () => {
    await limpar();
    aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    aviso.mockRestore();
  });

  afterAll(async () => {
    if (owner) {
      await limpar();
      await owner.end();
    }
  });

  // ── Os grupos que PROVAM um fato sobre a clínica: carimbam `past_due` ──────

  it("G1 · teto insuficiente carimba past_due e registra o código no ciclo", async () => {
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G1,
      statusAssinatura: "active",
      statusCiclo: "aguardando_pagamento",
    });

    await conciliarPagamentoDeCiclo(
      chargeId,
      "recusada",
      "MAXIMUM_AMOUNT_EXCEEDED",
    );

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    // O código CRU, não o grupo: do código se re-deriva o grupo, do grupo não
    // se recupera o código (0099).
    expect(ciclo.recusa_codigo).toBe("MAXIMUM_AMOUNT_EXCEEDED");

    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("past_due");
    // O carimbo é o marco zero da carência de 10 dias — sem ele a assinatura
    // nunca é cortada e um teto baixo demais vira assinatura gratuita vitalícia.
    expect(assinatura.past_due_desde).not.toBeNull();

    expect(grupoAvisado()).toBe("G1");
    for (const codigo of ["MAXIMUM_AMOUNT_EXCEEDED"]) {
      expect(classificarRecusa(codigo).grupo).toBe("G1");
    }
    // O que separa G1 de G2 não é o relógio: é a copy e o fato de que retentar
    // só faz sentido depois que a clínica agir. Sem isto os dois grupos
    // voltariam a compartilhar desfecho, que é o defeito que a #318 mata.
    const politica = classificarRecusa("MAXIMUM_AMOUNT_EXCEEDED");
    expect(politica.copy).not.toBeNull();
    expect(politica.copy).not.toBe(classificarRecusa("PAYMENT_OVERDUE").copy);
  });

  it("G2 · saldo insuficiente carimba past_due e registra o código no ciclo", async () => {
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G2,
      statusAssinatura: "active",
      statusCiclo: "aguardando_pagamento",
    });

    await conciliarPagamentoDeCiclo(chargeId, "recusada", "PAYMENT_OVERDUE");

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.recusa_codigo).toBe("PAYMENT_OVERDUE");

    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("past_due");
    expect(assinatura.past_due_desde).not.toBeNull();

    expect(grupoAvisado()).toBe("G2");
    for (const codigo of ["PAYMENT_OVERDUE"]) {
      expect(classificarRecusa(codigo).grupo).toBe("G2");
    }
    // Único grupo em que retentar é o caso canônico do `3R_7D`.
    expect(classificarRecusa("PAYMENT_OVERDUE").valeGastarRetentativa).toBe(
      true,
    );
  });

  it("G4 · divergência cadastral carimba past_due e registra o código no ciclo", async () => {
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G4,
      statusAssinatura: "active",
      statusCiclo: "aguardando_pagamento",
    });

    await conciliarPagamentoDeCiclo(
      chargeId,
      "recusada",
      "PAYER_CPF_CNPJ_MISMATCH",
    );

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.recusa_codigo).toBe("PAYER_CPF_CNPJ_MISMATCH");

    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("past_due");
    expect(assinatura.past_due_desde).not.toBeNull();

    expect(grupoAvisado()).toBe("G4");
    for (const codigo of [
      "PAYER_CPF_CNPJ_MISMATCH",
      "INVALID_CUSTOMER_CPF_CNPJ",
      "INCORRECT_CUSTOMER_CPF_CNPJ",
    ]) {
      expect(classificarRecusa(codigo).grupo).toBe("G4");
    }
    // `RECEIVER_CPF_CNPJ_MISMATCH` parece do mesmo assunto e NÃO é deste grupo:
    // é o CNPJ do RECEBEDOR (nós). Trocar os dois cobraria a clínica pelo nosso
    // cadastro errado.
    expect(classificarRecusa("RECEIVER_CPF_CNPJ_MISMATCH").grupo).not.toBe(
      "G4",
    );
  });

  it("G5 · conta terminal carimba past_due, mas NÃO dispara corte imediato", async () => {
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G5,
      statusAssinatura: "active",
      statusCiclo: "aguardando_pagamento",
    });

    await conciliarPagamentoDeCiclo(chargeId, "recusada", "ACCOUNT_BLOCKED");

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.recusa_codigo).toBe("ACCOUNT_BLOCKED");

    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("past_due");
    expect(assinatura.past_due_desde).not.toBeNull();

    expect(grupoAvisado()).toBe("G5");
    for (const codigo of ["ACCOUNT_CLOSED", "ACCOUNT_BLOCKED"]) {
      expect(classificarRecusa(codigo).grupo).toBe("G5");
    }
    // Restrição inegociável da Decisão 1: bloqueio é frequentemente temporário
    // (judicial, antifraude, revisão cadastral). Cortar na hora trocaria um
    // problema reversível pela revogação da autorização, que não volta sem novo
    // consentimento no app do banco.
    expect(classificarRecusa("ACCOUNT_BLOCKED").corteImediato).toBe(false);
    // E retentar é desperdício garantido: a conta não debita em tentativa alguma.
    expect(classificarRecusa("ACCOUNT_CLOSED").valeGastarRetentativa).toBe(
      false,
    );
  });

  // ── G3: registra, mas NUNCA corta por conta do código ──────────────────────

  it("G3 · autorização morta registra o ciclo e não corta nem carimba pelo código", async () => {
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G3,
      statusAssinatura: "active",
      statusCiclo: "aguardando_pagamento",
    });

    await conciliarPagamentoDeCiclo(
      chargeId,
      "recusada",
      "INVALID_RECURRING_PAYMENT_ID",
    );

    // A cobrança falhou de fato, e o registro é o que a tela vai ler.
    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.recusa_codigo).toBe("INVALID_RECURRING_PAYMENT_ID");

    // Mas NADA irreversível saiu do código sozinho: a assinatura não foi
    // cortada e nem sequer entrou em carência. Um código espúrio aqui revogaria
    // autorização viva, e revogação não volta sem novo consentimento da clínica
    // no app do banco.
    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("active");
    expect(assinatura.past_due_desde).toBeNull();

    expect(grupoAvisado()).toBe("G3");
    for (const codigo of [
      "RECURRING_PAYMENT_NOT_CONFIRMED",
      "PAYMENT_INSTRUCTION_WITHOUT_AUTHORIZATION",
      "INVALID_RECURRING_PAYMENT_ID",
    ]) {
      expect(classificarRecusa(codigo).grupo).toBe("G3");
    }
    // Único grupo cujo desfecho é o corte — e por isso o único que exige
    // confirmação do gateway antes de qualquer escrita irreversível.
    expect(
      classificarRecusa("INVALID_RECURRING_PAYMENT_ID").corteImediato,
    ).toBe(true);
  });

  // ── Os grupos que não provam nada sobre a clínica: não movem estado ────────

  it("G6 · defeito nosso não apaga o estado que a recusa anterior gravou certo", async () => {
    const codigosG6 = [
      "RECEIVED_TOO_EARLY",
      "RECEIVED_TOO_LATE",
      "DUE_DATE_MISMATCH",
      "AMOUNT_MISMATCH",
      "RECEIVER_CPF_CNPJ_MISMATCH",
      "POST_DUE_DATE_ATTEMPT_NOT_ALLOWED",
      "OUT_OF_TIME_FRAME_FOR_RETRY",
      "EXCEEDED_MAXIMUM_RETRY_ATTEMPTS",
      "PAYMENT_ALREADY_SCHEDULED",
    ];

    // O cenário concreto da Decisão do §1: a recusa de SALDO já aconteceu e
    // carimbou o estado certo. Depois dela chega o refugo da retentativa que
    // NÓS emitimos errado.
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G6,
      statusAssinatura: "past_due",
      pastDueDesde: PAST_DUE_ANTIGO,
      statusCiclo: "falhou",
      erroCiclo: "diagnóstico da recusa de saldo, gravado antes",
      recusaCodigoCiclo: "PAYMENT_OVERDUE",
    });

    await conciliarPagamentoDeCiclo(
      chargeId,
      "recusada",
      "EXCEEDED_MAXIMUM_RETRY_ATTEMPTS",
    );

    // Nada foi tocado — nem o status, nem o diagnóstico, nem o código. Deixar
    // G6 escrever trocaria a causa real (saldo, acionável pela clínica) pelo
    // nosso bug.
    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("falhou");
    expect(ciclo.recusa_codigo).toBe("PAYMENT_OVERDUE");
    expect(ciclo.erro).toBe("diagnóstico da recusa de saldo, gravado antes");

    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("past_due");
    // O relógio da carência não foi reiniciado nem apagado.
    expect(assinatura.past_due_desde?.toISOString()).toBe(
      PAST_DUE_ANTIGO.toISOString(),
    );

    // G6 e G0 são INDISTINGUÍVEIS no banco — os dois não escrevem nada. O log é
    // o único observável que os separa, então é ele que faz este caso morrer se
    // a linha do G6 sumir do mapa: o grupo publicado muda, e a tag do
    // desconhecido, que G6 nunca emite, passa a sair.
    expect(grupoAvisado()).toBe("G6");
    expect(avisouDesconhecida()).toBe(false);

    for (const codigo of codigosG6) {
      expect(classificarRecusa(codigo).grupo).toBe("G6");
    }
    // A clínica não vê nada: defeito nosso é custo nosso.
    expect(
      classificarRecusa("EXCEEDED_MAXIMUM_RETRY_ATTEMPTS").copy,
    ).toBeNull();
  });

  it("G7 · falha do banco não é inadimplência da clínica: nada é escrito", async () => {
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G7,
      statusAssinatura: "active",
      statusCiclo: "aguardando_pagamento",
    });

    await conciliarPagamentoDeCiclo(
      chargeId,
      "recusada",
      "EXTERNAL_INSTITUTION_ERROR",
    );

    // O ciclo continua esperando pagamento: quem cobra o tempo de volta é o
    // backstop de D+7 (Decisão 2, entrega própria), não este caminho.
    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("aguardando_pagamento");
    expect(ciclo.recusa_codigo).toBeNull();

    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("active");
    expect(assinatura.past_due_desde).toBeNull();

    // Mesma razão do G6: no banco, G7 e G0 são idênticos. O que os separa é o
    // grupo publicado e o fato de que uma falha CONHECIDA do banco não sai como
    // "código desconhecido".
    expect(grupoAvisado()).toBe("G7");
    expect(avisouDesconhecida()).toBe(false);

    for (const codigo of [
      "EXTERNAL_INSTITUTION_ERROR",
      "PARTICIPANT_NOT_REGISTERED",
      "PARTICIPANT_ISPB_INVALID",
      "SAME_INSTITUTION_ERROR",
      "OTHER",
    ]) {
      expect(classificarRecusa(codigo).grupo).toBe("G7");
    }
  });

  it("G0 · código fora do catálogo (e motivo ausente) não pune a clínica", async () => {
    const desconhecido = await cenario({
      clinicId: CLINICA_G0,
      statusAssinatura: "active",
      statusCiclo: "aguardando_pagamento",
    });

    await conciliarPagamentoDeCiclo(
      desconhecido.chargeId,
      "recusada",
      "CODIGO_QUE_O_ASAAS_AINDA_NAO_INVENTOU",
    );

    expect((await lerCiclo(desconhecido.cicloId)).status).toBe(
      "aguardando_pagamento",
    );
    expect((await lerAssinatura(desconhecido.subscriptionId)).status).toBe(
      "active",
    );

    // E o mesmo vale para a ausência de motivo, que é o caminho que roda hoje
    // em produção.
    await conciliarPagamentoDeCiclo(desconhecido.chargeId, "recusada", null);

    expect((await lerCiclo(desconhecido.cicloId)).status).toBe(
      "aguardando_pagamento",
    );
    expect((await lerCiclo(desconhecido.cicloId)).recusa_codigo).toBeNull();
    expect(
      (await lerAssinatura(desconhecido.subscriptionId)).past_due_desde,
    ).toBeNull();

    // A tag PRÓPRIA sai — é ela que transforma "o catálogo cresceu" (ou "o
    // motivo não está chegando", D35) em trabalho agendado em vez de incidente.
    expect(grupoAvisado()).toBe("G0");
    expect(avisouDesconhecida()).toBe(true);

    // O catálogo é ABERTO: `refusalReason` é `string` sem `enum` no OpenAPI e a
    // doc avisa que valores entram sem aviso prévio. Um código novo tem que
    // cair aqui, não em `undefined`.
    expect(
      classificarRecusa("CODIGO_QUE_O_ASAAS_AINDA_NAO_INVENTOU").grupo,
    ).toBe("G0");
    // `null` é o estado de PRODUÇÃO enquanto o D35 não estiver medido em prod.
    expect(classificarRecusa(null).grupo).toBe("G0");
  });

  // ── G8: a correção de dinheiro ────────────────────────────────────────────

  it("G8 · cobrança já liquidada concilia como PAGA, sem gerar dívida", async () => {
    // A clínica JÁ pagou e já estava em `past_due` por uma recusa anterior do
    // mesmo ciclo. Antes da #318 este código virava `falhou` → `past_due` →
    // dívida congelada contra clínica adimplente, com o gate da #290 barrando
    // justamente quem tinha pago.
    const { subscriptionId, chargeId, cicloId } = await cenario({
      clinicId: CLINICA_G8,
      statusAssinatura: "past_due",
      pastDueDesde: PAST_DUE_ANTIGO,
      statusCiclo: "aguardando_pagamento",
    });

    // Um segundo ciclo agrupado NA MESMA cobrança (#290, coluna da 0097): se o
    // G8 não usar o caminho completo de liquidação, este fica devendo sozinho.
    const agrupado = (await owner!`
      INSERT INTO billing_cycle
        (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
         debito_agrupado_em)
      VALUES (
        ${CLINICA_G8}, ${subscriptionId},
        ${new Date("2026-06-01T00:00:00.000Z")}, ${new Date("2026-06-30T00:00:00.000Z")},
        'devido'::billing_cycle_status, 1300, ${cicloId}
      )
      RETURNING id`) as unknown as { id: string }[];

    await conciliarPagamentoDeCiclo(
      chargeId,
      "recusada",
      "PAYMENT_ALREADY_DONE",
    );

    const ciclo = await lerCiclo(cicloId);
    expect(ciclo.status).toBe("pago");
    expect(ciclo.cobrado_em).not.toBeNull();
    // Nada de código de recusa: não houve recusa, houve conciliação perdida.
    expect(ciclo.recusa_codigo).toBeNull();
    expect(ciclo.erro).toBeNull();

    // A cascata do débito agrupado roda igual ao pagamento confirmado.
    expect((await lerCiclo(agrupado[0]!.id)).status).toBe("pago");

    // E a assinatura sai de `past_due`: a mensalidade está paga.
    const assinatura = await lerAssinatura(subscriptionId);
    expect(assinatura.status).toBe("active");
    expect(assinatura.past_due_desde).toBeNull();

    expect(grupoAvisado()).toBe("G8");
    for (const codigo of ["PAYMENT_ALREADY_DONE"]) {
      expect(classificarRecusa(codigo).grupo).toBe("G8");
    }
  });

  // ── Regra de copy, transversal aos 9 grupos ───────────────────────────────

  it("nenhuma copy expõe o código bruto do gateway nem cita valor", async () => {
    // Regra do §5.2 e da própria doc do Asaas ("evite apresentar o código bruto
    // ao usuário final"). Valor também não: o teto do Pix Automático é ilegível
    // por regulação — o Iris não consegue nem ler nem dizer qual é.
    //
    // Passa em vazio de propósito para grupo sem copy: o que a regra proíbe é
    // copy ERRADA, e "a clínica não vê nada" (G6/G7/G8/G0) não é violação.
    const codigos = [
      "MAXIMUM_AMOUNT_EXCEEDED",
      "PAYMENT_OVERDUE",
      "INVALID_RECURRING_PAYMENT_ID",
      "PAYER_CPF_CNPJ_MISMATCH",
      "ACCOUNT_BLOCKED",
      "EXCEEDED_MAXIMUM_RETRY_ATTEMPTS",
      "OTHER",
      "PAYMENT_ALREADY_DONE",
      "CODIGO_INEXISTENTE",
    ];

    for (const codigo of codigos) {
      const { copy } = classificarRecusa(codigo);
      if (copy === null) continue;
      expect(copy).not.toContain(codigo);
      // Nenhum dígito: é assim que "R$ 39,00" e "3 tentativas" ficam de fora.
      expect(copy).not.toMatch(/\d/);
      expect(copy).not.toMatch(/[A-Z]{4,}_[A-Z]/);
    }
  });
});
