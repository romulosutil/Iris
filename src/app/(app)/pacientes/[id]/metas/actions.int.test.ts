import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1"; // na equipe de PAC
const U_T2 = "00000000-0000-0000-0000-0000000072a1"; // NÃO na equipe de PAC
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC_B = "00000000-0000-0000-0000-0000000ac1b1"; // outra clínica

const ctxCoord = { clinicId: CLINIC_A, userId: U_COORD, role: "coordenador" } as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;
const ctxRecep = { clinicId: CLINIC_A, userId: U_COORD, role: "admin_recepcao" } as const;

const CRITERIO = { tipo: "n_acertos_m_sessoes", n: 3, m: 3 } as const;

let owner: ReturnType<typeof postgres>;
let A: typeof import("./actions");
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("metas · CRUD + transições", () => {
  beforeAll(async () => {
    A = await import("./actions");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      goal, goal_milestone_mapping RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'), (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'P'), (${PAC_B}, ${CLINIC_B}, 'PB')`;
    // T1 está na equipe de PAC; T2 não.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'ABA')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("terapeuta da equipe cria meta (estado ativa, disciplina gravada)", async () => {
    const r = await A.criarMeta(ctxT1, {
      patientId: PAC,
      descricao: "Pedir água sozinho",
      disciplina: "ABA",
      criterioDominio: CRITERIO,
      cicloRevisaoSemanas: 10,
    });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
    const [row] = await owner`SELECT estado, disciplina, proxima_revisao_em
      FROM goal WHERE id = ${r.id!}`;
    expect(row!.estado).toBe("ativa");
    expect(row!.disciplina).toBe("ABA");
    expect(row!.proxima_revisao_em).not.toBeNull();
  });

  test("terapeuta FORA da equipe não cria meta (RLS goal_insert)", async () => {
    const r = await A.criarMeta(ctxT2, {
      patientId: PAC,
      descricao: "indevida",
      criterioDominio: CRITERIO,
      cicloRevisaoSemanas: 10,
    });
    expect(r.error).toBeTruthy();
  });

  test("ciclo fora de 8–12 é rejeitado na validação", async () => {
    const r = await A.criarMeta(ctxCoord, {
      patientId: PAC,
      descricao: "ciclo inválido",
      criterioDominio: CRITERIO,
      cicloRevisaoSemanas: 20,
    });
    expect(r.error).toBeTruthy();
    expect(r.id).toBeUndefined();
  });

  test("recepção não cria meta (requireRole → RoleError)", async () => {
    await expect(
      A.criarMeta(ctxRecep, {
        patientId: PAC,
        descricao: "recepção",
        criterioDominio: CRITERIO,
        cicloRevisaoSemanas: 10,
      }),
    ).rejects.toThrow();
  });

  test("só o coordenador marca dominada; terapeuta é barrado", async () => {
    const c = await A.criarMeta(ctxT1, {
      patientId: PAC,
      descricao: "candidata",
      criterioDominio: CRITERIO,
      cicloRevisaoSemanas: 10,
    });
    // terapeuta tenta dominar → RoleError (gate de papel na ação)
    await expect(A.marcarDominada(ctxT1, { goalId: c.id! })).rejects.toThrow();
    let [row] = await owner`SELECT estado FROM goal WHERE id = ${c.id!}`;
    expect(row!.estado).toBe("ativa");
    // coordenador domina
    const r = await A.marcarDominada(ctxCoord, { goalId: c.id! });
    expect(r.error).toBeUndefined();
    [row] = await owner`SELECT estado FROM goal WHERE id = ${c.id!}`;
    expect(row!.estado).toBe("dominada");
  });

  test("pausar e reativar via transição de equipe", async () => {
    const c = await A.criarMeta(ctxT1, {
      patientId: PAC,
      descricao: "pausável",
      criterioDominio: CRITERIO,
      cicloRevisaoSemanas: 10,
    });
    await A.transicionarEstadoMeta(ctxT1, { goalId: c.id!, estado: "pausada" });
    let [row] = await owner`SELECT estado FROM goal WHERE id = ${c.id!}`;
    expect(row!.estado).toBe("pausada");
    await A.transicionarEstadoMeta(ctxCoord, { goalId: c.id!, estado: "ativa" });
    [row] = await owner`SELECT estado FROM goal WHERE id = ${c.id!}`;
    expect(row!.estado).toBe("ativa");
  });

  test("manterMetaAtiva reancora proxima_revisao_em no futuro", async () => {
    const c = await A.criarMeta(ctxT1, {
      patientId: PAC,
      descricao: "revisar",
      criterioDominio: CRITERIO,
      cicloRevisaoSemanas: 8,
    });
    // força revisão vencida
    await owner`UPDATE goal SET proxima_revisao_em = '2000-01-01' WHERE id = ${c.id!}`;
    const r = await A.manterMetaAtiva(ctxT1, { goalId: c.id! });
    expect(r.error).toBeUndefined();
    const [row] = await owner`SELECT proxima_revisao_em FROM goal WHERE id = ${c.id!}`;
    expect(String(row!.proxima_revisao_em) > "2000-01-01").toBe(true);
  });

  test("coordenador de outra clínica não enxerga a meta (isolamento tenant)", async () => {
    const c = await A.criarMeta(ctxCoord, {
      patientId: PAC,
      descricao: "só clínica A",
      criterioDominio: CRITERIO,
      cicloRevisaoSemanas: 10,
    });
    const ctxCoordB = { clinicId: CLINIC_B, userId: U_COORD, role: "coordenador" } as const;
    // domina sob contexto da clínica B → RLS não acha a linha, estado permanece
    await A.marcarDominada(ctxCoordB, { goalId: c.id! });
    const [row] = await owner`SELECT estado FROM goal WHERE id = ${c.id!}`;
    expect(row!.estado).toBe("ativa");
  });
});

