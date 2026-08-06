import { describe, expect, test } from "vitest";
import {
  ROTULO_ESTADO,
  calcularCobertura,
  chaveDisciplina,
  somarHorasAlocadas,
  textoCobertura,
  textoVinculosSemHoras,
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

describe("textoCobertura — a copy dos 4 estados de MV3 (fatia 5)", () => {
  const alvo20 = [{ disciplina: "Fonoaudiologia", horasAlvoSemana: "20.0" }];
  const frase = (
    vinculos: { papelNaEquipe: string; horasSemana: string | null }[],
  ) => {
    const [c] = calcularCobertura(
      alvo20,
      vinculos.map((v) => ({ disciplina: "Fonoaudiologia", ...v })),
    );
    return textoCobertura(c!);
  };

  test("0% diz o que falta, não repete o percentual", () => {
    expect(frase([])).toBe("0h de 20h alocadas — nenhum terapeuta vinculado");
  });

  test("parcial nomeia o restante exato", () => {
    expect(frase([{ papelNaEquipe: T, horasSemana: "12.0" }])).toBe(
      "12h de 20h alocadas (60%) — restam 8h",
    );
  });

  test("100% afirma cobertura completa sem falar em restante", () => {
    expect(frase([{ papelNaEquipe: T, horasSemana: "20.0" }])).toBe(
      "20h de 20h alocadas — cobertura completa",
    );
  });

  test(">100% traz o excedente E a instrução de saída", () => {
    // A instrução é parte da frase porque a sobrealocação não trava a tela: se
    // o caminho de volta não estiver escrito onde o problema aparece, ele não
    // existe para quem só ouve a barra.
    expect(frase([{ papelNaEquipe: T, horasSemana: "25.0" }])).toBe(
      "25h de 20h alocadas (125%) — sobrealocação de 5h. Reduza as horas de um membro ou aumente a prescrição.",
    );
  });

  test("meia hora aparece como tempo, nunca como decimal (D-E)", () => {
    // `1,5h de 20,0h` é notação de planilha e obriga o coordenador a converter
    // de cabeça. Este é o teste que impede a barra de reintroduzir o decimal.
    const texto = frase([{ papelNaEquipe: T, horasSemana: "1.5" }]);
    expect(texto).toContain("1h30");
    expect(texto).not.toContain(",");
  });

  test("cada estado tem rótulo textual próprio — cor nunca sozinha", () => {
    const rotulos = Object.values(ROTULO_ESTADO);
    expect(new Set(rotulos).size).toBe(rotulos.length);
    expect(rotulos.every((r) => r.trim().length > 0)).toBe(true);
  });
});

describe("textoVinculosSemHoras", () => {
  const base = {
    disciplina: "ABA",
    horasAlvo: 20,
    horasAlocadas: 8,
    horasRestantes: 12,
    horasExcedentes: 0,
    percentual: 40,
    estado: "parcial" as const,
  };

  test("silencia quando não há vínculo sem horas", () => {
    expect(textoVinculosSemHoras({ ...base, vinculosSemHoras: 0 })).toBeNull();
  });

  test("um vínculo fala no singular", () => {
    expect(textoVinculosSemHoras({ ...base, vinculosSemHoras: 1 })).toBe(
      "1 vínculo sem horas definidas — a conta acima está incompleta até você defini-las.",
    );
  });

  test("mais de um fala no plural", () => {
    expect(textoVinculosSemHoras({ ...base, vinculosSemHoras: 3 })).toContain(
      "3 vínculos sem horas definidas",
    );
  });
});

describe("chaveDisciplina", () => {
  test("normaliza caixa e espaços das bordas", () => {
    expect(chaveDisciplina("  Terapia Ocupacional ")).toBe(
      "terapia ocupacional",
    );
  });
});
