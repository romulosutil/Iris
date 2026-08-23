import { describe, expect, it } from "vitest";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import {
  TABELAS_EXPORTADAS,
  TABELAS_EXPORTADAS_BINARIAS,
  TABELAS_NEGADAS,
} from "./coletor";

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

  // As duas listas anteriores são estáticas: repetir os nomes num teste só
  // reafirma a constante que o código já usa. O que precisa de prova é a
  // COBERTURA — uma tabela nova no `schema.ts` que não entre em nenhuma das
  // duas some do acervo (portabilidade quebrada, LGPD Art. 18) ou vaza nele,
  // e nos dois casos em silêncio. Este teste é o que falha nesse dia.
  it("toda tabela do schema está em exatamente uma das duas listas", () => {
    const tabelasDoSchema = (Object.values(schema) as unknown[])
      .filter((v): v is PgTable => is(v, PgTable))
      .map((t) => getTableName(t));

    const catalogadas = new Set<string>([
      ...TABELAS_EXPORTADAS,
      ...TABELAS_EXPORTADAS_BINARIAS,
      ...TABELAS_NEGADAS,
    ]);

    const semClassificacao = [...new Set(tabelasDoSchema)]
      .filter((t) => !catalogadas.has(t))
      .sort();

    expect(semClassificacao).toEqual([]);
  });
});
