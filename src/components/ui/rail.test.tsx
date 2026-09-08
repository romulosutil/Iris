import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Rail,
  RAIL_LARGURA_COLAPSADA,
  RAIL_LARGURA_EXPANDIDA,
  CHAVE_RAIL_COLAPSADO,
  larguraRail,
  _resetRailParaTeste,
} from "./rail";
import type { NavItem } from "./header";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  _resetRailParaTeste();
});

const ITENS: NavItem[] = [
  {
    href: "/validacao",
    label: "Central de Validação",
    badge: 3,
    badgeTom: "ia",
    active: true,
  },
  { href: "/agenda", label: "Agenda" },
  { href: "/pacientes", label: "Pacientes" },
];

function larguraDoRail(): string | null {
  const nav = screen.getByRole("navigation", { name: "Navegação principal" });
  return nav.style.width || null;
}

describe("Rail — fixo à viewport, não à página", () => {
  it("o rail é `fixed` e mede a altura do DISPOSITIVO (`h-dvh`), não a da página", () => {
    render(<Rail itemsNav={ITENS} />);
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const classes = nav.className.split(/\s+/);

    // Regressão do bug relatado: o rail era um filho `flex` de uma coluna
    // `min-h-dvh` e esticava com o conteúdo — numa lista longa, os itens
    // saíam da tela junto com o scroll e o rodapé (menu do usuário, `Sair`)
    // só voltava no fim do documento.
    expect(classes).toContain("fixed");
    expect(classes).toContain("h-dvh");
    expect(classes).toContain("top-0");
    expect(classes).toContain("left-0");
    // Fora do fluxo, ele não pode mais reservar a própria coluna: quem faz
    // isso é o `padding-left` do conteúdo em `AppHeader`.
    expect(classes).not.toContain("shrink-0");
    // Abaixo do overlay (`z-40`) e do painel (`z-50`) de Dialog/Drawer: um
    // rail por cima de um modal continuaria clicável com o modal aberto.
    expect(classes).toContain("z-30");
  });

  it("`larguraRail` é a fonte única das duas larguras", () => {
    expect(larguraRail(false)).toBe(RAIL_LARGURA_EXPANDIDA);
    expect(larguraRail(true)).toBe(RAIL_LARGURA_COLAPSADA);
  });

  it("modo controlado: a prop `colapsado` vence o estado persistido", () => {
    localStorage.setItem(CHAVE_RAIL_COLAPSADO, "1");
    render(<Rail itemsNav={ITENS} colapsado={false} onAlternar={() => {}} />);
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_EXPANDIDA}px`);
  });

  it("modo controlado: alternar chama `onAlternar` e NÃO grava sozinho — quem manda é o dono do estado", async () => {
    const aoAlternar = vi.fn();
    render(<Rail itemsNav={ITENS} colapsado={false} onAlternar={aoAlternar} />);

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Recolher menu" }));

    expect(aoAlternar).toHaveBeenCalledTimes(1);
    // Controlado, o rail não muda de largura por conta própria: ele espera a
    // prop voltar. Se largasse o próprio estado aqui, o `padding-left` do
    // conteúdo (que vem do estado de fora) ficaria dessincronizado do rail.
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_EXPANDIDA}px`);
    expect(localStorage.getItem(CHAVE_RAIL_COLAPSADO)).toBeNull();
  });
});

