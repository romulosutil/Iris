import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { ValidacaoFila } from "./validacao-fila";
import type { ItemFila } from "./queries";
import type { AlvoValido } from "./alvos";
import { avaliarFriccao } from "@/lib/extraction/review-policy";

vi.mock("./actions", () => ({
  confirmarEvidenciaAction: vi.fn(async () => ({})),
  invalidarEvidenciaAction: vi.fn(async () => ({})),
  devolverComDuvidaAction: vi.fn(async () => ({})),
  reclassificarEvidenciaAction: vi.fn(async () => ({})),
  aprovarLoteAction: vi.fn(async () => ({})),
}));

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const VAZIA: {
  itens: ItemFila[];
  alvosPorPaciente: Record<string, AlvoValido[]>;
} = {
  itens: [],
  alvosPorPaciente: {},
};

// Fricção derivada da fonte única (`avaliarFriccao`) — fixture nunca pode
// carregar combinação impossível (ex.: confiança baixa com podeLote=true).
function friccao(
  confianca: "alta" | "media" | "baixa",
  inconsistenteComHistorico: boolean,
) {
  const { podeLote, nivel } = avaliarFriccao({
    confianca,
    inconsistenteComHistorico,
  });
  return {
    confianca,
    inconsistenteComHistorico,
    nivelFriccao: nivel,
    podeLote,
  };
}

const CHEIA: {
  itens: ItemFila[];
  alvosPorPaciente: Record<string, AlvoValido[]>;
} = {
  itens: [
    {
      evidenceId: "00000000-0000-0000-0000-000000000001",
      patientId: "00000000-0000-0000-0000-0000000000a1",
      patientNome: "Paciente A",
      sessionNumero: 3,
      trecho: "A criança apontou para o cartão quando solicitada.",
      classificacaoAtual: {
        alvo: { goal_id: "00000000-0000-0000-0000-0000000000g1" },
      },
      motivo: ["baixa_confianca"],
      protocolId: null,
      ...friccao("baixa", false),
      historicoAnterior: null,
    },
    {
      evidenceId: "00000000-0000-0000-0000-000000000002",
      patientId: "00000000-0000-0000-0000-0000000000a2",
      patientNome: "Paciente B",
      sessionNumero: 5,
      trecho: "Recusou a tarefa após duas tentativas.",
      classificacaoAtual: {
        alvo: { protocol_id: "vbmapp", dominio_id: "mand" },
      },
      motivo: ["inconsistente_historico"],
      protocolId: "vbmapp",
      ...friccao("media", true),
      historicoAnterior: {
        trecho: "Pediu o brinquedo verbalmente sem dica.",
        classificacao: { alvo: { protocol_id: "vbmapp", dominio_id: "mand" } },
        criadoEm: "2026-08-01T12:00:00.000Z",
      },
    },
  ],
  alvosPorPaciente: {
    "00000000-0000-0000-0000-0000000000a1": [
      {
        goal_id: "00000000-0000-0000-0000-0000000000g1",
        protocol_id: null,
        dominio_id: null,
        tipo_estrutura: null,
      },
    ],
    "00000000-0000-0000-0000-0000000000a2": [
      {
        goal_id: null,
        protocol_id: "vbmapp",
        dominio_id: "mand",
        tipo_estrutura: "marco_simples",
      },
    ],
  },
};

test("ValidacaoFila — sem violações axe (fila vazia)", async () => {
  await semViolacoes(<ValidacaoFila {...VAZIA} />);
});

test("ValidacaoFila — sem violações axe (fila com itens)", async () => {
  await semViolacoes(<ValidacaoFila {...CHEIA} />);
});
