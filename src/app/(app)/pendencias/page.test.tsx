import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

// #533 — substitui `pendencias/a11y.test.tsx`, que varria `PendenciasList`
// com o axe: a página é um `redirect()` desde a #512 (T14) e o componente
// não é montado por ninguém. Afirmar o redirect é o que a rota faz de verdade.
describe("PendenciasPage — redirect permanente (#512 · T14 · R-34)", () => {
  test("redireciona para /sessoes (fila única de sessões travadas)", async () => {
    const { default: PendenciasPage } = await import("./page");
    expect(() => PendenciasPage()).toThrow("NEXT_REDIRECT:/sessoes");
    expect(redirect).toHaveBeenCalledWith("/sessoes");
  });
});
