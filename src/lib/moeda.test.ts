import { describe, expect, it } from "vitest";

import { formatarBRL } from "./moeda";

describe("formatarBRL", () => {
  it("formata 74500 centavos com o separador decimal brasileiro", () => {
    expect(formatarBRL(74500)).toContain("745,00");
  });

  it("mantém o símbolo da moeda", () => {
    expect(formatarBRL(74500)).toContain("R$");
  });

  it("formata zero", () => {
    expect(formatarBRL(0)).toContain("0,00");
  });
});
