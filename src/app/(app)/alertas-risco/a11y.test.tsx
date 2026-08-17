import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { FilaRisco } from "./fila-risco";
import type { ItemRisco } from "./queries";

vi.mock("./actions", () => ({
  reconhecerAction: vi.fn(async () => ({})),
  resolverAction: vi.fn(async () => ({})),
  descartarAction: vi.fn(async () => ({})),
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

/** Prazo sempre no futuro/passado relativo ao agora do teste, nunca fixo. */
const emMinutos = (min: number) =>
  new Date(Date.now() + min * 60_000).toISOString();

function base(over: Partial<ItemRisco>): ItemRisco {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    pacienteNome: "Paciente Um",
    pacienteNascimento: "1990-05-10",
    sessionId: "22222222-2222-4222-8222-222222222222",
    sessaoEm: "2026-07-28T10:00:00.000Z",
    categoria: "ideacao_suicida",
    severidade: "ideacao_ativa_com_plano",
    certeza: "explicito",
    trechoFonte: "Trecho literal do relato de sessão, exibido sem paráfrase.",
    detalhe: "Detalhe estruturado do sinal identificado.",
    status: "aberto",
    prazoMinutos: 15,
    prazoReconhecimento: emMinutos(10),
    reconhecidoEm: null,
    reconhecidoPorNome: null,
    escaladoEm: null,
    escaladoEstagio2Em: null,
    condutaRegistrada: null,
    motivoDescarte: null,
    criadoEm: "2026-07-28T10:05:00.000Z",
    ...over,
  };
}

const CHEIA: ItemRisco[] = [
  base({}),
  base({
    id: "33333333-3333-4333-8333-333333333333",
    certeza: "ambiguo_citado",
    categoria: "autolesao",
    severidade: "autolesao_recente",
    status: "reconhecido",
    reconhecidoPorNome: "Coordenadora Dois",
    prazoMinutos: 60,
    prazoReconhecimento: emMinutos(-30),
  }),
  base({
    id: "44444444-4444-4444-8444-444444444444",
    // violência sofrida + menor de idade → aviso do ECA renderizado.
    categoria: "violencia_sofrida",
    severidade: "violencia_sofrida",
    pacienteNascimento: "2015-01-20",
    status: "escalado_estagio_2",
    prazoMinutos: 240,
    prazoReconhecimento: emMinutos(-500),
  }),
  base({
    id: "55555555-5555-4555-8555-555555555555",
    // violência sofrida sem nascimento cadastrado → aviso condicional.
    categoria: "violencia_sofrida",
    severidade: "violencia_sofrida",
    pacienteNascimento: null,
    status: "escalado_estagio_1",
  }),
  base({
    id: "66666666-6666-4666-8666-666666666666",
    status: "resolvido",
    condutaRegistrada: "Contato feito, paciente encaminhado ao psiquiatra.",
  }),
  base({
    id: "77777777-7777-4777-8777-777777777777",
    status: "descartado",
    motivoDescarte:
      "Trecho é citação de letra de música, revisto com o paciente.",
  }),
];

test("FilaRisco — sem violações axe (fila vazia)", async () => {
  await semViolacoes(<FilaRisco itens={[]} />);
});

test("FilaRisco — sem violações axe (fila com itens)", async () => {
  await semViolacoes(<FilaRisco itens={CHEIA} />);
});
