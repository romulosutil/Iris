import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { ClinicalQuote } from "./clinical-quote";

describe("ClinicalQuote", () => {
  it("renderiza o rótulo padrão em Sentence case e o texto", () => {
    render(
      <ClinicalQuote texto="Paciente cooperativo durante toda a sessão." />,
    );
    expect(screen.getByText("Trecho do relato")).toBeDefined();
    expect(
      screen.getByText("Paciente cooperativo durante toda a sessão."),
    ).toBeDefined();
  });

  it("destaca o trecho de evidência em negrito (strong)", () => {
    const { container } = render(
      <ClinicalQuote
        texto="Episódio de autolesão leve observado no encerramento."
        evidencia="autolesão leve"
      />,
    );
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("autolesão leve");
  });

  it("renderiza rótulo customizado quando fornecido", () => {
    render(
      <ClinicalQuote
        rotulo="Nota da supervisora"
        texto="Rever protocolo de comunicação alternativa."
      />,
    );
    expect(screen.getByText("Nota da supervisora")).toBeDefined();
  });
});
