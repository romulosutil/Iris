/**
 * T06 (#512) — `/sessoes/[id]`: queries de leitura + R-36 (captura acumula,
 * nunca INSERT de N linhas).
 *
 * O que este arquivo prova:
 *   - `carregarSessao` (queries.ts) deriva o mesmo estado que `deriveEstadoSessao`
 *     (T01) devolveria para as mesmas linhas — sem reimplementar a regra.
 *   - `temCaptura` reflete a existência de `captura_rapida` com texto não vazio.
 *   - R-36: chamar `capturarDiario` (core reusado de `/diario/[sessionId]`)
 *     duas vezes na mesma sessão deixa EXATAMENTE 1 linha `captura_rapida` —
 *     é `UNIQUE(session_id, tipo)` + `onConflictDoUpdate`, nunca `INSERT` de
 *     N linhas (spec A7). Duas chamadas com textos diferentes: a segunda
 *     GANHA (é a mesma linha, sobrescrita) — comportamento de acúmulo na
 *     UI (o cliente concatena antes de enviar), não de histórico no banco.
 *
 * Harness igual ao de `sessao-fila.int.test.ts`.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC = "00000000-0000-0000-0000-0000000000d1";
const U_COORD = "00000000-0000-0000-0000-00000000c0d1";
const U_T1 = "00000000-0000-0000-0000-0000000071d1";
const PAC = "00000000-0000-0000-0000-00000000acd1";

const S_REALIZADA_SEM_NOTA = "00000000-0000-0000-0000-00000006d0d1";
const S_DOCUMENTADA = "00000000-0000-0000-0000-00000006d0d2";
const S_CAPTURA = "00000000-0000-0000-0000-00000006d0d3";

const PROTO = "00000000-0000-0000-0000-00000070c0d1";
const GOAL = "00000000-0000-0000-0000-0000000690d1";

const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;
const ctxCoord = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;

const AGORA = new Date("2026-09-01T12:00:00.000Z");
const H2_ATRAS = new Date(AGORA.getTime() - 2 * 3600_000);

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let queries: typeof import("../../src/app/(app)/sessoes/[id]/queries");
let diarioLogic: typeof import("../../src/app/(app)/diario/[sessionId]/logic");

describe.skipIf(!hasDb)("T06 · /sessoes/[id] — queries de leitura", () => {
  beforeAll(async () => {
    queries = await import("../../src/app/(app)/sessoes/[id]/queries");
    diarioLogic = await import("../../src/app/(app)/diario/[sessionId]/logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, session_note, extraction, protocol, patient_protocol, goal
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES ('aba_marcos_desenvolvimento', 'Marcos de desenvolvimento (ABA)') ON CONFLICT DO NOTHING`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC}, 'Clínica detalhe', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord.detalhe@t.com'),
      (${U_T1}, 'Terapeuta 1', 't1.detalhe@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_T1}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente detalhe')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC}, ${U_T1}, 'ABA', 'terapeuta_referencia')`;

    await owner`INSERT INTO session
        (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
      (${S_REALIZADA_SEM_NOTA}, ${CLINIC}, ${PAC}, ${U_T1}, ${H2_ATRAS}, 'realizada', 1, 'aba'),
      (${S_DOCUMENTADA},        ${CLINIC}, ${PAC}, ${U_T1}, ${H2_ATRAS}, 'realizada', 2, 'aba'),
      (${S_CAPTURA},            ${CLINIC}, ${PAC}, ${U_T1}, ${H2_ATRAS}, 'realizada', 3, 'aba')`;

    await owner`INSERT INTO session_note (session_id, clinic_id, tipo, texto, autor_id) VALUES
      (${S_DOCUMENTADA}, ${CLINIC}, 'nota_consolidada', 'nota', ${U_T1})`;
    await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${S_DOCUMENTADA}, ${CLINIC}, 'sugerida', 'evidencia', 'trecho', 'alta', ${owner.json({})})`;

    // T07b/T07c — o R-36 abaixo chama `capturarDiario`, que passou a correr a
    // régua única de documentação (`assertPodeDocumentar`) ANTES da escrita.
    // `PAC` nasce sem `clinical_modality`, e o default do schema é
    // `protocol_driven`, cujos degraus BLOQUEANTES são protocolo e meta
    // (`modalidade.ts`). Sem os dois, a primeira captura é recusada com
    // `ProntuarioIncompletoError` e o R-36 nunca chega a testar o que existe
    // para testar (idempotência da captura). Não é contorno: documentar passou
    // a ter pré-condição clínica real, e um prontuário sem protocolo nem meta
    // deixou de ser um estado a partir do qual se documenta.
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO}, ${CLINIC}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento')`;
    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por, ativado_em, desativado_em)
      VALUES (${PAC}, ${PROTO}, ${U_T1}, now()::date, NULL)`;
    await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${GOAL}, ${PAC}, ${CLINIC}, 'Pedir água sozinho', 'ativa', '{"tipo":"frequencia","valor":3}', ${U_T1})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("realizada sem nota: gesto 'documentar', temCaptura false", async () => {
    const dados = await queries.carregarSessao(
      ctxT1,
      S_REALIZADA_SEM_NOTA,
      AGORA,
    );
    expect(dados?.resultado.estado).toBe("realizada");
    expect(dados?.resultado.gesto).toBe("documentar");
    expect(dados?.temCaptura).toBe(false);
    expect(dados?.ehDono).toBe(true);
    expect(dados?.podeVer).toBe(true);
  });

  test("documentada: gesto 'revisar_evidencias' (extração ainda sugerida)", async () => {
    const dados = await queries.carregarSessao(ctxT1, S_DOCUMENTADA, AGORA);
    expect(dados?.resultado.estado).toBe("documentada");
    expect(dados?.resultado.gesto).toBe("revisar_evidencias");
  });

  test("coordenador vê a sessão do terapeuta (podeVer=true), terapeuta é o dono", async () => {
    const dados = await queries.carregarSessao(ctxCoord, S_DOCUMENTADA, AGORA);
    expect(dados?.podeVer).toBe(true);
    expect(dados?.ehDono).toBe(false);
  });

  test("R-36: duas capturas na mesma sessão deixam 1 linha, a segunda sobrescreve", async () => {
    const r1 = await diarioLogic.capturarDiario(ctxT1, {
      sessionId: S_CAPTURA,
      texto: "primeira captura",
    });
    expect(r1.error).toBeUndefined();

    const antes = await queries.carregarSessao(ctxT1, S_CAPTURA, AGORA);
    expect(antes?.temCaptura).toBe(true);

    const r2 = await diarioLogic.capturarDiario(ctxT1, {
      sessionId: S_CAPTURA,
      texto: "primeira captura\n\nsegunda captura (acumulada no cliente)",
    });
    expect(r2.error).toBeUndefined();
    // Mesma linha: mesmo id.
    expect(r2.id).toBe(r1.id);

    const linhas = await owner`
      SELECT count(*)::int AS total, (array_agg(texto))[1] AS texto
      FROM session_note WHERE session_id = ${S_CAPTURA} AND tipo = 'captura_rapida'
    `;
    expect(linhas[0]!.total).toBe(1);
    expect(linhas[0]!.texto as string).toContain("segunda captura");

    const depois = await queries.carregarSessao(ctxT1, S_CAPTURA, AGORA);
    expect(depois?.temCaptura).toBe(true);
  });

  test("sessão inexistente devolve null", async () => {
    const dados = await queries.carregarSessao(
      ctxT1,
      "00000000-0000-0000-0000-000000000000",
      AGORA,
    );
    expect(dados).toBeNull();
  });
});
