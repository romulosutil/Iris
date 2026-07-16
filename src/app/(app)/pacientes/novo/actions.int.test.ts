import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";

// actions.ts puxa a cadeia getTenantContext (next/headers) → server-only.
// Neutraliza o side-effect e importa dinamicamente só o núcleo testável.
vi.mock("server-only", () => ({}));
const { criarPacienteEConsent } = await import("./actions");
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { patient, consent } = await import("@/db/schema");

const hasDb =
  !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
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
      form({ nome: "Paciente Teste", responsavelSignatario: "Mãe do Paciente" }),
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
  });

  test("nome vazio retorna erro sem gravar nada", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({ nome: "  ", responsavelSignatario: "Mãe" }),
    );
    expect(result.error).toMatch(/Nome/);
  });

  test("sem responsavelSignatario retorna erro (consent obrigatório antes do paciente)", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({ nome: "Outro Paciente" }),
    );
    expect(result.error).toMatch(/responsável/i);
    const encontrados = await withTenant(ctx, (db) =>
      db.select().from(patient).where(eq(patient.nome, "Outro Paciente")),
    );
    expect(encontrados).toHaveLength(0);
  });

  test("grava paciente + consent + alvo na mesma transação", async () => {
    const fd = new FormData();
    fd.set("nome", "Bruna");
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
      form({ nome: "Sem Alvo", responsavelSignatario: "Pai" }),
    );
    expect(res.error).toBeUndefined();
    const alvos = await owner`
      SELECT 1 FROM patient_alvo_disciplina WHERE patient_id = ${res.id!}`;
    expect(alvos).toHaveLength(0);
  });

  test("par de alvo inválido (horas não numéricas) reverte tudo (rollback)", async () => {
    const fd = new FormData();
    fd.set("nome", "Rollback Teste");
    fd.set("responsavelSignatario", "Mãe");
    fd.append("alvoDisciplina", "aba");
    fd.append("alvoHorasSemana", "abc"); // inválido
    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeTruthy();
    const encontrados = await owner`
      SELECT 1 FROM patient WHERE nome = 'Rollback Teste'`;
    expect(encontrados).toHaveLength(0); // paciente também não persiste
  });
});
