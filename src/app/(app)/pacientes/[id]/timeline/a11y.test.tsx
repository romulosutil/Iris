import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { TimelineData } from "./queries";

// TimelineClient importa ./actions ("use server") → getTenantContext →
// @/db/client (abre conexão no load). No jsdom só renderizamos; as actions
// disparadas pelos efeitos de carga viram dublês que resolvem vazio.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("./actions", () => ({
  carregarDeltaSessaoAction: vi
    .fn()
    .mockResolvedValue({ delta: null, metas: [], milestones: [] }),
  carregarComparacaoAction: vi.fn().mockResolvedValue(null),
  carregarEvidenciasAction: vi.fn().mockResolvedValue([]),
}));

const { TimelineClient } = await import("./timeline-client");

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  // Deixa os efeitos de carga (delta da sessão) assentarem antes do axe.
  await act(async () => {});
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      // jsdom não renderiza cores; contraste dos tokens é medido à parte
      // (tabela na PR do #538).
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const PID = "00000000-0000-0000-0000-000000000000";
const M_CONQ = "11111111-1111-1111-1111-111111111111";
const M_CAND = "22222222-2222-2222-2222-222222222222";
const M_NAO = "33333333-3333-3333-3333-333333333333";
const META = "44444444-4444-4444-4444-444444444444";

const dados: TimelineData = {
  snapshots: [
    {
      sessionNumero: 2,
      geradoEm: new Date("2026-08-20T12:00:00Z"),
      repertorioState: {
        [M_CONQ]: { nivelAjudaRecente: 0, isCandidata: false },
        [M_CAND]: { nivelAjudaRecente: 1, isCandidata: true },
      },
      segmentacao: {
        [META]: { rotulo: "evolucao", metrica: { ordinalRecente: 1 } },
      },
      espectro: { eixos: [], naoClassificados: 0 },
    },
    {
      sessionNumero: 1,
      geradoEm: new Date("2026-08-13T12:00:00Z"),
      repertorioState: {
        [M_CONQ]: { nivelAjudaRecente: 2, isCandidata: false },
      },
      segmentacao: {
        [META]: { rotulo: "estagnacao", metrica: { ordinalRecente: 2 } },
      },
      espectro: { eixos: [], naoClassificados: 0 },
    },
  ],
  metasAtivas: [{ id: META, descricao: "Pedir água", disciplina: "ABA" }],
  protocolosAtivos: [{ id: "p1", nome: "VB-MAPP", disciplina: "ABA" }],
  milestonesAtivos: [
    {
      id: M_CONQ,
      protocolId: "p1",
      dominioId: "mando",
      nome: "Pede item preferido",
      nivel: "1",
      tipoEstrutura: "marco",
      ordem: 1,
    },
    {
      id: M_CAND,
      protocolId: "p1",
      dominioId: "mando",
      nome: "Pede com duas palavras",
      nivel: "2",
      tipoEstrutura: "marco",
      ordem: 2,
    },
    {
      id: M_NAO,
      protocolId: "p1",
      dominioId: "mando",
      nome: "Pede informação",
      nivel: null,
      tipoEstrutura: "marco",
      ordem: 3,
    },
  ],
};

test("TimelineClient — vista 'No tempo' (marcos conquistado/candidato/não atingido + barra) sem violações axe", async () => {
  await semViolacoes(
    <TimelineClient
      patientId={PID}
      pacienteNome="Paciente Teste"
      initialData={dados}
      vista="tempo"
    />,
  );
});

test("TimelineClient — vista 'Esta sessão' sem violações axe", async () => {
  await semViolacoes(
    <TimelineClient
      patientId={PID}
      pacienteNome="Paciente Teste"
      initialData={dados}
      vista="sessao"
    />,
  );
});

test("TimelineClient — sem snapshots (estado vazio) sem violações axe", async () => {
  await semViolacoes(
    <TimelineClient
      patientId={PID}
      pacienteNome="Paciente Teste"
      initialData={{ ...dados, snapshots: [], milestonesAtivos: [] }}
      vista="tempo"
    />,
  );
});
