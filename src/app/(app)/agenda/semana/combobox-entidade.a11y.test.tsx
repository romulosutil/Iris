import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { ComboboxEntidade } from "./combobox-entidade";

const opcoes = [
  { id: "1", nome: "Ana Alfa" },
  { id: "2", nome: "Bruno Beta" },
];

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

describe("ComboboxEntidade", () => {
  test("sem violações axe (color-contrast desligado — jsdom sem canvas)", async () => {
    const { container } = render(
      <ComboboxEntidade
        label="Paciente"
        opcoes={opcoes}
        valor={null}
        aoSelecionar={() => {}}
      />,
    );
    await semViolacoes(container);
  });

  test("filtra por texto e seleciona por teclado", async () => {
    const aoSelecionar = vi.fn();
    render(
      <ComboboxEntidade
        label="Paciente"
        opcoes={opcoes}
        valor={null}
        aoSelecionar={aoSelecionar}
      />,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "bru");
    expect(screen.getByRole("option", { name: /Bruno Beta/ })).not.toBeNull();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(aoSelecionar).toHaveBeenCalledWith("2");
  });

  test("Escape fecha a lista", async () => {
    render(
      <ComboboxEntidade
        label="Paciente"
        opcoes={opcoes}
        valor={null}
        aoSelecionar={() => {}}
      />,
    );
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    expect(screen.getByRole("listbox")).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("aria-expanded/aria-controls/aria-activedescendant refletem o estado", async () => {
    render(
      <ComboboxEntidade
        label="Paciente"
        opcoes={opcoes}
        valor={null}
        aoSelecionar={() => {}}
      />,
    );
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    await userEvent.keyboard("{ArrowDown}");
    const opcaoAtiva = screen.getByRole("option", { name: /Ana Alfa/ });
    expect(input.getAttribute("aria-activedescendant")).toBe(opcaoAtiva.id);
    expect(opcaoAtiva.getAttribute("aria-selected")).toBe("true");
  });
});
