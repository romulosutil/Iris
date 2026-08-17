import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

// CapturaForm/ConsolidarForm importam ./actions ("use server"), que puxa a
// cadeia getTenantContext → @/db/client (abre conexão Postgres no load). No
// jsdom só renderizamos os componentes (a action nunca é invocada), então
// neutralizamos server-only e o client de banco.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

// getUserMedia não existe no jsdom — AudioLocal (embutido no CapturaForm) só
// acessa isso ao clicar "Gravar áudio", que este gate não exerce.

const { CapturaForm } = await import("./[sessionId]/captura-form");
const { ConsolidarForm } = await import("./[sessionId]/consolidar-form");

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

const SESSION_ID = "00000000-0000-0000-0000-000000000000";
const PROTOCOLOS = [
  { id: "11111111-1111-1111-1111-111111111111", nome: "ABA — Programa 1" },
  {
    id: "22222222-2222-2222-2222-222222222222",
    nome: "TO — Integração sensorial",
  },
];

test("CapturaForm — sem violações axe (com protocolos)", async () => {
  await semViolacoes(
    <CapturaForm
      sessionId={SESSION_ID}
      protocolos={PROTOCOLOS}
      protocolIdsPreSelecionados={[PROTOCOLOS[0]!.id]}
    />,
  );
});

test("CapturaForm — sem violações axe (sem protocolos)", async () => {
  await semViolacoes(
    <CapturaForm
      sessionId={SESSION_ID}
      protocolos={[]}
      protocolIdsPreSelecionados={[]}
    />,
  );
});

test("ConsolidarForm — sem violações axe", async () => {
  await semViolacoes(<ConsolidarForm sessionId={SESSION_ID} />);
});
