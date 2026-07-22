import { describe, expect, it } from "vitest";
import type { PayloadConvenioBruto } from "../convenio-bruto/types";
import { resolveConvenioNarrativoProvider, validarDraftContraDossie } from "./provider";
import { StubConvenioNarrativoProvider } from "./stub-provider";
import type { ConvenioNarrativoDraft } from "./types";

function buildDossie(): PayloadConvenioBruto {
  return {
    paciente: { nome: "Paciente Teste" },
    periodo: { inicio: "2026-01-01", fim: "2026-01-31" },
    geradoEm: "2026-02-01T00:00:00.000Z",
    sessoes: [],
    evidencias: [
      { data: "2026-01-05", metaOuDominio: "Comunicação", classificacao: "independente", autor: "A" },
    ],
    presenca: { sessoesRealizadas: 8, faltasJustificadas: 1, faltasNaoJustificadas: 0 },
  };
}

function buildDraft(resumoClinico: string): ConvenioNarrativoDraft {
  return {
    resumoClinico,
    evolucaoPorDominio: [],
    justificativaContinuidade: "Justificativa sem números órfãos.",
    objetivosProximoPeriodo: [],
    periodoSemAvancoVisivel: false,
    notaHonestidade: null,
    status: "rascunho_para_revisao",
  };
}

describe("validarDraftContraDossie", () => {
  it("rejeita número ausente no dossiê", () => {
    const dossie = buildDossie();
    const draft = buildDraft("Paciente realizou 42 sessões no período.");
    expect(validarDraftContraDossie(draft, dossie)).toEqual({ ok: false, numeroOrfao: "42" });
  });

  it("aceita draft que só usa números presentes no dossiê", () => {
    const dossie = buildDossie();
    const draft = buildDraft("Paciente realizou 8 sessões no período, com 1 falta justificada.");
    expect(validarDraftContraDossie(draft, dossie)).toEqual({ ok: true });
  });
});

describe("resolveConvenioNarrativoProvider", () => {
  it("retorna stub para clínica demo", () => {
    const provider = resolveConvenioNarrativoProvider({ isDemo: true });
    expect(provider).toBeInstanceOf(StubConvenioNarrativoProvider);
  });
});
