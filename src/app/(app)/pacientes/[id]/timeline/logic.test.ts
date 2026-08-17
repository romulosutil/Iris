import { describe, expect, test } from "vitest";
import { calcularDelta, verificarProtocoloMudou } from "./logic";

describe("timeline/logic.ts (calcularDelta)", () => {
  test("com snapshots vazios retorna delta vazio", () => {
    const delta = calcularDelta(null, null);
    expect(delta.itens).toHaveLength(0);
    expect(delta.evidenciasNovas).toBe(0);
    expect(delta.metasCandidatasNovas).toBe(0);
  });

  test("detecta itens novos", () => {
    const snapB = {
      "item-1": { nivel_ajuda_recente: 2, contagem: 3, is_candidata: true },
    };
    const delta = calcularDelta(null, snapB);

    expect(delta.itens).toHaveLength(1);
    expect(delta.itens[0]).toEqual({
      id: "item-1",
      tipo: "novo",
      nivelAnterior: null,
      nivelNovo: 2,
      contagemDelta: 3,
      virouCandidata: true,
    });
    expect(delta.evidenciasNovas).toBe(3);
    expect(delta.metasCandidatasNovas).toBe(1);
  });

  test("detecta evolução, regressão e aumento de evidências", () => {
    const snapA = {
      "item-evolucao": {
        nivel_ajuda_recente: 3,
        contagem: 5,
        is_candidata: false,
      },
      "item-regressao": {
        nivel_ajuda_recente: 1,
        contagem: 2,
        is_candidata: false,
      },
      "item-estavel": {
        nivel_ajuda_recente: 2,
        contagem: 4,
        is_candidata: false,
      },
    };
    const snapB = {
      "item-evolucao": {
        nivel_ajuda_recente: 1,
        contagem: 6,
        is_candidata: true,
      }, // evoluiu (3 -> 1) + cand + ev
      "item-regressao": {
        nivel_ajuda_recente: 4,
        contagem: 2,
        is_candidata: false,
      }, // regrediu (1 -> 4)
      "item-estavel": {
        nivel_ajuda_recente: 2,
        contagem: 5,
        is_candidata: false,
      }, // mesmo nível, +1 evidência
    };

    const delta = calcularDelta(snapA, snapB);

    expect(delta.itens).toHaveLength(3);

    const ev = delta.itens.find((i) => i.id === "item-evolucao");
    expect(ev?.tipo).toBe("evolucao");
    expect(ev?.nivelAnterior).toBe(3);
    expect(ev?.nivelNovo).toBe(1);
    expect(ev?.contagemDelta).toBe(1);
    expect(ev?.virouCandidata).toBe(true);

    const reg = delta.itens.find((i) => i.id === "item-regressao");
    expect(reg?.tipo).toBe("regressao");
    expect(reg?.nivelAnterior).toBe(1);
    expect(reg?.nivelNovo).toBe(4);
    expect(reg?.contagemDelta).toBe(0);

    const est = delta.itens.find((i) => i.id === "item-estavel");
    expect(est?.tipo).toBe("estavel");
    expect(est?.contagemDelta).toBe(1);

    expect(delta.evidenciasNovas).toBe(2); // +1 em evolucao, +1 em estavel
    expect(delta.metasCandidatasNovas).toBe(1);
  });

  test("detecta itens removidos/arquivados como regressão", () => {
    const snapA = {
      "item-removido": {
        nivel_ajuda_recente: 2,
        contagem: 4,
        is_candidata: false,
      },
      "item-permanece": {
        nivel_ajuda_recente: 1,
        contagem: 3,
        is_candidata: false,
      },
    };
    const snapB = {
      "item-permanece": {
        nivel_ajuda_recente: 1,
        contagem: 3,
        is_candidata: false,
      },
    };

    const delta = calcularDelta(snapA, snapB);

    expect(delta.itens).toHaveLength(1);
    expect(delta.itens[0]).toEqual({
      id: "item-removido",
      tipo: "regressao",
      nivelAnterior: 2,
      nivelNovo: null,
      contagemDelta: 0,
      virouCandidata: false,
    });
  });
});

describe("timeline/logic.ts (verificarProtocoloMudou)", () => {
  test("retorna false se protocolos forem idênticos", () => {
    const segA = {
      "goal-1": { "protocol-x": {} },
    };
    const segB = {
      "goal-1": { "protocol-x": {} },
    };
    expect(verificarProtocoloMudou(segA, segB)).toBe(false);
  });

  test("retorna true se houver novos ou diferentes protocolos (G7)", () => {
    const segA = {
      "goal-1": { "protocol-x": {} },
    };
    const segB = {
      "goal-1": { "protocol-y": {} },
    };
    expect(verificarProtocoloMudou(segA, segB)).toBe(true);

    const segC = {
      "goal-1": { "protocol-x": {}, "protocol-y": {} },
    };
    expect(verificarProtocoloMudou(segA, segC)).toBe(true);
  });

  test("retorna true se transicionar de nulo para populado (G7)", () => {
    const segB = {
      "goal-1": { "protocol-x": {} },
    };
    expect(verificarProtocoloMudou(null, segB)).toBe(true);
    expect(verificarProtocoloMudou(segB, null)).toBe(true);
  });

  test("retorna false se ambos forem nulos", () => {
    expect(verificarProtocoloMudou(null, null)).toBe(false);
  });
});
