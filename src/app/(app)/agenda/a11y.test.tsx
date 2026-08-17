import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

// CheckInButton importa ./actions ("use server"), que puxa a cadeia
// getTenantContext → @/db/client (abre conexão Postgres no load). No
// jsdom só renderizamos os componentes (a action nunca é invocada), então
// neutralizamos server-only e o client de banco.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { EstadoBadge } = await import("./estado-badge");
const { CheckInButton } = await import("./checkin-button");
const { ItemPendencia, SecaoPendencias } = await import("./page");
const { sessionEstado } = await import("@/db/schema");
const SESSION_ESTADOS = sessionEstado.enumValues;

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

test.each(SESSION_ESTADOS)(
  "EstadoBadge %s — sem violações axe",
  async (estado) => {
    await semViolacoes(<EstadoBadge estado={estado} />);
  },
);

test("CheckInButton — sem violações axe", async () => {
  await semViolacoes(
    <CheckInButton sessionId="00000000-0000-0000-0000-000000000000" />,
  );
});

// Task 9 (etapa E): listas derivadas de pendência na grade.
const terapeutas = [{ id: "t1", nome: "Dra. Sofia" }];
const sessaoPendente = {
  id: "00000000-0000-0000-0000-000000000000",
  agendadaPara: new Date("2026-07-11T12:00:00-03:00"),
  estado: "agendada" as const,
  terapeutaId: "t1",
  terapeutaNome: "Dra. Sofia",
  pacienteNome: "Paciente P",
  patientId: "p1",
  disciplina: "psicologia",
};
const sessaoFalta = { ...sessaoPendente, estado: "falta_paciente" as const };

test("ItemPendencia (consolidação) — sem violações axe", async () => {
  await semViolacoes(
    <ul>
      <ItemPendencia
        sessao={sessaoPendente}
        tipo="consolidacao"
        terapeutas={terapeutas}
      />
    </ul>,
  );
});

test("ItemPendencia (reposição) — sem violações axe", async () => {
  await semViolacoes(
    <ul>
      <ItemPendencia
        sessao={sessaoFalta}
        tipo="reposicao"
        terapeutas={terapeutas}
      />
    </ul>,
  );
});

test("SecaoPendencias — vazio não renderiza nada", () => {
  const { container } = render(
    <SecaoPendencias
      tituloId="t"
      titulo="Pendentes"
      itens={[]}
      tipo="consolidacao"
      terapeutas={terapeutas}
    />,
  );
  expect(container.textContent).toBe("");
});

test("SecaoPendencias (pendentes de consolidação) — sem violações axe", async () => {
  await semViolacoes(
    <SecaoPendencias
      tituloId="pendentes-consolidacao-titulo"
      titulo="Pendentes de consolidação"
      itens={[sessaoPendente]}
      tipo="consolidacao"
      terapeutas={terapeutas}
    />,
  );
});

test("SecaoPendencias (reposições pendentes) — sem violações axe", async () => {
  await semViolacoes(
    <SecaoPendencias
      tituloId="reposicoes-pendentes-titulo"
      titulo="Reposições pendentes"
      itens={[sessaoFalta]}
      tipo="reposicao"
      terapeutas={terapeutas}
    />,
  );
});
