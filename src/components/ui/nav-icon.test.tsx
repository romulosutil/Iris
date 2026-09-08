import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { IconeDaRota, temIconeDeRota } from "@/components/ui/nav-icon";

afterEach(cleanup);

/**
 * O oráculo que cobra ícone para TODO destino que `montarNav` produz mora em
 * `src/app/(app)/nav-icone.test.ts`: a camada de componentes não pode importar
 * de `src/app` (regra `fronteira/sem-import-de-app`), e é do lado da app que a
 * lista de destinos por papel é decidida.
 */
describe("temIconeDeRota", () => {
  it("resolve os destinos do menu diário", () => {
    for (const href of ["/agenda", "/sessoes", "/pacientes", "/relatorios"]) {
      expect(temIconeDeRota(href), href).toBe(true);
    }
  });

  it("ignora query e hash — a Agenda navega com `?escala=`", () => {
    expect(temIconeDeRota("/agenda?escala=semana")).toBe(true);
    expect(temIconeDeRota("/agenda#hoje")).toBe(true);
  });

  it("cai no ancestral mais específico em rota aninhada", () => {
    expect(temIconeDeRota("/pacientes/abc-123/timeline")).toBe(true);
    // `/clinica` não está no mapa; `/clinica/dados` e `/clinica/exportacao`
    // estão — o corte tem de ser por segmento, não por prefixo de string.
    expect(temIconeDeRota("/clinica")).toBe(false);
    expect(temIconeDeRota("/clinica/dados")).toBe(true);
    expect(temIconeDeRota("/clinica/exportacao")).toBe(true);
  });

  it("devolve false (e não estoura) para entrada desconhecida ou inválida", () => {
    expect(temIconeDeRota("/rota-que-nao-existe")).toBe(false);
    expect(temIconeDeRota("")).toBe(false);
    expect(temIconeDeRota("https://exemplo.test/agenda")).toBe(false);
    // `..` como segmento não pode virar chave do mapa por acidente.
    expect(temIconeDeRota("/../agenda")).toBe(false);
  });
});

describe("IconeDaRota", () => {
  it("desenha o SVG do destino, sempre fora da árvore de acessibilidade", () => {
    const { container } = render(
      <IconeDaRota href="/agenda" size={20} className="marca-teste" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // R-26 — o ícone é decorativo; quem nomeia o destino é o rótulo/`aria-label`
    // do link que o envolve. Se isto passar a `false`, o leitor de tela começa
    // a anunciar um gráfico sem nome no meio da navegação.
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(svg!.getAttribute("focusable")).toBe("false");
    expect(svg!.getAttribute("class")).toContain("marca-teste");
  });

  it("dá lugar ao fallback quando a rota é desconhecida", () => {
    const { container } = render(
      <IconeDaRota
        href="/rota-que-nao-existe"
        fallback={<span data-testid="fallback">RN</span>}
      />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-testid='fallback']")).not.toBeNull();
  });

  it("sem fallback, não desenha nada — nunca um espaço com lixo", () => {
    const { container } = render(<IconeDaRota href="/rota-que-nao-existe" />);
    expect(container.innerHTML).toBe("");
  });

  it("dá formas DIFERENTES a Pacientes e Equipe", () => {
    // Os dois são "pessoas" e ficam a um clique um do outro no rail; forma
    // igual apagaria a distinção que o rótulo faz.
    const pacientes = render(<IconeDaRota href="/pacientes" />);
    const pacientesSvg = pacientes.container.innerHTML;
    cleanup();
    const equipe = render(<IconeDaRota href="/equipe" />);
    expect(equipe.container.innerHTML).not.toBe(pacientesSvg);
  });
});
