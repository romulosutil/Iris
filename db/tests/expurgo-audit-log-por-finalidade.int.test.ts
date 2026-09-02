/**
 * #536 (S-05) — o expurgo do `audit_log` aos 180 dias é POR FINALIDADE, não
 * por idade.
 *
 * Até a `0070`, `app_expurgar_audit_log_expirado()` apagava TODA linha com
 * `criado_em < now() - 180 days`, sem olhar `acao` — inclusive
 * `reclassificacao`, `invalidacao`, `reconhecimento_alerta`,
 * `relatorio_exportado`, `evidencia_aprovada_lote`… que são trilha clínica e
 * de governança e acompanham o prontuário (`docs/legal/politica-retencao-dados.md`:
 * 180 dias é "mínimo, não teto", e vale para LOG DE ACESSO). A `0142` restringe
 * o DELETE a uma allowlist de ações de ACESSO (D-AUD-4) e é fail-closed: ação
 * fora da allowlist — inclusive uma que ninguém classificou — nunca é apagada.
 *
 * Régua de mutação: trocar o `AND acao = ANY(...)` da `0142` pelo corpo da
 * `0070` derruba os casos 1 e 3 (medido: este arquivo foi rodado VERMELHO
 * contra a `0070` antes de a `0142` existir — saída na PR).
 *
 * A função é chamada como a role dona no arranjo: é `SECURITY DEFINER`, e o
 * que está sob teste é o PREDICADO do DELETE, não a fronteira de execução. A
 * fronteira (quem pode chamar) tem os seus próprios casos no final.
 *
 * Sem `TRUNCATE`: limpeza por `DELETE` escopado pelas fixtures deste arquivo
 * (memória `truncate-extra-colide-com-int-test-paralelo`). Sufixo `536` nos
 * identificadores/e-mail (memória `email-de-fixture-colide-entre-int-tests`).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINICA = "00000000-0000-0000-0000-000000005361";
const ATOR = "00000000-0000-0000-0000-0000000053a1";
const ALVO = "00000000-0000-0000-0000-0000000053e1";

// Linhas plantadas, uma por caso. `criado_em` explícito: a coluna tem
// `DEFAULT now()`, e o que se testa é justamente a idade.
const L_RECLASSIFICACAO_200D = "00000000-0000-0000-0000-000000053601";
const L_LOGIN_200D = "00000000-0000-0000-0000-000000053602";
const L_DESCONHECIDA_200D = "00000000-0000-0000-0000-000000053603";
const L_LOGIN_10D = "00000000-0000-0000-0000-000000053604";
const L_RELATORIO_EXPORTADO_400D = "00000000-0000-0000-0000-000000053605";

const LOGIN_ROLE = "iris_expurgo_audit_log_login_536";
const LOGIN_PASSWORD = "iris_expurgo_audit_log_login_teste_536";

async function idsVivos(): Promise<string[]> {
  const rows = await owner!<{ id: string }[]>`
    SELECT id FROM audit_log WHERE clinic_id = ${CLINICA} ORDER BY id
  `;
  return rows.map((r) => r.id);
}

describe.skipIf(!hasDb)("#536 · expurgo do audit_log por finalidade", () => {
  beforeAll(async () => {
    await owner!`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINICA}, 'Clínica #536', false)`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${ATOR}, 'Ator #536', 'ator.536@t.com')`;

    // Uma linha por caso. `login` é ação de ACESSO (allowlist da 0142);
    // `reclassificacao` e `relatorio_exportado` são trilha clínica/governança;
    // `acao_nao_classificada_536` não está em lista nenhuma.
    await owner!`INSERT INTO audit_log (id, clinic_id, ator_id, acao, entidade, entidade_id, criado_em) VALUES
      (${L_RECLASSIFICACAO_200D}, ${CLINICA}, ${ATOR}, 'reclassificacao', 'evidence', ${ALVO}, now() - interval '200 days'),
      (${L_LOGIN_200D}, ${CLINICA}, ${ATOR}, 'login', 'auth_session', ${ALVO}, now() - interval '200 days'),
      (${L_DESCONHECIDA_200D}, ${CLINICA}, ${ATOR}, 'acao_nao_classificada_536', 'evidence', ${ALVO}, now() - interval '200 days'),
      (${L_LOGIN_10D}, ${CLINICA}, ${ATOR}, 'login', 'auth_session', ${ALVO}, now() - interval '10 days'),
      (${L_RELATORIO_EXPORTADO_400D}, ${CLINICA}, ${ATOR}, 'relatorio_exportado', 'report', ${ALVO}, now() - interval '400 days')`;

    await owner!`SELECT app_expurgar_audit_log_expirado()`;
  });

  afterAll(async () => {
    await owner!`DELETE FROM audit_log WHERE clinic_id = ${CLINICA}`;
    await owner!`DELETE FROM app_user WHERE id = ${ATOR}`;
    await owner!`DELETE FROM clinic WHERE id = ${CLINICA}`;
    // `owner.end()` só no ÚLTIMO describe do arquivo: a conexão é compartilhada
    // e um `end()` aqui deixaria a fronteira abaixo com CONNECTION_ENDED.
  });

  test("1. `reclassificacao` com 200 dias SOBREVIVE — trilha clínica acompanha o prontuário", async () => {
    expect(await idsVivos()).toContain(L_RECLASSIFICACAO_200D);
  });

  test("2. `login` com 200 dias SOME — log de acesso passou do mínimo legal", async () => {
    expect(await idsVivos()).not.toContain(L_LOGIN_200D);
  });

  test("3. ação fora das duas listas com 200 dias SOBREVIVE — fail-closed", async () => {
    expect(await idsVivos()).toContain(L_DESCONHECIDA_200D);
  });

  test("4. `login` com 10 dias SOBREVIVE — ainda dentro dos 180 dias", async () => {
    expect(await idsVivos()).toContain(L_LOGIN_10D);
  });

  test("5. `relatorio_exportado` com 400 dias SOBREVIVE — governança LGPD não tem teto", async () => {
    expect(await idsVivos()).toContain(L_RELATORIO_EXPORTADO_400D);
  });

  test("6. `pg_proc.prosrc` da função carrega a allowlist (verificação medida, não lida)", async () => {
    const [row] = await owner!<{ prosrc: string }[]>`
      SELECT prosrc FROM pg_proc WHERE proname = 'app_expurgar_audit_log_expirado_por_acao'
    `;
    expect(row?.prosrc).toContain("'login'");
    expect(row?.prosrc).toContain("= ANY");
    expect(row?.prosrc).not.toContain("'reclassificacao'");
    // O nome antigo virou wrapper: sem predicado próprio, delega.
    const [wrapper] = await owner!<{ prosrc: string }[]>`
      SELECT prosrc FROM pg_proc WHERE proname = 'app_expurgar_audit_log_expirado'
    `;
    expect(wrapper?.prosrc).toContain(
      "app_expurgar_audit_log_expirado_por_acao()",
    );
    expect(wrapper?.prosrc).not.toContain("DELETE");
  });
});

describe.skipIf(!hasDb)("#536 · fronteira de execução do expurgo", () => {
  beforeAll(async () => {
    // Role de login criada FORA das migrações (mesmo padrão de `iris_alarme_login`
    // em `alarme-jobs-rls.int.test.ts`): provisionamento de ambiente, não
    // objeto versionado.
    await owner!.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_ROLE}') THEN
          CREATE ROLE ${LOGIN_ROLE} LOGIN PASSWORD '${LOGIN_PASSWORD}' IN ROLE iris_expurgo_audit_log;
        END IF;
      END
      $$;
    `);
  });

  afterAll(async () => {
    await owner?.end();
  });

  test("7. a role do job (`iris_expurgo_audit_log`) EXECUTA as três funções", async () => {
    const url = process.env.MIGRATION_DATABASE_URL!.replace(
      /:\/\/[^@]+@/,
      `://${LOGIN_ROLE}:${LOGIN_PASSWORD}@`,
    );
    const conn = postgres(url, { max: 1 });
    try {
      const [a] = await conn<
        { n: number }[]
      >`SELECT app_pseudonimizar_audit_log_orfao() AS n`;
      const [b] = await conn<
        { n: number }[]
      >`SELECT app_expurgar_audit_log_expirado() AS n`;
      const porAcao = await conn<
        { acao: string; apagadas: number }[]
      >`SELECT * FROM app_expurgar_audit_log_expirado_por_acao()`;
      expect(typeof a?.n).toBe("number");
      expect(typeof b?.n).toBe("number");
      expect(Array.isArray(porAcao)).toBe(true);
    } finally {
      await conn.end();
    }
  });

  test("8. `app_role` (DATABASE_URL do app) NÃO executa o expurgo — 42501", async () => {
    const conn = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      await expect(
        conn`SELECT app_expurgar_audit_log_expirado()`,
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await conn.end();
    }
  });
});
