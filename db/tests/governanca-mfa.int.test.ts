import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant } from "@/db/rls";
import { hasDb } from "@tests/integration-env";
import {
  obterStatusMfaEquipe,
  obterLogsAuditoriaClinica,
  obterTermoGovernanca,
} from "@/app/(app)/configuracoes/seguranca/queries";

const CLINIC_A = "00000000-0000-0000-0000-00000000410a";
const CLINIC_B = "00000000-0000-0000-0000-00000000410b";

const U_COORD_A = "00000000-0000-0000-0000-000000004101";
const U_TERA_A = "00000000-0000-0000-0000-000000004102";
const U_COORD_B = "00000000-0000-0000-0000-000000004103";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

describe.skipIf(!hasDb)("Painel de Governança e Segurança — Status MFA & RLS", () => {
  afterAll(async () => {
    await owner?.end();
  });

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

  test("setup: prepara clínicas, usuários e papéis", async () => {
    await owner!`DELETE FROM audit_log WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner!`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner!`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_TERA_A}, ${U_COORD_B})`;
    await owner!`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;

    await owner!`INSERT INTO clinic (id, nome, cpf_cnpj) VALUES
      (${CLINIC_A}, 'Clínica A', '12345678000195'),
      (${CLINIC_B}, 'Clínica B', '98765432000110')`;

    await owner!`INSERT INTO app_user (id, name, email, two_factor_enabled) VALUES
      (${U_COORD_A}, 'Coord A', 'coord@a.test', true),
      (${U_TERA_A}, 'Tera A', 'tera@a.test', false),
      (${U_COORD_B}, 'Coord B', 'coord@b.test', true)`;

    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TERA_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;

    await owner!`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe) VALUES
      (${CLINIC_A}, ${U_COORD_A}, 'login_sucesso', 'app_user', ${U_COORD_A}, '{"ip": "127.0.0.1"}'::jsonb),
      (${CLINIC_B}, ${U_COORD_B}, 'login_sucesso', 'app_user', ${U_COORD_B}, '{"ip": "127.0.0.1"}'::jsonb)`;
  });

  test("coordenador da Clínica A lê apenas status MFA dos membros da Clínica A", async () => {
    const membros = await obterStatusMfaEquipe(ctxCoordA);

    expect(membros).toHaveLength(2);
    expect(membros.map((m) => m.email).sort()).toEqual(["coord@a.test", "tera@a.test"]);

    const coord = membros.find((m) => m.userId === U_COORD_A);
    expect(coord?.mfaAtivo).toBe(true);

    const tera = membros.find((m) => m.userId === U_TERA_A);
    expect(tera?.mfaAtivo).toBe(false);
  });

  test("terapeuta tentando chamar obterStatusMfaEquipe é barrado por requireRole na camada de aplicação", async () => {
    await expect(obterStatusMfaEquipe(ctxTeraA)).rejects.toThrow();
  });

  test("terapeuta tentando invocar app_obter_status_mfa_equipe() via SQL é barrado pelo guard P0001 do DEFINER", async () => {
    await expect(
      withTenant(ctxTeraA, (tx) => tx.execute(sql`SELECT * FROM app_obter_status_mfa_equipe()`)),
    ).rejects.toThrow(/app_obter_status_mfa_equipe: acesso restrito a coordenador/);
  });

  test("coordenador da Clínica B não vê membros da Clínica A (isolamento multi-tenant)", async () => {
    const membrosB = await obterStatusMfaEquipe(ctxCoordB);

    expect(membrosB).toHaveLength(1);
    expect(membrosB[0]?.email).toBe("coord@b.test");
  });

  test("coordenador lê logs de auditoria da sua clínica", async () => {
    const logsA = await obterLogsAuditoriaClinica(ctxCoordA);

    expect(logsA).toHaveLength(1);
    expect(logsA[0]?.acao).toBe("login_sucesso");
    expect(logsA[0]?.atorEmail).toBe("coord@a.test");
  });

  test("obterTermoGovernanca retorna payload bem formado", async () => {
    const termo = await obterTermoGovernanca(ctxCoordA);

    expect(termo.clinicId).toBe(CLINIC_A);
    expect(termo.nomeClinica).toBe("Clínica A");
    expect(termo.cnpjCpf).toBe("12345678000195");
    expect(termo.totemSeguranca.criptografiaRepositorio).toContain("AES-256");
  });

  test("função app_obter_status_mfa_equipe possui o guard de app_user_role_exigido e app_clinic_id_exigido", async () => {
    const rows = await owner!<{ prosrc: string }[]>`
      SELECT prosrc
      FROM pg_proc
      WHERE proname = 'app_obter_status_mfa_equipe'
    `;

    expect(rows).toHaveLength(1);
    const src = rows[0]!.prosrc;
    expect(src).toContain("app_clinic_id_exigido()");
    expect(src).toContain("app_user_role_exigido()");
  });
});
