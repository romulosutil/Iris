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

/**
 * Injeção de falha nas escritas em `billing_cycle` feitas por `authDb`.
 *
 * Existe porque duas afirmações desta revisão só são mensuráveis quando uma
 * escrita do meio do caminho NÃO acontece:
 *
 * 1. **atomicidade de `registrarCobrancaDeDebito`** — o processo morre entre
 *    gravar a cobrança na âncora e carimbar os agrupados. Sem transação, a
 *    primeira escrita fica commitada e a reentrada emite uma SEGUNDA cobrança;
 * 2. **cascata de `liquidarCiclo` que não alcança um agrupado** — é a premissa
 *    escrita no docblock de `resolverGateDeDebito` ("quando a cascata NÃO
 *    alcança um deles"), e é ela que produz o ciclo `devido` com ponteiro para
 *    uma âncora já `pago`.
 *
 * O ponto de injeção é o `update` do Drizzle, contado só quando o alvo é
 * `billing_cycle`, porque ele é o MESMO nos dois mundos: hoje as escritas saem
 * por `authDb.update`, e com a transação saem por `tx.update` de dentro de
 * `authDb.transaction`. Um dublê que só interceptasse um dos dois mediria a
 * refatoração, não o comportamento.
 *
 * Desarmado (zeros), o proxy é passagem pura — todos os outros casos deste
 * arquivo rodam contra o `authDb` real.
 */
const controle = vi.hoisted(() => ({
  /** Faz a N-ésima escrita em `billing_cycle` LANÇAR. 0 = desarmado. */
  falharNaEscritaDeCiclo: 0,
  /** Faz a N-ésima escrita em `billing_cycle` virar no-op. 0 = desarmado. */
  neutralizarEscritaDeCiclo: 0,
  escritasDeCiclo: 0,
}));

vi.mock("@/db/client", async () => {
  const real =
    await vi.importActual<typeof import("@/db/client")>("@/db/client");
  const schema =
    await vi.importActual<typeof import("@/db/schema")>("@/db/schema");

  /** Builder que engole a escrita: `.set().where()` resolve sem tocar no banco. */
  const escritaEngolida = { set: () => ({ where: async () => [] }) };

  const instrumentar = <T extends object>(alvo: T): T =>
    new Proxy(alvo, {
      get(_alvoProxy, prop) {
        const valor = (alvo as Record<PropertyKey, unknown>)[prop];
        if (typeof valor !== "function") return valor;
        // Bind no alvo REAL: o Drizzle usa campos privados, e deixar o `this`
        // cair no Proxy derruba o método com TypeError.
        const metodo = valor.bind(alvo) as (...a: unknown[]) => unknown;

        if (prop === "update") {
          return (tabela: unknown, ...resto: unknown[]) => {
            if (tabela === schema.billingCycle) {
              controle.escritasDeCiclo += 1;
              if (
                controle.escritasDeCiclo === controle.falharNaEscritaDeCiclo
              ) {
                throw new Error(
                  "[teste] falha simulada entre as escritas do registro de cobrança",
                );
              }
              if (
                controle.escritasDeCiclo === controle.neutralizarEscritaDeCiclo
              ) {
                return escritaEngolida;
              }
            }
            return metodo(tabela, ...resto);
          };
        }

        if (prop === "transaction") {
          return (cb: (tx: object) => unknown, ...resto: unknown[]) =>
            metodo((tx: object) => cb(instrumentar(tx)), ...resto);
        }

        return metodo;
      },
    });

  return { ...real, authDb: instrumentar(real.authDb) };
});

/** Zera e arma a injeção para a chamada seguinte. */
function armar(
  opcoes: { falharNaEscrita?: number; neutralizar?: number } = {},
) {
  controle.escritasDeCiclo = 0;
  controle.falharNaEscritaDeCiclo = opcoes.falharNaEscrita ?? 0;
  controle.neutralizarEscritaDeCiclo = opcoes.neutralizar ?? 0;
}

const { iniciarAtivacaoAssinatura } = await import("./logic");
const { aplicarStatusProvider, conciliarPagamentoDeCiclo } =
  await import("@/lib/billing/subscription");
const { PISO_COBRANCA_AVULSA_CENTAVOS, resolverGateDeDebito } =
  await import("@/lib/billing/debito");
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

