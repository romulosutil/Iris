/**
 * #122 — RLS e privilégios da fila dedicada `alerta_risco_clinico`, contra
 * Postgres real. Roda com `pnpm test:rls`. Auto-skip sem DB.
 *
 * Prova, e não presume: isolamento multi-tenant, quem enxerga o quê dentro do
 * tenant, ausência de INSERT/DELETE direto para `app_role`, e o expurgo LGPD
 * que PSEUDONIMIZA em vez de deletar (H2).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-0000000012a0";
const CLINIC_B = "00000000-0000-0000-0000-0000000012b0";
const U_COORD_A = "00000000-0000-0000-0000-0000000012c1";
const U_TER_SESSAO = "00000000-0000-0000-0000-0000000012a1"; // terapeuta da sessão de origem
const U_TER_EQUIPE = "00000000-0000-0000-0000-0000000012a2"; // outro membro da equipe de cuidado
const U_TER_FORA = "00000000-0000-0000-0000-0000000012a3"; // mesma clínica, fora da equipe
// #554 — substituto designado na agenda: atendeu a sessão (`atendido_por_id`)
// e NÃO está na equipe de cuidado do paciente.
const U_TER_SUB = "00000000-0000-0000-0000-0000000012a4";
const U_COORD_B = "00000000-0000-0000-0000-0000000012c2";
const P_A = "00000000-0000-0000-0000-0000000012d1";
const P_B = "00000000-0000-0000-0000-0000000012d2";
const S_A = "00000000-0000-0000-0000-0000000012e1";
const S_B = "00000000-0000-0000-0000-0000000012e2";
// #554 — sessão de A coberta pelo substituto (titular ausente).
const S_SUB = "00000000-0000-0000-0000-0000000012e3";
// #391 — âncoras novas (RPD e instrumento formal), uma por clínica, para
// provar que o predicado de leitura isola tenant também nas origens novas.
const RPD_A = "00000000-0000-0000-0000-0000000012f1";
const RPD_B = "00000000-0000-0000-0000-0000000012f2";
const EXT_A = "00000000-0000-0000-0000-0000000012f3";
const EXT_B = "00000000-0000-0000-0000-0000000012f4";

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

async function semear() {
  await owner!`TRUNCATE alerta_risco_clinico, audit_log RESTART IDENTITY CASCADE`;
  await owner!`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session RESTART IDENTITY CASCADE`;
  await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
  await owner!`INSERT INTO app_user (id, name, email) VALUES
    (${U_COORD_A}, 'Coord A', 'coord-a@risco.test'),
    (${U_TER_SESSAO}, 'Ter Sessão', 'ter-sessao@risco.test'),
    (${U_TER_EQUIPE}, 'Ter Equipe', 'ter-equipe@risco.test'),
    (${U_TER_FORA}, 'Ter Fora', 'ter-fora@risco.test'),
    (${U_TER_SUB}, 'Ter Substituto', 'ter-sub@risco.test'),
    (${U_COORD_B}, 'Coord B', 'coord-b@risco.test')`;
  await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
    (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
    (${U_TER_SESSAO}, ${CLINIC_A}, 'terapeuta'),
    (${U_TER_EQUIPE}, ${CLINIC_A}, 'terapeuta'),
    (${U_TER_FORA}, ${CLINIC_A}, 'terapeuta'),
    (${U_TER_SUB}, ${CLINIC_A}, 'terapeuta'),
    (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  // `alta_em` preenchida: desde a 0128 (#352) `app_purgar_paciente` tem gate de
  // retenção, e um paciente sem alta é inelegível por construção — o caso de
  // pseudonimização (H2) abaixo passaria a medir a recusa do gate.
  await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento, alta_em) VALUES
    (${P_A}, ${CLINIC_A}, 'Paciente A', '1995-04-10', '2005-01-01'),
    (${P_B}, ${CLINIC_B}, 'Paciente B', '1990-01-01', '2005-01-01')`;
  await owner!`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe, vigencia_fim) VALUES
    (${P_A}, ${U_TER_SESSAO}, 'psicologia', 'terapeuta_referencia', NULL),
    (${P_A}, ${U_TER_EQUIPE}, 'fono', 'terapeuta_referencia', NULL)`;
  await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina) VALUES
    (${S_A}, ${CLINIC_A}, ${P_A}, ${U_TER_SESSAO}, now(), 'psicologia'),
    (${S_B}, ${CLINIC_B}, ${P_B}, ${U_COORD_B}, now(), 'psicologia')`;
  // #554 — sessão coberta: titular U_TER_SESSAO, quem atendeu foi U_TER_SUB.
  await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, atendido_por_id, agendada_para, disciplina) VALUES
    (${S_SUB}, ${CLINIC_A}, ${P_A}, ${U_TER_SESSAO}, ${U_TER_SUB}, now() + interval '3 hours', 'psicologia')`;
  // #391 — âncoras das origens novas, uma por clínica.
  await owner!`INSERT INTO tcc_rpd_entry
      (id, clinic_id, patient_id, situacao, pensamento_automatico, emocao, intensidade, criado_por) VALUES
    (${RPD_A}, ${CLINIC_A}, ${P_A}, 'situação A', 'pensamento automático A', 'ansiedade', 70, ${U_TER_SESSAO}),
    (${RPD_B}, ${CLINIC_B}, ${P_B}, 'situação B', 'pensamento automático B', 'ansiedade', 70, ${U_COORD_B})`;
  await owner!`INSERT INTO extraction
      (id, session_id, clinic_id, subtipo, trecho_fonte, confianca, payload) VALUES
    (${EXT_A}, ${S_A}, ${CLINIC_A}, 'aplicacao_escala_relatada', 'trecho do instrumento A', 'alta', '{}'::jsonb),
    (${EXT_B}, ${S_B}, ${CLINIC_B}, 'aplicacao_escala_relatada', 'trecho do instrumento B', 'alta', '{}'::jsonb)`;
}

/** Cria via o caminho oficial (SECURITY DEFINER), sob o tenant informado. */
async function criar(
  c: TenantContext,
  args: {
    patientId: string;
    sessionId: string;
    categoria?: string;
    severidade?: string;
    certeza?: string;
    trecho?: string;
  },
): Promise<string> {
  return withTenant(c, async (tx) => {
    const r = (await tx.execute(sql`
      SELECT app_criar_alerta_risco(
        ${args.patientId}::uuid, ${args.sessionId}::uuid,
        ${args.categoria ?? "ideacao_suicida"}::alerta_risco_categoria,
        ${args.severidade ?? "ideacao_passiva"}::alerta_risco_severidade,
        ${args.certeza ?? "explicito"}::alerta_risco_certeza,
        ${args.trecho ?? "seria mais fácil não acordar"},
        'detalhe do agente'
      ) AS id
    `)) as unknown as Array<{ id: string }>;
    return r[0]!.id;
  });
}

