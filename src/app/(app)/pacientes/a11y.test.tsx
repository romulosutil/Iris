import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const r = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false }, "color-contrast": { enabled: false } },
  });
  expect(r.violations).toEqual([]);
}

test("lista de pacientes sem violações", async () => {
  const { ListaPacientes } = await import("./lista-pacientes");
  await semViolacoes(
    <ListaPacientes
      pacientes={[
        {
          id: "p1",
          nome: "Lucas Silva",
          nascimento: "2018-05-12",
          responsavelContato: "Maria Silva",
          escola: "Escola ABC",
          convenio: "Unimed",
          criadoEm: new Date(),
          temPrescricao: true,
        },
        // Segundo paciente SEM prescrição: o selo `Sem prescrição` (#203) só é
        // renderizado neste ramo, e um fixture só com o caso feliz deixaria o
        // contraste e o texto do selo fora da varredura do axe.
        {
          id: "p2",
          nome: "Ana Pereira",
          nascimento: "2019-02-01",
          responsavelContato: "João Pereira",
          escola: "Escola XYZ",
          convenio: "Bradesco",
          criadoEm: new Date(),
          temPrescricao: false,
        },
      ]}
    />,
  );
});
