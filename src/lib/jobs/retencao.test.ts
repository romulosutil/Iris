import { describe, expect, it } from "vitest";
import {
  ACAO_AVISO_PREVIO_EXPURGO,
  REGUA_RETENCAO,
  dataCivilNoFuso,
  dentroDaJanelaDeAviso,
  diasAteVencimento,
  diasCivisEntreDatas,
} from "./retencao";

/**
 * #352 — o que estes casos discriminam.
 *
 * A régua do aviso prévio existe para que a clínica saiba, com 90 dias de
 * antecedência, que um prontuário vai ser eliminado. Dois modos de falha
 * tornam esse aviso pior que inútil:
 *
 * 1. **Deslize de fuso.** Se a conta rodasse em UTC, uma clínica em São Paulo
 *    veria o vencimento de um dia inteiro atravessado — e a partir das 21h
 *    local o servidor já estaria "no dia seguinte". Num aviso de retenção
 *    legal, isso é uma data errada num documento.
 * 2. **Janela aberta em cima.** Avisar de novo quem já venceu enche a trilha
 *    append-only (que ninguém pode apagar) de duplicata, e o vencido é caso da
 *    fila de expurgo, não do aviso.
 */

const SP = "America/Sao_Paulo";

describe("dataCivilNoFuso", () => {
  it("resolve a data no fuso da clínica, não no do servidor", () => {
    // 02:00Z de 25/08 ainda é 23:00 do dia 24 em São Paulo (-03).
    const instante = new Date("2026-08-25T02:00:00Z");
    expect(dataCivilNoFuso(instante, SP)).toBe("2026-08-24");
    expect(dataCivilNoFuso(instante, "UTC")).toBe("2026-08-25");
  });

  it("meia-noite local é o primeiro instante do dia civil", () => {
    expect(dataCivilNoFuso(new Date("2026-08-25T03:00:00Z"), SP)).toBe(
      "2026-08-25",
    );
    expect(dataCivilNoFuso(new Date("2026-08-25T02:59:59Z"), SP)).toBe(
      "2026-08-24",
    );
  });
});

describe("diasCivisEntreDatas", () => {
  it("conta dias de calendário, atravessando mês e ano", () => {
    expect(diasCivisEntreDatas("2026-01-01", "2026-04-01")).toBe(90);
    expect(diasCivisEntreDatas("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasCivisEntreDatas("2026-04-01", "2026-01-01")).toBe(-90);
    expect(diasCivisEntreDatas("2026-08-25", "2026-08-25")).toBe(0);
  });

  it("recusa entrada fora de YYYY-MM-DD em vez de devolver NaN", () => {
    // Um `NaN` silencioso aqui viraria "vence em NaN dias" na tela e, pior,
    // `NaN > 0` falso — o paciente sumiria da janela de aviso sem erro nenhum.
    expect(() => diasCivisEntreDatas("25/08/2026", "2026-08-25")).toThrow(
      TypeError,
    );
    expect(() =>
      diasCivisEntreDatas("2026-08-25", "2026-08-25T00:00:00Z"),
    ).toThrow(TypeError);
  });
});

describe("diasAteVencimento", () => {
  it("mede a partir da data civil da clínica, não do instante UTC", () => {
    // 23:00 de 24/08 em São Paulo: faltam 2 dias para 26/08. Em UTC já é dia
    // 25 e a mesma chamada devolveria 1 — o deslize que este módulo existe
    // para evitar.
    const instante = new Date("2026-08-25T02:00:00Z");
    expect(diasAteVencimento("2026-08-26", instante, SP)).toBe(2);
    expect(diasAteVencimento("2026-08-26", instante, "UTC")).toBe(1);
  });

  it("zero no dia do vencimento, negativo depois", () => {
    const agora = new Date("2026-08-25T15:00:00Z");
    expect(diasAteVencimento("2026-08-25", agora, SP)).toBe(0);
    expect(diasAteVencimento("2026-08-24", agora, SP)).toBe(-1);
  });
});

describe("dentroDaJanelaDeAviso", () => {
  const agora = new Date("2026-01-01T15:00:00Z");

  it("avisa quem vence dentro dos 90 dias", () => {
    expect(dentroDaJanelaDeAviso("2026-04-01", agora, SP)).toBe(true); // 90
    expect(dentroDaJanelaDeAviso("2026-01-02", agora, SP)).toBe(true); // 1
  });

  it("não avisa quem vence no 91º dia — o limiar é fechado", () => {
    expect(dentroDaJanelaDeAviso("2026-04-02", agora, SP)).toBe(false); // 91
  });

  it("não avisa quem vence hoje nem quem já venceu — aí quem age é a fila", () => {
    expect(dentroDaJanelaDeAviso("2026-01-01", agora, SP)).toBe(false); // 0
    expect(dentroDaJanelaDeAviso("2025-12-31", agora, SP)).toBe(false); // -1
  });

  it("a janela comprimida é só para teste; o padrão é a régua de política", () => {
    expect(dentroDaJanelaDeAviso("2026-01-06", agora, SP, 5)).toBe(true); // 5
    expect(dentroDaJanelaDeAviso("2026-01-07", agora, SP, 5)).toBe(false); // 6
    // E o padrão continua sendo 90: quem vence em 90 dias entra sem passar
    // parâmetro nenhum.
    expect(dentroDaJanelaDeAviso("2026-04-01", agora, SP)).toBe(true);
  });
});

describe("régua exportada", () => {
  it("é 90 dias e é a única cópia do lado TypeScript", () => {
    expect(REGUA_RETENCAO.diasAvisoPrevio).toBe(90);
    expect(ACAO_AVISO_PREVIO_EXPURGO).toBe("expurgo_aviso_previo");
  });
});