/**
 * Variante de `criar` com origem explícita (#391) — mesma via oficial
 * (SECURITY DEFINER), mas cobrindo `registro_pensamento`/`instrumento_formal`
 * além do `diario_sessao` default.
 */
async function criarComOrigem(
  c: TenantContext,
  args: {
    patientId: string;
    origem: "diario_sessao" | "registro_pensamento" | "instrumento_formal";
    sessionId?: string | null;
    rpdEntryId?: string | null;
    origemExtractionId?: string | null;
    categoria?: string;
    severidade?: string;
    certeza?: string;
    trecho?: string;
  },
): Promise<string> {
  return withTenant(c, async (tx) => {
    const r = (await tx.execute(sql`
      SELECT app_criar_alerta_risco(
        ${args.patientId}::uuid, ${args.sessionId ?? null}::uuid,
        ${args.categoria ?? "ideacao_suicida"}::alerta_risco_categoria,
        ${args.severidade ?? "ideacao_passiva"}::alerta_risco_severidade,
        ${args.certeza ?? "explicito"}::alerta_risco_certeza,
        ${args.trecho ?? "trecho padrão do agente"},
        'detalhe do agente',
        ${args.origem}::alerta_risco_origem,
        ${args.rpdEntryId ?? null}::uuid,
        ${args.origemExtractionId ?? null}::uuid
      ) AS id
    `)) as unknown as Array<{ id: string }>;
    return r[0]!.id;
  });
}

