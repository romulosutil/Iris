import axe from "axe-core";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CalendarioSemana } from "./calendario-semana";

afterEach(cleanup);

async function semViolacoes(container: HTMLElement) {
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const base = {
  fuso: "America/Sao_Paulo",
  dias: [
    "2026-07-13",
    "2026-07-14",
    "2026-07-15",
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
  ],
  passoMin: 60,
  abertura: "08:00",
  fechamento: "12:00",
  janelas: [{ diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" }],
  bloqueios: [],
  blocos: [
    {
      id: "r1",
      origem: "previsto" as const,
      diaSemana: 1,
      inicioMin: 540,
      duracaoMin: 60,
      disciplina: "aba",
      rotulo: "Ana",
    },
  ],
};

describe("CalendarioSemana", () => {
  test("é um grid sem violações axe (color-contrast desligado — jsdom sem canvas)", async () => {
    const { container } = render(
      <CalendarioSemana {...base} aoAlocar={() => {}} />,
    );
    expect(screen.getByRole("grid")).not.toBeNull();
    await semViolacoes(container);
  });

  test("clicar célula livre dispara aoAlocar com dia e minuto", async () => {
    const aoAlocar = vi.fn();
    render(<CalendarioSemana {...base} aoAlocar={aoAlocar} />);
    // célula seg 10:00 (livre)
    await userEvent.click(
      screen.getByRole("gridcell", { name: /segunda.*10:00/i }),
    );
    expect(aoAlocar).toHaveBeenCalledWith(1, 600);
  });

  test("célula bloqueada é aria-disabled e NÃO dispara aoAlocar", async () => {
    const aoAlocar = vi.fn();
    render(
      <CalendarioSemana
        {...base}
        bloqueios={[{ dataInicio: "2026-07-13", dataFim: "2026-07-13" }]}
        aoAlocar={aoAlocar}
      />,
    );
    const celula = screen.getByRole("gridcell", { name: /segunda.*10:00/i });
    expect(celula.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(celula);
    expect(aoAlocar).not.toHaveBeenCalled();
  });

  test("navegação por teclado move o foco (roving tabIndex) e Enter aloca", async () => {
    const aoAlocar = vi.fn();
    render(<CalendarioSemana {...base} aoAlocar={aoAlocar} />);
    const celulaInicial = screen.getByRole("gridcell", {
      name: /segunda.*08:00/i,
    });
    celulaInicial.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}");
    expect(aoAlocar).toHaveBeenCalledWith(1, 600);
  });

  test("célula onde o bloco começa anuncia a ocupação no nome acessível (leitor de tela não enxerga o overlay aria-hidden)", () => {
    render(<CalendarioSemana {...base} aoAlocar={() => {}} />);
    // fixture: bloco r1 começa seg (diaSemana=1) inicioMin=540 → "09:00".
    const celulaOcupada = screen.getByRole("gridcell", {
      name: /segunda 09:00, ocupado: ana, aba \(previsto\)/i,
    });
    expect(celulaOcupada).not.toBeNull();
    // célula livre vizinha não ganha o sufixo de ocupação.
    const celulaLivre = screen.getByRole("gridcell", {
      name: /^segunda 10:00$/i,
    });
    expect(celulaLivre).not.toBeNull();
  });

  test("overlay do bloco é posicionado em unidades fixas (rótulo 6rem + colunas de 5rem), não em % da linha (C3)", () => {
    render(<CalendarioSemana {...base} aoAlocar={() => {}} />);
    // fixture: abertura=08:00 (480min), passoMin=60, bloco inicioMin=540 duracaoMin=60
    // deslocamento = (540-480)/60 = 1 coluna; largura = 60/60 = 1 coluna
    const bloco = screen
      .getByText(/Ana.*aba/)
      .closest('[data-testid="bloco-overlay"]');
    expect(bloco).not.toBeNull();
    // jsdom normaliza a expressão calc() constante para um único valor em rem
    // (6rem rótulo + 1*5rem coluna = 11rem; largura 1*5rem = 5rem).
    expect((bloco as HTMLElement).style.left).toBe("calc(11rem)");
    expect((bloco as HTMLElement).style.width).toBe("calc(5rem)");
  });
});
