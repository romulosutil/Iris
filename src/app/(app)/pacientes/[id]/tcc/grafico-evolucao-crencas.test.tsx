import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GraficoEvolucaoCrencas,
  type RpdGraficoEntry,
} from "./grafico-evolucao-crencas";

/**
 * #389 — o gráfico só plota `reestruturacao_completa` (`./completude.ts`).
 * Um registro "registro_capturado" (só situação/pensamento/emoção/intensidade)
 * nunca deve virar ponto nem entrar nas médias — prova por EXCLUSÃO: um caso
 * completo + um parcial na mesma lista, e só o completo aparece.
 */

function entryBase(overrides: Partial<RpdGraficoEntry>): RpdGraficoEntry {
  return {
    id: "id-base",
    criadoEm: new Date("2026-01-01T10:00:00Z"),
    situacao: "Situação de teste",
    pensamentoAutomatico: "Pensamento automático de teste",
    emocao: "Ansiedade",
    intensidade: 80,
    distorcoesCognitivas: null,
    respostaRacional: null,
    evidenciasFavor: null,
    evidenciasContra: null,
    intensidadePos: null,
    ...overrides,
  };
}

describe("GraficoEvolucaoCrencas — filtro de completude (#389)", () => {
  it("exclui registro_capturado e plota só reestruturacao_completa", () => {
    const parcial = entryBase({ id: "parcial", intensidade: 90 });
    const completo = entryBase({
      id: "completo",
      intensidade: 60,
      evidenciasFavor: "Evidência real levantada",
      respostaRacional: "Pensamento alternativo mais equilibrado",
      intensidadePos: 20,
    });

    render(<GraficoEvolucaoCrencas entries={[parcial, completo]} />);

    // Só 1 ponto interativo (grupo com role="button") — o parcial não entra.
    const pontos = screen.getAllByRole("button");
    expect(pontos).toHaveLength(1);
    expect(pontos[0]?.getAttribute("aria-label")).toContain("60% → 20%");

    // Média Inicial reflete só o completo (60%) — se o parcial (90%) tivesse
    // entrado, a média seria 75%, não 60%.
    expect(screen.getByText("Média Inicial: 60%")).toBeTruthy();
  });

  it("registro reestruturacao_completa isolado aparece normalmente", () => {
    const completo = entryBase({
      id: "completo-isolado",
      intensidade: 70,
      evidenciasContra: "Evidência contra levantada",
      respostaRacional: "Alternativa",
      intensidadePos: 40,
    });

    render(<GraficoEvolucaoCrencas entries={[completo]} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.queryByText(/nenhum registro de pensamentos cadastrado/i),
    ).toBeNull();
  });

  it("mantém o empty-state quando a lista filtrada fica vazia (só registro_capturado)", () => {
    const parcial = entryBase({ id: "parcial-unico" });

    render(<GraficoEvolucaoCrencas entries={[parcial]} />);

    expect(
      screen.getByText(/nenhum registro de pensamentos cadastrado/i),
    ).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("mantém o empty-state original com array bruto vazio", () => {
    render(<GraficoEvolucaoCrencas entries={[]} />);

    expect(
      screen.getByText(/nenhum registro de pensamentos cadastrado/i),
    ).toBeTruthy();
  });

  it("exibe rótulos legíveis de distorções cognitivas no tooltip ao interagir com o ponto", () => {
    const comDistorcoes = entryBase({
      id: "com-distorcoes",
      intensidade: 75,
      evidenciasFavor: "Evidência favorável",
      respostaRacional: "Reestruturação alternativa",
      intensidadePos: 30,
      distorcoesCognitivas: ["leitura_mental", "catastrofizacao"],
    });

    render(<GraficoEvolucaoCrencas entries={[comDistorcoes]} />);

    const ponto = screen.getByRole("button");
    fireEvent.focus(ponto);

    // Rótulos formatados em vez de slugs crus snake_case
    expect(screen.getByText("Leitura Mental, Catastrofização")).toBeTruthy();
    expect(screen.queryByText("leitura_mental, catastrofizacao")).toBeNull();
  });
});
