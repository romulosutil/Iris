/**
 * Task 7c (0149) — `app_fatos_prontidao`, o definer que lê os seis fatos da
 * prontidão em lote (`uuid[]`), sob um guard que ESPELHA `goal_select`
 * (`db/migrations/0006_fase2_rls.sql:207` — `coordenador` OR
 * `app_is_on_team`) MAIS o recorte de terapeuta de cobertura que a `0092`
 * (D8/#174) já reconhece como autorização clínica legítima:
 * `session.terapeuta_id = self` OU `session.atendido_por_id = self`.
 *
 * Prova a tabela do §5 do plano
 * (`docs/superpowers/plans/2026-09-02-task-7c-definer-fatos-prontidao.md`):
 * cobertura por `terapeuta_id` e por `atendido_por_id` leem fato VERDADEIRO
 * mesmo fora da equipe; fora de tudo, `admin_recepcao` (D-A11) e cross-tenant
 * RAISE em vez de devolver `false` silencioso (D-A13); um lote com um
 * paciente autorizado e um de outra clínica RAISE inteiro, sem linha
 * nenhuma.
 *
 * Prova também a 8ª coluna, `modalidade`: `patient_select` (`0085:224`) tem a
 * MESMA lacuna de cobertura que `goal_select`, então a cobertura não lê a
 * linha `patient` sob a RLS — e `patient.clinical_modality` é entrada da
 * mesma régua (`montarProntidao`, degrau bloqueante "modalidade"). Sem esta
 * coluna, o bloqueio indevido reapareceria um campo adiante do que os seis
 * fatos fecharam.
 *
 * Setup segue o harness de `db/tests/anamnese-validar-definer.int.test.ts`
 * (fixtures pelo owner via `MIGRATION_DATABASE_URL`, chamada sob `app_role`
 * via `withTenant`/`tx.execute`) e o `erroDe` de lá — sem ele
 * `rejects.toThrow(/mensagem/)` não alcançaria a mensagem REAL do Postgres:
 * o driver embrulha tudo em `DrizzleQueryError`, cuja `.message` é o texto do
 * statement, não a exceção.
 */
import { sql as dsql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-000000042a01";
const CLINIC_B = "00000000-0000-0000-0000-000000042b01";

const U_COORD = "00000000-0000-0000-0000-000000042c01";
const U_RECEPCAO = "00000000-0000-0000-0000-000000042c02";
// Cobertura por `terapeuta_id`: dono da sessão, fora da care team.
const U_COB_TERAPEUTA = "00000000-0000-0000-0000-0000000427a1";
// Cobertura por `atendido_por_id`: substituto de uma sessão de outro dono,
// também fora da care team.
const U_COB_ATENDIDO = "00000000-0000-0000-0000-0000000427a2";
const U_DONO_ORIGINAL = "00000000-0000-0000-0000-0000000427a3";
// Nem equipe, nem sessão nenhuma para PAC.
const U_FORA = "00000000-0000-0000-0000-0000000427a4";

const PAC = "00000000-0000-0000-0000-000000042ac1";
const PAC_B = "00000000-0000-0000-0000-000000042bc1";

const SESS_COBERTURA_TERAPEUTA = "00000000-0000-0000-0000-000000042e01";
const SESS_COBERTURA_ATENDIDO = "00000000-0000-0000-0000-000000042e02";

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxRecepcao = {
  clinicId: CLINIC_A,
  userId: U_RECEPCAO,
  role: "admin_recepcao",
} as const;
const ctxCobTerapeuta = {
  clinicId: CLINIC_A,
  userId: U_COB_TERAPEUTA,
  role: "terapeuta",
} as const;
const ctxCobAtendido = {
  clinicId: CLINIC_A,
  userId: U_COB_ATENDIDO,
  role: "terapeuta",
} as const;
const ctxFora = {
  clinicId: CLINIC_A,
  userId: U_FORA,
  role: "terapeuta",
} as const;

const CRITERIO = { tipo: "n_acertos_m_sessoes", n: 3, m: 3 };

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
type CtxDeTeste = Parameters<typeof import("@/db/rls").withTenant>[0];

/** Devolve a mensagem REAL do Postgres de uma promise que tem de rejeitar.
 * Verbatim de `anamnese-validar-definer.int.test.ts` /
 * `consent-revogacao-gate.int.test.ts:103-124`. Se a operação NÃO rejeitar,
 * falha alto: silêncio não é aprovação. */
async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const partes: string[] = [];
    let atual: unknown = e;
    while (atual && typeof atual === "object") {
      const o = atual as {
        message?: unknown;
        detail?: unknown;
        cause?: unknown;
      };
      if (o.message) partes.push(String(o.message));
      if (o.detail) partes.push(String(o.detail));
      atual = o.cause;
    }
    return partes.join(" | ");
  }
  throw new Error(
    "esperava rejeição do Postgres, mas a operação foi bem-sucedida",
  );
}

