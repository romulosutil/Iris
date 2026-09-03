import postgres from "postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";
vi.mock("server-only", () => ({}));

/**
 * O CONTRATO DO LOTE de `app_fatos_prontidao` (#559, achado do PR
 * `fix/prontidao-contrato-null`).
 *
 * `listarTodosPacientes` (`./queries.ts`) chama o definer UMA vez com o array
 * de ids da página inteira. O guard interno do definer é um `FOREACH` que
 * `RAISE` no PRIMEIRO id não autorizado — não existe ramo "pula este e
 * segue", e não deve existir: guard que devolve `false` silencioso para linha
 * não autorizada é justamente o defeito que a `0149` foi escrita para tirar.
 *
 * Consequência: UM id invisível no lote derruba a chamada INTEIRA. A pill de
 * prontidão sumiria da lista toda, não da linha ofensora — e, pior, o erro
 * sobe de dentro do `withTenant` de `listarTodosPacientes`, então derrubaria a
 * página `/pacientes` completa.
 *
 * Hoje isso não acontece porque `linhas` sai de um `SELECT` sobre `patient` na
 * MESMA transação, sob `patient_select` — cujo predicado é SUBCONJUNTO do
 * guard do definer para os dois papéis que chegam lá. Mas isso era ACIDENTE
 * de arranjo, não contrato escrito. Este arquivo o torna contrato, medindo os
 * dois lados:
 *
 * 1. a chamada CRUA ao definer com um lote misto REJEITA (o perigo é real);
 * 2. `listarTodosPacientes` para o MESMO terapeuta, na MESMA clínica com o
 *    MESMO paciente alheio presente, devolve a lista com a pill intacta (o
 *    pré-filtro é o que a salva).
 *
 * Sem o par, o teste (2) sozinho passaria mesmo se o definer fosse tolerante,
 * e não provaria nada sobre o pré-filtro.
 */

const CLINIC = "00000000-0000-0000-0000-00000000c1a1";
const U_COORD = "00000000-0000-0000-0000-00000000c0d1";
const U_T1 = "00000000-0000-0000-0000-0000000000f1";
/** Paciente NA equipe de T1 — o que ele enxerga por `app_is_on_team`. */
const PAC_DA_EQUIPE = "00000000-0000-0000-0000-0000000000e1";
/** Mesma clínica, FORA da equipe de T1: invisível para ele sob `patient_select`
 * e recusado pelo guard do definer. É o id que derrubaria o lote. */
const PAC_ALHEIO = "00000000-0000-0000-0000-0000000000a2";

const ctxCoord = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let listarTodosPacientes: typeof import("./queries").listarTodosPacientes;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("prontidão em lote — contrato do pré-filtro", () => {
  beforeAll(async () => {
    ({ listarTodosPacientes } = await import("./queries"));
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient,
      care_team_membership RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord@lote.test', 'Coord'),
      (${U_T1}, 't1@lote.test', 'T1')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_T1}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_DA_EQUIPE}, ${CLINIC}, 'Da equipe'),
      (${PAC_ALHEIO}, ${CLINIC}, 'Alheio')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC_DA_EQUIPE}, ${U_T1}, 'terapeuta_referencia', 'ABA')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  // (1) O perigo é REAL — sem isto, o teste (2) não prova o pré-filtro.
  test("chamada CRUA ao definer com lote misto rejeita: um id invisível derruba o lote inteiro", async () => {
    await expect(
      withTenant(ctxT1, (tx) =>
        // Mesmo idioma de `queries.ts`: `sql.param` no array, nunca
        // `ARRAY[${ids}]` interpolado (vira row constructor com n>=2).
        tx.execute(
          sql`SELECT * FROM app_fatos_prontidao(${sql.param([PAC_DA_EQUIPE, PAC_ALHEIO])}::uuid[])`,
        ),
      ),
    ).rejects.toThrow();
  });

  // (2) …e o pré-filtro é o que a lista tem contra ele.
  test("listarTodosPacientes(terapeuta) não quebra e mantém a pill, com paciente alheio na MESMA clínica", async () => {
    const lista = await listarTodosPacientes(ctxT1);
    // `patient_select` já tirou o alheio: o lote nunca o vê.
    expect(lista.map((p) => p.id)).toEqual([PAC_DA_EQUIPE]);
    // `proximoPasso` é o que a pill mostra. `null` significaria "prontuário
    // pronto"; num paciente recém-criado tem que haver degrau pendente — se
    // o lote tivesse estourado, a lista inteira viria sem pill.
    expect(lista[0]?.proximoPasso).toBeTruthy();
  });

  test("listarTodosPacientes(coordenador) devolve os DOIS com pill", async () => {
    const lista = await listarTodosPacientes(ctxCoord);
    expect(lista.map((p) => p.id).sort()).toEqual(
      [PAC_DA_EQUIPE, PAC_ALHEIO].sort(),
    );
    for (const p of lista) expect(p.proximoPasso).toBeTruthy();
  });
});
