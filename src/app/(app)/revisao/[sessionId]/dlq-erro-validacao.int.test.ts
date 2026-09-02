/**
 * Auditoria 360 · Q-01 (#532) — DLQ da revisão (`erro_validacao`).
 *
 * Antes deste fix, quando `inserirEvidenciasOnApprove` lançava, o catch de
 * `transicionar()` gravava `payload_editado = {error: msg}` SEM guard de
 * `versao`. Consequências provadas aqui, contra o banco real:
 *
 *  1. Reaprovar lia `payloadEditado ?? payload` → `{error}` → `alvos = []` →
 *     extração virava `aprovada` com ZERO `evidence` (dado clínico perdido em
 *     silêncio). Agora o detalhe do erro vai para a coluna própria
 *     `erro_validacao_detalhe` (`{codigo, hash, quando}` — sem a `message`
 *     crua do driver, que carrega SQL + params = PHI) e `payload_editado`
 *     fica intacto; reaprovar a partir de `erro_validacao` usa o `payload`
 *     original e grava a `evidence`.
 *  2. O DLQ sem guard sobrescrevia qualquer transição concorrente (uma
 *     extração já `descartada` voltava a `erro_validacao`). Agora o UPDATE do
 *     DLQ exige `versao = versão vista pelo cliente`; a colisão é FORÇADA
 *     (memória `teste-de-corrida-nao-exercita-a-colisao`): o escritor
 *     concorrente fica de fato esperando o lock da linha — provado via
 *     `pg_stat_activity` — antes de a falha ser lançada.
 *  3. Reaprovar a partir de `erro_validacao` uma `evidencia` sem alvos falha
 *     com `EVIDENCIA_VAZIA`, nunca `aprovada` silenciosa.
 *
 * A falha do pipeline é INJETADA em `materializarSnapshot` (último passo do
 * on-approve, depois de `evidence` já inserida na transação) — o ponto em que
 * uma quebra real deixaria a transação inteira para trás.
 *
 * Payload no formato de PRODUÇÃO (objeto FLAT do subtipo, como
 * `LlmExtractionProvider.payloadDoSubtipo` e `DemoStubProvider` gravam) — e
 * não o formato aninhado `{evidencia: {...}}` dos testes mais antigos.
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

// Injeção de falha controlada pelo teste. `antesDeLancar` permite disparar o
// escritor concorrente e esperar ele travar no lock ANTES de a falha subir.
const falha: {
  ativa: boolean;
  antesDeLancar: null | (() => Promise<void>);
} = { ativa: false, antesDeLancar: null };

const MENSAGEM_CRUA =
  "falha injetada no pipeline on-approve: SELECT segredo FROM paciente";

vi.mock("@/lib/evidence/materializar", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/lib/evidence/materializar")>();
  return {
    ...mod,
    materializarSnapshot: async (
      ...args: Parameters<typeof mod.materializarSnapshot>
    ) => {
      if (falha.ativa) {
        if (falha.antesDeLancar) await falha.antesDeLancar();
        throw Object.assign(new Error(MENSAGEM_CRUA), { code: "P0001" });
      }
      return mod.materializarSnapshot(...args);
    },
  };
});

const CLINIC = "00000000-0000-0000-0000-0000000000f4";
const U_T1 = "00000000-0000-0000-0000-0000000071f4";
const PAC = "00000000-0000-0000-0000-00000000acf4";
const SESS = "00000000-0000-0000-0000-00000005e1f4";
const PROTOCOL = "00000000-0000-0000-0000-000000010004";
const GOAL = "00000000-0000-0000-0000-000000020004";
const MILESTONE_TATO = "00000000-0000-0000-0000-000000030004";

const EX_OK = "00000000-0000-0000-0000-00000e0d0001"; // sugerida, com alvos (flat)
const EX_ERRO_SEM_ALVOS = "00000000-0000-0000-0000-00000e0d0002"; // erro_validacao, sem alvos
const EX_ERRO_LEGADO = "00000000-0000-0000-0000-00000e0d0003"; // erro_validacao, payload_editado legado {error}

const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let owner2: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let A: typeof import("./logic");

/** Quantos backends deste banco estão esperando um lock numa query de `extraction`. */
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
  await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica DLQ Q-01')`;
  await owner`INSERT INTO app_user (id, email, name) VALUES (${U_T1}, 't1.dlq@t.com', 'T1')`;
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
  await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, criterio_dominio, criado_por) VALUES
    (${GOAL}, ${PAC}, ${CLINIC}, 'Meta de tato', ${owner.json({ tipo: "percentual", valor: 80 })}, ${U_T1})`;
  await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, nivel, tipo_estrutura, estrutura) VALUES
    (${MILESTONE_TATO}, ${PROTOCOL}, 'tato', 'Tato nível 1', '1', 'marco_simples', '{}')`;

  // payload FLAT (formato de produção): o próprio objeto `evidencia`.
  await owner`INSERT INTO extraction
      (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, payload_editado) VALUES
    (${EX_OK}, ${SESS}, ${CLINIC}, 'sugerida', 'evidencia', 'nomeou o carro', 'alta',
      ${owner.json({
        descricao: "nomeou o carro",
        funcao: "tato",
        alvos: [{ goal_id: GOAL, protocol_id: "vbmapp", dominio_id: "tato" }],
      })}, NULL),
    (${EX_ERRO_SEM_ALVOS}, ${SESS}, ${CLINIC}, 'erro_validacao', 'evidencia', 'olhou pro carro', 'alta',
      ${owner.json({ descricao: "olhou pro carro", funcao: "tato" })}, NULL),
    (${EX_ERRO_LEGADO}, ${SESS}, ${CLINIC}, 'erro_validacao', 'evidencia', 'apontou o carro', 'alta',
      ${owner.json({
        descricao: "apontou o carro",
        funcao: "tato",
        alvos: [{ goal_id: GOAL, protocol_id: "vbmapp", dominio_id: "tato" }],
      })},
      ${owner.json({ error: "lixo legado gravado pelo DLQ antigo" })})`;
}

