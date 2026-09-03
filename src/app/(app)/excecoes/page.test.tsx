import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

// #533 — substitui `excecoes/a11y.test.tsx`, que varria `ExcecoesList` com o
// axe: a página é um `redirect()` desde a #512 (T14) e o componente não é
// montado por ninguém. Afirmar o redirect é o que a rota faz de verdade.
describe("ExcecoesPage — redirect permanente (#512 · T14 · R-34)", () => {
  test("redireciona para /sessoes (fila única de sessões travadas)", async () => {
    const { default: ExcecoesPage } = await import("./page");
    expect(() => ExcecoesPage()).toThrow("NEXT_REDIRECT:/sessoes");
    expect(redirect).toHaveBeenCalledWith("/sessoes");
  });
});
