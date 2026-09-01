/**
 * T03 (#512) — `/sessoes`: queries e escopo (`src/app/(app)/sessoes/queries.ts`).
 *
 * O que este arquivo prova:
 *   - R-14: `escopoTexto` sai por extenso e certo por papel — "N sessões da
 *     clínica" (coordenador) vs "N sessões suas" (terapeuta) — e reflete o
 *     total do ESCOPO, não o total já filtrado por terapeuta.
 *   - R-15: default de ordenação diverge por papel (coordenador: mais antiga
 *     primeiro; terapeuta: mais recente primeiro), e o parâmetro `ordenacao`
 *     troca a direção quando pedido explicitamente.
 *   - R-16: filtro por terapeuta (aplicado só para coordenador — terapeuta
 *     puro já só vê as próprias sessões) reduz o conjunto paginado sem tocar
 *     `escopoTexto`/`totalNoEscopo`.
 *   - R-19: paginação real sobre o conjunto filtrado — `total` muda com o
 *     filtro, `totalNoEscopo` não.
 *   - R-33: fila vazia (por escopo limpo OU por filtro que não bate com
 *     ninguém) devolve `vazio: true` e `vazioTexto` contendo literalmente
 *     "Nada travado".
 *
 * Harness igual ao de `sessao-fila.int.test.ts` (T02).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-000000001a01";
const U_COORD_A = "00000000-0000-0000-0000-00000000c1a1";
const U_T1_A = "00000000-0000-0000-0000-00000000711a";
const U_T2_A = "00000000-0000-0000-0000-00000000721a";

const PAC_1 = "00000000-0000-0000-0000-00000000ac1a"; // equipe: T1
const PAC_2 = "00000000-0000-0000-0000-00000000ac2a"; // equipe: T2

const S_T1_MAIS_ANTIGA = "00000000-0000-0000-0000-000000061a01";
const S_T1_MAIS_RECENTE = "00000000-0000-0000-0000-000000061a02";
const S_T2_TRAVADA = "00000000-0000-0000-0000-000000061a03";

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

const AGORA = new Date("2026-09-01T12:00:00.000Z");
const H72_ATRAS = new Date(AGORA.getTime() - 72 * 3600_000);
const H48_ATRAS = new Date(AGORA.getTime() - 48 * 3600_000);
const H30_ATRAS = new Date(AGORA.getTime() - 30 * 3600_000);

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let queries: typeof import("../../src/app/(app)/sessoes/queries");

describe.skipIf(!hasDb)("T03 · /sessoes queries e escopo", () => {
  beforeAll(async () => {
    queries = await import("../../src/app/(app)/sessoes/queries");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, session_note, extraction, evidence, evidence_revision, evidence_query
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (lista)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.lista@t.com'),
      (${U_T1_A}, 'Ana Terapeuta', 't1.a.lista@t.com'),
      (${U_T2_A}, 'Beto Terapeuta', 't2.a.lista@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_1}, ${CLINIC_A}, 'Paciente 1 (lista)'),
      (${PAC_2}, ${CLINIC_A}, 'Paciente 2 (lista)')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC_1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia'),
      (${PAC_2}, ${U_T2_A}, 'ABA', 'terapeuta_referencia')`;

    // Três travadas por `sem_nota_apos_24h`: 2 de T1 (idades diferentes) + 1 de T2.
    await owner`INSERT INTO session
        (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
      (${S_T1_MAIS_ANTIGA},  ${CLINIC_A}, ${PAC_1}, ${U_T1_A}, ${H72_ATRAS}, 'realizada', 1, 'aba'),
      (${S_T1_MAIS_RECENTE}, ${CLINIC_A}, ${PAC_1}, ${U_T1_A}, ${H30_ATRAS}, 'realizada', 2, 'aba'),
      (${S_T2_TRAVADA},      ${CLINIC_A}, ${PAC_2}, ${U_T2_A}, ${H48_ATRAS}, 'realizada', 1, 'aba')`;
    // Sem `session_note` nenhuma: as 3 caem em `sem_nota_apos_24h`.
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("escopoTexto por extenso e por papel (R-14)", async () => {
    const doCoord = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
    });
    expect(doCoord.escopoTexto).toBe("3 sessões da clínica");
    expect(doCoord.totalNoEscopo).toBe(3);

    const doT1 = await queries.carregarFilaSessoes(ctxT1A, { agora: AGORA });
    expect(doT1.escopoTexto).toBe("2 sessões suas");
    expect(doT1.totalNoEscopo).toBe(2);
  });

  test("default de ordenação diverge por papel e o parâmetro troca a direção (R-15)", async () => {
    const coordDefault = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
    });
    expect(coordDefault.ordenacao).toBe("tempo_travado");
    // Mais antiga primeiro.
    expect(coordDefault.itens[0]?.sessionId).toBe(S_T1_MAIS_ANTIGA);

    const t1Default = await queries.carregarFilaSessoes(ctxT1A, {
      agora: AGORA,
    });
    expect(t1Default.ordenacao).toBe("dia");
    // Mais recente primeiro.
    expect(t1Default.itens[0]?.sessionId).toBe(S_T1_MAIS_RECENTE);

    const coordInvertido = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
      ordenacao: "dia",
    });
    expect(coordInvertido.itens[0]?.sessionId).not.toBe(S_T1_MAIS_ANTIGA);
  });

  test("filtro por terapeuta reduz o total sem mexer no escopo (R-16)", async () => {
    const filtrado = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
      terapeutaId: U_T2_A,
    });
    expect(filtrado.total).toBe(1);
    expect(filtrado.totalNoEscopo).toBe(3);
    expect(filtrado.escopoTexto).toBe("3 sessões da clínica");
    expect(filtrado.itens.map((i) => i.sessionId)).toEqual([S_T2_TRAVADA]);

    // Terapeuta puro: o filtro não se aplica (ele já só vê as próprias).
    const t1ComFiltroIgnorado = await queries.carregarFilaSessoes(ctxT1A, {
      agora: AGORA,
      terapeutaId: U_T2_A,
    });
    expect(t1ComFiltroIgnorado.total).toBe(2);
  });

  test("lista as opções de terapeuta a partir do próprio conjunto do escopo", async () => {
    const doCoord = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
    });
    expect(doCoord.terapeutas.map((t) => t.nome)).toEqual([
      "Ana Terapeuta",
      "Beto Terapeuta",
    ]);
  });

  test("paginação real sobre o conjunto filtrado (R-19)", async () => {
    const pagina1 = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
      porPagina: 2,
      pagina: 1,
    });
    expect(pagina1.total).toBe(3);
    expect(pagina1.totalPaginas).toBe(2);
    expect(pagina1.itens.length).toBe(2);

    const pagina2 = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
      porPagina: 2,
      pagina: 2,
    });
    expect(pagina2.itens.length).toBe(1);

    const juntas = [...pagina1.itens, ...pagina2.itens].map((i) => i.sessionId);
    expect(new Set(juntas).size).toBe(3);
  });

  test("fila vazia por filtro sem correspondência é empty-state 'Nada travado' (R-33)", async () => {
    const semNinguem = await queries.carregarFilaSessoes(ctxCoordA, {
      agora: AGORA,
      terapeutaId: "00000000-0000-0000-0000-000000000000",
    });
    expect(semNinguem.vazio).toBe(true);
    expect(semNinguem.vazioTexto).toContain("Nada travado");
    expect(semNinguem.total).toBe(0);
    // Escopo continua contando o que existe de fato — o vazio é do filtro.
    expect(semNinguem.totalNoEscopo).toBe(3);
  });

  test("fila vazia por escopo limpo é empty-state 'Nada travado' (R-33)", async () => {
    const outraClinica = {
      clinicId: "00000000-0000-0000-0000-0000000000ff",
      userId: "00000000-0000-0000-0000-0000000000fe",
      role: "coordenador",
    } as const;
    const resultado = await queries.carregarFilaSessoes(outraClinica, {
      agora: AGORA,
    });
    expect(resultado.vazio).toBe(true);
    expect(resultado.vazioTexto).toContain("Nada travado");
    expect(resultado.escopoTexto).toBe("0 sessões da clínica");
  });
});
