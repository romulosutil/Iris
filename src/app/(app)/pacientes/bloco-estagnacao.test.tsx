import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BlocoEstagnacao } from "./bloco-estagnacao";

afterEach(cleanup);

describe("BlocoEstagnacao", () => {
  it("não renderiza nada com zero pacientes estagnados (estado do stub hoje)", () => {
    const { container } = render(<BlocoEstagnacao pacientesEstagnados={[]} />);

    expect(container.innerHTML).toBe("");
  });

  it("renderiza o ponto de montagem quando há pacientes estagnados (predicado ainda não existe — dado mockado)", () => {
    render(
      <BlocoEstagnacao
        pacientesEstagnados={[
          { id: "p1", nome: "Ana" },
          { id: "p2", nome: "Bruno" },
        ]}
      />,
    );

    expect(
      screen.getByText("2 pacientes com sinal de estagnação"),
    ).toBeTruthy();
    const link = screen.getByRole("link", {
      name: "Ver em Supervisão & Estagnação",
    });
    expect(link.getAttribute("href")).toBe("/supervisao");
  });

  it("usa singular com exatamente 1 paciente estagnado", () => {
    render(
      <BlocoEstagnacao pacientesEstagnados={[{ id: "p1", nome: "Ana" }]} />,
    );

    expect(screen.getByText("1 paciente com sinal de estagnação")).toBeTruthy();
  });
});
