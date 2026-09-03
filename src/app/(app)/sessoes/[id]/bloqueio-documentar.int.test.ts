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
 * Task 7 (prontidão do prontuário) — o passo "Documentar" da jornada
 * unificada (`/sessoes/[id]`) precisa da MESMA régua que já trava a aba
 * central do paciente (Task 5, `layout.tsx`): sem protocolo vigente E meta
 * ativa, `materializar.ts` (`src/lib/evidence/materializar.ts`) descarta a
 * evidência da sessão — o terapeuta preencheria o formulário inteiro para um
 * resultado que nunca chega à evolução.
 *
 * Fixture emprestada de `pacientes/[id]/prontidao.int.test.ts` (Task 3):
 * mesma clínica/paciente/protocolo/meta contra Postgres real, sob RLS.
 */

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1"; // protocol_driven
const PAC_CONV = "00000000-0000-0000-0000-0000000ac2a1"; // conventional
const PROTOCOLO = "00000000-0000-0000-0000-000000007c01";
const SESS = "00000000-0000-0000-0000-00000005e1a1"; // sessão de PAC
const SESS_CONV = "00000000-0000-0000-0000-00000005e2a1"; // sessão de PAC_CONV

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;

const CRITERIO = { tipo: "n_acertos_m_sessoes", n: 3, m: 3 };

let owner: ReturnType<typeof postgres>;
let carregarSessao: typeof import("./queries").carregarSessao;
let appSql: typeof import("@/db/client").sql;

/** Meta direto pelo dono (bypassa RLS) — mesmo helper de `prontidao.int.test.ts`. */
async function inserirMeta(
  patientId: string,
  estado: "rascunho" | "ativa",
): Promise<void> {
  await owner`
    INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
    VALUES (${patientId}, ${CLINIC_A}, 'meta de teste', ${estado}, ${owner.json(CRITERIO)}, ${U_COORD})`;
}

/** Vínculo de protocolo direto pelo dono — mesmo helper de `prontidao.int.test.ts`. */
async function inserirProtocolo(
  patientId: string,
  opts: { desativado: boolean },
): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  await owner`
    INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por, ativado_em, desativado_em)
    VALUES (${patientId}, ${PROTOCOLO}, ${U_COORD}, ${hoje}, ${opts.desativado ? hoje : null})`;
}

describe.skipIf(!hasDb)("bloqueio do passo Documentar", () => {
  beforeAll(async () => {
    ({ carregarSessao } = await import("./queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, session,
      care_team_membership, goal, patient_protocol, protocol
      RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'), (${U_T1}, 't1@x.com', 'T1')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality) VALUES
      (${PAC}, ${CLINIC_A}, 'P', 'protocol_driven'),
      (${PAC_CONV}, ${CLINIC_A}, 'PC', 'conventional')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC_A}, ${PAC}, ${U_T1}, now(), 'realizada', 'aba'),
      (${SESS_CONV}, ${CLINIC_A}, ${PAC_CONV}, ${U_T1}, now(), 'realizada', 'psicologia')`;
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
    await owner`DELETE FROM goal WHERE patient_id IN (${PAC}, ${PAC_CONV})`;
    await owner`DELETE FROM patient_protocol WHERE patient_id IN (${PAC}, ${PAC_CONV})`;
  });

  test("paciente sem protocolo e sem meta: podeDocumentar false", async () => {
    const dados = await carregarSessao(ctxCoord, SESS, new Date());
    expect(dados?.prontidao.podeDocumentar).toBe(false);
  });

  test("com protocolo vigente E meta ativa: podeDocumentar true", async () => {
    await inserirProtocolo(PAC, { desativado: false });
    await inserirMeta(PAC, "ativa");
    const dados = await carregarSessao(ctxCoord, SESS, new Date());
    expect(dados?.prontidao.podeDocumentar).toBe(true);
  });

  // Mutação: com só o protocolo, ainda tem de bloquear. Sem este caso, uma
  // implementação que checasse apenas o protocolo passaria os dois acima.
  test("só protocolo, sem meta: continua bloqueado", async () => {
    await inserirProtocolo(PAC, { desativado: false });
    const dados = await carregarSessao(ctxCoord, SESS, new Date());
    expect(dados?.prontidao.podeDocumentar).toBe(false);
  });

  test("conventional nunca bloqueia", async () => {
    // `conventional` não tem `degrausBloqueantes` (modalidade.ts) — sem
    // protocolo nem meta, ainda assim `podeDocumentar` é `true`.
    const dados = await carregarSessao(ctxCoord, SESS_CONV, new Date());
    expect(dados?.prontidao.podeDocumentar).toBe(true);
  });
});
