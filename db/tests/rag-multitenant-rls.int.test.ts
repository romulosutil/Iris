/**
 * T6 da #260 — teste de INVASÃO do acervo vetorial (`patient_record_embeddings`).
 *
 * A pergunta que este arquivo responde não é "a policy existe?" — é "a clínica
 * B consegue, por algum caminho, ler um embedding da clínica A?". Os caminhos
 * exercitados, um por um:
 *
 *   1. SELECT direto na tabela, sem filtro (o ingênuo);
 *   2. SELECT direto COM o UUID da linha da outra clínica em mãos (o IDOR —
 *      é ele que separa "não vejo porque não procurei" de "não vejo porque a
 *      RLS não deixa");
 *   3. a coluna `embedding` em si, que não tem GRANT nem para o próprio tenant;
 *   4. `app_rag_search_patient_history`, que é DEFINER e portanto IGNORA a RLS
 *      — o guard interno é a única fronteira ali;
 *   5. `app_rag_indexar_chunk`, a porta de escrita, com paciente de outro
 *      tenant e com consentimento de IA ausente/revogado;
 *   6. escrita direta (INSERT/UPDATE/DELETE), que `app_role` não tem.
 *
 * Régua deliberada: TODO caso negativo é acompanhado do caso positivo simétrico
 * (o dono LÊ a própria linha). Um teste que só afirma "0 linhas" passaria com a
 * tabela vazia, com a GUC errada e com a migração não aplicada — três formas de
 * verde mentiroso. O par positivo é o que prova que o cenário existe.
 *
 * Roda com `pnpm test:rls` (`--config vitest.integration.config.ts`).
 *
 * Limpeza por DELETE escopado, nunca TRUNCATE: a suíte compartilha a base e um
 * TRUNCATE amplo derruba fixture alheia por FK e por deadlock.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

// ── identificadores fixos, legíveis por issue (#260 = ...0260) ──────────────
const CLINICA_A = "00000000-0000-0000-0000-000000260a01";
const CLINICA_B = "00000000-0000-0000-0000-000000260b01";
const USER_A = "00000000-0000-0000-0000-000000260ac1";
const USER_B = "00000000-0000-0000-0000-000000260bc1";
const PAC_A = "00000000-0000-0000-0000-0000002600a1";
const PAC_B = "00000000-0000-0000-0000-0000002600b1";
// Paciente da clínica A SEM consentimento de IA — o gate LGPD (guardrail 2).
const PAC_A_SEM_CONSENT = "00000000-0000-0000-0000-0000002600a2";
const SESS_A = "00000000-0000-0000-0000-0000002605a1";
const SESS_B = "00000000-0000-0000-0000-0000002605b1";
const SESS_A2 = "00000000-0000-0000-0000-0000002605a2";
const NOTA_A = "00000000-0000-0000-0000-0000002607a1";
const NOTA_B = "00000000-0000-0000-0000-0000002607b1";
const NOTA_A2 = "00000000-0000-0000-0000-0000002607a2";
const EMB_A = "00000000-0000-0000-0000-0000002609a1";
const EMB_B = "00000000-0000-0000-0000-0000002609b1";

const MODELO = "modelo-de-teste-260";

/** Sufixo único por arquivo: `app_user.email` é UNIQUE e colide entre int-tests. */
const SUFIXO = "rag260";

const ctxA = {
  clinicId: CLINICA_A,
  userId: USER_A,
  role: "coordenador",
} as const;
const ctxB = {
  clinicId: CLINICA_B,
  userId: USER_B,
  role: "coordenador",
} as const;

/** Vetor de 768 dimensões com 1.0 numa posição e 0 no resto, como literal pgvector. */
function vetorUnitario(posicao: number): string {
  const v = new Array<number>(768).fill(0);
  v[posicao % 768] = 1;
  return `[${v.join(",")}]`;
}

