import { afterEach, describe, expect, it } from "vitest";
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusBadge, StatusDot, type BadgesVariantes } from "./status-badge";

afterEach(cleanup);

describe("StatusBadge (DS-04, #538)", () => {
  it("a API de variantes é minúscula e única — a duplicata capitalizada não compila", () => {
    // @ts-expect-error — "Success" não existe mais; só "success".
    const capitalizada: BadgesVariantes = "Success";
    expect(capitalizada).toBe("Success");
    const validas: BadgesVariantes[] = [
      "success",
      "warning",
      "error",
      "ai",
      "info",
      "brand",
      "neutral",
    ];
    expect(validas).toHaveLength(7);
  });

  it("sugerida: contorno tracejado sobre o tint de IA (estilo que o docblock descreve)", () => {
    const { container } = render(<StatusBadge estado="sugerida" />);
    const selo = container.querySelector('[data-estado="sugerida"]')!;
    expect(selo.className).toContain("border-dashed");
    expect(selo.className).toContain("--status-ia-bg");
    expect(screen.getByText("Sugerida")).not.toBeNull();
  });

  it("variante sem estado usa o próprio nome como rótulo e contorno sólido", () => {
    const { container } = render(<StatusBadge variante="success" />);
    const selo = container.querySelector("span")!;
    expect(selo.className).toContain("border-solid");
    expect(screen.getByText("success")).not.toBeNull();
  });

  it("StatusDot resolve a cor pela variante do estado", () => {
    const { container } = render(<StatusDot estado="aprovada" />);
    const ponto = container.querySelector("[aria-hidden]")!;
    expect(ponto.className).toContain("--status-success-border");
    expect(screen.getByText("Aprovada")).not.toBeNull();
  });
});
