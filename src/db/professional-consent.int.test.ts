import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/db/client";
import { withTenant, type TenantContext } from "@/db/rls";
import { professionalConsent } from "@/db/schema";
import { hasDb } from "@tests/integration-env";

describe("professional_consent", () => {
  it("tem RLS habilitada", async () => {
    const r = await db.execute(sql`
      select relrowsecurity from pg_class where relname = 'professional_consent'`);
    expect((r as unknown as { relrowsecurity: boolean }[])[0]?.relrowsecurity).toBe(true);
  });

  it("app_role não tem UPDATE nem DELETE (aceite é imutável)", async () => {
    const r = await db.execute(sql`
      select privilege_type from information_schema.role_table_grants
      where table_name = 'professional_consent' and grantee = 'app_role'`);
    const privs = (r as unknown as { privilege_type: string }[]).map((p) => p.privilege_type);
    expect(privs).not.toContain("UPDATE");
    expect(privs).not.toContain("DELETE");
  });
});

// ─── Isolamento cross-tenant (finding do review de code — round 1) ───────────
// As duas asserções acima provam que RLS está LIGADA, não que ISOLA por
// clínica. Aqui semeamos um aceite em cada uma de duas clínicas (como o dono
// do banco — bypassa RLS, é só carga de teste) e provamos, via withTenant
// (mesmo gargalo usado em produção), que um coordenador da clínica B não lê
// o aceite da clínica A nem pelo id — igual ao padrão já usado para `consent`
// em src/db/rls.int.test.ts (teste "consent: leitura é isolada por clínica").
describe.skipIf(!hasDb)("professional_consent — isolamento cross-tenant", () => {
  const CLINIC_A = "31111111-1111-1111-1111-111111111111";
  const CLINIC_B = "32222222-2222-2222-2222-222222222222";
  const U_COORD_A = "31000000-0000-0000-0000-000000000001";
  const U_COORD_B = "32000000-0000-0000-0000-000000000002";
  const U_PROF_A = "31000000-0000-0000-0000-000000000003"; // aceitou termos na clínica A
  const U_PROF_B = "32000000-0000-0000-0000-000000000004"; // aceitou termos na clínica B
  const CONSENT_A = "31000000-0000-0000-0000-00000000000a";
  const CONSENT_B = "32000000-0000-0000-0000-00000000000b";

  const ctx = (userId: string, clinicId: string): TenantContext => ({
    role: "coordenador",
    userId,
    clinicId,
  });

  let owner: ReturnType<typeof postgres>;

  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`DELETE FROM professional_consent WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_COORD_B}, ${U_PROF_A}, ${U_PROF_B})`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica Isolamento A'),
      (${CLINIC_B}, 'Clínica Isolamento B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@isolamento.test'),
      (${U_COORD_B}, 'Coord B', 'coord-b@isolamento.test'),
      (${U_PROF_A}, 'Prof A', 'prof-a@isolamento.test'),
      (${U_PROF_B}, 'Prof B', 'prof-b@isolamento.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO professional_consent (id, user_id, clinic_id, versao_termo) VALUES
      (${CONSENT_A}, ${U_PROF_A}, ${CLINIC_A}, '2026-07-30'),
      (${CONSENT_B}, ${U_PROF_B}, ${CLINIC_B}, '2026-07-30')`;
  });

  afterAll(async () => {
    await owner`DELETE FROM professional_consent WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_COORD_B}, ${U_PROF_A}, ${U_PROF_B})`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner.end();
  });

  it("coordenador da clínica B não lê o aceite da clínica A (nem pelo id)", async () => {
    const daClinicaB = await withTenant(ctx(U_COORD_B, CLINIC_B), (tx) =>
      tx.select().from(professionalConsent),
    );
    expect(daClinicaB.map((c) => c.id)).toEqual([CONSENT_B]);

    // O da clínica A é invisível mesmo pedindo pelo id explícito.
    const vazamento = await withTenant(ctx(U_COORD_B, CLINIC_B), (tx) =>
      tx
        .select()
        .from(professionalConsent)
        .where(eq(professionalConsent.id, CONSENT_A)),
    );
    expect(vazamento).toHaveLength(0);

    // E o inverso: coordenador da clínica A só vê o seu.
    const daClinicaA = await withTenant(ctx(U_COORD_A, CLINIC_A), (tx) =>
      tx.select().from(professionalConsent),
    );
    expect(daClinicaA.map((c) => c.id)).toEqual([CONSENT_A]);
  });
});
