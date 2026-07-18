import axe from "axe-core";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

// PopoverAlocar importa ./actions ("use server"), que puxa getTenantContext →
// @/db/client (abre conexão Postgres no load). No jsdom só renderizamos o
// componente (a action nunca é invocada), então neutralizamos server-only e
// o client de banco — mesmo padrão de src/app/(app)/agenda/a11y.test.tsx.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { PopoverAlocar } = await import("./popover-alocar");

afterEach(cleanup);

async function semViolacoes(container: HTMLElement) {
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const props = {
  aberto: true,
  aoFechar: () => {},
  diaSemana: 1,
  inicioMin: 540,
  dataISO: "2026-07-13",
  semanaVisivelISO: "2026-07-13",
  hojeISO: "2026-07-13",
  eixo: "terapeuta" as const,
  entidadeFixa: { id: "t1", nome: "Dra. Sofia" },
  pacientes: [{ id: "p1", nome: "Ana Alfa" }],
  terapeutas: [{ id: "t1", nome: "Dra. Sofia" }],
  disciplinas: ["aba", "fono", "to"],
  duracaoPadrao: { aba: 60, fono: 30, to: 50 },
};

describe("PopoverAlocar", () => {
  test("dialog acessível sem violações axe (color-contrast desligado — jsdom sem canvas)", async () => {
    const { container } = render(<PopoverAlocar {...props} />);
    expect(screen.getByRole("dialog")).not.toBeNull();
    await semViolacoes(container);
  });

  test("data e hora são read-only (fixadas pelo slot)", () => {
    render(<PopoverAlocar {...props} />);
    expect(screen.getByText(/13\/07/)).not.toBeNull();
    expect(screen.getByText(/09:00/)).not.toBeNull();
  });

  test("toggle Recorrente|Avulsa alterna o modo (C6)", async () => {
    render(<PopoverAlocar {...props} />);
    const btnAvulsa = screen.getByRole("button", { name: /avulsa/i });
    const btnRecorrente = screen.getByRole("button", { name: /recorrente/i });
    expect(btnRecorrente.getAttribute("aria-pressed")).toBe("true");
    expect(btnAvulsa.getAttribute("aria-pressed")).toBe("false");
    // avulsa expõe o select "Tipo" que não existe no modo recorrente.
    expect(screen.queryByText(/^tipo$/i)).toBeNull();
    await userEvent.click(btnAvulsa);
    expect(btnAvulsa.getAttribute("aria-pressed")).toBe("true");
    expect(btnRecorrente.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/^tipo$/i)).not.toBeNull();
  });
});
