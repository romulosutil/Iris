import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/db/rls";

/**
 * PF-02 (#538): o semáforo do PDF estourou o teto de espera → a Server Action
 * devolve `{ error, codigo: "RENDER_OCUPADO", retryAfterSegundos }` com a copy
 * do dicionário, em vez de estourar. O `withTenant` é dublê que simula o
 * render ocupado dentro da transação (é onde `exportReport` chama o renderer).
 */
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("@/lib/report/playwright-renderer", () => ({
  playwrightRenderer: { render: vi.fn() },
}));
vi.mock("@/db/rls", () => ({
  withTenant: async () => {
    const { RenderOcupadoError } = await import("@/lib/report/render-lock");
    throw new RenderOcupadoError(20_000);
  },
}));

const { exportarConvenioBruto } = await import("./export-logic");

const ctx: TenantContext = {
  clinicId: "00000000-0000-0000-0000-0000000000c1",
  userId: "00000000-0000-0000-0000-00000000c0a1",
  role: "coordenador",
} as TenantContext;

describe("exportarConvenioBruto × render ocupado (PF-02)", () => {
  it("devolve o contrato de erro da action com a copy amigável e o Retry-After", async () => {
    const r = await exportarConvenioBruto(ctx, {
      patientId: "00000000-0000-0000-0000-00000000ac01",
      nomePaciente: "Paciente Teste",
      periodoInicio: "2026-01-01",
      periodoFim: "2026-01-31",
    });
    expect(r).toEqual({
      error: expect.stringContaining("tente de novo"),
      codigo: "RENDER_OCUPADO",
      retryAfterSegundos: 20,
    });
  });
});
