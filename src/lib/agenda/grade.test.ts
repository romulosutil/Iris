// src/lib/agenda/grade.test.ts
import { describe, expect, test } from "vitest";
import {
  celulasParaFaixas,
  chaveCelula,
  colunasDaGrade,
  copiarDia,
  faixasParaCelulas,
} from "./grade";

describe("grade.ts — colunasDaGrade", () => {
  test("gera colunas do passo, fim exclusivo", () => {
    expect(colunasDaGrade(30, "08:00", "10:00")).toEqual([
      "08:00",
      "08:30",
      "09:00",
      "09:30",
    ]);
  });
  test("respeita passo de 60", () => {
    expect(colunasDaGrade(60, "08:00", "11:00")).toEqual([
      "08:00",
      "09:00",
      "10:00",
    ]);
  });
});

describe("grade.ts — faixasParaCelulas / celulasParaFaixas (round-trip)", () => {
  test("faixa vira células e volta à mesma faixa", () => {
    const faixas = [{ diaSemana: 1, horaInicio: "08:00", horaFim: "09:30" }];
    const cel = faixasParaCelulas(faixas, 30, "08:00", "18:00");
    expect(cel.has(chaveCelula(1, "08:00"))).toBe(true);
    expect(cel.has(chaveCelula(1, "09:00"))).toBe(true);
    expect(cel.has(chaveCelula(1, "09:30"))).toBe(false); // fim exclusivo
    expect(celulasParaFaixas(cel, 30)).toEqual(faixas);
  });
  test("células contíguas fundem numa faixa (I-B3 snap)", () => {
    const cel = new Set([
      chaveCelula(2, "08:00"),
      chaveCelula(2, "08:30"),
      chaveCelula(2, "09:00"),
    ]);
    expect(celulasParaFaixas(cel, 30)).toEqual([
      { diaSemana: 2, horaInicio: "08:00", horaFim: "09:30" },
    ]);
  });
});

describe("grade.ts — copiarDia", () => {
  test("replica células de um dia sobre os destinos, sobrescrevendo", () => {
    const cols = colunasDaGrade(60, "08:00", "10:00"); // ["08:00","09:00"]
    const cel = new Set([chaveCelula(1, "08:00")]);
    const r = copiarDia(cel, 1, [2, 3], cols);
    expect(r.has(chaveCelula(2, "08:00"))).toBe(true);
    expect(r.has(chaveCelula(3, "08:00"))).toBe(true);
    expect(r.has(chaveCelula(2, "09:00"))).toBe(false);
  });
});
