import { describe, expect, it } from "vitest";

import {
  calcularMensalidadeCentavos,
  calculateMonthlyFee,
  detalharMensalidade,
  formatarBRL,
  FAIXAS_PRECIFICACAO,
  VALOR_PRIMEIRO_PACIENTE_CENTAVOS,
} from "./calculator";

/**
 * Regra deste arquivo: todo valor esperado é uma CONSTANTE literal, com a
 * conta feita à mão no comentário ao lado. Recalcular a fórmula dentro do
 * teste faria o teste passar contra uma implementação errada — ele estaria
 * apenas confirmando que a implementação concorda consigo mesma.
 */
describe("calcularMensalidadeCentavos — faixas marginais", () => {
  it("cobra 0 para clínica sem paciente ativo", () => {
    expect(calcularMensalidadeCentavos(0)).toBe(0);
  });

  it("cobra R$ 39,00 pelo primeiro paciente", () => {
    // 1 x 3900 = 3900
    expect(calcularMensalidadeCentavos(1)).toBe(3900);
  });

  it("cobra R$ 585,00 no topo da primeira faixa (15)", () => {
    // 15 x 3900 = 58500
    expect(calcularMensalidadeCentavos(15)).toBe(58500);
  });

  it("cobra R$ 617,00 no primeiro paciente da segunda faixa (16)", () => {
    // 58500 + (1 x 3200) = 61700  -> R$ 585,00 + R$ 32,00
    expect(calcularMensalidadeCentavos(16)).toBe(61700);
  });

  it("cobra R$ 745,00 para 20 pacientes (exemplo canônico do produto)", () => {
    // (15 x 3900) + (5 x 3200) = 58500 + 16000 = 74500
    expect(calcularMensalidadeCentavos(20)).toBe(74500);
  });

  it("cobra R$ 1.385,00 no topo da segunda faixa (40)", () => {
    // (15 x 3900) + (25 x 3200) = 58500 + 80000 = 138500
    expect(calcularMensalidadeCentavos(40)).toBe(138500);
  });

  it("cobra R$ 1.410,00 no primeiro paciente da terceira faixa (41)", () => {
    // 138500 + (1 x 2500) = 141000
    expect(calcularMensalidadeCentavos(41)).toBe(141000);
  });

  it("cobra R$ 2.885,00 para 100 pacientes", () => {
    // Partição de 100: 15 na 1ª faixa + 25 na 2ª (16..40) + 60 na 3ª (41..100).
    // (15 x 3900) + (25 x 3200) + (60 x 2500)
    //  = 58500 + 80000 + 150000 = 288500
    expect(calcularMensalidadeCentavos(100)).toBe(288500);
  });
});

describe("calculateMonthlyFee — mesma conta em reais", () => {
  it("devolve 745 reais para 20 pacientes", () => {
    expect(calculateMonthlyFee(20)).toBe(745);
  });

  it("devolve 0 para clínica vazia", () => {
    expect(calculateMonthlyFee(0)).toBe(0);
  });

  it("devolve 2885 reais para 100 pacientes", () => {
    expect(calculateMonthlyFee(100)).toBe(2885);
  });
});

describe("curva de preço", () => {
  it("é estritamente crescente e com incremento marginal nunca crescente", () => {
    // Propriedades comerciais que sustentam a promessa "crescer nunca
    // reprecifica o que já existe, e o próximo paciente nunca fica mais caro".
    // São asseridas como propriedade, não recomputando a fórmula.
    let incrementoAnterior = Number.POSITIVE_INFINITY;

    for (let n = 0; n <= 60; n += 1) {
      const atual = calcularMensalidadeCentavos(n);
      const proximo = calcularMensalidadeCentavos(n + 1);

      expect(proximo).toBeGreaterThan(atual);

      const incremento = proximo - atual;
      expect(incremento).toBeLessThanOrEqual(incrementoAnterior);
      incrementoAnterior = incremento;
    }
  });

  it("cobra o preço da primeira faixa no salto de 0 para 1 paciente", () => {
    expect(calcularMensalidadeCentavos(1) - calcularMensalidadeCentavos(0)).toBe(
      VALOR_PRIMEIRO_PACIENTE_CENTAVOS,
    );
  });

  it("mantém todos os valores em centavos inteiros", () => {
    for (const n of [0, 1, 7, 15, 16, 20, 40, 41, 100, 1000]) {
      expect(Number.isInteger(calcularMensalidadeCentavos(n))).toBe(true);
    }
  });
});

