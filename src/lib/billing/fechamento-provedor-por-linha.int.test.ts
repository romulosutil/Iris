import { sql } from "drizzle-orm";
import postgres from "postgres";
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
 * O segundo gateway é um provedor FAKE, não o Mercado Pago (T14 de #36).
 *
 * O invariante é "o adapter sai da LINHA, não da env" — ele não fala do MP.
 * Registrar o fake em `getProviderPorId` mantém a prova viva depois que o
 * adapter do MP for deletado (D24), sem afrouxar nada: o outro trilho da mesma
 * passada continua sendo o Asaas real.
 */
vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE ? new ProvedorFake() : real.getProviderPorId(id),
  };
});

const { authDb } = await import("@/db/client");
const { fecharCiclosVencendo } = await import("./subscription");

/**
 * `fecharCiclosVencendo` × GATEWAY DA LINHA (D26).
 *
 * O job resolvia o adapter uma vez, no topo, com `getBillingProvider()` — ou
 * seja, pela env — e o `select` das assinaturas vencendo nem lia
 * `subscription.provider`. Depois de uma virada de trilho, uma assinatura ativa
 * nascida no gateway anterior teria o vínculo dela mandado para o
 * `emitirCobrancaDeCiclo` do **Asaas**, que começa consultando
 * `GET /pix/automatic/authorizations/{id}` — id que não existe naquela conta.
 *
 * É o gêmeo do D25 e tem o modo de falha PIOR: o D25 estoura na tela, na frente
 * da clínica; este estoura dentro do job noturno, o ciclo fica com `erro`
 * preenchido, e **ninguém é cobrado**. Perda de faturamento silenciosa.
 *
 * O oráculo é a URL efetivamente chamada por assinatura. Asserir só
 * `cobrancaEmitida: true` seria fraco: o dublê responde 200 para qualquer coisa,
 * então a emissão "dá certo" mesmo saindo pelo gateway errado.
 *
 * As duas assinaturas são fechadas na MESMA passada de propósito — o caso não é
 * "o job respeita a env do momento", é "o job cobre gateways diferentes ao mesmo
 * tempo". Uma só, com a env combinando, passaria por acidente.
 */

const API_KEY_ASAAS = "chave-api-de-teste-do-asaas-d26";
const BASE_URL_ASAAS = "https://api-sandbox.asaas.com/v3";

/** Vínculo no gateway anterior: 32 hex sem hífen. */
const VINCULO_FAKE = "0282b43596914b36a7bda8a8a3d85c57";
/** Autorização de Pix Automático do Asaas: UUID. */
const VINCULO_ASAAS = "53da5204-8dd1-4cf4-9604-d134e1e6fe04";

const ID_COBRANCA_FAKE = "cob_fake_0001";
const ID_COBRANCA_ASAAS = "pay_000000000001";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

const clinicasCriadas: string[] = [];

/**
 * Assinatura ATIVA com o ciclo já vencido — a condição que `fecharCiclosVencendo`
 * seleciona (`status='active'` e `ciclo_atual_fim <= agora`).
 *
 * O paciente é criado DENTRO da janela do ciclo porque a apuração precisa
 * devolver ao menos 1: ciclo de valor zero é fechado como `pago` sem tocar o
 * gateway, e o teste passaria sem provar nada — verde por não ter chamado
 * ninguém.
 */
async function novaAssinaturaVencida(opcoes: {
  provider: string;
  providerSubscriptionId: string;
  inicio: Date;
  fim: Date;
}): Promise<string> {
  const [clinica] = await owner!`
    INSERT INTO clinic (nome) VALUES (${`Clinica D26 ${crypto.randomUUID()}`})
    RETURNING id`;
  const clinicId = clinica!.id as string;
  clinicasCriadas.push(clinicId);

  await owner!`
    INSERT INTO subscription
      (clinic_id, status, provider, provider_subscription_id,
       ciclo_atual_inicio, ciclo_atual_fim, ciclo_dias)
    VALUES (
      ${clinicId}, 'active'::subscription_status,
      ${opcoes.provider}, ${opcoes.providerSubscriptionId},
      ${opcoes.inicio}, ${opcoes.fim}, 30
    )`;

  const dentro = new Date((opcoes.inicio.getTime() + opcoes.fim.getTime()) / 2);
  await owner!`
    INSERT INTO patient (clinic_id, nome, criado_em)
    VALUES (${clinicId}, 'Paciente do ciclo', ${dentro})`;

  return clinicId;
}

