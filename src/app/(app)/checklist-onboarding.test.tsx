import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistOnboarding } from "./checklist-onboarding";
import type { ProgressoOnboarding } from "./onboarding-queries";

const CLINIC = "clinica-1";
const ZERADO: ProgressoOnboarding = {
  clinica: false,
  equipe: false,
  agenda: false,
  paciente: false,
  primeiroPacientePronto: false,
};
const TUDO: ProgressoOnboarding = {
  clinica: true,
  equipe: true,
  agenda: true,
  paciente: true,
  primeiroPacientePronto: true,
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("ChecklistOnboarding", () => {
  it("lista os cinco passos pendentes com link para a rota de cada um", () => {
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    expect(
      screen
        .getByRole("link", { name: /complete os dados da clínica/i })
        .getAttribute("href"),
    ).toBe("/clinica/dados");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  // D3: o checklist parava em `paciente EXISTS` — celebrava o cadastro e sumia
  // exatamente onde a jornada endurece.
  it("lista o quinto passo: deixar o primeiro paciente pronto", () => {
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    expect(
      screen
        .getByRole("link", { name: /pronto para atender/i })
        .getAttribute("href"),
    ).toBe("/pacientes");
  });

  it("marca o passo concluído e não oferece 'agora não' para ele", () => {
    render(
      <ChecklistOnboarding
        progresso={{ ...ZERADO, clinica: true }}
        clinicId={CLINIC}
      />,
    );
    const item = screen
      .getByText(/complete os dados da clínica/i)
      .closest("li")!;
    expect(item.getAttribute("data-concluido")).toBe("true");
    expect(screen.getAllByRole("button", { name: /agora não/i })).toHaveLength(
      4,
    );
  });

  it("some inteiro quando os cinco passos estão concluídos", () => {
    const { container } = render(
      <ChecklistOnboarding progresso={TUDO} clinicId={CLINIC} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("'agora não' remove o item e persiste no localStorage", async () => {
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: /agora não/i })[0]!,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(localStorage.getItem(`iris:onboarding-pulados:${CLINIC}`)).toContain(
      "clinica",
    );
  });

  it("some quando tudo que sobrou foi pulado", async () => {
    localStorage.setItem(
      `iris:onboarding-pulados:${CLINIC}`,
      JSON.stringify([
        "clinica",
        "equipe",
        "agenda",
        "paciente",
        "primeiroPacientePronto",
      ]),
    );
    const { container } = render(
      <ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("não pula item de outra clínica", () => {
    localStorage.setItem(
      "iris:onboarding-pulados:outra-clinica",
      JSON.stringify([
        "clinica",
        "equipe",
        "agenda",
        "paciente",
        "primeiroPacientePronto",
      ]),
    );
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("renderiza normalmente quando o localStorage lança", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("acesso a dados de site bloqueado");
    });
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });
});
