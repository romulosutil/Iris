import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { deriveEstadoSessao, type EntradaSessao } from "@/lib/sessao/estado";

// PassoDocumentar reusa CapturaForm/ConsolidarForm de /diario, que importam
// ./actions ("use server") → getTenantContext → @/db/client. No jsdom só
// renderizamos os componentes; a action nunca é invocada.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { Timeline } = await import("./[id]/timeline");
const { PassoDocumentar } = await import("./[id]/passo-documentar");

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
const AGORA = new Date("2026-09-01T12:00:00.000Z");

function base(overrides: Partial<EntradaSessao> = {}): EntradaSessao {
  return {
    estado: "agendada",
    agendadaPara: AGORA,
    temNotaConsolidada: false,
    extracoes: [],
    itensNaFilaValidacao: 0,
    ...overrides,
  };
}

test("Timeline — sem violações axe (estado normal)", async () => {
  const resultado = deriveEstadoSessao(base({ estado: "realizada" }), AGORA);
  await semViolacoes(<Timeline resultado={resultado} />);
});

test("Timeline — sem violações axe (precisa_atencao)", async () => {
  const resultado = deriveEstadoSessao(
    base({
      estado: "realizada",
      temNotaConsolidada: true,
      extracoes: [{ estado: "sugerida" }],
      itensNaFilaValidacao: 1,
    }),
    AGORA,
  );
  await semViolacoes(<Timeline resultado={resultado} />);
});

test("PassoDocumentar — sem violações axe (sem captura, Consolidar desabilitado)", async () => {
  await semViolacoes(
    <PassoDocumentar
      sessionId={SESSION_ID}
      protocolos={[]}
      protocolIdsPreSelecionados={[]}
      asrHabilitado={false}
      temCaptura={false}
      ehDono={true}
    />,
  );
});

test("PassoDocumentar — sem violações axe (com captura, Consolidar habilitado)", async () => {
  await semViolacoes(
    <PassoDocumentar
      sessionId={SESSION_ID}
      protocolos={[]}
      protocolIdsPreSelecionados={[]}
      asrHabilitado={false}
      temCaptura={true}
      ehDono={true}
    />,
  );
});

test("PassoDocumentar — sem violações axe (#514: coordenador não-dono, somente leitura)", async () => {
  await semViolacoes(
    <PassoDocumentar
      sessionId={SESSION_ID}
      protocolos={[]}
      protocolIdsPreSelecionados={[]}
      asrHabilitado={false}
      temCaptura={true}
      ehDono={false}
    />,
  );
});