// ── Dublê do gateway ─────────────────────────────────────────────────────────

let chamadasGateway: string[] = [];
/**
 * Corpos dos POSTs, para que o FORMATO do que sai daqui seja verificável — a
 * URL sozinha não diz o que foi enviado.
 */
let corposGateway: Array<{ url: string; corpo: Record<string, unknown> }> = [];

function instalarGateway(): void {
  vi.stubGlobal("fetch", async (entrada: unknown, init?: RequestInit) => {
    const url = String(entrada);
    chamadasGateway.push(url);
    if (typeof init?.body === "string") {
      corposGateway.push({
        url,
        corpo: JSON.parse(init.body) as Record<string, unknown>,
      });
    }

    // Gateway FAKE (o outro trilho): emissão de cobrança no dialeto dele.
    if (url.startsWith(`${BASE_URL_FAKE}/cobrancas`)) {
      return Response.json({ id: ID_COBRANCA_FAKE, estado: "PENDENTE" });
    }
    // Asaas: busca de idempotência por `externalReference` (nenhuma cobrança
    // anterior neste teste), leitura da autorização e emissão.
    if (url.includes("/payments?") || url.includes("externalReference")) {
      return Response.json({ data: [] });
    }
    if (url.includes("/pix/automatic/authorizations/")) {
      return Response.json({
        id: VINCULO_ASAAS,
        status: "ACTIVE",
        customerId: "cus_000008561913",
      });
    }
    if (url.includes(`${BASE_URL_ASAAS}/payments`)) {
      return Response.json({ id: ID_COBRANCA_ASAAS, status: "PENDING" });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

/** Só as chamadas que identificam o gateway usado para EMITIR a cobrança. */
function urlsDe(assinatura: "asaas" | "fake"): string[] {
  return assinatura === "asaas"
    ? chamadasGateway.filter((u) => u.startsWith(BASE_URL_ASAAS))
    : chamadasGateway.filter((u) => u.startsWith(BASE_URL_FAKE));
}

describe.skipIf(!hasDb)("fecharCiclosVencendo × provider da linha", () => {
  beforeAll(() => {
    vi.stubEnv("BILLING_PROVIDER_API_KEY", API_KEY_ASAAS);
    vi.stubEnv("ASAAS_BASE_URL", BASE_URL_ASAAS);
    // O trilho ATIVO é o Asaas — é exatamente sob esta env que a assinatura
    // legada do outro gateway não pode ser cobrada no Asaas.
    vi.stubEnv("BILLING_PROVIDER", "asaas");
  });

  beforeEach(async () => {
    chamadasGateway = [];
    corposGateway = [];
    instalarGateway();
    await owner!`TRUNCATE audit_log, billing_cycle, subscription, patient
                 RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (owner) {
      await owner`TRUNCATE audit_log, billing_cycle, subscription, patient
                  RESTART IDENTITY CASCADE`;
      if (clinicasCriadas.length > 0) {
        await owner`DELETE FROM clinic WHERE id = ANY(${clinicasCriadas}::uuid[])`;
      }
      await owner.end();
    }
    vi.unstubAllEnvs();
  });

  it("cobra cada assinatura no gateway em que ela nasceu, na mesma passada", async () => {
    const fim = new Date("2026-08-01T00:00:00Z");
    const inicio = new Date("2026-07-02T00:00:00Z");

    const clinicaFake = await novaAssinaturaVencida({
      provider: ID_PROVEDOR_FAKE,
      providerSubscriptionId: VINCULO_FAKE,
      inicio,
      fim,
    });
    const clinicaAsaas = await novaAssinaturaVencida({
      provider: "asaas",
      providerSubscriptionId: VINCULO_ASAAS,
      inicio,
      fim,
    });

    const resultados = await fecharCiclosVencendo({
      agora: new Date("2026-08-02T03:00:00Z"),
    });

    // As duas foram fechadas e cobradas — nenhuma caiu em `erro`.
    expect(resultados).toHaveLength(2);
    for (const r of resultados) {
      expect(r.erro).toBeUndefined();
      expect(r.cobrancaEmitida).toBe(true);
    }

    // O bug em uma linha: o id do outro gateway indo para a API do Asaas.
    expect(
      chamadasGateway.some((u) =>
        u.includes(`/pix/automatic/authorizations/${VINCULO_FAKE}`),
      ),
    ).toBe(false);

    // Cada gateway foi de fato acionado — o negativo acima passaria sozinho se
    // o job simplesmente não tivesse cobrado ninguém.
    expect(urlsDe("fake").length).toBeGreaterThan(0);
    expect(urlsDe("asaas").length).toBeGreaterThan(0);

    // E a autorização consultada no Asaas foi a do vínculo ASAAS, não outra.
    expect(
      chamadasGateway.some((u) =>
        u.includes(`/pix/automatic/authorizations/${VINCULO_ASAAS}`),
      ),
    ).toBe(true);

    // Cada ciclo guardou o id devolvido pelo SEU gateway. A coluna sozinha não
    // seria oráculo suficiente (ver docblock), mas cruzada com as URLs ela fecha
    // a prova de que a emissão certa foi a que gravou.
    //
    // O filtro por `inicio` não é cosmético: ao fechar, a função já abre o ciclo
    // SEGUINTE, então cada clínica tem duas linhas em `billing_cycle` e a nova
    // tem `provider_charge_id` NULL de direito.
    const cobrancas = await authDb.execute(
      sql`SELECT id, clinic_id, provider_charge_id FROM billing_cycle
          WHERE inicio = ${inicio.toISOString()}::timestamptz`,
    );
    const linhas = cobrancas as unknown as {
      id: string;
      clinic_id: string;
      provider_charge_id: string | null;
    }[];
    const porClinica = new Map(
      linhas.map((l) => [l.clinic_id, l.provider_charge_id]),
    );
    expect(porClinica.get(clinicaFake)).toBe(ID_COBRANCA_FAKE);
    expect(porClinica.get(clinicaAsaas)).toBe(ID_COBRANCA_ASAAS);

    /**
     * O FORMATO da referência que saiu na cobrança (#289).
     *
     * `externalReference` é o discriminador que o webhook usa para decidir se
     * uma cobrança sem ciclo é alarme ou o desfecho esperado da ativação. Sem
     * oráculo aqui, mudar o formato emitido — perder o prefixo, trocar `cycle:`
     * por outra coisa, mandar só o id — passa verde em todo o repo, e o efeito
     * só aparece meses depois, no webhook, como mensalidade classificada de
     * "cobrança fora do ciclo (referência externa de terceiro)": o alarme
     * calado, que é o defeito que a #289 fechou.
     *
     * Literal `cycle:`, e NÃO `PREFIXO_REFERENCIA_CICLO` importado: comparar a
     * constante com ela mesma acompanharia qualquer mudança e não travaria
     * nada. É este literal que tem que ser mudado à mão junto com o predicado
     * da consulta de não conciliadas, se um dia o formato mudar de verdade.
     */
    const cicloAsaas = linhas.find((l) => l.clinic_id === clinicaAsaas)!;
    const emissaoAsaas = corposGateway.find((c) =>
      c.url.startsWith(`${BASE_URL_ASAAS}/payments`),
    );
    expect(emissaoAsaas).toBeDefined();
    expect(emissaoAsaas!.corpo.externalReference).toBe(
      `cycle:${cicloAsaas.id}`,
    );
  });
});
