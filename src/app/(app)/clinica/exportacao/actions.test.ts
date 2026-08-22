import { describe, expect, it, vi, beforeEach } from "vitest";
import { solicitarExportacaoAction } from "./actions";
import * as tenant from "@/auth/tenant";
import * as motor from "@/lib/export/acervo/motor";

vi.mock("@/auth/tenant", () => ({
  getTenantContext: vi.fn(),
}));

vi.mock("@/lib/export/acervo/motor", () => ({
  solicitarExportacao: vi.fn(),
}));

describe("solicitarExportacaoAction (Task T7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna sucesso quando a solicitação é aceita pelo motor", async () => {
    vi.mocked(tenant.getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic-1",
      userId: "user-1",
      role: "coordenador",
      mfaEnrolled: true,
    });

    vi.mocked(motor.solicitarExportacao).mockResolvedValueOnce({
      bundleId: "bundle-123",
      status: "pendente",
    });

    const res = await solicitarExportacaoAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bundleId).toBe("bundle-123");
      expect(res.status).toBe("pendente");
    }
  });

  it("retorna erro amigável quando o motor recusa (ex: 403 / em andamento)", async () => {
    vi.mocked(tenant.getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic-1",
      userId: "user-1",
      role: "coordenador",
      mfaEnrolled: true,
    });

    vi.mocked(motor.solicitarExportacao).mockRejectedValueOnce(
      new Error("Já existe uma exportação em andamento para esta clínica."),
    );

    const res = await solicitarExportacaoAction();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe(
        "Já existe uma exportação em andamento para esta clínica.",
      );
    }
  });
});
