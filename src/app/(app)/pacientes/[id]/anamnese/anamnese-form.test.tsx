import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnamneseForm } from "./anamnese-form";

// Mock server actions
vi.mock("./actions", () => ({
  salvarRascunhoAnamneseAction: vi
    .fn()
    .mockResolvedValue({ ok: true, id: "ana-mock" }),
  validarAnamneseAction: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("T33 · AnamneseForm (UI)", () => {
  const defaultProps = {
    patientId: "00000000-0000-0000-0000-000000000001",
    patientNome: "Lucas Silva",
    isCoordenador: true,
    anamnese: null,
    milestones: [
      { id: "m1", rotulo: "Mando 1" },
      { id: "m2", rotulo: "Tato 1" },
    ],
    taxonomiaAjuda: ["Independente", "Dica Verbal", "Dica Gestual"],
  };

  test("contador de alvos está visível", () => {
    render(<AnamneseForm {...defaultProps} />);
    expect(screen.getByText("1 de 24 alvos")).toBeDefined();
  });

  test("botão 'Validar Anamnese' só aparece para coordenador", () => {
    const { rerender } = render(
      <AnamneseForm
        {...defaultProps}
        isCoordenador={false}
        anamnese={{
          id: "ana-draft",
          estado: "rascunho",
          criadoEm: "2026-03-01T00:00:00Z",
          alvos: [
            {
              eixo: "comunicacao_expressiva",
              descricao: "Alvo 1",
              nivel_ajuda_inicial: 1,
              procedencia: "relatado_responsavel",
              criterio_n: 3,
              criterio_m: 4,
              ciclo_revisao_semanas: 8,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("Validar Anamnese")).toBeNull();

    rerender(
      <AnamneseForm
        {...defaultProps}
        isCoordenador={true}
        anamnese={{
          id: "ana-draft",
          estado: "rascunho",
          criadoEm: "2026-03-01T00:00:00Z",
          alvos: [
            {
              eixo: "comunicacao_expressiva",
              descricao: "Alvo 1",
              nivel_ajuda_inicial: 1,
              procedencia: "relatado_responsavel",
              criterio_n: 3,
              criterio_m: 4,
              ciclo_revisao_semanas: 8,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Validar Anamnese")).toBeDefined();
  });

  test("bloqueia o 25º alvo com a mensagem exata do Zod", () => {
    const alvos24 = Array.from({ length: 24 }, (_, i) => ({
      eixo: "comunicacao_expressiva" as const,
      descricao: `Alvo #${i + 1}`,
      nivel_ajuda_inicial: 1,
      procedencia: "relatado_responsavel" as const,
      criterio_n: 3,
      criterio_m: 4,
      ciclo_revisao_semanas: 8,
    }));

    render(
      <AnamneseForm
        {...defaultProps}
        anamnese={{
          id: "ana-full",
          estado: "rascunho",
          criadoEm: "2026-03-01T00:00:00Z",
          alvos: alvos24,
        }}
      />,
    );

    expect(screen.getByText("24 de 24 alvos")).toBeDefined();
    expect(screen.getByText("Máximo de 24 alvos por anamnese.")).toBeDefined();

    const addBtn = screen.getByRole("button", {
      name: /\+ Adicionar Outro Alvo/i,
    });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("'Não avaliado' é uma opção explícita no select de nível de ajuda", () => {
    render(<AnamneseForm {...defaultProps} />);
    const selectNivel = screen.getByLabelText(
      "Nível de Ajuda Inicial (Marco Zero)",
    ) as HTMLSelectElement;

    expect(selectNivel.value).toBe("null");

    const optionNaoAvaliado = Array.from(selectNivel.options).find(
      (opt) => opt.value === "null",
    );
    expect(optionNaoAvaliado?.text).toContain("Não avaliado");

    // Selecionar 0 (Independente)
    fireEvent.change(selectNivel, { target: { value: "0" } });
    expect(selectNivel.value).toBe("0");

    // Voltar para Não avaliado (null)
    fireEvent.change(selectNivel, { target: { value: "null" } });
    expect(selectNivel.value).toBe("null");
  });

  test("mensagens de status usam role='status' e nunca role='alert'", () => {
    const { container } = render(
      <AnamneseForm
        {...defaultProps}
        anamnese={{
          id: "ana-full",
          estado: "rascunho",
          criadoEm: "2026-03-01T00:00:00Z",
          alvos: Array.from({ length: 24 }, (_, i) => ({
            eixo: "comunicacao_expressiva" as const,
            descricao: `Alvo #${i + 1}`,
            nivel_ajuda_inicial: 1,
            procedencia: "relatado_responsavel" as const,
            criterio_n: 3,
            criterio_m: 4,
            ciclo_revisao_semanas: 8,
          })),
        }}
      />,
    );

    const alertElements = container.querySelectorAll('[role="alert"]');
    expect(alertElements.length).toBe(0);

    const statusElements = container.querySelectorAll('[role="status"]');
    expect(statusElements.length).toBeGreaterThan(0);
  });

  test("anamnese validada renderiza modo somente leitura com link para timeline", () => {
    render(
      <AnamneseForm
        {...defaultProps}
        isCoordenador={true}
        anamnese={{
          id: "ana-val",
          estado: "validada",
          validadaEm: "2026-03-05T10:00:00Z",
          validadaPorNome: "Dra. Rebeca",
          criadoEm: "2026-03-01T00:00:00Z",
          alvos: [
            {
              id: "alvo-1",
              eixo: "comunicacao_expressiva",
              descricao: "Alvo Validado 1",
              nivel_ajuda_inicial: 1,
              procedencia: "relatado_responsavel",
              criterio_n: 3,
              criterio_m: 4,
              ciclo_revisao_semanas: 8,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/Anamnese Validada/)).toBeDefined();
    expect(screen.getByText("Somente Leitura")).toBeDefined();
    expect(screen.getByText("Ver Linha do Tempo")).toBeDefined();
    expect(screen.queryByText("Salvar Rascunho")).toBeNull();
    expect(screen.queryByText("Validar Anamnese")).toBeNull();
  });
});
