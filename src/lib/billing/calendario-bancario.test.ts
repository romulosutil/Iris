import { describe, expect, it } from "vitest";
import {
  diasCorridosEntre,
  diasUteisEntre,
  ehDiaUtilBancario,
  proximoDiaUtilBancario,
} from "./calendario-bancario";

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("calendário bancário brasileiro", () => {
  it("reconhece fim de semana", () => {
    expect(ehDiaUtilBancario(dia("2026-08-22"))).toBe(false); // sábado
    expect(ehDiaUtilBancario(dia("2026-08-23"))).toBe(false); // domingo
    expect(ehDiaUtilBancario(dia("2026-08-24"))).toBe(true); // segunda
  });

  it("reconhece feriados fixos, incluindo 20/11", () => {
    expect(ehDiaUtilBancario(dia("2026-09-07"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-11-20"))).toBe(false); // Lei 14.759/2023
    expect(ehDiaUtilBancario(dia("2026-12-25"))).toBe(false);
  });

  it("fecha 24/12 e 31/12, que não são feriado civil", () => {
    // Quinta 24/12/2026 e quinta 31/12/2026: dias de semana comuns no
    // calendário civil, banco fechado. Sem eles o cluster de fim de ano
    // entrega vencimento com 1 dia útil de antecedência.
    expect(ehDiaUtilBancario(dia("2026-12-24"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-12-31"))).toBe(false);
    // Outro ano, outro dia da semana: 24/12/2025 é quarta, 31/12/2025 quinta.
    expect(ehDiaUtilBancario(dia("2025-12-24"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2025-12-31"))).toBe(false);
    // Vizinhos continuam úteis — o conjunto não engoliu a semana inteira.
    expect(ehDiaUtilBancario(dia("2026-12-23"))).toBe(true); // quarta
    expect(ehDiaUtilBancario(dia("2026-12-30"))).toBe(true); // quarta
  });

  it("deriva os feriados móveis da Páscoa", () => {
    // Páscoa 2026: 05/04. Carnaval 16-17/02, Sexta-Feira Santa 03/04,
    // Corpus Christi 04/06.
    expect(ehDiaUtilBancario(dia("2026-02-16"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-02-17"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-04-03"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-06-04"))).toBe(false);
    // Páscoa 2027: 28/03 — ano diferente, para não passar por tabela chumbada.
    expect(ehDiaUtilBancario(dia("2027-02-08"))).toBe(false); // Carnaval
    expect(ehDiaUtilBancario(dia("2027-03-26"))).toBe(false); // Sexta Santa
  });

  it("empurra para o próximo dia útil e é idempotente em dia útil", () => {
    expect(proximoDiaUtilBancario(dia("2026-08-22"))).toEqual(
      dia("2026-08-24"),
    );
    expect(proximoDiaUtilBancario(dia("2026-08-24"))).toEqual(
      dia("2026-08-24"),
    );
  });

  it("conta dias úteis estritamente entre as datas", () => {
    // seg 24 → sex 28: ter, qua, qui = 3
    expect(diasUteisEntre(dia("2026-08-24"), dia("2026-08-28"))).toBe(3);
    // sex 21 → seg 24: nada no meio (sáb/dom)
    expect(diasUteisEntre(dia("2026-08-21"), dia("2026-08-24"))).toBe(0);
    // ordem invertida ou mesma data: 0, nunca negativo
    expect(diasUteisEntre(dia("2026-08-28"), dia("2026-08-24"))).toBe(0);
  });

  it("conta dias corridos, ignorando feriado e fim de semana", () => {
    // Valores diferentes de zero e diferentes entre si: um `return 0` fixo,
    // ou um resultado colado em `diasUteisEntre`, morre aqui.
    expect(diasCorridosEntre(dia("2026-08-14"), dia("2026-08-19"))).toBe(5);
    expect(diasCorridosEntre(dia("2026-08-24"), dia("2026-08-25"))).toBe(1);
    // Atravessa mês e ano, e cai numa janela cheia de não-úteis: corridos
    // conta os 9 dias mesmo assim (só 3 seriam úteis).
    expect(diasCorridosEntre(dia("2026-12-26"), dia("2027-01-04"))).toBe(9);
    expect(diasUteisEntre(dia("2026-12-26"), dia("2027-01-04"))).toBe(3);
    // ordem invertida ou mesma data: 0, nunca negativo
    expect(diasCorridosEntre(dia("2026-08-19"), dia("2026-08-14"))).toBe(0);
    expect(diasCorridosEntre(dia("2026-08-19"), dia("2026-08-19"))).toBe(0);
  });
});
