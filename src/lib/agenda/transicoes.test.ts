import { describe, it, expect } from "vitest";
import { transicaoPermitida, exigeJustificada } from "./transicoes";

describe("transicaoPermitida", () => {
  it("agendada → realizada/falta_*/cancelada é permitido", () => {
    for (const p of ["realizada","falta_paciente","falta_terapeuta","cancelada"] as const)
      expect(transicaoPermitida("agendada", p)).toBe(true);
  });
  it("agendada → agendada não é transição", () => {
    expect(transicaoPermitida("agendada", "agendada")).toBe(false);
  });
  it("estado terminal nunca transiciona", () => {
    expect(transicaoPermitida("realizada", "cancelada")).toBe(false);
    expect(transicaoPermitida("cancelada", "agendada")).toBe(false);
  });
});
describe("exigeJustificada", () => {
  it("só falta_* é justificável", () => {
    expect(exigeJustificada("falta_paciente")).toBe(true);
    expect(exigeJustificada("falta_terapeuta")).toBe(true);
    expect(exigeJustificada("realizada")).toBe(false);
    expect(exigeJustificada("cancelada")).toBe(false);
  });
});
