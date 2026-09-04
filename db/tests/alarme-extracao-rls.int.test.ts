/**
 * #560 F5 — prova de que `app_alarme_extracao` (`0153`) conta o que diz contar,
 * e de que `iris_alarme` ENXERGA através dela.
 *
 * As duas coisas que só um teste com banco real prova:
 *
 * 1. **O definer é necessário.** `extraction` está sob RLS com policy de
 *    leitura `TO app_role`. Sem `SECURITY DEFINER`, a role de infra veria zero
 *    linhas SEM ERRO e o detector diria "tudo ok" para sempre — o defeito
 *    clássico que o cabeçalho da `0129` documenta. Por isso a asserção
 *    positiva conecta como `iris_alarme_login_560f5`, e nunca como o dono
 *    (`MIGRATION_DATABASE_URL`), que passaria mesmo com a função errada:
 *    RLS não se aplica a quem tem BYPASSRLS.
 * 2. **A unidade é a CHAMADA, não a linha.** Uma chamada bem-sucedida grava N
 *    linhas (uma por item de evidência) e uma falha grava uma. A fixture planta
 *    3 + 1 de propósito: contando linha crua, `chamadas` daria 4 e o p95 1850
 *    (interpolação sobre `[1000,1000,1000,2000]`); contando chamada, dá 2 e
 *    1950. Os dois números discriminam sozinhos.
 *
 * Mutação medida (04/09/2026, revertida com patch inverso): a função **sem**
 * `SECURITY DEFINER` (`prosecdef = false` conferido em `pg_proc`) derruba dois
 * casos daqui; `GROUP BY e.id` no lugar de `e.session_id` derruba o das
 * contagens.
 *
 * Arquivo separado do `alarme-jobs-rls.int.test.ts` (#294) de propósito: a
 * fixture é outra (extração, não ciclo/alerta) e o role de login é próprio,
 * o que elimina a corrida de `CREATE ROLE` entre dois arquivos em paralelo.
 *
 * Sufixo `560f5` em e-mail/identificadores: evita colisão de `UNIQUE(email)`
 * com os outros `*.int.test.ts` que rodam em paralelo (memória
 * `email-de-fixture-colide-entre-int-tests`). Limpeza por `DELETE` escopado —
 * nunca `TRUNCATE`, que colidiria com os mesmos vizinhos.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const LOGIN_ROLE = "iris_alarme_login_560f5";
const LOGIN_PASSWORD = "iris_alarme_login_teste_560f5";

const CLINICA = "00000000-0000-0000-0000-000000560f51";
const USER_TERAPEUTA = "00000000-0000-0000-0000-000000560f52";
const PACIENTE = "00000000-0000-0000-0000-000000560f53";
const SESSAO_OK = "00000000-0000-0000-0000-000000560f54";
const SESSAO_FALHA = "00000000-0000-0000-0000-000000560f55";
/** Modelo próprio: a função é cross-tenant por desenho e outros int-tests
 *  gravam extração no mesmo banco, na mesma janela. */
const MODELO = "modelo-teste-560f5";

function conexaoDoAlarme() {
  return postgres(
    process.env.MIGRATION_DATABASE_URL!.replace(
      /:\/\/[^@]+@/,
      `://${LOGIN_ROLE}:${LOGIN_PASSWORD}@`,
    ),
    { max: 1 },
  );
}

describe.skipIf(!hasDb)("#560 F5 · contadores da extração", () => {
  beforeAll(async () => {
    // Role de login criada FORA das migrações (mesmo padrão de `iris_retencao`
    // e `iris_arquivamento`, comentado na 0129): não é objeto versionado, é
    // provisionamento de ambiente, e o CI não tem outro lugar que a crie.
    await owner!.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_ROLE}') THEN
          CREATE ROLE ${LOGIN_ROLE} LOGIN PASSWORD '${LOGIN_PASSWORD}' IN ROLE iris_alarme;
        END IF;
      END
      $$;
    `);

    await owner!`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINICA}, 'Clínica #560f5', false)`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${USER_TERAPEUTA}, 'Terapeuta #560f5', 'terapeuta.560f5@t.com')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PACIENTE}, ${CLINICA}, 'Paciente #560f5')`;
    for (const s of [SESSAO_OK, SESSAO_FALHA]) {
      await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
        (${s}, ${CLINICA}, ${PACIENTE}, ${USER_TERAPEUTA}, now(), 'realizada', 'desconhecida')`;
    }

    // Sucesso: 3 linhas com a MESMA latência — a meta da chamada é gravada uma
    // vez para o lote inteiro (`diario-consolidacao.ts`, Fase C).
    await owner!`INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, modelo, latencia_ms, criado_em)
      SELECT ${SESSAO_OK}, ${CLINICA}, 'sugerida', 'evidencia', 'trecho #560f5', 'alta',
             '{}'::jsonb, ${MODELO}, 1000, now() - interval '10 minutes'
      FROM generate_series(1, 3)`;

    // Falha: 1 linha só (o `PENDENTE_DRAFT`).
    await owner!`INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, modelo, latencia_ms, criado_em)
      VALUES (${SESSAO_FALHA}, ${CLINICA}, 'pendente_reprocessamento', 'pendente', 'trecho #560f5', 'baixa',
             '{}'::jsonb, ${MODELO}, 2000, now() - interval '10 minutes')`;
  });

  afterAll(async () => {
    await owner!`DELETE FROM extraction WHERE modelo = ${MODELO}`;
    await owner!`DELETE FROM session WHERE id IN (${SESSAO_OK}, ${SESSAO_FALHA})`;
    await owner!`DELETE FROM patient WHERE id = ${PACIENTE}`;
    await owner!`DELETE FROM app_user WHERE id = ${USER_TERAPEUTA}`;
    await owner!`DELETE FROM clinic WHERE id = ${CLINICA}`;
    await owner?.end();
  });

  test("conta CHAMADA e não linha, lido como iris_alarme_login", async () => {
    const conn = conexaoDoAlarme();
    try {
      const rows = await conn<
        {
          modelo: string | null;
          chamadas: number;
          falhas: number;
          p95_latencia_ms: number | null;
        }[]
      >`SELECT * FROM app_alarme_extracao('1 hour'::interval)`;

      const linha = rows.find((r) => r.modelo === MODELO);
      expect(linha).toBeDefined();
      expect(linha!.chamadas).toBe(2);
      expect(linha!.falhas).toBe(1);
      expect(linha!.p95_latencia_ms).toBe(1950);
    } finally {
      await conn.end();
    }
  });

  test("chamada FORA da janela não entra na contagem", async () => {
    // A janela é o que faz o alarme ser sobre AGORA; sem ela, a falha de ontem
    // manteria o alarme aceso para sempre.
    const conn = conexaoDoAlarme();
    try {
      const rows = await conn<
        { modelo: string | null }[]
      >`SELECT * FROM app_alarme_extracao('1 minute'::interval)`;
      expect(rows.find((r) => r.modelo === MODELO)).toBeUndefined();
    } finally {
      await conn.end();
    }
  });

  test("SELECT cru em extraction é negado a iris_alarme_login", async () => {
    // Se este teste passar a devolver linhas em vez de estourar, alguém deu um
    // GRANT de tabela para `iris_alarme` e a fronteira de privilégio caiu — a
    // função é a ÚNICA superfície de leitura desta role.
    const conn = conexaoDoAlarme();
    try {
      await expect(
        conn`SELECT 1 FROM extraction LIMIT 1`,
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await conn.end();
    }
  });
});
