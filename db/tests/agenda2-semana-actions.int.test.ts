// db/tests/agenda2-semana-actions.int.test.ts
import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const getTenantContext = vi.fn();
vi.mock("@/auth/tenant", () => ({
  getTenantContext: () => getTenantContext(),
}));
import { criarRegraAction } from "@/app/(app)/agenda/semana/actions";

describe("criarRegraAction (defesa em profundidade)", () => {
  test("papel não-coordenador retorna erro, não grava", async () => {
    getTenantContext.mockResolvedValue({
      clinicId: "c",
      userId: "u",
      role: "terapeuta",
    });
    const fd = new FormData();
    fd.set("patientId", "p");
    fd.set("terapeutaId", "t");
    fd.set("disciplina", "aba");
    fd.set("diaSemana", "1");
    fd.set("horaInicio", "09:00");
    fd.set("duracaoMin", "60");
    fd.set("semanaVisivelISO", "2026-07-13");
    fd.set("hojeISO", "2026-07-13");
    const r = await criarRegraAction({}, fd);
    expect(r.error).toBeTruthy();
    expect(r.ok).toBeUndefined();
  });
});
