import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { SourceAttributionBadge } from "./source-attribution-badge";

// Sem `jest-dom` neste repo: `toBeInTheDocument` estoura "Invalid Chai
// property". As asserções vão sobre o DOM cru.

const NOTA = "9f1c4a2e-7b3d-4c8f-9a10-2b6d5e4f1c30";
const QUANDO = new Date("2026-03-10T13:00:00Z");

describe("SourceAttributionBadge", () => {
  it("mostra a data ORIGINAL da sessão em pt-BR e o ISO em <time dateTime>", () => {
    const { container } = render(
      <SourceAttributionBadge sessionNoteId={NOTA} sessaoEm={QUANDO} />,
    );
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.getAttribute("dateTime")).toBe("2026-03-10T13:00:00.000Z");
    // A data legível é a mesma do ISO, formatada — não um segundo dado.
    expect(time?.textContent).toBe(
      new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(QUANDO),
    );
  });

  it("carrega o session_note_id em data-session-note-id (rastreabilidade)", () => {
    const { container } = render(
      <SourceAttributionBadge sessionNoteId={NOTA} sessaoEm={QUANDO} />,
    );
    const el = container.querySelector("[data-session-note-id]");
    expect(el?.getAttribute("data-session-note-id")).toBe(NOTA);
  });

  it("NÃO expõe o UUID inteiro como texto visível", () => {
    const { container } = render(
      <SourceAttributionBadge sessionNoteId={NOTA} sessaoEm={QUANDO} />,
    );
    expect(container.textContent).not.toContain(NOTA);
  });

  it("mostra o número da sessão quando conhecido e o omite quando não é", () => {
    const { container: com } = render(
      <SourceAttributionBadge
        sessionNoteId={NOTA}
        sessaoEm={QUANDO}
        numeroSessao={45}
      />,
    );
    expect(com.textContent).toContain("sessão 45");

    const { container: sem } = render(
      <SourceAttributionBadge
        sessionNoteId={NOTA}
        sessaoEm={QUANDO}
        numeroSessao={null}
      />,
    );
    expect(sem.textContent).not.toContain("sessão");
  });

  it("aceita string ISO além de Date", () => {
    const { container } = render(
      <SourceAttributionBadge
        sessionNoteId={NOTA}
        sessaoEm="2026-03-10T13:00:00Z"
      />,
    );
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-03-10T13:00:00.000Z",
    );
  });

  it("data inválida degrada para texto, sem <time> com dateTime quebrado", () => {
    const { container } = render(
      <SourceAttributionBadge sessionNoteId={NOTA} sessaoEm="não é data" />,
    );
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).toContain("data indisponível");
  });

  it("usa a paleta de IA (violeta) e borda tracejada — nunca a de dado aprovado", () => {
    // Honestidade epistêmica (`AGENTS.md` §2): trecho recuperado não pode se
    // parecer com dado validado por humano (verde, borda sólida).
    const { container } = render(
      <SourceAttributionBadge sessionNoteId={NOTA} sessaoEm={QUANDO} />,
    );
    const classe = container.firstElementChild?.getAttribute("class") ?? "";
    expect(classe).toContain("border-dashed");
    expect(classe).toContain("--status-ia-border");
    expect(classe).not.toContain("--status-success");
  });

  it("renderiza o rótulo padrão e aceita customização", () => {
    render(<SourceAttributionBadge sessionNoteId={NOTA} sessaoEm={QUANDO} />);
    expect(screen.getByText("Recuperado de")).toBeDefined();

    render(
      <SourceAttributionBadge
        sessionNoteId={NOTA}
        sessaoEm={QUANDO}
        rotulo="Fonte"
      />,
    );
    expect(screen.getByText("Fonte")).toBeDefined();
  });
});
