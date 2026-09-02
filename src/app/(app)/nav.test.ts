import { describe, expect, it } from "vitest";
import { montarNav, type MontarNavInput } from "./nav";

// #512 · T09 (R-21, R-22, R-23) — oráculo objetivo: os 3 conjuntos exatos de
// itens de nav por papel. #533 (`PR-01`/`PR-02`) — governança do coordenador
// de volta em `itemsAdmin`, com badge.

const nav = (parcial: Partial<MontarNavInput> & { role: string }) =>
  montarNav({
    totalTravadas: 0,
    totalValidacao: 0,
    totalAlertasAbertos: 0,
    ...parcial,
  });

describe("montarNav — T09", () => {
  it("R-21 — coordenador e terapeuta têm a MESMA estrutura de menu diário: Agenda · Sessões(badge) · Pacientes · Relatórios", () => {
    const coordenador = nav({ role: "coordenador", totalTravadas: 3 });
    const terapeuta = nav({ role: "terapeuta", totalTravadas: 3 });

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
    const { itemsNav } = nav({ role: "coordenador", totalTravadas: 7 });
    const sessoes = itemsNav.find((i) => i.href === "/sessoes");
    expect(sessoes?.badge).toBe(7);
    expect(sessoes?.badgeTom).toBe("ia");
  });

  it("R-23 — admin_recepcao NÃO recebe o item Sessões (nem o badge que nunca zera)", () => {
    const { itemsNav } = nav({ role: "admin_recepcao", totalTravadas: 5 });
    expect(itemsNav.find((i) => i.href === "/sessoes")).toBeUndefined();
    expect(itemsNav.map((i) => i.href)).toEqual(["/agenda", "/pacientes"]);
  });

  it("R-22 — Dados da Clínica, Exportar Acervo, Equipe, Assinatura, Dúvidas e Meu Perfil saem do menu diário para itemsAdmin (coordenador)", () => {
    const { itemsNav, itemsAdmin } = nav({ role: "coordenador" });
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
    const { itemsAdmin } = nav({ role: "terapeuta" });
    expect(itemsAdmin.map((i) => i.label)).toEqual(["Dúvidas", "Meu Perfil"]);
  });

  it("Meu Perfil está disponível para todo papel autenticado (D56), inclusive admin_recepcao", () => {
    const { itemsAdmin } = nav({ role: "admin_recepcao" });
    expect(itemsAdmin.map((i) => i.href)).toContain("/perfil");
  });
});

describe("montarNav — governança do coordenador (#533 · PR-01, PR-02)", () => {
  it("coordenador: Validação · Alertas de risco · Supervisão abrem o itemsAdmin, nesta ordem e com estes hrefs", () => {
    const { itemsAdmin } = nav({ role: "coordenador" });
    expect(
      itemsAdmin.slice(0, 3).map(({ href, label }) => ({ href, label })),
    ).toEqual([
      { href: "/validacao", label: "Validação" },
      { href: "/alertas-risco", label: "Alertas de risco" },
      { href: "/supervisao", label: "Supervisão" },
    ]);
  });

  it("R-21 preservada — governança NÃO entra no menu diário do coordenador", () => {
    const { itemsNav } = nav({ role: "coordenador", totalValidacao: 4 });
    expect(itemsNav.map((i) => i.href)).not.toContain("/validacao");
    expect(itemsNav.map((i) => i.href)).not.toContain("/alertas-risco");
    expect(itemsNav.map((i) => i.href)).not.toContain("/supervisao");
  });

  it("badges: Validação carrega totalValidacao (tom 'ia'); Alertas de risco carrega totalAlertasAbertos (tom 'risco'); Supervisão não tem badge", () => {
    const { itemsAdmin } = nav({
      role: "coordenador",
      totalValidacao: 4,
      totalAlertasAbertos: 2,
    });
    const validacao = itemsAdmin.find((i) => i.href === "/validacao");
    const alertas = itemsAdmin.find((i) => i.href === "/alertas-risco");
    const supervisao = itemsAdmin.find((i) => i.href === "/supervisao");
    expect(validacao?.badge).toBe(4);
    expect(validacao?.badgeTom).toBe("ia");
    expect(alertas?.badge).toBe(2);
    expect(alertas?.badgeTom).toBe("risco");
    expect(supervisao?.badge).toBeUndefined();
  });

  it.each(["terapeuta", "admin_recepcao"])(
    "%s não recebe item de governança em nenhum dos dois menus",
    (role) => {
      const { itemsNav, itemsAdmin } = nav({
        role,
        totalValidacao: 9,
        totalAlertasAbertos: 9,
      });
      const hrefs = [...itemsNav, ...itemsAdmin].map((i) => i.href);
      expect(hrefs).not.toContain("/validacao");
      expect(hrefs).not.toContain("/alertas-risco");
      expect(hrefs).not.toContain("/supervisao");
    },
  );
});
