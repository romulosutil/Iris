import { describe, expect, test } from "vitest";
import {
  diasDaSemana,
  segundaDaSemana,
  semanaEhPassada,
  vigenciaInicioC7,
} from "./semana";

describe("segundaDaSemana", () => {
  test("quarta-feira volta para a segunda da mesma semana", () => {
    expect(segundaDaSemana("2026-07-15")).toBe("2026-07-13"); // qua → seg
  });
  test("domingo volta para a segunda anterior (semana ISO)", () => {
    expect(segundaDaSemana("2026-07-19")).toBe("2026-07-13"); // dom → seg
  });
  test("segunda é idempotente", () => {
    expect(segundaDaSemana("2026-07-13")).toBe("2026-07-13");
  });
});

describe("diasDaSemana", () => {
  test("gera 7 dias começando na segunda", () => {
    expect(diasDaSemana("2026-07-13")).toEqual([
      "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16",
      "2026-07-17", "2026-07-18", "2026-07-19",
    ]);
  });
});

describe("vigenciaInicioC7", () => {
  test("semana futura usa a própria segunda", () => {
    expect(vigenciaInicioC7("2026-07-22", "2026-07-13")).toBe("2026-07-20");
  });
  test("semana atual usa a segunda atual", () => {
    expect(vigenciaInicioC7("2026-07-15", "2026-07-15")).toBe("2026-07-13");
  });
});

describe("semanaEhPassada", () => {
  test("semana anterior à atual é passada", () => {
    expect(semanaEhPassada("2026-07-06", "2026-07-15")).toBe(true);
  });
  test("semana atual não é passada", () => {
    expect(semanaEhPassada("2026-07-15", "2026-07-15")).toBe(false);
  });
});
