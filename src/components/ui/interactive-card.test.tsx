import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InteractiveCard } from "./interactive-card";

/**
 * O que estes casos discriminam (mesmos bugs corrigidos no Button, PR #269):
 *
 * 1. **Ref chega no elemento real do filho** e um ref que o próprio filho
 *    carrega não é descartado — a versão com bug passava `ref` na config do
 *    `cloneElement`, clobberando o ref do filho (React 19: ref é prop comum
 *    e vive em `child.props.ref`).
 * 2. **Handlers não-onClick do filho não são clobberados** — a versão com
 *    bug espalhava `...props` do card por cima das props do filho.
 * 3. **Composição de onClick segue o contrato Radix Slot** — filho roda
 *    primeiro e `event.preventDefault()` no filho cancela o do card.
 */

describe("InteractiveCard asChild", () => {
  it("dispara onClick passado ao card", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(
      <InteractiveCard asChild onClick={aoClicar}>
        <a href="#">Ver plano</a>
      </InteractiveCard>,
    );
    await user.click(screen.getByRole("link", { name: "Ver plano" }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("compõe onClick do filho com o do card (filho primeiro)", async () => {
    const user = userEvent.setup();
    const ordem: string[] = [];
    render(
      <InteractiveCard asChild onClick={() => ordem.push("card")}>
        <a href="#" onClick={() => ordem.push("filho")}>
          Ver plano
        </a>
      </InteractiveCard>,
    );
    await user.click(screen.getByRole("link", { name: "Ver plano" }));
    expect(ordem).toEqual(["filho", "card"]);
  });

  it("preventDefault no filho cancela o handler do card", async () => {
    const user = userEvent.setup();
    const doCard = vi.fn();
    render(
      <InteractiveCard asChild onClick={doCard}>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Ver plano
        </a>
      </InteractiveCard>,
    );
    await user.click(screen.getByRole("link", { name: "Ver plano" }));
    expect(doCard).not.toHaveBeenCalled();
  });

  it("não clobbera handlers não-onClick do filho", async () => {
    const user = userEvent.setup();
    const doCard = vi.fn();
    const doFilho = vi.fn();
    render(
      <InteractiveCard asChild onMouseEnter={doCard}>
        <a href="#" onMouseEnter={doFilho}>
          Ver plano
        </a>
      </InteractiveCard>,
    );
    await user.hover(screen.getByRole("link", { name: "Ver plano" }));
    expect(doFilho).toHaveBeenCalledTimes(1);
    expect(doCard).toHaveBeenCalledTimes(1);
  });

  it("entrega o ref do card e preserva o ref próprio do filho", () => {
    const refDoCard = React.createRef<HTMLElement>();
    const refDoFilho = React.createRef<HTMLAnchorElement>();
    render(
      <InteractiveCard asChild ref={refDoCard}>
        <a href="#" ref={refDoFilho}>
          Ver plano
        </a>
      </InteractiveCard>,
    );
    expect(refDoCard.current).toBeInstanceOf(HTMLAnchorElement);
    expect(refDoFilho.current).toBeInstanceOf(HTMLAnchorElement);
    expect(refDoCard.current).toBe(refDoFilho.current);
  });

  it("cleanup de callback ref do filho roda no unmount (React 19)", () => {
    const limpeza = vi.fn();
    const { unmount } = render(
      <InteractiveCard asChild>
        <a href="#" ref={() => limpeza}>
          Ver plano
        </a>
      </InteractiveCard>,
    );
    expect(limpeza).not.toHaveBeenCalled();
    unmount();
    expect(limpeza).toHaveBeenCalledTimes(1);
  });

  it("mescla className do card com a do filho", () => {
    render(
      <InteractiveCard asChild className="do-card">
        <a href="#" className="do-filho">
          Ver plano
        </a>
      </InteractiveCard>,
    );
    const link = screen.getByRole("link", { name: "Ver plano" });
    expect(link.className).toContain("do-card");
    expect(link.className).toContain("do-filho");
  });

  it("onClick do card sobrevive a onClick={undefined} no filho", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(
      <InteractiveCard asChild onClick={aoClicar}>
        <a href="#" onClick={undefined}>
          Ver plano
        </a>
      </InteractiveCard>,
    );
    await user.click(screen.getByRole("link", { name: "Ver plano" }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("repassa o href do card ao filho sem href próprio", () => {
    render(
      <InteractiveCard asChild href="/plano/1">
        <a>Ver plano</a>
      </InteractiveCard>,
    );
    const link = screen.getByRole("link", { name: "Ver plano" });
    expect(link.getAttribute("href")).toBe("/plano/1");
  });

  it("disabled com href: remove href, marca aria-disabled, tira do tab e bloqueia clique", async () => {
    const user = userEvent.setup();
    const doCard = vi.fn();
    const doFilho = vi.fn();
    render(
      <InteractiveCard asChild href="/plano/1" disabled onClick={doCard}>
        <a onClick={doFilho}>Ver plano</a>
      </InteractiveCard>,
    );
    // Sem href, <a> perde o role de link — busca pelo texto.
    const el = screen.getByText("Ver plano").closest("a")!;
    expect(el.getAttribute("href")).toBeNull();
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.getAttribute("tabindex")).toBe("-1");
    await user.click(el);
    expect(doCard).not.toHaveBeenCalled();
    expect(doFilho).not.toHaveBeenCalled();
  });

  it("disabled com filho <button>: recebe disabled e não dispara clique", async () => {
    const user = userEvent.setup();
    const doCard = vi.fn();
    render(
      <InteractiveCard asChild disabled onClick={doCard}>
        <button>Ver plano</button>
      </InteractiveCard>,
    );
    const botao = screen.getByRole("button", { name: "Ver plano" });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    await user.click(botao);
    expect(doCard).not.toHaveBeenCalled();
  });

  it("injeta accentBar (destacado) e titleHeading (titulo) dentro do filho", () => {
    render(
      <InteractiveCard asChild destacado titulo="Ação Urgente">
        <a href="#">Você tem 1 pendência.</a>
      </InteractiveCard>,
    );
    const link = screen.getByRole("link");
    expect(link.querySelector("[aria-hidden]")).not.toBeNull();
    expect(link.textContent).toContain("Ação Urgente");
    expect(link.textContent).toContain("Você tem 1 pendência.");
  });
});

describe("InteractiveCard sem asChild", () => {
  it("renderiza <a> quando recebe href e dispara onClick", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(
      <InteractiveCard href="#" titulo="Ver no Mapa" onClick={aoClicar}>
        Ir para o link externo.
      </InteractiveCard>,
    );
    await user.click(screen.getByRole("link"));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("renderiza <button type=button> sem href", () => {
    render(<InteractiveCard titulo="Sessão">Conteúdo</InteractiveCard>);
    const botao = screen.getByRole("button");
    expect(botao.getAttribute("type")).toBe("button");
  });
});
