import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuAcoes, type MenuAcaoItem } from "./menu-acoes";

function itens(overrides: Partial<MenuAcaoItem>[] = []): MenuAcaoItem[] {
  const base: MenuAcaoItem[] = [
    { id: "a", rotulo: "Resolver", aoSelecionar: () => {} },
    { id: "b", rotulo: "Descartar", aoSelecionar: () => {} },
    { id: "c", rotulo: "Arquivar", aoSelecionar: () => {} },
  ];
  return base.map((item, i) => ({ ...item, ...(overrides[i] ?? {}) }));
}

describe("MenuAcoes", () => {
  it("não renderiza nada quando não há ação secundária", () => {
    const { container } = render(<MenuAcoes itens={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("declara o contrato ARIA de menu button", async () => {
    const usuario = userEvent.setup();
    render(<MenuAcoes itens={itens()} />);

    const gatilho = screen.getByRole("button", { name: "Mais ações" });
    expect(gatilho.getAttribute("aria-haspopup")).toBe("menu");
    expect(gatilho.getAttribute("aria-expanded")).toBe("false");
    expect(gatilho.getAttribute("aria-controls")).toBeNull();

    await usuario.click(gatilho);

    const menu = screen.getByRole("menu");
    expect(gatilho.getAttribute("aria-expanded")).toBe("true");
    expect(gatilho.getAttribute("aria-controls")).toBe(menu.id);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("percorre os itens em ciclo com as setas e vai às pontas com Home/End", async () => {
    const usuario = userEvent.setup();
    render(<MenuAcoes itens={itens()} />);

    screen.getByRole("button", { name: "Mais ações" }).focus();
    await usuario.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Resolver");

    await usuario.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toBe("Arquivar");

    await usuario.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Resolver");

    await usuario.keyboard("{End}");
    expect(document.activeElement?.textContent).toBe("Arquivar");

    await usuario.keyboard("{Home}");
    expect(document.activeElement?.textContent).toBe("Resolver");
  });

  it("pula itens desabilitados na navegação por teclado", async () => {
    const usuario = userEvent.setup();
    render(<MenuAcoes itens={itens([{}, { desabilitado: true }])} />);

    screen.getByRole("button", { name: "Mais ações" }).focus();
    await usuario.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Arquivar");
  });

  it("Escape fecha o menu e devolve o foco ao gatilho", async () => {
    const usuario = userEvent.setup();
    render(<MenuAcoes itens={itens()} />);

    const gatilho = screen.getByRole("button", { name: "Mais ações" });
    await usuario.click(gatilho);
    expect(screen.getByRole("menu")).toBeDefined();

    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it("fecha antes de executar a ação selecionada", async () => {
    const usuario = userEvent.setup();
    const ordem: string[] = [];
    const aoSelecionar = vi.fn(() => {
      ordem.push(screen.queryByRole("menu") ? "menu-aberto" : "menu-fechado");
    });

    render(<MenuAcoes itens={itens([{ aoSelecionar }])} />);

    await usuario.click(screen.getByRole("button", { name: "Mais ações" }));
    await usuario.click(screen.getByRole("menuitem", { name: "Resolver" }));

    expect(aoSelecionar).toHaveBeenCalledTimes(1);
    expect(ordem).toEqual(["menu-fechado"]);
  });
});
