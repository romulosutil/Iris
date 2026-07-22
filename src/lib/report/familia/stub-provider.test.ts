import { describe, it, expect } from "vitest";
import { StubFamilyReportProvider } from "./stub-provider";
import type { FamilyReportInput } from "./types";

const provider = new StubFamilyReportProvider();

function input(over: Partial<FamilyReportInput> = {}): FamilyReportInput {
  return {
    crianca: { nome: "Théo" },
    periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
    evidenciasAprovadas: [],
    metasAtivas: [],
    reforcadoresAtuais: [],
    avaliacoesFormais: [],
    ...over,
  };
}

// Lista de jargão proibido (F1). O stub nunca deve emitir estes termos.
const JARGAO = [
  "mando",
  "tato",
  "ecoico",
  "operante",
  "VB-MAPP",
  "ABLLS",
  "nível de ajuda",
  "evidência",
  "dossiê",
];

function semJargao(draft: object) {
  const texto = JSON.stringify(draft).toLowerCase();
  for (const j of JARGAO) {
    expect(texto).not.toContain(j.toLowerCase());
  }
}

describe("StubFamilyReportProvider", () => {
  it("F6: entrada sem avanço → platô honesto, sem narrativa de progresso", async () => {
    const d = await provider.gerar(input({ metasAtivas: ["Nomear objetos"] }));
    expect(d.periodoSemAvancoVisivel).toBe(true);
    expect(d.notaHonestidade).toBeTruthy();
    expect(d.notaHonestidade!.length).toBeGreaterThan(20);
    expect(d.conquistaDestaque.toLowerCase()).toContain("consolidar");
  });

  it("F3: escolhe o maior salto de independência", async () => {
    const d = await provider.gerar(
      input({
        evidenciasAprovadas: [
          { data: "2026-06-02", metaOuDominio: "Empilhar blocos", nivelAjuda: "dica física", polaridade: "positiva" },
          { data: "2026-06-10", metaOuDominio: "Pedir o que quer", nivelAjuda: "independente", polaridade: "positiva" },
        ],
      }),
    );
    expect(d.periodoSemAvancoVisivel).toBe(false);
    expect(d.conquistaDestaque).toContain("Pedir o que quer");
  });

  it("F8/F2: contagem por meta = entrada, nada inventado", async () => {
    const d = await provider.gerar(
      input({
        evidenciasAprovadas: [
          { data: "2026-06-02", metaOuDominio: "Pedir o que quer", nivelAjuda: "independente", polaridade: "positiva" },
          { data: "2026-06-05", metaOuDominio: "Pedir o que quer", nivelAjuda: "dica verbal", polaridade: "positiva" },
          { data: "2026-06-07", metaOuDominio: "Esperar a vez", nivelAjuda: "dica gestual", polaridade: "positiva" },
        ],
      }),
    );
    const map = Object.fromEntries(
      d.anexoDados.evidenciasPorMeta.map((e) => [e.meta, e.contagemPeriodo]),
    );
    expect(map["Pedir o que quer"]).toBe(2);
    expect(map["Esperar a vez"]).toBe(1);
  });

  it("F5: apoio em casa deriva do reforçador atual", async () => {
    const d = await provider.gerar(
      input({
        reforcadoresAtuais: ["carrinhos"],
        evidenciasAprovadas: [
          { data: "2026-06-02", metaOuDominio: "Pedir o que quer", nivelAjuda: "independente", polaridade: "positiva" },
        ],
      }),
    );
    expect(d.comoApoiarEmCasa.join(" ")).toContain("carrinhos");
  });

  it("F4: no máximo 4 metas ativas", async () => {
    const d = await provider.gerar(
      input({ metasAtivas: ["a", "b", "c", "d", "e", "f"] }),
    );
    expect(d.trabalhandoAgora.length).toBeLessThanOrEqual(4);
  });

  it("F1: nunca emite jargão técnico", async () => {
    const d = await provider.gerar(
      input({
        metasAtivas: ["Pedir o que quer"],
        reforcadoresAtuais: ["carrinhos"],
        evidenciasAprovadas: [
          { data: "2026-06-02", metaOuDominio: "Pedir o que quer", nivelAjuda: "independente", polaridade: "positiva" },
        ],
      }),
    );
    semJargao(d);
    expect(d.status).toBe("rascunho_para_revisao");
  });
});
