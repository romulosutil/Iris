import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { BarraCobertura } from "./barra-cobertura";
import { calcularCobertura, type CoberturaDisciplina } from "./cobertura";

/**
 * Barra de cobertura (#203, fatia 5).
 *
 * Estes testes não conferem estilo — conferem as garantias que fazem a barra
 * ser confiável para quem toma decisão clínica em cima dela:
 *
 *   1. Existe um `progressbar` de verdade, com valor e faixa, para tecnologia
 *      assistiva. Div colorida não é barra de progresso.
 *   2. O que se OUVE é o mesmo que se LÊ — a frase por extenso é o
 *      `aria-valuetext`, não um "60%" seco que não diz de quantas horas.
 *   3. O estado nunca depende só de cor: aparece em texto no selo e na frase.
 *   4. Sobrealocação satura a régua em 100% e continua dizendo o número real.
 */

afterEach(cleanup);

const T = "terapeuta_referencia";
const alvo20 = [{ disciplina: "Fonoaudiologia", horasAlvoSemana: "20.0" }];

function coberturaCom(
  vinculos: { papelNaEquipe: string; horasSemana: string | null }[],
): CoberturaDisciplina {
  const [c] = calcularCobertura(
    alvo20,
    vinculos.map((v) => ({ disciplina: "Fonoaudiologia", ...v })),
  );
  if (!c) throw new Error("cobertura vazia");
  return c;
}

describe("BarraCobertura — os quatro estados de MV3", () => {
  test("0% — barra em zero e frase que diz o que falta", () => {
    render(<BarraCobertura cobertura={coberturaCom([])} />);

    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("0");
    expect(barra.getAttribute("aria-valuetext")).toBe(
      "0h de 20h alocadas — nenhum terapeuta vinculado",
    );
    expect(screen.getByText("Sem alocação")).toBeTruthy();
  });

  test("parcial — valor, restante e selo de construção", () => {
    render(
      <BarraCobertura
        cobertura={coberturaCom([{ papelNaEquipe: T, horasSemana: "12.0" }])}
      />,
    );

    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("60");
    expect(barra.getAttribute("aria-valuetext")).toBe(
      "12h de 20h alocadas (60%) — restam 8h",
    );
    expect(screen.getByText("Em construção")).toBeTruthy();
    expect(
      screen.getByText("12h de 20h alocadas (60%) — restam 8h"),
    ).toBeTruthy();
  });

  test("100% — cobertura completa, sem sobra e sem excedente", () => {
    render(
      <BarraCobertura
        cobertura={coberturaCom([{ papelNaEquipe: T, horasSemana: "20.0" }])}
      />,
    );

    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
    expect(screen.getByText("Cobertura completa")).toBeTruthy();
    expect(
      screen.getByText("20h de 20h alocadas — cobertura completa"),
    ).toBeTruthy();
  });

  test(">100% — régua satura em 100 mas o texto diz 125% e como sair", () => {
    // O `aria-valuemax` é 100: sem saturar, o leitor de tela receberia um
    // valor fora da faixa declarada. A verdade do excedente vive no texto.
    render(
      <BarraCobertura
        cobertura={coberturaCom([{ papelNaEquipe: T, horasSemana: "25.0" }])}
      />,
    );

    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("100");
    expect(barra.getAttribute("aria-valuemax")).toBe("100");
    expect(barra.getAttribute("aria-valuetext")).toBe(
      "25h de 20h alocadas (125%) — sobrealocação de 5h. Reduza as horas de um membro ou aumente a prescrição.",
    );
    expect(screen.getByText("Sobrealocada")).toBeTruthy();
  });
});

describe("BarraCobertura — garantias transversais", () => {
  test("estado também é texto, nunca só cor (os quatro)", () => {
    // Se algum dia o selo virar só um matiz, este teste cai: cada estado tem
    // rótulo textual próprio e distinto.
    const rotulos = [
      [coberturaCom([]), "Sem alocação"],
      [
        coberturaCom([{ papelNaEquipe: T, horasSemana: "12.0" }]),
        "Em construção",
      ],
      [
        coberturaCom([{ papelNaEquipe: T, horasSemana: "20.0" }]),
        "Cobertura completa",
      ],
      [
        coberturaCom([{ papelNaEquipe: T, horasSemana: "25.0" }]),
        "Sobrealocada",
      ],
    ] as const;

    for (const [c, rotulo] of rotulos) {
      cleanup();
      render(<BarraCobertura cobertura={c} />);
      expect(screen.getByText(rotulo)).toBeTruthy();
    }
  });

  test("a barra é nomeada pela disciplina — não existe barra anônima", () => {
    render(
      <BarraCobertura
        cobertura={coberturaCom([{ papelNaEquipe: T, horasSemana: "12.0" }])}
      />,
    );
    expect(
      screen.getByRole("progressbar", { name: /Cobertura de Fonoaudiologia/i }),
    ).toBeTruthy();
  });

  test("vínculo sem horas avisa que a conta está incompleta", () => {
    render(
      <BarraCobertura
        cobertura={coberturaCom([
          { papelNaEquipe: T, horasSemana: "8.0" },
          { papelNaEquipe: T, horasSemana: null },
        ])}
      />,
    );
    expect(
      screen.getByText(
        "1 vínculo sem horas definidas — a conta acima está incompleta até você defini-las.",
      ),
    ).toBeTruthy();
  });

  test("sem violações axe nos quatro estados", async () => {
    for (const horas of [null, "12.0", "20.0", "25.0"] as const) {
      cleanup();
      const { container } = render(
        <BarraCobertura
          cobertura={coberturaCom(
            horas === null ? [] : [{ papelNaEquipe: T, horasSemana: horas }],
          )}
        />,
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
          // jsdom não renderiza cores; contraste é validado à parte.
          "color-contrast": { enabled: false },
        },
      });
      expect(resultado.violations).toEqual([]);
    }
  });
});
