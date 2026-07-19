import axe from "axe-core";
import { act, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

vi.mock("./actions", () => ({
  estenderAction: vi.fn(),
  encerrarRegraAction: vi.fn(),
  contarFuturasAction: vi.fn(async () => 3),
  proximaSessaoAction: vi.fn(async () => "2026-07-20"),
  conflitosAction: vi.fn(async () => ["2026-07-20"]),
}));

const { PopoverRegra } = await import("./popover-regra");

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

describe("PopoverRegra a11y", () => {
  test("dialog acessível sem violações axe (color-contrast desligado — jsdom sem canvas)", async () => {
    const { container } = render(
      <PopoverRegra
        regraId="r1"
        rotulo="Ana · aba"
        proximaSessaoISO="2026-07-20"
        hojeISO="2026-07-18"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
    // aguarda o useEffect (conflitosAction) resolver e o setState flush
    // antes de rodar axe, senão a lista de conflitos ainda não está no DOM.
    await act(async () => {
      await Promise.resolve();
    });
    await semViolacoes(container);
  });
});