describe("detalharMensalidade — memorial de cálculo", () => {
  it("soma exatamente o total, em todos os pontos de virada de faixa", () => {
    for (const n of [0, 1, 14, 15, 16, 20, 39, 40, 41, 100, 250]) {
      const somaDosSubtotais = detalharMensalidade(n).reduce(
        (acumulado, linha) => acumulado + linha.subtotalCentavos,
        0,
      );
      expect(somaDosSubtotais).toBe(calcularMensalidadeCentavos(n));
    }
  });

  it("quebra 20 pacientes em 15 a R$ 39,00 e 5 a R$ 32,00", () => {
    expect(detalharMensalidade(20)).toEqual([
      {
        deQuantidade: 1,
        ateQuantidade: 15,
        quantidade: 15,
        valorUnitarioCentavos: 3900,
        subtotalCentavos: 58500,
      },
      {
        deQuantidade: 16,
        ateQuantidade: 20,
        quantidade: 5,
        valorUnitarioCentavos: 3200,
        subtotalCentavos: 16000,
      },
    ]);
  });

  it("não emite linha para clínica sem paciente", () => {
    expect(detalharMensalidade(0)).toEqual([]);
  });

  it("cobre as três faixas quando passa de 40 pacientes", () => {
    const detalhes = detalharMensalidade(100);
    expect(detalhes).toHaveLength(3);
    expect(detalhes.map((linha) => linha.quantidade)).toEqual([15, 25, 60]);
    expect(detalhes.map((linha) => linha.valorUnitarioCentavos)).toEqual([
      3900, 3200, 2500,
    ]);
  });

  it("nunca lista quantidade zero ou negativa", () => {
    for (const n of [1, 15, 16, 40, 41, 100]) {
      for (const linha of detalharMensalidade(n)) {
        expect(linha.quantidade).toBeGreaterThan(0);
      }
    }
  });
});

describe("FAIXAS_PRECIFICACAO", () => {
  it("expõe as três faixas de preço do produto, em ordem crescente", () => {
    expect(FAIXAS_PRECIFICACAO).toEqual([
      { ateQuantidade: 15, valorCentavos: 3900 },
      { ateQuantidade: 40, valorCentavos: 3200 },
      { ateQuantidade: null, valorCentavos: 2500 },
    ]);
  });
});

describe("formatarBRL", () => {
  it("formata 74500 centavos com o separador decimal brasileiro", () => {
    expect(formatarBRL(74500)).toContain("745,00");
  });

  it("mantém o símbolo da moeda", () => {
    expect(formatarBRL(74500)).toContain("R$");
  });

  it("formata zero", () => {
    expect(formatarBRL(0)).toContain("0,00");
  });
});

describe("validação de entrada", () => {
  it.each([
    ["negativo", -1],
    ["fracionário", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("lança RangeError para valor %s", (_rotulo, valor) => {
    expect(() => calcularMensalidadeCentavos(valor)).toThrow(RangeError);
    expect(() => calculateMonthlyFee(valor)).toThrow(RangeError);
    expect(() => detalharMensalidade(valor)).toThrow(RangeError);
  });

  it("não devolve 0 silenciosamente para entrada inválida", () => {
    expect(() => calcularMensalidadeCentavos(-1)).toThrow(
      /não pode ser negativa/,
    );
  });
});
