import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { processDlqJob } from "./handlers/dlq";
import { processAsrJob, lerConfigDisparoAsr } from "./handlers/asr";
import { logger } from "@/lib/observabilidade/logger";

vi.mock("@/lib/observabilidade/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const URL_JOB = "http://iris-app:3000/api/internal/jobs/asr-transcrever";
const TOKEN = "segredo-do-disparo-nunca-logado";

function jobAsr(over: Record<string, unknown> = {}) {
  return {
    id: "asr-job-1",
    name: "asr-transcrever",
    data: { origem: "lote", loteId: "lote-1", sessionId: "sess-1" },
    expireInSeconds: 300,
    heartbeatSeconds: 30,
    signal: new AbortController().signal,
    ...over,
  } as never;
}

describe("DLQ Handler", () => {
  it("loga falha crítica de job de forma estruturada sem expor PII", async () => {
    const mockJob = {
      id: "job-dlq-1",
      name: "dlq",
      data: {
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        clinicId: "123e4567-e89b-12d3-a456-426614174001",
        textoSensivelClinico: "Paciente apresentou crise severa...",
      },
      sourceName: "asr-transcrever",
      sourceId: "job-orig-456",
      sourceRetryCount: 3,
      expireInSeconds: 60,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    };

    await processDlqJob([mockJob as never]);

    expect(logger.error).toHaveBeenCalledWith(
      "queue.dlq-job-falhou-definitivamente",
      expect.objectContaining({
        jobId: "job-dlq-1",
        sourceQueue: "asr-transcrever",
        sourceJobId: "job-orig-456",
        retryCount: 3,
      }),
    );

    const logCall = vi.mocked(logger.error).mock.calls[0];
    expect(logCall).toBeDefined();
    const logPayload = JSON.stringify(logCall?.[1]);
    expect(logPayload).not.toContain("Paciente apresentou crise");
  });
});

describe("Handler de ASR — disparo da rota interna", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASR_JOB_URL = URL_JOB;
    process.env.ASR_JOB_TOKEN = TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recusa disparar sem env, nomeando a variável sem revelar valor", () => {
    delete process.env.ASR_JOB_URL;
    delete process.env.ASR_JOB_TOKEN;

    expect(() => lerConfigDisparoAsr()).toThrow(/ASR_JOB_URL/);
    expect(() => lerConfigDisparoAsr()).toThrow(/ASR_JOB_TOKEN/);
  });

  it("faz POST autenticado na rota interna — o handler NÃO transcreve sozinho", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, processados: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await processAsrJob([jobAsr()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe(URL_JOB);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("propaga a recusa da rota como erro, para o pg-boss reagendar e depois mandar à DLQ", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
    );

    await expect(processAsrJob([jobAsr()])).rejects.toThrow(/HTTP 500/);
  });

  it("a mensagem de erro não afirma causa — só o status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );

    // 401 (token), 500 (falha do tick) e 502 (rota fora) chegam aqui pelo mesmo
    // caminho; um texto que escolhesse uma causa seria diagnóstico falso nas
    // outras duas.
    await expect(processAsrJob([jobAsr()])).rejects.toThrow(/HTTP 401/);
    await expect(processAsrJob([jobAsr()])).rejects.not.toThrow(/token/i);
  });

  it("reduz a resposta a contagens: nem token, nem ids de clipe entram no log", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            processados: 2,
            transcritos: 1,
            falhas: 1,
            revertidos: 0,
            expirados: null,
            // A rota devolve isto; nada daqui pode chegar ao log do painel.
            resultados: [
              { id: "clipe-uuid-sensivel", desfecho: "transcrito" },
              { id: "outro-clipe", desfecho: "falhou", categoria: "saturacao" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await processAsrJob([jobAsr()]);

    const concluido = vi
      .mocked(logger.info)
      .mock.calls.find((c) => c[0] === "queue.asr.tick-concluido");
    expect(concluido).toBeDefined();
    expect(concluido?.[1]).toMatchObject({
      processados: 2,
      transcritos: 1,
      falhas: 1,
      revertidos: 0,
      expirados: null,
    });

    const tudoQueFoiLogado = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(tudoQueFoiLogado).not.toContain("clipe-uuid-sensivel");
    expect(tudoQueFoiLogado).not.toContain("resultados");
    expect(tudoQueFoiLogado).not.toContain(TOKEN);
  });

  it("não gasta disparo quando o job já chega abortado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort();

    await expect(
      processAsrJob([jobAsr({ signal: controller.signal })]),
    ).rejects.toThrow(/abortado/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
