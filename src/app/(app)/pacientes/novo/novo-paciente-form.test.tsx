import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NovoPacienteForm } from "./novo-paciente-form";

/**
 * #387 — grupo de modalidade clínica (`RadioCards`) e gate de consentimento
 * novo (R3). Segue o MESMO padrão já usado neste projeto para componentes com
 * `useActionState` (`assinatura/formulario-ativacao.test.tsx`): a action é
 * mockada, o comportamento é exercitado via `userEvent` + `role`/`aria-*`.
 *
 * Não há teste de componente prévio para o grupo `tipoConsentimento` — o
 * único teste desta pasta (`page.test.tsx`) dubla `NovoPacienteForm` inteiro.
 * Este arquivo é o primeiro a renderizar o formulário de verdade; ele cobre o
 * grupo NOVO (`clinicalModality`) e o gate — não reabre cobertura do grupo
 * `tipoConsentimento`, que já é exercitado pelos testes de integração.
 */

vi.mock("./actions", () => ({
  // Nunca resolve nestes testes: nenhum caso aqui chega a completar o
  // submit (os casos de gate travam o botão ANTES do clique valer).
  cadastrarPacienteAdministrativo: vi.fn(() => new Promise(() => {})),
}));

function grupoModalidade() {
  return screen.getByRole("group", { name: /modalidade clínica/i });
}

function grupoConsentimento() {
  return screen.getByRole("group", { name: /quem assina o consentimento/i });
}

describe("NovoPacienteForm — grupo de modalidade clínica (#387)", () => {
  it("renderiza radiogroup com as 3 opções, todas role=radio e NENHUMA pré-selecionada", () => {
    render(<NovoPacienteForm />);

    const grupo = grupoModalidade();
    expect(grupo.querySelector('[role="radiogroup"]')).toBeTruthy();

    const radios = within(grupo).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }

    expect(
      within(grupo).getByRole("radio", {
        name: /protocolo estruturado \(aba \/ tea\)/i,
      }),
    ).toBeTruthy();
    expect(
      within(grupo).getByRole("radio", {
        name: /terapia cognitivo-comportamental \(tcc\)/i,
      }),
    ).toBeTruthy();
    expect(
      within(grupo).getByRole("radio", {
        name: /terapia convencional \(psicodinâmica, humanista\/existencial, transpessoal\/integrativa\)/i,
      }),
    ).toBeTruthy();

    // Sem valor até o operador escolher — a action rejeita "" com mensagem
    // própria, sem default silencioso (R2).
    const hidden = document.querySelector(
      'input[name="clinicalModality"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("");
  });

  it("clique numa opção marca aria-checked e sincroniza o input hidden lido pela action", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    const grupo = grupoModalidade();
    const tcc = within(grupo).getByRole("radio", {
      name: /terapia cognitivo-comportamental \(tcc\)/i,
    });
    await user.click(tcc);

    expect(tcc.getAttribute("aria-checked")).toBe("true");
    const hidden = document.querySelector(
      'input[name="clinicalModality"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("cognitive_behavioral");

    // Escolher uma opção não marca as outras.
    const convencional = within(grupo).getByRole("radio", {
      name: /terapia convencional/i,
    });
    expect(convencional.getAttribute("aria-checked")).toBe("false");
  });

  it("navegação por teclado (seta direita) move foco E seleção entre as opções", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    const grupo = grupoModalidade();
    const radios = within(grupo).getAllByRole("radio");

    radios[0]!.focus();
    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1]!.getAttribute("aria-checked")).toBe("true");
    expect(radios[0]!.getAttribute("aria-checked")).toBe("false");
  });
});

