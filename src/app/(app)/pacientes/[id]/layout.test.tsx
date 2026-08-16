import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PacienteLayout from "./layout";

// Mock das dependências de tenant e billing
vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/pacientes/pac_1"),
  useRouter: vi.fn().mockReturnValue({ refresh: vi.fn() }),
}));

vi.mock("@/auth/tenant", () => ({
  getTenantContext: vi.fn().mockResolvedValue({
    tenantId: "tenant_1",
    clinicId: "clinic_1",
    userId: "user_1",
    role: "terapeuta",
  }),
}));

vi.mock("../../queries", () => ({
  obterSituacaoConta: vi.fn().mockResolvedValue({
    podeEscrever: true,
    estado: "ativa",
  }),
}));

const mockWithTenant = vi.fn();
vi.mock("@/db/rls", () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}));

vi.mock("@/db/schema", () => ({
  patient: {
    id: "id",
    clinicalModality: "clinicalModality",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

describe("PacienteLayout - Abas do Prontuário", () => {
  it("exibe a aba PEI & Metas para paciente na modalidade protocol_driven", async () => {
    mockWithTenant.mockImplementation(async (_ctx, fn) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ clinicalModality: "protocol_driven" }]),
      };
      return fn(mockTx);
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_1" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.getByText("PEI & Metas")).not.toBeNull();
  });

  it("oculta a aba PEI & Metas para paciente na modalidade conventional", async () => {
    mockWithTenant.mockImplementation(async (_ctx, fn) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ clinicalModality: "conventional" }]),
      };
      return fn(mockTx);
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_2" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.queryByText("PEI & Metas")).toBeNull();
  });
});
