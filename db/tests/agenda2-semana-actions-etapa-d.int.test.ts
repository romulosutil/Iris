import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const getTenantContext = vi.fn();
vi.mock("@/auth/tenant", () => ({ getTenantContext: () => getTenantContext() }));
import { encerrarRegraAction, estenderAction } from "@/app/(app)/agenda/semana/actions";

describe("actions Etapa D (defesa em profundidade)", () => {
  test("estenderAction: papel não-coordenador retorna erro", async () => {
    getTenantContext.mockResolvedValue({ clinicId: "c", userId: "u", role: "terapeuta" });
    const fd = new FormData();
    fd.set("regraId", "r1"); fd.set("hojeISO", "2026-07-18");
    const r = await estenderAction({}, fd);
    expect(r.error).toBeTruthy();
    expect(r.ok).toBeUndefined();
  });
  test("encerrarRegraAction: papel não-coordenador retorna erro", async () => {
    getTenantContext.mockResolvedValue({ clinicId: "c", userId: "u", role: "terapeuta" });
    const fd = new FormData();
    fd.set("regraId", "r1"); fd.set("ateFimISO", "2026-07-18");
    const r = await encerrarRegraAction({}, fd);
    expect(r.error).toBeTruthy();
  });
});
