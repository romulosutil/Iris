import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SessaoTravada } from "@/lib/sessao/fila";
import {
  custoItemFila,
  dividaItemFila,
  FilaLista,
  ItemFila,
} from "./fila-item";

afterEach(cleanup);

function item(overrides: Partial<SessaoTravada> = {}): SessaoTravada {
  return {
    sessionId: "s1",
    patientId: "p1",
    patientNome: "Ana",
    terapeutaId: "t1",
    terapeutaNome: "Bia",
    agendadaPara: new Date("2026-08-01T10:00:00Z"),
    motivo: "na_fila_validacao",
    gesto: "revisar_evidencias",
    itensNaFilaValidacao: 3,
    minha: true,
    ...overrides,
  };
}

describe("custoItemFila — custo declarado no item (R-17)", () => {
  test("na_fila_validacao: declara quantidade de evidências e minutos estimados", () => {
    expect(
      custoItemFila(
        item({ motivo: "na_fila_validacao", itensNaFilaValidacao: 3 }),
      ),
    ).toBe("Revisar 3 evidências · ~4 min");
  });

  test("extracao_travada: custo é instantâneo, nunca uma estimativa em minutos", () => {
    expect(
      custoItemFila(
        item({ motivo: "extracao_travada", itensNaFilaValidacao: 0 }),
      ),
    ).toBe("Reprocessar · instantâneo");
  });

  test("sem_nota_apos_24h: custo é 'Documentar', não é confundido com reprocessar", () => {
    expect(
      custoItemFila(
        item({ motivo: "sem_nota_apos_24h", itensNaFilaValidacao: 0 }),
      ),
    ).toBe("Documentar · ~5 min");
  });
});

describe("dividaItemFila / ItemFila — estado nunca aparece sozinho (R-18)", () => {
  test("item da fila mostra o selo de estado E a dívida ao lado, nunca só um dos dois", () => {
    render(
      <ItemFila
        item={item({ motivo: "na_fila_validacao", itensNaFilaValidacao: 3 })}
      />,
    );
    expect(screen.getByText(/Precisa de atenção/)).toBeTruthy();
    expect(screen.getByText(/3 evidências esperando você/)).toBeTruthy();
  });

  test("dividaItemFila devolve texto de dívida específico por motivo, não um genérico", () => {
    expect(
      dividaItemFila(
        item({ motivo: "extracao_travada", itensNaFilaValidacao: 0 }),
      ),
    ).toMatch(/Extração travada/);
    expect(
      dividaItemFila(
        item({ motivo: "na_fila_validacao", itensNaFilaValidacao: 1 }),
      ),
    ).toBe("1 evidência esperando você");
  });
});

describe("FilaLista — falha de extração nunca vira o empty-state (R-32)", () => {
  test("item com extração travada nunca renderiza 'Nada travado', mesmo estando sozinho na lista", () => {
    render(
      <FilaLista
        itens={[item({ motivo: "extracao_travada", itensNaFilaValidacao: 0 })]}
        vazioTexto="Nada travado por aqui."
      />,
    );
    expect(screen.queryByText(/Nada travado/)).toBeNull();
    expect(screen.getByText(/Reprocessar · instantâneo/)).toBeTruthy();
  });

  test("lista de fato vazia mostra 'Nada travado', com essas palavras (R-33)", () => {
    render(<FilaLista itens={[]} vazioTexto="Nada travado por aqui." />);
    expect(screen.getByText("Nada travado por aqui.")).toBeTruthy();
  });

  test("decide pelo array real de itens, não por uma flag `vazio` externa possivelmente divergente", () => {
    // Simula o defeito-padrão do repo (memória `erro-renderizado-como-empty-state`):
    // um sinalizador de "vazio" calculado alhures que diverge do array de itens.
    // `FilaLista` não recebe esse booleano — só o array — de propósito.
    render(
      <FilaLista
        itens={[item({ motivo: "sem_nota_apos_24h", itensNaFilaValidacao: 0 })]}
        vazioTexto="Nada travado por aqui."
      />,
    );
    expect(screen.queryByText(/Nada travado/)).toBeNull();
  });
});
