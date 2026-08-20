import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeltaSessaoLateral } from "./delta-sessao";

/**
 * O achado que estes testes travam: os três `catch` desta superfície faziam
 * `setState(null)` e caíam no EMPTY STATE, então uma falha de rede era
 * apresentada como "Nenhuma alteração clínica registrada nesta sessão" — um
 * fato clínico sobre o paciente que ninguém mediu.
 *
 * O caso decisivo é o terceiro: `erro` e `delta === null` acontecem JUNTOS
 * (é exatamente o estado que o `catch` deixa). Um teste que só verificasse
 * "com erro aparece a mensagem de erro" passaria mesmo se a ordem das
 * guardas no componente estivesse invertida — porque o empty state também
 * renderiza. Por isso cada caso afirma o que aparece E o que NÃO aparece.
 */
const SEM_ALTERACAO = /Nenhuma alteração clínica registrada nesta sessão/;
const ERRO = /O resumo desta sessão não foi carregado/;

describe("DeltaSessaoLateral — falha nunca vira fato clínico", () => {
  it("sem erro e sem delta: afirma que não houve alteração", () => {
    render(<DeltaSessaoLateral delta={null} metas={[]} milestones={[]} />);

    expect(screen.getByText(SEM_ALTERACAO)).toBeTruthy();
    expect(screen.queryByText(ERRO)).toBeNull();
  });

  it("com erro: mostra a falha e NÃO afirma ausência de alteração", () => {
    render(
      <DeltaSessaoLateral
        delta={null}
        metas={[]}
        milestones={[]}
        erro
        onTentarDeNovo={() => {}}
      />,
    );

    expect(screen.getByText(ERRO)).toBeTruthy();
    // A asserção que mata o mutante: se a guarda de erro for movida para
    // DEPOIS da guarda de empty state, este `queryByText` volta a achar texto.
    expect(screen.queryByText(SEM_ALTERACAO)).toBeNull();
  });

  it("erro tem prioridade sobre carregando resolvido com lista vazia", () => {
    render(
      <DeltaSessaoLateral
        delta={{ itens: [], evidenciasNovas: 0, metasCandidatasNovas: 0 }}
        metas={[]}
        milestones={[]}
        erro
        onTentarDeNovo={() => {}}
      />,
    );

    expect(screen.getByText(ERRO)).toBeTruthy();
    expect(screen.queryByText(SEM_ALTERACAO)).toBeNull();
  });

  it("o estado de erro é anunciado sem interromper o leitor de tela", () => {
    const { container } = render(
      <DeltaSessaoLateral
        delta={null}
        metas={[]}
        milestones={[]}
        erro
        onTentarDeNovo={() => {}}
      />,
    );

    // `role="status"`, não `role="alert"`: neste produto a semântica que
    // interrompe é reservada ao risco clínico (ver `../layout.tsx`).
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("oferece saída: 'Tentar de novo' dispara o recarregamento", async () => {
    const onTentarDeNovo = vi.fn();
    render(
      <DeltaSessaoLateral
        delta={null}
        metas={[]}
        milestones={[]}
        erro
        onTentarDeNovo={onTentarDeNovo}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Tentar de novo/i }),
    );

    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
  });
});
