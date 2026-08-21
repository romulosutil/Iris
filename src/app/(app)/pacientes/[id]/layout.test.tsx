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

function mockModalidade(clinicalModality: string) {
  mockWithTenant.mockImplementation(async (_ctx, fn) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ clinicalModality }]),
    };
    return fn(mockTx);
  });
}

describe("PacienteLayout - Abas do Prontuário", () => {
  it("exibe PEI & Metas e Anamnese para paciente na modalidade protocol_driven", async () => {
    mockModalidade("protocol_driven");

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_1" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.getByText("Anamnese")).not.toBeNull();
    const linkAnamnese = screen.getByRole("link", { name: "Anamnese" });
    expect(linkAnamnese.getAttribute("href")).toBe("/pacientes/pac_1/anamnese");
    expect(screen.getByText("PEI & Metas")).not.toBeNull();
    expect(screen.queryByText("TCC")).toBeNull();
    expect(screen.queryByText("Temas")).toBeNull();
  });

  it("exibe só TCC para paciente na modalidade cognitive_behavioral, SEM Anamnese", async () => {
    mockModalidade("cognitive_behavioral");

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_2" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.getByText("TCC")).not.toBeNull();
    expect(screen.queryByText("Anamnese")).toBeNull();
    expect(screen.queryByText("PEI & Metas")).toBeNull();
    expect(screen.queryByText("Temas")).toBeNull();
  });

  it("exibe só Temas para paciente na modalidade conventional, SEM a aba Evolução e SEM Anamnese", async () => {
    mockModalidade("conventional");

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_3" }),
    });

    render(LayoutComponent);

    // A aba "Evolução" some aqui de propósito: `page.tsx` redireciona
    // `conventional` para `Temas`, e uma aba que só redireciona mente sobre
    // ter conteúdo próprio. O acompanhamento desse modo é narrativo — o
    // hexágono de eixos VB-MAPP que a Evolução renderiza descreve outra
    // clínica, não a dele.
    expect(screen.queryByText("Evolução")).toBeNull();
    expect(screen.getByText("Temas")).not.toBeNull();
    expect(screen.queryByText("Anamnese")).toBeNull();
    expect(screen.queryByText("PEI & Metas")).toBeNull();
    expect(screen.queryByText("TCC")).toBeNull();
  });

  it("mantém a aba Evolução quando a modalidade não resolve (paciente fora da RLS), SEM Anamnese", async () => {
    // Sem esta garantia, um paciente sem linha visível ficaria com o
    // prontuário sem porta de entrada: nenhuma aba central E nenhuma Evolução.
    mockWithTenant.mockImplementation(async (_ctx, fn) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_4" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.queryByText("Anamnese")).toBeNull();
    expect(screen.queryByText("PEI & Metas")).toBeNull();
    expect(screen.queryByText("TCC")).toBeNull();
    expect(screen.queryByText("Temas")).toBeNull();
  });
});
