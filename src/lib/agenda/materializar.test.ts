import { describe, expect, test } from "vitest";
import { datasDaRegra, horizontePadrao, proximoDia, resolverInstante } from "./materializar";

describe("resolverInstante (São Paulo, UTC-3 fixo)", () => {
  test("09:00 local vira 12:00Z", () => {
    const r = resolverInstante("2026-07-13", "09:00", "America/Sao_Paulo");
    expect(r.getTime()).toBe(Date.UTC(2026, 6, 13, 12, 0));
  });
  test("aceita hora com segundos (coluna time do Postgres)", () => {
    const r = resolverInstante("2026-07-13", "09:00:00", "America/Sao_Paulo");
    expect(r.getTime()).toBe(Date.UTC(2026, 6, 13, 12, 0));
  });
});

describe("resolverInstante (DST — America/New_York, portabilidade inv1/§8)", () => {
  // Prova que o slot LOCAL não desloca através da virada de horário de verão.
  // 2026-03-08 é o spring-forward nos EUA (EST -5 → EDT -4).
  const fmtNY = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
  test("antes da virada: 09:00 EST = 14:00Z", () => {
    const r = resolverInstante("2026-03-07", "09:00", "America/New_York");
    expect(r.getTime()).toBe(Date.UTC(2026, 2, 7, 14, 0));
    expect(fmtNY(r)).toBe("09:00");
  });
  test("depois da virada: 09:00 EDT = 13:00Z (offset mudou, slot local NÃO)", () => {
    const r = resolverInstante("2026-03-09", "09:00", "America/New_York");
    expect(r.getTime()).toBe(Date.UTC(2026, 2, 9, 13, 0));
    expect(fmtNY(r)).toBe("09:00"); // continua 09:00 local — não deslocou 1h
  });
});

describe("horizontePadrao / proximoDia", () => {
  test("horizonte = hoje + 84 dias", () => {
    expect(horizontePadrao("2026-07-18")).toBe("2026-10-10");
  });
  test("proximoDia soma 1 dia (cruza mês)", () => {
    expect(proximoDia("2026-07-31")).toBe("2026-08-01");
  });
});

describe("datasDaRegra", () => {
  const regra = { diaSemana: 1, vigenciaInicio: "2026-07-01", vigenciaFim: null }; // segundas

  test("gera as segundas dentro da janela", () => {
    expect(datasDaRegra(regra, "2026-07-06", "2026-07-27", [])).toEqual([
      "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27",
    ]);
  });
  test("respeita vigenciaInicio (não gera antes)", () => {
    const r = { diaSemana: 1, vigenciaInicio: "2026-07-13", vigenciaFim: null };
    expect(datasDaRegra(r, "2026-07-01", "2026-07-20", [])).toEqual([
      "2026-07-13", "2026-07-20",
    ]);
  });
  test("respeita vigenciaFim (não gera depois)", () => {
    const r = { diaSemana: 1, vigenciaInicio: "2026-07-01", vigenciaFim: "2026-07-13" };
    expect(datasDaRegra(r, "2026-07-06", "2026-07-27", [])).toEqual([
      "2026-07-06", "2026-07-13",
    ]);
  });
  test("pula datas cobertas por bloqueio (borda inclusiva)", () => {
    const bloqueios = [{ dataInicio: "2026-07-13", dataFim: "2026-07-15" }];
    expect(datasDaRegra(regra, "2026-07-06", "2026-07-27", bloqueios)).toEqual([
      "2026-07-06", "2026-07-20", "2026-07-27", // 13 pulada
    ]);
  });
});
