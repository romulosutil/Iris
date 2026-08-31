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
});
