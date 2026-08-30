import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CancelarAssinatura } from "./cancelar-assinatura";
import type { SituacaoConta } from "@/lib/billing/estado-conta";

const ATIVA: SituacaoConta = {
  estado: "ativa",
  podeEscrever: true,
  podeCadastrarPaciente: true,
  diasRestantesTrial: null,
  statusAssinatura: "active",
  debitoCentavos: 0,
};

const TRIAL: SituacaoConta = {
  ...ATIVA,
  estado: "trial_ativo",
  statusAssinatura: "free_tier",
  diasRestantesTrial: 3,
};

const CANCELADA: SituacaoConta = {
  ...ATIVA,
  estado: "cancelada",
  statusAssinatura: "canceled",
  podeEscrever: false,
  podeCadastrarPaciente: false,
};

describe("CancelarAssinatura", () => {
  it("não renderiza nada para quem não tem assinatura viva", () => {
    const { container } = render(<CancelarAssinatura situacaoConta={TRIAL} />);
    expect(container.innerHTML).toBe("");
  });

  it("não renderiza nada para assinatura já cancelada", () => {
    const { container } = render(
      <CancelarAssinatura situacaoConta={CANCELADA} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("exige confirmação: o clique no botão não cancela sozinho", async () => {
    const acao = vi.fn();
    render(<CancelarAssinatura situacaoConta={ATIVA} acao={acao} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^cancelar assinatura$/i }),
    );
    expect(acao).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("a confirmação diz corte imediato, débito do ciclo e que pagar não reativa", async () => {
    render(<CancelarAssinatura situacaoConta={ATIVA} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^cancelar assinatura$/i }),
    );
    const dialogo = screen.getByRole("dialog");
    expect(dialogo.textContent).toMatch(/imediat/i);
    expect(dialogo.textContent).toMatch(/débito/i);
    expect(dialogo.textContent).toMatch(/não reativa/i);
  });

  it("dispara a ação só depois de confirmar", async () => {
    const acao = vi.fn().mockResolvedValue({ sucesso: true });
    render(<CancelarAssinatura situacaoConta={ATIVA} acao={acao} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^cancelar assinatura$/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /sim, cancelar/i }),
    );
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro devolvido pela ação", async () => {
    const acao = vi.fn().mockResolvedValue({
      erro: "Só a coordenação pode cancelar a assinatura.",
    });
    render(<CancelarAssinatura situacaoConta={ATIVA} acao={acao} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^cancelar assinatura$/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /sim, cancelar/i }),
    );
    expect(
      await screen.findByText(/só a coordenação pode cancelar/i),
    ).toBeDefined();
  });
});
