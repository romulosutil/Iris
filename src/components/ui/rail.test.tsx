import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Rail,
  RAIL_LARGURA_COLAPSADA,
  RAIL_LARGURA_EXPANDIDA,
  CHAVE_RAIL_COLAPSADO,
} from "./rail";
import type { NavItem } from "./header";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
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

    it("não renderiza o gatilho quando itemsAdmin está vazio/ausente", () => {
      render(<Rail itemsNav={ITENS} />);
      expect(
        screen.queryByRole("button", { name: /Menu do usuário/i }),
      ).toBeNull();
    });
  });
});
