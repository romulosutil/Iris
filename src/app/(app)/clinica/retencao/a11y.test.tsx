import axe from "axe-core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("./actions", () => ({ purgarPacienteAction: vi.fn() }));

afterEach(cleanup);

async function semViolacoes(alvo: HTMLElement) {
  const r = await axe.run(alvo, {
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
  expect(r.violations).toEqual([]);
}

async function renderizar(ui: ReactElement) {
  const { container } = render(ui);
  return container;
}

const PRIMEIRA = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Ana Clara Ferrão",
  altaEm: "10/03/2016",
  venceEm: "10/03/2026",
  avisadoEm: "10/12/2025 03:00",
};

const LINHAS = [
  PRIMEIRA,
  {
    id: "22222222-2222-4222-8222-222222222222",
    nome: "Bruno Sampaio",
    altaEm: "01/01/2015",
    venceEm: "01/01/2025",
    avisadoEm: null,
  },
];

test("fila com linhas sem violações", async () => {
  const { FilaTabela } = await import("./fila-tabela");
  await semViolacoes(await renderizar(<FilaTabela linhas={LINHAS} />));
}, 15000);

test("fila vazia sem violações", async () => {
  const { FilaTabela } = await import("./fila-tabela");
  await semViolacoes(await renderizar(<FilaTabela linhas={[]} />));
}, 15000);

/**
 * O diálogo é o que importa aqui: ele é modal, tem campo controlado, instrução
 * ligada por `aria-describedby` e um botão que começa desabilitado. Rodar o axe
 * só na tabela deixaria tudo isso sem cobertura — e o conteúdo do `Dialog` do
 * Radix vive num portal, fora do `container` do `render`.
 */
test("diálogo de expurgo aberto sem violações", async () => {
  const { DialogoExpurgo } = await import("./dialogo-expurgo");
  render(<DialogoExpurgo pacienteId={PRIMEIRA.id} nome={PRIMEIRA.nome} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Expurgar prontuário" }));
  await semViolacoes(await screen.findByRole("dialog"));
}, 20000);
