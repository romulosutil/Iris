import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./header";

afterEach(cleanup);

const ITENS = [{ href: "/agenda", label: "Agenda", active: true }];

describe("Header — papel ativo visível e trocável (R-24, #512)", () => {
  it("mostra o rótulo do papel ativo quando fornecido", () => {
    render(
      <Header
        itemsNav={ITENS}
        papelAtivoRotulo="Coordenação"
        papeisAlternativos={[]}
      />,
    );
    expect(screen.getAllByText("Coordenação").length).toBeGreaterThan(0);
  });

  it("não mostra nenhuma seção de papel quando o rótulo não é fornecido (coordenador solo sem prop)", () => {
    render(<Header itemsNav={ITENS} />);
    expect(screen.queryByText("Papel:")).toBeNull();
    expect(screen.queryByText("Papel Ativo")).toBeNull();
  });

  it("combo disjunto: mostra botão de troca por papel alternativo e aciona onTrocarPapel", async () => {
    const aoTrocar = vi.fn();
    render(
      <Header
        itemsNav={ITENS}
        papelAtivoRotulo="Recepção"
        papeisAlternativos={[{ valor: "terapeuta", rotulo: "Terapeuta" }]}
        onTrocarPapel={aoTrocar}
      />,
    );

    const usuario = userEvent.setup();
    const botoes = screen.getAllByRole("button", {
      name: "Entrar como Terapeuta",
    });
    await usuario.click(botoes[0]!);
    expect(aoTrocar).toHaveBeenCalledWith("terapeuta");
  });

  it("sem combo (papeisAlternativos vazio): não renderiza botão de troca", () => {
    render(
      <Header
        itemsNav={ITENS}
        papelAtivoRotulo="Coordenação"
        papeisAlternativos={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Entrar como/ })).toBeNull();
  });
});

describe("Header — a navegação horizontal do topo foi removida", () => {
  it("não renderiza mais o landmark `Navegação principal` (ele é do Rail agora)", () => {
    render(<Header itemsNav={ITENS} />);
    // Antes, este landmark existia DUAS vezes em desktop — aqui e no `Rail` —
    // com o mesmo nome acessível: quem navega por landmarks via leitor de tela
    // via duas "Navegação principal" com os mesmos destinos.
    expect(
      screen.queryByRole("navigation", { name: "Navegação principal" }),
    ).toBeNull();
  });

  it("continua alimentando a navegação de quem sobrou: BottomNav e Drawer", async () => {
    render(<Header itemsNav={ITENS} />);

    // `BottomNav` (abaixo de `lg`) segue montada com os destinos…
    const barra = screen.getByRole("navigation", { name: "Navegação rápida" });
    expect(barra.querySelectorAll("a").length).toBeGreaterThan(0);

    // …e o Drawer, cujo único gatilho é a própria barra, também.
    const usuario = userEvent.setup();
    await usuario.click(
      screen.getByRole("button", { name: "Abrir menu de navegação" }),
    );
    const drawerNav = screen.getByRole("navigation", {
      name: "Navegação mobile",
    });
    expect(drawerNav.querySelectorAll("a").length).toBe(ITENS.length);
  });
});
