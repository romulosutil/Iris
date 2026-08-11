/**
 * #36 / D30 — a ativação nunca enviava o documento do titular ao gateway.
 *
 * O Asaas exige `cpfCnpj` para criar o cliente do Pix Automático; o campo era
 * opcional em `PedidoAtivacao`, `logic.ts` nunca o preenchia e `clinic` sequer
 * tinha coluna de documento. Resultado medido em produção (10/08): duas
 * assinaturas, nenhuma `active` — a ativação morria num 400 antes de qualquer
 * QR Code existir.
 *
 * O oráculo é duplo e nenhum dos dois é o retorno da função:
 *  1. a COLUNA `clinic.cpf_cnpj` relida pela role dona (a escrita passa por uma
 *     função SECURITY DEFINER — asserir `{ }` de volta deixaria "gravou" e
 *     "foi barrado em silêncio pela RLS" indistinguíveis, que é exatamente o
 *     bug #212);
 *  2. o CORPO que saiu no `POST /customers` — é o elo que estava faltando.
 *
 * Roda com `pnpm test:rls`. Gate de env em `db/tests/integration-env.ts`.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
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
const { sql: appSql } = await import("@/db/client");

const CLINIC = "00000000-0000-0000-0000-000000036aaa";
const U_COORD = "00000000-0000-0000-0000-000000036c01";

const CNPJ_MASCARADO = "29.811.201/0001-50";
const CNPJ_DIGITOS = "29811201000150";

const ID_CLIENTE = "cus_000008561913";
const ID_AUTORIZACAO = "b7a1c0de-0000-4000-8000-000000000036";

let owner: ReturnType<typeof postgres>;

const ctx = { role: "coordenador", userId: U_COORD, clinicId: CLINIC } as never;

function formulario(documento: string): FormData {
  const fd = new FormData();
  fd.set("cpfCnpj", documento);
  return fd;
}

/** Estado real da coluna, lido pela role DONA (bypassa RLS) — o oráculo. */
async function documentoGravado(): Promise<string | null> {
  const [row] = await owner<
    { cpf_cnpj: string | null }[]
  >`SELECT cpf_cnpj FROM clinic WHERE id = ${CLINIC}`;
  return row!.cpf_cnpj;
}

/** URLs chamadas e corpos enviados, para provar o que chegou ao adapter. */
type Chamada = { url: string; corpo: Record<string, unknown> };

function instalarGateway(opcoes: { autorizacaoFalha?: boolean } = {}): {
  chamadas: Chamada[];
} {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (entrada: unknown, init?: RequestInit) => {
    const url = String(entrada);
    chamadas.push({
      url,
      corpo:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {},
    });
    if (url.includes("/customers")) {
      return Response.json({ id: ID_CLIENTE });
    }
    if (url.includes("/pix/automatic/authorizations")) {
      if (opcoes.autorizacaoFalha) {
        return Response.json(
          { errors: [{ description: "gateway indisponível" }] },
          { status: 500 },
        );
      }
      return Response.json({
        id: ID_AUTORIZACAO,
        status: "AWAITING_PAYMENT",
        payload: "00020126…iris-36",
        customerId: ID_CLIENTE,
      });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
  return { chamadas };
}

describe.skipIf(!hasDb)("#36 · ativação envia o CPF/CNPJ ao gateway", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
    await owner`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord #36', 'coord@i36.test')`;
    await owner`INSERT INTO clinic (id, nome, responsavel_conta_id) VALUES
      (${CLINIC}, 'Clínica #36', ${U_COORD})`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador')`;

    vi.stubEnv("BILLING_PROVIDER", "asaas");
    vi.stubEnv("BILLING_PROVIDER_API_KEY", "chave-api-de-teste-do-asaas-36");
    vi.stubEnv("ASAAS_BASE_URL", "https://api-sandbox.asaas.com/v3");
  });

  // Cada teste começa com a coluna vazia: sem isto, o 3º passaria com a
  // gravação do 2º e não provaria a própria escrita.
  afterEach(async () => {
    vi.unstubAllGlobals();
    await owner`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
    await owner`UPDATE clinic SET cpf_cnpj = NULL WHERE id = ${CLINIC}`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
    vi.unstubAllEnvs();
  });

  it("documento inválido não chega ao gateway nem à coluna", async () => {
    const { chamadas } = instalarGateway();

    const r = await iniciarAtivacaoAssinatura(
      ctx,
      formulario("111.111.111-11"),
    );

    expect(r.error).toBeTruthy();
    expect(r.autorizacao).toBeUndefined();
    // Repopula o campo com o que foi digitado, máscara inclusa.
    expect(r.documento).toBe("111.111.111-11");
    // O ponto da tarefa: ZERO round-trip com o gateway.
    expect(chamadas).toHaveLength(0);
    expect(await documentoGravado()).toBeNull();
  });

  it("documento válido é gravado na clínica e sobe no corpo do gateway", async () => {
    const { chamadas } = instalarGateway();

    const r = await iniciarAtivacaoAssinatura(ctx, formulario(CNPJ_MASCARADO));

    expect(r.error).toBeUndefined();
    expect(r.autorizacao?.forma).toBe("pix_copia_e_cola");

    // 1º oráculo: a coluna, relida pela dona. Só dígitos.
    expect(await documentoGravado()).toBe(CNPJ_DIGITOS);

    // 2º oráculo: o elo que faltava — o documento no corpo do POST /customers.
    const criacaoCliente = chamadas.find((c) => c.url.includes("/customers"));
    expect(criacaoCliente).toBeDefined();
    expect(criacaoCliente!.corpo.cpfCnpj).toBe(CNPJ_DIGITOS);
  });

  it("falha do gateway não perde o documento já gravado", async () => {
    instalarGateway({ autorizacaoFalha: true });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario(CNPJ_MASCARADO));

    expect(r.error).toContain("Não foi possível abrir o pagamento");
    expect(r.autorizacao).toBeUndefined();
    // Gravar ANTES do gateway existe para isto: a retentativa não pede de novo.
    expect(await documentoGravado()).toBe(CNPJ_DIGITOS);
    expect(r.documento).toBe(CNPJ_MASCARADO);
  });
});
