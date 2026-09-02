import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";
import { seedProtocolFamiliaCatalogo } from "@tests/reference-data";
vi.mock("server-only", () => ({}));

/**
 * Task 3 (prontidão do prontuário) — `obterFatosProntidao` lê seis `EXISTS`
 * numa transação `withTenant`, sob a RLS real.
 *
 * D-A9 é o motivo do segundo `describe`: as tabelas clínicas (`goal`
 * incluída) têm policy de SELECT chaveada por PAPEL e EQUIPE (`goal_select`,
 * `db/migrations/0006_fase2_rls.sql:207` — `coordenador` OR
 * `app_is_on_team`), não só por clínica. Sob essa RLS, "não vejo" e "não
 * existe" chegam idênticos a um `EXISTS`. `montarProntidao` já lida com isso
 * restringindo o papel que recebe escada; este arquivo prova o dado bruto que
 * ele recebe, não repete a decisão dele.
 */

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1"; // na equipe de PAC
const U_T2 = "00000000-0000-0000-0000-0000000072a1"; // NÃO na equipe de PAC
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC_CLINICA_B = "00000000-0000-0000-0000-0000000ac1b1";
const PROTOCOLO = "00000000-0000-0000-0000-000000007c01";

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxTerapeutaNaEquipe = {
  clinicId: CLINIC_A,
  userId: U_T1,
  role: "terapeuta",
} as const;
const ctxTerapeutaForaDaEquipe = {
  clinicId: CLINIC_A,
  userId: U_T2,
  role: "terapeuta",
} as const;

const CRITERIO = { tipo: "n_acertos_m_sessoes", n: 3, m: 3 };

let owner: ReturnType<typeof postgres>;
let Q: typeof import("./prontidao-queries");
let appSql: typeof import("@/db/client").sql;

/** Meta direto pelo dono (bypassa RLS) — clínica passada explicitamente para
 * o caso cross-tenant poder criar a meta na clínica B. */
async function inserirMeta(
  patientId: string,
  estado: "rascunho" | "ativa",
  clinicId: string = CLINIC_A,
): Promise<void> {
  await owner`
    INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
    VALUES (${patientId}, ${clinicId}, 'meta de teste', ${estado}, ${owner.json(CRITERIO)}, ${U_COORD})`;
}

/** Vínculo de protocolo direto pelo dono. `ativado_em`/`desativado_em` no
 * mesmo dia satisfaz o CHECK `patient_protocol_vigencia`
 * (`desativado_em IS NULL OR desativado_em >= ativado_em`). */
async function inserirProtocolo(
  patientId: string,
  opts: { desativado: boolean },
): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  await owner`
    INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por, ativado_em, desativado_em)
    VALUES (${patientId}, ${PROTOCOLO}, ${U_COORD}, ${hoje}, ${opts.desativado ? hoje : null})`;
}

describe.skipIf(!hasDb)("obterFatosProntidao (Task 3)", () => {
  beforeAll(async () => {
    Q = await import("./prontidao-queries");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient,
      care_team_membership, goal, patient_protocol, protocol
      RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'),
      (${U_T1}, 't1@x.com', 'T1'),
      (${U_T2}, 't2@x.com', 'T2')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'P'), (${PAC_CLINICA_B}, ${CLINIC_B}, 'PB')`;
    // T1 está na equipe de PAC; T2 não — o par que prova D-A9 abaixo.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'ABA')`;
    await seedProtocolFamiliaCatalogo(owner);
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTOCOLO}, ${CLINIC_A}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  // Isolamento entre casos: cada teste declara o estado que precisa, em vez
  // de herdar meta/protocolo do teste anterior.
  beforeEach(async () => {
    await owner`DELETE FROM goal WHERE patient_id IN (${PAC}, ${PAC_CLINICA_B})`;
    await owner`DELETE FROM patient_protocol WHERE patient_id = ${PAC}`;
  });

  describe("obterFatosProntidao", () => {
    test("reflete o estado real: sem protocolo e sem meta, ambos false", async () => {
      const fatos = await Q.obterFatosProntidao(ctxCoord, PAC);
      expect(fatos.temProtocoloAtivo).toBe(false);
      expect(fatos.temMetaAtiva).toBe(false);
    });

    test("meta em rascunho NÃO conta como meta ativa", async () => {
      await inserirMeta(PAC, "rascunho");
      const fatos = await Q.obterFatosProntidao(ctxCoord, PAC);
      expect(fatos.temMetaAtiva).toBe(false);
    });

    test("meta ativa conta", async () => {
      await inserirMeta(PAC, "ativa");
      const fatos = await Q.obterFatosProntidao(ctxCoord, PAC);
      expect(fatos.temMetaAtiva).toBe(true);
    });

    test("protocolo desativado NÃO conta", async () => {
      await inserirProtocolo(PAC, { desativado: true });
      const fatos = await Q.obterFatosProntidao(ctxCoord, PAC);
      expect(fatos.temProtocoloAtivo).toBe(false);
    });

    // O caro: é a RLS que isola, não um `WHERE clinic_id`. Um paciente de
    // outra clínica não pode devolver fatos verdadeiros — devolveria uma
    // escada "pronta" para um prontuário que este usuário nem enxerga.
    test("cross-tenant: paciente de outra clínica devolve tudo false", async () => {
      await inserirMeta(PAC_CLINICA_B, "ativa", CLINIC_B);
      const fatos = await Q.obterFatosProntidao(ctxCoord, PAC_CLINICA_B);
      expect(fatos.temMetaAtiva).toBe(false);
      expect(fatos.temFichaClinica).toBe(false);
    });
  });

  /**
   * D-A9 — a MESMA meta, lida por três papéis. `goal_select`
   * (`0006_fase2_rls.sql:207`) exige `coordenador` OR `app_is_on_team`, então
   * "não vejo" e "não existe" chegam idênticos a `obterFatosProntidao`. Este
   * bloco prova que a distinção foi feita em cima da RLS real, e não
   * presumida.
   */
  describe("obterFatosProntidao — leitura por papel", () => {
    beforeEach(async () => {
      await inserirProtocolo(PAC, { desativado: false });
      await inserirMeta(PAC, "ativa");
    });

    test("coordenador enxerga a meta que existe", async () => {
      const fatos = await Q.obterFatosProntidao(ctxCoord, PAC);
      expect(fatos.temMetaAtiva).toBe(true);
    });

    test("terapeuta NA equipe enxerga a meta que existe", async () => {
      const fatos = await Q.obterFatosProntidao(ctxTerapeutaNaEquipe, PAC);
      expect(fatos.temMetaAtiva).toBe(true);
    });

    // Documenta o comportamento REAL da policy, seja ele qual for. Se este
    // teste ficar vermelho, a régua de equipe da feature está errada — não
    // "conserta" afrouxando a policy nem criando um SECURITY DEFINER que
    // enxergue tudo; leva o achado ao Rômulo.
    test("terapeuta FORA da equipe não enxerga", async () => {
      const fatos = await Q.obterFatosProntidao(ctxTerapeutaForaDaEquipe, PAC);
      expect(fatos.temMetaAtiva).toBe(false);
    });
  });
});
