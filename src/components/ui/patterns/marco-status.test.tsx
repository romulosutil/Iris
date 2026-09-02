import { afterEach, describe, expect, it } from "vitest";
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MarcoStatus, ROTULO_MARCO_STATUS } from "./marco-status";
import { BarraProgressoEpistemica } from "./barra-progresso-epistemica";

afterEach(cleanup);

describe("MarcoStatus", () => {
  it("anuncia o estado pelo glifo (role=img + aria-label), não por title", () => {
    render(<MarcoStatus estado="conquistado" nome="Aponta para pedir" />);
    const glifo = screen.getByRole("img", {
      name: ROTULO_MARCO_STATUS.conquistado,
    });
    expect(glifo).not.toBeNull();
    // `title` era o único canal na tela antiga (AC-01): não é anunciado por
    // leitor de tela nem aparece no toque. Não pode voltar como único canal.
    expect(glifo.getAttribute("title")).toBeNull();
    expect(screen.getByText("Aponta para pedir").closest("[title]")).toBeNull();
  });

  it("candidato a domínio NÃO usa o violeta de IA (DS-02)", () => {
    const { container } = render(
      <MarcoStatus estado="candidato" nome="Imita gesto" nivel="2" />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain("status-ia");
    expect(html).toContain("status-progresso");
    expect(
      screen.getByRole("img", { name: ROTULO_MARCO_STATUS.candidato }),
    ).not.toBeNull();
  });

  it("não atingido não usa paleta crua (gray-*/black) e mantém contraste por token", () => {
    const { container } = render(
      <MarcoStatus estado="nao_atingido" nome="Responde ao nome" />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/\b(bg|text|border)-gray-\d+\b/);
    expect(html).not.toContain("border-black");
    expect(html).not.toMatch(/text-\[1[01]px\]/);
    expect(
      screen.getByRole("img", { name: ROTULO_MARCO_STATUS.nao_atingido }),
    ).not.toBeNull();
  });

  it("com rotuloVisivel, o texto do estado aparece e o glifo vira decorativo", () => {
    render(<MarcoStatus estado="conquistado" nome="Aponta" rotuloVisivel />);
    expect(screen.getByText(ROTULO_MARCO_STATUS.conquistado)).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("expõe data-estado para o consumidor estilizar por estado sem cor", () => {
    const { container } = render(
      <MarcoStatus estado="candidato" nome="Imita" />,
    );
    expect(container.querySelector('[data-estado="candidato"]')).not.toBeNull();
  });
});

describe("BarraProgressoEpistemica", () => {
  it("é uma imagem nomeada com a leitura completa (conquistados, candidatos, não atingidos)", () => {
    render(
      <BarraProgressoEpistemica
        rotulo="Domínio mando"
        total={6}
        conquistados={3}
        candidatos={1}
      />,
    );
    const barra = screen.getByRole("img");
    const nome = barra.getAttribute("aria-label") ?? "";
    expect(nome).toContain("Domínio mando");
    expect(nome).toContain("3 de 6 conquistados");
    expect(nome).toContain("1 candidato a domínio");
    expect(nome).toContain("2 não atingidos");
  });

  it("o segmento de candidato carrega hachura (padrão não cromático), não só cor", () => {
    const { container } = render(
      <BarraProgressoEpistemica
        rotulo="Domínio tato"
        total={4}
        conquistados={1}
        candidatos={2}
      />,
    );
    const candidato = container.querySelector('[data-segmento="candidato"]');
    expect(candidato).not.toBeNull();
    expect(candidato!.className).toContain("hachura");
    expect((candidato as HTMLElement).style.width).toBe("50%");
    expect(candidato!.getAttribute("title")).toBeNull();
  });

  it("total zero não divide por zero nem inventa progresso", () => {
    const { container } = render(
      <BarraProgressoEpistemica
        rotulo="Domínio vazio"
        total={0}
        conquistados={0}
        candidatos={0}
      />,
    );
    expect(container.querySelector('[data-segmento="conquistado"]')).toBeNull();
    expect(container.querySelector('[data-segmento="candidato"]')).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "0 de 0",
    );
  });
});
