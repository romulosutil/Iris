import { describe, expect, it } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import {
  GraficoEspectro,
  posicaoNoEixo,
  verticesMedidos,
  CENTRO,
  RAIO_MAX,
} from "./grafico-espectro";
import {
  ORDEM_EIXOS,
  ROTULO_EIXO,
  type DadosEixoRadar,
  type ResultadoEspectro,
} from "@/lib/evidence/espectro";

function eixo(
  indice: number,
  patch: Partial<DadosEixoRadar> = {},
): DadosEixoRadar {
  const e = ORDEM_EIXOS[indice]!;
  return {
    eixo: e,
    rotulo: ROTULO_EIXO[e],
    valor: 50,
    alvos: 4,
    medidos: 4,
    dominados: 1,
    candidatos: 0,
    contagemEvidencias: 9,
    ...patch,
  };
}

function espectro(
  eixos: DadosEixoRadar[],
  naoClassificados = 0,
): ResultadoEspectro {
  return { eixos, naoClassificados };
}

const SEIS = espectro([
  eixo(0, { valor: 80, alvos: 5, medidos: 5, dominados: 2 }),
  eixo(1, { valor: 45 }),
  eixo(2, {
    valor: null,
    alvos: 0,
    medidos: 0,
    dominados: 0,
    contagemEvidencias: 0,
  }),
  eixo(3, { valor: 60 }),
  eixo(4, { valor: null, alvos: 3, medidos: 0, dominados: 0 }),
  eixo(5, { valor: 25, candidatos: 2 }),
]);

describe("posicaoNoEixo", () => {
  it("raio cheio no primeiro eixo aponta para o topo", () => {
    const p = posicaoNoEixo(0, 1);
    expect(Math.round(p.x)).toBe(CENTRO);
    expect(Math.round(p.y)).toBe(CENTRO - RAIO_MAX);
  });

  it("raio zero encosta no centro", () => {
    const p = posicaoNoEixo(3, 0);
    expect(Math.round(p.x)).toBe(CENTRO);
    expect(Math.round(p.y)).toBe(CENTRO);
  });

  it("os seis eixos ficam a 60 graus um do outro", () => {
    const p0 = posicaoNoEixo(0, 1);
    const p3 = posicaoNoEixo(3, 1);
    // Vértice oposto: mesma coluna, espelhado em relação ao centro.
    expect(Math.round(p0.y - CENTRO)).toBe(-Math.round(p3.y - CENTRO));
  });
});

describe("verticesMedidos", () => {
  it("desenha o vértice na proporção do valor do eixo", () => {
    const [v] = verticesMedidos([eixo(0, { valor: 100 })]);
    expect(Math.round(v!.y)).toBe(CENTRO - RAIO_MAX);
  });

  it("valor menor fica mais perto do centro", () => {
    const [alto] = verticesMedidos([eixo(0, { valor: 100 })]);
    const [baixo] = verticesMedidos([eixo(0, { valor: 20 })]);
    expect(baixo!.y).toBeGreaterThan(alto!.y);
  });

  it("eixo sem valor não vira vértice — o polígono pula o eixo sem dado", () => {
    // Mutante que este teste mata: tratar `valor: null` como 0. Isso colaria o
    // vértice no centro e o hexágono passaria a afirmar "apoio máximo" onde,
    // na verdade, ninguém mediu nada.
    const vs = verticesMedidos([
      eixo(0, { valor: 70 }),
      eixo(1, { valor: null, medidos: 0 }),
      eixo(2, { valor: 40 }),
    ]);
    expect(vs).toHaveLength(2);
    expect(vs.map((v) => v.eixo)).toEqual([ORDEM_EIXOS[0], ORDEM_EIXOS[2]]);
  });
});

describe("GraficoEspectro", () => {
  it("mostra a porcentagem de cada eixo medido", () => {
    render(<GraficoEspectro espectro={SEIS} sessaoAtiva={7} />);
    // Duas ocorrências de propósito: a grade visível e a tabela `sr-only`,
    // que é a leitura canônica em leitor de tela.
    expect(screen.getAllByText("80%").length).toBe(2);
    expect(screen.getAllByText("45%").length).toBe(2);
  });

  it("distingue eixo sem alvo de eixo com alvo e sem registro", () => {
    render(<GraficoEspectro espectro={SEIS} sessaoAtiva={7} />);
    // Os dois são "não medido", mas pedem ações diferentes: um é lacuna de
    // PEI, o outro é lacuna de registro. Colapsar os dois em "0%" apagaria a
    // diferença e afirmaria desempenho mínimo nos dois casos.
    expect(screen.getAllByText("Sem alvo").length).toBe(2);
    expect(screen.getAllByText("Sem registro").length).toBe(2);
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("nomeia os seis eixos, inclusive os sem dado", () => {
    render(<GraficoEspectro espectro={SEIS} sessaoAtiva={7} />);
    for (const e of ORDEM_EIXOS) {
      expect(screen.getAllByText(ROTULO_EIXO[e]).length).toBe(2);
    }
  });

  it("mostra a variação em relação à sessão anterior", () => {
    const anterior = espectro([
      eixo(0, { valor: 60 }),
      eixo(1, { valor: 45 }),
      eixo(2, { valor: null, alvos: 0, medidos: 0 }),
      eixo(3, { valor: 72 }),
      eixo(4, { valor: null, alvos: 3, medidos: 0 }),
      eixo(5, { valor: 25 }),
    ]);
    render(
      <GraficoEspectro
        espectro={SEIS}
        espectroAnterior={anterior}
        sessaoAtiva={7}
        sessaoAnterior={6}
      />,
    );
    expect(screen.getByText("+20")).toBeTruthy();
    expect(screen.getByText("−12")).toBeTruthy();
    expect(screen.getAllByText(/Sessão 6/).length).toBeGreaterThan(0);
  });

  it("não inventa variação quando um dos dois lados não foi medido", () => {
    const anterior = espectro([
      eixo(0, { valor: null, medidos: 0 }),
      eixo(1, { valor: 45 }),
      eixo(2, { valor: null, alvos: 0, medidos: 0 }),
      eixo(3, { valor: 60 }),
      eixo(4, { valor: null, alvos: 3, medidos: 0 }),
      eixo(5, { valor: 25 }),
    ]);
    render(
      <GraficoEspectro
        espectro={SEIS}
        espectroAnterior={anterior}
        sessaoAtiva={7}
        sessaoAnterior={6}
      />,
    );
    // Comunicação Expressiva foi de "não medido" para 80: a diferença não é
    // +80, é indefinida.
    expect(screen.queryByText("+80")).toBeNull();
  });

  it("conta os alvos que não caem em nenhum eixo, em vez de escondê-los", () => {
    render(
      <GraficoEspectro espectro={espectro(SEIS.eixos, 3)} sessaoAtiva={7} />,
    );
    expect(screen.getByText(/3 alvos sem eixo/)).toBeTruthy();
  });

  it("sem nenhum eixo medido: estado vazio nomeado, não polígono no centro", () => {
    const nada = espectro(
      ORDEM_EIXOS.map((_, i) =>
        eixo(i, {
          valor: null,
          alvos: 0,
          medidos: 0,
          dominados: 0,
          contagemEvidencias: 0,
        }),
      ),
    );
    const { container } = render(
      <GraficoEspectro espectro={nada} sessaoAtiva={3} />,
    );
    expect(
      screen.getByText(/Nenhum alvo com nível de ajuda registrado/),
    ).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});
