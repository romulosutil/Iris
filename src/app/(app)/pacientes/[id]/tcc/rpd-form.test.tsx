import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RpdForm } from "./rpd-form";
import { DISTORCOES_COGNITIVAS_OPCOES } from "./constants";

/**
 * #389 — formato Padesky. Distorção cognitiva vira opcional, colapsada por
 * padrão, com checkboxes (não combobox) — testado aqui porque é o único
 * grupo novo desta fatia. Não reabre cobertura de submit/erro do formulário
 * (comportamento herdado, sem mudança).
 */

vi.mock("./actions", () => ({
  // Nunca resolve: nenhum caso aqui completa o submit.
  salvarRPDAction: vi.fn(() => new Promise(() => {})),
}));

function grupoDistorcoes() {
  return screen.getByRole("group", {
    name: /que armadilha de pensamento parece ser\?/i,
  });
}

describe("RpdForm — fieldset de distorções cognitivas (#389)", () => {
  it("é um fieldset com legend acessível, dentro de <details> fechado por padrão", () => {
    render(<RpdForm patientId="pac_1" />);

    const grupo = grupoDistorcoes();
    expect(grupo.tagName.toLowerCase()).toBe("fieldset");

    const details = grupo.closest("details");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("renderiza um checkbox por opção da taxonomia, todos associados ao fieldset", () => {
    render(<RpdForm patientId="pac_1" />);

    const grupo = grupoDistorcoes();
    const checkboxes = within(grupo).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(DISTORCOES_COGNITIVAS_OPCOES.length);

    for (const checkbox of checkboxes) {
      expect(checkbox.getAttribute("type")).not.toBe(null); // input bubble existe
    }

    for (const opcao of DISTORCOES_COGNITIVAS_OPCOES) {
      expect(
        within(grupo).getByRole("checkbox", { name: opcao.rotulo }),
      ).toBeTruthy();
    }
  });

  it("traz a copy exata de apoio dentro do fieldset", () => {
    render(<RpdForm patientId="pac_1" />);
    const grupo = grupoDistorcoes();

    expect(
      within(grupo).getByText(
        "Pular este campo não prejudica o registro. As categorias se sobrepõem e nem os manuais concordam entre si — o que muda o quadro é examinar as evidências e formular uma alternativa, o que você já fez acima.",
      ),
    ).toBeTruthy();
  });

  it("nenhum checkbox de distorção é obrigatório — só situação, pensamento e emoção travam o submit", () => {
    render(<RpdForm patientId="pac_1" />);

    expect(
      (screen.getByLabelText(/situação \/ gatilho/i) as HTMLInputElement)
        .required,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/pensamento automático/i) as HTMLInputElement)
        .required,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/emoção sentida/i) as HTMLInputElement).required,
    ).toBe(true);

    const grupo = grupoDistorcoes();
    for (const checkbox of within(grupo).getAllByRole("checkbox")) {
      expect(checkbox.getAttribute("aria-required")).not.toBe("true");
    }

    expect(
      (
        screen.getByLabelText(
          /evidências a favor do pensamento/i,
        ) as HTMLTextAreaElement
      ).required,
    ).toBe(false);
    expect(
      (
        screen.getByLabelText(
          /pensamento alternativo/i,
        ) as HTMLInputElement
      ).required,
    ).toBe(false);
  });
});
