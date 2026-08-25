import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { REGUA_RETENCAO } from "../src/lib/jobs/retencao.ts";
import {
  LOTE,
  REGUA,
  TETO_LOTES,
  dryRun,
  executar,
  main,
  varrer,
} from "./retencao-aviso-previo.mjs";

// Fake mínimo do postgres.js: só precisa responder ao shape de tagged template
// e a `.begin()`, e registrar as chamadas pra verificação. Sem banco real
// (nenhum `vi.mock` para SQL no repo — convenção, ver
// scripts/auto-arquivamento.test.mjs). Quem prova o SQL de verdade é
// db/tests/retencao-aviso.int.test.ts; o que se prova AQUI é o laço de lotes,
// a granularidade transacional e a regra do heartbeat.
//
// `porLote` é uma FILA de respostas: cada elemento é o retorno de um lote. Um
// número solto significa "sempre este valor" (para o caso do teto).
function makeFakeSql({ porLote = [0], erroNoLote = null } = {}) {
  const chamadas = [];
  function sql(strings) {
    const texto = strings.join("?");
    chamadas.push(texto);
    const i = chamadas.length; // 1-based, igual ao índice que o script loga
    if (erroNoLote === i) {
      return Promise.reject(new Error("permission denied for function"));
    }
    if (!texto.includes("app_retencao_avisar")) return Promise.resolve([]);
    const avisados = Array.isArray(porLote) ? (porLote[i - 1] ?? 0) : porLote;
    return Promise.resolve([{ avisados }]);
  }
  sql.chamadas = chamadas;
  sql.beginChamado = 0;
  sql.rollback = 0;
  sql.commit = 0;
  // `begin` do postgres.js: desfaz a transação se — e só se — o callback
  // lançar. O fake reproduz esse contrato porque é exatamente ele que o
  // dry-run usa para não gravar nada.
  sql.begin = async (fn) => {
    sql.beginChamado += 1;
    try {
      const r = await fn(sql);
      sql.commit += 1;
      return r;
    } catch (err) {
      sql.rollback += 1;
      throw err;
    }
  };
  return sql;
}

let heartbeatDir;

beforeEach(async () => {
  heartbeatDir = await mkdtemp(path.join(tmpdir(), "iris-retencao-"));
  process.env.RETENCAO_HEARTBEAT_DIR = heartbeatDir;
});

afterEach(async () => {
  delete process.env.RETENCAO_HEARTBEAT_DIR;
  delete process.env.RETENCAO_DATABASE_URL;
  await rm(heartbeatDir, { recursive: true, force: true });
});

async function heartbeatExiste() {
  const arquivos = await readdir(heartbeatDir);
  return arquivos.includes(".ultima-retencao");
}

describe("retencao-aviso-previo.mjs — laço de lotes (#352)", () => {
  test("para no PRIMEIRO lote vazio (não varre o teto à toa)", async () => {
    const sql = makeFakeSql({ porLote: [0] });

    await expect(varrer(sql)).resolves.toEqual({ avisados: 0, lotes: 1 });

    expect(sql.chamadas).toHaveLength(1);
    expect(sql.chamadas[0]).toContain("app_retencao_avisar");
  });

  test("soma os lotes e para no lote vazio, não no lote parcial", async () => {
    // 37 é lote PARCIAL, não vazio: o conjunto elegível pode ter crescido entre
    // um lote e outro, então quem encerra a varredura é o zero.
    const sql = makeFakeSql({ porLote: [200, 200, 37, 0] });

    await expect(varrer(sql)).resolves.toEqual({ avisados: 437, lotes: 4 });
    expect(sql.chamadas).toHaveLength(4);
  });

  test("respeita o TETO de 10 lotes mesmo com fila infinita de elegíveis", async () => {
    // `porLote` como número: todo lote devolve 200. Sem o teto isto varreria
    // para sempre e o container nunca voltaria ao agendador.
    const sql = makeFakeSql({ porLote: LOTE });

    await expect(varrer(sql)).resolves.toEqual({
      avisados: LOTE * TETO_LOTES,
      lotes: TETO_LOTES,
    });
    expect(sql.chamadas).toHaveLength(TETO_LOTES);
  });

  test("cada lote é UMA transação própria na varredura real", async () => {
    const sql = makeFakeSql({ porLote: [200, 12, 0] });

    await varrer(sql);

    // Três lotes, três transações committadas. Uma transação só para a
    // varredura inteira desfaria os avisos válidos dos lotes anteriores quando
    // um lote falhasse.
    expect(sql.beginChamado).toBe(3);
    expect(sql.commit).toBe(3);
    expect(sql.rollback).toBe(0);
  });

  test("varredura real bem-sucedida GRAVA heartbeat", async () => {
    const sql = makeFakeSql({ porLote: [5, 0] });

    await executar(sql, { modoDryRun: false });

    expect(await heartbeatExiste()).toBe(true);
  });
});

