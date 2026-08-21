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

    const alertaLink = screen.getByRole("link", { name: /Alertas de Risco/i });
    expect(alertaLink.getAttribute("aria-current")).toBe("page");
    // Garante que a aba ativa não usa fundo amarelo sólido de alerta
    expect(alertaLink.className).not.toMatch(/bg-\[var\(--action-primary\)\]/);
    // Garante superfície neutra elevada e acento ouro discreto no indicador inferior
    expect(alertaLink.className).toContain("bg-[var(--surface-elevated)]");
    expect(alertaLink.className).toContain(
      "border-b-[var(--action-primary,#F2B705)]",
    );
    expect(alertaLink.className).toContain("border-b-[3px]");
  });

  it("renderiza badges numéricos quando contadores são fornecidos", () => {
    render(
      <GovernancaNav
        contadores={{
          validacao: 0,
          excecoes: 2,
          supervisao: 1,
          pendencias: 0,
          alertasRisco: 3,
        }}
      />,
    );

    expect(screen.getAllByText("0").length).toBe(2);
    expect(screen.getByText("2")).not.toBeNull();
    expect(screen.getByText("3")).not.toBeNull();

    const excecoesLink = screen.getByRole("link", {
      name: /Exceções Clínicas.*2/i,
    });
    expect(excecoesLink).not.toBeNull();
  });

  it("oculta badges zerados quando ocultarZerados é true", () => {
    render(
      <GovernancaNav
        contadores={{
          validacao: 0,
          excecoes: 2,
          supervisao: 1,
          pendencias: 0,
          alertasRisco: 3,
        }}
        ocultarZerados
      />,
    );

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
    expect(screen.getByText("3")).not.toBeNull();
  });
});

describe("GovernancaNav — semiótica de cor das pílulas", () => {
  const contadores = {
    validacao: 12,
    excecoes: 4,
    supervisao: 7,
    pendencias: 3,
    alertasRisco: 2,
  };

  function badgeDe(rotulo: string) {
    const link = screen.getByRole("link", { name: new RegExp(rotulo, "i") });
    const badge = link.querySelector("[data-tom]");
    if (badge === null) throw new Error(`sem badge em ${rotulo}`);
    return badge;
  }

  it("reserva o terracota exclusivamente para Alertas de Risco", () => {
    render(<GovernancaNav contadores={contadores} />);

    expect(badgeDe("Alertas de Risco").getAttribute("data-tom")).toBe("risco");
    expect(badgeDe("Alertas de Risco").className).toContain(
      "bg-[var(--status-error-bg)]",
    );

    for (const outra of [
      "Fila de Validação",
      "Exceções Clínicas",
      "Supervisão & Estagnação",
      "Pendências Gerais",
    ]) {
      expect(badgeDe(outra).getAttribute("data-tom")).not.toBe("risco");
      expect(badgeDe(outra).className).not.toContain("--status-error");
    }
  });

  it("usa violeta de IA nas filas processadas pela IA e cinza nas operacionais", () => {
    render(<GovernancaNav contadores={contadores} />);

    expect(badgeDe("Fila de Validação").getAttribute("data-tom")).toBe("ia");
    expect(badgeDe("Exceções Clínicas").getAttribute("data-tom")).toBe("ia");
    expect(badgeDe("Fila de Validação").className).toContain(
      "bg-[var(--ai-tint)]",
    );

    expect(badgeDe("Supervisão & Estagnação").getAttribute("data-tom")).toBe(
      "neutro",
    );
    expect(badgeDe("Pendências Gerais").getAttribute("data-tom")).toBe(
      "neutro",
    );
    expect(badgeDe("Pendências Gerais").className).toContain(
      "bg-[var(--surface-muted)]",
    );
  });

  it("não pinta nenhuma pílula de terracota quando não há risco aberto", () => {
    const { container } = render(
      <GovernancaNav contadores={{ ...contadores, alertasRisco: 0 }} />,
    );

    expect(container.querySelectorAll('[data-tom="risco"]').length).toBe(0);
    expect(badgeDe("Alertas de Risco").getAttribute("data-tom")).toBe("zerado");
  });

  it("recua contador zerado em opacidade em vez de alarmar", () => {
    render(<GovernancaNav contadores={{ ...contadores, pendencias: 0 }} />);

    const zerado = badgeDe("Pendências Gerais");
    expect(zerado.getAttribute("data-tom")).toBe("zerado");
    expect(zerado.className).toContain("opacity-60");
    expect(zerado.className).not.toContain("font-bold");
  });
});
