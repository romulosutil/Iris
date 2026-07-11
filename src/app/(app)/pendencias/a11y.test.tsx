import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { PendenciasList } from "./pendencias-list";
import type { ListaPendencias } from "./queries";

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
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const VAZIA: ListaPendencias = {
  capturasAConsolidar: [],
  extracaoPendente: [],
  sugestoesDemo: [],
  total: 0,
};

const CHEIA: ListaPendencias = {
  capturasAConsolidar: [
    {
      sessionId: "00000000-0000-0000-0000-000000000001",
      pacienteNome: "Paciente A",
      capturadoEm: new Date("2026-07-11T12:00:00Z"),
    },
  ],
  extracaoPendente: [
    {
      id: "00000000-0000-0000-0000-000000000002",
      sessionId: "00000000-0000-0000-0000-000000000003",
      pacienteNome: "Paciente B",
      subtipo: "evidencia",
      criadoEm: new Date("2026-07-11T12:00:00Z"),
    },
  ],
  sugestoesDemo: [
    {
      id: "00000000-0000-0000-0000-000000000004",
      sessionId: "00000000-0000-0000-0000-000000000005",
      pacienteNome: null,
      subtipo: "registro_abc",
      criadoEm: new Date("2026-07-11T12:00:00Z"),
    },
  ],
  total: 3,
};

test("PendenciasList — sem violações axe (estado vazio, dia limpo)", async () => {
  await semViolacoes(<PendenciasList {...VAZIA} />);
});

test("PendenciasList — sem violações axe (com as 3 categorias)", async () => {
  await semViolacoes(<PendenciasList {...CHEIA} />);
});