describe("retencao-aviso-previo.mjs — falha de lote", () => {
  test("falha NOMEIA o índice do lote e diz quantos avisos ficaram gravados", async () => {
    const sql = makeFakeSql({ porLote: LOTE, erroNoLote: 3 });

    // Sem o índice no texto não dá para saber, olhando o log do painel, se a
    // varredura morreu no começo ou depois de gravar 400 avisos.
    await expect(varrer(sql)).rejects.toThrow(/lote 3/);
    await expect(
      varrer(makeFakeSql({ porLote: LOTE, erroNoLote: 3 })),
    ).rejects.toThrow(/400 aviso\(s\) de 2 lote\(s\)/);
  });

  test("a mensagem do Postgres sobrevive ao embrulho", async () => {
    const sql = makeFakeSql({ porLote: LOTE, erroNoLote: 1 });

    await expect(varrer(sql)).rejects.toThrow(/permission denied for function/);
  });

  test("falha NÃO grava heartbeat", async () => {
    const sql = makeFakeSql({ porLote: LOTE, erroNoLote: 1 });

    await expect(executar(sql, { modoDryRun: false })).rejects.toThrow();
    expect(await heartbeatExiste()).toBe(false);
  });
});

describe("retencao-aviso-previo.mjs — dry-run", () => {
  test("UMA transação para o laço inteiro, ROLLBACK e NENHUM heartbeat", async () => {
    const sql = makeFakeSql({ porLote: [200, 9, 0] });

    await executar(sql, { modoDryRun: true });

    // Uma transação só, e não uma por lote: dentro dela os INSERTs de um lote
    // ficam visíveis para o dedup (`NOT EXISTS`) do lote seguinte. Com uma
    // transação por lote — todas desfeitas — o dry-run reavisaria os mesmos
    // 200 dez vezes e reportaria 2.000.
    expect(sql.beginChamado).toBe(1);
    expect(sql.chamadas).toHaveLength(3);
    expect(sql.chamadas[0]).toContain("app_retencao_avisar");
    expect(sql.rollback).toBe(1);
    expect(sql.commit).toBe(0);
    expect(await heartbeatExiste()).toBe(false);
  });

  test("erro REAL dentro da transação propaga (não é confundido com o rollback)", async () => {
    const sql = makeFakeSql({ porLote: LOTE, erroNoLote: 1 });

    await expect(dryRun(sql)).rejects.toThrow("permission denied for function");
    expect(await heartbeatExiste()).toBe(false);
  });
});

describe("retencao-aviso-previo.mjs — argumentos e env", () => {
  test("env faltando: a mensagem NOMEIA RETENCAO_DATABASE_URL", async () => {
    delete process.env.RETENCAO_DATABASE_URL;

    await expect(main([])).rejects.toThrow(/RETENCAO_DATABASE_URL/);
  });

  test("argumento desconhecido lança antes de tocar no banco", async () => {
    process.env.RETENCAO_DATABASE_URL = "postgres://nao-usada";

    await expect(main(["--forca"])).rejects.toThrow(
      /argumento não reconhecido/,
    );
  });
});

// TRAVA DE MUTAÇÃO (R352.E8): o `.mjs` não importa `.ts`, então a régua está
// escrita duas vezes. Este teste é o único mecanismo que impede alguém mudar 90
// para 120 num arquivo e não no outro — o que faria a tela prometer uma data de
// aviso e o job emitir outra, sem nenhum erro em lugar nenhum.
describe("retencao-aviso-previo — paridade da régua de 90 dias", () => {
  test("REGUA (.mjs) == REGUA_RETENCAO (.ts)", () => {
    expect(REGUA).toEqual({
      diasAvisoPrevio: REGUA_RETENCAO.diasAvisoPrevio,
    });
  });

  test("o valor canônico continua 90", () => {
    expect(REGUA_RETENCAO.diasAvisoPrevio).toBe(90);
  });
});
