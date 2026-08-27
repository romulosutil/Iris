import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Carrega e EXECUTA o `public/sw.js` real num sandbox.
 *
 * Por que não reimplementar a allowlist em TS e testar a cópia: o Service
 * Worker é servido como arquivo estático; nada em `src/` o importa. Um guard
 * escrito contra uma cópia passa verde enquanto o arquivo que roda no
 * navegador diverge — o mesmo modo de falha do job `.mjs` que o Dockerfile não
 * copiava. Aqui o teste roda o byte que vai para produção.
 */
function carregarServiceWorker() {
  const arquivo = path.join(process.cwd(), "public", "sw.js");
  const codigo = readFileSync(arquivo, "utf8");

  const ouvintes: Record<string, unknown> = {};
  const self = {
    addEventListener: (nome: string, fn: unknown) => {
      ouvintes[nome] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    location: { origin: "https://irisclinica.ia.br" },
  } as Record<string, unknown>;

  const contexto = vm.createContext({
    self,
    caches: {},
    fetch: () => {},
    console,
    // Sem isto, `new URL(...)` dentro do sw.js estoura `ReferenceError` (não
    // herda os globais do Node) e `podeCachear` cai no `catch` — devolvendo
    // `false` para TUDO, inclusive o que deveria ser cacheável. Os testes que
    // esperam `false` passariam por vacuidade.
    URL,
  });
  vm.runInContext(codigo, contexto, { filename: "public/sw.js" });

  return {
    podeCachear: self.__podeCachear as (url: string, metodo: string) => boolean,
    nomeCache: self.__NOME_CACHE as string,
    ouvintes,
  };
}

const { podeCachear, nomeCache, ouvintes } = carregarServiceWorker();

const ORIGEM = "https://irisclinica.ia.br";

describe("Service Worker — contrato", () => {
  it("registra os três handlers do ciclo de vida", () => {
    expect(Object.keys(ouvintes).sort()).toEqual([
      "activate",
      "fetch",
      "install",
    ]);
  });

  it("versiona o nome do cache", () => {
    expect(nomeCache).toMatch(/^iris-estatico-v\d+$/);
  });
});

describe("Service Worker — allowlist de cache", () => {
  it("cacheia bundle e CSS do Next", () => {
    expect(
      podeCachear(`${ORIGEM}/_next/static/chunks/main-abc.js`, "GET"),
    ).toBe(true);
    expect(podeCachear(`${ORIGEM}/_next/static/css/app.css`, "GET")).toBe(true);
  });

  it("cacheia fonte, ícone e manifesto", () => {
    expect(podeCachear(`${ORIGEM}/fonts/inter.woff2`, "GET")).toBe(true);
    expect(podeCachear(`${ORIGEM}/icons/icon-512.png`, "GET")).toBe(true);
    expect(podeCachear(`${ORIGEM}/brand/iris-logo.svg`, "GET")).toBe(true);
    expect(podeCachear(`${ORIGEM}/manifest.webmanifest`, "GET")).toBe(true);
  });
});

describe("Service Worker — guardrail LGPD", () => {
  // Cada linha aqui é um caminho por onde dado de saúde de paciente
  // trafega. Nenhum deles pode virar entrada de cache do navegador.
  const PROIBIDOS = [
    `${ORIGEM}/pacientes`,
    `${ORIGEM}/pacientes/8a1f/metas`,
    `${ORIGEM}/diario`,
    `${ORIGEM}/agenda`,
    `${ORIGEM}/validacao`,
    `${ORIGEM}/relatorios`,
    `${ORIGEM}/alertas-risco`,
    `${ORIGEM}/api/auth/session`,
    `${ORIGEM}/api/interno/billing`,
    `${ORIGEM}/_next/data/build/pacientes.json`,
  ];

  for (const url of PROIBIDOS) {
    it(`nunca cacheia ${new URL(url).pathname}`, () => {
      expect(podeCachear(url, "GET")).toBe(false);
    });
  }

  it("nunca cacheia método que não seja GET", () => {
    expect(podeCachear(`${ORIGEM}/_next/static/chunks/main.js`, "POST")).toBe(
      false,
    );
  });

  it("nunca cacheia origem de terceiro, mesmo com caminho estático", () => {
    expect(
      podeCachear("https://cdn.exemplo.com/_next/static/x.js", "GET"),
    ).toBe(false);
  });

  it("é allowlist: caminho inventado hoje nasce fora do cache", () => {
    expect(podeCachear(`${ORIGEM}/rota-que-ainda-nao-existe`, "GET")).toBe(
      false,
    );
    expect(podeCachear(`${ORIGEM}/_next/staticoso/x.js`, "GET")).toBe(false);
  });
});
