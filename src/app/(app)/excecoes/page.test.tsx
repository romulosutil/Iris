import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

describe("ExcecoesPage — redirect permanente (#512 · T14 · R-34)", () => {
  test("redireciona para /sessoes", async () => {
    const { default: ExcecoesPage } = await import("./page");
    expect(() => ExcecoesPage()).toThrow("NEXT_REDIRECT:/sessoes");
    expect(redirect).toHaveBeenCalledWith("/sessoes");
  });
});
