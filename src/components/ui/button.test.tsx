import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

/**
 * O que estes casos discriminam:
 *
 * 1. **`asChild` não engole handlers do Button.** A versão com bug
 *    desestruturava `onClick` fora de `...props` antes do spread no
 *    `cloneElement`: `<Button asChild onClick={fn}>` renderizava sem erro
 *    e nunca disparava o handler.
 * 2. **Handlers do filho são compostos, não clobberados.** Se o filho já
 *    tem `onClick` próprio, os dois devem rodar (filho primeiro, padrão
 *    Radix Slot); `event.preventDefault()` no filho cancela o do Button.
 * 3. **Ref chega no elemento real do filho** (ex.: `<a>`), e um ref que o
 *    próprio filho carrega não é descartado.
 */

describe("Button asChild", () => {
  it("dispara onClick passado ao Button", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(
      <Button asChild onClick={aoClicar}>
        <a href="#">Voltar ao início</a>
      </Button>,
    );
    await user.click(screen.getByRole("link", { name: "Voltar ao início" }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("compõe onClick do filho com o do Button (filho primeiro)", async () => {
    const user = userEvent.setup();
    const ordem: string[] = [];
    render(
      <Button asChild onClick={() => ordem.push("button")}>
        <a href="#" onClick={() => ordem.push("filho")}>
          Voltar
        </a>
      </Button>,
    );
    await user.click(screen.getByRole("link", { name: "Voltar" }));
    expect(ordem).toEqual(["filho", "button"]);
  });

  it("preventDefault no filho cancela o handler do Button", async () => {
    const user = userEvent.setup();
    const doButton = vi.fn();
    render(
      <Button asChild onClick={doButton}>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Voltar
        </a>
      </Button>,
    );
    await user.click(screen.getByRole("link", { name: "Voltar" }));
    expect(doButton).not.toHaveBeenCalled();
  });

  it("entrega o ref do Button e preserva o ref próprio do filho", () => {
    const refDoButton = React.createRef<HTMLElement>();
    const refDoFilho = React.createRef<HTMLAnchorElement>();
    render(
      <Button asChild ref={refDoButton}>
        <a href="#" ref={refDoFilho}>
          Voltar
        </a>
      </Button>,
    );
    expect(refDoButton.current).toBeInstanceOf(HTMLAnchorElement);
    expect(refDoFilho.current).toBeInstanceOf(HTMLAnchorElement);
    expect(refDoButton.current).toBe(refDoFilho.current);
  });

  it("mescla className do Button com a do filho", () => {
    render(
      <Button asChild className="do-button">
        <a href="#" className="do-filho">
          Voltar
        </a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Voltar" });
    expect(link.className).toContain("do-button");
    expect(link.className).toContain("do-filho");
  });

  it("disabled bloqueia clique/navegação, marca aria-disabled e tira do tab", async () => {
    const user = userEvent.setup();
    const doButton = vi.fn();
    const doFilho = vi.fn();
    render(
      <Button asChild disabled onClick={doButton}>
        <a href="#" onClick={doFilho}>
          Voltar
        </a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Voltar" });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("tabindex")).toBe("-1");
    await user.click(link);
    expect(doButton).not.toHaveBeenCalled();
    expect(doFilho).not.toHaveBeenCalled();
  });

  it("isLoading marca aria-busy e não dispara onClick", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(
      <Button asChild isLoading onClick={aoClicar}>
        <a href="#">Salvar</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Salvar" });
    expect(link.getAttribute("aria-busy")).toBe("true");
    await user.click(link);
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it("filho <button> recebe type=button por padrão (não submete form)", () => {
    render(
      <Button asChild>
        <button>Cancelar</button>
      </Button>,
    );
    const botao = screen.getByRole("button", { name: "Cancelar" });
    expect(botao.getAttribute("type")).toBe("button");
  });

  it("onClick do Button sobrevive a onClick={undefined} no filho", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(
      <Button asChild onClick={aoClicar}>
        <a href="#" onClick={undefined}>
          Voltar
        </a>
      </Button>,
    );
    await user.click(screen.getByRole("link", { name: "Voltar" }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("cleanup de callback ref do filho roda no unmount (React 19)", () => {
    const limpeza = vi.fn();
    const { unmount } = render(
      <Button asChild>
        <a href="#" ref={() => limpeza}>
          Voltar
        </a>
      </Button>,
    );
    expect(limpeza).not.toHaveBeenCalled();
    unmount();
    expect(limpeza).toHaveBeenCalledTimes(1);
  });
});

describe("Button sem asChild", () => {
  it("segue disparando onClick normalmente", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(<Button onClick={aoClicar}>Salvar</Button>);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });
});
