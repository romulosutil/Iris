import { describe, it, expect } from "vitest";
import {
  horasAgendadasPorDisciplina,
  horasRealizadasPorDisciplina,
  defasagem,
  temDefasagemSustentada,
  alocadoTerapeuta,
  vagoTerapeuta,
} from "./horas";

describe("horasAgendadasPorDisciplina", () => {
  it("soma duracaoMin por disciplina ÷ 60", () => {
    const r = horasAgendadasPorDisciplina([
      { disciplina: "aba", duracaoMin: 60 },
      { disciplina: "aba", duracaoMin: 30 },
      { disciplina: "fono", duracaoMin: 30 },
    ]);
    expect(r.aba).toBeCloseTo(1.5);
    expect(r.fono).toBeCloseTo(0.5);
  });
});
describe("horasRealizadasPorDisciplina", () => {
  it("média por semana ativa desde a 1ª sessão da disciplina", () => {
    const agora = new Date("2026-07-20T12:00:00-03:00");
    // 1ª sessão há ~2 semanas, 2 sessões de 60min → 2h em 2 semanas = 1h/sem
    const r = horasRealizadasPorDisciplina(
      [
        {
          disciplina: "aba",
          duracaoMin: 60,
          agendadaPara: new Date("2026-07-06T12:00:00-03:00"),
        },
        {
          disciplina: "aba",
          duracaoMin: 60,
          agendadaPara: new Date("2026-07-13T12:00:00-03:00"),
        },
      ],
      agora,
    );
    expect(r.aba).toBeCloseTo(1, 1);
  });
  it("paciente novo (1ª semana) não infla defasagem: divide por ≥1 semana", () => {
    const agora = new Date("2026-07-07T12:00:00-03:00");
    const r = horasRealizadasPorDisciplina(
      [
        {
          disciplina: "aba",
          duracaoMin: 60,
          agendadaPara: new Date("2026-07-06T12:00:00-03:00"),
        },
      ],
      agora,
    );
    expect(r.aba).toBeCloseTo(1, 1);
  });
});
describe("defasagem / sustentada", () => {
  it("defasagem = alvo - agendado", () => {
    expect(defasagem(12, 8)).toBe(4);
  });
  it("alerta quando agendado<alvo por ≥ limiar semanas", () => {
    expect(
      temDefasagemSustentada(
        [
          { alvo: 12, agendado: 8 },
          { alvo: 12, agendado: 10 },
        ],
        2,
      ),
    ).toBe(true);
    expect(
      temDefasagemSustentada(
        [
          { alvo: 12, agendado: 8 },
          { alvo: 12, agendado: 12 },
        ],
        2,
      ),
    ).toBe(false);
  });
});
describe("terapeuta", () => {
  it("alocado = Σ duracaoMin ÷ 60; vago = capacidade - alocado - bloqueado", () => {
    expect(
      alocadoTerapeuta([
        { disciplina: "aba", duracaoMin: 60 },
        { disciplina: "fono", duracaoMin: 60 },
      ]),
    ).toBeCloseTo(2);
    expect(vagoTerapeuta(40, 30, 5)).toBe(5);
  });
});
