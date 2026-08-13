import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// next/font/google explode fora do build do Next (TypeError no vitest).
vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "mock-space-grotesk" }),
  Plus_Jakarta_Sans: () => ({ variable: "mock-plus-jakarta-sans" }),
}));

// O canal de observabilidade é o GlitchTip, não o console: o teste garante
// que o erro CHEGA no captureException e que NADA vaza para o usuário.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import ErrorPage from "./error";
import GlobalErrorPage from "./global-error";

/** Erro que simula vazamento de banco: SQL na message + stack com caminho interno. */
function criarErroDeBanco(): Error {
  const erro = new Error("SELECT * FROM app_user WHERE id = 'lixo';");
  erro.stack =
    "Error: SELECT * FROM app_user WHERE id = 'lixo';\n    at Database.query (/app/src/db/client.ts:46:19)";
  return erro;
}

function comDigest(digest: string): Error & { digest?: string } {
  return Object.assign(new Error("Falha genérica"), { digest });
}

beforeEach(() => {
  // Silencia o validateDOMNesting do <html> dentro do container do RTL e
  // garante que nenhum código de página voltou a logar o erro no console
  // do navegador (canal de vazamento — ver docstring do error.tsx).
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(Sentry.captureException).mockClear();
});

describe("ErrorPage (error.tsx)", () => {
  test("não vaza SQL, stack trace ou detalhe de banco em nenhum canal visível", () => {
    const erro = criarErroDeBanco();
    render(<ErrorPage error={erro} reset={vi.fn()} />);

    const heading = screen.getByRole("heading", {
      name: /Algo deu errado do nosso lado/i,
    });
    expect(heading).not.toBeNull();

    // Página inteira (não só o container) — inclui portais.
    const html = document.body.innerHTML;
    expect(html).not.toContain("SELECT * FROM");
    expect(html).not.toContain("app_user");
    expect(html).not.toContain("at Database.query");
  });

  test("reporta o erro ao GlitchTip via captureException, sem console.error próprio", () => {
    const erro = criarErroDeBanco();
    render(<ErrorPage error={erro} reset={vi.fn()} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(erro);
    // Nenhum log da página no console do usuário (chamadas do React, se
    // houver, não contêm o SQL do erro).
    const chamadasComSql = vi
      .mocked(console.error)
      .mock.calls.filter((args) =>
        args.some((a) => String(a).includes("SELECT * FROM")),
      );
    expect(chamadasComSql).toEqual([]);
  });

  test("exibe o digest do Next como ID do erro quando presente", () => {
    render(<ErrorPage error={comDigest("DIGEST-12345-ABCD")} reset={vi.fn()} />);
    expect(screen.getByText(/DIGEST-12345-ABCD/i)).not.toBeNull();
    expect(screen.getByRole("alert")).not.toBeNull();
  });

  test("omite a caixa de ID quando não há digest (constante falsa não é ID)", () => {
    render(<ErrorPage error={new Error("Falha")} reset={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("chama reset ao clicar em Tentar novamente", () => {
    const resetSpy = vi.fn();
    render(<ErrorPage error={new Error("Falha")} reset={resetSpy} />);

    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  test("saída aponta para / com navegação completa (escapa da árvore quebrada)", () => {
    render(<ErrorPage error={new Error("Falha")} reset={vi.fn()} />);
    const link = screen.getByRole("link", { name: /Voltar ao início/i });
    expect(link.getAttribute("href")).toBe("/");
  });
});

describe("GlobalErrorPage (global-error.tsx)", () => {
  test("não vaza informação sensível e reporta ao GlitchTip", () => {
    const erro = criarErroDeBanco();
    render(<GlobalErrorPage error={erro} reset={vi.fn()} />);

    expect(screen.getByText(/Erro crítico de sistema/i)).not.toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(erro);

    const html = document.body.innerHTML;
    expect(html).not.toContain("SELECT * FROM");
    expect(html).not.toContain("app_user");
    expect(html).not.toContain("at Database.query");
  });

  test("replica o contrato do root layout: lang, data-mode e variáveis de fonte", () => {
    render(<GlobalErrorPage error={new Error("Falha global")} reset={vi.fn()} />);
    // React 19 iça <html> para o document real do jsdom — os atributos
    // aterrissam em document.documentElement, não dentro do container.
    const htmlEl = document.documentElement;
    expect(htmlEl.getAttribute("lang")).toBe("pt-BR");
    expect(htmlEl.getAttribute("data-mode")).toBe("clinico");
    expect(htmlEl.className).toContain("mock-space-grotesk");
    expect(htmlEl.className).toContain("mock-plus-jakarta-sans");
  });

  test("exibe digest quando presente e chama reset no botão", () => {
    const resetSpy = vi.fn();
    render(
      <GlobalErrorPage error={comDigest("DIGEST-GLOBAL-789")} reset={resetSpy} />,
    );

    expect(screen.getByText(/DIGEST-GLOBAL-789/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});
