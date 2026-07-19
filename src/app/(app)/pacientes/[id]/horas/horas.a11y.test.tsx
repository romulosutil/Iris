import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";

// A page importa a cadeia getTenantContext → @/db/client (abre conexão
// Postgres no load). No jsdom só renderizamos a tabela pura (a query nunca é
// invocada), então neutralizamos server-only e o client de banco — mesmo
// padrão de agenda/a11y.test.tsx.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("@/app/(app)/agenda/horas-queries", () => ({
  carregarHorasPaciente: vi.fn(),
}));

const { TabelaHoras } = await import("./page");

afterEach(cleanup);

const linhas = [
  { disciplina: "aba", alvo: 12, agendado: 8, realizado: 7.5, alerta: true },
  { disciplina: "fono", alvo: null, agendado: 1.5, realizado: 1.5, alerta: false },
];

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
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

test("TabelaHoras — sem violações axe", async () => {
  await semViolacoes(<TabelaHoras linhas={linhas} />);
});

test("tabela tem os quatro cabeçalhos", () => {
  render(<TabelaHoras linhas={linhas} />);
  expect(screen.getByRole("table")).not.toBeNull();
  for (const cab of ["Disciplina", "Alvo", "Agendado", "Realizado"]) {
    expect(
      screen.getByRole("columnheader", { name: new RegExp(cab, "i") }),
    ).not.toBeNull();
  }
});

test("alvo nulo renderiza travessão", () => {
  render(<TabelaHoras linhas={linhas} />);
  expect(screen.getByText("—")).not.toBeNull();
});

test("linha com alerta renderiza um Alert acessível", () => {
  render(<TabelaHoras linhas={linhas} />);
  // role=status (Alert severidade="info"), com o título exato.
  const alerta = screen.getByRole("status");
  expect(alerta.textContent).toMatch(/abaixo do prescrito/i);
  expect(screen.getByText("Abaixo do prescrito")).not.toBeNull();
});

test("sem alerta quando nenhuma linha está abaixo do prescrito", () => {
  render(
    <TabelaHoras
      linhas={[{ disciplina: "aba", alvo: 12, agendado: 12, realizado: 12, alerta: false }]}
    />,
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText(/abaixo do prescrito/i)).toBeNull();
});
