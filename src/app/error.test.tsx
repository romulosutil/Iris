import * as React from "react";
import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorPage from "./error";

describe("Error Page Component (500)", () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("renders safely with system error copy in pt-BR", () => {
    const mockError = new Error("Something went wrong");
    const mockReset = vi.fn();

    render(<ErrorPage error={mockError} reset={mockReset} />);

    // Check title/header and description
    expect(screen.getByText("Erro de Sistema (500)")).toBeDefined();
    expect(screen.getByText("Algo deu errado do nosso lado.")).toBeDefined();
    expect(
      screen.getByText(/Ocorreu um erro interno inesperado/i),
    ).toBeDefined();

    // Check buttons are present
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Voltar para a agenda/i })).toBeDefined();
  });

  test("does not expose stack trace or raw SQL in the DOM", () => {
    const sqlError = new Error("SELECT * FROM users WHERE id = 'secret' LIMIT 1; - connection timed out");
    sqlError.stack = "Error: SELECT * ...\n    at someSecretFile.ts:12:34\n    at internalProcess.js:56:78";
    const mockReset = vi.fn();

    render(<ErrorPage error={sqlError} reset={mockReset} />);

    // The user-visible DOM should not contain the raw SQL string or the stack trace
    expect(screen.queryByText(/SELECT \* FROM/)).toBeNull();
    expect(screen.queryByText(/at someSecretFile/)).toBeNull();
  });

  test("logs the error safely to the console inside useEffect", () => {
    const mockError = new Error("Secure database error");
    mockError.stack = "My Stack Trace";
    const mockReset = vi.fn();

    render(<ErrorPage error={mockError} reset={mockReset} />);

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Erro de Sistema (500):",
      expect.objectContaining({
        message: "Secure database error",
        stack: "My Stack Trace",
      }),
    );
  });

  test("triggers reset function when retry button is clicked", () => {
    const mockError = new Error("Retriable failure");
    const mockReset = vi.fn();

    render(<ErrorPage error={mockError} reset={mockReset} />);

    const retryButton = screen.getByRole("button", { name: /Tentar novamente/i });
    fireEvent.click(retryButton);

    expect(mockReset).toHaveBeenCalledOnce();
  });

  test("renders the digest tracking code if present", () => {
    const digestError = new Error("Digest failure") as Error & { digest: string };
    digestError.digest = "ERR_DIGEST_XYZ_123";
    const mockReset = vi.fn();

    render(<ErrorPage error={digestError} reset={mockReset} />);

    expect(screen.getByText(/Código de rastreamento: ERR_DIGEST_XYZ_123/i)).toBeDefined();
  });
});
