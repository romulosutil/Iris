import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC = "00000000-0000-0000-0000-0000000000d1";
const U_COORD = "00000000-0000-0000-0000-00000000d0c1";
const U_TERAPEUTA = "00000000-0000-0000-0000-00000000d0e1";
const PAC = "00000000-0000-0000-0000-00000000dac1";

const GOAL_1 = "00000000-0000-0000-0000-000000009001";
const PROTOCOL_1 = "00000000-0000-0000-0000-000000008001";
const FAM_1 = "fam-1";

const ctxCoord = { clinicId: CLINIC, userId: U_COORD, role: "coordenador" } as const;
const ctxTerapeuta = { clinicId: CLINIC, userId: U_TERAPEUTA, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let reconhecerAlerta: typeof import("./actions").reconhecerAlerta;
let resolverAlerta: typeof import("./actions").resolverAlerta;
let descartarAlerta: typeof import("./actions").descartarAlerta;
let listarSupervisao: typeof import("./queries").listarSupervisao;

describe.skipIf(!hasDb)("actions.int.test.ts - supervisao actions integration tests", () => {
  beforeAll(async () => {
    if (!hasDb) return;
    ({ reconhecerAlerta, resolverAlerta, descartarAlerta } = await import("./actions"));
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
    
    await owner`
      INSERT INTO clinic (id, nome, faltas_limiar, faltas_janela_semanas) 
      VALUES (${CLINIC}, 'Clínica D', 3, 4)
    `;

    await owner`
      INSERT INTO app_user (id, email, name) 
      VALUES (${U_COORD}, 'coord@d.com', 'Coord D'), (${U_TERAPEUTA}, 'terapeuta@d.com', 'Terapeuta D')
    `;

    await owner`
      INSERT INTO user_role (user_id, clinic_id, papel) 
      VALUES (${U_COORD}, ${CLINIC}, 'coordenador'), (${U_TERAPEUTA}, ${CLINIC}, 'terapeuta')
    `;

    await owner`
      INSERT INTO patient (id, clinic_id, nome) 
      VALUES (${PAC}, ${CLINIC}, 'Paciente D')
    `;

    await owner`
      INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${FAM_1}, 'Familia 1')
      ON CONFLICT (id) DO NOTHING
    `;

    await owner`
      INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) 
      VALUES (${PROTOCOL_1}, ${CLINIC}, 'Protocol 1', 'fono', ${FAM_1})
    `;

    await owner`
      INSERT INTO goal (id, clinic_id, patient_id, descricao, criterio_dominio, criado_por) 
      VALUES (${GOAL_1}, ${CLINIC}, ${PAC}, 'Goal 1', '{"tipo":"porcentagem","valor":80}'::jsonb, ${U_COORD})
    `;
  }

  test("1. reconhecerAlerta (coordenador) -> linha reconhecido + audit_log('reconhecimento_alerta', 'alerta')", async () => {
    await resetDb();

    const input = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
    };

    const r = await reconhecerAlerta(ctxCoord, input);
    expect(r.ok).toBe(true);

    const alertas = await owner`SELECT id, status, chave_natural FROM alerta WHERE patient_id = ${PAC}`;
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.status).toBe("reconhecido");
    expect(alertas[0]!.chave_natural).toBe(input.chaveNatural);

    const logs = await owner`SELECT acao, entidade, entidade_id FROM audit_log WHERE patient_id = ${PAC}`;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.acao).toBe("reconhecimento_alerta");
    expect(logs[0]!.entidade).toBe("alerta");
    expect(logs[0]!.entidade_id).toBe(alertas[0]!.id);
  });

  test("2. reconhecerAlerta com terapeuta -> error, nenhuma linha gravada", async () => {
    await resetDb();

    const input = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
    };

    const r = await reconhecerAlerta(ctxTerapeuta, input);
    expect(r.error).toBeDefined();

    const alertas = await owner`SELECT status FROM alerta WHERE patient_id = ${PAC}`;
    expect(alertas).toHaveLength(0);
  });

  test("3. reconhecerAlerta 2x mesma chave -> 2a retorna CONCURRENCY_ERROR, sem 2a linha", async () => {
    await resetDb();

    const input = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
    };

    const r1 = await reconhecerAlerta(ctxCoord, input);
    expect(r1.ok).toBe(true);

    const r2 = await reconhecerAlerta(ctxCoord, input);
    expect(r2.error).toBe("CONCURRENCY_ERROR");

    const alertas = await owner`SELECT id FROM alerta WHERE patient_id = ${PAC}`;
    expect(alertas).toHaveLength(1);
  });

  test("4. resolverAlerta sem linha prévia -> INSERT resolvido + nota + audit", async () => {
    await resetDb();

    const input = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
      nota: "Tratado com o terapeuta",
    };

    const r = await resolverAlerta(ctxCoord, input);
    expect(r.ok).toBe(true);

    const alertas = await owner`SELECT status, nota, criado_por FROM alerta WHERE patient_id = ${PAC}`;
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.status).toBe("resolvido");
    expect(alertas[0]!.nota).toBe("Tratado com o terapeuta");
    expect(alertas[0]!.criado_por).toBe(U_COORD);

    const logs = await owner`SELECT acao, entidade FROM audit_log WHERE patient_id = ${PAC}`;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.acao).toBe("resolucao_alerta");
  });

  test("5. resolverAlerta sobre reconhecido -> UPDATE resolvido + atualizado_por = coordenador", async () => {
    await resetDb();

    const baseInput = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
    };

    // Primeiro reconhece
    await reconhecerAlerta(ctxCoord, baseInput);

    // Depois resolve
    const r = await resolverAlerta(ctxCoord, { ...baseInput, nota: "Resolvido no papo" });
    expect(r.ok).toBe(true);

    const alertas = await owner`SELECT status, nota, atualizado_por FROM alerta WHERE patient_id = ${PAC}`;
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.status).toBe("resolvido");
    expect(alertas[0]!.nota).toBe("Resolvido no papo");
    expect(alertas[0]!.atualizado_por).toBe(U_COORD);
  });

  test("6. resolverAlerta sobre linha terminal -> CONCURRENCY_ERROR", async () => {
    await resetDb();

    const baseInput = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
    };

    // Resolve direto
    await resolverAlerta(ctxCoord, { ...baseInput, nota: "Primeira resolução" });

    // Tenta resolver de novo
    const r = await resolverAlerta(ctxCoord, { ...baseInput, nota: "Segunda tentativa" });
    expect(r.error).toBe("CONCURRENCY_ERROR");
  });

  test("7. descartarAlerta sem linha -> INSERT descartado + motivo + audit descarte_alerta", async () => {
    await resetDb();

    const input = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
      motivo: "Alerta irrelevante",
    };

    const r = await descartarAlerta(ctxCoord, input);
    expect(r.ok).toBe(true);

    const alertas = await owner`SELECT status, motivo FROM alerta WHERE patient_id = ${PAC}`;
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.status).toBe("descartado");
    expect(alertas[0]!.motivo).toBe("Alerta irrelevante");

    const logs = await owner`SELECT acao FROM audit_log WHERE patient_id = ${PAC}`;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.acao).toBe("descarte_alerta");
  });

  test("8. Após resolver, a mesma chave fica suprimida em listarSupervisao", async () => {
    await resetDb();

    // Cria snapshot com estagnacao
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
      VALUES (${PAC}, 1, ${JSON.stringify(segmentacao)}::jsonb, '{}'::jsonb)
    `;

    const baseInput = {
      chaveNatural: `estagnacao:${PAC}:${GOAL_1}:${PROTOCOL_1}`,
      tipo: "estagnacao" as const,
      patientId: PAC,
      goalId: GOAL_1,
      protocolId: PROTOCOL_1,
      detalhe: { metrica: "tempo", tipoEstrutura: "motor", sessionNumero: 1 },
    };

    // Antes de resolver, deve aparecer na supervisão
    const beforeList = await listarSupervisao(ctxCoord);
    expect(beforeList.total).toBe(1);

    // Resolve
    await resolverAlerta(ctxCoord, { ...baseInput, nota: "Tratado" });

    // Depois de resolver, não aparece mais
    const afterList = await listarSupervisao(ctxCoord);
    expect(afterList.total).toBe(0);
  });
});
