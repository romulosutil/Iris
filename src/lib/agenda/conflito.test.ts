import { describe, expect, test } from "vitest";
import { conflita, sobrepoe, type Slot } from "./conflito";

describe("sobrepoe (meia-aberto [ini,fim))", () => {
  test("intervalos que se cruzam sobrepõem", () => {
    expect(
      sobrepoe({ inicioMin: 60, fimMin: 120 }, { inicioMin: 90, fimMin: 150 }),
    ).toBe(true);
  });
  test("adjacentes NÃO sobrepõem (fim exclusivo)", () => {
    expect(
      sobrepoe({ inicioMin: 60, fimMin: 120 }, { inicioMin: 120, fimMin: 180 }),
    ).toBe(false);
  });
  test("disjuntos não sobrepõem", () => {
    expect(
      sobrepoe({ inicioMin: 60, fimMin: 120 }, { inicioMin: 200, fimMin: 260 }),
    ).toBe(false);
  });
});

describe("conflita", () => {
  const existentes: Slot[] = [
    { diaSemana: 1, inicioMin: 540, fimMin: 600 }, // seg 09:00–10:00
  ];
  test("mesmo dia com sobreposição conflita", () => {
    expect(
      conflita({ diaSemana: 1, inicioMin: 570, fimMin: 630 }, existentes),
    ).toBe(true);
  });
  test("mesmo dia adjacente NÃO conflita", () => {
    expect(
      conflita({ diaSemana: 1, inicioMin: 600, fimMin: 660 }, existentes),
    ).toBe(false);
  });
  test("dia diferente não conflita", () => {
    expect(
      conflita({ diaSemana: 2, inicioMin: 570, fimMin: 630 }, existentes),
    ).toBe(false);
  });
  test("lista vazia não conflita", () => {
    expect(conflita({ diaSemana: 1, inicioMin: 540, fimMin: 600 }, [])).toBe(
      false,
    );
  });
});
