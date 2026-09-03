import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { TimelineClient } from "./timeline-client";
import * as actions from "./actions";
import type { TimelineData, TimelineSnapshot } from "./queries";
import { ORDEM_EIXOS, ROTULO_EIXO } from "@/lib/evidence/espectro";

vi.mock("./actions", () => ({
  carregarDeltaSessaoAction: vi.fn(),
  carregarComparacaoAction: vi.fn(),
  carregarEvidenciasAction: vi.fn(),
}));

function mockSnapshot(sessionNumero: number): TimelineSnapshot {
  return {
    sessionNumero,
    geradoEm: new Date("2026-08-20T10:00:00Z"),
    repertorioState: {},
    segmentacao: {},
    espectro: {
      eixos: ORDEM_EIXOS.map((e) => ({
        eixo: e,
        rotulo: ROTULO_EIXO[e],
        valor: 50,
        alvos: 2,
        medidos: 2,
        dominados: 0,
        candidatos: 0,
        contagemEvidencias: 4,
      })),
      naoClassificados: 0,
      niveisNaoClassificados: 0,
    },
  };
}

function mockTimelineData(sessoes: number[]): TimelineData {
  return {
    snapshots: sessoes.map(mockSnapshot),
    estadoDasMetas: {},
    metasAtivas: [],
    protocolosAtivos: [],
    milestonesAtivos: [],
  };
}

describe("TimelineClient — T28 (Carregamento de delta com marco 0)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(actions, "carregarDeltaSessaoAction").mockResolvedValue({
      delta: { itens: [], evidenciasNovas: 0, metasCandidatasNovas: 0 },
      metas: [],
      milestones: [],
    });
  });

  it("com sessaoAtiva = 0, carregarDeltaSessaoAction é chamada com a sessão 0", async () => {
    const carregarSpy = vi
      .spyOn(actions, "carregarDeltaSessaoAction")
      .mockResolvedValueOnce({
        delta: { itens: [], evidenciasNovas: 0, metasCandidatasNovas: 0 },
        metas: [],
        milestones: [],
      });

    render(
      <TimelineClient
        patientId="pat-123"
        pacienteNome="Paciente Teste"
        initialData={mockTimelineData([0])}
        vista="sessao"
      />,
    );

    await waitFor(() => {
      expect(carregarSpy).toHaveBeenCalledWith("pat-123", 0);
    });
  });

  it("com estado null (sem snapshots), carregarDeltaSessaoAction NÃO é chamada", async () => {
    const carregarSpy = vi
      .spyOn(actions, "carregarDeltaSessaoAction")
      .mockResolvedValueOnce({
        delta: { itens: [], evidenciasNovas: 0, metasCandidatasNovas: 0 },
        metas: [],
        milestones: [],
      });

    render(
      <TimelineClient
        patientId="pat-123"
        pacienteNome="Paciente Teste"
        initialData={mockTimelineData([])}
        vista="sessao"
      />,
    );

    expect(carregarSpy).not.toHaveBeenCalled();
  });

  it("falha de rede cai no estado de erro, nunca no empty state de nenhuma alteração", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(actions, "carregarDeltaSessaoAction").mockRejectedValue(
      new Error("Network failure"),
    );

    render(
      <TimelineClient
        patientId="pat-123"
        pacienteNome="Paciente Teste"
        initialData={mockTimelineData([0])}
        vista="sessao"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("O resumo desta sessão não foi carregado"),
      ).toBeTruthy();
    });

    expect(
      screen.queryByText("Nenhuma alteração clínica registrada nesta sessão"),
    ).toBeNull();
  });
});

describe("TimelineClient — T29 (Abertura do Scrubber)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(actions, "carregarDeltaSessaoAction").mockResolvedValue({
      delta: { itens: [], evidenciasNovas: 0, metasCandidatasNovas: 0 },
      metas: [],
      milestones: [],
    });
  });

  it("com sessoesDisponiveis = [0], scrubber renderiza Anamnese e nunca Sessão 0", async () => {
    render(
      <TimelineClient
        patientId="pat-123"
        pacienteNome="Paciente Teste"
        initialData={mockTimelineData([0])}
        vista="tempo"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Anamnese").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Sessão 0")).toBeNull();
  });

  it("com sessoesDisponiveis = [], não renderiza scrubber e não chama delta", () => {
    const carregarSpy = vi.spyOn(actions, "carregarDeltaSessaoAction");

    const { container } = render(
      <TimelineClient
        patientId="pat-123"
        pacienteNome="Paciente Teste"
        initialData={mockTimelineData([])}
        vista="tempo"
      />,
    );

    expect(carregarSpy).not.toHaveBeenCalled();
    expect(container.querySelector("#scrubber-slider")).toBeNull();
  });

  it("não-regressão: com sessoesDisponiveis = [1, 2, 3], abre na sessão 3", async () => {
    render(
      <TimelineClient
        patientId="pat-123"
        pacienteNome="Paciente Teste"
        initialData={mockTimelineData([1, 2, 3])}
        vista="tempo"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Sessão 3")).toBeTruthy();
    });
  });
});
