import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSalvarRPD, mockGetTenantContext, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockSalvarRPD: vi.fn(),
    mockGetTenantContext: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/auth/tenant", () => ({
  getTenantContext: mockGetTenantContext,
}));

vi.mock("./logic", () => ({
  salvarRPD: mockSalvarRPD,
}));

import { salvarRPDAction } from "./actions";

describe("TCC · salvarRPDAction (Server Action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantContext.mockResolvedValue({
      clinicId: "clinic-1",
      userId: "user-1",
      role: "terapeuta",
    });
    mockSalvarRPD.mockResolvedValue({ id: "rpd-1" });
  });

  it("extrai corretamente todos os campos do formato Padesky do FormData", async () => {
    const formData = new FormData();
    formData.set("situacao", "Apresentação de projeto");
    formData.set("pensamentoAutomatico", "Vão achar meu trabalho ruim");
    formData.set("emocao", "Ansiedade");
    formData.set("intensidade", "85");
    formData.set("credibilidadeInicial", "90");
    formData.set("evidenciasFavor", "Falta um gráfico no slide 4");
    formData.set(
      "evidenciasContra",
      "Os resultados principais foram atingidos",
    );
    formData.set(
      "respostaRacional",
      "O trabalho está sólido e o gráfico é opcional",
    );
    formData.set("credibilidadeAlternativa", "80");
    formData.append("distorcoesCognitivas", "catastrofizacao");
    formData.append("distorcoesCognitivas", "filtro_mental");
    formData.set(
      "comportamentoResultante",
      "Revisei os slides e respirei fundo",
    );
    formData.set("intensidadePos", "30");
    formData.set("sessionId", "00000000-0000-0000-0000-000000000099");

    const res = await salvarRPDAction("paciente-123", {}, formData);

    expect(res).toEqual({ ok: true });
    expect(mockSalvarRPD).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: "clinic-1", role: "terapeuta" }),
      {
        patientId: "paciente-123",
        situacao: "Apresentação de projeto",
        pensamentoAutomatico: "Vão achar meu trabalho ruim",
        emocao: "Ansiedade",
        intensidade: 85,
        credibilidadeInicial: 90,
        evidenciasFavor: "Falta um gráfico no slide 4",
        evidenciasContra: "Os resultados principais foram atingidos",
        respostaRacional: "O trabalho está sólido e o gráfico é opcional",
        credibilidadeAlternativa: 80,
        distorcoesCognitivas: ["catastrofizacao", "filtro_mental"],
        comportamentoResultante: "Revisei os slides e respirei fundo",
        intensidadePos: 30,
        sessionId: "00000000-0000-0000-0000-000000000099",
      },
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/pacientes/paciente-123/tcc",
    );
  });

  it("converte campos opcionais vazios para null e distorcoes vazias para array vazio", async () => {
    const formData = new FormData();
    formData.set("situacao", "Trânsito lento");
    formData.set("pensamentoAutomatico", "Vou perder o compromisso");
    formData.set("emocao", "Irritação");
    formData.set("intensidade", "70");

    const res = await salvarRPDAction("paciente-123", {}, formData);

    expect(res).toEqual({ ok: true });
    expect(mockSalvarRPD).toHaveBeenCalledWith(expect.anything(), {
      patientId: "paciente-123",
      situacao: "Trânsito lento",
      pensamentoAutomatico: "Vou perder o compromisso",
      emocao: "Irritação",
      intensidade: 70,
      credibilidadeInicial: null,
      evidenciasFavor: null,
      evidenciasContra: null,
      respostaRacional: null,
      credibilidadeAlternativa: null,
      distorcoesCognitivas: [],
      comportamentoResultante: null,
      intensidadePos: null,
      sessionId: null,
    });
  });

  it("retorna erro quando salvarRPD falha", async () => {
    mockSalvarRPD.mockResolvedValue({ error: "Erro de validação clínica" });

    const formData = new FormData();
    formData.set("situacao", "Gatilho");
    formData.set("pensamentoAutomatico", "Pensamento");
    formData.set("emocao", "Medo");
    formData.set("intensidade", "50");

    const res = await salvarRPDAction("paciente-123", {}, formData);

    expect(res).toEqual({ error: "Erro de validação clínica" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
