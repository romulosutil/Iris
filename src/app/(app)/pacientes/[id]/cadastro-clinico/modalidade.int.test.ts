import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

/**
 * #387 — trocar `patient.clinical_modality` via `UPDATE` direto + `audit_log`
 * na mesma transação (precedente `alternarArquivamento`, não `SECURITY
 * DEFINER` — a policy `patient_update` já libera `coordenador`/
 * `admin_recepcao`).
 *
 * Contra Postgres, não com dublê: o que está sob teste é RLS isolando por
 * clínica — um dublê de `withTenant` nunca vê a policy de verdade, e um
 * `coordenador` da clínica B tentando alterar o paciente da clínica A não
 * estoura, só não enxerga a linha (mesmo formato "0 linhas em silêncio" do
 * `alternarArquivamento`/`arquivamento.int.test.ts`).
 */

const CLINIC_A = "00000000-0000-0000-0000-0000003870a1";
const CLINIC_B = "00000000-0000-0000-0000-0000003870b1";
const U_COORD_A = "00000000-0000-0000-0000-000000387ca1";
const U_COORD_B = "00000000-0000-0000-0000-000000387cb1";
const U_ADMIN_A = "00000000-0000-0000-0000-000000387aa1";
const U_T1 = "00000000-0000-0000-0000-000000387071";
const PAC_A = "00000000-0000-0000-0000-000000387ac1";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxAdminA = {
  clinicId: CLINIC_A,
  userId: U_ADMIN_A,
  role: "admin_recepcao",
} as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD_B,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let L: typeof import("./modalidade-logic");
let appSql: typeof import("@/db/client").sql;

async function modalidadeDoPaciente(): Promise<string> {
  const [row] =
    await owner`SELECT clinical_modality FROM patient WHERE id = ${PAC_A}`;
  return row!.clinical_modality as string;
}

async function trilha(): Promise<
  { acao: string; detalhe: Record<string, unknown> | null; ator_id: string }[]
> {
  return (await owner`
    SELECT acao, detalhe, ator_id FROM audit_log
    WHERE patient_id = ${PAC_A} ORDER BY criado_em ASC
  `) as unknown as {
    acao: string;
    detalhe: Record<string, unknown> | null;
    ator_id: string;
  }[];
}

describe.skipIf(!hasDb)("#387 · alterarModalidadeClinica", () => {
  beforeAll(async () => {
    L = await import("./modalidade-logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    // Limpeza ESCOPADA — `patient`/`clinic`/`app_user` são compartilhados com
    // outros arquivos de integração (memória `truncate-extra-colide-com-int-
    // test-paralelo`); só as linhas deste arquivo são apagadas/reinseridas.
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC_A}`;
    await owner`DELETE FROM care_team_membership WHERE patient_id = ${PAC_A} OR user_id IN (${U_COORD_A}, ${U_COORD_B}, ${U_ADMIN_A}, ${U_T1})`;
    await owner`DELETE FROM patient WHERE id = ${PAC_A}`;
    await owner`DELETE FROM user_role WHERE user_id IN (${U_COORD_A}, ${U_COORD_B}, ${U_ADMIN_A}, ${U_T1})`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_COORD_B}, ${U_ADMIN_A}, ${U_T1})`;
    await owner`INSERT INTO clinic (id, nome, isento_trial) VALUES (${CLINIC_A}, 'A', true), (${CLINIC_B}, 'B', true) ON CONFLICT (id) DO UPDATE SET isento_trial = true`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD_A}, 'coordA387@x.test', 'Coord A'),
      (${U_COORD_B}, 'coordB387@x.test', 'Coord B'),
      (${U_ADMIN_A}, 'adminA387@x.test', 'Admin A'),
      (${U_T1}, 't1387@x.test', 'T1')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_ADMIN_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  async function resetPaciente(
    modalidade: "protocol_driven" | "cognitive_behavioral" | "conventional",
  ) {
    await owner`INSERT INTO clinic (id, nome, isento_trial) VALUES (${CLINIC_A}, 'A', true), (${CLINIC_B}, 'B', true) ON CONFLICT (id) DO UPDATE SET isento_trial = true`;
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC_A}`;
    await owner`DELETE FROM care_team_membership WHERE patient_id = ${PAC_A} OR user_id IN (${U_COORD_A}, ${U_COORD_B}, ${U_ADMIN_A}, ${U_T1})`;
    await owner`DELETE FROM patient WHERE id = ${PAC_A}`;
    await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality) VALUES (${PAC_A}, ${CLINIC_A}, 'Paciente A', ${modalidade})`;
  }

  test("coordenador altera a modalidade e grava audit_log na mesma transação", async () => {
    await resetPaciente("protocol_driven");

    const r = await L.alterarModalidadeClinica(
      ctxCoordA,
      PAC_A,
      "cognitive_behavioral",
    );
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);

    expect(await modalidadeDoPaciente()).toBe("cognitive_behavioral");

    const linhas = await trilha();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.acao).toBe("paciente_modalidade_clinica_alterada");
    expect(linhas[0]!.ator_id).toBe(U_COORD_A);
    expect(linhas[0]!.detalhe).toEqual({
      de: "protocol_driven",
      para: "cognitive_behavioral",
    });
  });

  test("admin_recepcao altera a modalidade (mesmo predicado da policy patient_update)", async () => {
    await resetPaciente("protocol_driven");

    const r = await L.alterarModalidadeClinica(
      ctxAdminA,
      PAC_A,
      "conventional",
    );
    expect(r.error).toBeUndefined();
    expect(await modalidadeDoPaciente()).toBe("conventional");
  });

  test("modalidade inválida é rejeitada e não altera nada", async () => {
    await resetPaciente("protocol_driven");

    const r = await L.alterarModalidadeClinica(ctxCoordA, PAC_A, "invalida");
    expect(r.error).toBeTruthy();
    expect(await modalidadeDoPaciente()).toBe("protocol_driven");
    expect(await trilha()).toHaveLength(0);
  });

  test("reenviar a mesma modalidade é idempotente e não duplica trilha", async () => {
    await resetPaciente("cognitive_behavioral");

    const r = await L.alterarModalidadeClinica(
      ctxCoordA,
      PAC_A,
      "cognitive_behavioral",
    );
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(await trilha()).toHaveLength(0);
  });

  test("terapeuta é barrado por requireRole — não muda o modelo de tratamento", async () => {
    await resetPaciente("protocol_driven");

    await expect(
      L.alterarModalidadeClinica(ctxT1, PAC_A, "cognitive_behavioral"),
    ).rejects.toThrow(/Acesso negado/);
    expect(await modalidadeDoPaciente()).toBe("protocol_driven");
    expect(await trilha()).toHaveLength(0);
  });

  test("isolamento multi-tenant: coordenador da clínica B não altera paciente da clínica A", async () => {
    await resetPaciente("protocol_driven");

    const r = await L.alterarModalidadeClinica(
      ctxCoordB,
      PAC_A,
      "cognitive_behavioral",
    );
    expect(r.error).toBeTruthy();
    expect(await modalidadeDoPaciente()).toBe("protocol_driven");
    expect(await trilha()).toHaveLength(0);
  });
});
