import { describe, expect, test } from "vitest";
import {
  DECLARACAO_PRAZOS,
  prazoEstagio2,
  prazoMinutos,
  prazoRestanteMs,
  rotuloPrazo,
  vencido,
  type CertezaRisco,
  type SeveridadeRisco,
} from "./prazos";

const TODAS_SEVERIDADES: SeveridadeRisco[] = [
  "ideacao_passiva",
  "ideacao_ativa_sem_plano",
  "ideacao_ativa_com_plano",
  "autolesao_recente",
  "tentativa_relatada",
  "violencia_sofrida",
  "violencia_praticada",
  "risco_a_terceiro",
];

describe("prazos.ts — patamares da §4.1", () => {
  test("15 minutos: ideação ativa com plano e tentativa relatada", () => {
    expect(prazoMinutos("ideacao_ativa_com_plano", "explicito")).toBe(15);
    expect(prazoMinutos("tentativa_relatada", "explicito")).toBe(15);
  });

  test("1 hora: ideação ativa sem plano e autolesão recente", () => {
    expect(prazoMinutos("ideacao_ativa_sem_plano", "explicito")).toBe(60);
    expect(prazoMinutos("autolesao_recente", "explicito")).toBe(60);
  });

  test("4 horas: demais severidades", () => {
    expect(prazoMinutos("ideacao_passiva", "explicito")).toBe(240);
    expect(prazoMinutos("violencia_sofrida", "explicito")).toBe(240);
    expect(prazoMinutos("violencia_praticada", "explicito")).toBe(240);
    expect(prazoMinutos("risco_a_terceiro", "explicito")).toBe(240);
  });
});

describe("prazos.ts — ambiguidade não relaxa o prazo (§4.1)", () => {
  test.each(TODAS_SEVERIDADES)(
    "%s: certeza ambigua produz o mesmo prazo da certeza explícita",
    (severidade) => {
      const explicito: CertezaRisco = "explicito";
      const ambiguo: CertezaRisco = "ambiguo_citado";
      expect(prazoMinutos(severidade, ambiguo)).toBe(
        prazoMinutos(severidade, explicito),
      );
    },
  );
});

describe("prazos.ts — rotuloPrazo", () => {
  test("rótulos dos três patamares", () => {
    expect(rotuloPrazo(15)).toBe("15 minutos");
    expect(rotuloPrazo(60)).toBe("1 hora");
    expect(rotuloPrazo(240)).toBe("4 horas");
  });

  test("genérico para outros valores", () => {
    expect(rotuloPrazo(30)).toBe("30 minutos");
    expect(rotuloPrazo(120)).toBe("2 horas");
    expect(rotuloPrazo(90)).toBe("1,5 horas");
  });
});

describe("prazos.ts — contagem de tempo", () => {
  const agora = new Date("2026-07-28T10:00:00.000Z");

  test("prazoRestanteMs positivo antes do prazo, negativo depois", () => {
    expect(prazoRestanteMs(new Date("2026-07-28T10:15:00.000Z"), agora)).toBe(
      15 * 60_000,
    );
    expect(prazoRestanteMs(new Date("2026-07-28T09:45:00.000Z"), agora)).toBe(
      -15 * 60_000,
    );
  });

  test("vencido é verdadeiro no instante exato do prazo", () => {
    expect(vencido(new Date("2026-07-28T10:00:00.000Z"), agora)).toBe(true);
    expect(vencido(new Date("2026-07-28T10:00:00.001Z"), agora)).toBe(false);
    expect(vencido(new Date("2026-07-28T09:59:59.999Z"), agora)).toBe(true);
  });
});

describe("prazos.ts — prazoEstagio2 (§4.2)", () => {
  test("é o dobro do prazo original contado da criação", () => {
    const criacao = new Date("2026-07-28T10:00:00.000Z");
    const minutos = prazoMinutos("ideacao_ativa_com_plano", "explicito");
    const prazoOriginal = new Date(criacao.getTime() + minutos * 60_000);

    const estagio2 = prazoEstagio2(prazoOriginal, minutos);

    expect(estagio2.toISOString()).toBe("2026-07-28T10:30:00.000Z");
    expect(estagio2.getTime() - criacao.getTime()).toBe(2 * minutos * 60_000);
  });

  test("vale também para o patamar de 4 horas", () => {
    const criacao = new Date("2026-07-28T08:00:00.000Z");
    const minutos = prazoMinutos("ideacao_passiva", "explicito");
    const prazoOriginal = new Date(criacao.getTime() + minutos * 60_000);
    expect(
      prazoEstagio2(prazoOriginal, minutos).getTime() - criacao.getTime(),
    ).toBe(2 * minutos * 60_000);
  });
});

describe("prazos.ts — declaração obrigatória na UI", () => {
  test("texto literal da §4.1", () => {
    expect(DECLARACAO_PRAZOS).toBe(
      "Estes prazos regem apenas o envio de alertas dentro do sistema Iris para os gestores da clínica. O Iris não realiza atendimento e não garante a presença de profissionais logados.",
    );
  });
});
