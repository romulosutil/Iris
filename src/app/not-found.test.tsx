import * as React from "react";
import { expect, test, describe } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound Page Component (404)", () => {
  test("renders safely with not-found copy in pt-BR", () => {
    render(<NotFound />);

    // Check header, title, and clear copy
    expect(screen.getByText("Erro 404")).toBeDefined();
    expect(screen.getByText("Página não encontrada.")).toBeDefined();
    expect(
      screen.getByText(/O endereço mudou ou nunca existiu/i),
    ).toBeDefined();

    // Check link/button to return to /agenda is present
    const link = screen.getByRole("link", { name: /Voltar para a agenda/i });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/agenda");
  });
});
