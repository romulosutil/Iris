import { describe, expect, test } from "vitest";
import { codigoPg } from "./pg-error";

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
