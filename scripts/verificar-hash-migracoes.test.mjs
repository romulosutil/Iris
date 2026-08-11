import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  calcularHashMigracao,
  encontrarMigracoesComHashDivergente,
  verificarHashesAplicadas,
} from "./verificar-hash-migracoes.mjs";

describe("encontrarMigracoesComHashDivergente", () => {
  const journal = [
    { tag: "0001_a", when: 1000 },
    { tag: "0002_b", when: 2000 },
  ];

  it("não reporta nada quando o hash aplicado bate com o arquivo em disco", () => {
    const lerConteudo = (tag) => `${tag}-conteudo-original`;
    const linhasAplicadas = journal.map((e) => ({
      created_at: e.when,
      hash: calcularHashMigracao(lerConteudo(e.tag)),
    }));

    expect(
      encontrarMigracoesComHashDivergente(journal, linhasAplicadas, lerConteudo),
    ).toEqual([]);
  });

  it("reporta a migração cujo .sql em disco foi editado depois de aplicada (cenário D17/#215)", () => {
    const hashAplicado0001 = calcularHashMigracao("0001_a-conteudo-original");
    const hashAplicado0002 = calcularHashMigracao("0002_b-conteudo-original");
    const linhasAplicadas = [
      { created_at: 1000, hash: hashAplicado0001 },
      { created_at: 2000, hash: hashAplicado0002 },
    ];
    // 0002_b foi editada in-place depois de aplicada (o que aconteceu com a 0073, #215).
    const lerConteudo = (tag) =>
      tag === "0002_b" ? "0002_b-conteudo-EDITADO" : `${tag}-conteudo-original`;

    const divergentes = encontrarMigracoesComHashDivergente(
      journal,
      linhasAplicadas,
      lerConteudo,
    );

    expect(divergentes).toEqual([
      {
        tag: "0002_b",
        hashAplicado: hashAplicado0002,
        hashEsperado: calcularHashMigracao("0002_b-conteudo-EDITADO"),
      },
    ]);
  });

  it("ignora linha aplicada sem entrada correspondente no journal", () => {
    const linhasAplicadas = [{ created_at: 999999, hash: "qualquer" }];
    expect(
      encontrarMigracoesComHashDivergente(journal, linhasAplicadas, () => "x"),
    ).toEqual([]);
  });
});

describe("verificarHashesAplicadas", () => {
  let dir;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function criarMigrationsDir(entries) {
    dir = mkdtempSync(path.join(tmpdir(), "migracoes-hash-"));
    mkdirSync(path.join(dir, "meta"), { recursive: true });
    writeFileSync(
      path.join(dir, "meta", "_journal.json"),
      JSON.stringify({ version: "7", dialect: "postgresql", entries }),
    );
    return dir;
  }

  it("devolve [] quando drizzle.__drizzle_migrations ainda não existe (primeiro deploy)", async () => {
    const migrationsDir = criarMigrationsDir([{ tag: "0001_a", when: 1000 }]);
    writeFileSync(path.join(migrationsDir, "0001_a.sql"), "conteudo");

    const sql = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("relation does not exist"), { code: "42P01" }),
      );

    await expect(verificarHashesAplicadas(sql, migrationsDir)).resolves.toEqual([]);
  });

  it("propaga erro de banco que não seja 'relation does not exist'", async () => {
    const migrationsDir = criarMigrationsDir([{ tag: "0001_a", when: 1000 }]);
    writeFileSync(path.join(migrationsDir, "0001_a.sql"), "conteudo");

    const sql = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("conexão recusada"), { code: "ECONNREFUSED" }));

    await expect(verificarHashesAplicadas(sql, migrationsDir)).rejects.toThrow(
      "conexão recusada",
    );
  });

  it("detecta divergência lendo o .sql real do disco", async () => {
    const migrationsDir = criarMigrationsDir([{ tag: "0001_a", when: 1000 }]);
    writeFileSync(path.join(migrationsDir, "0001_a.sql"), "conteudo-editado-depois");

    const hashAplicado = calcularHashMigracao("conteudo-original-aplicado");
    const sql = vi.fn().mockResolvedValueOnce([{ created_at: 1000, hash: hashAplicado }]);

    const divergentes = await verificarHashesAplicadas(sql, migrationsDir);
    expect(divergentes).toEqual([
      {
        tag: "0001_a",
        hashAplicado,
        hashEsperado: calcularHashMigracao("conteudo-editado-depois"),
      },
    ]);
  });

  it("não reporta nada quando o .sql em disco bate com o hash aplicado", async () => {
    const migrationsDir = criarMigrationsDir([{ tag: "0001_a", when: 1000 }]);
    writeFileSync(path.join(migrationsDir, "0001_a.sql"), "conteudo-intacto");

    const sql = vi
      .fn()
      .mockResolvedValueOnce([
        { created_at: 1000, hash: calcularHashMigracao("conteudo-intacto") },
      ]);

    await expect(verificarHashesAplicadas(sql, migrationsDir)).resolves.toEqual([]);
  });
});
