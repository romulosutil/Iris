import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { ExcecoesList } from "./excecoes-list";
import type { ListaExcecoes } from "./queries";

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const resultado = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const AGORA = new Date("2026-07-12T12:00:00Z").getTime();

const VAZIA: ListaExcecoes = {
  extracoesFalhas: [],
  revisoesIncompletas: [],
  total: 0,
  agora: AGORA,
};

const CHEIA: ListaExcecoes = {
  extracoesFalhas: [
    {
      sessionId: "00000000-0000-0000-0000-000000000001",
      pacienteNome: "Paciente A",
      terapeutaNome: "Terapeuta X",
      desdeEm: new Date("2026-07-11T08:00:00Z"),
    },
  ],
  revisoesIncompletas: [
    {
      sessionId: "00000000-0000-0000-0000-000000000002",
      pacienteNome: null,
      terapeutaNome: "Terapeuta Y",
      quantidade: 3,
      maisAntigaEm: new Date("2026-07-09T08:00:00Z"),
    },
  ],
  total: 2,
  agora: AGORA,
};

test("ExcecoesList — sem violações axe (clínica em dia)", async () => {
  await semViolacoes(<ExcecoesList {...VAZIA} />);
});

test("ExcecoesList — sem violações axe (falhas + revisões represadas)", async () => {
  await semViolacoes(<ExcecoesList {...CHEIA} />);
});
