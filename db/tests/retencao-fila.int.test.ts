/**
 * #352 — Fila de elegíveis (`app_pacientes_expurgaveis`, migração 0128).
 *
 * A fila é a única leitura que a tela de Retenção & Expurgo faz. Sendo
 * SECURITY DEFINER, o guard interno é a ÚNICA fronteira: nenhuma policy roda
 * por baixo dela. Por isso o isolamento cross-tenant é caso de teste, e não
 * consequência presumida da RLS.
 *
 * Os dois casos que mais parecem detalhe e não são:
 *  - `total` tem que refletir o conjunto FILTRADO inteiro, não a página.
 *    `count(*) OVER ()` depois do LIMIT devolve o total da página e a
 *    paginação da tela mente sem estourar.
 *  - sem tenant no GUC a função tem que levantar `P0001` (de
 *    `app_clinic_id_exigido()`), não `42704`/`22P02` de cast cru nem — pior —
 *    devolver zero linhas em silêncio.
 *
 * Roda com `--config vitest.integration.config.ts`; sem ela coleta ZERO e sai
 * verde. Conferir a CONTAGEM.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-0000003521aa";
const CLINIC_B = "00000000-0000-0000-0000-0000003521bb";
const U_COORD_A = "00000000-0000-0000-0000-0000003521c1";
const U_COORD_B = "00000000-0000-0000-0000-0000003521c2";

const P_A1 = "00000000-0000-0000-0000-000000352101"; // elegível, avisado
const P_A2 = "00000000-0000-0000-0000-000000352102"; // elegível, não avisado
const P_A3 = "00000000-0000-0000-0000-000000352103"; // elegível
const P_A_SOB_GUARDA = "00000000-0000-0000-0000-000000352104"; // não elegível
const P_B1 = "00000000-0000-0000-0000-000000352105"; // elegível, clínica B

type LinhaFila = {
  paciente_id: string;
  nome: string;
  alta_em: string;
  vence_em: string;
  avisado_em: Date | null;
  total: string;
};

/** `SQLSTATE` da exceção, ou `null` se a promessa NÃO rejeitou. */
const codigoPg = (p: Promise<unknown>): Promise<string | null> =>
  p.then(
    () => null,
    (e: unknown) => (e as { code?: string }).code ?? null,
  );

const ctx = (userId: string, clinicId: string) =>
  ({ role: "coordenador", userId, clinicId }) as TenantContext;

const lerFila = async (
  userId: string,
  clinicId: string,
  limite = 25,
  off = 0,
) =>
  (await withTenant(ctx(userId, clinicId), (db) =>
    db.execute(
      sql`SELECT * FROM app_pacientes_expurgaveis(${limite}::integer, ${off}::integer)`,
    ),
  )) as unknown as LinhaFila[];

describe.skipIf(!hasDb)("#352 · fila de pacientes expurgáveis", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE audit_log, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica 352 fila A'), (${CLINIC_B}, 'Clínica 352 fila B')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord+352fila@a.test'),
      (${U_COORD_B}, 'Coord B', 'coord+352fila@b.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    // Vencimentos distintos para a ordenação ser observável: quem vence antes
    // aparece antes.
    await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento, alta_em) VALUES
      (${P_A1},           ${CLINIC_A}, 'Fila A1', '1980-01-01', '2001-01-01'),
      (${P_A2},           ${CLINIC_A}, 'Fila A2', '1980-01-01', '2002-01-01'),
      (${P_A3},           ${CLINIC_A}, 'Fila A3', '1980-01-01', '2003-01-01'),
      (${P_A_SOB_GUARDA}, ${CLINIC_A}, 'Sob guarda', '2020-01-01', '2024-01-01'),
      (${P_B1},           ${CLINIC_B}, 'Fila B1', '1980-01-01', '2001-01-01')`;
    // Aviso prévio já emitido para A1 — é o que a coluna `avisado_em` mostra.
    await owner!`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${CLINIC_A}, NULL, 'expurgo_aviso_previo', 'patient', ${P_A1}, ${P_A1}, '{"origem":"job"}')`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("12 · a fila só devolve pacientes da clínica do contexto", async () => {
    const filaA = await lerFila(U_COORD_A, CLINIC_A);
    const filaB = await lerFila(U_COORD_B, CLINIC_B);
    expect(filaA.map((l) => l.paciente_id)).toEqual([P_A1, P_A2, P_A3]);
    expect(filaB.map((l) => l.paciente_id)).toEqual([P_B1]);
    // O paciente sob guarda não entra em nenhuma das duas.
    expect(filaA.map((l) => l.paciente_id)).not.toContain(P_A_SOB_GUARDA);
  });

  test("13 · sem tenant no GUC a fila levanta P0001, não 42704 nem 22P02", async () => {
    // `app_clinic_id_exigido()` levanta erro NOMEANDO o problema. Um cast cru
    // de `current_setting` estouraria 42704/22P02 sem dizer qual tenant falta,
    // e `app_clinic_id_atual()` devolveria NULL e sumiria com as linhas em
    // silêncio — que é o modo de falha pior dos três.
    const codigo = await codigoPg(
      owner!.begin(async (tx) => {
        await tx`SET LOCAL ROLE app_role`;
        await tx`SELECT * FROM app_pacientes_expurgaveis(25, 0)`;
      }),
    );
    expect(codigo).toBe("P0001");
  });

  test("14 · total reflete o conjunto filtrado inteiro, não a página", async () => {
    const pagina = await lerFila(U_COORD_A, CLINIC_A, 2, 0);
    expect(pagina).toHaveLength(2);
    expect(Number(pagina[0]!.total)).toBe(3);
    const segunda = await lerFila(U_COORD_A, CLINIC_A, 2, 2);
    expect(segunda).toHaveLength(1);
    expect(Number(segunda[0]!.total)).toBe(3);
    expect(segunda[0]!.paciente_id).toBe(P_A3);
  });

  test("15 · avisado_em vem preenchido quando há aviso e NULL quando não há", async () => {
    const fila = await lerFila(U_COORD_A, CLINIC_A);
    const porId = new Map(fila.map((l) => [l.paciente_id, l]));
    expect(porId.get(P_A1)!.avisado_em).not.toBeNull();
    expect(porId.get(P_A2)!.avisado_em).toBeNull();
    expect(porId.get(P_A3)!.avisado_em).toBeNull();
  });
});
