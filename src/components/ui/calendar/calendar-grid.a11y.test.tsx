import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { CalendarGrid, type CalendarEvento } from "./calendar-grid";
import { CalendarEventCard } from "./calendar-event-card";

/**
 * #283 · critério 3 — a11y das DUAS variantes da escala "Dia": a grade
 * (desktop) e a lista cronológica de mobile (R-30). O gate mobile do repo
 * (`e2e/mobile-app.spec.ts`, `e2e/mobile-toque.spec.ts`) mede estouro
 * horizontal e alvo de toque; nenhum dos dois olha semântica de teclado/leitor
 * de tela dentro do card de evento.
 *
 * O caso que importa é o card COM ação (check-in), porque é assim que
 * `/agenda` monta a grade — e é ele que aninha um controle dentro de outro.
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

const sessoes: CalendarEvento[] = [
  {
    id: "s1",
    agendadaPara: new Date("2026-08-12T12:00:00Z"),
    estado: "agendada",
    terapeutaId: "t1",
    terapeutaNome: "Dra. Beatriz",
    pacienteNome: "Arthur",
    disciplina: "Fono",
  },
  {
    id: "s2",
    agendadaPara: new Date("2026-08-12T13:00:00Z"),
    estado: "agendada",
    terapeutaId: "t2",
    terapeutaNome: "Dr. Caio",
    pacienteNome: "Lucas",
    disciplina: "Psicologia",
  },
  {
    id: "s3",
    agendadaPara: new Date("2026-08-12T14:00:00Z"),
    estado: "realizada",
    terapeutaId: "t3",
    terapeutaNome: "Dra. Denise",
    pacienteNome: "Mariana",
    disciplina: "TO",
  },
];

// 3+ terapeutas: é o cenário do QA que abriu a #283.
const recursos = [
  { id: "t1", nome: "Dra. Beatriz" },
  { id: "t2", nome: "Dr. Caio" },
  { id: "t3", nome: "Dra. Denise" },
];

/** Espelha o `renderEvent` real de `/agenda`: card do DS + ação do app. */
function renderEventoComAcao(
  s: CalendarEvento,
  ctx: {
    horarioStr?: string;
    variante: "detalhada" | "compacta";
    mostrarTerapeuta: boolean;
  },
) {
  return (
    <CalendarEventCard
      pacienteNome={s.pacienteNome ?? "Paciente"}
      disciplinaNome={s.disciplina}
      horarioStr={ctx.horarioStr}
      estado={s.estado}
      terapeutaNome={
        ctx.mostrarTerapeuta ? (s.terapeutaNome ?? undefined) : undefined
      }
      variante={ctx.variante}
      onClick={() => {}}
      acao={
        s.estado === "agendada" ? <button type="button">Check-in</button> : null
      }
    />
  );
}

async function violacoes(container: HTMLElement) {
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      // Contraste não é medível sob jsdom (memória
      // `doc-ds-conflita-com-a11y-menta-terracota`).
      "color-contrast": { enabled: false },
      // Aninhamento interativo é justamente o que este arquivo mede.
      "nested-interactive": { enabled: true },
    },
  });
  return resultado.violations;
}

describe("CalendarGrid — a11y da escala Dia (#283)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("mobile: lista cronológica com ação de check-in — sem violações axe", async () => {
    stubMatchMedia(true);

    const { container } = render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={recursos}
        fuso="America/Sao_Paulo"
        renderEvent={renderEventoComAcao}
      />,
    );

    expect(await violacoes(container)).toEqual([]);
  });

  it("desktop: grade com ação de check-in — sem violações axe", async () => {
    stubMatchMedia(false);

    const { container } = render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={recursos}
        fuso="America/Sao_Paulo"
        renderEvent={renderEventoComAcao}
      />,
    );

    expect(await violacoes(container)).toEqual([]);
  });

  it("mobile: a ação do card não depende de hover para existir na tela", () => {
    stubMatchMedia(true);

    const { container } = render(
      <CalendarGrid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={recursos}
        fuso="America/Sao_Paulo"
        renderEvent={renderEventoComAcao}
      />,
    );

    const envelope = Array.from(
      container.querySelectorAll<HTMLElement>("div"),
    ).find(
      (el) =>
        el.children.length === 1 && el.children[0]?.textContent === "Check-in",
    );

    // O oráculo é a classe, não o estilo computado: jsdom não aplica o CSS do
    // Tailwind, então `getComputedStyle` responderia `display: block` mesmo
    // para `class="hidden"`. Um `hidden` SEM prefixo de variante esconde a
    // ação em qualquer viewport — e toque não tem hover para revelá-la.
    expect(envelope, "envelope da ação não encontrado").toBeTruthy();
    const classes = envelope!.className.split(/\s+/);
    expect(classes).not.toContain("hidden");
    expect(classes).toContain("md:hidden");
    expect(classes).toContain("md:group-hover:block");
    // Teclado no desktop: sem `focus-within` a ação some ao chegar por Tab.
    expect(classes).toContain("md:group-focus-within:block");
  });
});
