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
  dias: [
    "2026-07-13",
    "2026-07-14",
    "2026-07-15",
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
  ],
  passoMin: 30,
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
    const { container } = render(<CalendarioSemana {...base} aoAlocar={() => {}} />);
    expect(screen.getByRole("grid")).not.toBeNull();
    await semViolacoes(container);
  });

  test("clicar célula livre dispara aoAlocar com dia e minuto", async () => {
    const aoAlocar = vi.fn();
    render(<CalendarioSemana {...base} aoAlocar={aoAlocar} />);
    // célula seg 10:00 (livre)
    await userEvent.click(screen.getByRole("gridcell", { name: /segunda.*10:00/i }));
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
    const celulaInicial = screen.getByRole("gridcell", { name: /segunda.*08:00/i });
    celulaInicial.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{Enter}");
    expect(aoAlocar).toHaveBeenCalledWith(1, 600);
  });
});
