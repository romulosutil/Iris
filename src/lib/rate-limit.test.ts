import { afterEach, describe, expect, it, vi } from "vitest";
import { consumirTentativa, _limparParaTeste } from "./rate-limit";

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

  it("reclaima entradas expiradas", () => {
    vi.useFakeTimers();
    // Preenche a chave ip:3.3.3.3 e deixa expirar.
    consumirTentativa("ip:3.3.3.3", 1, 1000);
    vi.advanceTimersByTime(1001);
    // Refaz a mesma chave — ela deve ter sido limpa e aceita a nova entrada.
    expect(consumirTentativa("ip:3.3.3.3", 1, 1000).permitido).toBe(true);
    // Bloqueia a segunda tentativa (confirma que foi resetada).
    expect(consumirTentativa("ip:3.3.3.3", 1, 1000).permitido).toBe(false);
  });
});
