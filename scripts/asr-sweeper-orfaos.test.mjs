import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ─── dublês de MÓDULO: só existem para os testes de `main()` (#494/T22) ─────
//
// POR QUE: até T22 os 4 testes de `main()` rejeitavam todos dentro de
// `resolveConfig()` e NENHUM alcançava `varrer`. Com isso, trocar a fiação
// `refsEmUso: criarConsultaEmUso(sql)` por `async () => new Set()` deixava a
// suíte inteira verde — e o sweeper em produção passava a apagar áudio
// `na_fila` VIVO, exatamente o cenário que a migração 0138 foi escrita para
// impedir. Para medir a fiação é preciso `main()` chegar até o fim, e para
// isso o Postgres e o S3 reais precisam ser dublados no nível do módulo.
//
// `vi.hoisted` porque as fábricas de `vi.mock` são içadas acima dos imports e
// não podem fechar sobre `const` de topo de arquivo.
const espiao = vi.hoisted(() => ({
  paginas: [{ Contents: [] }],
  paginaAtual: 0,
  emUso: new Set(),
  apagados: [],
  consultas: [],
  sqlEncerrado: false,
  clientDestruido: false,
}));

vi.mock("postgres", () => {
  // `postgres(url, opts)` devolve a tag `sql`. O dublê registra cada consulta
  // e responde como `app_asr_objetos_em_uso`: das chaves perguntadas, devolve
  // só as que o "banco" considera reivindicadas.
  const postgres = () => {
    const sql = async (strings, ...valores) => {
      espiao.consultas.push({ texto: strings.join("$?"), valores });
      const chaves = valores[0] ?? [];
      return chaves.filter((c) => espiao.emUso.has(c)).map((ref) => ({ ref }));
    };
    sql.end = async () => {
      espiao.sqlEncerrado = true;
    };
    return sql;
  };
  return { default: postgres };
});

vi.mock("@aws-sdk/client-s3", () => {
  // Classes nomeadas (não arrow): `varrer` faz `new ListObjectsV2Command(...)`
  // e o fake discrimina por `constructor.name` — memória do repo
  // "duble-arrow-nao-e-construtor".
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class S3Client {
    constructor(config) {
      espiao.configS3 = config;
    }
    async send(comando) {
      if (comando.constructor.name === "ListObjectsV2Command") {
        // Interruptor para o teste de limpeza de conexão: simula o MinIO fora
        // do ar no meio da varredura.
        if (espiao.erroList) throw new Error("MinIO indisponível");
        const pagina = espiao.paginas[espiao.paginaAtual] ?? { Contents: [] };
        espiao.paginaAtual += 1;
        return pagina;
      }
      if (comando.constructor.name === "DeleteObjectCommand") {
        espiao.apagados.push(comando.input.Key);
        return {};
      }
      throw new Error(`comando inesperado: ${comando.constructor.name}`);
    }
    destroy() {
      espiao.clientDestruido = true;
    }
  }
  return { S3Client, ListObjectsV2Command, DeleteObjectCommand };
});

const { criarConsultaEmUso, main, objetoExpirado, varrer } =
  await import("./asr-sweeper-orfaos.mjs");

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

// Fake da checagem de estado: `emUso` é o conjunto de chaves que o banco
// diria estar `na_fila`/`transcrevendo`. `chamadas` registra os lotes
// consultados (uma consulta por página, não uma por objeto).
function makeFakeRefsEmUso(emUso = []) {
  const chamadas = [];
  const conjunto = new Set(emUso);
  const fn = async (chaves) => {
    chamadas.push(chaves);
    return new Set(chaves.filter((c) => conjunto.has(c)));
  };
  fn.chamadas = chamadas;
  return fn;
}

const nenhumEmUso = () => makeFakeRefsEmUso([]);

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
      varrer(client, "iris-asr-efemero", {
        agora,
        limiteHoras: 6,
        refsEmUso: nenhumEmUso(),
      }),
    ).resolves.toEqual({
      inspecionados: 0,
      apagados: 0,
      seriamApagados: 0,
      emUso: 0,
    });
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
      varrer(client, "iris-asr-efemero", {
        agora,
        limiteHoras: 6,
        refsEmUso: nenhumEmUso(),
      }),
    ).resolves.toEqual({
      inspecionados: 2,
      apagados: 1,
      seriamApagados: 0,
      emUso: 0,
    });
    expect(client.apagados).toEqual(["loteA/orfao-antigo.wav"]);
  });

  test("dry-run conta os expirados em `seriamApagados`, NUNCA em `apagados` (regressão: resumo mentindo)", async () => {
    const antigo = new Date(agora.getTime() - 7 * HORA_MS);
    const client = makeFakeClient({
      paginas: [{ Contents: [{ Key: "orfao.wav", LastModified: antigo }] }],
    });

    await expect(
      varrer(client, "iris-asr-efemero", {
        agora,
        limiteHoras: 6,
        dryRun: true,
        refsEmUso: nenhumEmUso(),
      }),
    ).resolves.toEqual({
      inspecionados: 1,
      apagados: 0,
      seriamApagados: 1,
      emUso: 0,
    });
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
      varrer(client, "iris-asr-efemero", {
        agora,
        limiteHoras: 6,
        refsEmUso: nenhumEmUso(),
      }),
    ).resolves.toEqual({
      inspecionados: 2,
      apagados: 2,
      seriamApagados: 0,
      emUso: 0,
    });
    expect(client.apagados).toEqual(["pagina1/orfao.wav", "pagina2/orfao.wav"]);
  });
});

