import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { RpdSugestoes, type RPDSugestao } from "./rpd-sugestoes";

/**
 * #392 — fila de RPD sugerido na aba TCC. Cobre os 3 pontos do "Done when"
 * de T5 (`tasks.md`): lista de pendentes, "Aprovar" abre `rpd-form.tsx`
 * pré-preenchido (campos obrigatórios em branco), "Descartar" é um clique
 * sem diálogo. As actions nunca resolvem (mesmo padrão de
 * `rpd-form.test.tsx`) — nenhum caso aqui completa o submit real.
 */

vi.mock("./actions", () => ({
  salvarRPDAction: vi.fn(() => new Promise(() => {})),
  aprovarRPDSugestaoAction: vi.fn(() => new Promise(() => {})),
  descartarRPDSugestaoAction: vi.fn(() => new Promise(() => {})),
}));

const SUGESTAO_1: RPDSugestao = {
  extractionId: "extraction_1",
  trechoFonte: "Vou gaguejar e todos vão perceber que sou incompetente",
  criadoEm: "2026-08-10T12:00:00.000Z",
  payload: {
    evidencias_favor: "Já gaguejei em outra reunião uma vez.",
    evidencias_contra: null,
    credibilidade_inicial: 75,
    credibilidade_alternativa: null,
    comportamento_resultante: "Evitei olhar para a plateia.",
    distorcoes_cognitivas: ["catastrofizacao", "leitura_mental"],
  },
};

const SUGESTAO_2: RPDSugestao = {
  extractionId: "extraction_2",
  trechoFonte: "Ninguém vai gostar da minha apresentação",
  criadoEm: "2026-08-11T09:00:00.000Z",
  payload: {},
};

describe("RpdSugestoes — fila de RPD sugerido pelo agente (#392)", () => {
  it("renderiza as sugestões pendentes recebidas por prop", () => {
    render(
      <RpdSugestoes patientId="pac_1" sugestoes={[SUGESTAO_1, SUGESTAO_2]} />,
    );

    expect(
      screen.getByText(new RegExp(SUGESTAO_1.trechoFonte, "i")),
    ).toBeTruthy();
    expect(
      screen.getByText(new RegExp(SUGESTAO_2.trechoFonte, "i")),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /aprovar/i })).toHaveLength(
      2,
    );
  });

  it("'Aprovar' abre o rpd-form pré-preenchido com os campos do payload, deixando situação/emoção/intensidade em branco", () => {
    render(<RpdSugestoes patientId="pac_1" sugestoes={[SUGESTAO_1]} />);

    fireEvent.click(screen.getByRole("button", { name: /aprovar/i }));

    // Pré-preenchido a partir do trecho literal e do payload da extração.
    expect(
      (
        screen.getByLabelText(
          /pensamento automático/i,
        ) as HTMLInputElement
      ).value,
    ).toBe(SUGESTAO_1.trechoFonte);
    expect(
      (
        screen.getByLabelText(
          /evidências a favor do pensamento/i,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(SUGESTAO_1.payload.evidencias_favor);
    expect(
      (
        screen.getByLabelText(
          /credibilidade inicial/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("75");

    // Distorções sugeridas vêm pré-marcadas.
    const grupo = screen.getByRole("group", {
      name: /que armadilha de pensamento parece ser\?/i,
    });
    expect(
      (
        within(grupo).getByRole("checkbox", {
          name: "Catastrofização",
        }) as HTMLInputElement
      ).getAttribute("data-state"),
    ).toBe("checked");

    // situação/emoção/intensidade continuam obrigatórias e SEM valor
    // inventado — o schema do agente não cobre esses três campos.
    const situacao = screen.getByLabelText(
      /situação \/ gatilho/i,
    ) as HTMLInputElement;
    const emocao = screen.getByLabelText(
      /emoção sentida/i,
    ) as HTMLInputElement;
    expect(situacao.value).toBe("");
    expect(situacao.required).toBe(true);
    expect(emocao.value).toBe("");
    expect(emocao.required).toBe(true);
  });

  it("'Descartar' é uma ação de um clique — nenhum diálogo/modal aparece", () => {
    render(<RpdSugestoes patientId="pac_1" sugestoes={[SUGESTAO_1]} />);

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));

    // Sem modal bloqueante em nenhum momento do fluxo.
    expect(screen.queryByRole("dialog")).toBeNull();
    // Estado de pendente aparece direto no botão (a action nunca resolve).
    expect(
      screen.getByRole("button", { name: /descartando/i }),
    ).toBeTruthy();
  });

  it("zero sugestões pendentes renderiza um estado vazio, não um erro", () => {
    render(<RpdSugestoes patientId="pac_1" sugestoes={[]} />);

    expect(
      screen.getByRole("region", { name: /nenhum rpd sugerido pendente/i }),
    ).toBeTruthy();
    expect(screen.queryByText(/erro/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /aprovar/i })).toBeNull();
  });
});
