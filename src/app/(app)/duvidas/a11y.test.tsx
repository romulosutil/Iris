import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { DuvidasLista } from "./duvidas-lista";
import type { DuvidaAberta } from "./queries";
import type { AlvoValido } from "../validacao/alvos";

vi.mock("./actions", () => ({
  responderQueryAction: vi.fn(async () => ({})),
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
  itens: DuvidaAberta[];
  alvosPorPaciente: Record<string, AlvoValido[]>;
} = {
  itens: [],
  alvosPorPaciente: {},
};

const CHEIA: {
  itens: DuvidaAberta[];
  alvosPorPaciente: Record<string, AlvoValido[]>;
} = {
  itens: [
    {
      evidenceQueryId: "00000000-0000-0000-0000-000000000010",
      evidenceId: "00000000-0000-0000-0000-000000000001",
      patientId: "00000000-0000-0000-0000-0000000000a1",
      sessionNumero: 3,
      pergunta: "O apontar foi espontâneo ou com dica gestual?",
      criadoEm: "2026-07-10T12:00:00.000Z",
      trecho:
        'Paciente apontou para o brinquedo após o terapeuta perguntar "o que você quer?".',
      classificacaoAtual: {
        alvo: {
          goal_id: "00000000-0000-0000-0000-0000000000g1",
          protocol_id: null,
          dominio_id: null,
          tipo_estrutura: null,
        },
        nivel_ajuda: "dica_verbal",
        polaridade: "positivo",
      },
    },
    {
      evidenceQueryId: "00000000-0000-0000-0000-000000000011",
      evidenceId: "00000000-0000-0000-0000-000000000002",
      patientId: "00000000-0000-0000-0000-0000000000a2",
      sessionNumero: 5,
      pergunta: "A recusa foi registrada no protocolo correto?",
      criadoEm: "2026-07-11T09:30:00.000Z",
      trecho:
        "Paciente recusou a atividade proposta virando o rosto e empurrando o material.",
      classificacaoAtual: {
        alvo: {
          goal_id: null,
          protocol_id: "vbmapp",
          dominio_id: "mand",
          tipo_estrutura: "marco_simples",
        },
        nivel_ajuda: "independente",
        polaridade: "negativo",
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

test("DuvidasLista — sem violações axe (lista vazia)", async () => {
  await semViolacoes(<DuvidasLista {...VAZIA} />);
});

test("DuvidasLista — sem violações axe (lista com itens)", async () => {
  await semViolacoes(<DuvidasLista {...CHEIA} />);
});
