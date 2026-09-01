import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

describe("ValidacaoPage — redirect permanente (#512 · T14 · R-34, R-35)", () => {
  test("redireciona para /sessoes com o sinal de primeira visita (?de=validacao)", async () => {
    const { default: ValidacaoPage } = await import("./page");
    expect(() => ValidacaoPage()).toThrow(
      "NEXT_REDIRECT:/sessoes?de=validacao",
    );
    expect(redirect).toHaveBeenCalledWith("/sessoes?de=validacao");
  });
});
