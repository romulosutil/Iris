import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";
vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_TER_EQUIPE = "00000000-0000-0000-0000-0000000071a1";
const U_TER_OUTRO = "00000000-0000-0000-0000-0000000072a1";
const PAC_ARQUIVADO = "00000000-0000-0000-0000-0000000ac1a1";
const PAC_ATIVO = "00000000-0000-0000-0000-0000000ac2a1";
const PAC_OUTRA_CLINICA = "00000000-0000-0000-0000-0000000ac3b1";

const ctxCoord = { clinicId: CLINIC_A, userId: U_COORD, role: "coordenador" } as const;
const ctxEquipe = { clinicId: CLINIC_A, userId: U_TER_EQUIPE, role: "terapeuta" } as const;
const ctxOutro = { clinicId: CLINIC_A, userId: U_TER_OUTRO, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let desarquivarPacienteSeArquivado: typeof import("./desarquivamento").desarquivarPacienteSeArquivado;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("desarquivamento · helper central de domínio (D7 / #174)", () => {
  beforeAll(async () => {
    ({ desarquivarPacienteSeArquivado } = await import("./desarquivamento"));
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, audit_log RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord@x.com', 'Coordenador'),
      (${U_TER_EQUIPE}, 'ter1@x.com', 'Terapeuta Equipe'),
      (${U_TER_OUTRO}, 'ter2@x.com', 'Terapeuta Outro')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_EQUIPE}, ${CLINIC_A}, 'terapeuta'),
      (${U_TER_OUTRO}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome, arquivado_em) VALUES
      (${PAC_ARQUIVADO}, ${CLINIC_A}, 'Paciente Arquivado', now() - interval '10 days'),
      (${PAC_ATIVO}, ${CLINIC_A}, 'Paciente Ativo', NULL),
      (${PAC_OUTRA_CLINICA}, ${CLINIC_B}, 'Paciente Clínica B', now() - interval '5 days')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC_ARQUIVADO}, ${U_TER_EQUIPE}, 'terapeuta_referencia', 'ABA')`;
  });

  beforeEach(async () => {
    await owner`DELETE FROM audit_log`;
    await owner`UPDATE patient SET arquivado_em = now() - interval '10 days' WHERE id = ${PAC_ARQUIVADO}`;
    await owner`UPDATE patient SET arquivado_em = NULL WHERE id = ${PAC_ATIVO}`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("desarquiva paciente arquivado e emite audit_log com a origem correspondente", async () => {
    const transicionou = await withTenant(ctxEquipe, (tx) =>
      desarquivarPacienteSeArquivado(tx, ctxEquipe, PAC_ARQUIVADO, "registro_clinico"),
    );

    expect(transicionou).toBe(true);

    const [pac] = await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC_ARQUIVADO}`;
    expect(pac!.arquivado_em).toBeNull();

    const logs = await owner`SELECT acao, entidade, entidade_id, patient_id, detalhe, ator_id FROM audit_log WHERE patient_id = ${PAC_ARQUIVADO}`;
    expect(logs.length).toBe(1);
    expect(logs[0]!.acao).toBe("paciente_desarquivado_automaticamente");
    expect(logs[0]!.entidade).toBe("patient");
    expect(logs[0]!.entidade_id).toBe(PAC_ARQUIVADO);
    expect(logs[0]!.patient_id).toBe(PAC_ARQUIVADO);
    expect(logs[0]!.ator_id).toBe(U_TER_EQUIPE);
    expect(logs[0]!.detalhe).toEqual({ origem: "registro_clinico" });
  });

  test("idempotência: paciente já ativo retorna false e não emite audit_log", async () => {
    const transicionou = await withTenant(ctxEquipe, (tx) =>
      desarquivarPacienteSeArquivado(tx, ctxEquipe, PAC_ATIVO, "aprovacao_evidencia"),
    );

    expect(transicionou).toBe(false);

    const logs = await owner`SELECT * FROM audit_log WHERE patient_id = ${PAC_ATIVO}`;
    expect(logs.length).toBe(0);
  });

  test("segunda chamada consecutiva no mesmo paciente arquivado é no-op idempotente", async () => {
    const primeira = await withTenant(ctxCoord, (tx) =>
      desarquivarPacienteSeArquivado(tx, ctxCoord, PAC_ARQUIVADO, "criacao_meta"),
    );
    expect(primeira).toBe(true);

    const segunda = await withTenant(ctxCoord, (tx) =>
      desarquivarPacienteSeArquivado(tx, ctxCoord, PAC_ARQUIVADO, "criacao_meta"),
    );
    expect(segunda).toBe(false);

    const logs = await owner`SELECT * FROM audit_log WHERE patient_id = ${PAC_ARQUIVADO}`;
    expect(logs.length).toBe(1);
  });

  test("paciente de outra clínica ou fora do RLS retorna false sem exceção e sem mutação", async () => {
    const transicionou = await withTenant(ctxEquipe, (tx) =>
      desarquivarPacienteSeArquivado(tx, ctxEquipe, PAC_OUTRA_CLINICA, "ativacao_protocolo"),
    );

    expect(transicionou).toBe(false);

    const [pacB] = await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC_OUTRA_CLINICA}`;
    expect(pacB!.arquivado_em).not.toBeNull();

    const logs = await owner`SELECT * FROM audit_log WHERE patient_id = ${PAC_OUTRA_CLINICA}`;
    expect(logs.length).toBe(0);
  });
});
