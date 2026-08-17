import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { UltimaSessaoSection } from "./ultima-sessao";
import { AlertaManejoBanner } from "./alerta-manejo";
import { ReforcadoresAtuaisSection } from "./reforcadores";

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

test("UltimaSessaoSection (vazia) — sem violações axe", async () => {
  await semViolacoes(<UltimaSessaoSection ultimaSessao={null} />);
});

test("UltimaSessaoSection (com linhas + candidata + ABC) — sem violações axe", async () => {
  await semViolacoes(
    <UltimaSessaoSection
      ultimaSessao={{
        sessionNumero: 46,
        geradoEm: new Date(),
        episodiosAbc: 1,
        linhas: [
          {
            chave: "g1",
            rotulo: "Mando independente",
            metrica: "5/5",
            isCandidata: true,
          },
          {
            chave: "g2",
            rotulo: "Tato de animais",
            metrica: "dica gestual",
            isCandidata: false,
          },
        ],
      }}
    />,
  );
});

test("AlertaManejoBanner (sem alertas) não renderiza nada e não quebra", async () => {
  const { container } = render(<AlertaManejoBanner alertas={[]} />);
  expect(container.firstChild).toBeNull();
});

test("AlertaManejoBanner (com alerta grave) — sem violações axe", async () => {
  await semViolacoes(
    <AlertaManejoBanner
      alertas={[
        {
          extractionId: "e1",
          antecedente: "atividade de mesa",
          comportamento: "fuga de tarefa",
          consequenciaRegulacao: "removida a atividade",
          sessionNumero: 46,
          revisadoEm: null,
        },
      ]}
    />,
  );
});

test("ReforcadoresAtuaisSection (vazia) — sem violações axe", async () => {
  await semViolacoes(<ReforcadoresAtuaisSection itens={[]} />);
});

test("ReforcadoresAtuaisSection (com itens) — sem violações axe", async () => {
  await semViolacoes(
    <ReforcadoresAtuaisSection
      itens={[
        { item: "Bolhas de sabão", valencia: "alta" },
        { item: "iPad (5min)", valencia: "alta" },
        { item: "Elogio social forte", valencia: "baixa" },
      ]}
    />,
  );
});
