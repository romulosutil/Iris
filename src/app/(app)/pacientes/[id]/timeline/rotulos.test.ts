import { describe, it, expect } from "vitest";
import {
  ROTULO_MARCO_ZERO,
  rotuloPonto,
  rotuloPontoCurto,
  rotuloDesde,
  rotuloAte,
} from "./rotulos";

describe("rotulos.ts", () => {
  describe("ROTULO_MARCO_ZERO", () => {
    it("deve ser 'Anamnese'", () => {
      expect(ROTULO_MARCO_ZERO).toBe("Anamnese");
    });
  });

  describe("rotuloPonto", () => {
    const testCases = [
      { n: 0, expected: "Anamnese" },
      { n: 1, expected: "Sessão 1" },
      { n: 3, expected: "Sessão 3" },
      { n: 10, expected: "Sessão 10" },
      { n: 100, expected: "Sessão 100" },
    ];

    testCases.forEach(({ n, expected }) => {
      it(`rotuloPonto(${n}) deve retornar '${expected}'`, () => {
        expect(rotuloPonto(n)).toBe(expected);
      });
    });
  });

  describe("rotuloPontoCurto", () => {
    const testCases = [
      { n: 0, expected: "Anamnese" },
      { n: 1, expected: "S1" },
      { n: 3, expected: "S3" },
      { n: 10, expected: "S10" },
      { n: 100, expected: "S100" },
    ];

    testCases.forEach(({ n, expected }) => {
      it(`rotuloPontoCurto(${n}) deve retornar '${expected}'`, () => {
        expect(rotuloPontoCurto(n)).toBe(expected);
      });
    });
  });

  describe("rotuloDesde", () => {
    const testCases = [
      { n: 0, expected: "desde a Anamnese" },
      { n: 1, expected: "desde a Sessão 1" },
      { n: 3, expected: "desde a Sessão 3" },
      { n: 10, expected: "desde a Sessão 10" },
      { n: 100, expected: "desde a Sessão 100" },
    ];

    testCases.forEach(({ n, expected }) => {
      it(`rotuloDesde(${n}) deve retornar '${expected}'`, () => {
        expect(rotuloDesde(n)).toBe(expected);
      });
    });
  });

  describe("rotuloAte", () => {
    const testCases = [
      { n: 0, expected: "até a Anamnese" },
      { n: 1, expected: "até a Sessão 1" },
      { n: 3, expected: "até a Sessão 3" },
      { n: 10, expected: "até a Sessão 10" },
      { n: 100, expected: "até a Sessão 100" },
    ];

    testCases.forEach(({ n, expected }) => {
      it(`rotuloAte(${n}) deve retornar '${expected}'`, () => {
        expect(rotuloAte(n)).toBe(expected);
      });
    });
  });

  describe("regressão: sem 'Sessão' em n=0", () => {
    it("rotuloPonto(0) não contém 'Sessão'", () => {
      expect(rotuloPonto(0)).not.toContain("Sessão");
    });

    it("rotuloPontoCurto(0) não contém 'Sessão'", () => {
      expect(rotuloPontoCurto(0)).not.toContain("Sessão");
    });

    it("rotuloDesde(0) não contém 'Sessão'", () => {
      expect(rotuloDesde(0)).not.toContain("Sessão");
    });

    it("rotuloAte(0) não contém 'Sessão'", () => {
      expect(rotuloAte(0)).not.toContain("Sessão");
    });
  });

  describe("regressão: texto idêntico ao de hoje para n>0", () => {
    it("rotuloPonto(n>0) reutiliza o padrão de timeline-client.tsx", () => {
      // Padrão observado em timeline-client.tsx:505,734,853
      expect(rotuloPonto(1)).toBe("Sessão 1");
      expect(rotuloPonto(3)).toBe("Sessão 3");
    });

    it("rotuloDesde(n>0) usa 'desde a Sessão'", () => {
      // Padrão esperado para continuidade
      expect(rotuloDesde(1)).toBe("desde a Sessão 1");
    });

    it("rotuloAte(n>0) usa 'até a Sessão'", () => {
      // Padrão esperado para continuidade
      expect(rotuloAte(1)).toBe("até a Sessão 1");
    });
  });
});
