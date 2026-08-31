import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Dublê do S3Client — precisa ser CLASSE (não arrow function), pois o
// módulo real instancia com `new S3Client(...)` (memória do repo
// "duble-arrow-nao-e-construtor": arrow function não é construtor, o erro
// cairia no catch e o teste passaria pelo caminho errado).
const sendMock = vi.fn();
let ultimaConfig: Record<string, unknown> | undefined;

vi.mock("@aws-sdk/client-s3", () => {
  class S3ClientMock {
    constructor(config: Record<string, unknown>) {
      ultimaConfig = config;
    }
    send(...args: unknown[]) {
      return sendMock(...args);
    }
  }
  class PutObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  return {
    S3Client: S3ClientMock,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

const ENV_BASE = {
  ASR_S3_ENDPOINT: "http://minio-teste:9000",
  ASR_S3_ACCESS_KEY: "chave-acesso",
  ASR_S3_SECRET_KEY: "chave-secreta",
};

describe("storage ASR", () => {
  beforeEach(() => {
    sendMock.mockReset();
    ultimaConfig = undefined;
    for (const k of Object.keys(ENV_BASE)) delete process.env[k];
    delete process.env.ASR_S3_BUCKET;
    delete process.env.ASR_S3_REGION;
    Object.assign(process.env, ENV_BASE);
  });

  afterEach(() => {
    for (const k of Object.keys(ENV_BASE)) delete process.env[k];
    delete process.env.ASR_S3_BUCKET;
    delete process.env.ASR_S3_REGION;
  });

  it("configura o client com forcePathStyle e região explícita (default documentado)", async () => {
    const { guardar } = await import("./storage");
    sendMock.mockResolvedValueOnce({});
    await guardar("lote/1.wav", new Uint8Array([1, 2, 3]), "audio/wav");

    expect(ultimaConfig?.forcePathStyle).toBe(true);
    expect(ultimaConfig?.endpoint).toBe(ENV_BASE.ASR_S3_ENDPOINT);
    expect(ultimaConfig?.region).toBe("us-east-1");
  });

  it("desliga checksum automático — MinIO devolve 400 InvalidRequest no ListObjectsV2 com o default do SDK", async () => {
    // Achado em produção ao provisionar #500: `mc ls` funcionava com as
    // MESMAS credenciais contra o mesmo bucket; só o SDK Node quebrava.
    // Versões recentes de @aws-sdk/client-s3 anexam checksum por padrão em
    // mais operações, e o MinIO medido (RELEASE.2025-09-07) rejeita. Mesmo
    // fix em scripts/asr-sweeper-orfaos.mjs (que roda fora deste bundle).
    const { guardar } = await import("./storage");
    sendMock.mockResolvedValueOnce({});
    await guardar("lote/1.wav", new Uint8Array([1, 2, 3]), "audio/wav");

    expect(ultimaConfig?.requestChecksumCalculation).toBe("WHEN_REQUIRED");
    expect(ultimaConfig?.responseChecksumValidation).toBe("WHEN_REQUIRED");
  });

  it("guardar envia PutObjectCommand com bucket default e chave certos", async () => {
    const { guardar } = await import("./storage");
    sendMock.mockResolvedValueOnce({});
    await guardar("lote/1.wav", new Uint8Array([1, 2, 3]), "audio/wav");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0]![0] as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    expect(cmd.constructor.name).toBe("PutObjectCommand");
    expect(cmd.input).toMatchObject({
      Bucket: "iris-asr-efemero",
      Key: "lote/1.wav",
      ContentType: "audio/wav",
    });
  });

  it("guardar respeita ASR_S3_BUCKET e ASR_S3_REGION quando setados", async () => {
    process.env.ASR_S3_BUCKET = "bucket-custom";
    process.env.ASR_S3_REGION = "sa-east-1";
    const { guardar } = await import("./storage");
    sendMock.mockResolvedValueOnce({});
    await guardar("k", new Uint8Array([1]));

    expect(ultimaConfig?.region).toBe("sa-east-1");
    const cmd = sendMock.mock.calls[0]![0] as {
      input: Record<string, unknown>;
    };
    expect(cmd.input.Bucket).toBe("bucket-custom");
  });

  it("ler envia GetObjectCommand e retorna os bytes do corpo", async () => {
    const { ler } = await import("./storage");
    const bytes = new Uint8Array([9, 8, 7]);
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
    });

    const resultado = await ler("lote/1.wav");

    const cmd = sendMock.mock.calls[0]![0] as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    expect(cmd.constructor.name).toBe("GetObjectCommand");
    expect(cmd.input).toMatchObject({
      Bucket: "iris-asr-efemero",
      Key: "lote/1.wav",
    });
    expect(resultado).toBe(bytes);
  });

  it("apagar envia DeleteObjectCommand com bucket/chave certos", async () => {
    const { apagar } = await import("./storage");
    sendMock.mockResolvedValueOnce({});
    await apagar("lote/1.wav");

    const cmd = sendMock.mock.calls[0]![0] as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    expect(cmd.constructor.name).toBe("DeleteObjectCommand");
    expect(cmd.input).toMatchObject({
      Bucket: "iris-asr-efemero",
      Key: "lote/1.wav",
    });
  });

  it("erro do S3 é envelopado nomeando a operação", async () => {
    const { guardar } = await import("./storage");
    sendMock.mockRejectedValue(new Error("AccessDenied: bad signature"));

    await expect(guardar("lote/1.wav", new Uint8Array([1]))).rejects.toThrow(
      /falha ao guardar/,
    );
  });

  // ─── #494/T22: o vazamento de credencial, medido com credencial de verdade ──
  //
  // O caso anterior injetava `new Error("AccessDenied: bad signature")` — uma
  // string que não conteria credencial sob implementação NENHUMA. A asserção
  // "não contém a chave" era verdadeira para qualquer entrada e para qualquer
  // corpo de `mensagemSemSegredo`: mutá-la não derrubava nada.
  //
  // O erro real do SDK v3 embute a credencial: uma falha de assinatura no
  // MinIO volta com o cabeçalho `Authorization` inteiro no `.message`
  // (`Credential=<ACCESS_KEY>/2026.../s3/aws4_request`), e o `Error` do
  // `@smithy/*` carrega o `$metadata` da requisição junto. Como
  // `mensagemSemSegredo` repassa `err.message` verbatim, a chave atravessava
  // o envelope e ia parar no log do container — lido pelo painel do Easypanel
  // servido em HTTP puro (memória `easypanel-ambiente-expoe-segredos`).
  //
  // Cada caso abaixo usa a credencial LITERAL que o módulo tem em env. Se a
  // redação sair de `storage.ts`, o segredo aparece na mensagem e o teste cai.
  it.each([
    [
      "guardar",
      () =>
        new Error(
          `SignatureDoesNotMatch: Authorization=AWS4-HMAC-SHA256 Credential=${ENV_BASE.ASR_S3_ACCESS_KEY}/20260831/us-east-1/s3/aws4_request`,
        ),
    ],
    [
      "ler",
      () =>
        new Error(
          `InvalidAccessKeyId (secret usado: ${ENV_BASE.ASR_S3_SECRET_KEY})`,
        ),
    ],
    [
      "apagar",
      () =>
        // Rejeição que NÃO é `Error`: cai no ramo `String(err)` de
        // `mensagemSemSegredo`, o caminho onde a redação é mais fácil de
        // esquecer.
        `falha crua com chave=${ENV_BASE.ASR_S3_ACCESS_KEY} e segredo=${ENV_BASE.ASR_S3_SECRET_KEY}`,
    ],
  ])(
    "%s: erro do S3 carregando a credencial NÃO a repassa na mensagem",
    async (operacao, criarErro) => {
      const mod = await import("./storage");
      sendMock.mockRejectedValue(
        typeof criarErro === "function" ? criarErro() : criarErro,
      );

      const chamar =
        operacao === "guardar"
          ? () => mod.guardar("lote/1.wav", new Uint8Array([1]))
          : operacao === "ler"
            ? () => mod.ler("lote/1.wav")
            : () => mod.apagar("lote/1.wav");

      let msg = "";
      try {
        await chamar();
        expect.unreachable("a operação deveria ter falhado");
      } catch (err) {
        msg = (err as Error).message;
      }

      expect(msg).toContain(`falha ao ${operacao}`);
      expect(msg).not.toContain(ENV_BASE.ASR_S3_ACCESS_KEY);
      expect(msg).not.toContain(ENV_BASE.ASR_S3_SECRET_KEY);
      // O envelope continua diagnosticável: o que sobra do erro original é o
      // nome da recusa, só a credencial some. Sem esta asserção, redigir a
      // mensagem inteira para uma constante passaria — e um erro que não diz
      // nada é tão ruim quanto um que diz demais.
      expect(msg.length).toBeGreaterThan(
        `storage ASR: falha ao ${operacao} (`.length + 5,
      );
    },
  );

  it("falta de env obrigatória lança erro claro sem instanciar client", async () => {
    delete process.env.ASR_S3_ENDPOINT;
    const { guardar } = await import("./storage");
    await expect(guardar("lote/1.wav", new Uint8Array([1]))).rejects.toThrow(
      /ASR_S3_ENDPOINT/,
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});
