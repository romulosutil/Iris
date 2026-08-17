import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

// RevisaoLista importa ./actions ("use server") → getTenantContext → @/db/client
// (abre conexão no load). No jsdom só renderizamos (a action nunca é invocada),
// então neutralizamos server-only e o client de banco.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { RevisaoLista } = await import("./[sessionId]/revisao-lista");
import type { ExtracaoRevisavel } from "./[sessionId]/queries";

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

const SID = "00000000-0000-0000-0000-000000000000";

const alta: ExtracaoRevisavel = {
  id: "11111111-1111-1111-1111-111111111111",
  subtipo: "evidencia",
  trechoFonte: "puxou a mão do terapeuta até a porta",
  confianca: "alta",
  justificativaConfianca: "verbo de ação claro no relato",
  inconsistenteComHistorico: false,
  nivelFriccao: "baixo",
  resumo: [{ rotulo: "Função", valor: "mando" }],
  historico: [],
};

const baixa: ExtracaoRevisavel = {
  id: "22222222-2222-2222-2222-222222222222",
  subtipo: "evidencia",
  trechoFonte: "disse algo como carro",
  confianca: "baixa",
  justificativaConfianca: null,
  inconsistenteComHistorico: false,
  nivelFriccao: "medio",
  resumo: [
    { rotulo: "Função", valor: "indefinida (a confirmar pelo terapeuta)" },
  ],
  historico: [],
};

const inconsistente: ExtracaoRevisavel = {
  id: "33333333-3333-3333-3333-333333333333",
  subtipo: "evidencia",
  trechoFonte: "precisou de dica física para pedir água",
  confianca: "alta",
  justificativaConfianca: "contradiz sessões anteriores",
  inconsistenteComHistorico: true,
  nivelFriccao: "alto",
  resumo: [{ rotulo: "Nível de ajuda", valor: "dica física" }],
  historico: [
    {
      id: "44444444-4444-4444-4444-444444444444",
      trechoFonte: "pediu água sozinho, sem dica",
      resumo: [{ rotulo: "Nível de ajuda", valor: "independente" }],
      revisadoEm: new Date("2026-06-01T12:00:00Z"),
    },
  ],
};

test("RevisaoLista — dono, 3 níveis de fricção (compacto + expandidos) sem violações axe", async () => {
  await semViolacoes(
    <RevisaoLista
      sessionId={SID}
      extracoes={[alta, baixa, inconsistente]}
      ehDono
    />,
  );
});

test("RevisaoLista — coordenador acompanhando (sem ações) sem violações axe", async () => {
  await semViolacoes(
    <RevisaoLista
      sessionId={SID}
      extracoes={[baixa, inconsistente]}
      ehDono={false}
    />,
  );
});

test("RevisaoLista — estado vazio sem violações axe", async () => {
  await semViolacoes(<RevisaoLista sessionId={SID} extracoes={[]} ehDono />);
});
