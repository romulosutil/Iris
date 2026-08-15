import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CadastroAdminState } from "./actions";

/**
 * B4 (#98/PR #305 achado do review): `logic.ts` já lê e valida
 * `formData.get("clinicalModality")`, mas o formulário não tinha nenhum
 * campo com esse `name` — o valor caía sempre no default `protocol_driven`
 * e ninguém conseguia cadastrar paciente em Terapia Convencional pela UI.
 *
 * Estes casos travam o CORPO enviado (`FormData`), não só a presença visual
 * do Select: um controle com outro `name`, ou um Select que nunca participa
 * do submit, passaria numa asserção só de tela e devolveria o defeito B4 por
 * outro caminho.
 */

const acaoMock = vi.fn(
  async (_prev: CadastroAdminState, _formData: FormData) =>
    ({}) as CadastroAdminState,
);

vi.mock("./actions", () => ({
  cadastrarPacienteAdministrativo: (
    prev: CadastroAdminState,
    formData: FormData,
  ) => acaoMock(prev, formData),
}));

const { NovoPacienteForm } = await import("./novo-paciente-form");

// jsdom não implementa a Pointer Events API que o Radix Select usa
// internamente (hasPointerCapture/setPointerCapture/scrollIntoView) — sem
// isso, clicar numa opção lança TypeError. Mesmo polyfill mínimo usado em
// gerir-sessao.a11y.test.tsx.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  acaoMock.mockClear();
});

/** Preenche só o que é `required` no HTML (nome) — o resto não importa para
 * este teste, que só discrimina o campo `clinicalModality`. */
async function preencherNomeEEnviar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nome do paciente/i), "Ana Teste");
  await user.click(
    screen.getByRole("button", { name: /salvar e prescrever/i }),
  );
}

describe("NovoPacienteForm — campo Modalidade clínica (B4)", () => {
  test("sem escolher nada, envia o default protocol_driven", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    await preencherNomeEEnviar(user);

    await waitFor(() => expect(acaoMock).toHaveBeenCalledTimes(1));
    const corpo = acaoMock.mock.calls[0]![1];
    expect(corpo.get("clinicalModality")).toBe("protocol_driven");
  });

  test("escolhendo Terapia Convencional, envia clinicalModality=conventional", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    await user.click(
      screen.getByRole("combobox", { name: /modalidade clínica/i }),
    );
    await user.click(
      await screen.findByRole("option", { name: /terapia convencional/i }),
    );

    await preencherNomeEEnviar(user);

    await waitFor(() => expect(acaoMock).toHaveBeenCalledTimes(1));
    const corpo = acaoMock.mock.calls[0]![1];
    expect(corpo.get("clinicalModality")).toBe("conventional");
  });

  test("o Select tem rótulo acessível e as duas opções do enum, com nomenclatura de docs/agente/", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    const combobox = screen.getByRole("combobox", {
      name: /modalidade clínica/i,
    });
    await user.click(combobox);

    expect(
      await screen.findByRole("option", { name: /protocolos de marcos/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("option", { name: /terapia convencional/i }),
    ).toBeDefined();
  });
});
