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

  it("erro do S3 não vaza credenciais na mensagem", async () => {
    const { guardar } = await import("./storage");
    sendMock.mockRejectedValue(new Error("AccessDenied: bad signature"));

    await expect(guardar("lote/1.wav", new Uint8Array([1]))).rejects.toThrow(
      /falha ao guardar/,
    );

    try {
      await guardar("lote/1.wav", new Uint8Array([1]));
      expect.unreachable();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain(ENV_BASE.ASR_S3_ACCESS_KEY);
      expect(msg).not.toContain(ENV_BASE.ASR_S3_SECRET_KEY);
    }
  });

  it("falta de env obrigatória lança erro claro sem instanciar client", async () => {
    delete process.env.ASR_S3_ENDPOINT;
    const { guardar } = await import("./storage");
    await expect(guardar("lote/1.wav", new Uint8Array([1]))).rejects.toThrow(
      /ASR_S3_ENDPOINT/,
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});
