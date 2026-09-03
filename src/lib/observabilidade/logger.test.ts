import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { logarAvisoSemPII, logarErroSemPII } from "./logar-erro";
import {
  CABECALHO_REQUEST_ID,
  gerarCorrelacaoId,
  instalarResolvedorRequestId,
  instalarSink,
  logger,
  normalizarRequestId,
  registrar,
  restaurarSinkPadrao,
  sinkConsole,
  type RegistroLog,
} from "./logger";
import { VALOR_REDIGIDO } from "./redacao";

let capturados: RegistroLog[] = [];

beforeEach(() => {
  capturados = [];
  instalarSink((r) => capturados.push(r));
  instalarResolvedorRequestId(() => "req-teste-1");
});

afterEach(() => {
  restaurarSinkPadrao();
  instalarResolvedorRequestId(null);
});

describe("registrar", () => {
  it("emite um registro estruturado com nível, evento, requestId e hora", () => {
    registrar("info", "extracao.concluida", { duracao_ms: 12 });
    expect(capturados).toHaveLength(1);
    const r = capturados[0]!;
    expect(r.nivel).toBe("info");
    expect(r.evento).toBe("extracao.concluida");
    expect(r.requestId).toBe("req-teste-1");
    expect(typeof r.hora).toBe("string");
    expect(r.duracao_ms).toBe(12);
  });

  it("aplica a redaction por chave antes de entregar ao sink", () => {
    registrar("error", "diario.falhou", {
      patient_id: "p-1",
      texto: "Maria relatou crise",
      trecho_fonte: "Maria relatou crise",
    });
    const r = capturados[0]!;
    expect(r.patient_id).toBe("p-1");
    expect(r.texto).toBe(VALOR_REDIGIDO);
    expect(r.trecho_fonte).toBe(VALOR_REDIGIDO);
    expect(JSON.stringify(r)).not.toContain("Maria");
  });

  it("redige mesmo quando o chamador burla o tipo — a fronteira é de runtime", () => {
    const contexto = { nome: "Maria" } as unknown as Record<string, unknown>;
    registrar("warn", "x", contexto);
    expect(capturados[0]!.nome).toBe(VALOR_REDIGIDO);
  });

  it("todo registro tem requestId, inclusive sem escopo de request", () => {
    instalarResolvedorRequestId(null);
    for (const nivel of ["debug", "info", "warn", "error"] as const) {
      registrar(nivel, `evento.${nivel}`);
    }
    expect(capturados).toHaveLength(4);
    for (const r of capturados) {
      expect(typeof r.requestId).toBe("string");
      expect(r.requestId).toMatch(/^proc-[0-9a-f]{8}$/);
    }
  });

  it("devolve o requestId ao chamador", () => {
    expect(registrar("info", "x")).toBe("req-teste-1");
  });
});

describe("logger", () => {
  it("expõe um método por nível", () => {
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(capturados.map((r) => r.nivel)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
  });
});

describe("sinkConsole", () => {
  it("serializa uma linha de JSON — o registro é JSON, não string interpolada", () => {
    const linhas: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => linhas.push(String(args[0]));
    try {
      sinkConsole({
        nivel: "error",
        evento: "x",
        requestId: "r1",
        hora: "2026-09-03T00:00:00.000Z",
        clinic_id: "c-1",
      });
    } finally {
      console.error = original;
    }
    expect(linhas).toHaveLength(1);
    expect(JSON.parse(linhas[0]!)).toMatchObject({
      nivel: "error",
      evento: "x",
      requestId: "r1",
      clinic_id: "c-1",
    });
  });
});

describe("normalizarRequestId", () => {
  it("adota o id vindo do proxy reverso quando é bem formado", () => {
    expect(normalizarRequestId("abc-123_XY.z")).toBe("abc-123_XY.z");
  });

  it.each([
    ["nulo", null],
    ["ausente", undefined],
    ["curto demais", "ab"],
    ["vazio", "   "],
  ])("gera um id novo quando o cabeçalho é %s", (_rotulo, entrada) => {
    const id = normalizarRequestId(entrada);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("poda caractere de controle — cabeçalho é entrada de terceiro", () => {
    // Sem a poda, um cliente injetaria quebra de linha e escreveria uma
    // linha de log inteira à escolha dele.
    const id = normalizarRequestId('ok\ninjetado: {"nivel":"error"}');
    expect(id).not.toContain("\n");
    expect(id).not.toContain('"');
    expect(id).not.toContain(" ");
  });

  it("recusa id gigante", () => {
    expect(normalizarRequestId("a".repeat(200))).toMatch(/^[0-9a-f]{8}$/);
  });

  it("o cabeçalho de transporte é o de facto dos proxies reversos", () => {
    expect(CABECALHO_REQUEST_ID).toBe("x-request-id");
  });
});

describe("gerarCorrelacaoId", () => {
  it("gera 8 hex distintos por chamada", () => {
    const a = gerarCorrelacaoId();
    const b = gerarCorrelacaoId();
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
});

describe("logarErroSemPII como fachada do logger (#560 F1)", () => {
  it("passa a emitir pelo logger estruturado, com requestId", () => {
    const correlacao = logarErroSemPII("diario.salvar", new TypeError("boom"), {
      patient_id: "p-1",
    });
    expect(capturados).toHaveLength(1);
    const r = capturados[0]!;
    expect(r.nivel).toBe("error");
    expect(r.evento).toBe("diario.salvar");
    expect(r.requestId).toBe("req-teste-1");
    expect(r.correlacaoId).toBe(correlacao);
    // `erroNome`, não `nome`: `nome` é chave redigida (nome do paciente).
    expect(r.erroNome).toBe("TypeError");
    expect(r.nome).toBeUndefined();
    expect(r.patient_id).toBe("p-1");
  });

  it("continua sem deixar a message do erro sair", () => {
    class DrizzleQueryError extends Error {}
    logarErroSemPII(
      "diario.salvar",
      new DrizzleQueryError(
        "Failed query: insert into diary\nparams: Maria relatou crise",
      ),
    );
    expect(JSON.stringify(capturados[0])).not.toContain("Maria");
    expect(JSON.stringify(capturados[0])).not.toContain("Failed query");
  });

  it("logarAvisoSemPII emite em warn", () => {
    logarAvisoSemPII("faixa.degradou", new Error("x"));
    expect(capturados[0]!.nivel).toBe("warn");
  });
});
