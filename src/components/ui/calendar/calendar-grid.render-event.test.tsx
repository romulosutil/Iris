import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CalendarGrid, type CalendarEvento } from "./calendar-grid";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

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

type EventoDoApp = CalendarEvento & { checkInEm: Date | null };

const sessoes: EventoDoApp[] = [
  {
    id: "s1",
    agendadaPara: new Date("2026-08-12T12:00:00Z"),
    estado: "agendada",
    terapeutaId: "t1",
    terapeutaNome: "Dra. Beatriz",
    pacienteNome: "Lucas",
    disciplina: "Fono",
    checkInEm: null,
  },
];

describe("CalendarGrid — inversão de dependência (A-01, #538)", () => {
  it("nenhum arquivo de ui/calendar importa de @/app", () => {
    const dir = path.resolve(import.meta.dirname);
    const fontes = readdirSync(dir).filter(
      (f) => f.endsWith(".tsx") || f.endsWith(".ts"),
    );
    expect(fontes.length).toBeGreaterThan(0);
    for (const f of fontes) {
      const txt = readFileSync(path.join(dir, f), "utf8");
      expect(txt, f).not.toMatch(/from\s+["']@\/app\//);
    }
  });

  it("renderEvent recebe o evento tipado do app e o contexto do slot", () => {
    stubMatchMedia(false);
    const renderEvent = vi.fn((s: EventoDoApp, ctx) => (
      <span data-testid="evento-do-app">
        {s.pacienteNome} {ctx.horarioStr} {ctx.variante}
      </span>
    ));
    render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={[{ id: "t1", nome: "Dra. Beatriz" }]}
        fuso="America/Sao_Paulo"
        abertura="08:00"
        fechamento="10:00"
        renderEvent={renderEvent}
      />,
    );
    expect(renderEvent).toHaveBeenCalledTimes(1);
    const [evento, contexto] = renderEvent.mock.calls[0]!;
    expect(evento.checkInEm).toBeNull(); // o T do app volta inteiro
    expect(contexto).toEqual({
      horarioStr: "09:00",
      variante: "detalhada",
      mostrarTerapeuta: false,
    });
    expect(screen.getByTestId("evento-do-app").textContent).toContain(
      "Lucas 09:00 detalhada",
    );
  });

  it("sem renderEvent, a grade usa o card puro do DS e onEventClick", async () => {
    stubMatchMedia(true);
    const onEventClick = vi.fn();
    render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={[{ id: "t1", nome: "Dra. Beatriz" }]}
        fuso="America/Sao_Paulo"
        onEventClick={onEventClick}
      />,
    );
    const card = screen.getByRole("button", { name: /Lucas/ });
    card.click();
    expect(onEventClick).toHaveBeenCalledWith(sessoes[0]);
  });

  it("sem `fuso`, cai no fuso do navegador (nunca numa constante do app)", () => {
    stubMatchMedia(true);
    render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={[{ id: "t1", nome: "Dra. Beatriz" }]}
      />,
    );
    expect(screen.getByTestId("calendar-day-list")).toBeTruthy();
  });
});
