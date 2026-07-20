import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000c1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000c2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0a1";
const U_COORD_B = "00000000-0000-0000-0000-00000000c0a2";

const PAC_A1 = "00000000-0000-0000-0000-00000000ac01";
const PAC_A2 = "00000000-0000-0000-0000-00000000ac02";
const PAC_B1 = "00000000-0000-0000-0000-00000000ac03";

const GOAL_1 = "00000000-0000-0000-0000-000000009001";
const GOAL_2 = "00000000-0000-0000-0000-000000009002";
const PROTOCOL_1 = "00000000-0000-0000-0000-000000008001";
const PROTOCOL_2 = "00000000-0000-0000-0000-000000008002";

const FAM_1 = "fam-1";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let listarSupervisao: typeof import("./queries").listarSupervisao;

describe.skipIf(!hasDb)("queries.int.test.ts - listarSupervisao integration tests", () => {
  beforeAll(async () => {
    if (!hasDb) return;
    ({ listarSupervisao } = await import("./queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  async function resetDb() {
    await owner`TRUNCATE clinic, app_user, user_role, patient, session, protocol, goal, session_snapshot, alerta, audit_log RESTART IDENTITY CASCADE`;
    
    // Seed Clinics
    await owner`
      INSERT INTO clinic (id, nome, faltas_limiar, faltas_janela_semanas) 
      VALUES (${CLINIC_A}, 'Clínica A', 3, 4), (${CLINIC_B}, 'Clínica B', 3, 4)
    `;

    // Seed app_users
    await owner`
      INSERT INTO app_user (id, email, name) 
      VALUES (${U_COORD_A}, 'coordA@test.com', 'Coord A'), (${U_COORD_B}, 'coordB@test.com', 'Coord B')
    `;

    // Seed roles
    await owner`
      INSERT INTO user_role (user_id, clinic_id, papel) 
      VALUES (${U_COORD_A}, ${CLINIC_A}, 'coordenador'), (${U_COORD_B}, ${CLINIC_B}, 'coordenador')
    `;

    // Seed patients
    await owner`
      INSERT INTO patient (id, clinic_id, nome) 
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Paciente A1'), (${PAC_A2}, ${CLINIC_A}, 'Paciente A2'), (${PAC_B1}, ${CLINIC_B}, 'Paciente B1')
    `;

    // Seed protocol familia catalogo
    await owner`
      INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${FAM_1}, 'Familia 1')
      ON CONFLICT (id) DO NOTHING
    `;

    // Seed protocols
    await owner`
      INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) 
      VALUES 
        (${PROTOCOL_1}, ${CLINIC_A}, 'Protocol 1', 'fono', ${FAM_1}), 
        (${PROTOCOL_2}, ${CLINIC_A}, 'Protocol 2', 'fono', ${FAM_1})
    `;

    // Seed goals
    await owner`
      INSERT INTO goal (id, clinic_id, patient_id, descricao, criterio_dominio, criado_por) 
      VALUES 
        (${GOAL_1}, ${CLINIC_A}, ${PAC_A1}, 'Goal 1', '{"tipo":"porcentagem","valor":80}'::jsonb, ${U_COORD_A}), 
        (${GOAL_2}, ${CLINIC_A}, ${PAC_A1}, 'Goal 2', '{"tipo":"porcentagem","valor":80}'::jsonb, ${U_COORD_A})
    `;
  }

  test("1. Snapshot com estagnacao + sem linha alerta -> item estado='novo'", async () => {
    await resetDb();

    // Insert snapshot
    const segmentacao = {
      [GOAL_1]: {
        [PROTOCOL_1]: {
          tipo_estrutura: "motor",
          metrica: "tempo",
          rotulo: "estagnacao"
        }
      }
    };
    await owner`
      INSERT INTO session_snapshot (patient_id, session_numero, segmentacao, repertorio_state)
      VALUES (${PAC_A1}, 1, ${JSON.stringify(segmentacao)}::jsonb, '{}'::jsonb)
    `;

    const { itens, total } = await listarSupervisao(ctxCoordA);
    expect(total).toBe(1);
    expect(itens[0]).toMatchObject({
      tipo: "estagnacao",
      patientId: PAC_A1,
      patientNome: "Paciente A1",
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      goalNome: "Goal 1",
      protocolNome: "Protocol 1",
      estado: "novo",
      alertaId: null,
      sinalPresente: true,
      detalhe: {
        metrica: "tempo",
        tipoEstrutura: "motor",
        sessionNumero: 1
      }
    });
  });

  test("2. Faltas >= limiar na janela -> item de faltas novo; faltas < limiar -> nenhum item", async () => {
    await resetDb();

    // Paciente A1: 3 faltas na janela
    await owner`
      INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
      VALUES 
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A1}, ${U_COORD_A}, now() - interval '1 day', 'falta_paciente', 'fono'),
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A1}, ${U_COORD_A}, now() - interval '2 days', 'falta_paciente', 'fono'),
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A1}, ${U_COORD_A}, now() - interval '3 days', 'falta_paciente', 'fono')
    `;

    // Paciente A2: 2 faltas na janela (limiar é 3)
    await owner`
      INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
      VALUES 
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A2}, ${U_COORD_A}, now() - interval '1 day', 'falta_paciente', 'fono'),
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A2}, ${U_COORD_A}, now() - interval '2 days', 'falta_paciente', 'fono')
    `;

    const { itens, total } = await listarSupervisao(ctxCoordA);
    const p1Alert = itens.find(i => i.patientId === PAC_A1);
    const p2Alert = itens.find(i => i.patientId === PAC_A2);

    expect(p1Alert).toBeDefined();
    expect(p1Alert!.tipo).toBe("faltas_excessivas");
    expect(p1Alert!.estado).toBe("novo");
    expect(p2Alert).toBeUndefined();
  });

  test("3. Faltas fora da janela (mais velhas que janela_semanas) não contam", async () => {
    await resetDb();

    // Paciente A1: 2 faltas na janela, 1 falta fora da janela (janela = 4 semanas = 28 dias)
    await owner`
      INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
      VALUES 
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A1}, ${U_COORD_A}, now() - interval '1 day', 'falta_paciente', 'fono'),
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A1}, ${U_COORD_A}, now() - interval '2 days', 'falta_paciente', 'fono'),
        (gen_random_uuid(), ${CLINIC_A}, ${PAC_A1}, ${U_COORD_A}, now() - interval '30 days', 'falta_paciente', 'fono')
    `;

    const { total } = await listarSupervisao(ctxCoordA);
    expect(total).toBe(0);
  });

  test("4. Linha alerta reconhecido p/ a chave -> item estado='reconhecido', alertaId preenchido", async () => {
    await resetDb();

    // Setup snapshot
    const segmentacao = {
      [GOAL_1]: {
        [PROTOCOL_1]: {
          tipo_estrutura: "motor",
          metrica: "tempo",
          rotulo: "estagnacao"
        }
      }
    };
    await owner`
      INSERT INTO session_snapshot (patient_id, session_numero, segmentacao, repertorio_state)
      VALUES (${PAC_A1}, 1, ${JSON.stringify(segmentacao)}::jsonb, '{}'::jsonb)
    `;

    // Create recognized alert row
    const ch = `estagnacao:${PAC_A1}:${GOAL_1}:${PROTOCOL_1}`;
    const [alerta] = (await owner`
      INSERT INTO alerta (clinic_id, patient_id, tipo, status, chave_natural, goal_id, protocol_id, detalhe, criado_por, atualizado_por)
      VALUES (${CLINIC_A}, ${PAC_A1}, 'estagnacao', 'reconhecido', ${ch}, ${GOAL_1}, ${PROTOCOL_1}, '{"metrica":"tempo","tipoEstrutura":"motor","sessionNumero":1}'::jsonb, ${U_COORD_A}, ${U_COORD_A})
      RETURNING id
    `) as unknown as [{ id: string }];

    const { itens, total } = await listarSupervisao(ctxCoordA);
    expect(total).toBe(1);
    expect(itens[0]!.estado).toBe("reconhecido");
    expect(itens[0]!.alertaId).toBe(alerta.id);
  });

  test("5. Linha alerta resolvido p/ a chave -> sinal suprimido (não aparece)", async () => {
    await resetDb();

    const segmentacao = {
      [GOAL_1]: {
        [PROTOCOL_1]: {
          tipo_estrutura: "motor",
          metrica: "tempo",
          rotulo: "estagnacao"
        }
      }
    };
    await owner`
      INSERT INTO session_snapshot (patient_id, session_numero, segmentacao, repertorio_state)
      VALUES (${PAC_A1}, 1, ${JSON.stringify(segmentacao)}::jsonb, '{}'::jsonb)
    `;

    const ch = `estagnacao:${PAC_A1}:${GOAL_1}:${PROTOCOL_1}`;
    await owner`
      INSERT INTO alerta (clinic_id, patient_id, tipo, status, chave_natural, goal_id, protocol_id, detalhe, nota, criado_por, atualizado_por)
      VALUES (${CLINIC_A}, ${PAC_A1}, 'estagnacao', 'resolvido', ${ch}, ${GOAL_1}, ${PROTOCOL_1}, '{"metrica":"tempo","tipoEstrutura":"motor","sessionNumero":1}'::jsonb, 'Resolvido!', ${U_COORD_A}, ${U_COORD_A})
    `;

    const { total } = await listarSupervisao(ctxCoordA);
    expect(total).toBe(0);
  });

  test("6. Linha reconhecido cuja condição não é mais sinal vivo -> item sinalPresente=false", async () => {
    await resetDb();

    // No snapshot in DB -> no live signal.
    // But we insert a recognized alert in the ledger:
    const ch = `estagnacao:${PAC_A1}:${GOAL_1}:${PROTOCOL_1}`;
    const [alerta] = (await owner`
      INSERT INTO alerta (clinic_id, patient_id, tipo, status, chave_natural, goal_id, protocol_id, detalhe, criado_por, atualizado_por)
      VALUES (${CLINIC_A}, ${PAC_A1}, 'estagnacao', 'reconhecido', ${ch}, ${GOAL_1}, ${PROTOCOL_1}, '{"metrica":"tempo","tipoEstrutura":"motor","sessionNumero":1}'::jsonb, ${U_COORD_A}, ${U_COORD_A})
      RETURNING id
    `) as unknown as [{ id: string }];

    const { itens, total } = await listarSupervisao(ctxCoordA);
    expect(total).toBe(1);
    expect(itens[0]).toMatchObject({
      chaveNatural: ch,
      tipo: "estagnacao",
      patientId: PAC_A1,
      patientNome: "Paciente A1",
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      goalNome: "Goal 1",
      protocolNome: "Protocol 1",
      estado: "reconhecido",
      alertaId: alerta.id,
      sinalPresente: false,
    });
  });

  test("7. Isolamento: sinal de paciente de outra clínica não aparece p/ ctxCoord", async () => {
    await resetDb();

    // Paciente B1 (Clinica B) has 3 absences
    await owner`
      INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
      VALUES 
        (gen_random_uuid(), ${CLINIC_B}, ${PAC_B1}, ${U_COORD_B}, now() - interval '1 day', 'falta_paciente', 'fono'),
        (gen_random_uuid(), ${CLINIC_B}, ${PAC_B1}, ${U_COORD_B}, now() - interval '2 days', 'falta_paciente', 'fono'),
        (gen_random_uuid(), ${CLINIC_B}, ${PAC_B1}, ${U_COORD_B}, now() - interval '3 days', 'falta_paciente', 'fono')
    `;

    // Query for Clinic A
    const { total } = await listarSupervisao(ctxCoordA);
    expect(total).toBe(0);
  });
});