/** SQLSTATE REAL do Postgres de uma promise que tem de rejeitar.
 *
 * O par com `erroDe` é deliberado: a MENSAGEM é diagnóstico humano, o CÓDIGO
 * é o contrato. `obterFatosProntidao` (`src/lib/patient/prontidao-queries.ts`)
 * decide `null` vs. propagar lendo SÓ o código — casar por texto está fora
 * porque em `DrizzleQueryError` a `.message` é o SQL que nós mandamos, com os
 * `params` interpolados. Sem esta afirmação aqui, a `0152` poderia perder o
 * `USING ERRCODE` e a suíte de mensagem seguiria verde enquanto a porta
 * passaria a propagar tudo (cartão sumindo onde deveria dizer "não visível"). */
async function codigoDe(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    let atual: unknown = e;
    while (atual && typeof atual === "object") {
      const o = atual as { code?: unknown; cause?: unknown };
      if (typeof o.code === "string") return o.code;
      atual = o.cause;
    }
    return undefined;
  }
  throw new Error(
    "esperava rejeição do Postgres, mas a operação foi bem-sucedida",
  );
}

type LinhaCrua = {
  patient_id: string;
  tem_ficha_clinica: boolean;
  tem_anamnese: boolean;
  tem_protocolo_ativo: boolean;
  tem_meta_ativa: boolean;
  tem_instrumento_aplicado: boolean;
  tem_sessao_consolidada: boolean;
  modalidade: string | null;
};

/** Chama o definer como o `ctx` informado, com o array de pacientes dado.
 * `sql.param`, NÃO `ARRAY[${ids}]` interpolado: bind direto de array vira
 * row constructor com n>=2 (mesmo motivo documentado em
 * `src/lib/evidence/materializar.ts` e replicado em
 * `src/app/(app)/pacientes/queries.ts`). */
function chamar(ctx: CtxDeTeste, patientIds: string[]): Promise<LinhaCrua[]> {
  return withTenant(ctx, (tx) =>
    tx.execute<LinhaCrua>(
      dsql`SELECT * FROM app_fatos_prontidao(${dsql.param(patientIds)}::uuid[])`,
    ),
  ) as unknown as Promise<LinhaCrua[]>;
}

