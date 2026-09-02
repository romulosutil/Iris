import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ExtracaoRevisavel } from "./queries";

// Mesma neutralização do gate axe: ./actions ("use server") → getTenantContext
// → @/db/client abre conexão no load; aqui só renderizamos.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { RevisaoLista } = await import("./revisao-lista");

afterEach(cleanup);

const SID = "00000000-0000-0000-0000-000000000000";

const sugerida: ExtracaoRevisavel = {
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

test("U-02: card de extração sugerida usa surface('sugerida') — tracejado + inset, não a elevação de fato", () => {
  render(<RevisaoLista sessionId={SID} extracoes={[sugerida]} ehDono />);
  const card = document.querySelector('article[data-estado="sugerida"]');
  expect(card).not.toBeNull();
  const classes = card!.className;
  expect(classes).toContain("border-dashed");
  expect(classes).toContain("elevation-inset");
  // A sombra que LEVANTA (--ds-shadow / elevação 2) é de fato consolidado.
  expect(classes).not.toContain("ds-shadow");
  expect(classes).not.toContain("elevation-2");
});

test("DS-03: o trecho-fonte é uma ClinicalQuote, não blockquote com acento lateral ad hoc", () => {
  const { container } = render(
    <RevisaoLista sessionId={SID} extracoes={[sugerida]} ehDono />,
  );
  expect(screen.getByText("Trecho do relato")).not.toBeNull();
  expect(
    screen.getByText("puxou a mão do terapeuta até a porta"),
  ).not.toBeNull();
  const figure = container.querySelector("figure");
  expect(figure).not.toBeNull();
  expect(container.querySelector("blockquote.border-l-2")).toBeNull();
});
