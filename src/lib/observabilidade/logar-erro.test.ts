import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  descreverErroSemPII,
  hashCurto,
  logarErroSemPII,
  resumirErro,
} from "./logar-erro";

/**
 * Réplica fiel do que o `drizzle-orm@0.45` monta: a `.message` do
 * `DrizzleQueryError` é "Failed query: <sql>\nparams: <params>" — os params
 * são os VALORES vinculados, e numa escrita do diário isso é a nota clínica.
 * O erro do driver (SQLSTATE, constraint) fica em `.cause`.
 */
const TEXTO_CLINICO = "paciente relatou ideação suicida após briga em casa";
const SQL = 'insert into "session_note" ("texto") values ($1)';

function erroDeDriver(): Error {
  const causa = Object.assign(new Error(`duplicate key: ${TEXTO_CLINICO}`), {
    name: "PostgresError",
    code: "23505",
    constraint_name: "uq_session_note",
  });
  const err = new Error(`Failed query: ${SQL}\nparams: ${TEXTO_CLINICO}`, {
    cause: causa,
  });
  err.name = "DrizzleQueryError";
  return err;
}

/** Tudo que o `console.error` recebeu, achatado numa string só. */
function tudoQueFoiLogado(espiao: ReturnType<typeof vi.spyOn>): string {
  return espiao.mock.calls
    .map((args) =>
      args
        .map((a) =>
          typeof a === "string"
            ? a
            : a instanceof Error
              ? `${a.name}: ${a.message}\n${a.stack ?? ""}`
              : JSON.stringify(a),
        )
        .join(" "),
    )
    .join("\n");
}

describe("logarErroSemPII", () => {
  let espiao: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    espiao = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    espiao.mockRestore();
  });

  it("não deixa a message do driver (SQL + params com texto clínico) chegar ao log", () => {
    logarErroSemPII("consolidarSessao:", erroDeDriver());

    const saida = tudoQueFoiLogado(espiao);
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(saida).not.toContain(TEXTO_CLINICO);
    expect(saida).not.toContain("params:");
    expect(saida).not.toContain("Failed query");
    expect(saida).not.toContain(SQL);
    // Nem a message da CAUSA (o driver ecoa o valor da linha na violação).
    expect(saida).not.toContain("duplicate key");
  });

  it("registra rótulo, nome, SQLSTATE, constraint, hash da message e correlacaoId", () => {
    const correlacaoId = logarErroSemPII("consolidarSessao:", erroDeDriver(), {
      sessionId: "s-1",
    });

    expect(correlacaoId).toMatch(/^[0-9a-f]{8}$/);
    const [rotulo, resumo] = espiao.mock.calls[0]!;
    expect(rotulo).toBe("consolidarSessao:");
    expect(resumo).toEqual({
      correlacaoId,
      nome: "DrizzleQueryError",
      codigo: "23505",
      constraint: "uq_session_note",
      causaNome: "PostgresError",
      hashMensagem: hashCurto(`Failed query: ${SQL}\nparams: ${TEXTO_CLINICO}`),
      sessionId: "s-1",
    });
  });

  it("nunca passa o objeto de erro (nem stack) como argumento do console", () => {
    const err = erroDeDriver();
    logarErroSemPII("x", err);
    for (const arg of espiao.mock.calls[0]!) {
      expect(arg).not.toBe(err);
      expect(arg).not.toBeInstanceOf(Error);
      expect(JSON.stringify(arg)).not.toContain("stack");
    }
  });

  it("um `extra` não consegue reintroduzir a message: só primitivos entram", () => {
    // O tipo já barra objetos, mas o teste protege contra `as any` no chamador.
    const err = erroDeDriver();
    logarErroSemPII("x", err, {
      // @ts-expect-error — objeto não é permitido em `extra`
      objeto: { message: err.message },
      texto: "ok",
    });
    const saida = tudoQueFoiLogado(espiao);
    expect(saida).not.toContain(TEXTO_CLINICO);
    expect(saida).toContain("ok");
  });

  it("erro que não é Error vira tipo + hash, sem serializar o valor", () => {
    logarErroSemPII("x", { message: TEXTO_CLINICO, name: "validation_error" });
    const saida = tudoQueFoiLogado(espiao);
    expect(saida).not.toContain(TEXTO_CLINICO);
    expect(saida).toContain("validation_error");
  });

  it("dois erros com a mesma message compartilham hash, mas nunca correlacaoId", () => {
    const a = logarErroSemPII("x", erroDeDriver());
    const b = logarErroSemPII("x", erroDeDriver());
    expect(a).not.toBe(b);
    const [, ra] = espiao.mock.calls[0]! as [string, { hashMensagem: string }];
    const [, rb] = espiao.mock.calls[1]! as [string, { hashMensagem: string }];
    expect(ra.hashMensagem).toBe(rb.hashMensagem);
  });
});

describe("resumirErro / descreverErroSemPII", () => {
  it("lê o code na raiz quando o driver não foi embrulhado", () => {
    const cru = Object.assign(new Error("x"), { code: "ECONNREFUSED" });
    const r = resumirErro(cru, "abcd1234");
    expect(r.nome).toBe("Error");
    expect(r.codigo).toBe("ECONNREFUSED");
    expect(r.correlacaoId).toBe("abcd1234");
  });

  it("descreve em uma linha sem message", () => {
    const texto = descreverErroSemPII(erroDeDriver(), "abcd1234");
    expect(texto).toBe(
      "DrizzleQueryError (SQLSTATE 23505, constraint uq_session_note) correlacao=abcd1234",
    );
    expect(texto).not.toContain(TEXTO_CLINICO);
  });

  it("descreve valor não-Error sem message", () => {
    expect(descreverErroSemPII("boom", "abcd1234")).toBe(
      "string correlacao=abcd1234",
    );
    expect(descreverErroSemPII(undefined, "abcd1234")).toBe(
      "undefined correlacao=abcd1234",
    );
  });
});

describe("hashCurto", () => {
  it("é sha256 (8 hex) — vetores conhecidos", () => {
    expect(hashCurto("abc")).toBe("ba7816bf");
    expect(hashCurto("")).toBe("e3b0c442");
    // > 55 bytes força dois blocos de 64 — o padding é a parte que mais erra.
    expect(
      hashCurto("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61");
    // UTF-8 multibyte conta em bytes, não em code units.
    expect(hashCurto("ideação")).toMatch(/^[0-9a-f]{8}$/);
  });
});
