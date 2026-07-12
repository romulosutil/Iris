import { describe, expect, test } from "vitest";
import { avaliarFriccao } from "./review-policy";

// Estados de confiança na UI (fluxos-e-wireframes.md §3):
// alta → lote habilitado, sem fricção extra;
// baixa → sem lote, fricção deliberada (abrir + confirmar);
// inconsistente com histórico → sem lote, MAIOR atrito (comparar histórico).
describe("avaliarFriccao", () => {
  test("alta confiança sem inconsistência: lote habilitado, sem fricção", () => {
    const r = avaliarFriccao({ confianca: "alta", inconsistenteComHistorico: false });
    expect(r.podeLote).toBe(true);
    expect(r.exigeFriccao).toBe(false);
    expect(r.nivel).toBe("baixo");
  });

  test("baixa confiança: sem lote, fricção deliberada", () => {
    const r = avaliarFriccao({ confianca: "baixa", inconsistenteComHistorico: false });
    expect(r.podeLote).toBe(false);
    expect(r.exigeFriccao).toBe(true);
    expect(r.nivel).toBe("medio");
  });

  test("média confiança: sem lote, fricção", () => {
    const r = avaliarFriccao({ confianca: "media", inconsistenteComHistorico: false });
    expect(r.podeLote).toBe(false);
    expect(r.exigeFriccao).toBe(true);
  });

  test("inconsistente com histórico vence a confiança: maior atrito, nunca lote", () => {
    const r = avaliarFriccao({ confianca: "alta", inconsistenteComHistorico: true });
    expect(r.podeLote).toBe(false);
    expect(r.exigeFriccao).toBe(true);
    expect(r.nivel).toBe("alto");
  });
});
