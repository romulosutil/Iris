import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { RelatoriosExport } from "./relatorios-export";
import { FamiliaReport } from "./familia-report";

vi.mock("./actions", () => ({
  previewConvenioBrutoAction: vi.fn(async () => ({
    sessoesRealizadas: 0,
    faltasJustificadas: 0,
    evidenciasAprovadas: 0,
  })),
  exportarConvenioBrutoAction: vi.fn(async () => ({ reportId: "r1", hash: "h1" })),
  gerarRascunhoFamiliaAction: vi.fn(async () => ({ error: "stub" })),
  curarFamiliaAction: vi.fn(async () => ({ ok: true })),
  exportarFamiliaAction: vi.fn(async () => ({ reportId: "r1", hash: "h1" })),
}));

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const resultado = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const PACIENTES = [
  { id: "00000000-0000-0000-0000-0000000000a1", nome: "Paciente A" },
  { id: "00000000-0000-0000-0000-0000000000a2", nome: "Paciente B" },
];

test("RelatoriosExport — sem violações axe (sem pacientes)", async () => {
  await semViolacoes(<RelatoriosExport pacientes={[]} />);
});

test("RelatoriosExport — sem violações axe (com pacientes)", async () => {
  await semViolacoes(<RelatoriosExport pacientes={PACIENTES} />);
});

test("FamiliaReport — sem violações axe (coordenador)", async () => {
  await semViolacoes(<FamiliaReport pacientes={PACIENTES} podeCurar />);
});

test("FamiliaReport — sem violações axe (terapeuta, sem curar)", async () => {
  await semViolacoes(<FamiliaReport pacientes={PACIENTES} podeCurar={false} />);
});
