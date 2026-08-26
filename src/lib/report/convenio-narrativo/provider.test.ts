import { afterEach, describe, expect, it } from "vitest";
import type { PayloadConvenioBruto } from "../convenio-bruto/types";
import { GeminiConvenioNarrativoProvider } from "./gemini-provider";
import {
  resolveConvenioNarrativoProvider,
  validarDraftContraDossie,
} from "./provider";
import { StubConvenioNarrativoProvider } from "./stub-provider";
import type { ConvenioNarrativoDraft } from "./types";

function buildDossie(): PayloadConvenioBruto {
  return {
    paciente: { nome: "Paciente Teste" },
    periodo: { inicio: "2026-01-01", fim: "2026-01-31" },
    geradoEm: "2026-02-01T00:00:00.000Z",
    sessoes: [],
    evidencias: [
      {
        data: "2026-01-05",
        metaOuDominio: "Comunicação",
        classificacao: "independente",
        autor: "A",
      },
    ],
    presenca: {
      sessoesRealizadas: 8,
      faltasJustificadas: 1,
      faltasNaoJustificadas: 0,
    },
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
    expect(validarDraftContraDossie(draft, dossie)).toEqual({
      ok: false,
      numeroOrfao: "42",
    });
  });

  it("aceita draft que só usa números presentes no dossiê", () => {
    const dossie = buildDossie();
    const draft = buildDraft(
      "Paciente realizou 8 sessões no período, com 1 falta justificada.",
    );
    expect(validarDraftContraDossie(draft, dossie)).toEqual({ ok: true });
  });

  it("rejeita número que só aparece como fragmento de data (vazamento de data)", () => {
    const dossie: PayloadConvenioBruto = {
      ...buildDossie(),
      sessoes: [
        {
          numeroSequencial: 1,
          data: "2026-12-05",
          disciplina: "Fonoaudiologia",
          modalidade: "individual",
          estado: "realizada",
          justificada: null,
          terapeuta: "T",
        },
      ],
      presenca: {
        sessoesRealizadas: 8,
        faltasJustificadas: 1,
        faltasNaoJustificadas: 0,
      },
    };
    const draft = buildDraft("Foram realizadas 12 sessões no período.");
    expect(validarDraftContraDossie(draft, dossie)).toEqual({
      ok: false,
      numeroOrfao: "12",
    });
  });

  it("aceita draft citando apenas contagens reais (total e por domínio)", () => {
    const dossie: PayloadConvenioBruto = {
      ...buildDossie(),
      sessoes: [
        {
          numeroSequencial: 1,
          data: "2026-12-05",
          disciplina: "Fonoaudiologia",
          modalidade: "individual",
          estado: "realizada",
          justificada: null,
          terapeuta: "T",
        },
      ],
      evidencias: [
        {
          data: "2026-01-05",
          metaOuDominio: "Comunicação",
          classificacao: "independente",
          autor: "A",
        },
        {
          data: "2026-01-12",
          metaOuDominio: "Comunicação",
          classificacao: "dica_verbal",
          autor: "A",
        },
      ],
      presenca: {
        sessoesRealizadas: 8,
        faltasJustificadas: 1,
        faltasNaoJustificadas: 0,
      },
    };
    const draft: ConvenioNarrativoDraft = {
      ...buildDraft(
        "Paciente realizou 8 sessões no período, com 1 falta justificada e 0 não justificadas.",
      ),
      evolucaoPorDominio: [
        {
          dominio: "Comunicação",
          narrativa: "Foram registradas 2 evidências no domínio Comunicação.",
        },
      ],
    };
    expect(validarDraftContraDossie(draft, dossie)).toEqual({ ok: true });
  });
});

describe("resolveConvenioNarrativoProvider", () => {
  const ORIGINAL_ENABLED = process.env.CONVENIO_REPORT_LLM_ENABLED;
  const ORIGINAL_KEY = process.env.GOOGLE_API_KEY;

  afterEach(() => {
    process.env.CONVENIO_REPORT_LLM_ENABLED = ORIGINAL_ENABLED;
    process.env.GOOGLE_API_KEY = ORIGINAL_KEY;
  });

  it("retorna stub para clínica demo", () => {
    const provider = resolveConvenioNarrativoProvider({ isDemo: true });
    expect(provider).toBeInstanceOf(StubConvenioNarrativoProvider);
  });

  it("retorna stub em produção quando CONVENIO_REPORT_LLM_ENABLED=true mas GOOGLE_API_KEY ausente", () => {
    process.env.CONVENIO_REPORT_LLM_ENABLED = "true";
    delete process.env.GOOGLE_API_KEY;
    const provider = resolveConvenioNarrativoProvider({ isDemo: false });
    expect(provider).toBeInstanceOf(StubConvenioNarrativoProvider);
  });

  it("retorna GeminiConvenioNarrativoProvider quando habilitado com GOOGLE_API_KEY presente", () => {
    process.env.CONVENIO_REPORT_LLM_ENABLED = "true";
    process.env.GOOGLE_API_KEY = "fake-key-teste";
    const provider = resolveConvenioNarrativoProvider({ isDemo: false });
    expect(provider).toBeInstanceOf(GeminiConvenioNarrativoProvider);
  });
});
