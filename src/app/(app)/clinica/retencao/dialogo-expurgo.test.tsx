import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * `actions.ts` é `"use server"` e puxa `getTenantContext` (banco, cookies). O
 * que este arquivo testa é o CONTRATO entre o diálogo e a action: quando o
 * botão libera, o que sai no `FormData`, e o que acontece com cada resposta. A
 * eliminação em si é coberta por `logic.int.test.ts`, contra Postgres.
 */
const { purgar } = vi.hoisted(() => ({ purgar: vi.fn() }));
vi.mock("./actions", () => ({ purgarPacienteAction: purgar }));

const { DialogoExpurgo } = await import("./dialogo-expurgo");

const NOME = "Ana Clara Ferrão";

/**
 * O que estes casos discriminam (#352):
 *
 * 1. **O botão só libera com o nome exato.** É a barreira contra purgar o
 *    paciente ERRADO numa fila de nomes parecidos — não contra o clique
 *    acidental.
 * 2. **Caixa e acento contam.** Normalizar reduziria o atrito exatamente onde o
 *    atrito é o produto; um teste que só digitasse o nome certo não veria a
 *    diferença entre comparar cru e comparar normalizado.
 * 3. **O paciente vai por `bind`, não por campo do formulário.** Campo escondido
 *    com o alvo de um expurgo definitivo é editável no devtools.
 * 4. **Erro não fecha o diálogo** — fechar jogaria fora o motivo digitado.
 * 5. **Reabrir devolve o campo vazio.** Confirmador que persiste vira botão já
 *    habilitado na abertura seguinte.
 */

beforeEach(() => {
  purgar.mockReset().mockResolvedValue({ ok: true });
});

async function abrir() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Expurgar prontuário" }));
  await screen.findByRole("dialog");
  return user;
}

function botaoConfirmar() {
  return screen.getByRole("button", { name: "Expurgar definitivamente" });
}

describe("DialogoExpurgo", () => {
  it("mantém o botão desabilitado até o nome ser digitado por inteiro", async () => {
    render(<DialogoExpurgo pacienteId="pac-1" nome={NOME} />);
    const user = await abrir();

    expect((botaoConfirmar() as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/Digite o nome do paciente/), NOME);

    expect((botaoConfirmar() as HTMLButtonElement).disabled).toBe(false);
  });

  it("nome com caixa ou acento diferente NÃO libera o botão", async () => {
    render(<DialogoExpurgo pacienteId="pac-1" nome={NOME} />);
    const user = await abrir();
    const campo = screen.getByLabelText(/Digite o nome do paciente/);

    await user.type(campo, "ana clara ferrão");
    expect((botaoConfirmar() as HTMLButtonElement).disabled).toBe(true);

    await user.clear(campo);
    await user.type(campo, "Ana Clara Ferrao");
    expect((botaoConfirmar() as HTMLButtonElement).disabled).toBe(true);
  });

  it("envia confirmação e motivo, com o paciente ligado ao botão", async () => {
    render(<DialogoExpurgo pacienteId="pac-1" nome={NOME} />);
    const user = await abrir();

    await user.type(screen.getByLabelText(/Digite o nome do paciente/), NOME);
    await user.type(
      screen.getByLabelText(/Motivo do expurgo/),
      "Prazo legal de guarda vencido, eliminação de rotina.",
    );
    await user.click(botaoConfirmar());

    expect(purgar).toHaveBeenCalledTimes(1);
    const [pacienteId, , formData] = purgar.mock.calls[0] as [
      string,
      unknown,
      FormData,
    ];
    expect(pacienteId).toBe("pac-1");
    expect(formData.get("confirmacao")).toBe(NOME);
    expect(formData.get("motivo")).toBe(
      "Prazo legal de guarda vencido, eliminação de rotina.",
    );
    // O alvo do expurgo não trafega como campo do formulário.
    expect(formData.get("pacienteId")).toBeNull();
  });

  it("erro do servidor mantém o diálogo aberto, com a mensagem ligada ao campo", async () => {
    purgar.mockResolvedValue({
      error: "Não foi possível expurgar este prontuário.",
    });
    render(<DialogoExpurgo pacienteId="pac-1" nome={NOME} />);
    const user = await abrir();

    await user.type(screen.getByLabelText(/Digite o nome do paciente/), NOME);
    await user.type(
      screen.getByLabelText(/Motivo do expurgo/),
      "Prazo legal de guarda vencido, eliminação de rotina.",
    );
    await user.click(botaoConfirmar());

    expect(await screen.findByRole("dialog")).toBeTruthy();
    const erro = await screen.findByText(
      "Não foi possível expurgar este prontuário.",
    );
    // Ligado por `aria-describedby`: mensagem que existe no DOM mas o leitor de
    // tela nunca anuncia ao focar o campo não é mensagem de erro acessível.
    const campo = screen.getByLabelText(/Motivo do expurgo/);
    expect(campo.getAttribute("aria-describedby") ?? "").toContain(erro.id);
  });

  it("fecha o diálogo quando o expurgo dá certo", async () => {
    render(<DialogoExpurgo pacienteId="pac-1" nome={NOME} />);
    const user = await abrir();

    await user.type(screen.getByLabelText(/Digite o nome do paciente/), NOME);
    await user.type(
      screen.getByLabelText(/Motivo do expurgo/),
      "Prazo legal de guarda vencido, eliminação de rotina.",
    );
    await user.click(botaoConfirmar());

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reabrir depois de cancelar devolve o confirmador vazio", async () => {
    render(<DialogoExpurgo pacienteId="pac-1" nome={NOME} />);
    let user = await abrir();

    await user.type(screen.getByLabelText(/Digite o nome do paciente/), NOME);
    expect((botaoConfirmar() as HTMLButtonElement).disabled).toBe(false);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(purgar).not.toHaveBeenCalled();

    user = await abrir();
    expect(
      (screen.getByLabelText(/Digite o nome do paciente/) as HTMLInputElement)
        .value,
    ).toBe("");
    expect((botaoConfirmar() as HTMLButtonElement).disabled).toBe(true);
  });
});
