import { describe, expect, test } from "vitest";
import { loteJaResolvido, ordensPendentesDeUpload } from "./diario-asr";

// #494/T20 — o predicado de idempotência do reenvio de lote de ASR.
//
// Unitário de propósito: `logic.ts` só abre conexão de forma preguiçosa
// (`src/db/client.ts`) e `server-only` é aliasado no `vitest.config.ts`, então
// dá para exercitar o predicado sem tocar Postgres. O que este arquivo mede é
// exatamente a regressão do T20: "existe linha" não é "lote concluído".
describe("ordensPendentesDeUpload / loteJaResolvido (#494, T20)", () => {
  const linha = (
    ordem: number,
    asrStatus: Parameters<typeof loteJaResolvido>[0][number]["asrStatus"],
  ) => ({ ordem, asrStatus });

  test("lote inexistente não está resolvido (é INSERT novo, não reenvio)", () => {
    expect(loteJaResolvido([])).toBe(false);
    expect(ordensPendentesDeUpload([])).toEqual([]);
  });

  test("lote inteiro na fila está resolvido — reenvio não re-sobe blob", () => {
    const linhas = [linha(0, "na_fila"), linha(1, "na_fila")];
    expect(ordensPendentesDeUpload(linhas)).toEqual([]);
    expect(loteJaResolvido(linhas)).toBe(true);
  });

  // O coração do T20: o INSERT commitou, a conexão caiu, nenhum upload
  // aconteceu. O critério antigo ("existe qualquer linha") dava o lote por
  // concluído e as linhas ficavam fora da fila para sempre.
  test("lote só com nao_solicitado NÃO está resolvido — tem que retomar", () => {
    const linhas = [linha(0, "nao_solicitado"), linha(1, "nao_solicitado")];
    expect(ordensPendentesDeUpload(linhas)).toEqual([0, 1]);
    expect(loteJaResolvido(linhas)).toBe(false);
  });

  // Queda no MEIO do lote: parte promovida, parte não. Retoma só o que falta.
  test("lote parcial devolve só as ordens que ficaram para trás", () => {
    const linhas = [
      linha(0, "na_fila"),
      linha(1, "nao_solicitado"),
      linha(2, "nao_solicitado"),
    ];
    expect(ordensPendentesDeUpload(linhas)).toEqual([1, 2]);
    expect(loteJaResolvido(linhas)).toBe(false);
  });

  // Todo estado que não seja `nao_solicitado` já teve destino decidido —
  // inclusive `falhou`, que é terminal e não pode ser ressuscitado por retry.
  test.each(["na_fila", "transcrevendo", "transcrito", "falhou"] as const)(
    "estado %s conta como resolvido, nunca como pendente",
    (estado) => {
      expect(ordensPendentesDeUpload([linha(0, estado)])).toEqual([]);
      expect(loteJaResolvido([linha(0, estado)])).toBe(true);
    },
  );

  test("um único nao_solicitado no meio de clipes terminais ainda pede retomada", () => {
    const linhas = [
      linha(0, "transcrito"),
      linha(1, "falhou"),
      linha(2, "nao_solicitado"),
    ];
    expect(loteJaResolvido(linhas)).toBe(false);
    expect(ordensPendentesDeUpload(linhas)).toEqual([2]);
  });
});
