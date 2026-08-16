/**
 * #290 — cliente que cancela vira devedor: o débito é cobrado ANTES da
 * reativação.
 *
 * A #287/PR #307 fechou a metade de cima (o ciclo interrompido vira `devido`,
 * em pro-rata). Este arquivo mede a metade de baixo: que aquele valor de fato
 * barra a reativação até ser pago, que ele não some quando é pequeno demais para
 * o gateway, e que quitar não reativa sozinho.
 *
 * ## Os oráculos são estado no banco e chamadas ao gateway — nunca o retorno
 *
 * Duas afirmações desta issue são invisíveis no valor de retorno:
 *
 * 1. **"não cria autorização antes do pagamento"** — só se prova mostrando que
 *    `subscription.status` NÃO virou `setup_pending` e que nenhum
 *    `POST /pix/automatic/authorizations` saiu. Asserir só o retorno deixaria
 *    "barrou" e "barrou depois de já ter criado o vínculo" indistinguíveis;
 * 2. **"o débito não é perdoado quando fica abaixo do piso"** — só se prova
 *    relendo `billing_cycle.status` e vendo `devido` continuar lá depois de a
 *    clínica ter reativado.
 *
 * Roda com `pnpm test:rls`. Gate de env em `db/tests/integration-env.ts`.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

// Mesma razão dos demais .int.test.ts: o núcleo importa "server-only", que
// lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

const { iniciarAtivacaoAssinatura } = await import("./logic");
const { aplicarStatusProvider, conciliarPagamentoDeCiclo } =
  await import("@/lib/billing/subscription");
const { PISO_COBRANCA_AVULSA_CENTAVOS } = await import("@/lib/billing/debito");
const { sql: appSql } = await import("@/db/client");

const CLINIC = "00000000-0000-0000-0000-000000290aaa";
const U_COORD = "00000000-0000-0000-0000-000000290c01";
const SUB = "00000000-0000-0000-0000-000000290b01";

const CNPJ = "29.811.201/0001-50";

const ID_CLIENTE = "cus_000000000290";
const ID_AUTORIZACAO_VELHA = "aaaaaaaa-0000-4000-8000-000000000290";
const ID_AUTORIZACAO_NOVA = "bbbbbbbb-0000-4000-8000-000000000290";
const ID_COBRANCA_DEBITO = "pay_000000000290";
const BR_CODE_DEBITO = "00020126…debito-290";

let owner: ReturnType<typeof postgres>;

const ctx = { role: "coordenador", userId: U_COORD, clinicId: CLINIC } as never;

function formulario(): FormData {
  const fd = new FormData();
  fd.set("cpfCnpj", CNPJ);
  return fd;
}

type Chamada = { url: string; metodo: string; corpo: Record<string, unknown> };

/**
 * Gateway falso que responde por URL + método.
 *
 * `cobrancaRecusada` reproduz o piso mal calibrado: o Asaas devolve 400 para o
 * valor pedido. É o cenário em que falhar fechado trancaria a clínica fora para
 * sempre.
 */
