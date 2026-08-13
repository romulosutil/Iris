import * as React from "react";
import { expect, test, describe, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/font/google to prevent TypeError during Vitest execution
vi.mock("next/font/google", () => {
  return {
    Space_Grotesk: () => ({
      variable: "mock-space-grotesk",
    }),
    Plus_Jakarta_Sans: () => ({
      variable: "mock-plus-jakarta-sans",
    }),
  };
});

// Import via alias to avoid shadowing the native global Error constructor!
import ErrorPage from "./error";
import GlobalErrorPage from "./global-error";

describe("Error Page (error.tsx)", () => {
  test("renders safely without leaking sensitive database information or stack traces", () => {
    // Create an error that looks like a database leak
    const dbError = new Error("SELECT * FROM app_user WHERE id = 'lixo';");
    dbError.stack = "Error: SELECT * FROM app_user WHERE id = 'lixo';\n    at Database.query (/app/src/db/client.ts:46:19)";
    const resetSpy = vi.fn();

    const { container } = render(<ErrorPage error={dbError} reset={resetSpy} />);

    // Must show friendly text
    const heading = screen.getByRole("heading", { name: /Algo deu errado do nosso lado/i });
    expect(heading).not.toBeNull();

    // Must NOT leak database details, SQL queries or stack traces in the HTML
    const htmlContent = container.innerHTML;
    expect(htmlContent).not.toContain("SELECT * FROM");
    expect(htmlContent).not.toContain("app_user");
    expect(htmlContent).not.toContain("at Database.query");
  });

  test("renders Audit Error ID from digest property if present", () => {
    const errorWithDigest = new Error("Generic failure");
    (errorWithDigest as any).digest = "DIGEST-12345-ABCD";
    const resetSpy = vi.fn();

    render(<ErrorPage error={errorWithDigest} reset={resetSpy} />);

    const idContainer = screen.getByText(/DIGEST-12345-ABCD/i);
    expect(idContainer).not.toBeNull();
  });

  test("renders fallback Audit Error ID if digest is missing", () => {
    const errorWithoutDigest = new Error("Generic failure");
    const resetSpy = vi.fn();

    render(<ErrorPage error={errorWithoutDigest} reset={resetSpy} />);

    const idContainer = screen.getByText(/SEC-500-ERR/i);
    expect(idContainer).not.toBeNull();
  });

  test("calls reset handler when clicking retry button", () => {
    const someError = new Error("Some error");
    const resetSpy = vi.fn();

    render(<ErrorPage error={someError} reset={resetSpy} />);

    const retryBtn = screen.getByRole("button", { name: /Tentar Novamente/i });
    expect(retryBtn).not.toBeNull();

    fireEvent.click(retryBtn);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Global Error Page (global-error.tsx)", () => {
  test("renders safely without leaking sensitive information", () => {
    const dbError = new Error("SELECT * FROM app_user WHERE id = 'lixo';");
    dbError.stack = "Error: SELECT * FROM app_user WHERE id = 'lixo';\n    at Database.query (/app/src/db/client.ts:46:19)";
    const resetSpy = vi.fn();

    const { container } = render(<GlobalErrorPage error={dbError} reset={resetSpy} />);

    const title = screen.getByText(/Erro Crítico de Sistema/i);
    expect(title).not.toBeNull();

    const htmlContent = container.innerHTML;
    expect(htmlContent).not.toContain("SELECT * FROM");
    expect(htmlContent).not.toContain("app_user");
    expect(htmlContent).not.toContain("at Database.query");
  });

  test("renders Audit Error ID and triggers reset button", () => {
    const errorWithDigest = new Error("Global failure");
    (errorWithDigest as any).digest = "DIGEST-GLOBAL-789";
    const resetSpy = vi.fn();

    render(<GlobalErrorPage error={errorWithDigest} reset={resetSpy} />);

    const idContainer = screen.getByText(/DIGEST-GLOBAL-789/i);
    expect(idContainer).not.toBeNull();

    const retryBtn = screen.getByRole("button", { name: /Tentar Novamente/i });
    expect(retryBtn).not.toBeNull();

    fireEvent.click(retryBtn);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});
