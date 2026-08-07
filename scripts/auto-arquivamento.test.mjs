import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { REGUA_ARQUIVAMENTO } from "../src/lib/jobs/auto-arquivamento.ts";
import { REGUA, dryRun, executar, main, varrer } from "./auto-arquivamento.mjs";

// Fake mínimo do postgres.js: só precisa responder ao shape de tagged template
// e a `.begin()`, e registrar as chamadas pra verificação. Sem banco real
// (nenhum `vi.mock` para SQL no repo — convenção, ver
// scripts/escalonamento-risco.test.mjs).
function makeFakeSql({
  linhas = [{ avisados: 0, arquivados: 0 }],
  erro = null,
} = {}) {
  const chamadas = [];
  function sql(strings) {
    const texto = strings.join("?");
    chamadas.push(texto);
    if (erro) return Promise.reject(erro);
    if (texto.includes("app_auto_arquivar_pacientes"))
      return Promise.resolve(linhas);
    return Promise.resolve([]);
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
  heartbeatDir = await mkdtemp(path.join(tmpdir(), "iris-arquivamento-"));
  process.env.ARQUIVAMENTO_HEARTBEAT_DIR = heartbeatDir;
});

afterEach(async () => {
  delete process.env.ARQUIVAMENTO_HEARTBEAT_DIR;
  delete process.env.ARQUIVAMENTO_DATABASE_URL;
  await rm(heartbeatDir, { recursive: true, force: true });
});

async function heartbeatExiste() {
  const arquivos = await readdir(heartbeatDir);
  return arquivos.includes(".ultima-varredura");
}

describe("auto-arquivamento.mjs — varredura (#174)", () => {
  test("caminho feliz: chama a função de banco e devolve as contagens", async () => {
    const sql = makeFakeSql({ linhas: [{ avisados: 4, arquivados: 2 }] });

    await expect(varrer(sql)).resolves.toEqual({ avisados: 4, arquivados: 2 });

    expect(sql.chamadas).toHaveLength(1);
    expect(sql.chamadas[0]).toContain("app_auto_arquivar_pacientes");
  });

  test("varredura real bem-sucedida GRAVA heartbeat", async () => {
    const sql = makeFakeSql({ linhas: [{ avisados: 1, arquivados: 1 }] });

    await executar(sql, { modoDryRun: false });

    expect(await heartbeatExiste()).toBe(true);
  });
});

describe("auto-arquivamento.mjs — dry-run", () => {
  test("usa transação, faz ROLLBACK e NÃO grava heartbeat", async () => {
    const sql = makeFakeSql({ linhas: [{ avisados: 7, arquivados: 3 }] });

    await executar(sql, { modoDryRun: true });

    // A função de banco foi exercitada DE VERDADE (não há predicado
    // reimplementado em JS), mas dentro de uma transação desfeita.
    expect(sql.beginChamado).toBe(1);
    expect(sql.chamadas[0]).toContain("app_auto_arquivar_pacientes");
    expect(sql.rollback).toBe(1);
    expect(sql.commit).toBe(0);
    expect(await heartbeatExiste()).toBe(false);
  });

  test("erro REAL dentro da transação propaga (não é confundido com o rollback)", async () => {
    const sql = makeFakeSql({ erro: new Error("função inexistente") });

    await expect(dryRun(sql)).rejects.toThrow("função inexistente");
    expect(await heartbeatExiste()).toBe(false);
  });
});

describe("auto-arquivamento.mjs — falha", () => {
  test("falha da query propaga e NÃO grava heartbeat", async () => {
    const sql = makeFakeSql({
      erro: new Error("permission denied for function"),
    });

    await expect(executar(sql, { modoDryRun: false })).rejects.toThrow(
      "permission denied for function",
    );
    expect(await heartbeatExiste()).toBe(false);
  });
});

describe("auto-arquivamento.mjs — argumentos e env", () => {
  test("env faltando: a mensagem NOMEIA ARQUIVAMENTO_DATABASE_URL", async () => {
    delete process.env.ARQUIVAMENTO_DATABASE_URL;

    await expect(main([])).rejects.toThrow(/ARQUIVAMENTO_DATABASE_URL/);
  });

  test("argumento desconhecido lança antes de tocar no banco", async () => {
    process.env.ARQUIVAMENTO_DATABASE_URL = "postgres://nao-usada";

    await expect(main(["--forca"])).rejects.toThrow(
      /argumento não reconhecido/,
    );
  });
});

// TRAVA DE MUTAÇÃO: o `.mjs` não importa `.ts`, então a régua está escrita duas
// vezes. Este teste é o único mecanismo que impede alguém mudar 90 para 120 num
// arquivo e não no outro — o que faria a UI prometer uma data e o job executar
// outra, sem nenhum erro em lugar nenhum.
describe("auto-arquivamento — paridade da régua 83/90", () => {
  test("REGUA (.mjs) == REGUA_ARQUIVAMENTO (.ts)", () => {
    expect(REGUA).toEqual({
      diasAvisoPrevio: REGUA_ARQUIVAMENTO.diasAvisoPrevio,
      diasArquivamento: REGUA_ARQUIVAMENTO.diasArquivamento,
    });
  });

  test("os valores canônicos continuam 83 e 90", () => {
    expect(REGUA_ARQUIVAMENTO.diasAvisoPrevio).toBe(83);
    expect(REGUA_ARQUIVAMENTO.diasArquivamento).toBe(90);
  });
});
