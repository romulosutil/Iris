import { describe, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

describe("Agenda/semana Page — redirect permanente (#512 · T14 · R-34)", () => {
  test("sem query string: redireciona para /agenda?escala=semana", async () => {
    const { default: Page } = await import("./page");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT:/agenda?escala=semana",
    );
  });

  test("repassa os parâmetros de prefill de 'Repor' (repor/patientId/terapeutaId/disciplina)", async () => {
    const { default: Page } = await import("./page");
    await expect(
      Page({
        searchParams: Promise.resolve({
          repor: "sess_1",
          patientId: "pac_1",
          terapeutaId: "user_1",
          disciplina: "fono",
        }),
      }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/agenda\?/);
    const chamada = redirect.mock.calls.at(-1)?.[0] as string;
    const params = new URLSearchParams(chamada.split("?")[1]);
    expect(params.get("escala")).toBe("semana");
    expect(params.get("repor")).toBe("sess_1");
    expect(params.get("patientId")).toBe("pac_1");
    expect(params.get("terapeutaId")).toBe("user_1");
    expect(params.get("disciplina")).toBe("fono");
  });

  test("um `escala` recebido na query antiga é substituído por 'semana'", async () => {
    const { default: Page } = await import("./page");
    await expect(
      Page({ searchParams: Promise.resolve({ escala: "dia" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/agenda?escala=semana");
  });
});
