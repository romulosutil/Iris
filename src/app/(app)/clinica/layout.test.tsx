import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ClinicaLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/clinica/dados"),
  useRouter: vi.fn().mockReturnValue({ refresh: vi.fn() }),
  notFound: vi.fn().mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const mockGetTenantContext = vi.fn();
vi.mock("@/auth/tenant", () => ({
  getTenantContext: () => mockGetTenantContext(),
}));

describe("ClinicaLayout", () => {
  it("renderiza as abas de navegação da clínica para coordenador", async () => {
    mockGetTenantContext.mockResolvedValue({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "coordenador",
    });

    const LayoutComponent = await ClinicaLayout({
      children: <div data-testid="child-content">Conteúdo da tela</div>,
    });

    render(LayoutComponent);

    expect(
      screen.getByRole("navigation", {
        name: /seções de configuração da clínica/i,
      }),
    ).not.toBeNull();

    const linkDados = screen.getByRole("link", { name: /dados da clínica/i });
    expect(linkDados.getAttribute("href")).toBe("/clinica/dados");

    const linkFeriados = screen.getByRole("link", {
      name: /feriados & recessos/i,
    });
    expect(linkFeriados.getAttribute("href")).toBe("/clinica/feriados");

    const linkEmergencia = screen.getByRole("link", {
      name: /emergência & protocolo/i,
    });
    expect(linkEmergencia.getAttribute("href")).toBe("/clinica/emergencia");

    expect(screen.getByTestId("child-content")).not.toBeNull();
  });

  it("chama notFound se o usuário não for coordenador", async () => {
    mockGetTenantContext.mockResolvedValue({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "terapeuta",
    });

    await expect(
      ClinicaLayout({
        children: <div>Conteúdo</div>,
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
