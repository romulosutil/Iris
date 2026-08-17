import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumirTentativa,
  _limparParaTeste,
  _tamanhoParaTeste,
  CAP_ENTRIES,
} from "./rate-limit";

afterEach(() => {
  _limparParaTeste();
  vi.useRealTimers();
});

describe("consumirTentativa", () => {
  it("permite até o limite e bloqueia depois", () => {
    for (let i = 0; i < 5; i++) {
      expect(consumirTentativa("ip:1.2.3.4", 5, 60_000).permitido).toBe(true);
    }
    expect(consumirTentativa("ip:1.2.3.4", 5, 60_000).permitido).toBe(false);
  });

  it("libera depois da janela", () => {
    vi.useFakeTimers();
    consumirTentativa("ip:9.9.9.9", 1, 60_000);
    expect(consumirTentativa("ip:9.9.9.9", 1, 60_000).permitido).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(consumirTentativa("ip:9.9.9.9", 1, 60_000).permitido).toBe(true);
  });

  it("conta chaves diferentes de forma independente", () => {
    consumirTentativa("email:a@b.com", 1, 60_000);
    expect(consumirTentativa("email:c@d.com", 1, 60_000).permitido).toBe(true);
  });

  it("nega na primeira tentativa se limite <= 0", () => {
    expect(consumirTentativa("ip:1.1.1.1", 0, 60_000).permitido).toBe(false);
    expect(consumirTentativa("ip:2.2.2.2", -1, 60_000).permitido).toBe(false);
  });

  it("reclaima entradas expiradas e o mapa encolhe de fato", () => {
    vi.useFakeTimers();
    // Preenche a chave ip:3.3.3.3 e deixa expirar.
    consumirTentativa("ip:3.3.3.3", 1, 1000);
    expect(_tamanhoParaTeste()).toBe(1);
    vi.advanceTimersByTime(1001);
    // Uma chave nova e distinta força a varredura; a expirada tem que sumir
    // do mapa (não só ser reusada por coincidência de nome).
    consumirTentativa("ip:4.4.4.4", 1, 1000);
    expect(_tamanhoParaTeste()).toBe(1);
  });

  it("ao atingir o cap, despeja a entrada cujo reset está mais próximo e admite a chave nova (Finding 1)", () => {
    vi.useFakeTimers();
    const agora = Date.now();
    // Lota o mapa até CAP_ENTRIES com chaves não expiradas, limite=1 cada —
    // cada uma já nasce "no teto" (contagem === limite), então uma chamada
    // seguinte só dá `permitido: true` se a entrada tiver sido despejada e
    // recriada do zero. expiraEm cresce a cada iteração: ip:cap-0 tem o
    // reset mais próximo; a última, o mais distante.
    for (let i = 0; i < CAP_ENTRIES; i++) {
      vi.setSystemTime(agora + i);
      consumirTentativa(`ip:cap-${i}`, 1, 60_000);
    }
    expect(_tamanhoParaTeste()).toBe(CAP_ENTRIES);

    // Chave nova legítima: com fail-closed ela seria negada. Com despejo,
    // deve ser admitida — e o mapa não pode crescer além do cap.
    vi.setSystemTime(agora + CAP_ENTRIES);
    expect(consumirTentativa("ip:vitima-legitima", 1, 60_000).permitido).toBe(
      true,
    );
    expect(_tamanhoParaTeste()).toBeLessThanOrEqual(CAP_ENTRIES);

    // A entrada despejada tem que ser a que tinha o reset mais próximo
    // (ip:cap-0) — se ainda estivesse no mapa, esta chamada devolveria
    // `false` (contagem já no limite). A que tem o reset mais distante
    // (última criada) não pode ter sido despejada.
    expect(consumirTentativa("ip:cap-0", 1, 60_000).permitido).toBe(true);
    expect(
      consumirTentativa(`ip:cap-${CAP_ENTRIES - 1}`, 1, 60_000).permitido,
    ).toBe(false);
  });
});
