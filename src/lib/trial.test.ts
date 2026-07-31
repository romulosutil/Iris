import { describe, expect, it } from "vitest";
import { diasRestantesDeTrial } from "./trial";

const TZ = "America/Sao_Paulo";

describe("diasRestantesDeTrial", () => {
  it("no dia do cadastro restam 7 dias", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-01T20:00:00-03:00"))).toBe(7);
  });

  it("na véspera do vencimento resta 1 dia", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-07T23:00:00-03:00"))).toBe(1);
  });

  it("no dia do vencimento resta 0 (último dia a exibir)", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-08T01:00:00-03:00"))).toBe(0);
  });

  it("depois do vencimento fica negativo (não exibe banner)", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    // 1 dia depois: -1
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-09T01:00:00-03:00"))).toBe(-1);
    // Muitos dias depois: número negativo maior
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-09-30T01:00:00-03:00"))).toBeLessThan(0);
  });

  it("usa a fronteira de dia do timezone da clínica, não do servidor", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    // 02:00 UTC de 08/08 ainda é 23:00 de 07/08 em São Paulo → ainda resta 1 dia.
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-08T02:00:00Z"))).toBe(1);
  });
});
