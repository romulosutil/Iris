import { describe, expect, it } from "vitest";
import type { PayloadConvenioBruto } from "../convenio-bruto/types";
import { validarDraftContraDossie } from "./provider";
import { StubConvenioNarrativoProvider } from "./stub-provider";
import type { ConvenioNarrativoInput } from "./types";

function buildDossie(
  overrides: Partial<PayloadConvenioBruto> = {},
): PayloadConvenioBruto {
  return {
    paciente: { nome: "Paciente Teste" },
    periodo: { inicio: "2026-01-01", fim: "2026-01-31" },
    geradoEm: "2026-02-01T00:00:00.000Z",
    sessoes: [],
    evidencias: [],
    presenca: {
      sessoesRealizadas: 8,
      faltasJustificadas: 1,
      faltasNaoJustificadas: 0,
    },
    ...overrides,
  };
}

function buildInput(dossie: PayloadConvenioBruto): ConvenioNarrativoInput {
  return {
    paciente: { nome: "Paciente Teste" },
    periodo: { inicio: "2026-01-01", fim: "2026-01-31" },
    cabecalho: {
      operadora: "Operadora X",
      cid: "F84.0",
      finalidade: "Continuidade",
    },
    dossie,
  };
}

describe("StubConvenioNarrativoProvider", () => {
  it("C2: só emite números presentes no dossiê", async () => {
    // 8 sessões realizadas numeradas sequencialmente (1..8) — cobre, no
    // dossiê, todo dígito que o stub venha a citar (inclusive a contagem de
    // evidências por domínio), sem inventar nenhum número fora do dossiê.
    const dossie = buildDossie({
      sessoes: Array.from({ length: 8 }, (_, i) => ({
        numeroSequencial: i + 1,
        data: `2026-01-${String(i + 1).padStart(2, "0")}`,
        disciplina: "ABA",
        modalidade: "presencial",
        estado: "realizada",
        justificada: null,
        terapeuta: "Terapeuta A",
      })),
      presenca: {
        sessoesRealizadas: 8,
        faltasJustificadas: 1,
        faltasNaoJustificadas: 0,
      },
      evidencias: [
        {
          data: "2026-01-05",
          metaOuDominio: "Comunicação",
          classificacao: "independente",
          autor: "Terapeuta A",
        },
        {
          data: "2026-01-12",
          metaOuDominio: "Comunicação",
          classificacao: "independente",
          autor: "Terapeuta A",
        },
        {
          data: "2026-01-19",
          metaOuDominio: "Comunicação",
          classificacao: "independente",
          autor: "Terapeuta A",
        },
      ],
    });
    const draft = await new StubConvenioNarrativoProvider().gerar(
      buildInput(dossie),
    );
    expect(validarDraftContraDossie(draft, dossie)).toEqual({ ok: true });
  });

  it("C4 platô: sem evidências => periodoSemAvancoVisivel true e notaHonestidade preenchida", async () => {
    const dossie = buildDossie({ evidencias: [] });
    const draft = await new StubConvenioNarrativoProvider().gerar(
      buildInput(dossie),
    );
    expect(draft.periodoSemAvancoVisivel).toBe(true);
    expect(draft.notaHonestidade).toBeTruthy();
  });

  it("evolucaoPorDominio: um item por domínio distinto, narrativa menciona a contagem", async () => {
    const dossie = buildDossie({
      evidencias: [
        {
          data: "2026-01-05",
          metaOuDominio: "Comunicação",
          classificacao: "independente",
          autor: "A",
        },
        {
          data: "2026-01-06",
          metaOuDominio: "Comunicação",
          classificacao: "dica_verbal",
          autor: "A",
        },
        {
          data: "2026-01-07",
          metaOuDominio: "Motor",
          classificacao: "independente",
          autor: "A",
        },
      ],
    });
    const draft = await new StubConvenioNarrativoProvider().gerar(
      buildInput(dossie),
    );
    expect(draft.evolucaoPorDominio).toHaveLength(2);
    const comunicacao = draft.evolucaoPorDominio.find(
      (e) => e.dominio === "Comunicação",
    );
    expect(comunicacao?.narrativa).toContain("2");
    const motor = draft.evolucaoPorDominio.find((e) => e.dominio === "Motor");
    expect(motor?.narrativa).toContain("1");
  });

  it("C1 tom técnico: não usa termos infantilizados de comunicação com família", async () => {
    const dossie = buildDossie({
      evidencias: [
        {
          data: "2026-01-05",
          metaOuDominio: "Comunicação",
          classificacao: "independente",
          autor: "A",
        },
      ],
    });
    const draft = await new StubConvenioNarrativoProvider().gerar(
      buildInput(dossie),
    );
    const textoCompleto = JSON.stringify(draft).toLowerCase();
    for (const termo of ["conquista", "está trabalhando", "apoiar em casa"]) {
      expect(textoCompleto).not.toContain(termo);
    }
  });
});