function instalarGateway(
  opcoes: {
    cobrancaRecusada?: boolean;
    cobrancaJaPaga?: boolean;
    /**
     * Cobrança devolvida ESTORNADA pelo gateway (#310, D-7/P-5). É o estado do
     * qual não há saída automática: a idempotência por `externalReference`
     * devolveria a mesma cobrança para sempre.
     */
    cobrancaEstornada?: boolean;
  } = {},
): { chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (entrada: unknown, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = (init?.method ?? "GET").toUpperCase();
    chamadas.push({
      url,
      metodo,
      corpo:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {},
    });

    if (url.includes("/pixQrCode")) {
      return Response.json({ payload: BR_CODE_DEBITO });
    }
    // Busca de idempotência da emissão. Sempre vazia: cada teste começa sem
    // cobrança no gateway, e o que interessa medir é a emissão em si.
    if (url.includes("/payments?") && metodo === "GET") {
      return Response.json({ data: [] });
    }
    if (url.includes("/payments") && metodo === "POST") {
      if (opcoes.cobrancaRecusada) {
        return Response.json(
          { errors: [{ description: "valor abaixo do mínimo permitido" }] },
          { status: 400 },
        );
      }
      return Response.json({
        id: ID_COBRANCA_DEBITO,
        status: opcoes.cobrancaEstornada
          ? "REFUNDED"
          : opcoes.cobrancaJaPaga
            ? "RECEIVED"
            : "PENDING",
        invoiceUrl: "https://sandbox.asaas.com/i/290",
      });
    }
    if (url.includes("/customers")) {
      return Response.json({ id: ID_CLIENTE });
    }
    if (url.includes("/pix/automatic/authorizations")) {
      return Response.json({
        id: ID_AUTORIZACAO_NOVA,
        status: "AWAITING_PAYMENT",
        payload: "00020126…autorizacao-290",
        customerId: ID_CLIENTE,
      });
    }
    throw new Error(`fetch inesperado para ${metodo} ${url}`);
  });
  return { chamadas };
}

/** Assinatura cancelada, com cliente no gateway — o estado de quem já ativou. */
async function assinaturaCancelada(): Promise<void> {
  await owner`
    INSERT INTO subscription
      (id, clinic_id, status, provider, provider_subscription_id,
       provider_customer_id, ciclo_dias, cancelada_em)
    VALUES (
      ${SUB}, ${CLINIC}, 'canceled'::subscription_status, 'asaas',
      ${ID_AUTORIZACAO_VELHA}, ${ID_CLIENTE}, 30, now()
    )`;
}

/** Ciclo já congelado como débito pelo cancelamento (0097). */
async function cicloDevido(
  valorCentavos: number,
  diasAtras: number,
): Promise<string> {
  const linhas = await owner<{ id: string }[]>`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos, pacientes_contados)
    VALUES (
      ${CLINIC}, ${SUB},
      now() - (${diasAtras} || ' days')::interval,
      now() - (${diasAtras - 30} || ' days')::interval,
      'devido'::billing_cycle_status, ${valorCentavos}, 1
    )
    RETURNING id`;
  return linhas[0]!.id;
}

async function lerCiclos(): Promise<
  {
    id: string;
    status: string;
    provider_charge_id: string | null;
    debito_agrupado_em: string | null;
  }[]
> {
  return owner`
    SELECT id, status::text AS status, provider_charge_id, debito_agrupado_em
    FROM billing_cycle WHERE clinic_id = ${CLINIC} ORDER BY inicio`;
}

/** Valor gravado no ciclo — o oráculo do pro-rata, em centavos. */
async function valorDoCiclo(cycleId: string): Promise<number> {
  const [linha] = await owner<
    { valor_centavos: number }[]
  >`SELECT valor_centavos FROM billing_cycle WHERE id = ${cycleId}`;
  return Number(linha!.valor_centavos);
}

async function statusAssinatura(): Promise<string> {
  const [linha] = await owner<
    { status: string }[]
  >`SELECT status::text AS status FROM subscription WHERE clinic_id = ${CLINIC}`;
  return linha!.status;
}

