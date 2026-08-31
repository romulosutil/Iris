import { describe, expect, test } from "vitest";
import { main, objetoExpirado, varrer } from "./asr-sweeper-orfaos.mjs";

const HORA_MS = 60 * 60 * 1000;

// Fake mínimo do S3Client: responde só a `ListObjectsV2Command` e
// `DeleteObjectCommand` pelo `.constructor.name` (mesma convenção de
// makeFakeSql em scripts/retencao-aviso-previo.test.mjs — fake registra
// chamadas, sem `vi.mock` e sem MinIO real). `paginas` é a fila de páginas
// devolvidas por `ListObjectsV2Command` em ordem.
function makeFakeClient({ paginas = [{ Contents: [] }] } = {}) {
  const apagados = [];
  let chamada = 0;
  return {
    apagados,
    async send(comando) {
      if (comando.constructor.name === "ListObjectsV2Command") {
        const pagina = paginas[chamada] ?? { Contents: [] };
        chamada += 1;
        return pagina;
      }
      if (comando.constructor.name === "DeleteObjectCommand") {
        apagados.push(comando.input.Key);
        return {};
      }
      throw new Error(`comando inesperado: ${comando.constructor.name}`);
    },
  };
}

describe("objetoExpirado — o predicado de idade (#72/T15)", () => {
  test("objeto com mtime de agora não está expirado", () => {
    const agora = new Date("2026-08-30T12:00:00Z");
    expect(objetoExpirado(agora, agora, 6)).toBe(false);
  });

  test("objeto com 5h59min de idade não está expirado (janela de 6h)", () => {
    const agora = new Date("2026-08-30T12:00:00Z");
    const mtime = new Date(agora.getTime() - (6 * HORA_MS - 60_000));
    expect(objetoExpirado(mtime, agora, 6)).toBe(false);
  });

  test("objeto com exatamente 6h de idade NÃO está expirado (estritamente maior)", () => {
    const agora = new Date("2026-08-30T12:00:00Z");
    const mtime = new Date(agora.getTime() - 6 * HORA_MS);
    expect(objetoExpirado(mtime, agora, 6)).toBe(false);
  });

  test("objeto com 6h01min de idade está expirado", () => {
    const agora = new Date("2026-08-30T12:00:00Z");
    const mtime = new Date(agora.getTime() - (6 * HORA_MS + 60_000));
    expect(objetoExpirado(mtime, agora, 6)).toBe(true);
  });

  test("nome/chave do objeto NUNCA entra no predicado — só mtime importa", () => {
    // Regressão direta da memória "auditar-por-nome-apagar-por-mtime": um
    // objeto cujo NOME embute um timestamp antigo, mas que foi re-subido
    // (mtime real = agora), não pode vencer. O predicado nem recebe o nome
    // como parâmetro — só `lastModified` — então não há como ele vazar para
    // a decisão.
    const agora = new Date("2026-08-30T12:00:00Z");
    expect(objetoExpirado(agora, agora, 6)).toBe(false);
  });
});

describe("varrer — a varredura do bucket (#72/T15)", () => {
  const agora = new Date("2026-08-30T12:00:00Z");

  test("bucket vazio não é erro: 0 inspecionados, 0 apagados", async () => {
    const client = makeFakeClient({ paginas: [{ Contents: [] }] });

    await expect(
      varrer(client, "iris-asr-efemero", { agora, limiteHoras: 6 }),
    ).resolves.toEqual({ inspecionados: 0, apagados: 0 });
    expect(client.apagados).toEqual([]);
  });

  test("apaga só os objetos com mtime > limite, preserva os recentes", async () => {
    const antigo = new Date(agora.getTime() - 7 * HORA_MS);
    const recente = new Date(agora.getTime() - 1 * HORA_MS);
    const client = makeFakeClient({
      paginas: [
        {
          Contents: [
            { Key: "loteA/orfao-antigo.wav", LastModified: antigo },
            { Key: "loteA/em-processamento.wav", LastModified: recente },
          ],
        },
      ],
    });

    await expect(
      varrer(client, "iris-asr-efemero", { agora, limiteHoras: 6 }),
    ).resolves.toEqual({ inspecionados: 2, apagados: 1 });
    expect(client.apagados).toEqual(["loteA/orfao-antigo.wav"]);
  });

  test("dry-run conta os expirados mas não chama DeleteObject", async () => {
    const antigo = new Date(agora.getTime() - 7 * HORA_MS);
    const client = makeFakeClient({
      paginas: [{ Contents: [{ Key: "orfao.wav", LastModified: antigo }] }],
    });

    await expect(
      varrer(client, "iris-asr-efemero", {
        agora,
        limiteHoras: 6,
        dryRun: true,
      }),
    ).resolves.toEqual({ inspecionados: 1, apagados: 1 });
    expect(client.apagados).toEqual([]);
  });

  test("segue a paginação (IsTruncated) até a última página", async () => {
    const antigo = new Date(agora.getTime() - 7 * HORA_MS);
    const client = makeFakeClient({
      paginas: [
        {
          Contents: [{ Key: "pagina1/orfao.wav", LastModified: antigo }],
          IsTruncated: true,
          NextContinuationToken: "token-1",
        },
        {
          Contents: [{ Key: "pagina2/orfao.wav", LastModified: antigo }],
          IsTruncated: false,
        },
      ],
    });

    await expect(
      varrer(client, "iris-asr-efemero", { agora, limiteHoras: 6 }),
    ).resolves.toEqual({ inspecionados: 2, apagados: 2 });
    expect(client.apagados).toEqual(["pagina1/orfao.wav", "pagina2/orfao.wav"]);
  });
});

describe("main — validação de argumentos e env (#72/T15)", () => {
  test("rejeita argumento desconhecido antes de tocar env/S3", async () => {
    await expect(main(["--bagulho"])).rejects.toThrow(
      /argumento não reconhecido: --bagulho/,
    );
  });

  test("falha nomeando a env ausente quando ASR_S3_* não está configurado", async () => {
    delete process.env.ASR_S3_ENDPOINT;
    delete process.env.ASR_S3_ACCESS_KEY;
    delete process.env.ASR_S3_SECRET_KEY;

    await expect(main(["--once"])).rejects.toThrow(
      /ASR_S3_ENDPOINT\/ASR_S3_ACCESS_KEY\/ASR_S3_SECRET_KEY ausentes/,
    );
  });

  test("rejeita ASR_SWEEPER_LIMITE_HORAS inválido", async () => {
    process.env.ASR_S3_ENDPOINT = "http://minio-teste:9000";
    process.env.ASR_S3_ACCESS_KEY = "chave-acesso";
    process.env.ASR_S3_SECRET_KEY = "chave-secreta";
    process.env.ASR_SWEEPER_LIMITE_HORAS = "-1";

    await expect(main(["--once"])).rejects.toThrow(
      /ASR_SWEEPER_LIMITE_HORAS precisa ser número positivo/,
    );

    delete process.env.ASR_S3_ENDPOINT;
    delete process.env.ASR_S3_ACCESS_KEY;
    delete process.env.ASR_S3_SECRET_KEY;
    delete process.env.ASR_SWEEPER_LIMITE_HORAS;
  });
});
