/**
 * T02 (#512) — Predicado e contagem únicos da fila de sessões travadas.
 *
 * O que este arquivo prova:
 *   - R-12: `contarTravadas` e `listarTravadas` devolvem o MESMO número para o
 *     mesmo estado de banco. É literalmente o defeito da #511 (dois SQL
 *     parecidos divergindo) — o teste de igualdade é o guarda de mutação.
 *   - R-09: escopo do coordenador é `terapeuta ≠ eu` ∪ `minhas travadas`,
 *     derivado de `session.terapeuta_id`, nunca de contagem de membros da
 *     clínica. Duas clínicas provam que nada vaza pelo tenant.
 *   - O CTE `candidatas` de `fila.ts` é SUPERSET de `motivoAtencao`
 *     (estado.ts): há um teste por motivo (`extracao_travada`,
 *     `sem_nota_apos_24h`, `na_fila_validacao`). Apagar uma perna do `UNION`
 *     derruba um deles. E há uma sessão (`S_T1_REVISADA`) que é candidata mas
 *     NÃO é travada — é ela que dá dente ao teste de igualdade contagem×lista.
 *   - Terminais (cancelada/falta) nunca entram na fila.
 *
 * Harness igual ao de `fase4-evidence-rls.int.test.ts`.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000f1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000f2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0f1";
const U_T1_A = "00000000-0000-0000-0000-0000000071f1";
const U_COORD_B = "00000000-0000-0000-0000-00000000c0f2";
const U_T1_B = "00000000-0000-0000-0000-0000000071f2";

const PAC_A1 = "00000000-0000-0000-0000-00000000acf1"; // equipe: T1_A
const PAC_A2 = "00000000-0000-0000-0000-00000000acf3"; // equipe: COORD_A
const PAC_B1 = "00000000-0000-0000-0000-00000000acf2";

// Sessões da clínica A. Sufixo indica o dono.
const S_T1_EXTRACAO_TRAVADA = "00000000-0000-0000-0000-00000005e0f1";
const S_T1_SEM_NOTA_24H = "00000000-0000-0000-0000-00000005e0f2";
const S_T1_NA_FILA = "00000000-0000-0000-0000-00000005e0f3";
const S_T1_LIMPA = "00000000-0000-0000-0000-00000005e0f4";
const S_T1_CANCELADA = "00000000-0000-0000-0000-00000005e0f5";
// Passa o PRÉ-FILTRO SQL (tem item na fila de validação) mas NÃO é
// `precisa_atencao`: toda extração já decidida → `revisada` (spec §4 P3).
// É esta linha que faz o teste de igualdade contagem×lista ter dente: sem ela,
// candidatas e travadas coincidiriam e um `count(*)` cru passaria despercebido.
const S_T1_REVISADA = "00000000-0000-0000-0000-00000005e0f8";
const S_COORD_TRAVADA = "00000000-0000-0000-0000-00000005e0f6";
const S_B_TRAVADA = "00000000-0000-0000-0000-00000005e0f7";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxT1A = {
  clinicId: CLINIC_A,
  userId: U_T1_A,
  role: "terapeuta",
} as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD_B,
  role: "coordenador",
} as const;
const ctxRecepcaoA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "admin_recepcao",
} as const;

// Hora fixa: `agora` entra por parâmetro (R-04) para a janela de 24h ser
// determinística. Todas as sessões são agendadas relativas a esta âncora.
const AGORA = new Date("2026-09-01T12:00:00.000Z");
const H48_ATRAS = new Date(AGORA.getTime() - 48 * 3600_000);
const H2_ATRAS = new Date(AGORA.getTime() - 2 * 3600_000);

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let fila: typeof import("@/lib/sessao/fila");

describe.skipIf(!hasDb)("T02 · fila de sessões travadas", () => {
  beforeAll(async () => {
    fila = await import("@/lib/sessao/fila");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, session_note, extraction, evidence, evidence_revision, evidence_query
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (fila)', false), (${CLINIC_B}, 'Clínica B (fila)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.fila@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.fila@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.fila@t.com'),
      (${U_T1_B}, 'Terapeuta 1 B', 't1.b.fila@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador'),
      (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (fila)'),
      (${PAC_A2}, ${CLINIC_A}, 'Paciente A2 (fila)'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1 (fila)')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia'),
      (${PAC_A2}, ${U_COORD_A}, 'ABA', 'terapeuta_referencia'),
      (${PAC_B1}, ${U_T1_B}, 'ABA', 'terapeuta_referencia')`;

    await owner`INSERT INTO session
        (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
      (${S_T1_EXTRACAO_TRAVADA}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, ${H2_ATRAS}, 'realizada', 1, 'aba'),
      (${S_T1_SEM_NOTA_24H},     ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, ${H48_ATRAS}, 'realizada', 2, 'aba'),
      (${S_T1_NA_FILA},          ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, ${H2_ATRAS}, 'realizada', 3, 'aba'),
      (${S_T1_LIMPA},            ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, ${H2_ATRAS}, 'realizada', 4, 'aba'),
      (${S_T1_CANCELADA},        ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, ${H48_ATRAS}, 'cancelada', 5, 'aba'),
      (${S_COORD_TRAVADA},       ${CLINIC_A}, ${PAC_A2}, ${U_COORD_A}, ${H2_ATRAS}, 'realizada', 1, 'aba'),
      (${S_B_TRAVADA},           ${CLINIC_B}, ${PAC_B1}, ${U_T1_B}, ${H2_ATRAS}, 'realizada', 1, 'aba'),
      (${S_T1_REVISADA},         ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, ${H2_ATRAS}, 'realizada', 6, 'aba')`;

    // Nota consolidada em todas menos a de `sem_nota_apos_24h` (e a cancelada,
    // que é terminal e não deve entrar de qualquer jeito).
    await owner`INSERT INTO session_note (session_id, clinic_id, tipo, texto, autor_id) VALUES
      (${S_T1_EXTRACAO_TRAVADA}, ${CLINIC_A}, 'nota_consolidada', 'nota', ${U_T1_A}),
      (${S_T1_NA_FILA},          ${CLINIC_A}, 'nota_consolidada', 'nota', ${U_T1_A}),
      (${S_T1_LIMPA},            ${CLINIC_A}, 'nota_consolidada', 'nota', ${U_T1_A}),
      (${S_COORD_TRAVADA},       ${CLINIC_A}, 'nota_consolidada', 'nota', ${U_COORD_A}),
      (${S_B_TRAVADA},           ${CLINIC_B}, 'nota_consolidada', 'nota', ${U_T1_B}),
      (${S_T1_REVISADA},         ${CLINIC_A}, 'nota_consolidada', 'nota', ${U_T1_A})`;

    // extracao_travada: erro_validacao.
    await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${S_T1_EXTRACAO_TRAVADA}, ${CLINIC_A}, 'erro_validacao', 'evidencia', 'trecho', 'alta', ${owner.json({})})`;
    // Clínica B: mesma forma, para provar isolamento de tenant.
    await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${S_B_TRAVADA}, ${CLINIC_B}, 'erro_validacao', 'evidencia', 'trecho', 'alta', ${owner.json({})})`;
    // Sessão do próprio coordenador travada (ramo B do escopo R-09).
    await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${S_COORD_TRAVADA}, ${CLINIC_A}, 'pendente_reprocessamento', 'evidencia', 'trecho', 'alta', ${owner.json({})})`;
    // Sessão limpa: extração decidida, nenhuma evidência na fila → no_acervo.
    await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${S_T1_LIMPA}, ${CLINIC_A}, 'aprovada', 'evidencia', 'trecho', 'alta', ${owner.json({})})`;

    // na_fila_validacao: extração AINDA sugerida (revisão não terminou — é o que
    // faz `motivoAtencao` aceitar este motivo) + evidence de baixa confiança sem
    // revisão nem query aberta (predicado A5 de validacao/queries.ts:17-19).
    const [xFila] = await owner`INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${S_T1_NA_FILA}, ${CLINIC_A}, 'sugerida', 'evidencia', 'trecho', 'baixa', ${owner.json({})})
      RETURNING id`;
    await owner`INSERT INTO evidence
        (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, dominio_id,
         classificacao_original, aprovado_por)
      VALUES (${xFila!.id as string}, ${PAC_A1}, ${S_T1_NA_FILA}, 3, 0, 'mando',
        ${owner.json({ descricao: "x" })}, ${U_T1_A})`;

    // Candidata do pré-filtro que NÃO é travada: item na fila de validação,
    // mas a extração já está `aprovada` → `revisada`, não `precisa_atencao`.
    const [xRevisada] = await owner`INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${S_T1_REVISADA}, ${CLINIC_A}, 'aprovada', 'evidencia', 'trecho', 'baixa', ${owner.json({})})
      RETURNING id`;
    await owner`INSERT INTO evidence
        (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, dominio_id,
         classificacao_original, aprovado_por)
      VALUES (${xRevisada!.id as string}, ${PAC_A1}, ${S_T1_REVISADA}, 6, 0, 'mando',
        ${owner.json({ descricao: "y" })}, ${U_T1_A})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("contagem e lista saem do MESMO predicado — mesmo número (R-12, defeito da #511)", async () => {
    const { total } = await fila.contarTravadas(ctxCoordA, { agora: AGORA });
    const lista = await fila.listarTravadas(ctxCoordA, { agora: AGORA });
    expect(total).toBe(lista.total);
    expect(total).toBe(lista.itens.length);
    expect(total).toBeGreaterThan(0);
  });

  test("coordenador vê as 3 travadas do terapeuta + a própria travada (R-09)", async () => {
    const { itens } = await fila.listarTravadas(ctxCoordA, { agora: AGORA });
    const ids = new Set(itens.map((i) => i.sessionId));
    expect(ids).toEqual(
      new Set([
        S_T1_EXTRACAO_TRAVADA,
        S_T1_SEM_NOTA_24H,
        S_T1_NA_FILA,
        S_COORD_TRAVADA,
      ]),
    );
    // Ramo B do escopo: a travada do próprio coordenador entra e é marcada.
    expect(itens.find((i) => i.sessionId === S_COORD_TRAVADA)?.minha).toBe(
      true,
    );
    expect(
      itens.find((i) => i.sessionId === S_T1_EXTRACAO_TRAVADA)?.minha,
    ).toBe(false);
  });

  test("os 3 motivos aparecem — o pré-filtro SQL é superset de motivoAtencao", async () => {
    const { itens } = await fila.listarTravadas(ctxCoordA, { agora: AGORA });
    const porId = new Map(itens.map((i) => [i.sessionId, i]));
    expect(porId.get(S_T1_EXTRACAO_TRAVADA)?.motivo).toBe("extracao_travada");
    expect(porId.get(S_T1_SEM_NOTA_24H)?.motivo).toBe("sem_nota_apos_24h");
    expect(porId.get(S_T1_NA_FILA)?.motivo).toBe("na_fila_validacao");
    expect(porId.get(S_T1_NA_FILA)?.itensNaFilaValidacao).toBe(1);
  });

  test("sessão sem pendência e sessão terminal não entram na fila", async () => {
    const { itens } = await fila.listarTravadas(ctxCoordA, { agora: AGORA });
    const ids = itens.map((i) => i.sessionId);
    expect(ids).not.toContain(S_T1_LIMPA);
    expect(ids).not.toContain(S_T1_CANCELADA);
    // Candidata do pré-filtro SQL, descartada pela máquina de estados: prova
    // que quem decide "travada" é `deriveEstadoSessao`, não o WHERE.
    expect(ids).not.toContain(S_T1_REVISADA);
  });

  test("cross-tenant: coordenador da clínica B não vê nada da A", async () => {
    const { itens, total } = await fila.listarTravadas(ctxCoordB, {
      agora: AGORA,
    });
    expect(total).toBe(1);
    expect(itens[0]?.sessionId).toBe(S_B_TRAVADA);
    const contagem = await fila.contarTravadas(ctxCoordB, { agora: AGORA });
    expect(contagem.total).toBe(1);
  });

  test("terapeuta vê só as próprias sessões travadas", async () => {
    const { itens } = await fila.listarTravadas(ctxT1A, { agora: AGORA });
    expect(itens.every((i) => i.minha)).toBe(true);
    expect(new Set(itens.map((i) => i.sessionId))).toEqual(
      new Set([S_T1_EXTRACAO_TRAVADA, S_T1_SEM_NOTA_24H, S_T1_NA_FILA]),
    );
  });

  test("admin_recepcao não tem fila de sessões (R-23) e não consulta o banco", async () => {
    const { total } = await fila.contarTravadas(ctxRecepcaoA, { agora: AGORA });
    expect(total).toBe(0);
    const { itens } = await fila.listarTravadas(ctxRecepcaoA, { agora: AGORA });
    expect(itens).toEqual([]);
  });

  test("ordenação por tempo travado (mais antiga primeiro) e paginação preserva o total", async () => {
    const pagina1 = await fila.listarTravadas(ctxCoordA, {
      agora: AGORA,
      limite: 2,
      offset: 0,
    });
    const pagina2 = await fila.listarTravadas(ctxCoordA, {
      agora: AGORA,
      limite: 2,
      offset: 2,
    });
    // `total` é o tamanho do conjunto inteiro, não o da página.
    expect(pagina1.total).toBe(4);
    expect(pagina2.total).toBe(4);
    expect(pagina1.itens.length).toBe(2);
    // A mais antiga (48h atrás) vem primeiro.
    expect(pagina1.itens[0]?.sessionId).toBe(S_T1_SEM_NOTA_24H);
    const juntas = [...pagina1.itens, ...pagina2.itens].map((i) => i.sessionId);
    expect(new Set(juntas).size).toBe(4);
  });
});
