import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  EXTRACAO_RETRY_BACKOFF_MS,
  EXTRACAO_TIMEOUT_MS,
  ExtracaoTimeoutError,
  erroEhTransitorio,
  invocarComResiliencia,
} from "./resiliencia";

// A-03 (#535): a chamada ao modelo ganha timeout explícito e UM retry com
// backoff, só para falha transitória (rede / 5xx / timeout). 4xx nunca é
// re-tentado: é erro nosso (schema, chave, modelo aposentado) e repetir só
// dobraria o custo e a latência sem mudar o resultado.

function erroComStatus(status: number, message = `HTTP ${status}`) {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

function nuncaResolve(): Promise<never> {
  return new Promise<never>(() => {});
}

describe("erroEhTransitorio", () => {
  test("timeout nomeado é transitório", () => {
    expect(erroEhTransitorio(new ExtracaoTimeoutError(45_000))).toBe(true);
  });

  test("5xx é transitório; 4xx nunca (400, 401, 404, 429)", () => {
    expect(erroEhTransitorio(erroComStatus(500))).toBe(true);
    expect(erroEhTransitorio(erroComStatus(503))).toBe(true);
    expect(erroEhTransitorio(erroComStatus(400))).toBe(false);
    expect(erroEhTransitorio(erroComStatus(401))).toBe(false);
    expect(erroEhTransitorio(erroComStatus(404))).toBe(false);
    expect(erroEhTransitorio(erroComStatus(429))).toBe(false);
  });

  test("status embutido só na message (forma do erro do Gemini) também conta", () => {
    expect(
      erroEhTransitorio(
        new Error('{"error":{"code":503,"message":"overloaded"}}'),
      ),
    ).toBe(true);
    expect(
      erroEhTransitorio(
        new Error('{"error":{"code":404,"message":"not found"}}'),
      ),
    ).toBe(false);
  });

  test("erro de rede (código do socket, direto ou em cause) é transitório", () => {
    const socket = new Error("connect ECONNRESET") as Error & { code: string };
    socket.code = "ECONNRESET";
    expect(erroEhTransitorio(socket)).toBe(true);
    const fetchFalhou = new TypeError("fetch failed", { cause: socket });
    expect(erroEhTransitorio(fetchFalhou)).toBe(true);
    const dns = new Error("x") as Error & { code: string };
    dns.code = "ENOTFOUND";
    expect(erroEhTransitorio(dns)).toBe(true);
  });

  test("erro genérico (schema inválido, modo desconhecido, string) NÃO é transitório", () => {
    expect(erroEhTransitorio(new Error("Modo de extração desconhecido"))).toBe(
      false,
    );
    expect(erroEhTransitorio("boom")).toBe(false);
    expect(erroEhTransitorio(null)).toBe(false);
  });
});

describe("invocarComResiliencia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("constantes: 45 s de timeout e 2 s de backoff", () => {
    expect(EXTRACAO_TIMEOUT_MS).toBe(45_000);
    expect(EXTRACAO_RETRY_BACKOFF_MS).toBe(2_000);
  });

  test("sucesso na 1ª tentativa devolve resultado, latência e 1 tentativa", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 1_200));
      return "ok";
    });
    const p = invocarComResiliencia(fn);
    await vi.advanceTimersByTimeAsync(1_200);
    const r = await p;
    expect(r.resultado).toBe("ok");
    expect(r.tentativas).toBe(1);
    expect(r.latenciaMs).toBe(1_200);
  });

  test("chamada que nunca responde falha com erro nomeado EXTRACAO_TIMEOUT e aborta o signal", async () => {
    const sinais: AbortSignal[] = [];
    const fn = vi.fn((signal: AbortSignal) => {
      sinais.push(signal);
      return nuncaResolve();
    });
    const p = invocarComResiliencia(fn);
    const resultado = p.then(
      () => "resolveu",
      (e: unknown) => e,
    );
    // 1ª tentativa estoura em 45 s; timeout é transitório → backoff 2 s →
    // 2ª tentativa estoura em mais 45 s. Total 92 s, nunca antes.
    await vi.advanceTimersByTimeAsync(45_000 + 2_000 + 44_999);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sinais[0]!.aborted).toBe(true);
    expect(sinais[1]!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = (await resultado) as Error;
    expect(err).toBeInstanceOf(ExtracaoTimeoutError);
    expect(err.name).toBe("EXTRACAO_TIMEOUT");
    expect(err.message).toContain("45000");
    expect(sinais[1]!.aborted).toBe(true);
  });

  test("1ª falha 503 → espera 2 s → 2ª ok (1 retry, latência total)", async () => {
    const fn = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(erroComStatus(503, "overloaded"))
      .mockResolvedValueOnce("ok");
    const p = invocarComResiliencia(fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    // antes do backoff completar não há 2ª chamada
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r.resultado).toBe("ok");
    expect(r.tentativas).toBe(2);
    expect(r.latenciaMs).toBe(2_000);
  });

  test("timeout na 1ª e sucesso na 2ª devolve o resultado", async () => {
    const fn = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(() => nuncaResolve())
      .mockResolvedValueOnce("ok");
    const p = invocarComResiliencia(fn);
    await vi.advanceTimersByTimeAsync(45_000 + 2_000);
    const r = await p;
    expect(r.resultado).toBe("ok");
    expect(r.tentativas).toBe(2);
  });

  test("4xx NÃO re-tenta: falha na hora com o erro original", async () => {
    const original = erroComStatus(404, "model retired");
    const fn = vi.fn(async () => {
      throw original;
    });
    const p = invocarComResiliencia(fn);
    await expect(p).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("duas falhas transitórias seguidas: só 1 retry, depois lança a última", async () => {
    const segunda = erroComStatus(502, "bad gateway");
    const fn = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(erroComStatus(503))
      .mockRejectedValueOnce(segunda);
    const p = invocarComResiliencia(fn);
    const resultado = p.then(
      () => "resolveu",
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await resultado).toBe(segunda);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("erro de rede re-tenta uma vez", async () => {
    const rede = new TypeError("fetch failed");
    const fn = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(rede)
      .mockResolvedValueOnce("ok");
    const p = invocarComResiliencia(fn);
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await p).resultado).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
