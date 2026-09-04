import { describe, expect, it } from "vitest";

import { capturarLog } from "./captura-de-log";
import { logger } from "./logger";

describe("capturarLog", () => {
  it("bruto() não lança quando o contexto carrega bigint", () => {
    const log = capturarLog();
    try {
      // O driver devolve colunas `bigint` (ex.: `acervo.bytes_tamanho`) como
      // `bigint` do JS. Com o `JSON.stringify` nativo, a asserção negativa do
      // próprio teste morreria com `TypeError: Do not know how to serialize a
      // BigInt` — silenciando as outras asserções do arquivo.
      logger.warn("acervo.tamanho-excedido", {
        bytesTamanho: 9007199254740993n,
      });
      expect(() => log.bruto()).not.toThrow();
      expect(log.bruto()).toContain("9007199254740993");
      expect(log.bruto()).not.toContain("segredo");
    } finally {
      log.restaurar();
    }
  });
});
