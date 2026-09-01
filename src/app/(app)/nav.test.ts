import { describe, expect, it } from "vitest";
import { montarNav } from "./nav";

// #512 · T09 (R-21, R-22, R-23) — oráculo objetivo: os 3 conjuntos exatos de
// itens de nav por papel.

describe("montarNav — T09", () => {
  it("R-21 — coordenador e terapeuta têm a MESMA estrutura de menu diário: Agenda · Sessões(badge) · Pacientes · Relatórios", () => {
    const coordenador = montarNav({ role: "coordenador", totalTravadas: 3 });
    const terapeuta = montarNav({ role: "terapeuta", totalTravadas: 3 });

    const semBadge = (itens: typeof coordenador.itemsNav) =>
      itens.map(({ href, label }) => ({ href, label }));

    expect(semBadge(coordenador.itemsNav)).toEqual([
      { href: "/agenda", label: "Agenda" },
      { href: "/sessoes", label: "Sessões" },
      { href: "/pacientes", label: "Pacientes" },
      { href: "/relatorios", label: "Relatórios" },
    ]);
    expect(semBadge(coordenador.itemsNav)).toEqual(
      semBadge(terapeuta.itemsNav),
    );
  });

  it("R-12/R-13 — o badge de Sessões é a MESMA contagem recebida (contarTravadas), sem recontar", () => {
    const { itemsNav } = montarNav({ role: "coordenador", totalTravadas: 7 });
    const sessoes = itemsNav.find((i) => i.href === "/sessoes");
    expect(sessoes?.badge).toBe(7);
    expect(sessoes?.badgeTom).toBe("ia");
  });

  it("R-23 — admin_recepcao NÃO recebe o item Sessões (nem o badge que nunca zera)", () => {
    const { itemsNav } = montarNav({
      role: "admin_recepcao",
      totalTravadas: 5,
    });
    expect(itemsNav.find((i) => i.href === "/sessoes")).toBeUndefined();
    expect(itemsNav.map((i) => i.href)).toEqual(["/agenda", "/pacientes"]);
  });

  it("R-22 — Dados da Clínica, Exportar Acervo, Equipe, Assinatura, Dúvidas e Meu Perfil saem do menu diário para itemsAdmin (coordenador)", () => {
    const { itemsNav, itemsAdmin } = montarNav({
      role: "coordenador",
      totalTravadas: 0,
    });
    const rotulosProibidosNaNavDiaria = [
      "Dados da Clínica",
      "Exportar Acervo",
      "Equipe",
      "Assinatura",
      "Dúvidas",
      "Meu Perfil",
    ];
    for (const rotulo of rotulosProibidosNaNavDiaria) {
      expect(itemsNav.some((i) => i.label === rotulo)).toBe(false);
    }
    expect(itemsAdmin.map((i) => i.label)).toEqual(
      expect.arrayContaining(rotulosProibidosNaNavDiaria),
    );
  });

  it("R-22 — terapeuta não vê itens de administração de clínica (só Dúvidas e Meu Perfil)", () => {
    const { itemsAdmin } = montarNav({ role: "terapeuta", totalTravadas: 0 });
    expect(itemsAdmin.map((i) => i.label)).toEqual(["Dúvidas", "Meu Perfil"]);
  });

  it("Meu Perfil está disponível para todo papel autenticado (D56), inclusive admin_recepcao", () => {
    const { itemsAdmin } = montarNav({
      role: "admin_recepcao",
      totalTravadas: 0,
    });
    expect(itemsAdmin.map((i) => i.href)).toContain("/perfil");
  });
});
