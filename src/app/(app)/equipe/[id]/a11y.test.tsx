import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

afterEach(cleanup);

// color-contrast fica DESABILITADO (como no harness padrão do repo): o axe mede
// contraste via canvas, que o jsdom não implementa (getContext lança) — habilitar
// aqui tornava este teste FLAKY. O contraste da grade é verificado na passada
// manual/browser-real (resíduo de a11y do spec §8); os tokens da grade usam
// border-ink/40 + bg-gold/bg-canvas do design system.
async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const r = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(r.violations).toEqual([]);
}

test("editor de disponibilidade (grade) sem violações de a11y estrutural", async () => {
  const { DisponibilidadeEditor } = await import("./disponibilidade-editor");
  await semViolacoes(
    <DisponibilidadeEditor terapeutaId="t1" passoMin={30} celulasIniciais={new Set()} />,
  );
});
