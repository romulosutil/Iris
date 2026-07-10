import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { Button } from "./button";
import { Card } from "./card";
import { Alert } from "./alert";
import { Logo } from "./logo";

afterEach(cleanup);

/**
 * Gate a11y do design system: cada componente passa pelo axe sem violações
 * WCAG 2.x A/AA. Regras de página (landmark/region/heading únicos) ficam
 * desligadas porque testamos componentes isolados, não páginas.
 * Contraste é verificado à parte (paleta AAA, ver design-system doc §3) — o
 * jsdom não renderiza cores, então axe não computa contraste aqui.
 */
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
      // jsdom não renderiza cores; contraste é validado à parte (paleta AAA).
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

test("Button — sem violações axe", async () => {
  await semViolacoes(<Button>Aprovar sessão</Button>);
});

test("Button desabilitado — sem violações axe", async () => {
  await semViolacoes(<Button disabled>Aprovar sessão</Button>);
});

test("Card conquistado — sem violações axe", async () => {
  await semViolacoes(
    <Card estado="conquistado" titulo="Imita gesto simples">
      Fato consolidado.
    </Card>,
  );
});

test("Card candidato — sem violações axe", async () => {
  await semViolacoes(
    <Card estado="candidato" titulo="Imita gesto simples">
      Sugerido pela IA.
    </Card>,
  );
});

test("Alert erro — sem violações axe", async () => {
  await semViolacoes(
    <Alert severidade="erro" titulo="O áudio não foi enviado">
      Toque para tentar de novo.
    </Alert>,
  );
});

test("Alert info — sem violações axe", async () => {
  await semViolacoes(
    <Alert severidade="info" titulo="Primeira revisão">
      Aprove cada sugestão.
    </Alert>,
  );
});

test("Logo — sem violações axe", async () => {
  await semViolacoes(<Logo variante="completo" />);
});
