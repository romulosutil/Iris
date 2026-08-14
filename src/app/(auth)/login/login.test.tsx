import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import LoginPage from "./page";

// Mocks obrigatórios para evitar erros de ambiente/Next
vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "mock-space-grotesk" }),
  Plus_Jakarta_Sans: () => ({ variable: "mock-plus-jakarta-sans" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
}));

vi.mock("@/auth/client", () => ({
  signIn: {
    email: vi.fn(),
  },
}));

describe("LoginPage — Badges de Trust e Segurança", () => {
  it("renderiza a tela de login com os badges de segurança e micro-copy", () => {
    render(<LoginPage />);

    // Verifica se os badges estão presentes na tela
    const badgeLgpd = screen.getByTestId("badge-lgpd");
    expect(badgeLgpd).toBeDefined();
    expect(badgeLgpd.textContent).toContain("Conformidade LGPD");

    const badgeTls = screen.getByTestId("badge-tls");
    expect(badgeTls).toBeDefined();
    expect(badgeTls.textContent).toContain("Conexão Criptografada TLS 1.3");

    // Verifica a micro-copy
    const microCopy = screen.getByText(
      /Dados clínicos protegidos por criptografia e isolamento multi-tenant/i
    );
    expect(microCopy).toBeDefined();
  });

  it("não possui violações de acessibilidade (a11y) estrutural", async () => {
    const { container } = render(<LoginPage />);
    const resultado = await axe.run(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      rules: {
        region: { enabled: false },
        "landmark-one-main": { enabled: false },
        "color-contrast": { enabled: false },
      },
    });
    expect(resultado.violations).toEqual([]);
  });
});
