import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

// ExcecoesList → LinhaFalha → ReprocessarExtracao → reprocessarExtracaoAction
// ("use server") → getTenantContext → @/db/client (conexão no load). No jsdom
// só renderizamos (a action nunca é invocada), então neutralizamos o db.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

import { ExcecoesList } from "./excecoes-list";
import type { ListaExcecoes } from "./queries";

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
      terapeutaId: "00000000-0000-0000-0000-0000000000aa",
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

const OUTRO_USUARIO = "00000000-0000-0000-0000-0000000000bb";

test("ExcecoesList — sem violações axe (clínica em dia)", async () => {
  await semViolacoes(<ExcecoesList {...VAZIA} userId={OUTRO_USUARIO} />);
});

test("ExcecoesList — sem violações axe (falhas + revisões represadas)", async () => {
  await semViolacoes(<ExcecoesList {...CHEIA} userId={OUTRO_USUARIO} />);
});

// Clínica solo: o coordenador que abre o painel É o terapeuta dono da sessão.
// Com o botão renderizado, a a11y precisa continuar limpa.
test("ExcecoesList — sem violações axe (dono da sessão vê Reprocessar)", async () => {
  await semViolacoes(
    <ExcecoesList {...CHEIA} userId={CHEIA.extracoesFalhas[0]!.terapeutaId} />,
  );
});