const VETOR_A = vetorUnitario(0);
const VETOR_B = vetorUnitario(1);
const VETOR_CONSULTA = vetorUnitario(0);

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let sqlTag: typeof import("drizzle-orm").sql;

/**
 * Afirma que a promessa rejeita com um SQLSTATE específico do Postgres.
 *
 * Existe porque `toMatchObject({ code })` NÃO funciona aqui: o Drizzle embrulha
 * a exceção num `DrizzleQueryError` cuja `message` é o SQL que NÓS mandamos
 * (com os 768 números do vetor, inclusive) e cujo `code` não existe no topo —
 * o `PostgresError` de verdade fica em `.cause`. Sem desembrulhar, a asserção
 * falha comparando a coisa errada e o diff cospe o vetor inteiro.
 */
async function esperarSqlstate(
  promessa: Promise<unknown>,
  sqlstate: string,
): Promise<void> {
  let capturado: unknown;
  try {
    await promessa;
  } catch (err) {
    capturado = err;
  }
  expect(capturado, `esperava rejeição com SQLSTATE ${sqlstate}`).toBeDefined();
  const causa = (capturado as { cause?: { code?: string } }).cause;
  const code = causa?.code ?? (capturado as { code?: string }).code;
  expect(code).toBe(sqlstate);
}

/** Roda um SQL cru sob a role de app, dentro do contexto de tenant. */
async function comoApp(
  ctx: typeof ctxA | typeof ctxB,
  query: ReturnType<typeof sqlTag>,
) {
  return withTenant(ctx, async (tx) => (await tx.execute(query)) as unknown[]);
}

