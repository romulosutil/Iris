import axe from "axe-core";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

// GerirSessao importa ./actions ("use server"), que puxa getTenantContext →
// @/db/client (abre conexão Postgres no load). No jsdom só renderizamos o
// componente (a action nunca é invocada), então neutralizamos server-only e
// o client de banco — mesmo padrão de popover-alocar.a11y.test.tsx.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

// jsdom não implementa a Pointer Events API usada pelo Radix Select
// internamente (hasPointerCapture/setPointerCapture/scrollIntoView) — sem
// isso, clicar numa opção lança TypeError. Polyfill mínimo só para os testes.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const { GerirSessao } = await import("./gerir-sessao");

afterEach(cleanup);

async function semViolacoes(container: HTMLElement) {
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

const terapeutas = [
  { id: "t1", nome: "Dra. Sofia" },
  { id: "t2", nome: "Dr. André" },
];

describe("GerirSessao", () => {
  test("botão Gerir abre o dialog e não tem violações axe (color-contrast desligado — jsdom sem canvas)", async () => {
    const { container } = render(
      <GerirSessao sessionId="s1" terapeutas={terapeutas} />,
    );
    const btnGerir = screen.getByRole("button", { name: /gerir/i });
    await userEvent.click(btnGerir);
    expect(screen.getByRole("dialog")).not.toBeNull();
    await semViolacoes(container);
  });

  test("select de estado está presente", async () => {
    render(<GerirSessao sessionId="s1" terapeutas={terapeutas} />);
    await userEvent.click(screen.getByRole("button", { name: /gerir/i }));
    expect(screen.getByText(/^estado$/i)).not.toBeNull();
  });

  test("escolher uma falta revela o controle de justificada", async () => {
    render(<GerirSessao sessionId="s1" terapeutas={terapeutas} />);
    await userEvent.click(screen.getByRole("button", { name: /gerir/i }));
    expect(screen.queryByText(/justificada/i)).toBeNull();
    await userEvent.click(screen.getByRole("combobox", { name: /estado/i }));
    await userEvent.click(
      await screen.findByRole("option", { name: /falta.*paciente/i }),
    );
    expect(screen.getByText(/justificada/i)).not.toBeNull();
  });
});
