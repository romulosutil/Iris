import { describe, expect, test } from "vitest";
import { deveReextrair } from "./reextraction-policy";

// P0: consolidarSessao NÃO pode re-chamar o LLM nem apagar extrações revisadas
// quando o texto não mudou. Só re-extrai se houver motivo real.
describe("deveReextrair", () => {
  test("pula quando texto inalterado, já há extrações e nenhuma pendente", () => {
    expect(
      deveReextrair({
        textoMudou: false,
        temExtracoes: true,
        temPendente: false,
      }),
    ).toBe(false);
  });

  test("re-extrai quando o texto mudou", () => {
    expect(
      deveReextrair({
        textoMudou: true,
        temExtracoes: true,
        temPendente: false,
      }),
    ).toBe(true);
  });

  test("re-extrai na primeira consolidação (sem extrações ainda)", () => {
    expect(
      deveReextrair({
        textoMudou: false,
        temExtracoes: false,
        temPendente: false,
      }),
    ).toBe(true);
  });

  test("re-extrai se há extração pendente de reprocessamento (retry)", () => {
    expect(
      deveReextrair({
        textoMudou: false,
        temExtracoes: true,
        temPendente: true,
      }),
    ).toBe(true);
  });
});