describe.skipIf(!hasDb)("Task 7c · app_fatos_prontidao (0149)", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, session,
      care_team_membership, goal RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'A (fatos-prontidao-definer)'),
      (${CLINIC_B}, 'B (fatos-prontidao-definer)')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord.fpd@t.com', 'Coord'),
      (${U_RECEPCAO}, 'recepcao.fpd@t.com', 'Recepção'),
      (${U_COB_TERAPEUTA}, 'cobter.fpd@t.com', 'Cobertura (terapeuta_id)'),
      (${U_COB_ATENDIDO}, 'cobatend.fpd@t.com', 'Cobertura (atendido_por_id)'),
      (${U_DONO_ORIGINAL}, 'dono.fpd@t.com', 'Dono original'),
      (${U_FORA}, 'fora.fpd@t.com', 'Fora de tudo')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_RECEPCAO}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_COB_TERAPEUTA}, ${CLINIC_A}, 'terapeuta'),
      (${U_COB_ATENDIDO}, ${CLINIC_A}, 'terapeuta'),
      (${U_DONO_ORIGINAL}, ${CLINIC_A}, 'terapeuta'),
      (${U_FORA}, ${CLINIC_A}, 'terapeuta')`;
    // `clinical_modality` EXPLÍCITA e diferente do default do schema
    // (`protocol_driven`): é o oráculo da 8ª coluna. Com o default, um bug que
    // devolvesse constante passaria despercebido; com `cognitive_behavioral`,
    // só a leitura real da linha `patient` satisfaz a asserção.
    await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality) VALUES
      (${PAC}, ${CLINIC_A}, 'Paciente A', 'cognitive_behavioral'),
      (${PAC_B}, ${CLINIC_B}, 'Paciente B', 'protocol_driven')`;

    // Nenhum dos dois cobre por equipe — é o ponto do teste: a autorização
    // vem da sessão, não de `care_team_membership`.
    await owner`INSERT INTO session
      (id, clinic_id, patient_id, terapeuta_id, atendido_por_id, agendada_para, estado, disciplina) VALUES
      (${SESS_COBERTURA_TERAPEUTA}, ${CLINIC_A}, ${PAC}, ${U_COB_TERAPEUTA}, NULL, now(), 'realizada', 'aba'),
      (${SESS_COBERTURA_ATENDIDO}, ${CLINIC_A}, ${PAC}, ${U_DONO_ORIGINAL}, ${U_COB_ATENDIDO}, now(), 'realizada', 'aba')`;

    // A meta que os dois casos de cobertura precisam enxergar como VERDADEIRA.
    await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC}, ${CLINIC_A}, 'meta de teste', 'ativa', ${owner.json(CRITERIO)}, ${U_COORD})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("cobertura via session.terapeuta_id, FORA da equipe: tem_meta_ativa = true", async () => {
    const [linha] = await chamar(ctxCobTerapeuta, [PAC]);
    expect(linha?.tem_meta_ativa).toBe(true);
  });

  test("cobertura via session.atendido_por_id, FORA da equipe: tem_meta_ativa = true", async () => {
    const [linha] = await chamar(ctxCobAtendido, [PAC]);
    expect(linha?.tem_meta_ativa).toBe(true);
  });

  // 8ª COLUNA (Task 7c). `patient_select` (`0085:224`) também não tem recorte
  // de cobertura: este terapeuta não lê a linha `patient` NENHUMA sob a RLS.
  // Se a modalidade continuasse vindo de fora do definer, ela chegaria `null`
  // à régua e o degrau bloqueante "modalidade" recusaria a documentação — o
  // bloqueio indevido um campo adiante do que os seis fatos fecharam. Aqui ela
  // volta REAL.
  test("cobertura FORA da equipe lê a modalidade REAL do paciente, não null", async () => {
    const [linha] = await chamar(ctxCobTerapeuta, [PAC]);
    expect(linha?.modalidade).toBe("cognitive_behavioral");
  });

  test("cobertura via atendido_por_id também lê a modalidade REAL", async () => {
    const [linha] = await chamar(ctxCobAtendido, [PAC]);
    expect(linha?.modalidade).toBe("cognitive_behavioral");
  });

  test("terapeuta sem equipe e sem sessão: lança exceção, não false", async () => {
    const msg = await erroDe(chamar(ctxFora, [PAC]));
    expect(msg).toMatch(/fora da equipe ou cobertura do chamador/);
  });

  // D-A11: divergência deliberada da `0092` — esta função devolve estado
  // clínico, que a recepção não lê. Autorizá-la por simetria com a `0092`
  // reabriria o vazamento que D-A9 fechou.
  test("admin_recepcao: lança exceção (D-A11), nunca fatos", async () => {
    const msg = await erroDe(chamar(ctxRecepcao, [PAC]));
    expect(msg).toMatch(/fora da equipe ou cobertura do chamador/);
  });

  test("paciente de outra clínica: lança a exceção de isolamento multi-tenant", async () => {
    const msg = await erroDe(chamar(ctxCoord, [PAC_B]));
    expect(msg).toMatch(
      /fora da clínica do chamador \(isolamento multi-tenant\)/,
    );
  });

  // Lote: um paciente autorizado + um de outra clínica. O `FOREACH` do guard
  // interno estoura no SEGUNDO elemento antes de qualquer `RETURN QUERY` —
  // a promise inteira rejeita, nenhuma linha (nem a do paciente autorizado)
  // chega ao chamador.
  test("lote misto (um autorizado, um de outra clínica): lança exceção, nenhuma linha", async () => {
    const msg = await erroDe(chamar(ctxCoord, [PAC, PAC_B]));
    expect(msg).toMatch(
      /fora da clínica do chamador \(isolamento multi-tenant\)/,
    );
  });

  // ── O CÓDIGO é o contrato (migração `0152`) ────────────────────────────
  // Antes da `0152` as duas guardas caíam no `P0001` default do PL/pgSQL — o
  // MESMO código de `app_clinic_id_exigido()` (`0085`),
  // `app_user_role_exigido()` (`0093`) e `app_conta_somente_leitura()`
  // (`0073`). Um `catch (P0001) → null` na porta transformaria "o helper de
  // tenant quebrou" em "sem prontidão" na tela (achado R-1, memória
  // `erro-renderizado-como-empty-state`). Código dedicado por guarda é o que
  // torna esse mapeamento seguro — e estes dois testes são o que impede a
  // regressão silenciosa de volta ao `P0001`.
  test("guarda de isolamento multi-tenant carrega o ERRCODE IR001", async () => {
    expect(await codigoDe(chamar(ctxCoord, [PAC_B]))).toBe("IR001");
  });

  test("guarda de autorização cross-team carrega o ERRCODE IR002", async () => {
    expect(await codigoDe(chamar(ctxFora, [PAC]))).toBe("IR002");
    expect(await codigoDe(chamar(ctxRecepcao, [PAC]))).toBe("IR002");
  });

  test("os dois ERRCODEs são DISTINTOS entre si e nenhum é P0001", async () => {
    const tenant = await codigoDe(chamar(ctxCoord, [PAC_B]));
    const autz = await codigoDe(chamar(ctxFora, [PAC]));
    expect(tenant).not.toBe(autz);
    expect([tenant, autz]).not.toContain("P0001");
  });
});
