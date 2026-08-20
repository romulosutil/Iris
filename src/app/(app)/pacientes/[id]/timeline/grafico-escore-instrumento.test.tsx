import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import {
  GraficoEscoreInstrumento,
  ESCALA_MAXIMA,
} from "./grafico-escore-instrumento";

const aplicacao = (escore: number | null, dia: number) => ({
  id: `a${dia}`,
  tipoInstrumento: "phq9" as const,
  escoreTotal: escore,
  criadoEm: new Date(`2026-0${dia}-10T12:00:00Z`),
});

describe("ESCALA_MAXIMA", () => {
  it("PHQ-9 vai a 27 e GAD-7 a 21 — escalas diferentes, nunca a mesma", () => {
    expect(ESCALA_MAXIMA.phq9).toBe(27);
    expect(ESCALA_MAXIMA.gad7).toBe(21);
  });
});

describe("GraficoEscoreInstrumento", () => {
  it("plota a série e nomeia a faixa de corte de cada aplicação", () => {
    render(
      <GraficoEscoreInstrumento
        tipoInstrumento="phq9"
        aplicacoes={[aplicacao(18, 1), aplicacao(11, 2), aplicacao(4, 3)]}
      />,
    );

    // Faixas oficiais do PHQ-9 (`../tcc/instrumento-lista.tsx`): 18 =
    // "moderadamente grave", 11 = "moderado", 4 = "mínimo".
    //
    // Matcher ANCORADO (`^...$`), não `/moderado/`: a substring "moderado"
    // também casa com "moderadamente grave", e a asserção passaria mesmo se o
    // componente derivasse a faixa errada para os dois pontos.
    expect(screen.getByText(/^moderadamente grave$/)).toBeTruthy();
    expect(screen.getByText(/^moderado$/)).toBeTruthy();
    expect(screen.getByText(/^mínimo$/)).toBeTruthy();
  });

  it("aplicação sem escore não vira ponto no gráfico nem zero", () => {
    render(
      <GraficoEscoreInstrumento
        tipoInstrumento="phq9"
        aplicacoes={[aplicacao(18, 1), aplicacao(null, 2)]}
      />,
    );

    // Escore ausente é ausência de medida, não medida zero: plotá-lo como 0
    // desenharia uma queda de 18 para 0 — uma melhora clínica inexistente.
    expect(screen.getByText(/1 aplicação sem escore registrado/)).toBeTruthy();
  });

  it("uma única aplicação: mostra o valor, não desenha tendência", () => {
    render(
      <GraficoEscoreInstrumento
        tipoInstrumento="gad7"
        aplicacoes={[{ ...aplicacao(9, 1), tipoInstrumento: "gad7" as const }]}
      />,
    );

    expect(
      screen.getByText(/Uma única aplicação — ainda não há série/),
    ).toBeTruthy();
  });

  it("nenhuma aplicação: estado vazio nomeado", () => {
    render(<GraficoEscoreInstrumento tipoInstrumento="gad7" aplicacoes={[]} />);

    expect(
      screen.getByText(/Nenhuma aplicação de GAD-7 registrada/),
    ).toBeTruthy();
  });

  it("ignora aplicações de outro instrumento — PHQ-9 e GAD-7 não compartilham escala", () => {
    // Sem o filtro, um escore 20 de PHQ-9 entraria no gráfico de GAD-7 (teto
    // 21) como quadro quase máximo. Escalas diferentes, séries separadas.
    render(
      <GraficoEscoreInstrumento
        tipoInstrumento="gad7"
        aplicacoes={[aplicacao(20, 1), aplicacao(18, 2)]}
      />,
    );

    expect(
      screen.getByText(/Nenhuma aplicação de GAD-7 registrada/),
    ).toBeTruthy();
    // E a mensagem de "sem escore" não pode contar aplicações de outro
    // instrumento: elas não estão fora do gráfico por falta de medida.
    expect(screen.queryByText(/sem escore registrado/)).toBeNull();
  });
});
