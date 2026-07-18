import { describe, expect, test } from "vitest";
import { projetarSemana, type AvulsaProjecao, type RegraProjecao } from "./projecao";

const regra: RegraProjecao = {
  id: "r1", diaSemana: 1, horaInicio: "09:00", duracaoMin: 60,
  disciplina: "aba", rotulo: "João",
};
const avulsa: AvulsaProjecao = {
  id: "a1", diaSemana: 1, inicioMin: 480, duracaoMin: 50,
  disciplina: "to", rotulo: "Maria",
};

describe("projetarSemana", () => {
  test("regra vira bloco previsto com inicioMin derivado da hora", () => {
    const [bloco] = projetarSemana([regra], []);
    expect(bloco).toMatchObject({ id: "r1", origem: "previsto", inicioMin: 540, duracaoMin: 60 });
  });
  test("avulsa vira bloco concreto preservando inicioMin", () => {
    const [bloco] = projetarSemana([], [avulsa]);
    expect(bloco).toMatchObject({ id: "a1", origem: "concreto", inicioMin: 480 });
  });
  test("ordena por dia e depois por inicioMin", () => {
    const blocos = projetarSemana([regra], [avulsa]);
    expect(blocos.map((b) => b.id)).toEqual(["a1", "r1"]); // 480 antes de 540
  });
});
