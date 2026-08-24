import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FaixaRecusa } from "./faixa-recusa";
import type { AvisoRecusa } from "@/lib/billing/recusa-ui";

const AVISO: AvisoRecusa = {
  grupo: "G2",
  titulo: "Cobrança recusada",
  texto: "O débito automático não passou por falta de saldo na conta.",
  prazo:
    "Sua assinatura será cancelada em 6 dias (11/08/2026) se o pagamento não for concluído.",
  ctaHref: null,
  ctaLabel: null,
};

describe("FaixaRecusa", () => {
  it("não renderiza nada sem aviso", () => {
    const { container } = render(<FaixaRecusa aviso={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("mostra título, causa e prazo", () => {
    render(<FaixaRecusa aviso={AVISO} />);
    const texto = screen.getByRole("status").textContent ?? "";

    expect(texto).toContain("Cobrança recusada");
    expect(texto).toContain("falta de saldo");
    expect(texto).toContain("cancelada em 6 dias (11/08/2026)");
  });

  it("usa role=status, nunca role=alert", () => {
    // `alerta` (role="alert") é reservado ao risco clínico: cobrança não
    // interrompe leitor de tela. Discrimina a troca de variante.
    render(<FaixaRecusa aviso={AVISO} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("não pode ser dispensada", () => {
    // É o único aviso antes de um corte irreversível: dispensável, o débito
    // volta a ser invisível — que é o D36. O botão real do Banner tem
    // aria-label="Dispensar aviso" (src/components/ui/banner.tsx:158/194),
    // por isso o regex casa com "dispensar" — nome acessível real, não
    // imaginário.
    render(<FaixaRecusa aviso={AVISO} />);

    expect(
      screen.queryByRole("button", { name: /dispensar|fechar/i }),
    ).toBeNull();
  });

  it("renderiza o CTA quando o grupo tem um", () => {
    render(
      <FaixaRecusa
        aviso={{
          ...AVISO,
          grupo: "G4",
          ctaHref: "/clinica/dados",
          ctaLabel: "Corrigir dados da clínica",
        }}
      />,
    );

    const link = screen.getByRole("link", {
      name: /corrigir dados da clínica/i,
    });
    expect(link.getAttribute("href")).toBe("/clinica/dados");
  });

  it("omite o CTA quando a ação é fora do Iris", () => {
    render(<FaixaRecusa aviso={AVISO} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("omite o prazo quando não há carência correndo", () => {
    render(<FaixaRecusa aviso={{ ...AVISO, prazo: null }} />);
    const texto = screen.getByRole("status").textContent ?? "";
    expect(texto).not.toContain("cancelada em");
  });
});
