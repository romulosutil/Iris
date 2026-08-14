import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SituacaoConta } from "@/lib/billing/estado-conta";

/**
 * O aviso de conta bloqueada precisa aparecer ANTES do formulário (#163): a
 * defesa real continua no submit (`logic.ts`), mas descobrir que a conta está
 * em somente-leitura depois de dez campos preenchidos é o beco que esta tela
 * criava.
 *
 * O que estes testes travam:
 *
 * 1. Sem poder cadastrar → aviso destacado, com a mensagem do estado.
 * 2. O link "Ativar a assinatura" segue o MESMO critério do formulário. Em
 *    `pagamento_em_processamento` já existe cobrança em voo: um segundo
 *    caminho de checkout gera cobrança dobrada no mesmo mês.
 * 3. Conta saudável não vê aviso nenhum.
 *
 * O formulário é dublado: ele é client component com server action e arrasta
 * banco/sessão para dentro do jsdom sem acrescentar nada ao que se mede aqui.
 */

const obterSituacaoConta = vi.fn();

vi.mock("@/auth/tenant", () => ({
  getTenantContext: async () => ({ role: "coordenador" }),
}));
vi.mock("@/auth/require-role", () => ({
  requireRole: () => {},
}));
vi.mock("../../queries", () => ({
  obterSituacaoConta: (...args: unknown[]) => obterSituacaoConta(...args),
}));
vi.mock("./novo-paciente-form", () => ({
  NovoPacienteForm: () => <form data-testid="form-paciente" />,
}));

const { default: NovoPacientePage } = await import("./page");

function situacao(parcial: Partial<SituacaoConta>): SituacaoConta {
  return {
    estado: "ativa",
    podeEscrever: true,
    podeCadastrarPaciente: true,
    diasRestantesTrial: null,
    statusAssinatura: "active",
    debitoCentavos: 0,
    ...parcial,
  };
}

async function renderizarPagina() {
  render(await NovoPacientePage());
}

describe("NovoPacientePage — aviso de conta bloqueada antes do formulário", () => {
  beforeEach(() => {
    obterSituacaoConta.mockReset();
  });

  it("trial expirado: avisa antes do formulário e oferece a ativação", async () => {
    obterSituacaoConta.mockResolvedValue(
      situacao({
        estado: "trial_expirado",
        podeEscrever: false,
        podeCadastrarPaciente: false,
        diasRestantesTrial: -1,
        statusAssinatura: "trialing",
      }),
    );

    await renderizarPagina();

    const aviso = screen.getByText(/período de teste terminou/i);
    expect(aviso).toBeDefined();

    const link = screen.getByRole("link", { name: /ativar a assinatura/i });
    expect(link.getAttribute("href")).toBe("/assinatura");

    // Antes do formulário, não depois: a ordem no DOM é o que faz o aviso ser
    // lido primeiro (por leitor de tela e por olho).
    const form = screen.getByTestId("form-paciente");
    expect(
      aviso.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // O formulário continua renderizado: a barreira é o submit, não a tela.
    expect(form).toBeDefined();
  });

  it("pagamento em processamento: avisa SEM link (segunda cobrança no mesmo mês)", async () => {
    obterSituacaoConta.mockResolvedValue(
      situacao({
        estado: "pagamento_em_processamento",
        podeEscrever: false,
        podeCadastrarPaciente: false,
        statusAssinatura: "setup_pending",
      }),
    );

    await renderizarPagina();

    expect(screen.getByText(/aguardando a confirmação/i)).toBeDefined();
    expect(
      screen.queryByRole("link", { name: /ativar a assinatura/i }),
    ).toBeNull();
  });

  it("conta ativa: nenhum aviso de bloqueio", async () => {
    obterSituacaoConta.mockResolvedValue(situacao({}));

    await renderizarPagina();

    expect(screen.queryByText(/somente-leitura/i)).toBeNull();
    expect(
      screen.queryByRole("link", { name: /ativar a assinatura/i }),
    ).toBeNull();
    expect(screen.getByTestId("form-paciente")).toBeDefined();
  });
});
