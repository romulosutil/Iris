import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

afterEach(cleanup);

// Variante que RE-HABILITA color-contrast (o harness padrão o desliga):
async function semViolacoesComContraste(ui: ReactElement) {
  const { container } = render(ui);
  const r = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false } },
    // color-contrast NÃO desabilitado aqui — ativo por padrão
  });
  expect(r.violations).toEqual([]);
}

test("editor de disponibilidade (grade) sem violações, contraste incluído", async () => {
  const { DisponibilidadeEditor } = await import("./disponibilidade-editor");
  await semViolacoesComContraste(
    <DisponibilidadeEditor terapeutaId="t1" passoMin={30} celulasIniciais={new Set()} />,
  );
});
