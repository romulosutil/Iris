import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

describe("RevisaoPage — redirect permanente (#512 · T14 · R-34)", () => {
  test("redireciona para /sessoes/[id] preservando o sessionId", async () => {
    const { default: RevisaoPage } = await import("./page");
    await expect(
      RevisaoPage({ params: Promise.resolve({ sessionId: "sess_xyz789" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/sessoes/sess_xyz789");
    expect(redirect).toHaveBeenCalledWith("/sessoes/sess_xyz789");
  });
});
