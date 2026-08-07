import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * O `actions.ts` é `"use server"` e puxa `getTenantContext` (banco, cookies).
 * O que este arquivo testa é o CONTRATO entre o diálogo e a action: o que sai
 * no `FormData`, o que acontece com cada resposta. Rodar a action de verdade
 * aqui trocaria esse contrato por um teste de infraestrutura — a gravação em
 * `audit_log` é coberta por `arquivamento.int.test.ts`, contra Postgres.
 */
const { arquivar, desarquivar } = vi.hoisted(() => ({
  arquivar: vi.fn(),
  desarquivar: vi.fn(),
}));
vi.mock("./actions", () => ({
  arquivarPacienteAction: arquivar,
  desarquivarPacienteAction: desarquivar,
}));

const { ArquivamentoDialog } = await import("./arquivamento-dialog");

/**
 * O que estes casos discriminam (#174):
 *
 * 1. **O motivo chega na action.** Era o bug de escopo: as actions já existiam
 *    e recebiam `_formData` sem ler nada. Um diálogo que só coleta o texto na
 *    tela e não o envia repetiria o mesmo furo com mais cliques.
 * 2. **Erro não fecha o diálogo.** Fechar no erro jogaria fora o texto
 *    digitado e esconderia o porquê da recusa.
 * 3. **Sucesso fecha.** Sem isso o coordenador fica olhando um formulário já
 *    submetido, sem saber se gravou.
 * 4. **O sentido da operação segue o estado do paciente.** Chamar `arquivar`
 *    num paciente já arquivado é no-op idempotente no servidor: a tela diria
 *    "pronto" e nada teria mudado.
 * 5. **Dá para sair pelo teclado.** `Dialog` prende o foco.
 */

beforeEach(() => {
  arquivar.mockReset().mockResolvedValue({ ok: true });
  desarquivar.mockReset().mockResolvedValue({ ok: true });
});

async function abrir(rotulo: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: rotulo }));
  await screen.findByRole("dialog");
  return user;
}

describe("ArquivamentoDialog", () => {
  it("envia o motivo digitado e o paciente ligado ao botão", async () => {
    render(<ArquivamentoDialog patientId="pac-1" arquivado={false} />);
    const user = await abrir("Arquivar paciente");

    await user.type(
      screen.getByLabelText(/Motivo do arquivamento/),
      "Família encerrou o acompanhamento em dezembro.",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar arquivamento" }),
    );

    expect(arquivar).toHaveBeenCalledTimes(1);
    const [patientId, , formData] = arquivar.mock.calls[0] as [
      string,
      unknown,
      FormData,
    ];
    expect(patientId).toBe("pac-1");
    expect(formData.get("motivo")).toBe(
      "Família encerrou o acompanhamento em dezembro.",
    );
    expect(desarquivar).not.toHaveBeenCalled();
  });

  it("erro do servidor mantém o diálogo aberto, com a mensagem ligada ao campo", async () => {
    arquivar.mockResolvedValue({
      error: "Descreva o motivo com pelo menos 10 caracteres.",
    });
    render(<ArquivamentoDialog patientId="pac-1" arquivado={false} />);
    const user = await abrir("Arquivar paciente");

    await user.type(screen.getByLabelText(/Motivo do arquivamento/), "curto");
    await user.click(
      screen.getByRole("button", { name: "Confirmar arquivamento" }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    const erro = await screen.findByText(
      "Descreva o motivo com pelo menos 10 caracteres.",
    );
    // Ligado por `aria-describedby`: mensagem que existe no DOM mas o leitor de
    // tela nunca anuncia ao focar o campo não é mensagem de erro acessível.
    const campo = screen.getByLabelText(/Motivo do arquivamento/);
    expect(campo.getAttribute("aria-describedby") ?? "").toContain(erro.id);
  });

  it("fecha o diálogo quando a gravação dá certo", async () => {
    render(<ArquivamentoDialog patientId="pac-1" arquivado={false} />);
    const user = await abrir("Arquivar paciente");

    await user.type(
      screen.getByLabelText(/Motivo do arquivamento/),
      "Encerrou o acompanhamento.",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar arquivamento" }),
    );

    // `waitFor`: o fechamento acontece no efeito que observa a resposta da
    // action, um tick depois do clique.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("paciente arquivado desarquiva — não arquiva de novo", async () => {
    render(<ArquivamentoDialog patientId="pac-1" arquivado />);
    const user = await abrir("Desarquivar paciente");

    await user.type(
      screen.getByLabelText(/Motivo do desarquivamento/),
      "Paciente retomou o acompanhamento.",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar desarquivamento" }),
    );

    expect(desarquivar).toHaveBeenCalledTimes(1);
    expect(arquivar).not.toHaveBeenCalled();
  });

  it("fecha com Esc sem enviar nada", async () => {
    render(<ArquivamentoDialog patientId="pac-1" arquivado={false} />);
    const user = await abrir("Arquivar paciente");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(arquivar).not.toHaveBeenCalled();
  });
});
