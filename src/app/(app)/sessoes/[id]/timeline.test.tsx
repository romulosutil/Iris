import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { deriveEstadoSessao, type EntradaSessao } from "@/lib/sessao/estado";
import { Timeline, ROTULO_MOTIVO } from "./timeline";

afterEach(cleanup);

const AGORA = new Date("2026-09-01T12:00:00.000Z");

function base(overrides: Partial<EntradaSessao> = {}): EntradaSessao {
  return {
    estado: "agendada",
    agendadaPara: AGORA,
    temNotaConsolidada: false,
    extracoes: [],
    itensNaFilaValidacao: 0,
    ...overrides,
  };
}

// R-05: a Timeline não redecide o passo — ela só traduz o
// `resultado`/`motivo` que `deriveEstadoSessao` (T01) já devolveu.

describe("Timeline — traduz deriveEstadoSessao, não redefine (R-05)", () => {
  test("agendada: destaca 'Agendada' na escada", () => {
    const resultado = deriveEstadoSessao(base(), AGORA);
    render(<Timeline resultado={resultado} />);
    expect(screen.getByText("Agendada").getAttribute("aria-current")).toBe(
      "step",
    );
  });

  test("realizada sem nota: destaca 'Realizada'", () => {
    const resultado = deriveEstadoSessao(base({ estado: "realizada" }), AGORA);
    render(<Timeline resultado={resultado} />);
    expect(screen.getByText("Realizada").getAttribute("aria-current")).toBe(
      "step",
    );
  });

  test("precisa_atencao (na_fila_validacao): mostra o motivo tipado, não um booleano", () => {
    const resultado = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "sugerida" }],
        itensNaFilaValidacao: 1,
      }),
      AGORA,
    );
    expect(resultado.estado).toBe("precisa_atencao");
    render(<Timeline resultado={resultado} />);
    expect(
      screen.getByText(new RegExp(ROTULO_MOTIVO.na_fila_validacao)),
    ).toBeTruthy();
  });

  test("terminal (cancelada): não mostra a escada de 5 estados", () => {
    const resultado = deriveEstadoSessao(base({ estado: "cancelada" }), AGORA);
    render(<Timeline resultado={resultado} />);
    expect(screen.queryByText("Agendada")).toBeNull();
    expect(screen.getByText("Cancelada")).toBeTruthy();
  });
});
