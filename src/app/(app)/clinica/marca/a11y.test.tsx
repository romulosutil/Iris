import axe from "axe-core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const r = await axe.run(container, {
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

const MARCA_VAZIA = {
  corPrimaria: null,
  logoDataUri: null,
  nomeClinica: "Clínica Vida Plena",
};

test("form de marca da clínica sem violações", async () => {
  const { MarcaForm } = await import("./marca-form");
  await semViolacoes(<MarcaForm marca={MARCA_VAZIA} />);
}, 15000);

/**
 * #258, guardrail 3 — a pré-visualização não pode vender ao coordenador a
 * ideia de um documento inteiramente branco: o selo do Iris aparece nela,
 * marcado como travado, ainda que a clínica tenha marca configurada.
 */
test("a pré-visualização mostra o selo Iris mesmo com marca configurada", async () => {
  const { MarcaForm } = await import("./marca-form");
  const { SELO_IRIS } = await import("@/lib/branding/marca");
  render(
    <MarcaForm
      marca={{
        corPrimaria: "#1f4e79",
        logoDataUri: "data:image/png;base64,iVBORw0KGgo=",
        nomeClinica: "Clínica Vida Plena",
      }}
    />,
  );
  expect(screen.getByTestId("preview-selo-iris").textContent).toContain(
    SELO_IRIS,
  );
});
