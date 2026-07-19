import { describe, expect, test } from "vitest";
import { paraDataLocal, paraMinutosLocais } from "./fuso-min";

describe("paraMinutosLocais (C10)", () => {
  test("timestamptz UTC vira minutos-locais SP (-03:00)", () => {
    // 2026-07-13T12:00:00Z = seg 09:00 em São Paulo
    const r = paraMinutosLocais(new Date("2026-07-13T12:00:00Z"), "America/Sao_Paulo");
    expect(r).toEqual({ diaSemana: 1, inicioMin: 540 });
  });
  test("vira o dia correto quando o UTC cruza meia-noite local", () => {
    // 2026-07-14T02:00:00Z = seg 23:00 em SP (ainda diaSemana 1)
    const r = paraMinutosLocais(new Date("2026-07-14T02:00:00Z"), "America/Sao_Paulo");
    expect(r).toEqual({ diaSemana: 1, inicioMin: 23 * 60 });
  });
});

describe("paraDataLocal", () => {
  test("instante UTC vira data local SP", () => {
    // 2026-07-14T02:00:00Z = 2026-07-13 23:00 em SP → data local 2026-07-13
    expect(paraDataLocal(new Date("2026-07-14T02:00:00Z"), "America/Sao_Paulo")).toBe(
      "2026-07-13",
    );
  });
});
