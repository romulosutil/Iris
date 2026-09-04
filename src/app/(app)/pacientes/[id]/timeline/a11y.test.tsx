import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import type { TimelineData } from "./queries";

// TimelineClient importa ./actions ("use server") → getTenantContext →
// @/db/client (abre conexão no load). No jsdom só renderizamos; as actions
// disparadas pelos efeitos de carga viram dublês que resolvem vazio.
// `TimelineClient` usa `useRouter().refresh()` para o "Tentar de novo" do bloco
// de rotinas (#558 · T5). Sem o mock, o render em jsdom morre com "invariant
// expected app router to be mounted" — e a asserção de ausência seguinte
// ficaria verde sobre uma tela que nunca renderizou.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/pacientes/p1",
}));
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

// Forma REAL do snapshot (materializar.ts / anamnese): indexado por META,
// snake_case; `metrica` ora objeto, ora string. O ESTADO do marco, porém, vem
// do status oficial (`estadoDasMetas` + `candidatoOficial`), não do snapshot.
const dados: TimelineData = {
  snapshots: [
    {
      sessionNumero: 2,
      geradoEm: new Date("2026-08-20T12:00:00Z"),
      repertorioState: {
        [META_CONQ]: {
          nivel_ajuda_recente: 0,
          contagem: 3,
          niveis_nao_classificados: 0,
          is_candidata: true,
        },
        [META_CAND]: {
          nivel_ajuda_recente: 1,
          contagem: 2,
          niveis_nao_classificados: 0,
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
        [META_CAND]: {
          [PROTO]: {
            tipo_estrutura: "marco_simples",
            rotulo: "Pede com duas palavras",
            metrica: "nivel_ajuda",
          },
        },
      },
      espectro: { eixos: [], naoClassificados: 0, niveisNaoClassificados: 0 },
    },
    {
      sessionNumero: 1,
      geradoEm: new Date("2026-08-13T12:00:00Z"),
      repertorioState: {
        [META_CONQ]: {
          nivel_ajuda_recente: 2,
          contagem: 1,
          niveis_nao_classificados: 0,
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
      espectro: { eixos: [], naoClassificados: 0, niveisNaoClassificados: 0 },
    },
  ],
  estadoDasMetas: {
    [META_CONQ]: { estado: "dominada", candidataOficial: false },
    [META_CAND]: { estado: "ativa", candidataOficial: true },
  },
  metasAtivas: [
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
      candidatoOficial: false,
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
      candidatoOficial: false,
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
      candidatoOficial: false,
    },
  ],
};

/**
 * Rotina de verdade (#558 · T5) para o axe medir o bloco montado, e não o
 * texto de estado vazio. Inclui a etapa com nível FORA da taxonomia, que é o
 * caminho onde o significado corre mais risco de virar só cor.
 */
const ROTINAS = [
  {
    extractionId: "ext_rotina_1",
    nome: "Lanche",
    sessionNumero: 2,
    dataSessao: new Date("2026-09-01T13:00:00Z"),
    ancorada: true,
    metaDescricao: "Alimentar-se com autonomia",
    etapas: [
      {
        ordinal: 0,
        descricao: "Abrir a lancheira",
        nivelAjuda: "independente",
        naoClassificado: false,
      },
      {
        ordinal: 1,
        descricao: "Apontar o suco",
        nivelAjuda: "quase sozinho",
        naoClassificado: true,
      },
    ],
  },
];

test("TimelineClient — vista 'No tempo' (marcos conquistado/candidato/não atingido + barra) sem violações axe", async () => {
  await semViolacoes(
    <TimelineClient
      patientId={PID}
      pacienteNome="Paciente Teste"
      initialData={dados}
      vista="tempo"
      rotinas={ROTINAS}
      papel="coordenador"
    />,
  );
  // Estado pelo status OFICIAL (meta dominada / candidatura registrada), não
  // pela heurística do snapshot — revisão da PR #556.
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
      rotinas={[]}
      papel="coordenador"
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
      rotinas={[]}
      papel="coordenador"
    />,
  );
});