describe("NovoPacienteForm — grupo de família de abordagem (#331)", () => {
  it("não renderiza o grupo quando modalidade clínica ainda não foi escolhida", () => {
    render(<NovoPacienteForm />);
    expect(
      screen.queryByRole("group", { name: /família de abordagem/i }),
    ).toBeNull();
  });

  it("não renderiza o grupo para protocolo estruturado nem TCC", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    const protocoloEstruturado = within(grupoModalidade()).getByRole(
      "radio",
      { name: /protocolo estruturado/i },
    );
    await user.click(protocoloEstruturado);
    expect(
      screen.queryByRole("group", { name: /família de abordagem/i }),
    ).toBeNull();

    const tcc = within(grupoModalidade()).getByRole("radio", {
      name: /terapia cognitivo-comportamental/i,
    });
    await user.click(tcc);
    expect(
      screen.queryByRole("group", { name: /família de abordagem/i }),
    ).toBeNull();
  });

  it("renderiza as 3 opções, sem pré-seleção, quando modalidade = terapia convencional", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    const convencional = within(grupoModalidade()).getByRole("radio", {
      name: /terapia convencional/i,
    });
    await user.click(convencional);

    const grupo = screen.getByRole("group", {
      name: /família de abordagem/i,
    });
    const radios = within(grupo).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
    expect(
      within(grupo).getByRole("radio", { name: /psicodinâmica/i }),
    ).toBeTruthy();
    expect(
      within(grupo).getByRole("radio", { name: /humanista \/ existencial/i }),
    ).toBeTruthy();
    expect(
      within(grupo).getByRole("radio", {
        name: /transpessoal \/ integrativa/i,
      }),
    ).toBeTruthy();

    const hidden = document.querySelector(
      'input[name="familiaAbordagem"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("");
  });

  it("clique numa opção sincroniza o input hidden lido pela action", async () => {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    const convencional = within(grupoModalidade()).getByRole("radio", {
      name: /terapia convencional/i,
    });
    await user.click(convencional);

    const grupo = screen.getByRole("group", {
      name: /família de abordagem/i,
    });
    const psicodinamica = within(grupo).getByRole("radio", {
      name: /psicodinâmica/i,
    });
    await user.click(psicodinamica);

    expect(psicodinamica.getAttribute("aria-checked")).toBe("true");
    const hidden = document.querySelector(
      'input[name="familiaAbordagem"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("psicodinamica");
  });
});

describe("NovoPacienteForm — gate de consentimento por modalidade, paciente adulto (R3)", () => {
  async function preencherAdultoComModalidade(
    tipoConsentimento: "responsavel_legal" | "titular_adulto",
    modalidade: string,
  ) {
    const user = userEvent.setup();
    render(<NovoPacienteForm />);

    const nascimento = screen.getByLabelText(
      /data de nascimento/i,
    ) as HTMLInputElement;
    await user.type(nascimento, "1990-01-01");

    const consentimento = within(grupoConsentimento()).getByRole("radio", {
      name:
        tipoConsentimento === "titular_adulto"
          ? /o próprio paciente/i
          : /responsável legal/i,
    });
    await user.click(consentimento);

    const modalidadeRadio = within(grupoModalidade()).getByRole("radio", {
      name: new RegExp(modalidade, "i"),
    });
    await user.click(modalidadeRadio);

    return {
      botao: screen.getByRole("button", {
        name: /salvar e prescrever a carga horária/i,
      }),
    };
  }

  it("adulto + TCC + responsável legal (sem titular_adulto): BLOQUEIA o submit com feedback claro", async () => {
    const { botao } = await preencherAdultoComModalidade(
      "responsavel_legal",
      "terapia cognitivo-comportamental",
    );

    expect(botao).toHaveProperty("disabled", true);
    expect(
      screen.getByText(
        /adulto em tcc ou terapia convencional exige consentimento do próprio titular/i,
      ),
    ).toBeTruthy();
  });

  it("adulto + terapia convencional + responsável legal (sem titular_adulto): BLOQUEIA o submit", async () => {
    const { botao } = await preencherAdultoComModalidade(
      "responsavel_legal",
      "terapia convencional",
    );

    expect(botao).toHaveProperty("disabled", true);
  });

  it("adulto + TCC + titular_adulto (o próprio paciente): NÃO bloqueia", async () => {
    const { botao } = await preencherAdultoComModalidade(
      "titular_adulto",
      "terapia cognitivo-comportamental",
    );

    expect(botao).toHaveProperty("disabled", false);
    expect(
      screen.queryByText(/exige consentimento do próprio titular/i),
    ).toBeNull();
  });

  it("adulto + protocolo estruturado + responsável legal (sem titular_adulto): NÃO bloqueia — só o aviso soft já existente", async () => {
    const { botao } = await preencherAdultoComModalidade(
      "responsavel_legal",
      "protocolo estruturado",
    );

    expect(botao).toHaveProperty("disabled", false);
    expect(
      screen.queryByText(/exige consentimento do próprio titular/i),
    ).toBeNull();
    // O aviso soft que já existia (não é o gate novo) continua podendo
    // aparecer — é o `avisoDivergencia` de sempre, fora do escopo do R3.
  });
});
