import axe from "axe-core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
import { PosturaEquipe } from "./postura-equipe";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const r = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      // `axe` sob jsdom não calcula contraste: não concluir conformidade de cor
      // a partir deste teste verde.
      "color-contrast": { enabled: false },
    },
  });
  expect(r.violations).toEqual([]);
}

const RECEP = {
  id: "r1",
  nome: "Célia Recep",
  email: "recep@c.test",
  papeis: ["admin_recepcao"] as const,
};
const TERA = {
  id: "t1",
  nome: "Bruno Tera",
  email: "tera@c.test",
  papeis: ["terapeuta"] as const,
};

test("postura com pendências: sem violações", async () => {
  await semViolacoes(
    <PosturaEquipe
      postura={{
        semSegundoFator: [{ ...RECEP, papeis: [...RECEP.papeis] }],
        ativacaoPendente: [{ ...TERA, papeis: [...TERA.papeis] }],
        protegidos: 4,
        total: 6,
      }}
    />,
  );
});

test("postura sem pendências: sem violações", async () => {
  await semViolacoes(
    <PosturaEquipe
      postura={{
        semSegundoFator: [],
        ativacaoPendente: [],
        protegidos: 6,
        total: 6,
      }}
    />,
  );
});

// Régua de mutação (c) na camada de UI: o conforme só existe como contagem.
test("membro protegido não é renderizado nominalmente", () => {
  render(
    <PosturaEquipe
      postura={{
        semSegundoFator: [],
        ativacaoPendente: [{ ...TERA, papeis: [...TERA.papeis] }],
        protegidos: 5,
        total: 6,
      }}
    />,
  );

  expect(screen.getByText("5 de 6")).toBeDefined();
  expect(screen.queryByText(/em conformidade|Protegidos/i)).toBeNull();
});

// Régua de mutação (b): a copy proibida não pode voltar.
test('a tela nunca escreve "não ativou o 2FA" para papel clínico', () => {
  const { container } = render(
    <PosturaEquipe
      postura={{
        semSegundoFator: [],
        ativacaoPendente: [{ ...TERA, papeis: [...TERA.papeis] }],
        protegidos: 1,
        total: 2,
      }}
    />,
  );

  expect(container.textContent).toContain("ainda não fez o primeiro acesso");
  expect(container.textContent).not.toMatch(/não ativou/i);
});

test("estado de sucesso é o estado permanente da tela, não um toast", () => {
  const { container } = render(
    <PosturaEquipe
      postura={{
        semSegundoFator: [],
        ativacaoPendente: [],
        protegidos: 3,
        total: 3,
      }}
    />,
  );

  expect(container.textContent).toContain(
    "Toda a equipe está com segundo fator ativo",
  );
});
