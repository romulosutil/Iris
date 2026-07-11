import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));
const { adicionarMembroEquipe, encerrarVinculoEquipe } = await import(
  "./actions"
);
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { careTeamMembership } = await import("@/db/schema");

const hasDb =
  !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002";
const PATIENT = "b0000000-0000-0000-0000-000000000020";
let owner: ReturnType<typeof postgres>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!hasDb)("equipe actions", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@a.test'), (${U_TERA}, 'Tera', 'tera@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_TERA}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC_A}, 'P')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  const ctx = {
    clinicId: CLINIC_A,
    userId: U_COORD,
    role: "coordenador",
  } as const;

  test("papel na equipe inválido retorna erro sem gravar", async () => {
    const result = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({ userId: U_TERA, disciplina: "ABA", papelNaEquipe: "chefe_supremo" }),
    );
    expect(result.error).toMatch(/Papel na equipe inválido/);
  });

  test("adiciona membro válido e depois encerra mantendo histórico", async () => {
    const result = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
      }),
    );
    expect(result.error).toBeUndefined();
    const [membro] = await withTenant(ctx, (db) =>
      db
        .select()
        .from(careTeamMembership)
        .where(eq(careTeamMembership.patientId, PATIENT)),
    );
    expect(membro?.vigenciaFim).toBeNull();
    await encerrarVinculoEquipe(ctx, membro!.id);
    const [encerrado] = await withTenant(ctx, (db) =>
      db
        .select()
        .from(careTeamMembership)
        .where(eq(careTeamMembership.id, membro!.id)),
    );
    expect(encerrado?.vigenciaFim).not.toBeNull();
  });
});
