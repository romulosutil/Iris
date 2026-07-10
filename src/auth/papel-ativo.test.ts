import { describe, expect, test } from "vitest";
import { papelAtivo } from "./papel-ativo";

describe("papelAtivo (A2 — múltiplos papéis na mesma clínica)", () => {
  test("papel único → usa esse papel", () => {
    expect(papelAtivo(["terapeuta"])).toEqual({ papel: "terapeuta" });
  });

  test("coordenador presente → coordenador vence (superset)", () => {
    expect(papelAtivo(["terapeuta", "coordenador"])).toEqual({
      papel: "coordenador",
    });
    expect(papelAtivo(["admin_recepcao", "coordenador", "terapeuta"])).toEqual({
      papel: "coordenador",
    });
  });

  test("combo disjunto admin_recepcao + terapeuta → precisa selecionar", () => {
    const r = papelAtivo(["admin_recepcao", "terapeuta"]);
    expect(r).toHaveProperty("needsSelection");
    if ("needsSelection" in r) {
      expect(r.needsSelection.sort()).toEqual(
        ["admin_recepcao", "terapeuta"].sort(),
      );
    }
  });

  test("papéis duplicados são deduplicados", () => {
    expect(papelAtivo(["terapeuta", "terapeuta"])).toEqual({
      papel: "terapeuta",
    });
  });
});
