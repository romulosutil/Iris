import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

// throttle.ts usa "server-only" — pacote que lança fora do bundle de servidor
// do Next (mesma razão dos demais .int.test.ts do repo).
vi.mock("server-only", () => ({}));

const { authDb } = await import("@/db/client");
const { ThrottleIndisponivel, registrarTentativa } =
  await import("@/lib/throttle");

/**
 * O throttle do cadastro público é ANTI-FORÇA-BRUTA, não só anti-enumeração:
 * `verificarPossePorSenha` (src/auth/cadastro.ts) verifica senha por
 * `auth.$context`, que NÃO passa por `auth.handler` — logo rate limiting,
 * contador de falha e lockout do Better-Auth nunca rodam nesse caminho. A
 * única proteção é esta. Por isso o estado precisa ser COMPARTILHADO e
 * PERSISTENTE (Postgres), não um `Map` por processo: com N réplicas, um `Map`
 * multiplica o limite efetivo por N e zera a cada deploy/reciclagem.
 */
describe.skipIf(!hasDb)(
  "registrarTentativa (Postgres, compartilhado entre instâncias)",
  () => {
    beforeEach(async () => {
      await authDb.execute(sql`DELETE FROM auth_throttle`);
    });

    it("permite até o limite e nega a partir dele", async () => {
      const chave = `t:${crypto.randomUUID()}`;
      const r: boolean[] = [];
      for (let i = 0; i < 7; i++) {
        r.push((await registrarTentativa(chave, 5, 900, 86_400)).permitido);
      }
      expect(r).toEqual([true, true, true, true, true, false, false]);
    });

    it("conta chaves independentes de forma isolada", async () => {
      const a = `t:${crypto.randomUUID()}`;
      const b = `t:${crypto.randomUUID()}`;
      for (let i = 0; i < 5; i++) await registrarTentativa(a, 5, 900, 86_400);
      expect((await registrarTentativa(a, 5, 900, 86_400)).permitido).toBe(
        false,
      );
      expect((await registrarTentativa(b, 5, 900, 86_400)).permitido).toBe(
        true,
      );
    });

    it("reabre depois que a janela expira", async () => {
      const chave = `t:${crypto.randomUUID()}`;
      for (let i = 0; i < 6; i++)
        await registrarTentativa(chave, 5, 900, 86_400);
      // Empurra a janela para o passado (equivalente a esperar 15 min).
      await authDb.execute(
        sql`UPDATE auth_throttle SET janela_expira_em = now() - interval '1 second' WHERE chave = ${chave}`,
      );
      expect((await registrarTentativa(chave, 5, 900, 86_400)).permitido).toBe(
        true,
      );
    });

    it("aplica BACKOFF: cada tentativa excedente empurra o reset para mais longe", async () => {
      const chave = `t:${crypto.randomUUID()}`;
      for (let i = 0; i < 5; i++)
        await registrarTentativa(chave, 5, 900, 86_400);
      const ler = async () => {
        const rows = (await authDb.execute(
          sql`SELECT extract(epoch from (janela_expira_em - now())) AS s FROM auth_throttle WHERE chave = ${chave}`,
        )) as unknown as { s: string }[];
        return Number(rows[0]!.s);
      };
      const base = await ler();
      await registrarTentativa(chave, 5, 900, 86_400); // 6ª: 900 * 2^1
      const um = await ler();
      await registrarTentativa(chave, 5, 900, 86_400); // 7ª: 900 * 2^2
      const dois = await ler();

      expect(um).toBeGreaterThan(base);
      expect(dois).toBeGreaterThan(um);
      expect(dois).toBeGreaterThan(3000); // já passou de 900s * 2 = 1800s
    });

    it("respeita o teto do backoff", async () => {
      const chave = `t:${crypto.randomUUID()}`;
      for (let i = 0; i < 12; i++)
        await registrarTentativa(chave, 5, 900, 3_600);
      const rows = (await authDb.execute(
        sql`SELECT extract(epoch from (janela_expira_em - now())) AS s FROM auth_throttle WHERE chave = ${chave}`,
      )) as unknown as { s: string }[];
      expect(Number(rows[0]!.s)).toBeLessThanOrEqual(3_600 + 1);
    });

    it("é atômico: 20 tentativas concorrentes contam 20, não menos", async () => {
      const chave = `t:${crypto.randomUUID()}`;
      const rs = await Promise.all(
        Array.from({ length: 20 }, () =>
          registrarTentativa(chave, 5, 900, 86_400),
        ),
      );
      expect(rs.filter((r) => r.permitido)).toHaveLength(5);
      const rows = (await authDb.execute(
        sql`SELECT contagem FROM auth_throttle WHERE chave = ${chave}`,
      )) as unknown as { contagem: number }[];
      expect(Number(rows[0]!.contagem)).toBe(20);
    });

    it("o estado é lido do BANCO, não de memória do processo", async () => {
      const chave = `t:${crypto.randomUUID()}`;
      // Simula "outra réplica já gastou o limite" escrevendo direto no banco.
      await authDb.execute(
        sql`INSERT INTO auth_throttle (chave, contagem, janela_expira_em)
          VALUES (${chave}, 5, now() + interval '900 seconds')`,
      );
      expect((await registrarTentativa(chave, 5, 900, 86_400)).permitido).toBe(
        false,
      );
    });

    it("FALHA FECHADO: erro do store vira ThrottleIndisponivel (nunca 'permitido')", async () => {
      // Byte NUL é rejeitado pelo Postgres em `text` → o INSERT falha DE VERDADE
      // no banco (nenhum dublê): o contrato é lançar, não liberar.
      const chave = `t:${String.fromCharCode(0)}ruim`;
      await expect(
        registrarTentativa(chave, 5, 900, 86_400),
      ).rejects.toBeInstanceOf(ThrottleIndisponivel);
    });
  },
);
