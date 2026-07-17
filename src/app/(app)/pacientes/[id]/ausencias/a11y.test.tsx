import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
afterEach(cleanup);
async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const r = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false }, "color-contrast": { enabled: false } },
  });
  expect(r.violations).toEqual([]);
}
test("form de ausência do paciente sem violações", async () => {
  const { AusenciasForm } = await import("./ausencias-form");
  await semViolacoes(<AusenciasForm patientId="p1" bloqueios={[]} />);
});