describe.skipIf(!hasDb)("DLQ da revisão — Q-01 (#532)", () => {
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
  beforeEach(async () => {
    falha.ativa = false;
    falha.antesDeLancar = null;
    await seed();
  });

  test("pipeline quebra → DLQ grava em erro_validacao_detalhe (sem message crua), payload_editado intacto; reaprovar insere a evidence", async () => {
    falha.ativa = true;
    const r1 = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_OK,
      versao: 1,
    });
    expect(r1.ok).toBeFalsy();
    expect(r1.error).toBeTruthy();
    // a mensagem crua (que pode carregar SQL + params) não volta para a UI
    expect(r1.error).not.toContain("SELECT segredo");

    const [dlq] =
      await owner`SELECT estado, versao, payload_editado FROM extraction WHERE id = ${EX_OK}`;
    expect(dlq!.estado).toBe("erro_validacao");
    expect(dlq!.versao).toBe(2);
    // Q-01: o DLQ NÃO pode contaminar o conteúdo efetivo da extração
    expect(dlq!.payload_editado).toBeNull();

    const [det] =
      await owner`SELECT erro_validacao_detalhe FROM extraction WHERE id = ${EX_OK}`;
    const detalhe = det!.erro_validacao_detalhe as Record<string, unknown>;
    expect(detalhe.codigo).toBe("P0001");
    expect(detalhe.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(typeof detalhe.quando).toBe("string");
    expect(JSON.stringify(detalhe)).not.toContain("SELECT segredo");
    expect(JSON.stringify(detalhe)).not.toContain("falha injetada");

    // A transação da 1ª tentativa foi desfeita inteira: nenhuma evidence sobrou.
    const antes =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_OK}`;
    expect(antes.length).toBe(0);

    // Pipeline saudável de novo: reaprovar a partir de erro_validacao (versão
    // que o DLQ deixou) lê o payload ORIGINAL e grava a evidence.
    falha.ativa = false;
    const r2 = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_OK,
      versao: 2,
    });
    expect(r2.ok).toBe(true);

    const depois =
      await owner`SELECT milestone_id, goal_id FROM evidence WHERE extraction_id = ${EX_OK}`;
    expect(depois.length).toBe(1);
    expect(depois[0]!.milestone_id).toBe(MILESTONE_TATO);
    expect(depois[0]!.goal_id).toBe(GOAL);

    const [fim] =
      await owner`SELECT estado, erro_validacao_detalhe FROM extraction WHERE id = ${EX_OK}`;
    expect(fim!.estado).toBe("aprovada");
    expect(fim!.erro_validacao_detalhe).toBeNull();
  });

  test("guard de versão no DLQ: transição concorrente que venceu a corrida NÃO é sobrescrita para erro_validacao", async () => {
    falha.ativa = true;
    let concorrente: Promise<unknown> | null = null;
    falha.antesDeLancar = async () => {
      // Escritor concorrente (outro terapeuta/aba descartando a mesma
      // extração). Fica preso no lock da linha, que a transação de aprovação
      // já segura — só anda quando ela desfizer.
      // `.execute()`: a query do postgres.js é preguiçosa — sem isto ela só
      // partiria no `await` lá embaixo, DEPOIS do DLQ, e o teste não
      // exercitaria colisão nenhuma.
      concorrente = owner2`UPDATE extraction
        SET estado = 'descartada', versao = versao + 1
        WHERE id = ${EX_OK} AND versao = 1`.execute();
      await esperarAte(async () => (await backendsEsperandoLock()) >= 1);
    };

    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_OK,
      versao: 1,
    });
    expect(r.ok).toBeFalsy();
    await concorrente;

    // O escritor concorrente venceu (versão avançou para 2). O DLQ, cujo
    // cliente viu versão 1, tem que recusar — sem guard ele regressaria uma
    // `descartada` para `erro_validacao`.
    const [row] =
      await owner`SELECT estado, versao, erro_validacao_detalhe FROM extraction WHERE id = ${EX_OK}`;
    expect(row!.estado).toBe("descartada");
    expect(row!.versao).toBe(2);
    expect(row!.erro_validacao_detalhe).toBeNull();
  });

  test("EVIDENCIA_VAZIA: reaprovar erro_validacao de `evidencia` sem alvos falha explicitamente, nunca vira aprovada", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_ERRO_SEM_ALVOS,
      versao: 1,
    });
    expect(r.ok).toBeFalsy();
    expect(r.error).toBe("EVIDENCIA_VAZIA");

    const [row] =
      await owner`SELECT estado, versao FROM extraction WHERE id = ${EX_ERRO_SEM_ALVOS}`;
    expect(row!.estado).toBe("erro_validacao");
    expect(row!.versao).toBe(1); // transação desfeita: nem a versão anda
    const ev =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_ERRO_SEM_ALVOS}`;
    expect(ev.length).toBe(0);
  });

  test("reaprovar a partir de erro_validacao usa o payload ORIGINAL — payload_editado legado {error} é ignorado", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_ERRO_LEGADO,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const ev =
      await owner`SELECT milestone_id, classificacao_original FROM evidence WHERE extraction_id = ${EX_ERRO_LEGADO}`;
    expect(ev.length).toBe(1);
    expect(ev[0]!.milestone_id).toBe(MILESTONE_TATO);
    expect(ev[0]!.classificacao_original).toMatchObject({
      descricao: "apontou o carro",
      alvo: { protocol_id: "vbmapp", dominio_id: "tato" },
    });
    const [row] =
      await owner`SELECT estado FROM extraction WHERE id = ${EX_ERRO_LEGADO}`;
    expect(row!.estado).toBe("aprovada");
  });
});