describe("schemas - validação unitária", () => {
  test("criarSchema deduplica milestoneIds repetidos", async () => {
    const { criarSchema } = await import("./schemas");
    const id1 = "00000000-0000-0000-0000-000000000001";
    const id2 = "00000000-0000-0000-0000-000000000002";

    const parsed = criarSchema.safeParse({
      patientId: "00000000-0000-0000-0000-0000000ac1a1",
      descricao: "Aprender a apontar",
      disciplina: "ABA",
      criterioDominio: { tipo: "n_acertos_m_sessoes", n: 3, m: 3 },
      cicloRevisaoSemanas: 10,
      milestoneIds: [id1, id2, id1, id2],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.milestoneIds).toEqual([id1, id2]);
    }
  });

  test("atualizarSchema aceita disciplina null ou undefined", async () => {
    const { atualizarSchema } = await import("./schemas");

    const payloadWithNull = {
      goalId: "00000000-0000-0000-0000-000000000001",
      descricao: "Aprender a apontar",
      disciplina: null,
      criterioDominio: { tipo: "n_acertos_m_sessoes", n: 3, m: 3 },
      cicloRevisaoSemanas: 10,
    };

    const parsedNull = atualizarSchema.safeParse(payloadWithNull);
    expect(parsedNull.success).toBe(true);
    if (parsedNull.success) {
      expect(parsedNull.data.disciplina).toBeNull();
    }

    const payloadWithUndefined = {
      goalId: "00000000-0000-0000-0000-000000000001",
      descricao: "Aprender a apontar",
      criterioDominio: { tipo: "n_acertos_m_sessoes", n: 3, m: 3 },
      cicloRevisaoSemanas: 10,
    };

    const parsedUndefined = atualizarSchema.safeParse(payloadWithUndefined);
    expect(parsedUndefined.success).toBe(true);
    if (parsedUndefined.success) {
      expect(parsedUndefined.data.disciplina).toBeUndefined();
    }
  });
});
