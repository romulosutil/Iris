import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/alertas-risco"),
}));

describe("AppHeader", () => {
  it("marca Central de Validação como ativa ao navegar em /alertas-risco", () => {
    render(
      <AppHeader
        clinicas={[{ clinicId: "c1", nome: "Clínica Teste" }]}
        ativaId="c1"
        role="coordenador"
        itemsNav={[
          { href: "/validacao", label: "Central de Validação" },
          { href: "/agenda", label: "Agenda" },
          { href: "/relatorios", label: "Relatórios" },
        ]}
        signOutSlot={null}
      />,
    );

    const [validacaoLink] = screen.getAllByRole("link", {
      name: "Central de Validação",
    });
    expect(validacaoLink).toBeDefined();
    expect(validacaoLink?.getAttribute("aria-current")).toBe("page");

    const [relatoriosLink] = screen.getAllByRole("link", {
      name: "Relatórios",
    });
    expect(relatoriosLink).toBeDefined();
    expect(relatoriosLink?.getAttribute("aria-current")).toBeNull();
  });
});
