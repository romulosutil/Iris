import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GovernancaNav } from "./governanca-nav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/alertas-risco"),
}));

describe("GovernancaNav", () => {
  it("renderiza todas as abas de governança incluindo Alertas de Risco", () => {
    render(<GovernancaNav />);

    expect(screen.getByText("Fila de Validação")).not.toBeNull();
    expect(screen.getByText("Exceções Clínicas")).not.toBeNull();
    expect(screen.getByText("Supervisão & Estagnação")).not.toBeNull();
    expect(screen.getByText("Pendências Gerais")).not.toBeNull();
    expect(screen.getByText("Alertas de Risco")).not.toBeNull();

    const alertaLink = screen.getByRole("link", { name: "Alertas de Risco" });
    expect(alertaLink.getAttribute("aria-current")).toBe("page");
  });
});
