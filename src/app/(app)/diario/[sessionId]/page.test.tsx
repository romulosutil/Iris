import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

describe("DiarioPage — redirect permanente (#512 · T14 · R-34)", () => {
  test("redireciona para /sessoes/[id] preservando o sessionId", async () => {
    const { default: DiarioPage } = await import("./page");
    await expect(
      DiarioPage({ params: Promise.resolve({ sessionId: "sess_abc123" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/sessoes/sess_abc123");
    expect(redirect).toHaveBeenCalledWith("/sessoes/sess_abc123");
  });
});
