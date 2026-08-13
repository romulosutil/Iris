/**
 * #262 — `salvarDadosClinica` / `lerDadosClinica` (Dados da Clínica).
 *
 * O oráculo é a role DONA (MIGRATION_DATABASE_URL, bypassa RLS) relendo
 * `clinic` e `audit_log` depois de cada chamada — asserir só `{ ok: true }`
 * foi exatamente o que deixou o no-op da #212 passar.
 *
 * O gateway é mockado no factory `getProviderPorId` (objeto plano, NUNCA
 * arrow-como-construtor — família de bug #154): o teste do caminho de sync
 * asserta que o mock FOI chamado, e o do skip que NÃO foi.
 *
 * Roda com `pnpm test:rls`. Gate de env em `db/tests/integration-env.ts`.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

const { mockAtualizarCliente } = vi.hoisted(() => ({
  mockAtualizarCliente: vi.fn<(i: unknown) => Promise<void>>(),
}));

// Mock do factory: devolve objeto plano com o vi.fn controlável. `new` não é
// usado pelo código sob teste (o factory encapsula a construção).
vi.mock("@/lib/billing/provider", () => ({
  getProviderPorId: (id: string) => ({
    id,
    atualizarCliente: mockAtualizarCliente,
  }),
}));

// Neutraliza o side-effect de `server-only` e importa só o núcleo
// ctx-accepting (o wrapper `"use server"` vive em ./actions).
vi.mock("server-only", () => ({}));
const { salvarDadosClinica, lerDadosClinica } = await import("./logic");
const { sql: appSql } = await import("@/db/client");

const CLINIC_A = "00000000-0000-0000-0000-0000000262aa";
const CLINIC_B = "00000000-0000-0000-0000-0000000262bb";
const U_COORD_A = "00000000-0000-0000-0000-0000000262c1";
const U_TER_A = "00000000-0000-0000-0000-0000000262e1";
const U_COORD_B = "00000000-0000-0000-0000-0000000262c2";
const SUB_A = "00000000-0000-0000-0000-0000000262f1";
const CYCLE_A = "00000000-0000-0000-0000-0000000262f2";

// Validados contra src/lib/documento.ts (Módulo 11): CPF e CNPJ de exemplo
// canônicos, dígitos verificadores corretos.
const CPF_VALIDO = "52998224725";
const CNPJ_VALIDO = "11222333000181";
const CPF_INVALIDO = "52998224726"; // último dígito verificador errado

const PAYLOAD = {
  razaoSocial: "Clínica A Serviços Terapêuticos Ltda",
  cpfCnpj: "529.982.247-25",
  logradouro: "Rua das Acácias",
  numero: "123",
  complemento: "Sala 4",
  bairro: "Centro",
  cidade: "São Paulo",
  uf: "sp",
  cep: "01310-100",
  emailFinanceiro: "financeiro@clinica-a.test",
};

let owner: ReturnType<typeof postgres>;

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as never;

/** Estado real da linha, lido pela role DONA (bypassa RLS) — o oráculo. */
async function estado(clinicId: string) {
  const [row] = await owner<
    {
      razao_social: string | null;
      cpf_cnpj: string | null;
      endereco_logradouro: string | null;
      endereco_numero: string | null;
      endereco_complemento: string | null;
      endereco_bairro: string | null;
      endereco_cidade: string | null;
      endereco_uf: string | null;
      endereco_cep: string | null;
      email_financeiro: string | null;
    }[]
  >`SELECT razao_social, cpf_cnpj,
           endereco_logradouro, endereco_numero, endereco_complemento,
           endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
           email_financeiro
      FROM clinic WHERE id = ${clinicId}`;
  return row!;
}

async function auditCount(clinicId: string) {
  const [row] = await owner<{ n: string }[]>`
    SELECT count(*)::text AS n FROM audit_log
     WHERE clinic_id = ${clinicId}
       AND acao = 'dados_clinica_atualizados'`;
  return Number(row!.n);
}

