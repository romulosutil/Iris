import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/toast";
import type { PrescricaoState } from "./prescricao-logic";

/**
 * A confirmação de §MV4 vale nos DOIS formulários da seção.
 *
 * `prescreverDisciplinaAction` é a mesma action para a linha que altera a carga
 * vigente e para o bloco que prescreve uma disciplina nova. Enquanto o diálogo
 * morava só dentro da linha, o formulário de prescrição nova recebia
 * `confirmacao` e não sabia lê-la: nada salvava, nada aparecia, e o submit
 * virava um clique sem efeito — o mesmo "faz algo caro e não diz nada" que a
 * fatia existe para eliminar, reintroduzido no formulário irmão.
 *
 * O caminho não é hipotético: encerrar a prescrição mantém os vínculos já
 * montados (é o que o próprio diálogo de encerramento promete), e prescrever a
 * disciplina de novo com carga menor que a alocada cai exatamente aqui.
 */

const CONFIRMACAO: PrescricaoState = {
  confirmacao: {
    disciplina: "Fonoaudiologia",
    horasNovas: 10,
    horasAlocadas: 15,
    texto:
      "15h de 10h alocadas (150%) — sobrealocação de 5h. Reduza as horas de um membro ou aumente a prescrição.",
  },
};

const prescreverDisciplinaAction = vi.fn(async () => CONFIRMACAO);

vi.mock("./prescricao-actions", () => ({
  prescreverDisciplinaAction: (...args: unknown[]) =>
    prescreverDisciplinaAction(...(args as [])),
  encerrarPrescricaoAction: vi.fn(),
}));

const { PrescricaoDisciplinasSecao } =
  await import("./prescricao-disciplinas-secao");

describe("PrescricaoDisciplinasSecao", () => {
  it("pergunta antes de sobrealocar também ao prescrever disciplina NOVA", async () => {
    const { container } = render(
      <ToastProvider>
        <PrescricaoDisciplinasSecao
          patientId="b0000000-0000-0000-0000-000000000032"
          prescricoes={[]}
        />
      </ToastProvider>,
    );

    // Sem prescrição vigente, o único formulário da seção é o de prescrição
    // nova — que é justamente o que não sabia ler a confirmação.
    const formulario = container.querySelector("form");
    expect(formulario).not.toBeNull();
    fireEvent.submit(formulario!);

    expect(
      await screen.findByText("Esta redução deixa a disciplina sobrealocada."),
    ).toBeTruthy();
    // A frase do diálogo é a MESMA da barra da tela de destino, sem paráfrase.
    expect((await screen.findByRole("dialog")).textContent).toContain(
      "sobrealocação de 5h",
    );
  });
});
