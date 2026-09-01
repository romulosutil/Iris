import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CalendarGrid } from "./calendar-grid";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";

/**
 * R-30: em viewport estreito, a escala "Dia" (`modo="daily-resources"`) é
 * lista cronológica, não grade — uma grade de N colunas (1 por recurso) é
 * ilegível em 375px. O componente decide a variante lendo
 * `matchMedia("(max-width: 767px)")`; estes testes travam a decisão
 * simulando os dois lados do breakpoint, não o parâmetro `viewport` do
 * Storybook (conhecido quebrado nesta versão — memória
 * `storybook10-viewport-e-global-nao-parametro`).
 */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const sessoes: SessaoDoDia[] = [
  {
    id: "s2",
    agendadaPara: new Date("2026-08-12T12:00:00Z"),
    estado: "agendada",
    terapeutaId: "t1",
    terapeutaNome: "Dra. Beatriz",
    pacienteNome: "Lucas",
    patientId: "p2",
    disciplina: "Fono",
  },
  {
    id: "s1",
    agendadaPara: new Date("2026-08-12T09:00:00Z"),
    estado: "realizada",
    terapeutaId: "t1",
    terapeutaNome: "Dra. Beatriz",
    pacienteNome: "Arthur",
    patientId: "p1",
    disciplina: "Fono",
  },
];

const recursos = [{ id: "t1", nome: "Dra. Beatriz" }];

describe("CalendarGrid — escala Dia responsiva (R-30)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("desktop (viewport largo): renderiza grade, não lista", () => {
    stubMatchMedia(false);

    render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={recursos}
        fuso="America/Sao_Paulo"
      />,
    );

    expect(screen.getByTestId("calendar-day-grid")).toBeTruthy();
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.queryByTestId("calendar-day-list")).toBeNull();
  });

  it("mobile (viewport estreito): renderiza lista cronológica, não grade", () => {
    stubMatchMedia(true);

    render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={recursos}
        fuso="America/Sao_Paulo"
      />,
    );

    expect(screen.getByTestId("calendar-day-list")).toBeTruthy();
    expect(screen.queryByTestId("calendar-day-grid")).toBeNull();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("mobile: a lista está em ordem cronológica, não na ordem de entrada", () => {
    stubMatchMedia(true);

    render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={recursos}
        fuso="America/Sao_Paulo"
      />,
    );

    const itens = screen
      .getByTestId("calendar-day-list")
      .querySelectorAll("li");
    expect(itens).toHaveLength(2);
    // `sessoes` chega com s2 (12h) antes de s1 (9h) — a lista devolve por
    // horário real da sessão, não pela ordem do array de entrada.
    expect(itens[0]?.textContent).toContain("Arthur");
    expect(itens[1]?.textContent).toContain("Lucas");
  });

  it("mobile sem sessões: mostra estado vazio, não uma lista vazia muda", () => {
    stubMatchMedia(true);

    render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={[]}
        recursos={recursos}
        fuso="America/Sao_Paulo"
      />,
    );

    const lista = screen.getByTestId("calendar-day-list");
    expect(lista.tagName).not.toBe("UL");
    expect(lista.textContent).toMatch(/nenhuma sessão/i);
  });

  it("outros modos (não daily-resources) ignoram a variante mobile", () => {
    stubMatchMedia(true);

    render(
      <CalendarGrid
        modo="weekly-timeline"
        sessoes={sessoes}
        diasSemana={[{ dataISO: "2026-08-12", rotulo: "Quarta", diaSemana: 3 }]}
        fuso="America/Sao_Paulo"
      />,
    );

    expect(screen.queryByTestId("calendar-day-list")).toBeNull();
    expect(screen.getByRole("grid")).toBeTruthy();
  });
});
