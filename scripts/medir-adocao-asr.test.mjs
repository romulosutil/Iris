import { describe, expect, test } from "vitest";
import {
  classificarAdocao,
  coletar,
  derivarTicksVazios,
  DIAS_PADRAO,
  formatarRelatorio,
  main,
  resolverConfig,
} from "./medir-adocao-asr.mjs";

// ─── dublê de `postgres` ────────────────────────────────────────────────────
//
// Fake por PALAVRA-CHAVE da consulta, não por ordem de chamada: um dublê que
// responde na sequência em que foi chamado passaria verde depois de alguém
// trocar duas consultas de lugar e atribuir o resultado errado a cada medida.
// A ordem das checagens abaixo importa — quase toda consulta faz `JOIN clinic`,
// então "FROM clinic" só pode ser testado por último.
const RESPOSTAS_PADRAO = {
  clinicas: [{ reais: 8, demo: 1 }],
  uso: [{ sessoes: 28, clinicas_ativas: 2, terapeutas: 32 }],
  captura: [{ sessoes_com_captura: 21 }],
  porStatus: [],
  latencia: [{ transcritos: 0, p50_s: null, max_s: null }],
  resgate: [{ pendentes: 0 }],
  heartbeats: [
    { job: "asr", idade_s: 21, tem_erro: false },
    { job: "asr-sweeper", idade_s: 165, tem_erro: false },
  ],
};

function responder(texto, respostas) {
  if (texto.includes("SET TRANSACTION READ ONLY")) return [];
  if (texto.includes("FROM session s")) return respostas.uso;
  if (texto.includes("FROM session_note")) return respostas.captura;
  if (texto.includes("GROUP BY 1")) return respostas.porStatus;
  if (texto.includes("percentile_cont")) return respostas.latencia;
  if (texto.includes("objeto_ref IS NOT NULL")) return respostas.resgate;
  if (texto.includes("FROM job_heartbeat")) return respostas.heartbeats;
  if (texto.includes("FROM clinic")) return respostas.clinicas;
  throw new Error(`Consulta não prevista pelo dublê: ${texto}`);
}

function criarSqlFake({ respostas = RESPOSTAS_PADRAO, falharEm } = {}) {
  const registro = { consultas: [], encerrado: false, transacoes: 0 };
  const tag = (strings, ...valores) => {
    const texto = strings.join("?").replace(/\s+/g, " ").trim();
    registro.consultas.push({ texto, valores });
    if (falharEm && texto.includes(falharEm)) {
      return Promise.reject(new Error("falha simulada na consulta"));
    }
    return Promise.resolve(responder(texto, respostas));
  };
  tag.begin = async (fn) => {
    registro.transacoes += 1;
    return fn(tag);
  };
  tag.end = async () => {
    registro.encerrado = true;
  };
  return { criarSql: () => tag, registro };
}

const URL_LOCAL = "postgres://iris:s@localhost:5432/iris";

describe("resolverConfig", () => {
  test("recusa quando não há role dona, nomeando o motivo do zero da RLS", () => {
    expect(() => resolverConfig({ DATABASE_URL: URL_LOCAL }, [])).toThrow(
      /SMOKE_DATABASE_URL/,
    );
    expect(() => resolverConfig({ DATABASE_URL: URL_LOCAL }, [])).toThrow(
      /ZERO clipe/,
    );
  });

  test("aceita MIGRATION_DATABASE_URL como alternativa e usa a janela padrão", () => {
    expect(resolverConfig({ MIGRATION_DATABASE_URL: URL_LOCAL }, [])).toEqual({
      dbUrl: URL_LOCAL,
      dias: DIAS_PADRAO,
    });
  });

  test("--dias sobrescreve a janela", () => {
    expect(
      resolverConfig({ SMOKE_DATABASE_URL: URL_LOCAL }, ["--dias=30"]).dias,
    ).toBe(30);
  });

  test.each(["0", "-1", "366", "7.5", "sete", ""])(
    "--dias=%s é recusado",
    (valor) => {
      expect(() =>
        resolverConfig({ SMOKE_DATABASE_URL: URL_LOCAL }, [`--dias=${valor}`]),
      ).toThrow(/--dias precisa ser inteiro/);
    },
  );
});

describe("derivarTicksVazios", () => {
  test("7 dias a 1 min = 10080 ticks, e o piso desconta os clipes", () => {
    expect(derivarTicksVazios({ clipes: 0, dias: 7 })).toEqual({
      ticksTotais: 10080,
      ticksVaziosPiso: 10080,
    });
    expect(derivarTicksVazios({ clipes: 80, dias: 7 }).ticksVaziosPiso).toBe(
      10000,
    );
  });

  test("mais clipes que ticks não vira piso negativo", () => {
    expect(derivarTicksVazios({ clipes: 99999, dias: 1 }).ticksVaziosPiso).toBe(
      0,
    );
  });

  test("a cadência entra na conta", () => {
    expect(
      derivarTicksVazios({ clipes: 0, dias: 1, cadenciaMinutos: 20 })
        .ticksTotais,
    ).toBe(72);
  });
});