describe("Rail — T08 (R-24 … R-27)", () => {
  it("nasce expandido (236px) quando não há preferência salva", () => {
    render(<Rail itemsNav={ITENS} />);
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_EXPANDIDA}px`);
    // Expandido: o rótulo completo é texto visível, não só o `aria-label`.
    expect(screen.getByText("Central de Validação")).toBeDefined();
  });

  it("R-25 — lê o estado colapsado persistido em localStorage no mount", () => {
    localStorage.setItem(CHAVE_RAIL_COLAPSADO, "1");
    render(<Rail itemsNav={ITENS} />);
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_COLAPSADA}px`);
    // Colapsado: o texto completo do rótulo não é mais um nó de texto visível.
    expect(screen.queryByText("Central de Validação")).toBeNull();
  });

  it("R-25 — o teste que a maioria esquece: localStorage.getItem lança (janela anônima) e a UI cai no default expandido sem quebrar", () => {
    const getItemEspiao = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("acesso negado a localStorage", "SecurityError");
      });

    expect(() => render(<Rail itemsNav={ITENS} />)).not.toThrow();
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_EXPANDIDA}px`);
    expect(screen.getByText("Central de Validação")).toBeDefined();

    getItemEspiao.mockRestore();
  });

  it("R-25 — alternar o rail grava a preferência em localStorage sem quebrar quando setItem lança", async () => {
    const setItemEspiao = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota excedida", "QuotaExceededError");
      });

    render(<Rail itemsNav={ITENS} />);
    const usuario = userEvent.setup();
    await expect(
      usuario.click(screen.getByRole("button", { name: /Recolher menu/i })),
    ).resolves.not.toThrow();
    // A gravação falhou, mas o estado em memória do componente muda mesmo assim.
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_COLAPSADA}px`);

    setItemEspiao.mockRestore();
  });

  it("alterna entre expandido e colapsado e persiste em localStorage", async () => {
    render(<Rail itemsNav={ITENS} />);
    const usuario = userEvent.setup();

    const botao = screen.getByRole("button", { name: /Recolher menu/i });
    expect(botao.getAttribute("aria-expanded")).toBe("true");

    await usuario.click(botao);
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_COLAPSADA}px`);
    expect(localStorage.getItem(CHAVE_RAIL_COLAPSADO)).toBe("1");
    expect(
      screen
        .getByRole("button", { name: /Expandir menu/i })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    await usuario.click(screen.getByRole("button", { name: /Expandir menu/i }));
    expect(larguraDoRail()).toBe(`${RAIL_LARGURA_EXPANDIDA}px`);
    expect(localStorage.getItem(CHAVE_RAIL_COLAPSADO)).toBe("0");
  });

  it("R-26 — alvo de toque permanece ≥44px colapsado (itens e botão de alternância)", async () => {
    render(<Rail itemsNav={ITENS} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /Recolher menu/i }));

    const link = screen.getByRole("link", { name: "Central de Validação" });
    expect(link.className).toMatch(/min-h-11/);
    expect(link.className).toMatch(/min-w-11/);

    const botao = screen.getByRole("button", { name: /Expandir menu/i });
    expect(botao.className).toMatch(/min-h-11/);
    expect(botao.className).toMatch(/min-w-11/);
  });

  it("R-26 — cada item carrega aria-label e tooltip (title) mesmo colapsado, ícone nunca é o único portador de significado", async () => {
    render(<Rail itemsNav={ITENS} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /Recolher menu/i }));

    const link = screen.getByRole("link", { name: "Central de Validação" });
    expect(link.getAttribute("aria-label")).toBe("Central de Validação");
    expect(link.getAttribute("title")).toBe("Central de Validação");
  });

  it("R-26 — o badge continua visível quando o rail está colapsado", async () => {
    render(<Rail itemsNav={ITENS} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /Recolher menu/i }));
    expect(screen.getByText("3")).toBeDefined();
  });

  it("marca a rota ativa com aria-current", () => {
    render(<Rail itemsNav={ITENS} />);
    expect(
      screen
        .getByRole("link", { name: "Central de Validação" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Agenda" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("usa renderLink quando fornecido", () => {
    render(
      <Rail
        itemsNav={ITENS}
        renderLink={(item, children, className) => (
          <a
            key={item.href}
            href={item.href}
            className={className}
            data-custom="1"
          >
            {children}
          </a>
        )}
      />,
    );
    expect(screen.getAllByRole("link")[0]?.getAttribute("data-custom")).toBe(
      "1",
    );
  });

  it("não renderiza nada quando não há itens", () => {
    const { container } = render(<Rail itemsNav={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("mostra o slot de sair no rodapé", () => {
    render(<Rail itemsNav={ITENS} signOutSlot={<button>Sair</button>} />);
    expect(screen.getByRole("button", { name: "Sair" })).toBeDefined();
  });

  describe("R-22 — menu de administração no rodapé", () => {
    const ITENS_ADMIN: NavItem[] = [
      { href: "/equipe", label: "Equipe" },
      { href: "/clinica/dados", label: "Dados da Clínica" },
      { href: "/perfil", label: "Meu Perfil" },
    ];

    it("não abre nenhum item de administração até o gatilho ser acionado", () => {
      render(<Rail itemsNav={ITENS} itemsAdmin={ITENS_ADMIN} />);
      expect(screen.queryByRole("link", { name: "Equipe" })).toBeNull();
      expect(
        screen.getByRole("button", { name: /Menu do usuário/i }),
      ).toBeDefined();
    });

    it("abre e lista os itens de administração ao acionar o gatilho", async () => {
      render(<Rail itemsNav={ITENS} itemsAdmin={ITENS_ADMIN} />);
      const usuario = userEvent.setup();
      await usuario.click(
        screen.getByRole("button", { name: /Menu do usuário/i }),
      );
      expect(screen.getByText("Equipe")).toBeDefined();
      expect(screen.getByText("Dados da Clínica")).toBeDefined();
      expect(screen.getByText("Meu Perfil")).toBeDefined();
    });

    it("usa renderAdminLink quando fornecido", async () => {
      render(
        <Rail
          itemsNav={ITENS}
          itemsAdmin={ITENS_ADMIN}
          renderAdminLink={(item, children, className) => (
            <a
              key={item.href}
              href={item.href}
              className={className}
              data-custom-admin="1"
            >
              {children}
            </a>
          )}
        />,
      );
      const usuario = userEvent.setup();
      await usuario.click(
        screen.getByRole("button", { name: /Menu do usuário/i }),
      );
      expect(
        screen.getByText("Equipe").closest("[data-custom-admin]"),
      ).toBeDefined();
    });

    // #533 (revisão pós-PR) — a governança saiu da nav diária e virou item de
    // `itemsAdmin`. Se o item de administração não acender pela mesma régua,
    // ficar em `/alertas-risco` deixa o rail SEM nenhum item ativo.
    it("acende o item de administração ativo e carrega aria-current", async () => {
      const ADMIN_ATIVO: NavItem[] = [
        { href: "/alertas-risco", label: "Alertas de risco", active: true },
        { href: "/equipe", label: "Equipe" },
      ];
      render(
        <Rail
          itemsNav={[{ href: "/agenda", label: "Agenda" }]}
          itemsAdmin={ADMIN_ATIVO}
        />,
      );
      const usuario = userEvent.setup();
      await usuario.click(
        screen.getByRole("button", { name: /Menu do usuário/i }),
      );
      const ativo = screen.getByRole("link", { name: "Alertas de risco" });
      expect(ativo.getAttribute("aria-current")).toBe("page");
      expect(ativo.className).toContain("--brand-tint");
      const inerte = screen.getByRole("link", { name: "Equipe" });
      expect(inerte.getAttribute("aria-current")).toBeNull();
      expect(inerte.className).not.toContain("--brand-tint");
    });

    // Popover fechado é o estado normal: o gatilho é o único âncora visível.
    it("marca o gatilho quando a rota atual mora na Administração", () => {
      const { unmount } = render(
        <Rail
          itemsNav={[{ href: "/agenda", label: "Agenda" }]}
          itemsAdmin={[{ href: "/equipe", label: "Equipe", active: true }]}
        />,
      );
      expect(
        screen
          .getByRole("button", { name: /Menu do usuário/i })
          .getAttribute("data-secao-ativa"),
      ).toBe("true");
      unmount();

      render(
        <Rail
          itemsNav={[{ href: "/agenda", label: "Agenda", active: true }]}
          itemsAdmin={[{ href: "/equipe", label: "Equipe" }]}
        />,
      );
      expect(
        screen
          .getByRole("button", { name: /Menu do usuário/i })
          .getAttribute("data-secao-ativa"),
      ).toBeNull();
    });

    it("não renderiza o gatilho quando itemsAdmin está vazio/ausente", () => {
      render(<Rail itemsNav={ITENS} />);
      expect(
        screen.queryByRole("button", { name: /Menu do usuário/i }),
      ).toBeNull();
    });
  });
});
