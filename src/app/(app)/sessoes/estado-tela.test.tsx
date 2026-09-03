import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  AvisoPrimeiraVisita,
  AvisoVolumeAlto,
  SemPermissaoSessoes,
  volumeAlto,
} from "./estado-tela";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("volumeAlto — estado de tela 'volume alto' (R-31)", () => {
  test("no limiar (20) ainda não é volume alto", () => {
    expect(volumeAlto(20)).toBe(false);
  });

  test("acima do limiar é volume alto", () => {
    expect(volumeAlto(21)).toBe(true);
  });
});

describe("AvisoVolumeAlto", () => {
  test("some quando o escopo não é grande", () => {
    render(<AvisoVolumeAlto totalNoEscopo={5} />);
    expect(screen.queryByText(/Fila grande/)).toBeNull();
  });

  test("aparece quando o escopo é grande", () => {
    render(<AvisoVolumeAlto totalNoEscopo={30} />);
    expect(screen.getByText(/Fila grande/)).toBeTruthy();
  });
});

describe("SemPermissaoSessoes — estado de tela 'sem permissão' (R-31)", () => {
  test("diz por extenso que a tela não é para este papel, não finge fila vazia", () => {
    render(<SemPermissaoSessoes />);
    expect(screen.getByText(/não faz parte deste papel/)).toBeTruthy();
    expect(screen.queryByText(/Nada travado/)).toBeNull();
  });
});

describe("AvisoPrimeiraVisita — estado de tela 'primeira vez' (R-31)", () => {
  test("primeira visita com fila vazia: mostra o aviso de boas-vindas", async () => {
    render(<AvisoPrimeiraVisita ativo />);
    expect(await screen.findByText(/Bem-vindo/)).toBeTruthy();
  });

  test("segunda visita: não mostra mais o aviso, mesmo com fila vazia", async () => {
    window.localStorage.setItem("iris_sessoes_visitado", "1");
    render(<AvisoPrimeiraVisita ativo />);
    await Promise.resolve();
    expect(screen.queryByText(/Bem-vindo/)).toBeNull();
  });

  test("`localStorage` que lança na leitura não quebra a tela (janela anônima)", async () => {
    const original = window.localStorage.getItem;
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => render(<AvisoPrimeiraVisita ativo />)).not.toThrow();
    window.localStorage.getItem = original;
  });
});
