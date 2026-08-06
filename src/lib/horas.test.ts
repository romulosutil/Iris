import { describe, expect, test } from "vitest";
import {
  HORAS_MAX_SEMANA,
  HORAS_PASSO,
  PAPEIS_QUE_CONSOMEM_SALDO,
  ehCargaValida,
  ehMultiploDePasso,
  formatarHoras,
  papelConsomeSaldo,
  parseHoras,
} from "./horas";

describe("formatarHoras — hora é tempo, não decimal (#203, D-E)", () => {
  // A tabela do plano, literal. Se algum destes virar "2,0h" de novo, quebra.
  test.each([
    [0, "0h"],
    [0.5, "30min"],
    [1, "1h"],
    [1.5, "1h30"],
    [2, "2h"],
    [8.5, "8h30"],
    [20, "20h"],
    [40, "40h"],
  ])("%s → %s", (entrada, esperado) => {
    expect(formatarHoras(entrada)).toBe(esperado);
  });

  test("nunca emite vírgula, ponto decimal nem zero à direita", () => {
    for (let meia = 1; meia <= HORAS_MAX_SEMANA * 2; meia++) {
      const saida = formatarHoras(meia * HORAS_PASSO);
      // Sem separador decimal e na forma canônica: "30min", "8h" ou "8h30".
      // Nada de "8,0h", "8.5h" nem "8h00".
      expect(saida).not.toMatch(/[,.]/);
      expect(saida).toMatch(/^(\d+min|\d+h(30)?)$/);
    }
  });

  test("numeric do Postgres chega como string e formata igual", () => {
    // O driver `postgres` devolve numeric como string. Se o formatador tratasse
    // só number, a barra exibiria "—" contra o banco real e passaria no teste
    // contra literais — exatamente o teste verde que não testa nada.
    expect(formatarHoras("0.5")).toBe("30min");
    expect(formatarHoras("20.0")).toBe("20h");
    expect(formatarHoras("1.5")).toBe("1h30");
  });

  test("ausência de carga é travessão, nunca 0h", () => {
    // Vínculo legado sem horas não pode afirmar que a carga é zero.
    expect(formatarHoras(null)).toBe("—");
    expect(formatarHoras(undefined)).toBe("—");
    expect(formatarHoras("")).toBe("—");
    expect(formatarHoras("abc")).toBe("—");
    expect(formatarHoras(Number.NaN)).toBe("—");
    // ...mas zero de verdade continua sendo 0h.
    expect(formatarHoras(0)).toBe("0h");
  });

  test("negativo mantém o sinal (usado no delta de sobrealocação)", () => {
    expect(formatarHoras(-5)).toBe("-5h");
    expect(formatarHoras(-0.5)).toBe("-30min");
    expect(formatarHoras(-1.5)).toBe("-1h30");
  });
});

describe("parseHoras", () => {
  test("string numérica vira número, não concatenação", () => {
    expect(parseHoras("8")! + parseHoras("12")!).toBe(20);
  });

  test("ausente e não-numérico devolvem null, nunca NaN", () => {
    expect(parseHoras(null)).toBeNull();
    expect(parseHoras(undefined)).toBeNull();
    expect(parseHoras("")).toBeNull();
    expect(parseHoras("oito")).toBeNull();
  });
});

describe("ehMultiploDePasso — espelha o CHECK da 0076", () => {
  test.each([0.5, 1, 1.5, 2, 8.5, 20, 60])("%s é múltiplo de 30min", (h) => {
    expect(ehMultiploDePasso(h)).toBe(true);
  });

  test.each([0.3, 0.7, 1.1, 3.3333, 2.25])(
    "%s não é múltiplo de 30min",
    (h) => {
      expect(ehMultiploDePasso(h)).toBe(false);
    },
  );

  test("não escorrega no ponto flutuante", () => {
    // `0.1 + 0.2 !== 0.3`, e `4.2 % 0.5` devolve resto não-zero em float. A
    // implementação compara minutos inteiros justamente por isso — este caso
    // falha contra uma versão ingênua baseada em `%`.
    expect(ehMultiploDePasso(0.1 + 0.2 + 0.2)).toBe(true); // 0.5
    expect(ehMultiploDePasso(4.5 + 4.5)).toBe(true); // 9
  });
});

describe("ehCargaValida — positiva, sob o teto, no passo", () => {
  test.each([0.5, 20, HORAS_MAX_SEMANA])("%s é válida", (h) => {
    expect(ehCargaValida(h)).toBe(true);
  });

  test.each([0, -1, 0.3, HORAS_MAX_SEMANA + 0.5, 200])(
    "%s é rejeitada",
    (h) => {
      expect(ehCargaValida(h)).toBe(false);
    },
  );
});

describe("papelConsomeSaldo — D-B e D-C", () => {
  test("substituto consome: hora entregue é hora entregue", () => {
    expect(papelConsomeSaldo("substituto")).toBe(true);
  });

  test("terapeuta de referência consome", () => {
    expect(papelConsomeSaldo("terapeuta_referencia")).toBe(true);
  });

  test("coordenador de referência NÃO consome: é gestão", () => {
    expect(papelConsomeSaldo("coordenador_referencia")).toBe(false);
  });

  test("papel desconhecido não consome (falha fechada)", () => {
    expect(papelConsomeSaldo("")).toBe(false);
    expect(papelConsomeSaldo("supervisor")).toBe(false);
  });

  test("a lista cobre exatamente os papéis que consomem", () => {
    expect([...PAPEIS_QUE_CONSOMEM_SALDO].sort()).toEqual([
      "substituto",
      "terapeuta_referencia",
    ]);
  });
});
