/**
 * Auditoria 360 · Q-03 (#532) — OCC da revisão de extrações.
 *
 * `transicionar()` só aceita a mutação quando `versao` no banco é a que o
 * cliente viu (CAS). Dois cenários, contra o banco real:
 *
 *  (a) `versao` obsoleta (cliente viu 1, banco já está em 2) → a chamada
 *      devolve `CONCURRENCY_ERROR` e NADA muda.
 *  (b) colisão REAL forçada (memória `teste-de-corrida-nao-exercita-a-colisao`:
 *      `Promise.all` de duas aprovações passa verde sem tocar o guard — a
 *      segunda simplesmente roda depois). Aqui uma transação aberta segura o
 *      lock da linha depois de avançar a versão; a aprovação do app fica
 *      ESPERANDO esse lock (provado via `pg_stat_activity`); quando a primeira
 *      comita, o UPDATE do app reavalia o WHERE com a versão nova → 0 linhas
 *      → `CONCURRENCY_ERROR`. Sem o guard de `versao`, o app aprovaria por
 *      cima e gravaria `evidence` duplicada/incoerente.
 */
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
vi.mock("server-only", () => ({}));

const CLINIC = "00000000-0000-0000-0000-0000000000f5";
const U_T1 = "00000000-0000-0000-0000-0000000071f5";
const PAC = "00000000-0000-0000-0000-00000000acf5";
const SESS = "00000000-0000-0000-0000-00000005e1f5";
const PROTOCOL = "00000000-0000-0000-0000-000000010005";
const MILESTONE_TATO = "00000000-0000-0000-0000-000000030005";
const EX = "00000000-0000-0000-0000-00000e0c0001";

const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let owner2: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let A: typeof import("./logic");

async function backendsEsperandoLock(): Promise<number> {
  const [r] = await owner`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database()
      AND wait_event_type = 'Lock'
      AND query ILIKE '%extraction%'`;
  return r!.n as number;
}

async function esperarAte(pred: () => Promise<boolean>, ms = 5000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("esperarAte: condição não ocorreu no prazo");
}

async function seed() {
  await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
    session, extraction, evidence, protocol, patient_protocol, goal, milestone
    RESTART IDENTITY CASCADE`;
  await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
    ('vbmapp', 'VB-MAPP') ON CONFLICT (id) DO NOTHING`;
  await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica OCC Q-03')`;
  await owner`INSERT INTO app_user (id, email, name) VALUES (${U_T1}, 't1.occ@t.com', 'T1')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_T1}, ${CLINIC}, 'terapeuta')`;
  await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente')`;
  await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
    VALUES (${PAC}, ${U_T1}, 'ABA', 'terapeuta_referencia')`;
  await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
    (${SESS}, ${CLINIC}, ${PAC}, ${U_T1}, now(), 'realizada', 1, 'aba')`;
  await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
    (${PROTOCOL}, ${CLINIC}, 'VB-MAPP', 'ABA', 'vbmapp')`;
  await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
    (${PAC}, ${PROTOCOL}, ${U_T1})`;
  await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, nivel, tipo_estrutura, estrutura) VALUES
    (${MILESTONE_TATO}, ${PROTOCOL}, 'tato', 'Tato nível 1', '1', 'marco_simples', '{}')`;
  await owner`INSERT INTO extraction
      (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
    (${EX}, ${SESS}, ${CLINIC}, 'sugerida', 'evidencia', 'nomeou o carro', 'alta',
      ${owner.json({
        descricao: "nomeou o carro",
        funcao: "tato",
        alvos: [{ goal_id: null, protocol_id: "vbmapp", dominio_id: "tato" }],
      })})`;
}

describe.skipIf(!hasDb)("OCC da revisão — Q-03 (#532)", () => {
  beforeAll(async () => {
    A = await import("./logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    owner2 = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  afterAll(async () => {
    await owner?.end();
    await owner2?.end();
    await appSql?.end();
  });
  beforeEach(seed);

  test("(a) versão obsoleta → CONCURRENCY_ERROR e nada muda", async () => {
    await owner`UPDATE extraction SET versao = 2 WHERE id = ${EX}`;

    const r = await A.aprovarExtracao(ctxT1, { extractionId: EX, versao: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("CONCURRENCY_ERROR");

    const [row] =
      await owner`SELECT estado, versao, revisado_por FROM extraction WHERE id = ${EX}`;
    expect(row!.estado).toBe("sugerida");
    expect(row!.versao).toBe(2);
    expect(row!.revisado_por).toBeNull();
    const ev = await owner`SELECT id FROM evidence WHERE extraction_id = ${EX}`;
    expect(ev.length).toBe(0);
  });

  test("(b) colisão real: transação aberta segura o lock após avançar a versão; a aprovação do app espera e cai no guard", async () => {
    let liberar!: () => void;
    const portao = new Promise<void>((res) => {
      liberar = res;
    });

    // 1ª "aprovação" (outra aba/terapeuta): avança a versão e segura o lock
    // da linha até o teste liberar o portão.
    const primeira = owner2.begin(async (sql) => {
      await sql`UPDATE extraction
        SET estado = 'aprovada', versao = versao + 1, revisado_por = ${U_T1}, revisado_em = now()
        WHERE id = ${EX} AND versao = 1`;
      await portao;
    });

    // Garante que o UPDATE acima já pegou o lock antes de o app tentar.
    await esperarAte(async () => {
      const [r] = await owner`SELECT count(*)::int AS n FROM pg_locks l
          JOIN pg_class c ON c.oid = l.relation
          WHERE c.relname = 'extraction' AND l.mode = 'RowExclusiveLock' AND l.granted`;
      return (r!.n as number) >= 1;
    });

    // 2ª aprovação (o app), com a versão que o cliente viu (1). Tem que ficar
    // presa no lock — colisão REAL, não sequencial.
    const segunda = A.aprovarExtracao(ctxT1, { extractionId: EX, versao: 1 });
    await esperarAte(async () => (await backendsEsperandoLock()) >= 1);

    liberar();
    await primeira;
    const r = await segunda;

    expect(r.ok).toBe(false);
    expect(r.error).toBe("CONCURRENCY_ERROR");

    const [row] =
      await owner`SELECT estado, versao FROM extraction WHERE id = ${EX}`;
    expect(row!.estado).toBe("aprovada");
    expect(row!.versao).toBe(2);
    // o app não gravou nada por cima da 1ª aprovação
    const ev = await owner`SELECT id FROM evidence WHERE extraction_id = ${EX}`;
    expect(ev.length).toBe(0);
  });
});
