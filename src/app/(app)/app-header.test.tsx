import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RAIL_LARGURA_COLAPSADA,
  RAIL_LARGURA_EXPANDIDA,
} from "@/components/ui/rail";
import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/alertas-risco"),
}));

// #533 — o cálculo "governança ativa" (`/validacao` acesa em `/alertas-risco`)
// saiu do `AppHeader`: cada superfície de governança é item próprio em
// `itemsAdmin` (`nav.ts`) e acende pela régua exata/subcaminho comum.
describe("AppHeader", () => {
  it("em /alertas-risco, acende o item de administração 'Alertas de risco' — e NÃO o de Validação", () => {
    render(
      <AppHeader
        clinicas={[{ clinicId: "c1", nome: "Clínica Teste" }]}
        ativaId="c1"
        role="coordenador"
        itemsNav={[
          { href: "/agenda", label: "Agenda" },
          { href: "/relatorios", label: "Relatórios" },
        ]}
        itemsAdmin={[
          { href: "/validacao", label: "Validação", badge: 2, badgeTom: "ia" },
          {
            href: "/alertas-risco",
            label: "Alertas de risco",
            badge: 1,
            badgeTom: "risco",
          },
          { href: "/supervisao", label: "Supervisão" },
        ]}
        signOutSlot={null}
      />,
    );

    // Os itens de administração vivem no menu do usuário do rail, fechado por
    // padrão — abrir é parte do caminho real até eles.
    fireEvent.click(
      screen.getByRole("button", { name: "Menu do usuário — Administração" }),
    );

    const [alertasLink] = screen.getAllByRole("link", {
      name: "Alertas de risco",
    });
    expect(alertasLink).toBeDefined();
    expect(alertasLink?.getAttribute("aria-current")).toBe("page");

    const [validacaoLink] = screen.getAllByRole("link", {
      name: "Validação",
    });
    expect(validacaoLink).toBeDefined();
    expect(validacaoLink?.getAttribute("aria-current")).toBeNull();

    const [relatoriosLink] = screen.getAllByRole("link", {
      name: "Relatórios",
    });
    expect(relatoriosLink?.getAttribute("aria-current")).toBeNull();
  });
});

describe("AppHeader — coluna reservada para o rail fixo", () => {
  const props = {
    clinicas: [{ clinicId: "c1", nome: "Clínica Teste" }],
    ativaId: "c1",
    role: "coordenador",
    itemsNav: [{ href: "/agenda", label: "Agenda" }],
    signOutSlot: null,
  };

  function colunaDeConteudo(): HTMLElement {
    // O conteúdo é irmão do rail; o rail está fora do fluxo (`fixed`), então
    // é esta coluna que reserva a faixa da esquerda.
    const coluna = document.querySelector<HTMLElement>(
      "[style*='--rail-largura']",
    );
    if (!coluna) throw new Error("coluna de conteúdo não encontrada");
    return coluna;
  }

  it("expõe a largura do rail expandido em `--rail-largura`", () => {
    render(<AppHeader {...props} />);
    expect(colunaDeConteudo().style.getPropertyValue("--rail-largura")).toBe(
      `${RAIL_LARGURA_EXPANDIDA}px`,
    );
  });

  it("ao colapsar o rail, a reserva do conteúdo acompanha na MESMA passada", async () => {
    render(<AppHeader {...props} />);

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Recolher menu" }));

    // O par que o rail `fixed` torna obrigatório: se só o rail encolhesse,
    // sobraria uma faixa vazia de 168px entre ele e o conteúdo; se só a
    // reserva encolhesse, o rail comeria a primeira coluna da página.
    expect(colunaDeConteudo().style.getPropertyValue("--rail-largura")).toBe(
      `${RAIL_LARGURA_COLAPSADA}px`,
    );
    expect(
      screen.getByRole("navigation", { name: "Navegação principal" }).style
        .width,
    ).toBe(`${RAIL_LARGURA_COLAPSADA}px`);
  });
});
