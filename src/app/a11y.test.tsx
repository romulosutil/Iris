import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

// next/font/local explode fora do build do Next (TypeError no vitest).
vi.mock("next/font/local", () => ({
  default: ({ src }: { src: string }) => ({
    variable: `mock-${src.replace(/^.*\//, "").replace("-latin.woff2", "")}`,
  }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const { default: NotFound } = await import("./not-found");
const { default: ErrorPage } = await import("./error");
const { PaginaErro } = await import("@/components/ui/pagina-erro");

afterEach(cleanup);

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
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

test("NotFound — sem violações axe", async () => {
  await semViolacoes(<NotFound />);
});

test("ErrorPage — sem violações axe (com digest)", async () => {
  const erro = Object.assign(new Error("Falha"), { digest: "DIGEST-A11Y-1" });
  await semViolacoes(<ErrorPage error={erro} reset={() => {}} />);
});

// GlobalError define <html>/<body> próprios e não renderiza limpo dentro do
// container do RTL; o shell compartilhado cobre o mesmo DOM do body.
test("PaginaErro (shell do global-error) — sem violações axe", async () => {
  await semViolacoes(
    <PaginaErro
      codigo="Erro 500"
      titulo="Falha"
      descricao="Descrição."
      auditId="X-1"
    />,
  );
});
