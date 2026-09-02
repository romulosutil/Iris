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
 * Task 7b (prontidão do prontuário) — Task 7 (`b2775dfc`) pôs a régua na
 * RENDER (`/sessoes/[id]`, `PassoEmFoco`). Mas `capturarDiarioAction` e
 * `consolidarSessaoAction` (`actions.ts`) são server actions alcançáveis SEM
 * passar por aquela página: a régua tinha leitura e ZERO aplicação. Este
 * arquivo prova a aplicação — `assertPodeDocumentar` (`src/lib/patient/
 * assert-pode-documentar.ts`), chamado dentro da MESMA transação que grava a
 * escrita, nos dois cores de `logic.ts`.
 *
 * Fixture emprestada de `pacientes/[id]/prontidao.int.test.ts` (Task 3) e
 * `sessoes/[id]/bloqueio-documentar.int.test.ts` (Task 7): mesma clínica/
 * paciente/protocolo/meta contra Postgres real, sob RLS. `care_team_membership`
 * entra aqui porque, diferente daqueles dois arquivos, o ator que chama
 * `capturarDiario`/`consolidarSessao` é o TERAPEUTA dono da sessão (RLS de
 * escrita exige isso) — e sob `goal_select`/D-A9 um terapeuta fora da equipe
 * leria "sem meta" mesmo com meta existente.
 */

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1"; // protocol_driven (default)
const PROTOCOLO = "00000000-0000-0000-0000-000000007c01";
const SESS = "00000000-0000-0000-0000-00000005e1a1";

const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;

const CRITERIO = { tipo: "n_acertos_m_sessoes", n: 3, m: 3 };

let owner: ReturnType<typeof postgres>;
let capturarDiario: typeof import("./logic").capturarDiario;
let consolidarSessao: typeof import("./logic").consolidarSessao;
let appSql: typeof import("@/db/client").sql;

/** Meta direto pelo dono (bypassa RLS) — mesmo helper de `prontidao.int.test.ts`. */
async function inserirMetaAtiva(patientId: string): Promise<void> {
  await owner`
    INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
    VALUES (${patientId}, ${CLINIC_A}, 'meta de teste', 'ativa', ${owner.json(CRITERIO)}, ${U_COORD})`;
}

/** Vínculo de protocolo direto pelo dono — mesmo helper de `prontidao.int.test.ts`. */
async function inserirProtocoloAtivo(patientId: string): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  await owner`
    INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por, ativado_em, desativado_em)
    VALUES (${patientId}, ${PROTOCOLO}, ${U_COORD}, ${hoje}, NULL)`;
}

async function contarNotas(tipo: string): Promise<number> {
  const [r] = await owner`
    SELECT count(*)::int AS n FROM session_note
    WHERE session_id = ${SESS} AND tipo = ${tipo}`;
  return r!.n as number;
}

describe.skipIf(!hasDb)("gate de documentação nas actions", () => {
  beforeAll(async () => {
    ({ capturarDiario, consolidarSessao } = await import("./logic"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, protocol, session,
      session_note, care_team_membership, goal, patient_protocol
      RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'), (${U_T1}, 't1@x.com', 'T1')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    // Modalidade padrão do schema é `protocol_driven` — degraus bloqueantes:
    // protocolo E meta (modalidade.ts).
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'P')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC_A}, ${PAC}, ${U_T1}, now(), 'realizada', 'aba')`;
    // U_T1 na equipe de PAC: sem isso, `goal_select`/`patient_protocol` (RLS
    // por papel+equipe, D-A9) esconderiam fatos que EXISTEM — a régua leria
    // "sem meta"/"sem protocolo" mesmo quando os dois foram gravados.
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
  // de herdar meta/protocolo/nota do teste anterior.
  beforeEach(async () => {
    await owner`DELETE FROM goal WHERE patient_id = ${PAC}`;
    await owner`DELETE FROM patient_protocol WHERE patient_id = ${PAC}`;
    await owner`DELETE FROM session_note WHERE session_id = ${SESS}`;
  });

  // `capturarDiario`/`consolidarSessao` (exportação `comEscrita`-envolvida do
  // core) são chamados DIRETO aqui — mesmo padrão de `actions.int.test.ts`.
  // `assertPodeDocumentar` LANÇA `ProntuarioIncompletoError`; é o WRAPPER de
  // `actions.ts` (`capturarDiarioAction`/`consolidarSessaoAction`) quem
  // traduz o throw em `{ error }` — chamando o core direto, como aqui, o
  // throw atravessa `comEscrita` (que não tem try/catch próprio) inalterado.
  test("capturarDiario recusa quando falta meta ativa", async () => {
    await inserirProtocoloAtivo(PAC); // só protocolo — meta é o único bloqueante restante
    await expect(
      capturarDiario(ctxT1, {
        sessionId: SESS,
        texto: "Diário de uma sessão sem meta ativa.",
      }),
      // Rótulo real do degrau (`prontidao.ts`): "Ativar ao menos uma meta".
    ).rejects.toThrow(/falta.*ativar ao menos uma meta/i);
  });

  test("a recusa nomeia quem resolve, não diz 'erro interno'", async () => {
    await inserirProtocoloAtivo(PAC);
    let erro: unknown;
    try {
      await capturarDiario(ctxT1, {
        sessionId: SESS,
        texto: "Diário que deveria nomear quem resolve.",
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(Error);
    const mensagem = (erro as Error).message;
    expect(mensagem).toMatch(/coordenação/i);
    expect(mensagem).not.toMatch(/erro interno/i);
  });

  test("consolidarSessao recusa pelo mesmo predicado", async () => {
    // Sem protocolo E sem meta: os dois degraus bloqueiam.
    await expect(
      consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "Nota consolidada sem protocolo nem meta.",
      }),
    ).rejects.toThrow(/falta.*protocolo.*meta/i);
  });

  test("com protocolo E meta, a captura passa", async () => {
    await inserirProtocoloAtivo(PAC);
    await inserirMetaAtiva(PAC);
    const r = await capturarDiario(ctxT1, {
      sessionId: SESS,
      texto: "Diário de uma sessão pronta para documentar.",
    });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
  });

  // Recusa que grava metade é pior que recusa: a régua roda ANTES do INSERT,
  // na mesma transação — se o teste acima ficasse vermelho por um bug que
  // gravasse e SÓ DEPOIS recusasse, esta linha continuaria vermelha mesmo com
  // `r.error` certo.
  test("a recusa não deixa linha gravada", async () => {
    const antes = await contarNotas("captura_rapida");
    expect(antes).toBe(0);
    await expect(
      capturarDiario(ctxT1, {
        sessionId: SESS,
        texto: "Este texto não deveria chegar ao banco.",
      }),
    ).rejects.toThrow();
    const depois = await contarNotas("captura_rapida");
    expect(depois).toBe(0);
  });
});