// ─── revisão final de integração #72: idade sozinha não decide ─────────────
describe("varrer — checagem de estado antes de apagar (#72, integração)", () => {
  const agora = new Date("2026-08-30T12:00:00Z");
  const antigo = new Date(agora.getTime() - 7 * HORA_MS);

  test("objeto VELHO cuja linha ainda está na fila NÃO é apagado nem contado como apagado", async () => {
    // O caso que motivou o fix: fila represada / agendador parado por mais que
    // a janela. Apagar aqui queimaria as 3 tentativas do clipe por motivo
    // puramente operacional.
    const client = makeFakeClient({
      paginas: [{ Contents: [{ Key: "lote:0", LastModified: antigo }] }],
    });

    await expect(
      varrer(client, "iris-asr-efemero", {
        agora,
        limiteHoras: 6,
        refsEmUso: makeFakeRefsEmUso(["lote:0"]),
      }),
    ).resolves.toEqual({
      inspecionados: 1,
      apagados: 0,
      seriamApagados: 0,
      emUso: 1,
    });
    expect(client.apagados).toEqual([]);
  });

  test("órfão de verdade (nenhuma linha) e linha em estado terminal SÃO apagados", async () => {
    // A função do banco só devolve chaves de linha `na_fila`/`transcrevendo`;
    // "sem linha nenhuma" e "linha `transcrito`/`falhou`" chegam aqui do mesmo
    // jeito — ausentes do conjunto — e os dois são lixo a recolher.
    const refsEmUso = makeFakeRefsEmUso(["lote:emfila"]);
    const client = makeFakeClient({
      paginas: [
        {
          Contents: [
            { Key: "lote:semlinha", LastModified: antigo },
            { Key: "lote:terminal", LastModified: antigo },
            { Key: "lote:emfila", LastModified: antigo },
          ],
        },
      ],
    });

    await expect(
      varrer(client, "iris-asr-efemero", {
        agora,
        limiteHoras: 6,
        refsEmUso,
      }),
    ).resolves.toEqual({
      inspecionados: 3,
      apagados: 2,
      seriamApagados: 0,
      emUso: 1,
    });
    expect(client.apagados).toEqual(["lote:semlinha", "lote:terminal"]);
  });

  test("só os candidatos VENCIDOS vão para a consulta de estado (o mtime continua sendo o primeiro filtro)", async () => {
    const recente = new Date(agora.getTime() - 1 * HORA_MS);
    const refsEmUso = makeFakeRefsEmUso([]);
    const client = makeFakeClient({
      paginas: [
        {
          Contents: [
            { Key: "velho", LastModified: antigo },
            { Key: "novo", LastModified: recente },
          ],
        },
      ],
    });

    await varrer(client, "iris-asr-efemero", {
      agora,
      limiteHoras: 6,
      refsEmUso,
    });
    expect(refsEmUso.chamadas).toEqual([["velho"]]);
  });

  test("sem `refsEmUso` a varredura RECUSA rodar (fail-closed), sem apagar nada", async () => {
    const client = makeFakeClient({
      paginas: [{ Contents: [{ Key: "lote:0", LastModified: antigo }] }],
    });

    await expect(
      varrer(client, "iris-asr-efemero", { agora, limiteHoras: 6 }),
    ).rejects.toThrow(/exige `refsEmUso`/);
    expect(client.apagados).toEqual([]);
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

  test("recusa rodar sem ASR_SWEEPER_DATABASE_URL (não apaga por idade às cegas)", async () => {
    process.env.ASR_S3_ENDPOINT = "http://minio-teste:9000";
    process.env.ASR_S3_ACCESS_KEY = "chave-acesso";
    process.env.ASR_S3_SECRET_KEY = "chave-secreta";
    delete process.env.ASR_SWEEPER_DATABASE_URL;

    await expect(main(["--once"])).rejects.toThrow(
      /ASR_SWEEPER_DATABASE_URL ausente/,
    );

    delete process.env.ASR_S3_ENDPOINT;
    delete process.env.ASR_S3_ACCESS_KEY;
    delete process.env.ASR_S3_SECRET_KEY;
  });

  test("rejeita ASR_SWEEPER_LIMITE_HORAS inválido", async () => {
    process.env.ASR_S3_ENDPOINT = "http://minio-teste:9000";
    process.env.ASR_S3_ACCESS_KEY = "chave-acesso";
    process.env.ASR_S3_SECRET_KEY = "chave-secreta";
    process.env.ASR_SWEEPER_DATABASE_URL =
      "postgres://ninguem@localhost:1/nada";
    process.env.ASR_SWEEPER_LIMITE_HORAS = "-1";

    await expect(main(["--once"])).rejects.toThrow(
      /ASR_SWEEPER_LIMITE_HORAS precisa ser número positivo/,
    );

    delete process.env.ASR_S3_ENDPOINT;
    delete process.env.ASR_S3_ACCESS_KEY;
    delete process.env.ASR_S3_SECRET_KEY;
    delete process.env.ASR_SWEEPER_DATABASE_URL;
    delete process.env.ASR_SWEEPER_LIMITE_HORAS;
  });
});

// ─── #494/T22: a consulta de estado em si, que não tinha teste nenhum ───────
describe("criarConsultaEmUso — a pergunta que separa órfão de trabalho vivo", () => {
  /** Fake da tag `sql` do postgres.js: registra a consulta e devolve `linhas`. */
  function fakeSql(linhas = []) {
    const chamadas = [];
    const sql = async (strings, ...valores) => {
      chamadas.push({ texto: strings.join("$?"), valores });
      return linhas;
    };
    sql.chamadas = chamadas;
    return sql;
  }

  test("lista vazia não emite consulta nenhuma e devolve conjunto vazio", async () => {
    const sql = fakeSql([{ ref: "nunca" }]);
    await expect(criarConsultaEmUso(sql)([])).resolves.toEqual(new Set());
    expect(sql.chamadas).toEqual([]);
  });

  test("devolve as refs QUE O BANCO reivindicou, não as que foram perguntadas", async () => {
    // A mutação que este caso mata é o fail-open: trocar
    // `new Set(linhas.map((l) => l.ref))` por `new Set()`. Com ela, `varrer`
    // acharia que nada está em uso e apagaria o áudio de todo clipe `na_fila`
    // mais velho que a janela. O oráculo é de CONJUNTO EXATO — um subconjunto
    // vazio precisa reprovar.
    const sql = fakeSql([{ ref: "lote:vivo" }]);
    const emUso = await criarConsultaEmUso(sql)([
      "lote:vivo",
      "lote:orfao",
      "lote:terminal",
    ]);
    expect(emUso).toEqual(new Set(["lote:vivo"]));
    expect(emUso.has("lote:orfao")).toBe(false);
  });

  test("pergunta à FUNÇÃO 0138, nunca à tabela `audio_capture` direto", async () => {
    // `audio_capture` tem FORCE RLS com policies `TO app_role` resolvidas por
    // `app_clinic_id_exigido()`, e o sweeper não tem usuário logado nem
    // `app.clinic_id`. Um `SELECT` cru na tabela devolveria ZERO LINHAS SEM
    // ERRO — e zero linhas aqui significa "nada em uso, pode apagar tudo"
    // (memória `grant-sem-policy-nega-tudo-em-silencio`, na direção mais
    // perigosa possível). Por isso a consulta é asserida pelo TEXTO.
    const sql = fakeSql([]);
    await criarConsultaEmUso(sql)(["k"]);
    expect(sql.chamadas).toHaveLength(1);
    expect(sql.chamadas[0].texto).toContain("app_asr_objetos_em_uso");
    expect(sql.chamadas[0].texto).not.toContain("audio_capture");
  });

  test("manda o array JS inteiro como UM parâmetro, sem achatar (regressão 22P02)", async () => {
    // Medido contra o Postgres local (comentário do script): `sql.array(...)`
    // ou `::text[]` fazem o driver mandar o array achatado em texto e o
    // servidor responde `22P02 malformed array literal`. O array JS puro é
    // serializado como `text[]` de verdade.
    const sql = fakeSql([]);
    await criarConsultaEmUso(sql)(["a", "b"]);
    expect(sql.chamadas[0].valores).toEqual([["a", "b"]]);
  });
});

// ─── #494/T22: a FIAÇÃO de main(), medida onde ela de fato roda ─────────────
describe("main — a fiação da checagem de estado chega até varrer", () => {
  const ENV = {
    ASR_S3_ENDPOINT: "http://minio-teste:9000",
    ASR_S3_ACCESS_KEY: "chave-acesso",
    ASR_S3_SECRET_KEY: "chave-secreta",
    ASR_SWEEPER_DATABASE_URL: "postgres://sweeper@localhost:5432/iris",
    ASR_SWEEPER_LIMITE_HORAS: "6",
  };

  // Sete horas: os objetos plantados abaixo já venceram a janela de 6h, então
  // a ÚNICA coisa que pode salvá-los do delete é a checagem de estado.
  const antigo = new Date(Date.now() - 7 * HORA_MS);

  beforeEach(() => {
    Object.assign(process.env, ENV);
    espiao.paginas = [{ Contents: [] }];
    espiao.paginaAtual = 0;
    espiao.emUso = new Set();
    espiao.apagados = [];
    espiao.consultas = [];
    espiao.sqlEncerrado = false;
    espiao.clientDestruido = false;
    espiao.erroList = false;
  });

  afterEach(() => {
    for (const k of Object.keys(ENV)) delete process.env[k];
  });

  test("objeto VENCIDO cuja linha está `na_fila` sobrevive a uma varredura REAL de main()", async () => {
    // ESTE é o caso que os 4 testes antigos de `main()` não alcançavam: todos
    // rejeitavam dentro de `resolveConfig()`. Trocar
    // `refsEmUso: criarConsultaEmUso(sql)` por `async () => new Set()` os
    // deixava verdes — e apagava o áudio vivo. Aqui a mutação some com
    // `lote:vivo` do bucket e o conjunto exato de apagados reprova.
    espiao.emUso = new Set(["lote:vivo"]);
    espiao.paginas = [
      {
        Contents: [
          { Key: "lote:vivo", LastModified: antigo },
          { Key: "lote:orfao", LastModified: antigo },
        ],
      },
    ];

    await main(["--once"]);

    expect(espiao.apagados).toEqual(["lote:orfao"]);
  });

  test("S3Client desliga checksum automático — MinIO devolve 400 InvalidRequest no ListObjectsV2 com o default do SDK", async () => {
    // Achado em produção ao provisionar #500: `mc ls` funcionava com as
    // MESMAS credenciais; só o SDK Node quebrava. Versões recentes de
    // @aws-sdk/client-s3 anexam checksum por padrão em mais operações, e o
    // MinIO medido (RELEASE.2025-09-07) rejeita o ListObjectsV2 resultante.
    // Sem isto o sweeper nunca lista o bucket — falha em TODO tick, exit 1,
    // nenhum objeto órfão é varrido.
    await main(["--once"]);

    expect(espiao.configS3.requestChecksumCalculation).toBe("WHEN_REQUIRED");
    expect(espiao.configS3.responseChecksumValidation).toBe("WHEN_REQUIRED");
  });

  test("main() consulta o BANCO de verdade: uma consulta por página, com as chaves vencidas", async () => {
    // Complemento do caso acima pelo outro lado: mesmo quando nada está em
    // uso (e o desfecho de apagar seria idêntico ao da mutação), a pergunta
    // ao banco precisa ter acontecido. Sem esta asserção, um sweeper que
    // ignorasse o Postgres passaria sempre que a fila estivesse vazia — e a
    // fila vazia é o estado normal na maior parte do tempo.
    espiao.paginas = [
      {
        Contents: [
          { Key: "lote:orfao", LastModified: antigo },
          { Key: "lote:novo", LastModified: new Date() },
        ],
      },
    ];

    await main(["--once"]);

    // #536 — o heartbeat também passa pelo mesmo `sql`; aqui só interessa a
    // pergunta de estado ao banco.
    const consultasDeEstado = espiao.consultas.filter(
      (c) => !c.texto.includes("app_job_heartbeat_gravar"),
    );
    expect(consultasDeEstado).toHaveLength(1);
    expect(consultasDeEstado[0].texto).toContain("app_asr_objetos_em_uso");
    // Só o vencido vai à consulta — o mtime continua sendo o primeiro filtro.
    expect(consultasDeEstado[0].valores).toEqual([["lote:orfao"]]);
    expect(espiao.apagados).toEqual(["lote:orfao"]);
  });

  test("--dry-run consulta o estado e não apaga nada", async () => {
    espiao.emUso = new Set(["lote:vivo"]);
    espiao.paginas = [
      {
        Contents: [
          { Key: "lote:vivo", LastModified: antigo },
          { Key: "lote:orfao", LastModified: antigo },
        ],
      },
    ];

    await main(["--once", "--dry-run"]);

    expect(espiao.apagados).toEqual([]);
    expect(espiao.consultas).toHaveLength(1);
  });

  test("fecha conexão do Postgres e do S3 mesmo quando a varredura explode", async () => {
    // Um sweeper que vaza conexão a cada tick de agendador esgota o pool do
    // Postgres em produção sem nunca falhar visivelmente.
    espiao.erroList = true;

    await expect(main(["--once"])).rejects.toThrow(/MinIO indisponível/);

    expect(espiao.sqlEncerrado).toBe(true);
    expect(espiao.clientDestruido).toBe(true);
  });

  // ─── #536: heartbeat no banco ──────────────────────────────────────────────
  const heartbeats = () =>
    espiao.consultas
      .filter((c) => c.texto.includes("app_job_heartbeat_gravar"))
      .map((c) => c.valores);

  test("#536: varredura real grava heartbeat ok=true com só contagens (nenhuma chave de objeto)", async () => {
    espiao.paginas = [
      { Contents: [{ Key: "lote:orfao", LastModified: antigo }] },
    ];

    await main(["--once"]);

    expect(heartbeats()).toEqual([
      [
        "asr-sweeper",
        true,
        "inspecionados=1 apagados=1 seriamApagados=0 emUso=0",
      ],
    ]);
    expect(heartbeats()[0][2]).not.toContain("lote:");
  });

  test("#536: --dry-run NÃO grava heartbeat", async () => {
    espiao.paginas = [
      { Contents: [{ Key: "lote:orfao", LastModified: antigo }] },
    ];

    await main(["--once", "--dry-run"]);

    expect(heartbeats()).toEqual([]);
  });

  test("#536: varredura que explode grava heartbeat ok=false (name, sem a message) e propaga", async () => {
    espiao.erroList = true;

    await expect(main(["--once"])).rejects.toThrow(/MinIO indisponível/);

    const [linha] = heartbeats();
    expect(linha[0]).toBe("asr-sweeper");
    expect(linha[1]).toBe(false);
    expect(linha[2]).toMatch(/^erro=/);
    expect(linha[2]).not.toContain("MinIO indisponível");
  });
});
