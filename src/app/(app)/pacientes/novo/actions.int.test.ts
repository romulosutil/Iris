import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

// O núcleo testável vive em ./logic (server-only, sem "use server"). Neutraliza
// o side-effect de server-only e importa dinamicamente só o núcleo.
vi.mock("server-only", () => ({}));
const { criarPacienteEConsent } = await import("./logic");
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { patient, consent } = await import("@/db/schema");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
let owner: ReturnType<typeof postgres>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!hasDb)("criarPacienteEConsent", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, consent RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_ADMIN}, 'Admin', 'admin@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_ADMIN}, ${CLINIC_A}, 'admin_recepcao')`;
    // Gate de cobrança (#36): a partir da migração 0071, cadastrar paciente
    // exige assinatura ativa. Estes testes são sobre cadastro + consent, não
    // sobre billing, então a clínica entra já paga. A cobertura do gate em si
    // (bloqueio em free_tier/setup_pending) fica no bloco no fim do arquivo.
    await owner`INSERT INTO subscription (clinic_id, status) VALUES (${CLINIC_A}, 'active')
                ON CONFLICT (clinic_id) DO UPDATE SET status = 'active'`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  const ctx = {
    clinicId: CLINIC_A,
    userId: U_ADMIN,
    role: "admin_recepcao",
  } as const;

  test("admin_recepcao cadastra paciente + consent na mesma transação", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Paciente Teste",
        tipoConsentimento: "responsavel_legal",
        responsavelSignatario: "Mãe do Paciente",
      }),
    );
    expect(result.error).toBeUndefined();
    const [p] = await withTenant(ctx, (db) =>
      db.select().from(patient).where(eq(patient.id, result.id!)),
    );
    expect(p).toBeDefined();
    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, result.id!)),
    );
    expect(consentimentos).toHaveLength(1);
    expect(consentimentos[0]!.tipo).toBe("tratamento_dados_menor");
    expect(consentimentos[0]!.responsavelSignatario).toBe("Mãe do Paciente");
    expect(consentimentos[0]!.versaoTermo).toBe("v1");
  });

  test("nome vazio retorna erro sem gravar nada", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "  ",
        tipoConsentimento: "responsavel_legal",
        responsavelSignatario: "Mãe",
      }),
    );
    expect(result.error).toMatch(/Nome/);
  });

  test("responsavel_legal sem responsavelSignatario retorna erro (consent obrigatório antes do paciente)", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({ nome: "Outro Paciente", tipoConsentimento: "responsavel_legal" }),
    );
    expect(result.error).toMatch(/responsável/i);
    const encontrados = await withTenant(ctx, (db) =>
      db.select().from(patient).where(eq(patient.nome, "Outro Paciente")),
    );
    expect(encontrados).toHaveLength(0);
  });

  // ─── #100 — titular adulto autoconsentindo ────────────────────────────────

  test("titular_adulto grava tipo novo com responsavelSignatario NULL", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Adulto Autoconsente",
        tipoConsentimento: "titular_adulto",
      }),
    );
    expect(result.error).toBeUndefined();
    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, result.id!)),
    );
    expect(consentimentos).toHaveLength(1);
    expect(consentimentos[0]!.tipo).toBe("autoconsentimento_titular_adulto");
    expect(consentimentos[0]!.responsavelSignatario).toBeNull();
    expect(consentimentos[0]!.versaoTermo).toBe("adulto-v1");
  });

  test("titular_adulto COM responsável preenchido retorna erro e não grava nada", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Adulto Com Responsavel",
        tipoConsentimento: "titular_adulto",
        responsavelSignatario: "Mãe Indevida",
      }),
    );
    expect(result.error).toMatch(
      /titular adulto não deve informar responsável/i,
    );
    const encontrados = await withTenant(ctx, (db) =>
      db
        .select()
        .from(patient)
        .where(eq(patient.nome, "Adulto Com Responsavel")),
    );
    expect(encontrados).toHaveLength(0);
  });

  test("tipoConsentimento ausente retorna erro (sem default silencioso)", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({ nome: "Sem Tipo", responsavelSignatario: "Mãe" }),
    );
    expect(result.error).toMatch(/quem assina o consentimento/i);
    const encontrados = await withTenant(ctx, (db) =>
      db.select().from(patient).where(eq(patient.nome, "Sem Tipo")),
    );
    expect(encontrados).toHaveLength(0);
  });

  test("tipoConsentimento inválido retorna erro", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({ nome: "Tipo Invalido", tipoConsentimento: "curatela" }),
    );
    expect(result.error).toMatch(/quem assina o consentimento/i);
  });

  test("nascimento de menor com titular_adulto NÃO bloqueia (emancipação existe)", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Menor Emancipado",
        nascimento: "2012-05-10",
        tipoConsentimento: "titular_adulto",
      }),
    );
    expect(result.error).toBeUndefined();
    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, result.id!)),
    );
    expect(consentimentos[0]!.tipo).toBe("autoconsentimento_titular_adulto");
  });

  test("grava paciente + consent + alvo na mesma transação", async () => {
    const fd = new FormData();
    fd.set("nome", "Bruna");
    fd.set("tipoConsentimento", "responsavel_legal");
    fd.set("responsavelSignatario", "Mãe da Bruna");
    fd.append("alvoDisciplina", "aba");
    fd.append("alvoHorasSemana", "12.0");
    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeUndefined();
    expect(res.id).toBeTruthy();
    const alvos = await owner`
      SELECT disciplina, horas_alvo_semana, vigencia_inicio, vigencia_fim
      FROM patient_alvo_disciplina WHERE patient_id = ${res.id!}`;
    expect(alvos).toHaveLength(1);
    expect(alvos[0]!.disciplina).toBe("aba");
    expect(alvos[0]!.horas_alvo_semana).toBe("12.0");
    expect(alvos[0]!.vigencia_fim).toBeNull();
  });

  test("sem alvo informado grava paciente + consent + 0 alvos", async () => {
    const res = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Sem Alvo",
        tipoConsentimento: "responsavel_legal",
        responsavelSignatario: "Pai",
      }),
    );
    expect(res.error).toBeUndefined();
    const alvos = await owner`
      SELECT 1 FROM patient_alvo_disciplina WHERE patient_id = ${res.id!}`;
    expect(alvos).toHaveLength(0);
  });

  test("par de alvo inválido (horas não numéricas) reverte tudo (rollback)", async () => {
    const fd = new FormData();
    fd.set("nome", "Rollback Teste");
    fd.set("tipoConsentimento", "responsavel_legal");
    fd.set("responsavelSignatario", "Mãe");
    fd.append("alvoDisciplina", "aba");
    fd.append("alvoHorasSemana", "abc"); // inválido
    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeTruthy();
    const encontrados = await owner`
      SELECT 1 FROM patient WHERE nome = 'Rollback Teste'`;
    expect(encontrados).toHaveLength(0); // paciente também não persiste
  });

  // ─── #140 — consentimento por finalidade (IA e exportação) ─────────────────

  test("grava consentimentos de finalidade (uso_ia_processamento e exportacao_relatorios) na mesma transação quando marcados", async () => {
    const fd = new FormData();
    fd.set("nome", "Paciente Com IA e Exportacao");
    fd.set("tipoConsentimento", "titular_adulto");
    fd.set("consentimentoIa", "on");
    fd.set("consentimentoExportacao", "on");

    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeUndefined();
    expect(res.id).toBeTruthy();

    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, res.id!)),
    );
    expect(consentimentos).toHaveLength(3);

    const tipos = consentimentos.map((c) => c.tipo);
    expect(tipos).toContain("autoconsentimento_titular_adulto");
    expect(tipos).toContain("uso_ia_processamento");
    expect(tipos).toContain("exportacao_relatorios");

    // Para titular adulto, responsavelSignatario é NULL nas finalidades também
    const ia = consentimentos.find((c) => c.tipo === "uso_ia_processamento")!;
    expect(ia.responsavelSignatario).toBeNull();
    expect(ia.versaoTermo).toBe("adulto-v1");

    const exp = consentimentos.find((c) => c.tipo === "exportacao_relatorios")!;
    expect(exp.responsavelSignatario).toBeNull();
    expect(exp.versaoTermo).toBe("adulto-v1");
  });

  test("grava consentimentos de finalidade com responsável legal quando menor", async () => {
    const fd = new FormData();
    fd.set("nome", "Menor Com IA");
    fd.set("tipoConsentimento", "responsavel_legal");
    fd.set("responsavelSignatario", "Pai do Menor");
    fd.set("consentimentoIa", "on");

    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeUndefined();

    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, res.id!)),
    );
    expect(consentimentos).toHaveLength(2);

    const ia = consentimentos.find((c) => c.tipo === "uso_ia_processamento")!;
    expect(ia.responsavelSignatario).toBe("Pai do Menor");
    expect(ia.versaoTermo).toBe("v1");
  });
  // ── Gate de cobrança (#36) ──────────────────────────────────────────────
  // O cadastro do 1º paciente é o gatilho comercial: sem assinatura ativa ele
  // é recusado, e a recusa tem que ser TOTAL — um paciente gravado com a
  // cobrança bloqueada seria serviço prestado de graça e, pior, dado clínico
  // órfão de contrato.
  describe("gate de cobrança", () => {
    async function porStatus(status: string) {
      await owner`UPDATE subscription SET status = ${status}::subscription_status WHERE clinic_id = ${CLINIC_A}`;
    }

    afterAll(async () => {
      await porStatus("active");
    });

    test("free_tier bloqueia o cadastro e NÃO grava paciente nenhum", async () => {
      await porStatus("free_tier");
      const antes = await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;

      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Bloqueado",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
        }),
      );

      expect(res.id).toBeUndefined();
      expect(res.bloqueioBilling?.motivo).toBe("ativacao_requerida");
      // A transação inteira reverteu: nem paciente, nem consent, nem trial.
      const depois = await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
      expect(depois[0]!.n).toBe(antes[0]!.n);
    });

    test("setup_pending bloqueia com motivo próprio (cobrança em voo)", async () => {
      await porStatus("setup_pending");
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Pendente",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
        }),
      );
      expect(res.id).toBeUndefined();
      expect(res.bloqueioBilling?.motivo).toBe("pagamento_pendente");
    });

    test("past_due NÃO bloqueia — inadimplência não tranca prontuário", async () => {
      await porStatus("past_due");
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Em Atraso",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
        }),
      );
      expect(res.bloqueioBilling).toBeUndefined();
      expect(res.id).toBeTruthy();
    });

    test("clínica isenta (legado pré-cobrança) passa mesmo em free_tier", async () => {
      await porStatus("free_tier");
      await owner`UPDATE clinic SET isento_trial = true WHERE id = ${CLINIC_A}`;
      try {
        const res = await criarPacienteEConsent(
          ctx,
          form({
            nome: "Paciente Legado",
            tipoConsentimento: "responsavel_legal",
            responsavelSignatario: "Mãe",
          }),
        );
        expect(res.bloqueioBilling).toBeUndefined();
        expect(res.id).toBeTruthy();
      } finally {
        await owner`UPDATE clinic SET isento_trial = false WHERE id = ${CLINIC_A}`;
      }
    });
  });
});
