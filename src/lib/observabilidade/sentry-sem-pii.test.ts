import { describe, expect, it } from "vitest";
import { higienizarEventoSentry, semParams } from "./sentry-sem-pii";

const TEXTO_CLINICO = "paciente relatou ideação suicida";
const MENSAGEM_DRIZZLE = `Failed query: insert into "session_note" ("texto") values ($1)\nparams: ${TEXTO_CLINICO}`;

describe("semParams", () => {
  it("corta tudo a partir de 'params:' e marca a redação", () => {
    const saida = semParams(MENSAGEM_DRIZZLE);
    expect(saida).not.toContain(TEXTO_CLINICO);
    expect(saida).toBe(
      'Failed query: insert into "session_note" ("texto") values ($1)\nparams: [redigido]',
    );
  });

  it("não toca string sem params", () => {
    expect(semParams("Cannot read properties of undefined")).toBe(
      "Cannot read properties of undefined",
    );
  });

  it("pega 'params:' no meio de uma linha e sem espaço", () => {
    expect(semParams(`x params:${TEXTO_CLINICO}`)).toBe("x params: [redigido]");
  });
});

describe("higienizarEventoSentry", () => {
  it("DrizzleQueryError: value vira nome + code, sem SQL nem params", () => {
    const evento = {
      exception: {
        values: [
          {
            type: "DrizzleQueryError",
            value: MENSAGEM_DRIZZLE,
          },
        ],
      },
    };
    const hint = {
      originalException: Object.assign(new Error(MENSAGEM_DRIZZLE), {
        cause: Object.assign(new Error("dup"), { code: "23505" }),
      }),
    };
    const saida = higienizarEventoSentry(evento, hint)!;
    const valor = saida.exception!.values![0]!.value;
    expect(valor).toBe("DrizzleQueryError (SQLSTATE 23505)");
    expect(JSON.stringify(saida)).not.toContain(TEXTO_CLINICO);
    expect(JSON.stringify(saida)).not.toContain("Failed query");
  });

  it("PostgresError (driver cru, sem cause): value vira nome + code", () => {
    const evento = {
      exception: {
        values: [
          {
            type: "PostgresError",
            value: `duplicate key value violates unique constraint — Detail: Key (texto)=(${TEXTO_CLINICO}) already exists.`,
          },
        ],
      },
    };
    const hint = {
      originalException: Object.assign(new Error("x"), { code: "23505" }),
    };
    const saida = higienizarEventoSentry(evento, hint)!;
    expect(saida.exception!.values![0]!.value).toBe(
      "PostgresError (SQLSTATE 23505)",
    );
    expect(JSON.stringify(saida)).not.toContain(TEXTO_CLINICO);
  });

  it("sem hint (edge/client), o code vem do próprio value ausente → só o nome", () => {
    const evento = {
      exception: {
        values: [{ type: "DrizzleQueryError", value: MENSAGEM_DRIZZLE }],
      },
    };
    const saida = higienizarEventoSentry(evento, undefined)!;
    expect(saida.exception!.values![0]!.value).toBe("DrizzleQueryError");
  });

  it("erro comum mantém a message, mas com 'params:' redigido em todo lugar", () => {
    const evento = {
      message: `boom params: ${TEXTO_CLINICO}`,
      exception: {
        values: [{ type: "TypeError", value: `wrapped: ${MENSAGEM_DRIZZLE}` }],
      },
      breadcrumbs: [
        { message: `query params: ${TEXTO_CLINICO}` },
        { message: "navegou" },
      ],
    };
    const saida = higienizarEventoSentry(evento, undefined)!;
    expect(saida.message).toBe("boom params: [redigido]");
    expect(saida.exception!.values![0]!.value).toBe(
      'wrapped: Failed query: insert into "session_note" ("texto") values ($1)\nparams: [redigido]',
    );
    expect(saida.breadcrumbs![0]!.message).toBe("query params: [redigido]");
    expect(saida.breadcrumbs![1]!.message).toBe("navegou");
    expect(JSON.stringify(saida)).not.toContain(TEXTO_CLINICO);
  });

  it("extra e contexts: 'params:' some em qualquer profundidade; o resto fica", () => {
    const evento = {
      extra: {
        erro: { message: MENSAGEM_DRIZZLE, code: "23505", tentativas: 3 },
        lista: [`a params: ${TEXTO_CLINICO}`, 42, null],
      },
      contexts: {
        query: { sql: `select 1 params: ${TEXTO_CLINICO}`, ok: true },
        runtime: { name: "node", version: "22" },
      },
    };
    const saida = higienizarEventoSentry(evento, undefined)!;
    expect(JSON.stringify(saida)).not.toContain(TEXTO_CLINICO);
    expect(saida.extra.erro).toEqual({
      message:
        'Failed query: insert into "session_note" ("texto") values ($1)\nparams: [redigido]',
      code: "23505",
      tentativas: 3,
    });
    expect(saida.extra.lista).toEqual(["a params: [redigido]", 42, null]);
    expect(saida.contexts.query).toEqual({
      sql: "select 1 params: [redigido]",
      ok: true,
    });
    expect(saida.contexts.runtime).toEqual({ name: "node", version: "22" });
  });

  it("nunca descarta o evento (devolve o mesmo objeto)", () => {
    const evento = {};
    expect(higienizarEventoSentry(evento, undefined)).toBe(evento);
  });
});
