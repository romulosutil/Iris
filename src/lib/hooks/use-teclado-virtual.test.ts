import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTecladoVirtualAberto } from "./use-teclado-virtual";

interface ViewportFalso {
  height: number;
  addEventListener: (nome: string, fn: () => void) => void;
  removeEventListener: (nome: string, fn: () => void) => void;
  disparar: () => void;
}

function instalarVisualViewport(alturaInicial: number): ViewportFalso {
  const ouvintes: (() => void)[] = [];
  const vv: ViewportFalso = {
    height: alturaInicial,
    addEventListener: (_nome, fn) => ouvintes.push(fn),
    removeEventListener: (_nome, fn) => {
      const i = ouvintes.indexOf(fn);
      if (i >= 0) ouvintes.splice(i, 1);
    },
    disparar: () => ouvintes.forEach((fn) => fn()),
  };
  Object.defineProperty(window, "visualViewport", {
    value: vv,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: alturaInicial,
    configurable: true,
    writable: true,
  });
  return vv;
}

afterEach(() => {
  Reflect.deleteProperty(window, "visualViewport");
});

describe("useTecladoVirtualAberto", () => {
  it("começa fechado", () => {
    instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());
    expect(result.current).toBe(false);
  });

  it("acusa aberto quando o viewport visual encolhe além do limiar", () => {
    const vv = instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());

    act(() => {
      vv.height = 380; // teclado ocupando ~360px
      vv.disparar();
    });
    expect(result.current).toBe(true);
  });

  it("volta a fechado quando o viewport visual cresce", () => {
    const vv = instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());

    act(() => {
      vv.height = 380;
      vv.disparar();
    });
    act(() => {
      vv.height = 740;
      vv.disparar();
    });
    expect(result.current).toBe(false);
  });

  it("ignora encolhimento pequeno (barra de URL do navegador)", () => {
    // O Chrome no Android recolhe a barra de endereço ao rolar, encolhendo o
    // viewport visual em ~60px. Tratar isso como teclado faria a BottomNav
    // piscar a cada rolagem.
    const vv = instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());

    act(() => {
      vv.height = 680;
      vv.disparar();
    });
    expect(result.current).toBe(false);
  });

  it("devolve false onde não há visualViewport", () => {
    // Servidor, jsdom sem stub e navegador antigo. O padrão seguro é
    // "teclado fechado": a barra aparece, que é o comportamento de sempre.
    const { result } = renderHook(() => useTecladoVirtualAberto());
    expect(result.current).toBe(false);
  });
});
