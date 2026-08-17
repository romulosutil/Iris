import { describe, expect, test } from "vitest";
import { calcularStatusArquivamento } from "./auto-arquivamento";

/**
 * Datas âncora fixas (nunca `new Date()` sem argumento): a regra é sobre
 * fronteira de dia, então um teste que depende do relógio do CI falha de
 * madrugada e passa de tarde. `agora` é injetado em todos os casos.
 */
const AGORA = new Date("2026-08-02T12:00:00Z");

/** Data de última atividade que resulta em exatamente `dias` de silêncio. */
const haDias = (dias: number) =>
  new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000);

describe("calcularStatusArquivamento", () => {
  test("paciente com atividade hoje não avisa nem arquiva", () => {
    const r = calcularStatusArquivamento(haDias(0), AGORA);
    expect(r).toEqual({
      diasSemAtividade: 0,
      deveNotificarAviso: false,
      deveArquivar: false,
    });
  });

  test("82 dias — véspera da janela de aviso, ainda em silêncio", () => {
    const r = calcularStatusArquivamento(haDias(82), AGORA);
    expect(r.diasSemAtividade).toBe(82);
    expect(r.deveNotificarAviso).toBe(false);
    expect(r.deveArquivar).toBe(false);
  });

  test("83º dia — avisa e NÃO arquiva (aviso prévio de 7 dias)", () => {
    const r = calcularStatusArquivamento(haDias(83), AGORA);
    expect(r.diasSemAtividade).toBe(83);
    expect(r.deveNotificarAviso).toBe(true);
    expect(r.deveArquivar).toBe(false);
  });

  test("89º dia — último dia da janela de aviso, ainda não arquiva", () => {
    const r = calcularStatusArquivamento(haDias(89), AGORA);
    expect(r.deveNotificarAviso).toBe(true);
    expect(r.deveArquivar).toBe(false);
  });

  test("90º dia — arquiva e para de avisar", () => {
    const r = calcularStatusArquivamento(haDias(90), AGORA);
    expect(r.diasSemAtividade).toBe(90);
    expect(r.deveArquivar).toBe(true);
    expect(r.deveNotificarAviso).toBe(false);
  });

  test("além de 90 dias arquiva e NÃO avisa de novo", () => {
    // Regressão do aviso repetido: se `deveNotificarAviso` fosse só
    // `dias >= 83`, um paciente parado há meses geraria uma linha de aviso em
    // `audit_log` a cada varredura do job — a faixa da clínica viraria ruído
    // permanente e a trilha (append-only) encheria de duplicata inútil.
    for (const dias of [91, 120, 365]) {
      const r = calcularStatusArquivamento(haDias(dias), AGORA);
      expect(r.deveArquivar).toBe(true);
      expect(r.deveNotificarAviso).toBe(false);
    }
  });

  test("conta dia CIVIL, não janela de 24h: 83d menos 1h ainda é o 83º dia", () => {
    // Atividade às 13:00 e varredura às 12:00 do 83º dia depois: em
    // aritmética de milissegundos isso dá 82,96 dias → `Math.floor` = 82 e o
    // aviso escaparia da janela [83, 90) por uma hora de relógio. Sobre data
    // civil, as duas datas distam 83 dias e o aviso sai.
    const ultima = new Date("2026-05-11T13:00:00Z"); // 83 dias civis antes
    const r = calcularStatusArquivamento(ultima, AGORA);
    expect(r.diasSemAtividade).toBe(83);
    expect(r.deveNotificarAviso).toBe(true);
  });

  test("hora do dia não muda o resultado dentro do mesmo dia civil", () => {
    const ultima = new Date("2026-05-04T00:00:00Z"); // 90 dias civis antes
    const cedo = calcularStatusArquivamento(
      ultima,
      new Date("2026-08-02T00:00:01Z"),
    );
    const tarde = calcularStatusArquivamento(
      ultima,
      new Date("2026-08-02T23:59:59Z"),
    );
    expect(cedo).toEqual(tarde);
    expect(cedo.deveArquivar).toBe(true);
  });

  test("atividade no futuro (relógio torto) não arquiva ninguém", () => {
    // Defensivo: um `ultima_atividade` adiantado (clock skew entre app e banco)
    // daria dias negativos. Negativo nunca pode cair em nenhuma das janelas —
    // arquivar por engano tira o paciente da fatura sem ninguém pedir.
    const r = calcularStatusArquivamento(haDias(-5), AGORA);
    expect(r.diasSemAtividade).toBe(-5);
    expect(r.deveNotificarAviso).toBe(false);
    expect(r.deveArquivar).toBe(false);
  });
});
