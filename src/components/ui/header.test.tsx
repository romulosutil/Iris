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
