import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LayoutPublico from "./layout";

vi.mock("@/components/clarity", () => ({
  Clarity: () => <div data-testid="mock-clarity" />,
}));
vi.mock("@/components/google-analytics", () => ({
  GoogleAnalytics: () => <div data-testid="mock-google-analytics" />,
}));
vi.mock("@/components/webmcp-provider", () => ({
  WebMCPProvider: () => <div data-testid="mock-webmcp" />,
}));

/**
 * S-01 / S-08 (auditoria 360, #530): os SDKs de terceiro (Clarity, GA) e o
 * WebMCPProvider montam SÓ aqui, no layout do grupo público. Nenhuma rota de
 * `(app)`, `(admin)` ou `(auth)` os carrega.
 */
describe("Layout do grupo público (src/app/(publico)/layout.tsx)", () => {
  it("monta GA, Clarity e WebMCP em volta dos filhos", () => {
    render(
      <LayoutPublico>
        <main data-testid="pagina-publica">Landing</main>
      </LayoutPublico>,
    );
    expect(screen.getByTestId("pagina-publica")).not.toBeNull();
    expect(screen.getByTestId("mock-google-analytics")).not.toBeNull();
    expect(screen.getByTestId("mock-clarity")).not.toBeNull();
    expect(screen.getByTestId("mock-webmcp")).not.toBeNull();
  });

  it("é o ÚNICO layout de src/app que importa os SDKs de terceiro", () => {
    // Allowlist estrutural: varre todo `layout.tsx` sob `src/app` e exige que
    // só este importe clarity/google-analytics/webmcp. Quem recolocar um
    // `<Clarity/>` no root ou em `(app)/layout.tsx` cai aqui, não em produção.
    const raiz = path.resolve(process.cwd(), "src/app");
    const layouts = listarLayouts(raiz);
    expect(layouts.length).toBeGreaterThan(1);

    const importaSdk = (arquivo: string) =>
      /components\/(clarity|google-analytics|webmcp-provider)/.test(
        readFileSync(arquivo, "utf8"),
      );
    const comSdk = layouts
      .filter(importaSdk)
      .map((a) => path.relative(raiz, a).replace(/\\/g, "/"));
    expect(comSdk).toEqual(["(publico)/layout.tsx"]);
  });

  it("nenhum page.tsx/template.tsx de (app) ou (admin) importa Clarity/GA/WebMCP", () => {
    // A varredura de layouts não pega uma página que importe o SDK direto.
    // Revisão da PR #545: cobrir também `page.tsx` e `template.tsx` dos
    // grupos autenticados, arquivo a arquivo.
    const raiz = path.resolve(process.cwd(), "src/app");
    const arquivos = [
      ...listarArquivos(path.join(raiz, "(app)"), ["page.tsx", "template.tsx"]),
      ...listarArquivos(path.join(raiz, "(admin)"), [
        "page.tsx",
        "template.tsx",
      ]),
    ];
    expect(arquivos.length).toBeGreaterThan(10);

    const comSdk = arquivos
      .filter((a) =>
        /components\/(clarity|google-analytics|webmcp-provider)/.test(
          readFileSync(a, "utf8"),
        ),
      )
      .map((a) => path.relative(raiz, a).replace(/\\/g, "/"));
    expect(comSdk).toEqual([]);
  });
});

function listarArquivos(dir: string, nomes: readonly string[]): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...listarArquivos(caminho, nomes));
    else if (nomes.includes(entrada.name)) saida.push(caminho);
  }
  return saida;
}

function listarLayouts(dir: string): string[] {
  return listarArquivos(dir, ["layout.tsx"]);
}