describe.skipIf(!hasDb)("#262 · dados cadastrais da clínica", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE audit_log RESTART IDENTITY CASCADE`;
    await owner`TRUNCATE billing_cycle, subscription,
                        clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica A #262'), (${CLINIC_B}, 'Clínica B #262')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@i262.test'),
      (${U_TER_A},   'Ter A',   'ter-a@i262.test'),
      (${U_COORD_B}, 'Coord B', 'coord-b@i262.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A},   ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("coordenador salva payload completo e as COLUNAS mudam no banco", async () => {
    const r = await salvarDadosClinica(ctx("coordenador", U_COORD_A), PAYLOAD);
    expect(r).toEqual({ ok: true });

    const a = await estado(CLINIC_A);
    expect(a.razao_social).toBe(PAYLOAD.razaoSocial);
    expect(a.cpf_cnpj).toBe(CPF_VALIDO); // só dígitos, máscara removida
    expect(a.endereco_logradouro).toBe("Rua das Acácias");
    expect(a.endereco_numero).toBe("123");
    expect(a.endereco_complemento).toBe("Sala 4");
    expect(a.endereco_bairro).toBe("Centro");
    expect(a.endereco_cidade).toBe("São Paulo");
    expect(a.endereco_uf).toBe("SP"); // normalizado para maiúsculas
    expect(a.endereco_cep).toBe("01310100"); // só dígitos
    expect(a.email_financeiro).toBe("financeiro@clinica-a.test");
  });

  test("audit_log: diff com CPF e e-mail MASCARADOS, só campos que mudaram", async () => {
    // Neste ponto só houve UM save — a linha é única, sem depender de ordem
    // (o id do audit_log é uuid: ORDER BY id não é cronológico).
    const logs = await owner<
      {
        ator_id: string;
        detalhe: Record<string, { de: unknown; para: unknown }>;
      }[]
    >`SELECT ator_id, detalhe FROM audit_log
       WHERE clinic_id = ${CLINIC_A} AND acao = 'dados_clinica_atualizados'`;
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log!.ator_id).toBe(U_COORD_A);
    const d = log!.detalhe;
    // Todos os 10 campos mudaram de NULL → valor.
    expect(Object.keys(d).sort()).toEqual(
      [
        "razao_social",
        "cpf_cnpj",
        "endereco_logradouro",
        "endereco_numero",
        "endereco_complemento",
        "endereco_bairro",
        "endereco_cidade",
        "endereco_uf",
        "endereco_cep",
        "email_financeiro",
      ].sort(),
    );
    // CPF mascarado: começa com *** e termina nos 4 últimos dígitos.
    expect(d.cpf_cnpj!.para).toBe("***4725");
    expect(String(d.cpf_cnpj!.para)).not.toContain(CPF_VALIDO);
    // E-mail mascarado.
    expect(d.email_financeiro!.para).toBe("f***@clinica-a.test");
    expect(String(d.email_financeiro!.para)).toContain("***@");
    // Campo não sensível fica em claro.
    expect(d.endereco_cidade!.para).toBe("São Paulo");
  });

  test("terapeuta é barrado e o banco NÃO muda", async () => {
    const antes = await estado(CLINIC_A);
    const audits = await auditCount(CLINIC_A);

    const r = await salvarDadosClinica(ctx("terapeuta", U_TER_A), {
      ...PAYLOAD,
      cidade: "Cidade do Terapeuta",
    });
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).not.toBe("");

    expect(await estado(CLINIC_A)).toEqual(antes);
    expect(await auditCount(CLINIC_A)).toBe(audits);
  });

  test("coordenador de B só escreve na própria clínica", async () => {
    const antesA = await estado(CLINIC_A);

    const r = await salvarDadosClinica(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      { ...PAYLOAD, razaoSocial: "Clínica B Ltda", cpfCnpj: CNPJ_VALIDO },
    );
    expect(r).toEqual({ ok: true });

    const b = await estado(CLINIC_B);
    expect(b.razao_social).toBe("Clínica B Ltda");
    expect(b.cpf_cnpj).toBe(CNPJ_VALIDO);
    // A não foi tocada.
    expect(await estado(CLINIC_A)).toEqual(antesA);
  });

  test("CPF que falha no Módulo 11 é recusado ANTES do banco", async () => {
    const antes = await estado(CLINIC_A);
    const audits = await auditCount(CLINIC_A);

    const r = await salvarDadosClinica(ctx("coordenador", U_COORD_A), {
      ...PAYLOAD,
      cpfCnpj: CPF_INVALIDO,
    });
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error.toLowerCase()).toContain("cpf");

    expect(await estado(CLINIC_A)).toEqual(antes);
    expect(await auditCount(CLINIC_A)).toBe(audits);
  });

  test("sem subscription: salva ok e o gateway NUNCA é chamado", async () => {
    // Todas as gravações até aqui rodaram sem linha em subscription.
    expect(mockAtualizarCliente).not.toHaveBeenCalled();
  });

  test("gate: com cobrança emitida, mudar o documento é recusado", async () => {
    // Assinatura sem vínculo no gateway (customer NULL → sync pulada) + ciclo
    // com cobrança EMITIDA.
    await owner`INSERT INTO subscription (id, clinic_id, status, provider)
      VALUES (${SUB_A}, ${CLINIC_A}, 'active', 'asaas')`;
    await owner`INSERT INTO billing_cycle
        (id, clinic_id, subscription_id, inicio, fim, status, cobranca_emitida_em)
      VALUES (${CYCLE_A}, ${CLINIC_A}, ${SUB_A},
              now() - interval '30 days', now(), 'cobrado', now())`;

    const antes = await estado(CLINIC_A);
    const r = await salvarDadosClinica(ctx("coordenador", U_COORD_A), {
      ...PAYLOAD,
      cpfCnpj: CNPJ_VALIDO, // troca CPF → CNPJ
    });
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("documento travado");
    expect((await estado(CLINIC_A)).cpf_cnpj).toBe(antes.cpf_cnpj);
  });

  test("gate: MESMO documento + razão social nova passa", async () => {
    const r = await salvarDadosClinica(ctx("coordenador", U_COORD_A), {
      ...PAYLOAD,
      razaoSocial: "Clínica A Ltda — Nova Razão",
    });
    expect(r).toEqual({ ok: true });
    const a = await estado(CLINIC_A);
    expect(a.razao_social).toBe("Clínica A Ltda — Nova Razão");
    expect(a.cpf_cnpj).toBe(CPF_VALIDO);
  });

  test("audit_log da edição parcial só lista o campo que mudou", async () => {
    // Localiza a linha pelo valor único do diff (id do audit_log é uuid:
    // ORDER BY id não é cronológico).
    const logs = await owner<
      { detalhe: Record<string, { de: unknown; para: unknown }> }[]
    >`SELECT detalhe FROM audit_log
       WHERE clinic_id = ${CLINIC_A} AND acao = 'dados_clinica_atualizados'
         AND detalhe -> 'razao_social' ->> 'para' = 'Clínica A Ltda — Nova Razão'`;
    expect(logs).toHaveLength(1);
    expect(Object.keys(logs[0]!.detalhe)).toEqual(["razao_social"]);
  });

  test("subscription sem provider_customer_id: sync segue pulada", async () => {
    expect(mockAtualizarCliente).not.toHaveBeenCalled();
  });

  test("com vínculo no gateway: sync é CHAMADA com o payload esperado", async () => {
    await owner`UPDATE subscription
        SET provider_customer_id = 'cus_test' WHERE id = ${SUB_A}`;
    mockAtualizarCliente.mockResolvedValueOnce(undefined);

    const r = await salvarDadosClinica(ctx("coordenador", U_COORD_A), {
      ...PAYLOAD,
      razaoSocial: "Clínica A Ltda — Sync",
    });
    expect(r).toEqual({ ok: true });

    expect(mockAtualizarCliente).toHaveBeenCalledTimes(1);
    expect(mockAtualizarCliente).toHaveBeenCalledWith({
      providerCustomerId: "cus_test",
      nome: "Clínica A Ltda — Sync",
      cpfCnpj: CPF_VALIDO,
      email: "financeiro@clinica-a.test",
      logradouro: "Rua das Acácias",
      numero: "123",
      complemento: "Sala 4",
      bairro: "Centro",
      cep: "01310100",
    });
  });

  test("falha do gateway ABORTA tudo: clinic e audit_log voltam (rollback)", async () => {
    const antes = await estado(CLINIC_A);
    const audits = await auditCount(CLINIC_A);
    mockAtualizarCliente.mockRejectedValueOnce(
      new Error("Asaas fora do ar (simulado)"),
    );

    const r = await salvarDadosClinica(ctx("coordenador", U_COORD_A), {
      ...PAYLOAD,
      razaoSocial: "Clínica A Ltda — Não Deve Persistir",
    });
    expect(r).toHaveProperty("error");

    const depois = await estado(CLINIC_A);
    expect(depois).toEqual(antes); // linha intacta
    expect(depois.razao_social).not.toContain("Não Deve Persistir");
    expect(await auditCount(CLINIC_A)).toBe(audits); // sem trilha órfã
  });

  test("lerDadosClinica devolve o gravado e documentoTravado=true (A) / false (B)", async () => {
    const a = await lerDadosClinica(ctx("coordenador", U_COORD_A));
    expect(a.razaoSocial).toBe("Clínica A Ltda — Sync");
    expect(a.cpfCnpj).toBe(CPF_VALIDO);
    expect(a.logradouro).toBe("Rua das Acácias");
    expect(a.numero).toBe("123");
    expect(a.complemento).toBe("Sala 4");
    expect(a.bairro).toBe("Centro");
    expect(a.cidade).toBe("São Paulo");
    expect(a.uf).toBe("SP");
    expect(a.cep).toBe("01310100");
    expect(a.emailFinanceiro).toBe("financeiro@clinica-a.test");
    expect(a.documentoTravado).toBe(true); // cobrança emitida existe

    const b = await lerDadosClinica(ctx("coordenador", U_COORD_B, CLINIC_B));
    expect(b.razaoSocial).toBe("Clínica B Ltda");
    expect(b.documentoTravado).toBe(false); // sem cobrança emitida
  });

  test("documento existente NÃO pode ser apagado por payload sem cpfCnpj", async () => {
    // O `required` do form é só UI: uma request forjada na Server Action com
    // cpfCnpj vazio não pode virar cpf_cnpj = NULL no banco.
    const antes = await estado(CLINIC_B);
    const audits = await auditCount(CLINIC_B);

    const r = await salvarDadosClinica(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      { ...PAYLOAD, razaoSocial: "Clínica B Ltda", cpfCnpj: "" },
    );
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("não pode ser removido");

    expect((await estado(CLINIC_B)).cpf_cnpj).toBe(antes.cpf_cnpj);
    expect(await auditCount(CLINIC_B)).toBe(audits);
  });

  test("no-op: payload idêntico devolve ok SEM gateway e SEM linha de audit", async () => {
    const chamadas = mockAtualizarCliente.mock.calls.length;
    const audits = await auditCount(CLINIC_B);

    // Mesmo payload que já está gravado na clínica B.
    const r = await salvarDadosClinica(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      { ...PAYLOAD, razaoSocial: "Clínica B Ltda", cpfCnpj: CNPJ_VALIDO },
    );
    expect(r).toEqual({ ok: true });

    expect(mockAtualizarCliente.mock.calls.length).toBe(chamadas);
    expect(await auditCount(CLINIC_B)).toBe(audits);
  });
});
