import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RootLayout, { metadata } from "./layout";

vi.mock("@/components/clarity", () => ({
  Clarity: () => <div data-testid="mock-clarity" />,
}));

vi.mock("@/components/google-analytics", () => ({
  GoogleAnalytics: () => <div data-testid="mock-google-analytics" />,
}));

vi.mock("@/components/webmcp-provider", () => ({
  WebMCPProvider: () => <div data-testid="mock-webmcp" />,
}));

vi.mock("@/app/fonts", () => ({
  fontVariables: "font-space-grotesk font-jakarta",
}));

describe("RootLayout (src/app/layout.tsx)", () => {
  it("exporta metadados institucionais completos", () => {
    expect(metadata.title).toContain("Iris");
    expect(metadata.description).toBeDefined();
    expect(metadata.openGraph?.siteName).toBe("Iris Governança Clínica");
    expect(metadata.openGraph?.locale).toBe("pt_BR");
  });

  it("renderiza provedores globais e filhos corretamente", () => {
    const { container } = render(
      <RootLayout>
        <main data-testid="test-child">Conteúdo da Aplicação</main>
      </RootLayout>,
    );

    expect(screen.getByTestId("test-child")).not.toBeNull();
    expect(screen.getByTestId("mock-clarity")).not.toBeNull();
    expect(screen.getByTestId("mock-google-analytics")).not.toBeNull();
    expect(screen.getByTestId("mock-webmcp")).not.toBeNull();

    // React 19 iça os atributos de <html> para o document.documentElement do
    // jsdom, então `container.querySelector("html")` devolve `null` sempre. Ler
    // do container deixaria as duas asserções abaixo em ramo morto: mutar
    // lang/data-mode em layout.tsx passaria verde.
    expect(container.querySelector("html")).toBeNull();

    const htmlElement = document.documentElement;
    expect(htmlElement.getAttribute("lang")).toBe("pt-BR");
    expect(htmlElement.getAttribute("data-mode")).toBe("clinico");
  });

  it("não renderiza nenhum script de preview (localhost:8400 ou live.js) no DOM (D53)", () => {
    const { container } = render(
      <RootLayout>
        <div>Conteúdo</div>
      </RootLayout>,
    );

    // Varre container E document: React 19 iça tags de recurso (script async,
    // link, style) para o <head>, então olhar só o container perderia uma
    // injeção içada.
    const scripts = [
      ...container.querySelectorAll("script"),
      ...document.querySelectorAll("script"),
    ];
    for (const script of scripts) {
      const src = script.getAttribute("src") || "";
      expect(
        src,
        `Tag script de preview encontrada em layout.tsx: ${src}`,
      ).not.toMatch(/localhost:8400|127\.0\.0\.1:8400|live\.js/);
    }
  });
});
