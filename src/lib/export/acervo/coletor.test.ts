import { describe, expect, it } from "vitest";
import { TABELAS_EXPORTADAS, TABELAS_NEGADAS } from "./coletor";

describe("Coletor do Acervo — regras de catálogo (D4)", () => {
  it("tem exatamente as 37 tabelas no escopo clínico", () => {
    expect(TABELAS_EXPORTADAS.length).toBe(37);
  });

  it("não há intersecção entre tabelas exportadas e a lista de negação", () => {
    const exportadas = new Set(TABELAS_EXPORTADAS);
    const interseccao = TABELAS_NEGADAS.filter((t) => exportadas.has(t as any));
    expect(interseccao).toEqual([]);
  });

  it("lista de negação contém todas as tabelas sensíveis / gateway / auto-referência", () => {
    const obrigatoriasFora = [
      "auth_account",
      "auth_session",
      "auth_verification",
      "two_factor",
      "auth_throttle",
      "subscription",
      "billing_cycle",
      "billing_cycle_patient",
      "asaas_webhook_event",
      "audio_capture",
      "protocol_familia_catalogo",
      "export_bundle",
      "export_bundle_blob",
    ];

    for (const tabela of obrigatoriasFora) {
      expect(TABELAS_NEGADAS).toContain(tabela);
      expect(TABELAS_EXPORTADAS).not.toContain(tabela);
    }
  });
});
