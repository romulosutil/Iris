import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GradeDisponibilidade } from "./grade-disponibilidade";
import { chaveCelula } from "@/lib/agenda/grade";

afterEach(cleanup);

describe("GradeDisponibilidade — teclado", () => {
  test("Enter na célula focada alterna disponibilidade e chama onChange", () => {
    const onChange = vi.fn();
    render(
      <GradeDisponibilidade passoMin={60} abertura="08:00" fechamento="10:00" celulasIniciais={new Set()} onChange={onChange} />,
    );
    const cel = screen.getByRole("gridcell", { name: /segunda.*08:00/i });
    cel.focus();
    fireEvent.keyDown(cel, { key: "Enter" });
    expect(onChange).toHaveBeenCalled();
    const ultima: Set<string> = onChange.mock.calls.at(-1)![0];
    expect(ultima.has(chaveCelula(1, "08:00"))).toBe(true);
  });

  test("Espaço desmarca célula já selecionada", () => {
    const onChange = vi.fn();
    render(
      <GradeDisponibilidade
        passoMin={60}
        abertura="08:00"
        fechamento="10:00"
        celulasIniciais={new Set([chaveCelula(1, "08:00")])}
        onChange={onChange}
      />,
    );
    const cel = screen.getByRole("gridcell", { name: /segunda.*08:00.*disponível/i });
    cel.focus();
    fireEvent.keyDown(cel, { key: " " });
    const ultima: Set<string> = onChange.mock.calls.at(-1)![0];
    expect(ultima.has(chaveCelula(1, "08:00"))).toBe(false);
  });

  test("botão copiar replica segunda nos demais dias úteis", () => {
    const onChange = vi.fn();
    render(
      <GradeDisponibilidade
        passoMin={60}
        abertura="08:00"
        fechamento="09:00"
        celulasIniciais={new Set([chaveCelula(1, "08:00")])}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /copiar segunda/i }));
    const ultima: Set<string> = onChange.mock.calls.at(-1)![0];
    expect(ultima.has(chaveCelula(2, "08:00"))).toBe(true);
    expect(ultima.has(chaveCelula(5, "08:00"))).toBe(true);
  });
});

describe("GradeDisponibilidade — navegação por setas (roving tabindex)", () => {
  test("ArrowRight move o foco para a próxima coluna", () => {
    render(
      <GradeDisponibilidade passoMin={60} abertura="08:00" fechamento="10:00" celulasIniciais={new Set()} onChange={vi.fn()} />,
    );
    const cel = screen.getByRole("gridcell", { name: /segunda 08:00/i });
    cel.focus();
    fireEvent.keyDown(cel, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: /segunda 09:00/i }));
  });

  test("ArrowDown move o foco para o mesmo horário no dia seguinte", () => {
    render(
      <GradeDisponibilidade passoMin={60} abertura="08:00" fechamento="10:00" celulasIniciais={new Set()} onChange={vi.fn()} />,
    );
    const cel = screen.getByRole("gridcell", { name: /segunda 08:00/i });
    cel.focus();
    fireEvent.keyDown(cel, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: /terça 08:00/i }));
  });

  test("Shift+ArrowRight pinta a célula de destino", () => {
    const onChange = vi.fn();
    render(
      <GradeDisponibilidade passoMin={60} abertura="08:00" fechamento="10:00" celulasIniciais={new Set()} onChange={onChange} />,
    );
    const cel = screen.getByRole("gridcell", { name: /segunda 08:00/i });
    cel.focus();
    fireEvent.keyDown(cel, { key: "ArrowRight", shiftKey: true });
    const ultima: Set<string> = onChange.mock.calls.at(-1)![0];
    expect(ultima.has(chaveCelula(1, "09:00"))).toBe(true);
  });
});
