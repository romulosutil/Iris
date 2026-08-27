/**
 * D56 — declaração de e-Psi (Res. CFP 009/2024) contra o Postgres real.
 *
 * O que estes casos existem para provar, e que nenhum teste de unidade prova:
 *
 * 1. A escrita ACONTECE. `app_user` tem FORCE RLS e uma única policy para
 *    `app_role` — `app_user_read`, FOR SELECT (0002/0085). Um `UPDATE app_user`
 *    cru afeta 0 linhas EM SILÊNCIO, e a tela devolveria `{ ok: true }` sem
 *    gravar nada. É o defeito #212, e o oráculo aqui é obrigatoriamente a role
 *    DONA relendo a linha — asserir o retorno é o que deixou aquele bug passar.
 * 2. A escrita atinge SÓ o próprio registro. `app_declarar_e_psi` (0133) é
 *    SECURITY DEFINER: ela bypassa RLS, e o guard interno é a única barreira.
 *    Regra de mutação: trocar `WHERE id = v_user` por `WHERE true` na 0133 tem
 *    que derrubar o caso "colega não é tocado". Se não derrubar, o caso é
 *    decorativo.
 * 3. A função é NECESSÁRIA, não decorativa: o mesmo UPDATE por `withTenant`
 *    afeta 0 linhas.
 *
 * Roda com `pnpm test:rls`. `vitest run` cru neste arquivo COLETA ZERO e sai
 * verde — conferir a contagem, não o verde. Gate de env em
 * `db/tests/integration-env.ts`.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

// Neutraliza o side-effect de `server-only` e importa só o núcleo
// ctx-accepting (o wrapper `"use server"` vive em ./actions).
vi.mock("server-only", () => ({}));
const { declararEPsi, lerPerfilProfissional } = await import("./logic");
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");

const CLINIC_A = "00000000-0000-0000-0000-00000000d56a";
const CLINIC_B = "00000000-0000-0000-0000-00000000d56b";
const U_PSI_A = "00000000-0000-0000-0000-00000000d561";
const U_COLEGA_A = "00000000-0000-0000-0000-00000000d562";
const U_PSI_B = "00000000-0000-0000-0000-00000000d563";

// E-mail carrega o sufixo do arquivo: `app_user.email` é UNIQUE global e
// colisão entre int-tests derruba o `beforeAll` de quem rodar depois, com um
// erro que se lê como defeito de RLS.
const EMAIL = (n: string) => `${n}@d56-perfil.test`;

const NUMERO = "06/123456";

let owner: ReturnType<typeof postgres>;

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as never;

/** Estado real da linha, lido pela role DONA (bypassa RLS) — o oráculo. */
async function estado(userId: string) {
  const [row] = await owner<
    {
      e_psi_verified: boolean;
      e_psi_number: string | null;
      e_psi_declarado_em: Date | null;
    }[]
  >`SELECT e_psi_verified, e_psi_number, e_psi_declarado_em
      FROM app_user WHERE id = ${userId}`;
  return row!;
}

/** Mensagem do erro do banco (o driver aninha o original em `cause`). */
async function erro(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    return (
      ((e as Error).cause as Error | undefined)?.message ?? (e as Error).message
    );
  }
  throw new Error("a chamada devia ter estourado, mas passou");
}

