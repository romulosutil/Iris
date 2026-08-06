import { describe, expect, test } from "vitest";
import {
  calcularCobertura,
  chaveDisciplina,
  somarHorasAlocadas,
  vinculosForaDaPrescricao,
} from "./cobertura";

/**
 * Agregação de cobertura (#203, fatia 4).
 *
 * Cada caso aqui corresponde a uma forma conhecida de a barra mentir. Não são
 * testes de aritmética — são testes das quatro decisões clínicas que a conta
 * materializa (D-B, D-C, papel × pessoa, sobrealocação derivada).
 */

const T = "terapeuta_referencia";
const S = "substituto";
const C = "coordenador_referencia";

describe("somarHorasAlocadas", () => {
  test("soma numeric vindo como string sem concatenar", () => {
    // O driver `postgres` entrega `numeric` como STRING. Sem parse, "8" + "12"
    // vira "812" e a barra estoura em 4060%.
    const total = somarHorasAlocadas(
      [
        { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: "8.0" },
        { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: "12.0" },
      ],
      "Fonoaudiologia",
    );
    expect(total).toBe(20);
  });

  test("substituto CONSOME saldo (D-B)", () => {
    const total = somarHorasAlocadas(
      [{ disciplina: "ABA", papelNaEquipe: S, horasSemana: "4.0" }],
      "ABA",
    );
    expect(total).toBe(4);
  });

  test("coordenador de referência NÃO consome (D-C)", () => {
    const total = somarHorasAlocadas(
      [
        { disciplina: "ABA", papelNaEquipe: C, horasSemana: "10.0" },
        { disciplina: "ABA", papelNaEquipe: T, horasSemana: "6.0" },
      ],
      "ABA",
    );
    expect(total).toBe(6);
  });

  test("disciplina compara sem depender de caixa nem de espaço", () => {
    const total = somarHorasAlocadas(
      [
        {
          disciplina: " fonoaudiologia ",
          papelNaEquipe: T,
          horasSemana: "3.0",
        },
      ],
      "Fonoaudiologia",
    );
    // Tratar as duas grafias como disciplinas distintas partiria o saldo em
    // dois em silêncio: a barra mostraria 0h e a validação recusaria a alocação.
    expect(total).toBe(3);
  });

  test("vínculo sem horas soma zero, não NaN", () => {
    const total = somarHorasAlocadas(
      [
        { disciplina: "ABA", papelNaEquipe: T, horasSemana: null },
        { disciplina: "ABA", papelNaEquipe: T, horasSemana: "2.0" },
      ],
      "ABA",
    );
    expect(total).toBe(2);
  });
});

describe("calcularCobertura — os quatro estados de MV3", () => {
  const alvo20 = [{ disciplina: "Fonoaudiologia", horasAlvoSemana: "20.0" }];

  test("0% alocado", () => {
    const [c] = calcularCobertura(alvo20, []);
    expect(c).toMatchObject({
      estado: "vazio",
      horasAlocadas: 0,
      horasRestantes: 20,
      horasExcedentes: 0,
      percentual: 0,
    });
  });

  test("parcial devolve o restante exato", () => {
    const [c] = calcularCobertura(alvo20, [
      { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: "12.0" },
    ]);
    expect(c).toMatchObject({
      estado: "parcial",
      horasRestantes: 8,
      percentual: 60,
    });
  });

  test("100% é cobertura completa, não sobrealocação", () => {
    const [c] = calcularCobertura(alvo20, [
      { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: "20.0" },
    ]);
    expect(c?.estado).toBe("completa");
    expect(c?.horasExcedentes).toBe(0);
  });

  test(">100% reporta o excedente e nunca restante negativo", () => {
    const [c] = calcularCobertura(alvo20, [
      { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: "25.0" },
    ]);
    expect(c).toMatchObject({
      estado: "sobrealocada",
      horasExcedentes: 5,
      horasRestantes: 0,
      percentual: 125,
    });
  });

  test("disciplina prescrita com 0h alocadas continua listada", () => {
    // Esconder a linha vazia esconderia justamente o buraco que o coordenador
    // precisa fechar.
    const cobertura = calcularCobertura(
      [
        { disciplina: "ABA", horasAlvoSemana: "10.0" },
        { disciplina: "Fonoaudiologia", horasAlvoSemana: "20.0" },
      ],
      [{ disciplina: "ABA", papelNaEquipe: T, horasSemana: "10.0" }],
    );
    expect(cobertura.map((c) => c.disciplina)).toEqual([
      "ABA",
      "Fonoaudiologia",
    ]);
    expect(cobertura[1]?.estado).toBe("vazio");
  });

  test("conta vínculos sem horas para a tela poder avisar", () => {
    const [c] = calcularCobertura(alvo20, [
      { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: null },
      { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: "8.0" },
    ]);
    expect(c?.vinculosSemHoras).toBe(1);
    expect(c?.horasAlocadas).toBe(8);
  });
});

describe("vinculosForaDaPrescricao", () => {
  test("separa o legado alocado em disciplina não prescrita hoje", () => {
    const fora = vinculosForaDaPrescricao(
      [
        { disciplina: "Fonoaudiologia", papelNaEquipe: T, horasSemana: "8.0" },
        { disciplina: "Musicoterapia", papelNaEquipe: T, horasSemana: "2.0" },
      ],
      [{ disciplina: "Fonoaudiologia", horasAlvoSemana: "20.0" }],
    );
    expect(fora.map((v) => v.disciplina)).toEqual(["Musicoterapia"]);
  });

  test("gestão do caso nunca entra no bloco de fora da prescrição", () => {
    // Coordenador de referência não consome saldo — listá-lo aqui sugeriria
    // que falta prescrever algo para ele, o que é falso.
    const fora = vinculosForaDaPrescricao(
      [{ disciplina: "Gestão", papelNaEquipe: C, horasSemana: null }],
      [{ disciplina: "Fonoaudiologia", horasAlvoSemana: "20.0" }],
    );
    expect(fora).toHaveLength(0);
  });
});

describe("chaveDisciplina", () => {
  test("normaliza caixa e espaços das bordas", () => {
    expect(chaveDisciplina("  Terapia Ocupacional ")).toBe(
      "terapia ocupacional",
    );
  });
});
