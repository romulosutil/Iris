import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import {
  InstrumentoLista,
  derivarFaixaDeCorte,
  type InstrumentoAplicacaoLinha,
} from "./instrumento-lista";

/**
 * #393/T6 — cobre o pedido explícito da task: função de derivação de faixa
 * testada isolada (boundaries) + componente com fixtures reais (PHQ-9 e
 * GAD-7, faixas distintas) + estado vazio.
 */
describe("derivarFaixaDeCorte", () => {
  describe("PHQ-9 (0-27)", () => {
    it.each([
      [0, "mínimo"],
      [4, "mínimo"],
      [5, "leve"],
      [9, "leve"],
      [10, "moderado"],
      [14, "moderado"],
      [15, "moderadamente grave"],
      [19, "moderadamente grave"],
      [20, "grave"],
      [27, "grave"],
    ])("escore %i -> %s", (escore, esperado) => {
      expect(derivarFaixaDeCorte("phq9", escore)).toBe(esperado);
    });
  });

  describe("GAD-7 (0-21)", () => {
    it.each([
      [0, "mínimo"],
      [4, "mínimo"],
      [5, "leve"],
      [9, "leve"],
      [10, "moderado"],
      [14, "moderado"],
      [15, "grave"],
      [21, "grave"],
    ])("escore %i -> %s", (escore, esperado) => {
      expect(derivarFaixaDeCorte("gad7", escore)).toBe(esperado);
    });
  });

  it("escoreTotal null retorna null, sem estourar", () => {
    expect(derivarFaixaDeCorte("phq9", null)).toBeNull();
    expect(derivarFaixaDeCorte("gad7", null)).toBeNull();
  });
});

describe("InstrumentoLista", () => {
  const fixtures: InstrumentoAplicacaoLinha[] = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      tipoInstrumento: "phq9",
      escoreTotal: 3,
      criadoEm: new Date("2026-08-01T12:00:00Z"),
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      tipoInstrumento: "phq9",
      escoreTotal: 17,
      criadoEm: new Date("2026-08-10T12:00:00Z"),
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      tipoInstrumento: "gad7",
      escoreTotal: 12,
      criadoEm: new Date("2026-08-15T12:00:00Z"),
    },
  ];

  it("renderiza cada linha com data, tipo, escore e faixa corretos", () => {
    render(<InstrumentoLista aplicacoes={fixtures} />);

    // `getByText` já é a asserção: lança se o texto não existir na árvore.
    screen.getByText("01/08/2026");
    screen.getByText("10/08/2026");
    screen.getByText("15/08/2026");

    expect(screen.getAllByText("PHQ-9")).toHaveLength(2);
    screen.getByText("GAD-7");

    screen.getByText("3");
    screen.getByText("17");
    screen.getByText("12");

    // PHQ-9 3 -> mínimo; PHQ-9 17 -> moderadamente grave; GAD-7 12 -> moderado
    screen.getByText("mínimo");
    screen.getByText("moderadamente grave");
    screen.getByText("moderado");
  });

  it("zero aplicações renderiza estado vazio, não erro/crash", () => {
    render(<InstrumentoLista aplicacoes={[]} />);

    screen.getByText("Nenhuma aplicação de instrumento registrada");
    expect(screen.queryByRole("table")).toBeNull();
  });
});
