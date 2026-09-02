import { describe, expect, test } from "vitest";
import { alertasGraveDe, reforcadoresAtuaisDe } from "./logic";

describe("reforcadoresAtuaisDe", () => {
  test("mantém só a observação mais recente por item", () => {
    const r = reforcadoresAtuaisDe([
      { itemAtividade: "iPad", valencia: "baixa", sessionNumero: 40 },
      { itemAtividade: "iPad", valencia: "alta", sessionNumero: 46 },
    ]);
    expect(r).toEqual([{ item: "iPad", valencia: "alta" }]);
  });

  test("saciado DEMOVE/exclui o item mesmo que fosse alta antes (R17 recência)", () => {
    const r = reforcadoresAtuaisDe([
      { itemAtividade: "bolhas de sabão", valencia: "alta", sessionNumero: 40 },
      {
        itemAtividade: "bolhas de sabão",
        valencia: "saciado",
        sessionNumero: 46,
      },
    ]);
    expect(r).toEqual([]);
  });

  test("surfaça 'alta' antes de 'baixa'", () => {
    const r = reforcadoresAtuaisDe([
      { itemAtividade: "elogio social", valencia: "baixa", sessionNumero: 46 },
      { itemAtividade: "iPad", valencia: "alta", sessionNumero: 46 },
    ]);
    expect(r.map((x) => x.item)).toEqual(["iPad", "elogio social"]);
  });

  test("lista vazia não quebra", () => {
    expect(reforcadoresAtuaisDe([])).toEqual([]);
  });
});

describe("alertasGraveDe", () => {
  test("filtra severidade grave, aprovada/editada", () => {
    const r = alertasGraveDe([
      {
        id: "e1",
        estado: "aprovada",
        payload: { severidade: "grave", comportamento: "fuga de tarefa" },
        payloadEditado: null,
        sessionNumero: 46,
        revisadoEm: null,
      },
      {
        id: "e2",
        estado: "aprovada",
        payload: { severidade: "leve" },
        payloadEditado: null,
        sessionNumero: 45,
        revisadoEm: null,
      },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.extractionId).toBe("e1");
    expect(r[0]?.comportamento).toBe("fuga de tarefa");
  });

  test("ignora extração ainda sugerida (não aprovada/editada)", () => {
    const r = alertasGraveDe([
      {
        id: "e1",
        estado: "sugerida",
        payload: { severidade: "grave" },
        payloadEditado: null,
        sessionNumero: 46,
        revisadoEm: null,
      },
    ]);
    expect(r).toEqual([]);
  });

  // #532 (Q-01): o DLQ antigo gravava `{error: msg}` em `payload_editado`.
  // Um objeto fora do formato de registro ABC NÃO pode mascarar o alerta
  // grave que a IA sugeriu — é ignorado e vale o `payload`.
  test("payloadEditado fora do formato (ex.: {error} legado do DLQ) é ignorado — vale o payload original", () => {
    const r = alertasGraveDe([
      {
        id: "e1",
        estado: "aprovada",
        payload: { severidade: "grave", comportamento: "bateu a cabeça" },
        payloadEditado: { error: "insert into evidence ... params" },
        sessionNumero: 46,
        revisadoEm: null,
      },
      {
        id: "e2",
        estado: "editada",
        payload: { severidade: "grave", comportamento: "mordeu" },
        payloadEditado: { severidade: "GRAVE" }, // enum inválido → fora do formato
        sessionNumero: 45,
        revisadoEm: null,
      },
    ]);
    expect(r.map((x) => x.extractionId)).toEqual(["e1", "e2"]);
    expect(r[0]?.comportamento).toBe("bateu a cabeça");
    expect(r[1]?.comportamento).toBe("mordeu");
  });

  // Revisão pós-PR #532: `.strict()` descartaria uma edição humana legítima
  // com campo extra — a edição tem que continuar vencendo o payload da IA.
  test("edição humana com campo extra (fora do schema) é preservada — vence o payload da IA", () => {
    const r = alertasGraveDe([
      {
        id: "e1",
        estado: "editada",
        payload: { severidade: "grave", comportamento: "sugestão da IA" },
        payloadEditado: {
          severidade: "grave",
          comportamento: "corrigido pelo terapeuta",
          observacao_livre: "campo que o schema não conhece",
        },
        sessionNumero: 46,
        revisadoEm: null,
      },
      {
        // `error` junto de chave conhecida continua sendo assinatura do DLQ
        id: "e2",
        estado: "aprovada",
        payload: { severidade: "grave", comportamento: "mordeu" },
        payloadEditado: { error: "x", severidade: "leve" },
        sessionNumero: 45,
        revisadoEm: null,
      },
    ]);
    expect(r.map((x) => x.extractionId)).toEqual(["e1", "e2"]);
    expect(r[0]?.comportamento).toBe("corrigido pelo terapeuta");
    expect(r[1]?.comportamento).toBe("mordeu");
  });

  test("payloadEditado (edição humana) vence payload original da IA", () => {
    const r = alertasGraveDe([
      {
        id: "e1",
        estado: "editada",
        payload: { severidade: "leve" },
        payloadEditado: { severidade: "grave", comportamento: "auto-agressão" },
        sessionNumero: 46,
        revisadoEm: null,
      },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.comportamento).toBe("auto-agressão");
  });

  test("lista vazia não quebra", () => {
    expect(alertasGraveDe([])).toEqual([]);
  });
});
