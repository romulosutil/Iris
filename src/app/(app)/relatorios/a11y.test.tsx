import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { RelatoriosExport } from "./relatorios-export";
import { FamiliaReport } from "./familia-report";
import { ConvenioNarrativoReport } from "./convenio-narrativo-report";
import { gerarRascunhoConvenioNarrativoAction } from "./actions";

// jsdom não implementa a Pointer Events API usada pelo Radix Select
// internamente (hasPointerCapture/setPointerCapture/scrollIntoView) — sem
// isso, clicar numa opção lança TypeError. Polyfill mínimo só para os testes
// (mesmo padrão de agenda/gerir-sessao.a11y.test.tsx).
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

vi.mock("./actions", () => ({
  previewConvenioBrutoAction: vi.fn(async () => ({
    sessoesRealizadas: 0,
    faltasJustificadas: 0,
    evidenciasAprovadas: 0,
  })),
  exportarConvenioBrutoAction: vi.fn(async () => ({
    reportId: "r1",
    hash: "h1",
  })),
  gerarRascunhoFamiliaAction: vi.fn(async () => ({ error: "stub" })),
  curarFamiliaAction: vi.fn(async () => ({ ok: true })),
  exportarFamiliaAction: vi.fn(async () => ({ reportId: "r1", hash: "h1" })),
  gerarRascunhoConvenioNarrativoAction: vi.fn(async () => ({ error: "stub" })),
  curarConvenioNarrativoAction: vi.fn(async () => ({ ok: true })),
  exportarConvenioNarrativoAction: vi.fn(async () => ({
    reportId: "r1",
    hash: "h1",
  })),
}));

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

test("FamiliaReport — renderiza sob escopo data-mode='familia', sem regressão axe", async () => {
  // R6.6.1: o cartão da família é envolto por [data-mode="familia"] na página
  // (relatorios/page.tsx). Aqui espelhamos esse escopo e verificamos que o
  // cartão renderiza dentro dele e que os tokens do modo família não
  // introduzem violação axe.
  const { container } = render(
    <div data-mode="familia">
      <FamiliaReport pacientes={PACIENTES} podeCurar />
    </div>,
  );

  const escopo = container.querySelector('[data-mode="familia"]');
  expect(escopo).not.toBeNull();
  // o cartão da família (h3 do Card) está dentro do escopo família
  expect(escopo?.querySelector("h3")?.textContent).toContain(
    "Relatório da família",
  );

  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      // color-contrast fica desligado porque o JSDOM não computa cor/luminância
      // de CSS custom properties (não há layout/render real), então a regra do
      // axe produziria falso-negativo aqui — NÃO é prova de contraste.
      // O único token de cor novo do modo família (--action-primary:#B2DFDB) é
      // usado só como fill/borda/ring; o fg herda #000000 → contraste 15.9:1,
      // validado manualmente (piso AA = 4.5:1). Regressão de cor deve ser pega
      // por revisão de token/visual, não por este teste. Ver PR #73 / R6.6.1.
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
});

test("RelatoriosExport permanece clínico (fora do escopo data-mode='familia')", () => {
  // O escopo família é cirúrgico: os outros cartões da página não recebem
  // data-mode="familia" e herdam o modo clínico do <html>.
  const { container } = render(<RelatoriosExport pacientes={PACIENTES} />);
  expect(container.querySelector('[data-mode="familia"]')).toBeNull();
});

test("ConvenioNarrativoReport — sem violações axe (form inicial + cabeçalho)", async () => {
  await semViolacoes(
    <ConvenioNarrativoReport pacientes={PACIENTES} podeCurar />,
  );
});

test("ConvenioNarrativoReport — sem violações axe (form de curadoria após gerar)", async () => {
  vi.mocked(gerarRascunhoConvenioNarrativoAction).mockResolvedValueOnce({
    reportId: "r1",
    versao: 1,
    draft: {
      resumoClinico: "Resumo clínico do período.",
      evolucaoPorDominio: [
        { dominio: "Comunicação", narrativa: "Evoluiu bem." },
      ],
      justificativaContinuidade: "Justificativa de continuidade.",
      objetivosProximoPeriodo: ["Objetivo 1"],
      periodoSemAvancoVisivel: false,
      notaHonestidade: null,
      status: "rascunho_para_revisao",
    },
  });

  const user = userEvent.setup();
  const { container, getByLabelText, getByRole } = render(
    <ConvenioNarrativoReport pacientes={PACIENTES} podeCurar />,
  );

  await user.click(getByRole("combobox", { name: /paciente/i }));
  await user.click(
    await screen.findByRole("option", { name: PACIENTES[0]!.nome }),
  );

  fireEvent.change(getByLabelText("Início do período"), {
    target: { value: "2026-01-01" },
  });
  fireEvent.change(getByLabelText("Fim do período"), {
    target: { value: "2026-01-31" },
  });
  fireEvent.change(getByLabelText("Operadora"), {
    target: { value: "Unimed" },
  });
  fireEvent.change(getByLabelText("Finalidade"), {
    target: { value: "Renovação de autorização" },
  });

  fireEvent.click(getByRole("button", { name: /gerar rascunho com ia/i }));

  await waitFor(() => {
    expect(getByLabelText("Resumo clínico")).toBeTruthy();
  });

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
});
