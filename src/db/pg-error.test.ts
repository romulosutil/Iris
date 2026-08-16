import { describe, expect, test } from "vitest";
import { codigoPg, mensagemPg } from "./pg-error";

/**
 * O ponto destes testes é a ASSIMETRIA das duas formas.
 *
 * Um `catch` que lesse só `e.cause.code` passaria hoje (o Drizzle embrulha) e
 * quebraria em silêncio numa versão que não embrulhasse — devolvendo 500 opaco
 * em vez da mensagem amigável. O contrário também vale. Por isso os dois
 * formatos têm caso próprio: cobrir só um deixa metade da regressão passar.
 */
describe("codigoPg", () => {
  test("lê SQLSTATE na raiz (erro cru do postgres-js)", () => {
    expect(codigoPg(Object.assign(new Error("dup"), { code: "23505" }))).toBe(
      "23505",
    );
  });

  test("lê SQLSTATE em .cause (erro embrulhado pelo Drizzle)", () => {
    const embrulhado = Object.assign(new Error("DrizzleQueryError"), {
      cause: Object.assign(new Error("dup"), { code: "23505" }),
    });
    expect(codigoPg(embrulhado)).toBe("23505");
  });

  test("raiz tem precedência quando as duas existem", () => {
    const ambos = Object.assign(new Error("x"), {
      code: "23P01",
      cause: { code: "23505" },
    });
    expect(codigoPg(ambos)).toBe("23P01");
  });

  test("erro sem SQLSTATE devolve undefined em vez de estourar", () => {
    expect(codigoPg(new Error("erro comum"))).toBeUndefined();
    expect(codigoPg(undefined)).toBeUndefined();
    expect(codigoPg(null)).toBeUndefined();
    expect(codigoPg("string solta")).toBeUndefined();
  });
});

/**
 * A precedência aqui é o INVERSO do `codigoPg`, e é o ponto do teste: o
 * `DrizzleQueryError` guarda em `.message` o SQL que o app emitiu, e a exceção
 * do banco só existe em `.cause`. Uma leitura que preferisse a raiz devolveria
 * `Failed query: SELECT app_assert_...` como se fosse o diagnóstico — texto
 * errado, sem nenhum erro visível.
 */
describe("mensagemPg", () => {
  test("prefere a mensagem do banco em .cause à do embrulho Drizzle", () => {
    const embrulhado = Object.assign(
      new Error(
        "Failed query: SELECT app_assert_destinatarios_no_tenant($1,$2)",
      ),
      {
        cause: Object.assign(new Error("destinatário fora do tenant"), {
          code: "P0001",
        }),
      },
    );
    expect(mensagemPg(embrulhado)).toBe("destinatário fora do tenant");
  });

  test("erro cru do driver (sem .cause) cai na raiz", () => {
    expect(
      mensagemPg(Object.assign(new Error("fora do tenant"), { code: "P0001" })),
    ).toBe("fora do tenant");
  });

  test("valor sem mensagem devolve undefined em vez de estourar", () => {
    expect(mensagemPg(undefined)).toBeUndefined();
    expect(mensagemPg(null)).toBeUndefined();
    expect(mensagemPg({})).toBeUndefined();
  });
});
