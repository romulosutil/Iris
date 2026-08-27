/**
 * D56 — validação da declaração de e-Psi (Res. CFP 009/2024).
 *
 * O oráculo destes casos é o SQL QUE CHEGA na função `app_declarar_e_psi`, não
 * o retorno `{ ok: true }`: asserir só o retorno é o que deixou o defeito #212
 * passar despercebido por meses. `withTenant` é dublado para capturar os
 * parâmetros do `tx.execute`, e o caso inválido é provado por `execute` NUNCA
 * ter sido chamado — validação que só produz mensagem, mas deixa a chamada
 * sair, não é validação.
 *
 * A regra de banco (CHECK `app_user_e_psi_check` + guard da 0133) é medida em
 * `logic.int.test.ts`. Aqui é a camada de aplicação.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const execute = vi.fn(async (_query: unknown) => []);

vi.mock("@/db/rls", () => ({
  withTenant: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute }),
}));

const { declararEPsi } = await import("./logic");

const ctx = { role: "terapeuta", userId: "u-1", clinicId: "c-1" } as never;

/** Parâmetros ligados ao template `sql` da última chamada. */
function ultimosParams(): unknown[] {
  const arg = execute.mock.calls.at(-1)?.[0] as
    | { queryChunks?: unknown[] }
    | undefined;
  const chunks = arg?.queryChunks ?? [];
  // `queryChunks` intercala `StringChunk` (pedaço literal do SQL) com o valor
  // interpolado, que o Drizzle guarda boxed (`new String`/`new Boolean`).
  // Filtrar por `.value` pegaria os literais junto — o discriminador é o tipo.
  return chunks
    .filter((c) => (c as object)?.constructor?.name !== "StringChunk")
    .map((c) => (c as object).valueOf());
}

beforeEach(() => execute.mockClear());

describe("declararEPsi", () => {
  test("declarar sem número reprova e NÃO chega ao banco", async () => {
    const r = await declararEPsi(ctx, { declarado: true, numero: "   " });

    expect(r).toEqual({
      error:
        "Informe o número do seu cadastro no e-Psi para registrar a declaração.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test("número acima de 60 caracteres reprova e NÃO chega ao banco", async () => {
    const r = await declararEPsi(ctx, {
      declarado: true,
      numero: "9".repeat(61),
    });

    expect(r).toEqual({
      error: "O número do e-Psi tem no máximo 60 caracteres.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test("o número vai TRIMADO para app_declarar_e_psi", async () => {
    const r = await declararEPsi(ctx, {
      declarado: true,
      numero: "  06/123456  ",
    });

    expect(r).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
    // `true` primeiro, número depois — a ordem dos parâmetros da 0133.
    expect(ultimosParams()).toEqual([true, "06/123456"]);
  });

  test("retirar a declaração é caminho válido, mesmo sem número", async () => {
    const r = await declararEPsi(ctx, { declarado: false, numero: "" });

    expect(r).toEqual({ ok: true });
    expect(ultimosParams()).toEqual([false, ""]);
  });

  test("o id do usuário NÃO é parâmetro — quem resolve o alvo é o banco", async () => {
    await declararEPsi(ctx, { declarado: true, numero: "06/123456" });

    // Se algum dia alguém acrescentar o userId aqui, a função passa a aceitar
    // alvo por parâmetro e o guard `app_user_id_exigido()` da 0133 deixa de ser
    // a fronteira. Este caso quebra antes disso chegar em produção.
    expect(ultimosParams()).not.toContain("u-1");
  });
});