/**
 * O drizzle embrulha o erro do Postgres: `message` vira o texto da query e a
 * mensagem real fica em `cause`. Asserção sobre a mensagem precisa olhar os
 * dois, senão o teste passa por acidente com QUALQUER falha de query.
 */
async function mensagemDeErro(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ""} | ${err.cause?.message ?? ""}`;
  }
}

describe.skipIf(!hasDb)("alerta_risco_clinico — RLS e privilégios", () => {
  beforeAll(semear);
  afterAll(async () => {
    await owner?.end();
  });

  test("app_role NÃO tem INSERT nem DELETE na tabela", async () => {
    // #119/0124 — SELECT deixou de ser privilégio de tabela: agora é
    // concedido coluna a coluna (exclui `trecho_fonte`), então
    // role_table_grants só reflete UPDATE. Coluna a coluna é a asserção
    // que realmente prova a mediação por app_alerta_trecho_fonte().
    const g = await owner!<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'alerta_risco_clinico' AND grantee = 'app_role'`;
    const privs = g.map((r) => r.privilege_type).sort();
    expect(privs).toEqual(["UPDATE"]);

    const cols = await owner!<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
       WHERE table_name = 'alerta_risco_clinico' AND grantee = 'app_role'
         AND privilege_type = 'SELECT'
       ORDER BY column_name`;
    const colNames = cols.map((r) => r.column_name);
    expect(colNames).not.toContain("trecho_fonte");
    expect(colNames).toContain("id");
    expect(colNames).toContain("categoria");
  });

  test("INSERT direto por app_role é negado — criar alerta é privilégio do caminho do agente", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (tx) =>
        tx.execute(sql`
          INSERT INTO alerta_risco_clinico
            (clinic_id, patient_id, session_id, categoria, severidade, certeza,
             trecho_fonte, detalhe, prazo_minutos, prazo_reconhecimento)
          VALUES (${CLINIC_A}::uuid, ${P_A}::uuid, ${S_A}::uuid,
                  'ideacao_suicida', 'ideacao_ativa_com_plano', 'explicito',
                  'forjado', 'forjado', 999, now() + interval '999 hours')`),
      ),
    ).rejects.toThrow();
  });

  test("isolamento cross-tenant: coordenador de B não vê alerta de A", async () => {
    await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
    });
    const rows = (await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (tx) => tx.execute(sql`SELECT id FROM alerta_risco_clinico`),
    )) as unknown as Array<{ id: string }>;
    expect(rows).toHaveLength(0);
  });

  test("isolamento cross-tenant: alerta origem registro_pensamento (RPD) não vaza entre clínicas", async () => {
    await semear();
    const id = await criarComOrigem(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      origem: "registro_pensamento",
      rpdEntryId: RPD_A,
      trecho: "trecho do RPD A",
    });
    const comoA = (await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      tx.execute(
        sql`SELECT id FROM alerta_risco_clinico WHERE id = ${id}::uuid`,
      ),
    )) as unknown as Array<{ id: string }>;
    expect(comoA).toHaveLength(1);

    const comoB = (await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (tx) => tx.execute(sql`SELECT id FROM alerta_risco_clinico`),
    )) as unknown as Array<{ id: string }>;
    expect(comoB).toHaveLength(0);
  });

  test("isolamento cross-tenant: alerta origem registro_pensamento (RPD SUGERIDO, âncora origem_extraction_id) não vaza entre clínicas (#392)", async () => {
    // #392 — RPD sugerido ainda não tem linha em `tcc_rpd_entry`; o alerta é
    // ancorado na própria extração via `origem_extraction_id` (CHECK relaxado
    // na 0112). Mesma prova de isolamento que a âncora `rpd_entry_id` já tem
    // acima, cobrindo a segunda forma de âncora aceita para esta origem.
    await semear();
    const id = await criarComOrigem(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      origem: "registro_pensamento",
      origemExtractionId: EXT_A,
      trecho: "trecho do RPD sugerido A",
    });
    const comoA = (await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      tx.execute(
        sql`SELECT id FROM alerta_risco_clinico WHERE id = ${id}::uuid`,
      ),
    )) as unknown as Array<{ id: string }>;
    expect(comoA).toHaveLength(1);

    const comoB = (await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (tx) => tx.execute(sql`SELECT id FROM alerta_risco_clinico`),
    )) as unknown as Array<{ id: string }>;
    expect(comoB).toHaveLength(0);
  });

  test("isolamento cross-tenant: alerta origem instrumento_formal (extraction) não vaza entre clínicas", async () => {
    await semear();
    const id = await criarComOrigem(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      origem: "instrumento_formal",
      origemExtractionId: EXT_A,
      trecho: "trecho do instrumento A",
    });
    const comoA = (await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      tx.execute(
        sql`SELECT id FROM alerta_risco_clinico WHERE id = ${id}::uuid`,
      ),
    )) as unknown as Array<{ id: string }>;
    expect(comoA).toHaveLength(1);

    const comoB = (await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (tx) => tx.execute(sql`SELECT id FROM alerta_risco_clinico`),
    )) as unknown as Array<{ id: string }>;
    expect(comoB).toHaveLength(0);
  });

  test("criar alerta com sessão de OUTRA clínica é rejeitado (guard do DEFINER)", async () => {
    const msg = await mensagemDeErro(
      criar(ctx("terapeuta", U_TER_SESSAO), { patientId: P_B, sessionId: S_B }),
    );
    expect(msg).toMatch(/inexistente ou sem permissão/);
  });

  test("criar alerta sem trecho literal é rejeitado", async () => {
    const msg = await mensagemDeErro(
      criar(ctx("terapeuta", U_TER_SESSAO), {
        patientId: P_A,
        sessionId: S_A,
        trecho: "   ",
      }),
    );
    expect(msg).toMatch(/trecho_fonte literal é obrigatório/);
  });

  test("dentro do tenant: coordenador, terapeuta da sessão e equipe veem; terapeuta fora da equipe não", async () => {
    await semear();
    const id = await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
    });
    const ve = async (c: TenantContext) => {
      const r = (await withTenant(c, (tx) =>
        tx.execute(
          sql`SELECT id FROM alerta_risco_clinico WHERE id = ${id}::uuid`,
        ),
      )) as unknown as Array<{ id: string }>;
      return r.length === 1;
    };
    expect(await ve(ctx("coordenador", U_COORD_A))).toBe(true);
    expect(await ve(ctx("terapeuta", U_TER_SESSAO))).toBe(true);
    expect(await ve(ctx("terapeuta", U_TER_EQUIPE))).toBe(true);
    expect(await ve(ctx("terapeuta", U_TER_FORA))).toBe(false);
  });

  /**
   * #554 — régua do profissional responsável (`terapeuta_id` OU
   * `atendido_por_id`, 0143/#539) nos TRÊS lugares que decidem visibilidade de
   * alerta de risco: a policy `alerta_risco_scope` (0085),
   * `app_alerta_risco_visivel` (0093) e `app_alerta_trecho_fonte` (0142/#529).
   *
   * Antes da 0149 os três usavam `app_session_terapeuta_id(session_id) = <eu>`:
   * o substituto que atendeu a sessão e não está na equipe NÃO via o alerta que
   * a extração daquela sessão gerou — enquanto a titular, que não estava lá,
   * via. Estes casos medem comportamento sob `app_role`, não o texto do `.sql`.
   */
  describe("#554 — substituto designado enxerga o alerta da sessão que atendeu", () => {
    /** Lê o alerta pelas TRÊS vias de uma vez, sob o tenant informado. */
    const lerComoUsuario = async (c: TenantContext, id: string) => {
      return withTenant(c, async (tx) => {
        const linhas = (await tx.execute(
          sql`SELECT id FROM alerta_risco_clinico WHERE id = ${id}::uuid`,
        )) as unknown as Array<{ id: string }>;
        const fn = (await tx.execute(sql`
          SELECT app_alerta_risco_visivel(${id}::uuid) AS visivel,
                 app_alerta_trecho_fonte(${id}::uuid) AS trecho
        `)) as unknown as Array<{ visivel: boolean; trecho: string | null }>;
        return {
          policy: linhas.length === 1,
          visivel: fn[0]!.visivel,
          trecho: fn[0]!.trecho,
        };
      });
    };

    test("substituto FORA da equipe lê o alerta e o trecho_fonte da sessão que atendeu", async () => {
      await semear();
      const id = await criar(ctx("terapeuta", U_TER_SESSAO), {
        patientId: P_A,
        sessionId: S_SUB,
        trecho: "trecho literal da sessão coberta",
      });

      // Pré-condição do caso: o substituto NÃO está na equipe de cuidado — se
      // estivesse, `app_is_on_team` já o deixaria passar e o teste não mediria
      // a régua nova.
      const equipe = await owner!<{ n: string }[]>`
        SELECT count(*) AS n FROM care_team_membership
         WHERE patient_id = ${P_A} AND user_id = ${U_TER_SUB}
           AND vigencia_fim IS NULL`;
      expect(Number(equipe[0]!.n)).toBe(0);

      const r = await lerComoUsuario(ctx("terapeuta", U_TER_SUB), id);
      expect(r.policy).toBe(true);
      expect(r.visivel).toBe(true);
      expect(r.trecho).toBe("trecho literal da sessão coberta");
    });

    test("terapeuta alheio (nem responsável nem na equipe) continua sem ler o alerta nem o trecho", async () => {
      await semear();
      const id = await criar(ctx("terapeuta", U_TER_SESSAO), {
        patientId: P_A,
        sessionId: S_SUB,
        trecho: "trecho literal da sessão coberta",
      });

      const r = await lerComoUsuario(ctx("terapeuta", U_TER_FORA), id);
      expect(r.policy).toBe(false);
      expect(r.visivel).toBe(false);
      expect(r.trecho).toBeNull();
    });

    test("alerta_risco_scope continua escondendo linha PSEUDONIMIZADA de não-coordenador — inclusive do substituto", async () => {
      await semear();
      const id = await criar(ctx("terapeuta", U_TER_SESSAO), {
        patientId: P_A,
        sessionId: S_SUB,
        trecho: "trecho literal da sessão coberta",
      });
      await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
        tx.execute(
          sql`SELECT app_purgar_paciente(${P_A}::uuid, 'pedido de erasure')`,
        ),
      );
      const [linha] = await owner!<{ pseudonimizado_em: Date | null }[]>`
        SELECT pseudonimizado_em FROM alerta_risco_clinico WHERE id = ${id}`;
      expect(linha!.pseudonimizado_em).not.toBeNull();

      const comoSub = await lerComoUsuario(ctx("terapeuta", U_TER_SUB), id);
      expect(comoSub.policy).toBe(false);
      expect(comoSub.visivel).toBe(false);
      expect(comoSub.trecho).toBeNull();

      const comoCoord = await lerComoUsuario(ctx("coordenador", U_COORD_A), id);
      expect(comoCoord.policy).toBe(true);
      expect(comoCoord.visivel).toBe(true);
    });
  });

  test("prazo é resolvido no banco e a certeza NÃO o relaxa (§4.1)", async () => {
    await semear();
    const a = await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
      severidade: "tentativa_relatada",
      certeza: "explicito",
      trecho: "trecho A",
    });
    const b = await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
      severidade: "tentativa_relatada",
      certeza: "ambiguo_citado",
      trecho: "trecho B",
    });
    const r = await owner!<{ id: string; prazo_minutos: number }[]>`
      SELECT id, prazo_minutos FROM alerta_risco_clinico WHERE id IN (${a}, ${b})`;
    expect(r.map((x) => Number(x.prazo_minutos))).toEqual([15, 15]);
  });

  test("re-extração da mesma sessão não duplica o alerta nem reinicia o prazo", async () => {
    await semear();
    const primeiro = await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
      trecho: "mesmo trecho literal",
    });
    const segundo = await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
      trecho: "mesmo trecho literal",
    });
    expect(segundo).toBe(primeiro);
    const [contagem] = await owner!<{ n: string }[]>`
      SELECT count(*) AS n FROM alerta_risco_clinico WHERE session_id = ${S_A}`;
    expect(Number(contagem!.n)).toBe(1);
  });

  test("dois relatos DIFERENTES na mesma sessão geram duas linhas (§3.2: risco é evento, não sinal)", async () => {
    await semear();
    await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
      trecho: "primeiro relato",
    });
    await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
      trecho: "segundo relato, distinto",
    });
    const [contagem] = await owner!<{ n: string }[]>`
      SELECT count(*) AS n FROM alerta_risco_clinico WHERE session_id = ${S_A}`;
    expect(Number(contagem!.n)).toBe(2);
  });

  test("expurgo LGPD PSEUDONIMIZA o alerta de risco — não deleta (H2)", async () => {
    await semear();
    const id = await criar(ctx("terapeuta", U_TER_SESSAO), {
      patientId: P_A,
      sessionId: S_A,
      severidade: "autolesao_recente",
      trecho: "marcas recentes de corte no antebraço",
    });

    await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      tx.execute(
        sql`SELECT app_purgar_paciente(${P_A}::uuid, 'pedido de erasure')`,
      ),
    );

    const [linha] = await owner!<
      {
        id: string;
        patient_id: string | null;
        session_id: string | null;
        trecho_fonte: string;
        severidade: string;
        status: string;
        pseudonimizado_em: Date | null;
      }[]
    >`SELECT id, patient_id, session_id, trecho_fonte, severidade, status, pseudonimizado_em
        FROM alerta_risco_clinico WHERE id = ${id}`;

    // a linha SOBREVIVE ao erasure do paciente
    expect(linha).toBeDefined();
    // ...sem PII
    expect(linha!.patient_id).toBeNull();
    expect(linha!.session_id).toBeNull();
    expect(linha!.trecho_fonte).toBe("[expurgado]");
    expect(linha!.pseudonimizado_em).not.toBeNull();
    // ...preservando o que tem função depois do erasure
    expect(linha!.severidade).toBe("autolesao_recente");
    expect(linha!.status).toBe("aberto");
    // e o paciente foi de fato apagado
    const p = await owner!`SELECT 1 FROM patient WHERE id = ${P_A}`;
    expect(p).toHaveLength(0);
  });

  test("linha pseudonimizada não é legível por terapeuta, só pelo coordenador do tenant", async () => {
    const comoTerapeuta = (await withTenant(
      ctx("terapeuta", U_TER_SESSAO),
      (tx) =>
        tx.execute(
          sql`SELECT id FROM alerta_risco_clinico WHERE pseudonimizado_em IS NOT NULL`,
        ),
    )) as unknown as unknown[];
    expect(comoTerapeuta).toHaveLength(0);

    const comoCoord = (await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      tx.execute(
        sql`SELECT id FROM alerta_risco_clinico WHERE pseudonimizado_em IS NOT NULL`,
      ),
    )) as unknown as unknown[];
    expect(comoCoord.length).toBeGreaterThan(0);
  });
});
