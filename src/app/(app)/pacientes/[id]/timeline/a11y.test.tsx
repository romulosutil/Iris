import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
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
  return container;
}

const PID = "00000000-0000-0000-0000-000000000000";
const M_CONQ = "11111111-1111-1111-1111-111111111111";
const M_CAND = "22222222-2222-2222-2222-222222222222";
const M_NAO = "33333333-3333-3333-3333-333333333333";
const META_CONQ = "44444444-4444-4444-4444-444444444444";
const META_CAND = "55555555-5555-5555-5555-555555555555";
const PROTO = "66666666-6666-6666-6666-666666666666";

// Forma REAL do snapshot (materializar.ts): indexado por META, snake_case.
const dados: TimelineData = {
  snapshots: [
    {
      sessionNumero: 2,
      geradoEm: new Date("2026-08-20T12:00:00Z"),
      repertorioState: {
        [META_CONQ]: {
          nivel_ajuda_recente: 0,
          contagem: 3,
          is_candidata: false,
        },
        [META_CAND]: {
          nivel_ajuda_recente: 1,
          contagem: 2,
          is_candidata: true,
        },
      },
      segmentacao: {
        [META_CONQ]: {
          [PROTO]: {
            tipo_estrutura: "marco_simples",
            rotulo: "evolucao",
            metrica: { eixo: "nivel_ajuda", ordinalRecente: 0 },
          },
        },
      },
      espectro: { eixos: [], naoClassificados: 0 },
    },
    {
      sessionNumero: 1,
      geradoEm: new Date("2026-08-13T12:00:00Z"),
      repertorioState: {
        [META_CONQ]: {
          nivel_ajuda_recente: 2,
          contagem: 1,
          is_candidata: false,
        },
      },
      segmentacao: {
        [META_CONQ]: {
          [PROTO]: {
            tipo_estrutura: "marco_simples",
            rotulo: "estagnacao",
            metrica: { eixo: "nivel_ajuda", ordinalRecente: 2 },
          },
        },
      },
      espectro: { eixos: [], naoClassificados: 0 },
    },
  ],
  metasAtivas: [
    { id: META_CONQ, descricao: "Pedir água", disciplina: "ABA" },
    { id: META_CAND, descricao: "Pedir com duas palavras", disciplina: "ABA" },
  ],
  protocolosAtivos: [{ id: PROTO, nome: "VB-MAPP", disciplina: "ABA" }],
  milestonesAtivos: [
    {
      id: M_CONQ,
      protocolId: PROTO,
      dominioId: "mando",
      nome: "Pede item preferido",
      nivel: "1",
      tipoEstrutura: "marco",
      ordem: 1,
      goalIds: [META_CONQ],
    },
    {
      id: M_CAND,
      protocolId: PROTO,
      dominioId: "mando",
      nome: "Pede com duas palavras",
      nivel: "2",
      tipoEstrutura: "marco",
      ordem: 2,
      goalIds: [META_CAND],
    },
    {
      id: M_NAO,
      protocolId: PROTO,
      dominioId: "mando",
      nome: "Pede informação",
      nivel: null,
      tipoEstrutura: "marco",
      ordem: 3,
      goalIds: [],
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
  // A-06: o estado vem do snapshot REAL (por meta, snake_case), não de campos
  // camelCase inexistentes — antes tudo caía em "não atingido".
  expect(screen.getByRole("img", { name: "Conquistado" })).not.toBeNull();
  expect(
    screen.getByRole("img", { name: "Candidato a domínio" }),
  ).not.toBeNull();
  expect(screen.getByRole("img", { name: "Não atingido" })).not.toBeNull();
  expect(
    screen.getByRole("img", { name: /Domínio mando: 1 de 3 conquistados/ }),
  ).not.toBeNull();
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
