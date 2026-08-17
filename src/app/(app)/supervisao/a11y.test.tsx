import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { SupervisaoFila } from "./supervisao-fila";
import type { ItemSupervisao } from "./queries";

vi.mock("./actions", () => ({
  reconhecerAlertaAction: vi.fn(async () => ({})),
  resolverAlertaAction: vi.fn(async () => ({})),
  descartarAlertaAction: vi.fn(async () => ({})),
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

const VAZIA = {
  itens: [],
};

const CHEIA = {
  itens: [
    {
      chaveNatural: "estagnacao:p1:g1:pr1",
      tipo: "estagnacao" as const,
      patientId: "p1",
      patientNome: "Paciente Estagnado",
      goalId: "g1",
      protocolId: "pr1",
      goalNome: "Goal 1",
      protocolNome: "Protocolo 1",
      detalhe: {
        metrica: "tempo",
        tipoEstrutura: "motor",
        sessionNumero: 5,
      },
      estado: "novo" as const,
      alertaId: null,
      sinalPresente: true,
    },
    {
      chaveNatural: "regressao:p2:g2:pr2",
      tipo: "regressao" as const,
      patientId: "p2",
      patientNome: "Paciente Regredido",
      goalId: "g2",
      protocolId: "pr2",
      goalNome: "Goal 2",
      protocolNome: "Protocolo 2",
      detalhe: {
        metrica: "porcentagem",
        tipoEstrutura: "tato",
        sessionNumero: 10,
      },
      estado: "reconhecido" as const,
      alertaId: "alerta-uuid-1",
      sinalPresente: true,
    },
    {
      chaveNatural: "faltas_excessivas:p3",
      tipo: "faltas_excessivas" as const,
      patientId: "p3",
      patientNome: "Paciente Faltoso",
      goalId: null,
      protocolId: null,
      goalNome: null,
      protocolNome: null,
      detalhe: {
        faltas: 4,
        janelaSemanas: 4,
        limiar: 3,
      },
      estado: "novo" as const,
      alertaId: null,
      sinalPresente: true,
    },
    {
      chaveNatural: "estagnacao:p4:g4:pr4",
      tipo: "estagnacao" as const,
      patientId: "p4",
      patientNome: "Paciente Sinal Cessou",
      goalId: "g4",
      protocolId: "pr4",
      goalNome: "Goal 4",
      protocolNome: "Protocolo 4",
      detalhe: {
        metrica: "tempo",
        tipoEstrutura: "motor",
        sessionNumero: 8,
      },
      estado: "reconhecido" as const,
      alertaId: "alerta-uuid-2",
      sinalPresente: false,
    },
  ],
};

test("SupervisaoFila — sem violações axe (fila vazia)", async () => {
  await semViolacoes(<SupervisaoFila {...VAZIA} />);
});

test("SupervisaoFila — sem violações axe (fila com itens)", async () => {
  await semViolacoes(<SupervisaoFila {...CHEIA} />);
});