describe("classificarAdocao", () => {
  test("sem sessão documentada não afirma gap de adoção", () => {
    // A régua que importa: zero clipe COM zero oportunidade não é evidência
    // de nada. Inverter a ordem das perguntas faria o script acusar a UI de um
    // gap que a medição não sustenta.
    expect(
      classificarAdocao({
        sessoesComCaptura: 0,
        clipes: 0,
        transcritos: 0,
      }).codigo,
    ).toBe("sem-uso-do-produto");
  });

  test("sessão documentada e zero clipe = gap de adoção", () => {
    const v = classificarAdocao({
      sessoesComCaptura: 21,
      clipes: 0,
      transcritos: 0,
    });
    expect(v.codigo).toBe("gap-de-adocao");
    expect(v.explicacao).toMatch(/descoberta\/UI/);
  });

  test("clipe gravado e nada transcrito aponta infraestrutura, não adoção", () => {
    const v = classificarAdocao({
      sessoesComCaptura: 21,
      clipes: 3,
      transcritos: 0,
    });
    expect(v.codigo).toBe("pipeline-travado");
    expect(v.explicacao).toMatch(/§6\.4/);
  });

  test("transcrito na janela = em uso", () => {
    expect(
      classificarAdocao({ sessoesComCaptura: 21, clipes: 3, transcritos: 3 })
        .codigo,
    ).toBe("em-uso");
  });
});

describe("formatarRelatorio", () => {
  const medidasBase = {
    dias: 7,
    clinicas: { reais: 8, demo: 1 },
    uso: { sessoes: 28, clinicas_ativas: 2, terapeutas: 32 },
    sessoesComCaptura: 21,
    porStatus: [],
    clipes: 0,
    latencia: { transcritos: 0, p50_s: null, max_s: null },
    resgatePendentes: 1,
    heartbeats: [{ job: "asr", idade_s: 21, tem_erro: false }],
  };

  test("o cenário medido em 07/09/2026 sai como gap de adoção, com os números", () => {
    const texto = formatarRelatorio(medidasBase);
    expect(texto).toContain("Sessões documentadas ... 21");
    expect(texto).toContain("Clipes gravados ........ 0");
    expect(texto).toContain("(nenhuma linha em audio_capture na janela)");
    expect(texto).toContain("VEREDITO [gap-de-adocao]");
  });

  test("sem transcrição não inventa latência", () => {
    const texto = formatarRelatorio(medidasBase);
    expect(texto).toContain("Latência criado->transcrito: sem amostra");
    expect(texto).not.toMatch(/p50 null/);
  });

  test("com transcrição imprime p50 e máximo", () => {
    const texto = formatarRelatorio({
      ...medidasBase,
      porStatus: [{ status: "transcrito", reais: 2, demo: 0 }],
      clipes: 2,
      latencia: { transcritos: 2, p50_s: 34, max_s: 51 },
    });
    expect(texto).toContain("p50 34s");
    expect(texto).toContain("máx 51s");
    expect(texto).toContain("VEREDITO [em-uso]");
  });

  test("declara o que NÃO mediu — a flag é env do App, não linha de banco", () => {
    expect(formatarRelatorio(medidasBase)).toContain(
      "não lê FEATURE_FLAG_ASR_ENABLED",
    );
  });

  test("heartbeat com ultimo_erro é sinalizado", () => {
    expect(
      formatarRelatorio({
        ...medidasBase,
        heartbeats: [{ job: "asr", idade_s: 9000, tem_erro: true }],
      }),
    ).toContain("ultimo_erro preenchido");
  });
});

describe("coletar", () => {
  test("a janela vai como parâmetro ligado, nunca interpolada no SQL", async () => {
    const { criarSql, registro } = criarSqlFake();
    await coletar(criarSql(), 30);
    const comJanela = registro.consultas.filter((c) =>
      c.valores.includes("30 days"),
    );
    expect(comJanela.length).toBeGreaterThanOrEqual(4);
    expect(registro.consultas.some((c) => c.texto.includes("30 days"))).toBe(
      false,
    );
  });

  test("clipes soma reais e demo de todos os status", async () => {
    const { criarSql } = criarSqlFake({
      respostas: {
        ...RESPOSTAS_PADRAO,
        porStatus: [
          { status: "falhou", reais: 1, demo: 0 },
          { status: "transcrito", reais: 2, demo: 3 },
        ],
      },
    });
    const medidas = await coletar(criarSql(), 7);
    expect(medidas.clipes).toBe(6);
  });
});

describe("main", () => {
  test("abre READ ONLY ANTES de qualquer SELECT", async () => {
    const { criarSql, registro } = criarSqlFake();
    await main({ SMOKE_DATABASE_URL: URL_LOCAL }, [], criarSql);

    expect(registro.transacoes).toBe(1);
    // A trava contra escrita acidental é esta linha, e ela só vale se vier
    // primeiro: um SELECT antes dela já teria rodado fora do modo read-only.
    expect(registro.consultas[0].texto).toBe("SET TRANSACTION READ ONLY");
    expect(registro.encerrado).toBe(true);
  });

  test("guardrail barra banco remoto sem ALLOW_SEED_REMOTE", async () => {
    const { criarSql } = criarSqlFake();
    await expect(
      main(
        {
          SMOKE_DATABASE_URL: "postgres://iris:s@31.97.170.105:5432/iris",
          ALLOW_SEED_REMOTE: undefined,
        },
        [],
        criarSql,
      ),
    ).rejects.toThrow(/GUARDRAIL medir-adocao-asr/);
  });

  test("encerra a conexão mesmo quando a coleta falha", async () => {
    const { criarSql, registro } = criarSqlFake({ falharEm: "FROM session s" });
    await expect(
      main({ SMOKE_DATABASE_URL: URL_LOCAL }, [], criarSql),
    ).rejects.toThrow(/falha simulada/);
    expect(registro.encerrado).toBe(true);
  });

  test("--dias chega às consultas", async () => {
    const { criarSql, registro } = criarSqlFake();
    await main({ SMOKE_DATABASE_URL: URL_LOCAL }, ["--dias=1"], criarSql);
    expect(registro.consultas.some((c) => c.valores.includes("1 days"))).toBe(
      true,
    );
  });
});