describe.skipIf(!hasDb)("D56 · declaração de e-Psi persiste de fato", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    // DELETE escopado, não TRUNCATE: TRUNCATE de `app_user`/`clinic` colide com
    // int-tests que rodam em paralelo (deadlock + violação de FK em arquivo
    // vizinho), e a falha aparece longe daqui.
    await owner`DELETE FROM audit_log WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM app_user WHERE id IN (${U_PSI_A}, ${U_COLEGA_A}, ${U_PSI_B})`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;

    await owner`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica A D56'), (${CLINIC_B}, 'Clínica B D56')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_PSI_A},    'Psi A',    ${EMAIL("psi-a")}),
      (${U_COLEGA_A}, 'Colega A', ${EMAIL("colega-a")}),
      (${U_PSI_B},    'Psi B',    ${EMAIL("psi-b")})`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_PSI_A},    ${CLINIC_A}, 'terapeuta'),
      (${U_COLEGA_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_PSI_B},    ${CLINIC_B}, 'terapeuta')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("declarar grava a LINHA no banco (o UPDATE cru seria no-op)", async () => {
    const r = await declararEPsi(ctx("terapeuta", U_PSI_A), {
      declarado: true,
      numero: `  ${NUMERO}  `,
    });
    expect(r).toEqual({ ok: true });

    const linha = await estado(U_PSI_A);
    expect(linha.e_psi_verified).toBe(true);
    expect(linha.e_psi_number).toBe(NUMERO);
    expect(linha.e_psi_declarado_em).toBeInstanceOf(Date);
  });

  test("o colega da MESMA clínica não é tocado", async () => {
    // Mutação: `WHERE id = v_user` → `WHERE true` na 0133 derruba este caso.
    const colega = await estado(U_COLEGA_A);
    expect(colega.e_psi_verified).toBe(false);
    expect(colega.e_psi_number).toBeNull();
    expect(colega.e_psi_declarado_em).toBeNull();
  });

  test("o profissional da outra clínica não é tocado", async () => {
    const outro = await estado(U_PSI_B);
    expect(outro.e_psi_verified).toBe(false);
    expect(outro.e_psi_number).toBeNull();
  });

  test("a leitura da tela devolve o que foi gravado", async () => {
    const perfil = await lerPerfilProfissional(ctx("terapeuta", U_PSI_A));
    expect(perfil?.ePsiVerified).toBe(true);
    expect(perfil?.ePsiNumber).toBe(NUMERO);
    expect(perfil?.ePsiDeclaradoEm).not.toBeNull();
  });

  test("a trilha registra a declaração", async () => {
    const linhas = await owner<
      { entidade: string; entidade_id: string; detalhe: Record<string, unknown> }[]
    >`SELECT entidade, entidade_id, detalhe
        FROM audit_log
       WHERE acao = 'e_psi_declarado' AND clinic_id = ${CLINIC_A}
       ORDER BY criado_em ASC`;

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.entidade).toBe("app_user");
    expect(linhas[0]!.entidade_id).toBe(U_PSI_A);
    expect(linhas[0]!.detalhe).toMatchObject({
      verified: true,
      numero: NUMERO,
    });
  });

  test("o mesmo UPDATE por withTenant afeta ZERO linhas — a função é o caminho", async () => {
    // Sem esta prova, `app_declarar_e_psi` poderia ser decoração: os casos
    // acima passariam igual se `app_role` pudesse escrever direto.
    const afetadas = await withTenant(
      ctx("terapeuta", U_COLEGA_A),
      async (tx) => {
        const r = await tx.execute(sql`
          UPDATE app_user
             SET e_psi_verified = true, e_psi_number = 'BYPASS'
           WHERE id = ${U_COLEGA_A}::uuid
        `);
        return (r as unknown as { count?: number }).count ?? 0;
      },
    );

    expect(afetadas).toBe(0);
    const colega = await estado(U_COLEGA_A);
    expect(colega.e_psi_verified).toBe(false);
  });

  test("retirar a declaração zera número e data", async () => {
    const r = await declararEPsi(ctx("terapeuta", U_PSI_A), {
      declarado: false,
      numero: "",
    });
    expect(r).toEqual({ ok: true });

    const linha = await estado(U_PSI_A);
    expect(linha.e_psi_verified).toBe(false);
    expect(linha.e_psi_number).toBeNull();
    expect(linha.e_psi_declarado_em).toBeNull();
  });

  test("usuário sem papel na clínica do contexto é barrado pelo guard da 0133", async () => {
    // O ctx é forjado de propósito: papel em CLINIC_B, tenant apontando para
    // CLINIC_A. É exatamente o que o guard do definer existe para recusar.
    const msg = await erro(() =>
      declararEPsi(ctx("terapeuta", U_PSI_B, CLINIC_A), {
        declarado: true,
        numero: NUMERO,
      }),
    );
    expect(msg).toContain("não tem papel na clínica");

    const outro = await estado(U_PSI_B);
    expect(outro.e_psi_verified).toBe(false);
  });

  test("o banco recusa declarar sem número, mesmo se a app deixar passar", async () => {
    // Defesa em profundidade: a validação Zod de `logic.ts` já barra, mas ela
    // não é a fronteira. Aqui a chamada vai direto na função.
    const msg = await erro(() =>
      withTenant(ctx("terapeuta", U_PSI_A), (tx) =>
        tx.execute(sql`SELECT app_declarar_e_psi(true, '   ')`),
      ),
    );
    expect(msg).toContain("exige o número do e-Psi");
  });
});
