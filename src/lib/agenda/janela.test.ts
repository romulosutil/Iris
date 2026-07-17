import { describe, expect, test } from "vitest";
import { fundirFaixasPorDia, horasDisponiveisSemana, horaParaMin, minParaHora } from "./janela";

describe("janela.ts — helpers de hora", () => {
  test("horaParaMin tolera HH:MM e HH:MM:SS", () => {
    expect(horaParaMin("08:00")).toBe(480);
    expect(horaParaMin("08:00:00")).toBe(480);
    expect(horaParaMin("13:30")).toBe(810);
  });
  test("minParaHora formata com zero à esquerda", () => {
    expect(minParaHora(480)).toBe("08:00");
    expect(minParaHora(810)).toBe("13:30");
  });
});

describe("janela.ts — fundirFaixasPorDia (I-B1)", () => {
  test("funde faixas sobrepostas no mesmo dia", () => {
    const r = fundirFaixasPorDia([
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 1, horaInicio: "10:00", horaFim: "14:00" },
    ]);
    expect(r).toEqual([{ diaSemana: 1, horaInicio: "08:00", horaFim: "14:00" }]);
  });
  test("funde faixas encostadas (fim == início)", () => {
    const r = fundirFaixasPorDia([
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 1, horaInicio: "12:00", horaFim: "17:00" },
    ]);
    expect(r).toEqual([{ diaSemana: 1, horaInicio: "08:00", horaFim: "17:00" }]);
  });
  test("mantém faixas separadas com intervalo (almoço)", () => {
    const r = fundirFaixasPorDia([
      { diaSemana: 2, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 2, horaInicio: "13:00", horaFim: "17:00" },
    ]);
    expect(r).toHaveLength(2);
  });
  test("não mistura dias diferentes", () => {
    const r = fundirFaixasPorDia([
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 2, horaInicio: "08:00", horaFim: "12:00" },
    ]);
    expect(r).toHaveLength(2);
  });
  test("descarta faixa invertida/vazia", () => {
    const r = fundirFaixasPorDia([{ diaSemana: 1, horaInicio: "12:00", horaFim: "12:00" }]);
    expect(r).toEqual([]);
  });
});

describe("janela.ts — horasDisponiveisSemana", () => {
  test("soma sobre faixas já fundidas (não conta sobreposição dobrada)", () => {
    // 08-12 + 10-14 no mesmo dia = 08-14 = 6h, não 8h
    expect(horasDisponiveisSemana([
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 1, horaInicio: "10:00", horaFim: "14:00" },
    ])).toBe(6);
  });
  test("arredonda a 1 casa", () => {
    expect(horasDisponiveisSemana([{ diaSemana: 1, horaInicio: "08:00", horaFim: "08:30" }])).toBe(0.5);
  });
});
