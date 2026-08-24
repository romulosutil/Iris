import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { RoleError } from "@/auth/require-role";
import { hasDb } from "@tests/integration-env";
import { carregarPosturaSeguranca } from "@/app/(app)/clinica/seguranca/queries";

/**
 * #277 · T5 — cobre (d) papel não-coordenador não alcança a leitura e (e) a
 * query não enxerga membro de outra clínica.
 *
 * O arranjo roda pela conexão do owner (`MIGRATION_DATABASE_URL`), nunca por
 * `authDb`: fixture montada com a role dona esconde defeito de privilégio real.
 * A LEITURA sob teste, essa sim, passa por `withTenant` como `app_role`.
 *
 * E-mails são exclusivos deste arquivo. Os literais `coord@a.test` /
 * `tera@a.test` já são usados por mais de dez outros `*.int.test.ts`, e o
 * `UNIQUE(email)` de `app_user` estoura quando eles rodam em paralelo.
 */

const CLINIC_A = "00000000-0000-0000-0000-00000000277a";
const CLINIC_B = "00000000-0000-0000-0000-00000000277b";

const U_COORD_A = "00000000-0000-0000-0000-000000027701";
const U_TERA_A = "00000000-0000-0000-0000-000000027702";
const U_RECEP_A = "00000000-0000-0000-0000-000000027703";
const U_COORD_B = "00000000-0000-0000-0000-000000027704";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador" as const,
};
const ctxTeraA = {
  clinicId: CLINIC_A,
  userId: U_TERA_A,
  role: "terapeuta" as const,
};
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD_B,
  role: "coordenador" as const,
};

describe.skipIf(!hasDb)("#277 · postura de segurança da equipe", () => {
  beforeAll(async () => {
    await owner!`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner!`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_TERA_A}, ${U_RECEP_A}, ${U_COORD_B})`;
    await owner!`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;

    await owner!`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica 277 A'),
      (${CLINIC_B}, 'Clínica 277 B')`;

    await owner!`INSERT INTO app_user (id, name, email, two_factor_enabled) VALUES
      (${U_COORD_A}, 'Ana Coord 277',  'coord@c277a.test', true),
      (${U_TERA_A},  'Bruno Tera 277', 'tera@c277a.test',  false),
      (${U_RECEP_A}, 'Célia Recep 277','recep@c277a.test', false),
      (${U_COORD_B}, 'Dario Coord 277','coord@c277b.test', true)`;

    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TERA_A},  ${CLINIC_A}, 'terapeuta'),
      (${U_RECEP_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  });

  afterAll(async () => {
    await owner?.end();
  });

  test("(e) o coordenador da A lê os três membros da A e nenhum da B", async () => {
    const postura = await carregarPosturaSeguranca(ctxCoordA);

    expect(postura.total).toBe(3);
    expect(postura.protegidos).toBe(1);

    // Recepção sem segundo fator: o gate de MFA não cobre este papel.
    expect(postura.semSegundoFator.map((m) => m.email)).toEqual([
      "recep@c277a.test",
    ]);
    // Terapeuta sem segundo fator: convite sem primeiro acesso, não risco.
    expect(postura.ativacaoPendente.map((m) => m.email)).toEqual([
      "tera@c277a.test",
    ]);

    const emails = JSON.stringify(postura);
    expect(emails).not.toContain("c277b.test");
  });

  test("(e) o coordenador da B enxerga só a própria clínica", async () => {
    const postura = await carregarPosturaSeguranca(ctxCoordB);

    expect(postura.total).toBe(1);
    expect(postura.protegidos).toBe(1);
    expect(JSON.stringify(postura)).not.toContain("c277a.test");
  });

  test("(d) papel não-coordenador é barrado antes de qualquer leitura", async () => {
    await expect(carregarPosturaSeguranca(ctxTeraA)).rejects.toBeInstanceOf(
      RoleError,
    );
  });

  test("a credencial `two_factor` continua fora do alcance do app_role", async () => {
    const linhas = await owner!<{ tem: boolean }[]>`
      SELECT has_table_privilege('app_role', 'two_factor', 'SELECT') AS tem
    `;

    expect(linhas[0]?.tem).toBe(false);
  });

  test("nenhuma função SECURITY DEFINER foi criada para esta leitura", async () => {
    const rows = await owner!<{ proname: string }[]>`
      SELECT proname FROM pg_proc WHERE proname = 'app_obter_status_mfa_equipe'
    `;

    expect(rows).toHaveLength(0);
  });
});