describe.skipIf(!hasDb)("#290 · gate de débito na reativação", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
    await owner`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord #290', 'coord@i290.test')`;
    await owner`INSERT INTO clinic (id, nome, responsavel_conta_id) VALUES
      (${CLINIC}, 'Clínica #290', ${U_COORD})`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador')`;

    vi.stubEnv("BILLING_PROVIDER", "asaas");
    vi.stubEnv("BILLING_PROVIDER_API_KEY", "chave-api-de-teste-do-asaas-290");
    vi.stubEnv("ASAAS_BASE_URL", "https://api-sandbox.asaas.com/v3");
  });

  beforeEach(async () => {
    // A ordem respeita a FK: ciclo referencia assinatura.
    await owner`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
    // As fichas saem por DELETE escopado, e NÃO entram no TRUNCATE acima:
    // `TRUNCATE … patient CASCADE` alarga a superfície de lock o bastante para
    // colidir com o `TRUNCATE clinic` de outros arquivos de integração rodando
    // em paralelo — medido aqui como `deadlock detected` num caso e violação de
    // FK em três. A limpeza é necessária porque `billing_apurar_ciclo` conta
    // fichas do intervalo: uma sobrevivente do caso anterior mudaria o valor
    // apurado do seguinte, e o teste passaria (ou falharia) pelo motivo errado.
    await owner`DELETE FROM patient WHERE clinic_id = ${CLINIC}`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
    vi.unstubAllEnvs();
  });

  it("cobra o débito e NÃO cria autorização antes do pagamento", async () => {
    await assinaturaCancelada();
    await cicloDevido(1300, 30);
    const { chamadas } = instalarGateway();

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // 1º oráculo: o retorno traz a cobrança, e NÃO a autorização.
    expect(r.debito?.valorCentavos).toBe(1300);
    // Lista de uma entrada: o contrato já é `cobrancas[]` (#310), a política
    // ainda emite uma cobrança só, e `reaproveitada: false` é o que registra
    // que ela nasceu agora — não foi reapresentada.
    expect(r.debito?.cobrancas).toEqual([
      {
        cicloId: expect.any(String),
        providerChargeId: ID_COBRANCA_DEBITO,
        valorCentavos: 1300,
        reaproveitada: false,
        situacao: {
          estado: "pagavel",
          pagamento: {
            forma: "pix_copia_e_cola",
            brCode: BR_CODE_DEBITO,
            urlPagamento: "https://sandbox.asaas.com/i/290",
          },
        },
      },
    ]);
    expect(r.autorizacao).toBeUndefined();
    expect(r.error).toBeUndefined();

    // 2º oráculo, o que o retorno não mostra: nenhum vínculo novo no gateway.
    expect(
      chamadas.filter((c) => c.url.includes("/pix/automatic/authorizations")),
    ).toHaveLength(0);
    // ...e a assinatura continua cancelada, não `setup_pending`.
    expect(await statusAssinatura()).toBe("canceled");

    // 3º oráculo: a cobrança saiu contra o CLIENTE, por Pix comum, sem anexar a
    // autorização revogada — anexá-la mandaria o Asaas debitar um trilho morto.
    const emissao = chamadas.find(
      (c) => c.metodo === "POST" && c.url.includes("/payments"),
    )!;
    expect(emissao.corpo.customer).toBe(ID_CLIENTE);
    expect(emissao.corpo.billingType).toBe("PIX");
    expect(emissao.corpo.value).toBe(13);
    expect(emissao.corpo.pixAutomaticAuthorizationId).toBeUndefined();

    // 4º oráculo: o id da cobrança ficou na linha do ciclo, que é por onde o
    // webhook vai reconciliar.
    const [ciclo] = await lerCiclos();
    expect(ciclo!.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    expect(ciclo!.status).toBe("devido");
  });

  it("uma cobrança só para N ciclos devidos, com os demais agrupados na âncora", async () => {
    await assinaturaCancelada();
    const antigo = await cicloDevido(400, 90);
    const recente = await cicloDevido(400, 30);
    const { chamadas } = instalarGateway();

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // Soma dos dois — 400 sozinho estaria abaixo do piso e teria sido adiado.
    expect(r.debito?.valorCentavos).toBe(800);
    expect(
      chamadas.filter(
        (c) => c.metodo === "POST" && c.url.includes("/payments"),
      ),
    ).toHaveLength(1);

    const ciclos = await lerCiclos();
    const ancora = ciclos.find((c) => c.id === antigo)!;
    const agrupado = ciclos.find((c) => c.id === recente)!;
    // Âncora é o MAIS ANTIGO: determinismo, para a reentrada reencontrar a
    // mesma cobrança em vez de emitir uma segunda.
    expect(ancora.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    expect(ancora.debito_agrupado_em).toBeNull();
    expect(agrupado.provider_charge_id).toBeNull();
    expect(agrupado.debito_agrupado_em).toBe(antigo);
  });

  it("pagamento do débito quita a âncora e os agrupados, sem reativar a assinatura", async () => {
    await assinaturaCancelada();
    const antigo = await cicloDevido(400, 90);
    await cicloDevido(400, 30);
    instalarGateway();

    await iniciarAtivacaoAssinatura(ctx, formulario());
    await conciliarPagamentoDeCiclo(ID_COBRANCA_DEBITO, "paga");

    const ciclos = await lerCiclos();
    // Os DOIS quitados: sem a cascata, a clínica pagaria o total e continuaria
    // devendo o ciclo agrupado — barrada por uma dívida que já pagou.
    expect(ciclos.map((c) => c.status)).toEqual(["pago", "pago"]);
    expect(ciclos.find((c) => c.id === antigo)!.status).toBe("pago");

    // Quitar destrava o gate; NÃO reativa. Voltar continua sendo ato explícito
    // da clínica, com autorização nova de Pix Automático.
    expect(await statusAssinatura()).toBe("canceled");
  });

  it("com o débito quitado, a reativação volta a ser o fluxo normal", async () => {
    await assinaturaCancelada();
    await cicloDevido(1300, 30);
    const { chamadas } = instalarGateway();

    await iniciarAtivacaoAssinatura(ctx, formulario());
    await conciliarPagamentoDeCiclo(ID_COBRANCA_DEBITO, "paga");
    const segunda = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(segunda.debito).toBeUndefined();
    expect(segunda.autorizacao?.forma).toBe("pix_copia_e_cola");
    expect(await statusAssinatura()).toBe("setup_pending");
    expect(
      chamadas.filter((c) => c.url.includes("/pix/automatic/authorizations")),
    ).not.toHaveLength(0);
  });

  it("sem débito nenhum, a ativação é idêntica ao fluxo de hoje", async () => {
    // Não-regressão: é o caminho de toda clínica que nunca cancelou.
    const { chamadas } = instalarGateway();

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito).toBeUndefined();
    expect(r.autorizacao?.forma).toBe("pix_copia_e_cola");
    expect(await statusAssinatura()).toBe("setup_pending");
    // Zero round-trip de cobrança: quem não deve não é consultado no gateway.
    expect(
      chamadas.filter(
        (c) => c.metodo === "POST" && c.url.includes("/payments"),
      ),
    ).toHaveLength(0);
  });

  it("débito abaixo do piso deixa reativar e NÃO é perdoado", async () => {
    await assinaturaCancelada();
    const pequeno = await cicloDevido(260, 30);
    const { chamadas } = instalarGateway();

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // Passa: bloquear aqui seria deadlock — nenhum gateway emite R$ 2,60.
    expect(r.debito).toBeUndefined();
    expect(r.autorizacao?.forma).toBe("pix_copia_e_cola");
    expect(await statusAssinatura()).toBe("setup_pending");
    expect(
      chamadas.filter(
        (c) => c.metodo === "POST" && c.url.includes("/payments"),
      ),
    ).toHaveLength(0);

    // E o ponto da política: a dívida continua viva. Ela some da tela só quando
    // for paga — não quando for pequena.
    const [ciclo] = await lerCiclos();
    expect(ciclo!.id).toBe(pequeno);
    expect(ciclo!.status).toBe("devido");
    expect(ciclo!.provider_charge_id).toBeNull();
  });

  it("recusa 4xx do gateway adia o débito em vez de trancar a clínica fora", async () => {
    // O cenário do piso mal calibrado: `PISO_COBRANCA_AVULSA_CENTAVOS` é escolha
    // conservadora, não medição. Falhar fechado aqui protegeria a receita de um
    // ciclo e destruiria a de todos os seguintes.
    await assinaturaCancelada();
    await cicloDevido(PISO_COBRANCA_AVULSA_CENTAVOS + 100, 30);
    instalarGateway({ cobrancaRecusada: true });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.error).toBeUndefined();
    expect(r.autorizacao?.forma).toBe("pix_copia_e_cola");
    expect(await statusAssinatura()).toBe("setup_pending");
    // Adiado NÃO é perdoado: o ciclo continua `devido` e volta a ser cobrado na
    // próxima reativação, somado ao que vier depois.
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("devido");
  });

  /**
   * #310 (D-7/P-5) — estorno BARRA sem lançar.
   *
   * Qual mutação este teste mata: manter o `throw` de `estornada` em
   * `resolverGateDeDebito`. Com o throw, a exceção atravessa as camadas, cai no
   * `catch` genérico de `logic.ts` e a clínica recebe "Não foi possível apurar
   * o valor em aberto" — a MESMA frase de uma queda de rede. Por isso a
   * asserção é no texto que só o ramo `bloqueado` produz ("revisão manual",
   * "informando o CNPJ"), e não num `/fale com o suporte/` que as duas copies
   * compartilham.
   *
   * Mata também a variante que roteia `bloqueado` como `adiado`: ali a clínica
   * seria reativada (`setup_pending` + autorização nova) sem ter pago nada.
   */
  it("cobrança estornada barra a reativação com copy própria, sem lançar", async () => {
    await assinaturaCancelada();
    await cicloDevido(1300, 30);
    const { chamadas } = instalarGateway({ cobrancaEstornada: true });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.error).toMatch(/revisão manual/i);
    expect(r.error).toMatch(/informando o CNPJ da clínica/i);
    expect(r.debito).toBeUndefined();
    expect(r.autorizacao).toBeUndefined();

    // Não reativou: nenhum vínculo novo e a assinatura segue cancelada.
    expect(
      chamadas.filter((c) => c.url.includes("/pix/automatic/authorizations")),
    ).toHaveLength(0);
    expect(await statusAssinatura()).toBe("canceled");

    // E a dívida continua viva, para a decisão humana resolver o estorno.
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("devido");
  });

  it("cobrança já paga no gateway concilia na hora e libera a reativação", async () => {
    // Webhook atrasado: mandar a clínica esperar por um pagamento que o gateway
    // já confirmou seria repetir na tela o problema que o polling resolve.
    await assinaturaCancelada();
    await cicloDevido(1300, 30);
    instalarGateway({ cobrancaJaPaga: true });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito).toBeUndefined();
    expect(r.autorizacao?.forma).toBe("pix_copia_e_cola");
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("pago");
  });

  /**
   * O loop de exploração, ponta a ponta — é a afirmação central da #290.
   *
   * Cancelar no dia 10, voltar e cancelar no dia 10 de novo tem que custar
   * DUAS vezes os 10 dias. Se custar menos, cancelar-usar-cancelar é lucrativo
   * e a issue inteira não fez nada.
   *
   * O caso mede o valor dos dois débitos, e não só a contagem de linhas: foi
   * exatamente aqui que apareceu o defeito de `cancelada_em` não ser zerada na
   * reativação. Com a coluna carregando o corte ANTIGO, o segundo débito era
   * apurado contra um instante anterior ao início do ciclo novo,
   * `apurarDebitoProRata` saturava no piso de 1 dia, e a segunda volta saía por
   * R$ 1,30 em vez de R$ 13,00 — o dia grátis reaberto pelo caminho de volta.
   * Um teste que só contasse "dois ciclos devidos" passaria com o bug vivo.
   */
  it("cancelar → reativar → cancelar cobra os dois períodos, sem dia grátis", async () => {
    instalarGateway();

    // ── Volta 1: assinatura ativa, 10 dias de ciclo consumidos, 1 ficha ──────
    await owner`
      INSERT INTO subscription
        (id, clinic_id, status, provider, provider_subscription_id,
         provider_customer_id, ciclo_dias, ativada_em,
         ciclo_atual_inicio, ciclo_atual_fim)
      VALUES (
        ${SUB}, ${CLINIC}, 'active'::subscription_status, 'asaas',
        ${ID_AUTORIZACAO_VELHA}, ${ID_CLIENTE}, 30,
        now() - interval '9 days 12 hours',
        now() - interval '9 days 12 hours', now() + interval '20 days 12 hours'
      )`;
    // Criada agora, portanto dentro de `[inicio, fim)` — `billing_apurar_ciclo`
    // a conta pelo critério `criado_no_ciclo`.
    await owner`INSERT INTO patient (clinic_id, nome) VALUES (${CLINIC}, 'Ficha da volta 1')`;
    await owner`
      INSERT INTO billing_cycle (clinic_id, subscription_id, inicio, fim, status)
      SELECT ${CLINIC}, ${SUB}, s.ciclo_atual_inicio, s.ciclo_atual_fim,
             'aberto'::billing_cycle_status
        FROM subscription s WHERE s.id = ${SUB}`;

    await aplicarStatusProvider(ID_AUTORIZACAO_VELHA, "cancelada");

    // 1 ficha na faixa de R$ 39, 10 dias de 30 → R$ 13,00.
    const aposPrimeiro = await lerCiclos();
    expect(aposPrimeiro).toHaveLength(1);
    expect(aposPrimeiro[0]!.status).toBe("devido");
    expect(await valorDoCiclo(aposPrimeiro[0]!.id)).toBe(1300);

    // Paga o débito e volta.
    const r1 = await iniciarAtivacaoAssinatura(ctx, formulario());
    expect(r1.debito?.valorCentavos).toBe(1300);
    await conciliarPagamentoDeCiclo(ID_COBRANCA_DEBITO, "paga");

    // O cancelamento da volta 1 fica DISTANTE no passado: é ele que, se
    // sobrevivesse em `cancelada_em`, envenenaria a apuração da volta 2.
    await owner`
      UPDATE subscription SET cancelada_em = now() - interval '40 days'
       WHERE id = ${SUB}`;

    // ── Volta 2: reativa, consome 10 dias de novo, cancela de novo ───────────
    await aplicarStatusProvider(ID_AUTORIZACAO_VELHA, "autorizada");
    expect(await statusAssinatura()).toBe("active");

    // Recua o ciclo recém-aberto em 10 dias — o equivalente a "usou 10 dias".
    await owner`
      UPDATE subscription
         SET ciclo_atual_inicio = now() - interval '9 days 12 hours',
             ciclo_atual_fim    = now() + interval '20 days 12 hours'
       WHERE id = ${SUB}`;
    await owner`
      UPDATE billing_cycle
         SET inicio = now() - interval '9 days 12 hours', fim = now() + interval '20 days 12 hours'
       WHERE subscription_id = ${SUB} AND status = 'aberto'`;

    await aplicarStatusProvider(ID_AUTORIZACAO_VELHA, "cancelada");

    const ciclos = await lerCiclos();
    expect(ciclos).toHaveLength(2);
    const pago = ciclos.find((c) => c.status === "pago")!;
    const devido = ciclos.find((c) => c.status === "devido")!;
    expect(await valorDoCiclo(pago.id)).toBe(1300);
    // O oráculo do loop: o segundo período custa o MESMO que o primeiro.
    // Com `cancelada_em` velha isto vinha 130 (piso de 1 dia).
    expect(await valorDoCiclo(devido.id)).toBe(1300);
  });
});
