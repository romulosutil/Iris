import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * `actions.ts` é `"use server"` e puxa `getTenantContext` (banco, cookies). O
 * que este arquivo testa é o CONTRATO entre o diálogo e a action: o que sai no
 * `FormData` e o que acontece com cada resposta. A gravação em `patient.alta_em`
 * e em `audit_log` é coberta por `alta.int.test.ts`, contra Postgres.
 */
const { registrar, desfazer } = vi.hoisted(() => ({
  registrar: vi.fn(),
  desfazer: vi.fn(),
}));
vi.mock("./actions", () => ({
  registrarAltaAction: registrar,
  desfazerAltaAction: desfazer,
}));

const { AltaDialog } = await import("./alta-dialog");

/**
 * O que estes casos discriminam (#352):
 *
 * 1. **A data chega na action.** É o campo que governa o vencimento do prazo de
 *    guarda. Um diálogo que coleta a data na tela e envia só o motivo gravaria
 *    alta com `data` vazia — recusada pelo Zod, mas o furo seria da UI.
 * 2. **Desfazer não pede data.** Pedir a data para apagá-la é convite a erro; e
 *    o core de desfazer não a recebe.
 * 3. **Erro não fecha o diálogo** — fechar jogaria fora o texto digitado.
 * 4. **O sentido da operação segue o estado do paciente.** Chamar `registrar`
 *    num paciente que já tem alta é no-op idempotente no servidor: a tela diria
 *    "pronto" e a data não teria mudado.
 */

beforeEach(() => {
  registrar.mockReset().mockResolvedValue({ ok: true });
  desfazer.mockReset().mockResolvedValue({ ok: true });
});

async function abrir(rotulo: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: rotulo }));
  await screen.findByRole("dialog");
  return user;
}

describe("AltaDialog", () => {
  it("envia data e motivo, junto do paciente ligado ao botão", async () => {
    render(<AltaDialog patientId="pac-1" comAlta={false} />);
    const user = await abrir("Registrar alta clínica");

    await user.type(screen.getByLabelText(/Data da alta/), "2026-03-10");
    await user.type(
      screen.getByLabelText(/Motivo da alta/),
      "Encerramento acordado com a família.",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar alta" }));

    expect(registrar).toHaveBeenCalledTimes(1);
    const [patientId, , formData] = registrar.mock.calls[0] as [
      string,
      unknown,
      FormData,
    ];
    expect(patientId).toBe("pac-1");
    expect(formData.get("data")).toBe("2026-03-10");
    expect(formData.get("motivo")).toBe("Encerramento acordado com a família.");
    expect(desfazer).not.toHaveBeenCalled();
  });

  it("paciente com alta desfaz — e o diálogo não pede data nenhuma", async () => {
    render(<AltaDialog patientId="pac-1" comAlta />);
    const user = await abrir("Desfazer alta clínica");

    expect(screen.queryByLabelText(/Data da alta/)).toBeNull();

    await user.type(
      screen.getByLabelText(/Motivo para desfazer/),
      "Data digitada errada no registro anterior.",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar desfazimento" }),
    );

    expect(desfazer).toHaveBeenCalledTimes(1);
    expect(registrar).not.toHaveBeenCalled();
  });

  it("erro do servidor mantém o diálogo aberto, com a mensagem ligada ao campo", async () => {
    registrar.mockResolvedValue({
      error: "A data da alta não pode ser futura.",
    });
    render(<AltaDialog patientId="pac-1" comAlta={false} />);
    const user = await abrir("Registrar alta clínica");

    await user.type(screen.getByLabelText(/Data da alta/), "2030-01-01");
    await user.type(
      screen.getByLabelText(/Motivo da alta/),
      "Encerramento acordado com a família.",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar alta" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    const erro = await screen.findByText("A data da alta não pode ser futura.");
    // Ligado por `aria-describedby`: mensagem que existe no DOM mas o leitor de
    // tela nunca anuncia ao focar o campo não é mensagem de erro acessível.
    const campo = screen.getByLabelText(/Motivo da alta/);
    expect(campo.getAttribute("aria-describedby") ?? "").toContain(erro.id);
  });

  it("fecha o diálogo quando a gravação dá certo", async () => {
    render(<AltaDialog patientId="pac-1" comAlta={false} />);
    const user = await abrir("Registrar alta clínica");

    await user.type(screen.getByLabelText(/Data da alta/), "2026-03-10");
    await user.type(
      screen.getByLabelText(/Motivo da alta/),
      "Encerramento acordado com a família.",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar alta" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("conta em somente-leitura mostra o aviso, sem esconder o formulário", async () => {
    registrar.mockResolvedValue({
      error: "Conta em somente-leitura.",
      bloqueioConta: {
        estado: "trial_expirado",
        mensagem: "Seu período de teste terminou.",
      },
    });
    render(<AltaDialog patientId="pac-1" comAlta={false} />);
    const user = await abrir("Registrar alta clínica");

    await user.type(screen.getByLabelText(/Data da alta/), "2026-03-10");
    await user.type(
      screen.getByLabelText(/Motivo da alta/),
      "Encerramento acordado com a família.",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar alta" }));

    expect(
      await screen.findByText("Seu período de teste terminou."),
    ).toBeTruthy();
  });

  it("fecha com Esc sem enviar nada", async () => {
    render(<AltaDialog patientId="pac-1" comAlta={false} />);
    const user = await abrir("Registrar alta clínica");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(registrar).not.toHaveBeenCalled();
  });
});
