import { describe, expect, test } from "vitest";
import {
  formatarDuracaoSegundos,
  formatarLatenciaMs,
  formatarSemana,
  taxaAprovacaoSemEdicao,
} from "./saude-ia";

// DA-01 (#535): helpers puros do bloco "Saúde da IA". A meta de produto é
// "≥70% de aprovação sem edição" (PRODUCT.md:34) — o denominador é o que já
// foi REVISADO (aprovada + editada + descartada), nunca o total sugerido:
// sugestão ainda na fila não é nem acerto nem erro.

describe("taxaAprovacaoSemEdicao", () => {
  test("aprovadas / revisadas, arredondado", () => {
    expect(
      taxaAprovacaoSemEdicao({
        aprovadasSemEdicao: 7,
        editadas: 2,
        descartadas: 1,
      }),
    ).toEqual({ revisadas: 10, taxa: 70 });
  });

  test("nada revisado → taxa null (não 0%, não 100%)", () => {
    expect(
      taxaAprovacaoSemEdicao({
        aprovadasSemEdicao: 0,
        editadas: 0,
        descartadas: 0,
      }),
    ).toEqual({ revisadas: 0, taxa: null });
  });

  test("2 de 3 → 67 (arredonda, não trunca)", () => {
    expect(
      taxaAprovacaoSemEdicao({
        aprovadasSemEdicao: 2,
        editadas: 1,
        descartadas: 0,
      }).taxa,
    ).toBe(67);
  });
});

describe("formatarDuracaoSegundos", () => {
  test("null → travessão", () => {
    expect(formatarDuracaoSegundos(null)).toBe("—");
  });
  test("< 1 min em segundos; < 1 h em minutos; < 2 dias em horas; resto em dias", () => {
    expect(formatarDuracaoSegundos(42)).toBe("42 s");
    expect(formatarDuracaoSegundos(90)).toBe("2 min");
    expect(formatarDuracaoSegundos(5400)).toBe("1,5 h");
    expect(formatarDuracaoSegundos(3600 * 30)).toBe("30 h");
    expect(formatarDuracaoSegundos(86400 * 3)).toBe("3 dias");
  });
});

describe("formatarLatenciaMs", () => {
  test("null → travessão; ms abaixo de 1 s; segundos com 1 casa acima", () => {
    expect(formatarLatenciaMs(null)).toBe("—");
    expect(formatarLatenciaMs(850)).toBe("850 ms");
    expect(formatarLatenciaMs(8200)).toBe("8,2 s");
    expect(formatarLatenciaMs(92000)).toBe("92,0 s");
  });
});

describe("formatarSemana", () => {
  test("semana ISO + segunda-feira em pt-BR", () => {
    expect(formatarSemana("2026-W36", "2026-08-31")).toBe("W36 · 31/08");
  });
});
