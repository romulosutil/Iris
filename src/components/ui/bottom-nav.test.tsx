import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav, MAX_ITENS_BOTTOM_NAV } from "./bottom-nav";
import type { NavItem } from "./header";

const ITENS_COORDENADOR: NavItem[] = [
  {
    href: "/validacao",
    label: "Central de Validação",
    labelCurto: "Validação",
    badge: 3,
    badgeTom: "ia",
  },
  { href: "/agenda", label: "Agenda", active: true },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/equipe", label: "Equipe" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/duvidas", label: "Dúvidas" },
  { href: "/perfil", label: "Meu Perfil" },
];

describe("BottomNav", () => {
  it("mostra no máximo 4 destinos, na ordem recebida", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(MAX_ITENS_BOTTOM_NAV);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/validacao",
      "/agenda",
      "/pacientes",
      "/equipe",
    ]);
  });

  it("usa labelCurto no texto visível e label completo no nome acessível", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);

    const link = screen.getByRole("link", { name: /Central de Validação/ });
    expect(link.textContent).toContain("Validação");
    expect(link.textContent).not.toContain("Central de Validação");
  });

  it("cai no label quando não há labelCurto", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Agenda/ }).textContent).toContain(
      "Agenda",
    );
  });

  it("marca a rota ativa com aria-current", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: /Agenda/ }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: /Pacientes/ })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("mostra a contagem da fila quando maior que zero", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("omite a contagem quando é zero", () => {
    const itens = ITENS_COORDENADOR.map((i) =>
      i.href === "/validacao" ? { ...i, badge: 0 } : i,
    );
    render(<BottomNav items={itens} onAbrirMenu={vi.fn()} />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("aciona onAbrirMenu no botão de menu", async () => {
    const abrir = vi.fn();
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={abrir} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Abrir menu de navegação" }),
    );
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("usa renderLink quando fornecido", () => {
    render(
      <BottomNav
        items={ITENS_COORDENADOR}
        onAbrirMenu={vi.fn()}
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
    const { container } = render(
      <BottomNav items={[]} onAbrirMenu={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
