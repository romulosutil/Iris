import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { salvarFichaClinica } = await import("./logic");
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { patientClinicalProfile } = await import("@/db/schema");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
const P_COM_CONSENT = "b0000000-0000-0000-0000-000000000010";
const P_SEM_CONSENT = "b0000000-0000-0000-0000-000000000011";
let owner: ReturnType<typeof postgres>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!hasDb)("salvarFichaClinica", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, consent, patient_clinical_profile RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@a.test'), (${U_ADMIN}, 'Admin', 'admin@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_ADMIN}, ${CLINIC_A}, 'admin_recepcao')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${P_COM_CONSENT}, ${CLINIC_A}, 'Com Consent'), (${P_SEM_CONSENT}, ${CLINIC_A}, 'Sem Consent')`;
    await owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo) VALUES (${P_COM_CONSENT}, 'tratamento_dados_menor', 'Mãe', 'v1')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("coordenador grava ficha clínica quando há consent", async () => {
    const ctx = {
      clinicId: CLINIC_A,
      userId: U_COORD,
      role: "coordenador",
    } as const;
    const result = await salvarFichaClinica(
      ctx,
      P_COM_CONSENT,
      form({ diagnostico: "TEA" }),
    );
    expect(result.error).toBeUndefined();
    const [perfil] = await withTenant(ctx, (db) =>
      db
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P_COM_CONSENT)),
    );
    expect(perfil?.diagnostico).toBe("TEA");
  });

  test("coordenador grava ficha clínica com campos vazios (não lança 'No values to set')", async () => {
    const ctx = {
      clinicId: CLINIC_A,
      userId: U_COORD,
      role: "coordenador",
    } as const;
    const result = await salvarFichaClinica(
      ctx,
      P_COM_CONSENT,
      form({}),
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  test("bloqueia quando não há Consent LGPD prévio", async () => {
    const ctx = {
      clinicId: CLINIC_A,
      userId: U_COORD,
      role: "coordenador",
    } as const;
    const result = await salvarFichaClinica(
      ctx,
      P_SEM_CONSENT,
      form({ diagnostico: "x" }),
    );
    expect(result.error).toMatch(/Consentimento/);
  });

  test("admin_recepcao é bloqueado por requireRole (NUNCA acessa clínico)", async () => {
    const ctx = {
      clinicId: CLINIC_A,
      userId: U_ADMIN,
      role: "admin_recepcao",
    } as const;
    await expect(
      salvarFichaClinica(ctx, P_COM_CONSENT, form({ diagnostico: "hack" })),
    ).rejects.toThrow(/Acesso negado/);
  });

  test("regra 6 · salvarFichaClinica para paciente arquivado desarquiva e grava trilha", async () => {
    const ctx = {
      clinicId: CLINIC_A,
      userId: U_COORD,
      role: "coordenador",
    } as const;

    await owner`DELETE FROM audit_log WHERE patient_id = ${P_COM_CONSENT}`;
    await owner`UPDATE patient SET arquivado_em = now() - interval '10 days' WHERE id = ${P_COM_CONSENT}`;

    const result = await salvarFichaClinica(
      ctx,
      P_COM_CONSENT,
      form({ diagnostico: "TEA Nível 1" }),
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    const [pac] = await owner`SELECT arquivado_em FROM patient WHERE id = ${P_COM_CONSENT}`;
    expect(pac!.arquivado_em).toBeNull();

    const [log] = await owner`SELECT acao, detalhe FROM audit_log WHERE patient_id = ${P_COM_CONSENT} AND acao = 'paciente_desarquivado_automaticamente'`;
    expect(log).toBeTruthy();
    expect(log!.detalhe).toEqual({ origem: "ficha_clinica" });

    await owner`UPDATE patient SET arquivado_em = NULL WHERE id = ${P_COM_CONSENT}`;
  });
});