async function limpar() {
  // Ordem: do derivado para a raiz. `patient_record_embeddings` cai por CASCADE
  // de `session_note`, mas apagá-lo explicitamente deixa o teste independente
  // dessa escolha de FK.
  await owner`DELETE FROM patient_record_embeddings WHERE clinic_id IN (${CLINICA_A}, ${CLINICA_B})`;
  await owner`DELETE FROM session_note WHERE clinic_id IN (${CLINICA_A}, ${CLINICA_B})`;
  await owner`DELETE FROM consent WHERE patient_id IN (${PAC_A}, ${PAC_B}, ${PAC_A_SEM_CONSENT})`;
  await owner`DELETE FROM session WHERE clinic_id IN (${CLINICA_A}, ${CLINICA_B})`;
  await owner`DELETE FROM patient WHERE clinic_id IN (${CLINICA_A}, ${CLINICA_B})`;
  await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINICA_A}, ${CLINICA_B})`;
  await owner`DELETE FROM app_user WHERE id IN (${USER_A}, ${USER_B})`;
  await owner`DELETE FROM clinic WHERE id IN (${CLINICA_A}, ${CLINICA_B})`;
}

describe.skipIf(!hasDb)(
  "#260 · RLS multi-tenant do acervo vetorial (RAG)",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      ({ sql: sqlTag } = await import("drizzle-orm"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await limpar();

      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINICA_A}, 'Clínica A (rag)', false), (${CLINICA_B}, 'Clínica B (rag)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${USER_A}, 'Coord A', ${`coord.a.${SUFIXO}@teste.local`}),
      (${USER_B}, 'Coord B', ${`coord.b.${SUFIXO}@teste.local`})`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${USER_A}, ${CLINICA_A}, 'coordenador'),
      (${USER_B}, ${CLINICA_B}, 'coordenador')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A}, ${CLINICA_A}, 'Paciente A (rag)'),
      (${PAC_B}, ${CLINICA_B}, 'Paciente B (rag)'),
      (${PAC_A_SEM_CONSENT}, ${CLINICA_A}, 'Paciente A sem consentimento (rag)')`;

      // Consentimento de IA VIGENTE para A e B; o terceiro paciente fica sem.
      await owner`INSERT INTO consent (patient_id, tipo, versao_termo) VALUES
      (${PAC_A}, 'uso_ia_processamento', 'ia-v1'),
      (${PAC_B}, 'uso_ia_processamento', 'ia-v1')`;

      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina) VALUES
      (${SESS_A}, ${CLINICA_A}, ${PAC_A}, ${USER_A}, '2026-03-10T13:00:00Z', 'ABA'),
      (${SESS_B}, ${CLINICA_B}, ${PAC_B}, ${USER_B}, '2026-03-11T13:00:00Z', 'ABA'),
      (${SESS_A2}, ${CLINICA_A}, ${PAC_A_SEM_CONSENT}, ${USER_A}, '2026-03-12T13:00:00Z', 'ABA')`;
      await owner`INSERT INTO session_note (id, session_id, clinic_id, tipo, texto, autor_id) VALUES
      (${NOTA_A}, ${SESS_A}, ${CLINICA_A}, 'nota_consolidada', 'diário A', ${USER_A}),
      (${NOTA_B}, ${SESS_B}, ${CLINICA_B}, 'nota_consolidada', 'diário B', ${USER_B}),
      (${NOTA_A2}, ${SESS_A2}, ${CLINICA_A}, 'nota_consolidada', 'diário A2', ${USER_A})`;

      // Embeddings escritos pela role DONA: o objeto sob teste aqui é a LEITURA
      // e o guard dos definers, não o caminho de escrita (que tem casos próprios
      // mais abaixo).
      await owner`INSERT INTO patient_record_embeddings
        (id, clinic_id, patient_id, session_note_id, sessao_em, chunk_indice, trecho, embedding, modelo)
      VALUES
        (${EMB_A}, ${CLINICA_A}, ${PAC_A}, ${NOTA_A}, '2026-03-10T13:00:00Z', 0,
         '[PACIENTE_ID] apontou para o item 3 vezes', ${VETOR_A}::vector, ${MODELO}),
        (${EMB_B}, ${CLINICA_B}, ${PAC_B}, ${NOTA_B}, '2026-03-11T13:00:00Z', 0,
         '[PACIENTE_ID] respondeu ao comando verbal', ${VETOR_B}::vector, ${MODELO})`;
    });

    afterAll(async () => {
      await limpar();
      await owner?.end();
      await appSql?.end();
    });

    // ── 1. leitura direta ─────────────────────────────────────────────────────

    test("dono lê a própria linha (par positivo — prova que o cenário existe)", async () => {
      const linhas = await comoApp(
        ctxA,
        sqlTag`SELECT id, patient_id, trecho FROM patient_record_embeddings`,
      );
      expect(linhas.length).toBe(1);
      expect((linhas[0] as { id: string }).id).toBe(EMB_A);
    });

    test("clínica B NÃO vê nenhum embedding da clínica A (SELECT sem filtro)", async () => {
      const linhas = await comoApp(
        ctxB,
        sqlTag`SELECT id, patient_id FROM patient_record_embeddings`,
      );
      expect(linhas.length).toBe(1);
      expect((linhas[0] as { id: string }).id).toBe(EMB_B);
    });

    test("IDOR: com o UUID da linha de A em mãos, a clínica B lê 0 linhas", async () => {
      const linhas = await comoApp(
        ctxB,
        sqlTag`SELECT id FROM patient_record_embeddings WHERE id = ${EMB_A}::uuid`,
      );
      expect(linhas.length).toBe(0);
    });

    test("IDOR pelo patient_id do outro tenant também devolve 0 linhas", async () => {
      const linhas = await comoApp(
        ctxB,
        sqlTag`SELECT id FROM patient_record_embeddings WHERE patient_id = ${PAC_A}::uuid`,
      );
      expect(linhas.length).toBe(0);
    });

    test("sem GUC de tenant a leitura levanta P0001 nomeando o tenant, não 42704", async () => {
      // Fora de `withTenant` não há `app.clinic_id`. O contrato do D16/#229 é
      // levantar `P0001` de `app_clinic_id_exigido()` — nunca `42704`
      // (`unrecognized configuration parameter`), que não nomeia nada.
      const { db } = await import("@/db/client");
      await esperarSqlstate(
        db.execute(sqlTag`SELECT id FROM patient_record_embeddings`),
        "P0001",
      );
    });

    // ── 2. a coluna `embedding` ───────────────────────────────────────────────

    test("`SELECT *` falha sob app_role — o GRANT é por coluna e exclui `embedding`", async () => {
      await esperarSqlstate(
        comoApp(ctxA, sqlTag`SELECT * FROM patient_record_embeddings`),
        "42501",
      );
    });

    test("nem o próprio tenant lê a coluna `embedding` diretamente", async () => {
      await esperarSqlstate(
        comoApp(ctxA, sqlTag`SELECT embedding FROM patient_record_embeddings`),
        "42501",
      );
    });

    // ── 3. app_rag_search_patient_history (DEFINER: ignora a RLS) ─────────────

    test("busca vetorial devolve o trecho e a rastreabilidade do próprio paciente", async () => {
      const linhas = (await comoApp(
        ctxA,
        sqlTag`SELECT session_note_id, sessao_em, chunk_indice, trecho, distancia
               FROM app_rag_search_patient_history(${PAC_A}::uuid, ${VETOR_CONSULTA}::vector, 5)`,
      )) as {
        session_note_id: string;
        sessao_em: Date;
        trecho: string;
        distancia: number;
      }[];

      expect(linhas.length).toBe(1);
      expect(linhas[0]!.session_note_id).toBe(NOTA_A);
      expect(linhas[0]!.trecho).toContain("[PACIENTE_ID]");
      // Guardrail 4 (#260): o timestamp ORIGINAL da sessão volta junto do trecho.
      expect(new Date(linhas[0]!.sessao_em).toISOString()).toBe(
        "2026-03-10T13:00:00.000Z",
      );
      // Vetor idêntico ⇒ distância de cosseno 0.
      expect(Number(linhas[0]!.distancia)).toBeCloseTo(0, 6);
    });

    test("INVASÃO: clínica B chamando a busca com o paciente de A é RECUSADA", async () => {
      // Este é o caso crítico. A função é `SECURITY DEFINER` — ela roda com os
      // direitos do dono e NÃO passa pela RLS. Se o guard interno não existisse,
      // o retorno aqui seria o trecho clínico da clínica A.
      await esperarSqlstate(
        comoApp(
          ctxB,
          sqlTag`SELECT trecho FROM app_rag_search_patient_history(${PAC_A}::uuid, ${VETOR_CONSULTA}::vector, 5)`,
        ),
        "P0001",
      );
    });

    test("busca de A pelo próprio paciente nunca traz linha de B (vizinho mais próximo cruzado)", async () => {
      // O vetor de consulta é o de B: se o recorte de tenant/paciente fosse
      // aplicado DEPOIS da vizinhança, a linha de B seria a primeira candidata.
      const linhas = (await comoApp(
        ctxA,
        sqlTag`SELECT session_note_id FROM app_rag_search_patient_history(${PAC_A}::uuid, ${VETOR_B}::vector, 50)`,
      )) as { session_note_id: string }[];
      expect(linhas.map((l) => l.session_note_id)).toEqual([NOTA_A]);
    });

    test("gate LGPD: paciente sem consentimento de IA vigente não é pesquisável", async () => {
      await esperarSqlstate(
        comoApp(
          ctxA,
          sqlTag`SELECT trecho FROM app_rag_search_patient_history(${PAC_A_SEM_CONSENT}::uuid, ${VETOR_CONSULTA}::vector, 5)`,
        ),
        "P0001",
      );
    });

    test("revogar o consentimento de IA cessa a recuperação na transação seguinte", async () => {
      const [concessao] = await owner<{ id: string }[]>`
      SELECT id FROM consent
       WHERE patient_id = ${PAC_A} AND tipo = 'uso_ia_processamento'
       ORDER BY assinado_em DESC, id DESC LIMIT 1`;

      await owner`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
      VALUES (${PAC_A}, 'revogacao_consentimento', 'revogacao-v1', ${concessao!.id})`;
      try {
        await esperarSqlstate(
          comoApp(
            ctxA,
            sqlTag`SELECT trecho FROM app_rag_search_patient_history(${PAC_A}::uuid, ${VETOR_CONSULTA}::vector, 5)`,
          ),
          "P0001",
        );
      } finally {
        await owner`DELETE FROM consent
        WHERE patient_id = ${PAC_A} AND tipo = 'revogacao_consentimento'`;
      }
    });

    test("`p_limite` é saneado dentro da função (0 e valores absurdos não viram tabela inteira)", async () => {
      const zero = await comoApp(
        ctxA,
        sqlTag`SELECT session_note_id FROM app_rag_search_patient_history(${PAC_A}::uuid, ${VETOR_CONSULTA}::vector, 0)`,
      );
      expect(zero.length).toBe(1); // LEAST(GREATEST(0,1),50) = 1
      const negativo = await comoApp(
        ctxA,
        sqlTag`SELECT session_note_id FROM app_rag_search_patient_history(${PAC_A}::uuid, ${VETOR_CONSULTA}::vector, -7)`,
      );
      expect(negativo.length).toBe(1);
    });

    // ── 4. app_rag_indexar_chunk (a única porta de escrita) ───────────────────

    test("indexação grava para o próprio paciente e é idempotente por (nota, chunk, modelo)", async () => {
      const primeira = (await comoApp(
        ctxA,
        sqlTag`SELECT app_rag_indexar_chunk(${NOTA_A}::uuid, 1, 'trecho novo', ${VETOR_A}::vector, ${MODELO}) AS id`,
      )) as { id: string }[];
      const segunda = (await comoApp(
        ctxA,
        sqlTag`SELECT app_rag_indexar_chunk(${NOTA_A}::uuid, 1, 'trecho reescrito', ${VETOR_A}::vector, ${MODELO}) AS id`,
      )) as { id: string }[];

      expect(segunda[0]!.id).toBe(primeira[0]!.id); // UPSERT, não linha nova

      const [linha] = (await comoApp(
        ctxA,
        sqlTag`SELECT trecho, clinic_id, patient_id, sessao_em FROM patient_record_embeddings
               WHERE id = ${primeira[0]!.id}::uuid`,
      )) as { trecho: string; clinic_id: string; patient_id: string }[];
      expect(linha!.trecho).toBe("trecho reescrito");
      // clinic_id e patient_id são DERIVADOS da nota, nunca aceitos do chamador.
      expect(linha!.clinic_id).toBe(CLINICA_A);
      expect(linha!.patient_id).toBe(PAC_A);

      await owner`DELETE FROM patient_record_embeddings WHERE id = ${primeira[0]!.id}`;
    });

    test("INVASÃO na ESCRITA: clínica B indexando uma nota da clínica A é RECUSADA", async () => {
      await esperarSqlstate(
        comoApp(
          ctxB,
          sqlTag`SELECT app_rag_indexar_chunk(${NOTA_A}::uuid, 9, 'invasor', ${VETOR_B}::vector, ${MODELO})`,
        ),
        "P0001",
      );

      const [linha] = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM patient_record_embeddings WHERE chunk_indice = 9`;
      expect(linha!.n).toBe("0");
    });

    test("gate LGPD na escrita: sem consentimento de IA vigente, a nota não é indexada", async () => {
      await esperarSqlstate(
        comoApp(
          ctxA,
          sqlTag`SELECT app_rag_indexar_chunk(${NOTA_A2}::uuid, 0, 'nao deveria entrar', ${VETOR_A}::vector, ${MODELO})`,
        ),
        "P0001",
      );

      const [linha] = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM patient_record_embeddings
       WHERE session_note_id = ${NOTA_A2}`;
      expect(linha!.n).toBe("0");
    });

    // ── 5. escrita direta ─────────────────────────────────────────────────────

    test("app_role NÃO tem INSERT/UPDATE/DELETE diretos na tabela", async () => {
      await esperarSqlstate(
        comoApp(
          ctxA,
          sqlTag`INSERT INTO patient_record_embeddings
                 (clinic_id, patient_id, session_note_id, sessao_em, chunk_indice, trecho, embedding, modelo)
               VALUES (${CLINICA_A}::uuid, ${PAC_A}::uuid, ${NOTA_A}::uuid, now(), 77, 'x', ${VETOR_A}::vector, ${MODELO})`,
        ),
        "42501",
      );

      await esperarSqlstate(
        comoApp(
          ctxA,
          sqlTag`UPDATE patient_record_embeddings SET trecho = 'adulterado' WHERE id = ${EMB_A}::uuid`,
        ),
        "42501",
      );

      await esperarSqlstate(
        comoApp(
          ctxA,
          sqlTag`DELETE FROM patient_record_embeddings WHERE id = ${EMB_A}::uuid`,
        ),
        "42501",
      );
    });

    // ── 6. postura da tabela, medida no catálogo ─────────────────────────────

    test("a tabela tem ENABLE + FORCE RLS e uma policy só de SELECT para app_role", async () => {
      const [rls] = await owner<{ enable: boolean; force: boolean }[]>`
      SELECT relrowsecurity AS enable, relforcerowsecurity AS force
        FROM pg_class WHERE relname = 'patient_record_embeddings'`;
      expect(rls).toEqual({ enable: true, force: true });

      const policies = await owner<
        { policyname: string; cmd: string; qual: string }[]
      >`
      SELECT policyname, cmd, qual FROM pg_policies
       WHERE tablename = 'patient_record_embeddings' ORDER BY policyname`;
      expect(policies.map((p) => `${p.policyname}:${p.cmd}`)).toEqual([
        "patient_record_embeddings_select:SELECT",
      ]);
      // O predicado resolve o tenant pelo HELPER, nunca por `current_setting` cru
      // nem por `app_clinic_id_atual()` (que devolveria NULL e ocultaria a linha).
      expect(policies[0]!.qual).toContain("app_clinic_id_exigido()");
      expect(policies[0]!.qual).toContain("app_patient_in_clinic(patient_id)");
      expect(policies[0]!.qual).not.toContain("current_setting");
      expect(policies[0]!.qual).not.toContain("app_clinic_id_atual");
    });

    test("`embedding` não aparece em nenhum GRANT de coluna para app_role", async () => {
      const colunas = await owner<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
       WHERE table_name = 'patient_record_embeddings' AND grantee = 'app_role'
       ORDER BY column_name`;
      expect(colunas.map((c) => c.column_name)).not.toContain("embedding");
      expect(colunas.map((c) => c.column_name)).toContain("trecho");
    });

    test("os dois definers do RAG existem, são SECURITY DEFINER e têm EXECUTE para app_role", async () => {
      const fns = await owner<
        { proname: string; prosecdef: boolean; pode: boolean }[]
      >`
      SELECT p.proname, p.prosecdef,
             has_function_privilege('app_role', p.oid, 'EXECUTE') AS pode
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('app_rag_search_patient_history', 'app_rag_indexar_chunk')
       ORDER BY p.proname`;
      expect(fns).toEqual([
        { proname: "app_rag_indexar_chunk", prosecdef: true, pode: true },
        {
          proname: "app_rag_search_patient_history",
          prosecdef: true,
          pode: true,
        },
      ]);
    });
  },
);
