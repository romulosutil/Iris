import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  ProcedenciaMarcoZero,
  ROTULO_PROCEDENCIA,
} from "./procedencia-marco-zero";

describe("ProcedenciaMarcoZero", () => {
  it("renderiza copy pt-BR correta para relatado_responsavel quando origem é anamnese", () => {
    render(
      <ProcedenciaMarcoZero
        origem="anamnese"
        procedencia="relatado_responsavel"
      />,
    );
    const element = screen.getByRole("status");
    expect(element).toBeTruthy();
    expect(element.textContent).toContain("Relatado pelo responsável");
  });

  it("renderiza copy pt-BR correta para observado_avaliador quando origem é anamnese", () => {
    render(
      <ProcedenciaMarcoZero
        origem="anamnese"
        procedencia="observado_avaliador"
      />,
    );
    const element = screen.getByRole("status");
    expect(element).toBeTruthy();
    expect(element.textContent).toContain("Observado pelo avaliador");
  });

  it("renderiza copy pt-BR correta para registro_anterior quando origem é anamnese", () => {
    render(
      <ProcedenciaMarcoZero
        origem="anamnese"
        procedencia="registro_anterior"
      />,
    );
    const element = screen.getByRole("status");
    expect(element).toBeTruthy();
    expect(element.textContent).toContain("Registro anterior");
  });

  it("não renderiza nada (retorna null) quando origem não é anamnese", () => {
    const { container: c1 } = render(
      <ProcedenciaMarcoZero
        origem="sessao"
        procedencia="relatado_responsavel"
      />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ProcedenciaMarcoZero
        origem={undefined}
        procedencia="relatado_responsavel"
      />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("não renderiza nada (retorna null) quando procedência é ausente ou inválida", () => {
    const { container: c1 } = render(
      <ProcedenciaMarcoZero origem="anamnese" procedencia={null} />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ProcedenciaMarcoZero origem="anamnese" procedencia="invalido" />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("não executa nenhum fetch ou chamada de rede (componente puramente orientado a props)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <ProcedenciaMarcoZero
        origem="anamnese"
        procedencia="observado_avaliador"
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("exporta mapeamento completo de procedências para cópias pt-BR", () => {
    expect(ROTULO_PROCEDENCIA).toEqual({
      relatado_responsavel: "Relatado pelo responsável",
      observado_avaliador: "Observado pelo avaliador",
      registro_anterior: "Registro anterior",
    });
  });
});
