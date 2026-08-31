import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsrProviderError } from "./provider";
import { SelfHostedAsrProvider } from "./self-hosted";

const URL = "http://espectro-mvp_iris-asr:8000/transcrever";
const TOKEN = "token-do-servico-asr";

function respostaOk(texto: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ texto }),
    json: async () => ({ texto }),
  } as unknown as Response;
}

function respostaErro(
  status: number,
  corpo: unknown = { erro: "x" },
): Response {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(corpo),
    json: async () => corpo,
  } as unknown as Response;
}

describe("SelfHostedAsrProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("ASR_SERVICE_URL", URL);
    vi.stubEnv("ASR_SERVICE_TOKEN", TOKEN);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("monta a requisição certa: URL, método, headers e corpo em bytes", async () => {
    fetchMock.mockResolvedValue(respostaOk("olá mundo"));
    const provider = new SelfHostedAsrProvider();
    const audio = new Uint8Array([1, 2, 3]);

    const resultado = await provider.transcrever(audio, "audio/webm");

    expect(resultado.texto).toBe("olá mundo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["Content-Type"]).toBe("audio/webm");
    expect(headers["Content-Length"]).toBe("3");
    // Corpo é bytes crus (Buffer.from do Uint8Array original) — não identidade
    // de referência, pois o adapter copia via Buffer.from, mas mesmo conteúdo.
    expect(Uint8Array.from(init.body as Uint8Array)).toEqual(audio);
    // Nunca stream — corpo é bytes, nunca um ReadableStream (o servidor real
    // exige Content-Length explícito e recusa Transfer-Encoding: chunked).
    expect(init.body instanceof ReadableStream).toBe(false);
  });

  it.each([
    [503, "saturacao"],
    [400, "definitiva"],
    [413, "definitiva"],
    [408, "transitoria"],
    [500, "transitoria"],
  ] as const)("classifica status %i como %s", async (status, classificacao) => {
    fetchMock.mockResolvedValue(respostaErro(status));
    const provider = new SelfHostedAsrProvider();

    let erro: unknown;
    try {
      await provider.transcrever(new Uint8Array([1]), "audio/webm");
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeInstanceOf(AsrProviderError);
    expect((erro as AsrProviderError).classificacao).toBe(classificacao);
    expect((erro as AsrProviderError).status).toBe(status);
  });

  // T14 — recusa de infraestrutura não pode gastar tentativa do clipe. O worker
  // (route.ts) só reverte quando `classificacao === "saturacao"`; em `falhou` a
  // linha perde `objeto_ref` e o áudio clínico é apagado do MinIO para sempre.
  // Token rotacionado só de um lado (401), proxy reiniciando (502), URL errada
  // (404) — nenhum desses é culpa do clipe, e reenviar depois funciona.
  it.each([401, 403, 404, 502, 504] as const)(
    "classifica recusa de infraestrutura %i como saturacao (reverte a tentativa)",
    async (status) => {
      fetchMock.mockResolvedValue(respostaErro(status));
      const provider = new SelfHostedAsrProvider();

      let erro: unknown;
      try {
        await provider.transcrever(new Uint8Array([1]), "audio/webm");
      } catch (e) {
        erro = e;
      }

      expect(erro).toBeInstanceOf(AsrProviderError);
      expect((erro as AsrProviderError).classificacao).toBe("saturacao");
      expect((erro as AsrProviderError).status).toBe(status);
    },
  );

  it("converte abort do timeout em AsrProviderError que reverte a tentativa", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );
    const provider = new SelfHostedAsrProvider();

    let erro: unknown;
    try {
      await provider.transcrever(new Uint8Array([1]), "audio/webm");
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeInstanceOf(AsrProviderError);
    expect((erro as AsrProviderError).classificacao).toBe("saturacao");
  });

  it("converte falha de rede em AsrProviderError que reverte a tentativa", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const provider = new SelfHostedAsrProvider();

    let erro: unknown;
    try {
      await provider.transcrever(new Uint8Array([1]), "audio/webm");
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeInstanceOf(AsrProviderError);
    expect((erro as AsrProviderError).classificacao).toBe("saturacao");
  });

  it("200 sem `texto` string continua transitoria (erro de aplicação, conta tentativa)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);
    const provider = new SelfHostedAsrProvider();

    let erro: unknown;
    try {
      await provider.transcrever(new Uint8Array([1]), "audio/webm");
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeInstanceOf(AsrProviderError);
    expect((erro as AsrProviderError).classificacao).toBe("transitoria");
  });

  // T15 — o padrão precisa ter folga sobre a mediana MEDIDA na VPS
  // (43,31s, runbook §2). Medimos o timeout observando quando o `signal`
  // passado ao fetch aborta, porque `timeoutMs` é detalhe privado.
  describe("timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Só o abort do controller resolve esta promessa — assim o instante do
      // abort é observável como rejeição.
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function msAteAbortar(): Promise<number> {
      const provider = new SelfHostedAsrProvider();
      let abortado = false;
      const pendente = provider
        .transcrever(new Uint8Array([1]), "audio/webm")
        .catch(() => {
          abortado = true;
        });

      // Varre a linha do tempo em passos de 1s até o abort; devolve o instante.
      for (let ms = 1_000; ms <= 300_000; ms += 1_000) {
        await vi.advanceTimersByTimeAsync(1_000);
        if (abortado) {
          await pendente;
          return ms;
        }
      }
      await pendente;
      return -1;
    }

    it("sem ASR_SERVICE_TIMEOUT_MS usa 120000 ms (folga sobre a mediana de 43,31s)", async () => {
      expect(await msAteAbortar()).toBe(120_000);
    });

    it.each(["", "abc", "0", "-1"])(
      "ASR_SERVICE_TIMEOUT_MS inválido (%j) cai no padrão de 120000 ms",
      async (valor) => {
        vi.stubEnv("ASR_SERVICE_TIMEOUT_MS", valor);
        expect(await msAteAbortar()).toBe(120_000);
      },
    );

    it("ASR_SERVICE_TIMEOUT_MS válido é respeitado", async () => {
      vi.stubEnv("ASR_SERVICE_TIMEOUT_MS", "5000");
      expect(await msAteAbortar()).toBe(5_000);
    });
  });
});