/** Cobrança que JÁ existia no gateway antes de o gate rodar (#310). */
const ID_COBRANCA_ANTIGA = "pay_000000000310";
const URL_ANTIGA = "https://sandbox.asaas.com/i/310";

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
 *
 * `antiga` descreve a cobrança que JÁ existia antes de o gate rodar (#310): é
 * ela que `GET /payments/{id}` devolve no caminho do reuso.
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
    /** Estado da cobrança ANTIGA em `GET /payments/{id}` (#310). */
    antiga?: {
      status?: string;
      deleted?: boolean;
      /** >= 400 faz a consulta de reuso falhar com esse status HTTP. */
      httpStatus?: number;
      /** Instruções de Pix Automático pendentes, por filtro de status. */
      instrucoes?: Record<string, unknown[]>;
      /**
       * `value` da cobrança no gateway, em REAIS (é assim que o Asaas fala).
       *
       * Configurável porque uma cobrança de débito consolidada cobre N ciclos:
       * o valor dela é a SOMA, e a linha da âncora sozinha vale menos. É essa
       * diferença que separa "mostra o valor do gateway" de "mostra o valor da
       * linha" — com os dois iguais, o caso não distingue nada.
       */
      valorReais?: number;
    };
  } = {},
): { chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  /**
   * Idempotência do gateway por `externalReference` — o que o Asaas de verdade
   * faz, e o que o adapter consulta em `buscarCobrancaPorReferencia` ANTES de
   * todo `POST /payments`.
   *
   * Antes desta revisão o dublê respondia `{ data: [] }` para toda busca e
   * devolvia sempre o MESMO id no POST. Nesse mundo "emitiu de novo" e
   * "reencontrou a de antes" ficam indistinguíveis, e é exatamente essa
   * distinção que separa a reentrada segura da cobrança dupla: a `0075` deixa
   * a referência `debito:<âncora>` estável, e é o gateway que se recusa a
   * criar a segunda cobrança sobre ela.
   */
  const porReferencia = new Map<string, Record<string, unknown>>();
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

    if (url.includes("/pix/automatic/paymentInstructions")) {
      const filtro = new URL(url).searchParams.get("status") ?? "";
      return Response.json({ data: opcoes.antiga?.instrucoes?.[filtro] ?? [] });
    }
    if (url.includes("/pixQrCode")) {
      return Response.json({ payload: BR_CODE_DEBITO });
    }
    // Consulta de UMA cobrança (`/payments/{id}`) — o caminho do reuso (#310).
    // Distinguida da busca por referência (`/payments?…`) pelo separador.
    if (url.includes("/payments/") && metodo === "GET") {
      if (opcoes.antiga?.httpStatus && opcoes.antiga.httpStatus >= 400) {
        return Response.json(
          { errors: [] },
          { status: opcoes.antiga.httpStatus },
        );
      }
      return Response.json({
        // Ecoa o id pedido: na reentrada do gate a cobrança consultada é a que
        // NÓS emitimos na primeira volta, não a `ID_COBRANCA_ANTIGA`.
        id: url.split("/payments/")[1],
        status: opcoes.antiga?.status ?? "OVERDUE",
        deleted: opcoes.antiga?.deleted ?? false,
        value: opcoes.antiga?.valorReais ?? 13,
        invoiceUrl: URL_ANTIGA,
      });
    }
    // Busca de idempotência da emissão: devolve a cobrança já criada sob a
    // MESMA `externalReference`, como o Asaas faz. Cada teste começa com o
    // registro vazio.
    if (url.includes("/payments?") && metodo === "GET") {
      const referencia =
        new URL(url).searchParams.get("externalReference") ?? "";
      const ja = porReferencia.get(referencia);
      return Response.json({ data: ja ? [ja] : [] });
    }
    if (url.includes("/payments") && metodo === "POST") {
      if (opcoes.cobrancaRecusada) {
        return Response.json(
          { errors: [{ description: "valor abaixo do mínimo permitido" }] },
          { status: 400 },
        );
      }
      // Id NOVO a cada POST aceito, e não o mesmo literal sempre: duas
      // cobranças vivas com o mesmo id esconderiam a cobrança dupla dentro de
      // uma coluna que parece correta. O primeiro mantém o id histórico para
      // não reescrever os casos que já mediam a emissão única.
      const emitidas = chamadas.filter(
        (c) => c.metodo === "POST" && c.url.includes("/payments"),
      ).length;
      const corpoResposta = {
        id:
          emitidas === 1
            ? ID_COBRANCA_DEBITO
            : `${ID_COBRANCA_DEBITO}_${emitidas}`,
        status: opcoes.cobrancaEstornada
          ? "REFUNDED"
          : opcoes.cobrancaJaPaga
            ? "RECEIVED"
            : "PENDING",
        invoiceUrl: "https://sandbox.asaas.com/i/290",
      };
      const referencia = String(
        (init?.body ? JSON.parse(String(init.body)) : {}).externalReference ??
          "",
      );
      if (referencia) porReferencia.set(referencia, corpoResposta);
      return Response.json(corpoResposta);
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

/** Conta quantas cobranças NOVAS foram emitidas. O oráculo da #310. */
function emissoes(chamadas: Chamada[]): Chamada[] {
  return chamadas.filter(
    (c) => c.metodo === "POST" && c.url.includes("/payments"),
  );
}

/**
 * Conta as consultas de REUSO — `GET /payments/{id}`, e só elas.
 *
 * O `[^/?]+$` é o que separa a consulta de reuso do `GET /payments/{id}/pixQrCode`
 * que TODA emissão faz: sem ele, o caso "quem nunca teve cobrança não é
 * consultado" passaria contando o QR da cobrança que ele mesmo acabou de emitir.
 */
function consultasDeReuso(chamadas: Chamada[]): Chamada[] {
  return chamadas.filter(
    (c) => c.metodo === "GET" && /\/payments\/[^/?]+$/.test(c.url),
  );
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

/** Ciclo `devido` que JÁ carrega uma cobrança emitida (o caso da #310). */
async function cicloDevidoComCobranca(
  valorCentavos: number,
  diasAtras: number,
  providerChargeId: string,
): Promise<string> {
  const id = await cicloDevido(valorCentavos, diasAtras);
  await owner`
    UPDATE billing_cycle SET provider_charge_id = ${providerChargeId}
     WHERE id = ${id}`;
  return id;
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
    // Desarma a injeção: um caso que esqueça de limpar contaminaria o
    // seguinte com uma escrita fantasma, e o verde sairia pelo motivo errado.
    armar();
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
    // O cenário do piso descalibrado: `PISO_COBRANCA_AVULSA_CENTAVOS` é medição
    // (R$ 5,00, sandbox do Asaas em 15/08/2026), mas o piso é do gateway e pode
    // mudar sem nos avisar. Falhar fechado aqui protegeria a receita de um
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
   * #310 — reaproveitar a cobrança que já existe, em vez de emitir uma segunda.
   *
   * O gateway falso responde `GET /payments/{id}` com a cobrança ANTIGA
   * (`OVERDUE` por padrão, que é o estado real depois de esgotadas as
   * retentativas do Pix Automático), e continua respondendo o `POST /payments`
   * de sempre. Os oráculos são a CONTAGEM de POSTs e o estado no banco.
   */
  /**
   * Qual mutação este teste mata: emitir SEMPRE (o bug de hoje). O oráculo é a
   * CONTAGEM de POSTs, não o retorno — um retorno com a cobrança certa é
   * perfeitamente compatível com uma segunda cobrança tendo sido criada ao
   * lado, que é exatamente o defeito que a issue existe para fechar.
   */
  it("cobrança viva é reapresentada, sem emitir uma segunda", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { status: "OVERDUE" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(0);
    expect(r.debito?.valorCentavos).toBe(1300);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
    expect(r.debito?.cobrancas[0]!.reaproveitada).toBe(true);
    expect(r.debito?.cobrancas[0]!.situacao).toEqual({
      estado: "pagavel",
      pagamento: {
        forma: "pix_copia_e_cola",
        brCode: BR_CODE_DEBITO,
        urlPagamento: URL_ANTIGA,
      },
    });
    // Reapresentar não reativa: a dívida continua na frente da porta.
    expect(r.autorizacao).toBeUndefined();
    expect(await statusAssinatura()).toBe("canceled");
  });

  /**
   * Qual mutação este teste mata: sobrescrever o `provider_charge_id` da âncora
   * reaproveitada (D-5). Sem este caso, o teste seguinte não teria como falhar
   * — e é este id que o webhook do pagamento antigo procura.
   *
   * O `reaproveitada` é asserido JUNTO de propósito: sem ele o caso passaria
   * vácuo por qualquer caminho em que o gate não faz nada (bloqueado, adiado),
   * já que "não fez nada" também deixa o id intacto.
   */
  it("o id da cobrança reaproveitada NÃO é sobrescrito no ciclo", async () => {
    await assinaturaCancelada();
    const ciclo = await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    instalarGateway({ antiga: { status: "OVERDUE" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito?.cobrancas[0]!.reaproveitada).toBe(true);
    const linha = (await lerCiclos()).find((c) => c.id === ciclo)!;
    expect(linha.provider_charge_id).toBe(ID_COBRANCA_ANTIGA);
  });

  /**
   * O NEGATIVO DO DoD, e a razão de a issue existir.
   *
   * Qual mutação este teste mata: a mesma de cima, medida pelo efeito. Com o id
   * sobrescrito, o webhook do pagamento ANTIGO não acha ciclo, vira
   * `erroAplicacao: "cobrança de ciclo sem ciclo correspondente"` (#289 — o
   * ALARME, não o ruído da ativação), e a clínica fica com
   * dinheiro recebido e dívida viva — barrada por uma dívida que já pagou.
   */
  it("pagar a cobrança antiga concilia o ciclo — sem dinheiro recebido com dívida viva", async () => {
    await assinaturaCancelada();
    instalarGateway({ antiga: { status: "OVERDUE" } });
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());
    const conciliou = await conciliarPagamentoDeCiclo(
      ID_COBRANCA_ANTIGA,
      "paga",
    );

    // O gate REALMENTE apresentou a cobrança antiga: sem esta linha, um gate
    // que barrasse sem fazer nada também deixaria o id intacto e o webhook
    // conciliaria — verde sem que o reuso tivesse acontecido.
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
    expect(conciliou).toBe(true);
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("pago");
  });

  /**
   * Qual mutação este teste mata: consolidar tudo numa cobrança nova por cima
   * da viva — a cobrança dupla que a #310 existe para evitar. Mata também a
   * variante que agrupa o ciclo de (b) sob a âncora de (a): ali pagar a
   * cobrança reaproveitada liquidaria o ciclo novo de graça.
   */
  it("débito misto vira duas formas de pagamento: a viva e a consolidada", async () => {
    await assinaturaCancelada();
    const comCobranca = await cicloDevidoComCobranca(
      1300,
      90,
      ID_COBRANCA_ANTIGA,
    );
    const semCobranca = await cicloDevido(700, 30);
    const { chamadas } = instalarGateway({ antiga: { status: "OVERDUE" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // Uma emissão só, e o valor dela é o do conjunto (b) — não o total.
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(7);

    expect(r.debito?.valorCentavos).toBe(2000);
    expect(r.debito?.cobrancas).toHaveLength(2);
    const reaproveitada = r.debito!.cobrancas.find((c) => c.reaproveitada)!;
    const nova = r.debito!.cobrancas.find((c) => !c.reaproveitada)!;
    expect(reaproveitada.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
    expect(reaproveitada.valorCentavos).toBe(1300);
    expect(nova.providerChargeId).toBe(ID_COBRANCA_DEBITO);
    expect(nova.valorCentavos).toBe(700);

    const ciclos = await lerCiclos();
    const a = ciclos.find((c) => c.id === comCobranca)!;
    const b = ciclos.find((c) => c.id === semCobranca)!;
    expect(a.provider_charge_id).toBe(ID_COBRANCA_ANTIGA);
    expect(b.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    // O ciclo de (b) NÃO pode pendurar na âncora de (a): pagar a reaproveitada
    // liquidaria de graça um ciclo que ela não cobre.
    expect(b.debito_agrupado_em).toBeNull();
    expect(a.debito_agrupado_em).toBeNull();
  });

  /**
   * P-6 — ponteiro PENDURADO (a âncora não deve mais nada) volta a ser âncora.
   *
   * Qual mutação este teste mata: deixar o `debito_agrupado_em` velho na âncora
   * nova. A cascata de `liquidarCiclo` liquidaria o ciclo novo quando alguém
   * pagasse a cobrança do ciclo antigo — dívida quitada sem dinheiro nenhum ter
   * entrado por ela. Mata também a variante oposta, de tratar todo ciclo com
   * ponteiro como "coberto por outra cobrança": aqui a âncora está `pago`, não
   * há cobrança nossa em aberto cobrindo o ciclo de 60 dias, e ignorá-lo o
   * transformaria em dívida que nunca mais é cobrada.
   */
  it("ponteiro pendurado volta a ser âncora e sai limpo do agrupamento antigo", async () => {
    await assinaturaCancelada();
    const antigo = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const agrupado = await cicloDevido(700, 60);
    // Estado que um gate anterior deixou: o de 60 dias pendurado no de 90.
    await owner`
      UPDATE billing_cycle SET debito_agrupado_em = ${antigo}
       WHERE id = ${agrupado}`;
    // ...e o de 90 já foi liquidado sem a cascata ter alcançado o de 60. O
    // ponteiro virou lixo: a cobrança dele não cobre mais dívida nenhuma.
    await owner`
      UPDATE billing_cycle SET status = 'pago'::billing_cycle_status,
             cobrado_em = now() WHERE id = ${antigo}`;
    const { chamadas } = instalarGateway();

    await iniciarAtivacaoAssinatura(ctx, formulario());

    // A dívida de 60 dias É cobrada — e por uma âncora com referência virgem.
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(7);
    const depois = await lerCiclos();
    const novaAncora = depois.find((c) => c.id === agrupado)!;
    expect(novaAncora.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    expect(novaAncora.debito_agrupado_em).toBeNull();

    // O oráculo que importa: pagar a cobrança ANTIGA não liquida o ciclo novo.
    await conciliarPagamentoDeCiclo(ID_COBRANCA_ANTIGA, "paga");
    const final = await lerCiclos();
    expect(final.find((c) => c.id === agrupado)!.status).toBe("devido");
  });

  /**
   * #310 — REENTRADA: o ciclo agrupado não pode virar uma segunda cobrança.
   *
   * O caso que derrubou a entrega. Dois ciclos sem cobrança viram UMA cobrança
   * de R$ 20,00 na primeira chamada (âncora A, B agrupado). A clínica recarrega
   * a tela e o gate roda de novo: como o ciclo agrupado NUNCA recebe
   * `provider_charge_id` (a coluna é UNIQUE parcial), ler só aquela coluna faz B
   * parecer "ciclo sem cobrança". Ele virava âncora nova, a referência
   * `debito:B` era virgem — a idempotência do gateway não barra — e saía um
   * SEGUNDO POST de R$ 7,00. Fim: duas cobranças vivas somando R$ 27,00 para uma
   * dívida de R$ 20,00, e pagar a de R$ 20,00 quitava só R$ 13,00, porque
   * `registrarCobrancaDeDebito` zerava o `debito_agrupado_em` de B (P-6) e
   * quebrava a cascata da primeira cobrança.
   *
   * Qual mutação este teste mata: `levantarDebito` não selecionar
   * `debito_agrupado_em` (ou o laço tratar ciclo agrupado como ciclo solto). Os
   * oráculos são a CONTAGEM e o VALOR dos POSTs entre as duas chamadas, mais o
   * estado das duas linhas: um retorno correto na segunda chamada é
   * perfeitamente compatível com a cobrança extra tendo sido criada ao lado.
   */
  it("reentrada do gate não emite segunda cobrança pelo ciclo agrupado", async () => {
    await assinaturaCancelada();
    const ancora = await cicloDevido(1300, 90);
    const agrupado = await cicloDevido(700, 60);
    const { chamadas } = instalarGateway({
      antiga: { status: "OVERDUE", valorReais: 20 },
    });

    const primeira = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(20);
    expect(primeira.debito?.valorCentavos).toBe(2000);

    // A clínica recarrega a tela: o MESMO débito, decidido de novo do zero.
    const segunda = await iniciarAtivacaoAssinatura(ctx, formulario());

    // O oráculo: nenhum POST novo. Total continua UM entre as duas chamadas.
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(segunda.debito?.cobrancas).toHaveLength(1);
    expect(segunda.debito?.cobrancas[0]!.providerChargeId).toBe(
      ID_COBRANCA_DEBITO,
    );
    expect(segunda.debito?.cobrancas[0]!.reaproveitada).toBe(true);
    // E o valor é o da cobrança inteira, não o da linha da âncora.
    expect(segunda.debito?.cobrancas[0]!.valorCentavos).toBe(2000);
    expect(segunda.debito?.valorCentavos).toBe(2000);

    // O banco: o agrupamento da primeira volta sobreviveu intacto, que é o que
    // faz a cascata quitar os dois quando a clínica pagar.
    const ciclos = await lerCiclos();
    expect(ciclos.find((c) => c.id === ancora)!.provider_charge_id).toBe(
      ID_COBRANCA_DEBITO,
    );
    expect(
      ciclos.find((c) => c.id === agrupado)!.provider_charge_id,
    ).toBeNull();
    expect(ciclos.find((c) => c.id === agrupado)!.debito_agrupado_em).toBe(
      ancora,
    );
    expect(await statusAssinatura()).toBe("canceled");

    // Prova final: uma cobrança paga quita a dívida INTEIRA. Com a segunda
    // cobrança viva, pagar a de R$ 20,00 deixaria o ciclo de R$ 7,00 devendo.
    await conciliarPagamentoDeCiclo(ID_COBRANCA_DEBITO, "paga");
    expect((await lerCiclos()).map((c) => c.status)).toEqual(["pago", "pago"]);
  });

  /**
   * #310 (D-4) — o débito é RECOMPUTADO depois de uma liquidação no gate.
   *
   * Qual mutação este teste mata: iterar o SNAPSHOT de `levantarDebito` e montar
   * o conjunto (b) com ele. A cobrança da âncora volta `RECEIVED`,
   * `conciliarPagamentoDeCiclo` liquida a âncora **e o agrupado** pela cascata —
   * mas o agrupado já estava na lista, e viraria um POST por um ciclo que acabou
   * de ficar `pago`. O oráculo é o VALOR do POST (R$ 9,00, só o ciclo solto):
   * a contagem sozinha não pega, porque o POST do ciclo solto existe nos dois
   * mundos e só o valor denuncia o agrupado embarcado nele.
   */
  it("ciclo agrupado liquidado pela cascata sai do débito antes de virar cobrança", async () => {
    await assinaturaCancelada();
    const ancora = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const agrupado = await cicloDevido(700, 60);
    await owner`
      UPDATE billing_cycle SET debito_agrupado_em = ${ancora}
       WHERE id = ${agrupado}`;
    const solto = await cicloDevido(900, 30);
    const { chamadas } = instalarGateway({
      antiga: { status: "RECEIVED", valorReais: 20 },
    });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(9);
    expect(r.debito?.valorCentavos).toBe(900);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_DEBITO);

    const ciclos = await lerCiclos();
    expect(ciclos.find((c) => c.id === ancora)!.status).toBe("pago");
    expect(ciclos.find((c) => c.id === agrupado)!.status).toBe("pago");
    // O agrupado não pode ter sido reapontado nem recebido cobrança: ele já
    // estava quitado quando a cobrança do ciclo solto foi emitida.
    expect(
      ciclos.find((c) => c.id === agrupado)!.provider_charge_id,
    ).toBeNull();
    expect(ciclos.find((c) => c.id === solto)!.provider_charge_id).toBe(
      ID_COBRANCA_DEBITO,
    );
    expect(ciclos.find((c) => c.id === solto)!.status).toBe("devido");
  });

  /**
   * #310 — "não reaproveitável" NÃO é "não pagável pelo cliente".
   *
   * Qual mutação este teste mata: mandar o ciclo para o conjunto (b) em
   * qualquer motivo de "morta" que não seja o 404. `DUNNING_REQUESTED` vira
   * `em_cobranca_terceirizada` — cobrança que a gente não reapresenta, mas que o
   * pagador CONTINUA podendo pagar pelo trilho da recuperação. Consolidar por
   * cima dela emite uma segunda cobrança sobre uma viva, que é a cobrança dupla
   * que a #310 existe para fechar. O status é escolhido de propósito fora do
   * `REFUNDED`/`deleted` óbvio: é o motivo em que "não reaproveitável" e "não
   * pagável" mais claramente divergem.
   *
   * O débito é MISTO de propósito — a cobrança viva de R$ 13,00 mais um ciclo de
   * R$ 7,00 sem cobrança nenhuma —, e sem essa segunda linha o caso não mede
   * nada: com um ciclo só, mandá-lo para (b) mantendo o id também termina em
   * `bloqueado/cobranca_irrecuperavel` (não há âncora de referência virgem), e
   * os dois comportamentos ficam indistinguíveis. Com o ciclo virgem na mesa é
   * que a diferença aparece: ele viraria âncora e sairia um POST de R$ 20,00 —
   * a segunda cobrança por cima da viva.
   *
   * Os oráculos são independentes de propósito: a copy certa é compatível com um
   * POST tendo saído ao lado, e zero POST é compatível com a assinatura já
   * reaberta.
   */
  it("cobrança existente e não reaproveitável barra, sem consolidar por cima", async () => {
    await assinaturaCancelada();
    const comCobranca = await cicloDevidoComCobranca(
      1300,
      90,
      ID_COBRANCA_ANTIGA,
    );
    const virgem = await cicloDevido(700, 30);
    const { chamadas } = instalarGateway({
      antiga: { status: "DUNNING_REQUESTED" },
    });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.error).toMatch(/revisão manual/i);
    expect(r.error).toMatch(/informando o CNPJ da clínica/i);
    expect(r.debito).toBeUndefined();
    expect(emissoes(chamadas)).toHaveLength(0);
    expect(
      chamadas.filter((c) => c.url.includes("/pix/automatic/authorizations")),
    ).toHaveLength(0);
    expect(await statusAssinatura()).toBe("canceled");

    const ciclos = await lerCiclos();
    expect(ciclos.find((c) => c.id === comCobranca)!.status).toBe("devido");
    expect(ciclos.find((c) => c.id === comCobranca)!.provider_charge_id).toBe(
      ID_COBRANCA_ANTIGA,
    );
    // O ciclo virgem não foi tocado: nada de virar âncora de uma cobrança nova
    // que somaria a dívida da cobrança viva.
    expect(ciclos.find((c) => c.id === virgem)!.status).toBe("devido");
    expect(ciclos.find((c) => c.id === virgem)!.provider_charge_id).toBeNull();
    expect(ciclos.find((c) => c.id === virgem)!.debito_agrupado_em).toBeNull();
  });

  /**
   * #310 — cobrança REMOVIDA no painel bloqueia de propósito.
   *
   * Qual mutação este teste mata: soltar o `provider_charge_id` (como o 404 faz)
   * para os demais motivos de "morta". Aqui a cobrança EXISTE no gateway, e a
   * idempotência do adapter é por `externalReference`: emitir `debito:<âncora>`
   * de novo pode devolver a MESMA cobrança deletada — e se devolve ou não NÃO
   * está medido. Entre supor e barrar, revisão humana é o desfecho honesto.
   *
   * Asserir que o id continua na linha é o que separa este ramo do 404: os dois
   * "não reaproveitam", e só o id no banco mostra qual regra rodou. O ciclo
   * virgem ao lado é o que torna o zero-POST observável — ver o caso anterior.
   */
  it("cobrança removida no painel bloqueia e mantém o id na linha do ciclo", async () => {
    await assinaturaCancelada();
    const removida = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const virgem = await cicloDevido(700, 30);
    const { chamadas } = instalarGateway({
      antiga: { status: "PENDING", deleted: true },
    });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.error).toMatch(/revisão manual/i);
    expect(emissoes(chamadas)).toHaveLength(0);
    expect(await statusAssinatura()).toBe("canceled");

    const ciclos = await lerCiclos();
    expect(ciclos.find((c) => c.id === removida)!.status).toBe("devido");
    expect(ciclos.find((c) => c.id === removida)!.provider_charge_id).toBe(
      ID_COBRANCA_ANTIGA,
    );
    expect(ciclos.find((c) => c.id === virgem)!.provider_charge_id).toBeNull();
  });

  /**
   * #310 — o valor apresentado é o do GATEWAY, não o da linha da âncora.
   *
   * Qual mutação este teste mata: usar `ciclo.valorCentavos` na cobrança
   * reaproveitada. A cobrança viva foi consolidada sobre dois ciclos e vale
   * R$ 20,00; a linha da âncora vale R$ 13,00. Com o valor da linha, a tela
   * mostraria R$ 13,00 num QR de R$ 20,00 e a copy "pagar todas quita o total
   * de {total}" ficaria factualmente falsa — a clínica pagaria e continuaria
   * barrada sem entender por quê.
   *
   * Os dois valores são DIFERENTES de propósito: com o `valorReais` igual ao da
   * linha, o caso passaria pelos dois caminhos e não mataria nada.
   */
  it("cobrança reaproveitada mostra o valor do gateway, não o da linha", async () => {
    await assinaturaCancelada();
    const ancora = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const agrupado = await cicloDevido(700, 60);
    await owner`
      UPDATE billing_cycle SET debito_agrupado_em = ${ancora}
       WHERE id = ${agrupado}`;
    const { chamadas } = instalarGateway({
      antiga: { status: "OVERDUE", valorReais: 20 },
    });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // Nada emitido: o agrupado já está coberto pela cobrança da âncora.
    expect(emissoes(chamadas)).toHaveLength(0);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.valorCentavos).toBe(2000);
    expect(r.debito?.valorCentavos).toBe(2000);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
  });

  /**
   * Qual mutação este teste mata: passar a consultar o gateway para todo mundo.
   * Quem nunca teve cobrança não tem o que consultar, e uma ida a mais por
   * ciclo é latência na porta de entrada da clínica, paga por quem não usa.
   */
  it("ciclo sem cobrança nenhuma segue o fluxo de hoje, sem consulta de reuso", async () => {
    await assinaturaCancelada();
    await cicloDevido(1300, 30);
    const { chamadas } = instalarGateway();

    await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(1);
    expect(consultasDeReuso(chamadas)).toHaveLength(0);
  });

  /**
   * #310 (D-3) — indisponibilidade é fail-closed, e o lado oposto do 404.
   *
   * Qual mutação este teste mata: tratar QUALQUER erro da consulta de reuso
   * como "cobrança morta" e seguir para (b). Ali o gate emitiria uma segunda
   * cobrança sem saber se a primeira ainda está viva — a cobrança dupla que a
   * issue existe para evitar, agora criada pelo tratamento de erro.
   *
   * Os quatro oráculos são independentes de propósito: o `error` certo é
   * compatível com um POST tendo saído ao lado, e a ausência de POST é
   * compatível com a assinatura já reaberta. Só medindo os quatro se distingue
   * "barrou" de "barrou depois de já ter feito estrago".
   */
  it("gateway fora do ar na consulta de reuso barra a reativação e não emite nada", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { httpStatus: 500 } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // A copy é a de "tente de novo", NÃO a de suporte: quem caiu num 500 tem
    // que insistir, e mandá-lo abrir chamado é ruído. Asserir o texto que só
    // `gateway_indisponivel` produz também separa este ramo do `catch` genérico
    // de `logic.ts`, que diria "Fale com o suporte".
    expect(r.error).toMatch(/tente novamente em alguns instantes/i);
    expect(r.debito).toBeUndefined();
    expect(r.autorizacao).toBeUndefined();
    expect(emissoes(chamadas)).toHaveLength(0);
    expect(
      chamadas.filter((c) => c.url.includes("/pix/automatic/authorizations")),
    ).toHaveLength(0);

    // A dívida sobrevive intacta, com o id antigo, para a próxima tentativa
    // reabrir a decisão. Bloqueio é reversível; cobrança dupla não é.
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("devido");
    expect(ciclo!.provider_charge_id).toBe(ID_COBRANCA_ANTIGA);
    expect(await statusAssinatura()).toBe("canceled");
  });

  /**
   * #310 (D-3) — o OUTRO lado: 404 é cobrança morta, não indisponibilidade.
   *
   * Qual mutação este teste mata: tratar o 404 como o 500 e devolver
   * `bloqueado`. Um id órfão — cobrança apagada no painel, chave de ambiente
   * trocada — trancaria a clínica fora para sempre por algo que ninguém
   * consegue pagar. Sem este caso, o teste do 500 acima passaria igual se
   * alguém trocasse um ramo pelo outro.
   *
   * Mata também a variante que manda o ciclo para (b) SEM soltar o id órfão:
   * ali `emitirConsolidada` não acharia âncora de referência virgem (P-4),
   * devolveria `irrecuperavel`, e a clínica cairia em "fale com o suporte" —
   * o mesmo trancar-fora, uma etapa adiante.
   */
  it("id que o gateway não reconhece vira cobrança nova, sem barrar", async () => {
    await assinaturaCancelada();
    const ciclo = await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { httpStatus: 404 } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.error).toBeUndefined();
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(13);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.reaproveitada).toBe(false);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_DEBITO);

    // O id órfão foi SUBSTITUÍDO: ele não protege ciclo nenhum (D-5 protege o
    // id REAPROVEITADO, e este não foi), e deixá-lo faria o webhook da cobrança
    // nova não achar ciclo.
    const linha = (await lerCiclos()).find((c) => c.id === ciclo)!;
    expect(linha.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    expect(linha.status).toBe("devido");
  });

  /**
   * #310 (D-4) — cobrança antiga já paga liquida o ciclo no gate.
   *
   * Qual mutação este teste mata: classificar a cobrança paga como pagável e
   * devolver o copia-e-cola de uma dívida já quitada (ou, pior, emitir outra
   * por cima dela). O webhook pode simplesmente não ter chegado ainda — mandar
   * a clínica pagar de novo é o dobro do valor pelo mesmo ciclo.
   *
   * `CONFIRMED` e não `RECEIVED` de propósito: são status DIFERENTES do Asaas e
   * os dois significam dinheiro recebido. Usar o mesmo dos outros casos deixaria
   * passar uma allow-list de pagos com um item só.
   */
  it("cobrança antiga já paga liquida o ciclo no gate e libera a reativação", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { status: "CONFIRMED" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito).toBeUndefined();
    expect(emissoes(chamadas)).toHaveLength(0);
    // Liberou de verdade: seguiu para a autorização nova e a assinatura saiu de
    // `canceled`. Sem estas duas linhas, um gate que devolvesse `bloqueado`
    // também deixaria `r.debito` indefinido e passaria vácuo.
    expect(r.autorizacao?.forma).toBe("pix_copia_e_cola");
    expect(await statusAssinatura()).toBe("setup_pending");

    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("pago");
  });

  /**
   * #310 (D-4) — o débito ENCOLHE quando parte dele já estava paga.
   *
   * Qual mutação este teste mata: seguir contando o ciclo já pago no valor da
   * cobrança consolidada (empurrá-lo para (b) em vez de conciliar e sair). A
   * clínica pagaria R$ 20,00 por uma dívida de R$ 7,00 — e o caso anterior, de
   * ciclo único, não pega isso: lá o total encolhe para ZERO e qualquer erro de
   * soma some junto. O oráculo é o VALOR do POST, não a contagem.
   */
  it("ciclo já pago sai do débito e não entra no valor da cobrança nova", async () => {
    await assinaturaCancelada();
    const jaPago = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const emAberto = await cicloDevido(700, 30);
    const { chamadas } = instalarGateway({ antiga: { status: "RECEIVED" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(7);
    expect(r.debito?.valorCentavos).toBe(700);
    expect(r.debito?.cobrancas).toHaveLength(1);

    const ciclos = await lerCiclos();
    expect(ciclos.find((c) => c.id === jaPago)!.status).toBe("pago");
    expect(ciclos.find((c) => c.id === emAberto)!.status).toBe("devido");
    // O ciclo pago NÃO pode ter sido agrupado sob a cobrança nova: seria pagar
    // R$ 7,00 e ver quitado um ciclo de R$ 13,00 que já estava quitado por fora.
    expect(ciclos.find((c) => c.id === jaPago)!.debito_agrupado_em).toBeNull();
    expect(ciclos.find((c) => c.id === jaPago)!.provider_charge_id).toBe(
      ID_COBRANCA_ANTIGA,
    );
  });

  /**
   * #310 (D-6) — instrução pendente é o sinal da janela crítica.
   *
   * Qual mutação este teste mata: ignorar as instruções de Pix Automático e
   * apresentar o copia-e-cola assim mesmo. Dentro da janela crítica (das 22h de
   * D-1 até D) o Asaas bloqueia o recebimento por outro meio: quem paga por
   * fora paga, e o débito automático cobra de novo. A existência da instrução É
   * o fato — não se calcula hora nem fuso.
   *
   * O oráculo forte é `not.toContain(BR_CODE_DEBITO)` sobre o retorno inteiro:
   * asserir só `situacao.estado` deixaria passar a variante que carimba
   * `em_processamento` e ainda anexa o código ao lado, que é justamente o
   * pagamento em duplicidade. O `emissoes = 0` mata a variante oposta, de
   * "esconder o código emitindo uma cobrança nova".
   */
  it("instrução pendente esconde o código de pagamento, sem reativar", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({
      antiga: {
        status: "OVERDUE",
        instrucoes: { SCHEDULED: [{ id: "ins_310", status: "SCHEDULED" }] },
      },
    });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
    expect(r.debito?.cobrancas[0]!.situacao).toEqual({
      estado: "em_processamento",
    });
    expect(JSON.stringify(r.debito)).not.toContain(BR_CODE_DEBITO);
    expect(JSON.stringify(r.debito)).not.toContain(URL_ANTIGA);
    expect(emissoes(chamadas)).toHaveLength(0);

    // Débito automático a caminho não é débito pago: a porta continua fechada.
    expect(r.autorizacao).toBeUndefined();
    expect(await statusAssinatura()).toBe("canceled");
  });

  /**
   * #310 — dívida quitada dentro do gate é `sem_debito`, nunca `adiado`.
   *
   * Qual mutação este teste mata: devolver `adiado/abaixo_do_piso` quando a
   * cobrança recém-emitida volta JÁ PAGA e é conciliada dentro de
   * `emitirConsolidada` (era o comportamento antes desta correção). `totalVivo`
   * é somado ANTES da emissão, então ele ainda vale R$ 13,00 depois da
   * liquidação, e as duas metades do retorno ficavam falsas: `adiado` afirma que
   * sobrou dívida para a próxima volta (o ciclo está `pago`) e `abaixo_do_piso`
   * afirma que o valor não alcançou o piso (alcançou — foi por isso que a
   * cobrança chegou a ser emitida).
   *
   * A asserção é sobre `resolverGateDeDebito` direto, e não sobre a Server
   * Action, porque os dois ramos seguem para a ativação: pela tela eles são
   * indistinguíveis, e um teste que não distingue não mata mutação nenhuma.
   */
  it("cobrança emitida que volta já paga devolve sem_debito, não adiado", async () => {
    await assinaturaCancelada();
    await cicloDevido(1300, 30);
    instalarGateway({ cobrancaJaPaga: true });

    const gate = await resolverGateDeDebito(CLINIC);

    expect(gate).toEqual({ tipo: "sem_debito" });
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("pago");
  });

  /**
   * #310 (revisão do PR #339, achado 1) — ESCRITA PARCIAL no registro da
   * cobrança não pode virar uma segunda cobrança na reentrada.
   *
   * `registrarCobrancaDeDebito` faz DUAS escritas: grava a cobrança na âncora e
   * carimba `debito_agrupado_em` nos demais. Antes desta correção elas saíam
   * fora de transação, e a da âncora ia PRIMEIRO. O processo morrendo no meio
   * deixava o pior dos dois estados: a âncora aparece reaproveitada e os
   * agrupados aparecem virgens.
   *
   * Por que isso reabre justamente o buraco que a #310 fechou: até a #310 a
   * âncora era sempre `ciclos[0]`, então a reentrada reemitia com a MESMA
   * `referenciaExterna` e a idempotência do gateway devolvia a mesma cobrança —
   * o estado parcial se autocurava. Com a âncora sendo "o mais antigo SEM
   * cobrança" (P-4), o ciclo sem carimbo vira âncora NOVA, `debito:<outro>` é
   * uma referência virgem que a idempotência não barra, e sai o segundo POST.
   *
   * Qual mutação este teste mata: tirar a transação (ou inverter só a ordem
   * das duas escritas sem atomicidade). O oráculo é a CONTAGEM de POSTs entre
   * as duas chamadas — o retorno da segunda chamada é idêntico nos dois
   * mundos, porque nos dois há uma cobrança apresentável na tela; o que muda é
   * quantas cobranças vivas ficaram no gateway.
   *
   * A prova final é o pagamento: com duas cobranças, pagar a de R$ 20,00
   * deixaria o ciclo de R$ 7,00 devendo.
   */
  it("escrita parcial do registro não vira segunda cobrança na reentrada", async () => {
    await assinaturaCancelada();
    const ancora = await cicloDevido(1300, 90);
    const agrupado = await cicloDevido(700, 60);
    const { chamadas } = instalarGateway({
      antiga: { status: "OVERDUE", valorReais: 20 },
    });

    // O processo morre ao iniciar a SEGUNDA escrita em `billing_cycle` — que é
    // exatamente o carimbo de `debito_agrupado_em` dos demais ciclos.
    armar({ falharNaEscrita: 2 });
    const primeira = await iniciarAtivacaoAssinatura(ctx, formulario());
    armar();

    // A cobrança JÁ EXISTE no gateway: o POST aconteceu antes da queda, e é
    // por isso que a reentrada não pode criar outra.
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(20);
    expect(primeira.debito).toBeUndefined();

    // A clínica tenta de novo — o caminho real depois de um erro na tela.
    const segunda = await iniciarAtivacaoAssinatura(ctx, formulario());

    // O oráculo: nenhum POST novo. Com as escritas fora de transação, a âncora
    // ficava carimbada, o agrupado virgem virava âncora de `debito:<agrupado>`
    // e saía um SEGUNDO POST de R$ 7,00 — duas cobranças vivas somando
    // R$ 27,00 para uma dívida de R$ 20,00.
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(segunda.error).toBeUndefined();
    expect(segunda.debito?.cobrancas).toHaveLength(1);
    expect(segunda.debito?.valorCentavos).toBe(2000);

    // E no banco os dois ciclos estão sob UMA cobrança só.
    const ciclos = await lerCiclos();
    const linhaAncora = ciclos.find((c) => c.id === ancora)!;
    const linhaAgrupado = ciclos.find((c) => c.id === agrupado)!;
    expect(linhaAncora.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    expect(linhaAgrupado.provider_charge_id).toBeNull();
    expect(linhaAgrupado.debito_agrupado_em).toBe(ancora);

    // Prova final: uma cobrança paga quita a dívida INTEIRA.
    await conciliarPagamentoDeCiclo(ID_COBRANCA_DEBITO, "paga");
    expect((await lerCiclos()).map((c) => c.status)).toEqual(["pago", "pago"]);
  });

  /**
   * #310 (revisão do PR #339, achado 2) — agrupado que SOBREVIVE à cascata
   * volta a ser âncora, em vez de travar o gate para sempre.
   *
   * O docblock de `resolverGateDeDebito` afirma que os agrupados de uma
   * cobrança liquidada dentro do laço entram em (b) e são retirados pela
   * recontagem, "e quem continuar `devido` no banco é cobrado". A recontagem
   * FILTRAVA o snapshot antigo em vez de reconstruí-lo: o sobrevivente
   * continuava com `agrupadoEm` apontando para uma âncora agora `pago`,
   * `emitirConsolidada` exige `!c.agrupadoEm` para a âncora (P-4), não achava
   * nenhuma e devolvia `irrecuperavel` — `bloqueado/cobranca_irrecuperavel`
   * PERMANENTE, porque toda reentrada repete a mesma conta.
   *
   * A cascata que não alcança é injetada de propósito: é a premissa que o
   * docblock descreve, e sem ela não há como distinguir a defesa que ele
   * promete da que o código tinha.
   *
   * Qual mutação este teste mata: voltar ao `filter` sobre o snapshot. Os
   * oráculos são o POST (que não existia) e a ausência da copy de suporte —
   * asserir só o `r.debito` deixaria passar um gate que barra em silêncio.
   */
  it("agrupado que a cascata não alcançou volta a ser âncora, sem travar o gate", async () => {
    await assinaturaCancelada();
    const ancora = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const sobrevivente = await cicloDevido(700, 60);
    await owner`
      UPDATE billing_cycle SET debito_agrupado_em = ${ancora}
       WHERE id = ${sobrevivente}`;
    const { chamadas } = instalarGateway({
      antiga: { status: "RECEIVED", valorReais: 20 },
    });

    // A 1ª escrita em `billing_cycle` é a âncora virando `pago`; a 2ª é a
    // cascata do agrupado. Engolir a 2ª é a cascata que não alcança.
    armar({ neutralizar: 2 });
    const r = await iniciarAtivacaoAssinatura(ctx, formulario());
    armar();

    // A âncora foi liquidada e o agrupado NÃO — o estado que o docblock prevê.
    const ciclos = await lerCiclos();
    expect(ciclos.find((c) => c.id === ancora)!.status).toBe("pago");

    // O que a correção garante: a dívida sobrevivente É cobrada, por uma âncora
    // de referência virgem. Antes, o gate devolvia "revisão manual" para sempre.
    expect(r.error).toBeUndefined();
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(7);
    expect(r.debito?.valorCentavos).toBe(700);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_DEBITO);

    const depois = await lerCiclos();
    const linha = depois.find((c) => c.id === sobrevivente)!;
    expect(linha.status).toBe("devido");
    expect(linha.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    // Ponteiro morto zerado no banco (P-6): mantê-lo faria a cascata da âncora
    // já paga liquidar este ciclo de graça numa reentrega do webhook.
    expect(linha.debito_agrupado_em).toBeNull();
  });

  /**
   * #310 (revisão do PR #339, achado 3) — o total exibido é o que está NA MESA.
   *
   * Com a cobrança consolidada voltando ESTORNADA e uma cobrança viva ao lado,
   * o gate segue apresentando a viva (melhor pagar o pagável do que barrar
   * tudo) — mas o total não pode continuar sendo a dívida inteira. A tela
   * renderiza "Esta cobrança é de {total}" com uma cobrança só: com o total da
   * dívida, ela afirmaria que o QR de R$ 13,00 é de R$ 20,00. É o estado que o
   * docblock de `CobrancaParaReuso.valorCentavos` proíbe, montado uma camada
   * acima.
   *
   * Qual mutação este teste mata: devolver `totalVivo` em `totalCentavos`. Os
   * dois valores são diferentes de propósito — com a dívida inteira igual à
   * soma das cobranças o caso passaria pelos dois caminhos e não mataria nada.
   *
   * O `residuoCentavos` é asserido JUNTO porque a alternativa "sumir com o
   * resíduo" também acertaria o total e deixaria a clínica achando que pagar
   * aquele QR quita tudo.
   */
  it("total exibido é a soma das cobranças na mesa, com o resíduo à parte", async () => {
    await assinaturaCancelada();
    const viva = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const semCobranca = await cicloDevido(700, 30);
    const { chamadas } = instalarGateway({
      antiga: { status: "OVERDUE" },
      cobrancaEstornada: true,
    });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // A emissão aconteceu e voltou estornada: nada dela vai para a tela.
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
    expect(r.debito?.cobrancas[0]!.valorCentavos).toBe(1300);

    // O ponto: o total é o que a clínica consegue pagar nesta tela.
    expect(r.debito?.valorCentavos).toBe(1300);
    // ...e o que sobrou é dito, não escondido.
    expect(r.debito?.residuoCentavos).toBe(700);

    // A dívida residual continua viva no banco — não foi perdoada.
    const ciclos = await lerCiclos();
    expect(ciclos.find((c) => c.id === semCobranca)!.status).toBe("devido");
    expect(ciclos.find((c) => c.id === viva)!.status).toBe("devido");
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
