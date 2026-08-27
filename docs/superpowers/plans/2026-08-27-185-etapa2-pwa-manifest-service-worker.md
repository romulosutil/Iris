# Etapa 2 — PWA: Manifesto, Ícones e Service Worker Seguro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Iris instalável como PWA — manifesto, ícones adaptativos, Service Worker que cacheia **exclusivamente** asset estático e página offline amigável — sem que um único byte de dado de saúde encoste no cache do navegador.

**Architecture:** O manifesto é uma rota do App Router (`src/app/manifest.ts`), servida em `/manifest.webmanifest`, com `theme_color` idêntico ao `viewport.themeColor` da Etapa 1. Os ícones PNG são gerados uma vez a partir de `src/app/icon.svg` por um script que usa o Chromium do Playwright (já é devDependency — nenhuma dependência nova) e ficam **commitados**. O Service Worker é escrito à mão em `public/sw.js`, com uma allowlist explícita: o que não casa a allowlist não passa por `respondWith` e vai direto à rede, sem cache. Essa allowlist é exposta em `self.__podeCachear` e o teste unitário executa **o arquivo real** num sandbox `node:vm` — o guard não pode divergir do código que roda em produção.

**Tech Stack:** Next.js 16.3.1 (App Router, `MetadataRoute.Manifest`), Vitest, Playwright (só como rasterizador de ícone e para o E2E offline).

**Spec:** `docs/superpowers/specs/2026-08-03-mobile-responsividade-pwa-twa-android-design.md` (§2 Etapa 2, §3 critério 2) + decisões ratificadas em 27/08/2026 na §4 da spec.

**Issue:** #185 (Etapa 2 de 3). **Depende da Etapa 1** (o `themeColor` e o `viewport-fit=cover` vêm de lá).

## Global Constraints

- **Guardrail inegociável — cache:** o Service Worker só cacheia asset estático (JS/CSS de `_next/static`, fontes, ícones, manifesto). Resposta de navegação, rota de API, e qualquer coisa fora da allowlist **nunca** entra em cache. Dado de saúde de paciente em cache não-cifrado do navegador é incidente LGPD, não bug de performance.
- **Fail-closed:** a decisão de cachear é uma **allowlist**, nunca uma denylist. Rota nova nasce fora do cache por construção. Uma denylist erra em silêncio toda vez que uma rota nova aparece.
- **Nenhuma dependência nova em `package.json`.** Decisão ratificada 27/08/2026: `sw.js` à mão em vez de `@serwist/next`.
- **`theme_color` do manifesto = `#f2b705`**, idêntico ao `viewport.themeColor` de `src/app/layout.tsx` (Etapa 1, Task 3). Divergência faz a barra de status piscar na primeira navegação do app instalado.
- **`start_url: "/"`**, não `/app`. A spec dizia `/app`; essa rota não existe neste repo. `/` já resolve os dois casos: `src/app/page.tsx:20` redireciona quem tem sessão para `/agenda` e serve a landing para quem não tem.
- **Idioma:** código, comentários e copy em **pt-BR**. Commits em **pt-BR**, Conventional Commits.
- **Nenhuma mudança de schema, RLS ou migração** nesta etapa.

## File Structure

| Arquivo                                               | Responsabilidade                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `scripts/gerar-icones-pwa.mjs`                        | **Criar.** Rasteriza `src/app/icon.svg` nos 4 PNGs. Rodado à mão, não em CI.                     |
| `public/icons/icon-192.png` … `icon-maskable-512.png` | **Criar (gerados e commitados).** Ícones do manifesto.                                           |
| `src/app/manifest.ts`                                 | **Criar.** Rota do manifesto. Única fonte dos metadados de instalação.                           |
| `src/app/manifest.test.ts`                            | **Criar.** Trava `theme_color`, `start_url`, `display` e a existência física dos ícones.         |
| `public/sw.js`                                        | **Criar.** Service Worker. Toda a política de cache mora aqui.                                   |
| `src/app/sw.test.ts`                                  | **Criar.** Executa `public/sw.js` num sandbox e testa a allowlist real.                          |
| `src/components/pwa/registrar-sw.tsx`                 | **Criar.** Client component que registra o SW. Sem lógica de cache.                              |
| `src/app/layout.tsx`                                  | **Modificar.** Monta `<RegistrarServiceWorker />`.                                               |
| `src/app/offline/page.tsx`                            | **Criar.** Página offline estática, sem nenhum dado.                                             |
| `e2e/mobile-pwa.spec.ts`                              | **Criar.** E2E: manifesto servido, SW registra, offline responde, rota de app não fica em cache. |
| `docs/arquitetura/pwa-e-cache.md`                     | **Criar.** Registra a política de cache e a medição de Lighthouse.                               |

---

### Task 1: Ícones do PWA

Entrega: 4 PNGs commitados e um script reprodutível que os regera.

**Files:**

- Create: `scripts/gerar-icones-pwa.mjs`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-192.png`, `public/icons/icon-maskable-512.png`

**Interfaces:**

- Consumes: `src/app/icon.svg` (370×370, já no repo).
- Produces: os 4 caminhos acima, referenciados literalmente por `src/app/manifest.ts` (Task 2).

- [ ] **Step 1: Escrever o gerador**

Criar `scripts/gerar-icones-pwa.mjs`:

```js
// @ts-check
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Gera os ícones PNG do manifesto PWA (#185, Etapa 2) a partir do glifo
 * `src/app/icon.svg`.
 *
 * Por que Chromium e não `sharp`: o Playwright já é devDependency deste repo e
 * traz o próprio Chromium. `sharp` seria dependência nativa nova só para
 * rasterizar 4 arquivos que mudam quando a marca muda — ou seja, quase nunca.
 *
 * Os PNGs são COMMITADOS. Este script é regenerador, não passo de build: nada
 * em CI depende dele. Se a marca mudar, roda-se de novo e commita-se o
 * resultado.
 *
 * Duas famílias de ícone, e a diferença importa:
 *  - `any`: fundo transparente, glifo ocupando 100%. É o que o navegador usa
 *    em atalho comum e no seletor de abas.
 *  - `maskable`: fundo CHAPADO na cor da marca e glifo em 60% do canvas. O
 *    Android recorta o ícone em qualquer forma (círculo, squircle, gota) e só
 *    garante os 80% centrais. Glifo a 100% num maskable sai com as pontas
 *    cortadas; fundo transparente sai com halo preto.
 */
const raiz = process.cwd();
const origem = path.join(raiz, "src", "app", "icon.svg");
const destino = path.join(raiz, "public", "icons");

const FUNDO_MARCA = "#f2b705";

/** @type {{arquivo: string, tamanho: number, maskable: boolean}[]} */
const ALVOS = [
  { arquivo: "icon-192.png", tamanho: 192, maskable: false },
  { arquivo: "icon-512.png", tamanho: 512, maskable: false },
  { arquivo: "icon-maskable-192.png", tamanho: 192, maskable: true },
  { arquivo: "icon-maskable-512.png", tamanho: 512, maskable: true },
];

async function main() {
  const svg = await readFile(origem, "utf8");
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

  await mkdir(destino, { recursive: true });

  const navegador = await chromium.launch();
  try {
    for (const alvo of ALVOS) {
      const pagina = await navegador.newPage({
        viewport: { width: alvo.tamanho, height: alvo.tamanho },
        deviceScaleFactor: 1,
      });

      const escala = alvo.maskable ? 60 : 100;
      const fundo = alvo.maskable ? FUNDO_MARCA : "transparent";

      await pagina.setContent(
        `<!doctype html><html><body style="margin:0;width:100vw;height:100vh;` +
          `background:${fundo};display:flex;align-items:center;justify-content:center">` +
          `<img src="${dataUri}" style="width:${escala}%;height:${escala}%;object-fit:contain">` +
          `</body></html>`,
      );

      const png = await pagina.screenshot({
        omitBackground: !alvo.maskable,
        type: "png",
      });
      await writeFile(path.join(destino, alvo.arquivo), png);
      await pagina.close();

      console.log(`gerado: public/icons/${alvo.arquivo} (${alvo.tamanho}px)`);
    }
  } finally {
    await navegador.close();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
```

- [ ] **Step 2: Registrar o comando no `package.json`**

Em `package.json`, acrescentar ao objeto `scripts`, logo após `"build-storybook"`:

```json
    "icons:pwa": "node scripts/gerar-icones-pwa.mjs",
```

- [ ] **Step 3: Rodar o gerador**

```bash
pnpm icons:pwa
```

Esperado: 4 linhas `gerado: public/icons/…` e os 4 arquivos em `public/icons/`.

- [ ] **Step 4: Conferir dimensão e transparência**

```bash
pnpm exec node -e "const fs=require('node:fs');for(const f of ['icon-192','icon-512','icon-maskable-192','icon-maskable-512']){const b=fs.readFileSync('public/icons/'+f+'.png');console.log(f, b.readUInt32BE(16)+'x'+b.readUInt32BE(20), b.length+'B');}"
```

Esperado: `icon-192 192x192`, `icon-512 512x512`, `icon-maskable-192 192x192`, `icon-maskable-512 512x512`, todos com tamanho > 0.

- [ ] **Step 5: Conferir a olho**

Abrir `public/icons/icon-maskable-512.png` num visualizador. Esperado: glifo dourado centralizado com margem folgada em volta, fundo `#f2b705` chapado até a borda. Se o glifo encostar na borda, o `escala` de 60 está alto para este SVG — baixar para 55 e regerar.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write package.json
git add scripts/gerar-icones-pwa.mjs package.json public/icons
git commit -m "feat(pwa): gera ícones adaptativos 192/512 e maskable, issue #185"
```

---

### Task 2: Manifesto PWA

Entrega: `/manifest.webmanifest` servido pelo App Router, referenciado automaticamente no `<head>`, com teste que trava os campos que quebram silenciosamente.

**Files:**

- Create: `src/app/manifest.ts`
- Create: `src/app/manifest.test.ts`

**Interfaces:**

- Consumes: os 4 PNGs de `public/icons/` (Task 1); `viewport.themeColor` de `src/app/layout.tsx` (Etapa 1, Task 3).
- Produces: `export default function manifest(): MetadataRoute.Manifest` em `src/app/manifest.ts`. A Etapa 3 (TWA) lê `start_url`, `scope` e `theme_color` daqui para configurar o Bubblewrap.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `src/app/manifest.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import { viewport } from "./layout";

const m = manifest();

describe("manifesto PWA", () => {
  it("declara display standalone (pré-requisito do TWA)", () => {
    // Sem `standalone` o TWA da Etapa 3 sobe com a barra de endereço do
    // Chrome por cima do app — e a reprovação só aparece no aparelho.
    expect(m.display).toBe("standalone");
  });

  it("usa a raiz como start_url e escopo", () => {
    // `/` resolve os dois estados: `src/app/page.tsx` redireciona quem tem
    // sessão para /agenda e serve a landing para quem não tem. A spec original
    // dizia `/app`, rota que não existe neste repo — apontar para ela daria
    // 404 no primeiro toque do app instalado.
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("usa o mesmo theme_color do viewport do documento", () => {
    // Divergir faz a barra de status trocar de cor na primeira navegação.
    expect(m.theme_color).toBe(viewport.themeColor);
    expect(m.theme_color).toBe("#f2b705");
  });

  it("declara os 4 ícones, e os arquivos existem em disco", () => {
    const caminhos = (m.icons ?? []).map((i) => i.src);
    expect(caminhos).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-192.png",
      "/icons/icon-maskable-512.png",
    ]);

    // Manifesto apontando para arquivo inexistente é o modo de falha mais
    // comum aqui: o Next serve o JSON com 200, o navegador baixa 404 e a
    // instalação simplesmente não é oferecida — sem erro em lugar nenhum.
    for (const src of caminhos) {
      const disco = path.join(process.cwd(), "public", src);
      expect(existsSync(disco), `arquivo ausente: public${src}`).toBe(true);
    }
  });

  it("marca os dois ícones maskable com purpose maskable", () => {
    const maskables = (m.icons ?? []).filter((i) => i.purpose === "maskable");
    expect(maskables.map((i) => i.src)).toEqual([
      "/icons/icon-maskable-192.png",
      "/icons/icon-maskable-512.png",
    ]);
  });

  it("declara orientação e idioma pt-BR", () => {
    expect(m.lang).toBe("pt-BR");
    expect(m.orientation).toBe("portrait");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run src/app/manifest.test.ts
```

Esperado: FAIL — `Failed to resolve import "./manifest"`.

- [ ] **Step 3: Implementar o manifesto**

Criar `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

/**
 * Manifesto PWA do Iris (#185, Etapa 2). Servido em `/manifest.webmanifest`;
 * o Next injeta a `<link rel="manifest">` no `<head>` sozinho.
 *
 * É também a fonte que o Bubblewrap lê na Etapa 3 para gerar o projeto Android
 * — `start_url`, `scope`, `theme_color` e os ícones viram configuração do TWA.
 * Mudar qualquer um deles depois do app publicado exige nova versão na loja.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Iris — Governança Clínica",
    short_name: "Iris",
    description:
      "Prontuário e governança clínica para clínicas de terapia infantil.",
    lang: "pt-BR",
    dir: "ltr",
    // `/` e não `/app`: quem tem sessão é redirecionado para `/agenda` pela
    // própria rota raiz; quem não tem vê a landing e o login.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Idêntico ao `viewport.themeColor` de `src/app/layout.tsx`.
    theme_color: "#f2b705",
    background_color: "#f8f9fa",
    categories: ["medical", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm exec vitest run src/app/manifest.test.ts
pnpm typecheck
```

Esperado: `6 passed`; typecheck limpo.

- [ ] **Step 5: Conferir a rota servida**

```bash
pnpm build && pnpm start &
sleep 8
curl -s http://localhost:3000/manifest.webmanifest | head -c 400
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/icons/icon-maskable-512.png
```

Esperado: JSON do manifesto; `200 image/png` para o ícone. Encerrar o servidor depois.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write src/app/manifest.ts src/app/manifest.test.ts
git add src/app/manifest.ts src/app/manifest.test.ts
git commit -m "feat(pwa): manifesto do app com ícones adaptativos, issue #185"
```

---

### Task 3: Service Worker com allowlist de cache

Entrega: `public/sw.js` em produção, registrado no cliente, com teste unitário que executa o **arquivo real** e prova que rota de saúde nunca é cacheável.

**Files:**

- Create: `public/sw.js`
- Create: `src/app/sw.test.ts`
- Create: `src/components/pwa/registrar-sw.tsx`
- Modify: `src/app/layout.tsx` (import + montagem)

**Interfaces:**

- Consumes: nada das tarefas anteriores em tempo de execução.
- Produces:
  - `self.__podeCachear(url: string, metodo: string): boolean` exposto por `public/sw.js` — é o contrato que `src/app/sw.test.ts` exercita.
  - `self.__NOME_CACHE: string` — versão do cache, lida pelo teste e pelo handler de `activate`.
  - `export function RegistrarServiceWorker(): null` em `src/components/pwa/registrar-sw.tsx`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `src/app/sw.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run src/app/sw.test.ts
```

Esperado: FAIL — `ENOENT` em `public/sw.js`.

- [ ] **Step 3: Escrever o Service Worker**

Criar `public/sw.js`:

```js
/*
 * Service Worker do Iris — #185, Etapa 2.
 *
 * POLÍTICA, em uma frase: só asset estático entra em cache; tudo mais vai
 * direto à rede e o SW nem intercepta.
 *
 * Por que allowlist e não denylist: dado clínico de paciente em cache
 * não-cifrado do navegador é incidente LGPD. Uma denylist ("não cacheie
 * /pacientes") erra em silêncio toda vez que uma rota nova nasce — e rota nova
 * nasce a cada fatia de produto. Com allowlist, o padrão de uma rota
 * desconhecida é NÃO cachear.
 *
 * Navegação (`request.mode === "navigate"`) é caso à parte: vai sempre à rede
 * e, quando a rede falha, responde a página `/offline` do precache. A resposta
 * de rede NUNCA é gravada — é ela que carrega o HTML com nome de paciente.
 *
 * Este arquivo é executado tal e qual por `src/app/sw.test.ts`. Manter
 * `self.__podeCachear` e `self.__NOME_CACHE` exportados: são o contrato do
 * teste. Se um dia forem removidos, o teste quebra alto — que é o desejado.
 */

const NOME_CACHE = "iris-estatico-v1";
const PAGINA_OFFLINE = "/offline";

/** Prefixos de caminho cacheáveis. Acrescentar aqui é decisão consciente. */
const PREFIXOS_PERMITIDOS = ["/_next/static/", "/fonts/", "/icons/", "/brand/"];

/** Caminhos exatos cacheáveis. */
const CAMINHOS_PERMITIDOS = ["/manifest.webmanifest", "/icon.svg"];

/**
 * @param {string} url
 * @param {string} metodo
 * @returns {boolean}
 */
function podeCachear(url, metodo) {
  if (metodo !== "GET") return false;

  let alvo;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }

  // Terceiro nunca entra: não controlamos o conteúdo nem a validade.
  if (alvo.origin !== self.location.origin) return false;

  const caminho = alvo.pathname;

  // `/_next/data/` carrega o payload de rota — inclui dado de paciente — e
  // começa com `/_next/`. Só `/_next/static/` é imutável e sem dado.
  if (CAMINHOS_PERMITIDOS.includes(caminho)) return true;
  return PREFIXOS_PERMITIDOS.some((p) => caminho.startsWith(p));
}

// Contrato exercitado por `src/app/sw.test.ts`.
self.__podeCachear = podeCachear;
self.__NOME_CACHE = NOME_CACHE;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(NOME_CACHE)
      .then((cache) => cache.addAll([PAGINA_OFFLINE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((n) => n.startsWith("iris-estatico-") && n !== NOME_CACHE)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;

  // Navegação: rede primeiro, `/offline` como último recurso. A resposta
  // NUNCA é gravada — é ela que carrega o HTML com dado de paciente.
  if (requisicao.mode === "navigate") {
    evento.respondWith(
      fetch(requisicao).catch(() =>
        caches
          .open(NOME_CACHE)
          .then((cache) => cache.match(PAGINA_OFFLINE))
          .then(
            (resposta) =>
              resposta ??
              new Response("Sem conexão.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              }),
          ),
      ),
    );
    return;
  }

  if (!podeCachear(requisicao.url, requisicao.method)) {
    // Sem `respondWith`: o navegador segue o caminho normal. Nada é observado,
    // nada é gravado.
    return;
  }

  evento.respondWith(
    caches.open(NOME_CACHE).then((cache) =>
      cache.match(requisicao).then((emCache) => {
        if (emCache) return emCache;
        return fetch(requisicao).then((resposta) => {
          // Só resposta completa e OK entra. Resposta parcial (206) ou opaca
          // corrompe o cache em silêncio.
          if (resposta.ok && resposta.status === 200) {
            cache.put(requisicao, resposta.clone());
          }
          return resposta;
        });
      }),
    ),
  );
});
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm exec vitest run src/app/sw.test.ts
```

Esperado: `17 passed`.

- [ ] **Step 5: Provar que o guardrail mata mutante**

Trocar, em `public/sw.js`, o prefixo `"/_next/static/"` por `"/_next/"` e rodar de novo.

Esperado: FALHA em `nunca cacheia /_next/data/build/pacientes.json`. Reverter com patch inverso (`"/_next/"` → `"/_next/static/"`).

Segunda mutação: trocar `if (alvo.origin !== self.location.origin) return false;` por `if (false) return false;`.
Esperado: FALHA em "nunca cacheia origem de terceiro". Reverter com patch inverso.

- [ ] **Step 6: Escrever o registrador**

Criar `src/components/pwa/registrar-sw.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/**
 * Registra `public/sw.js` (#185, Etapa 2).
 *
 * Só em produção: em `next dev` o Service Worker serve bundle antigo do cache
 * e o desenvolvedor passa a depurar código que já mudou — o sintoma clássico é
 * "salvei o arquivo e a tela não muda".
 *
 * Falha em silêncio de propósito: navegador sem suporte, contexto não-seguro
 * (HTTP) ou usuário com SW bloqueado devem ver o app funcionando normalmente.
 * O PWA é progressivo; a ausência dele não é erro de aplicação.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((erro) => {
      // Sem PII: só a mensagem do erro de registro.
      console.warn(
        "[pwa] service worker não registrado:",
        erro instanceof Error ? erro.message : String(erro),
      );
    });
  }, []);

  return null;
}
```

- [ ] **Step 7: Montar no layout raiz**

Em `src/app/layout.tsx`, acrescentar ao bloco de imports:

```ts
import { RegistrarServiceWorker } from "@/components/pwa/registrar-sw";
```

e, dentro de `<body>`, logo depois de `<WebMCPProvider />`:

```tsx
<RegistrarServiceWorker />
```

- [ ] **Step 8: Rodar tudo**

```bash
pnpm exec vitest run src/app/sw.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

Esperado: tudo verde. Se o ESLint reclamar de `self` não definido em `public/sw.js`, confirmar que `public/` está fora do escopo do `eslint.config` — arquivo estático não é código-fonte da app. Se não estiver, adicionar `public/sw.js` aos ignores do ESLint com comentário citando #185.

- [ ] **Step 9: Commit**

```bash
pnpm exec prettier --write public/sw.js src/app/sw.test.ts src/components/pwa/registrar-sw.tsx src/app/layout.tsx
git add public/sw.js src/app/sw.test.ts src/components/pwa/registrar-sw.tsx src/app/layout.tsx
git commit -m "feat(pwa): service worker com allowlist de cache só-estático, issue #185"
```

---

### Task 4: Página offline + E2E de comportamento

Entrega: `/offline` renderizando sem dado nenhum, precacheada na instalação do SW, e um E2E que prova o comportamento real com a rede desligada.

**Files:**

- Create: `src/app/offline/page.tsx`
- Create: `e2e/mobile-pwa.spec.ts`

**Interfaces:**

- Consumes: `PAGINA_OFFLINE = "/offline"` de `public/sw.js` (Task 3); `entrarComMfa` de `e2e/helpers/sessao.ts`; projeto Playwright `mobile-360` (Etapa 1, Task 1).
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Escrever a página offline**

Criar `src/app/offline/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "Sem conexão — Iris",
  robots: { index: false, follow: false },
};

/**
 * Página servida pelo Service Worker quando a navegação falha por falta de
 * rede (#185, Etapa 2).
 *
 * Estritamente estática e SEM NENHUM DADO: ela vive no cache do navegador, do
 * lado do dispositivo, fora de qualquer controle de sessão ou de RLS. Qualquer
 * conteúdo dinâmico aqui vira dado clínico persistido em claro no aparelho.
 * Nada de nome de clínica, contagem de fila ou último paciente aberto.
 *
 * `force-static` é trava, não otimização: impede que alguém acrescente uma
 * leitura de banco aqui sem perceber — o build quebra.
 */
export const dynamic = "force-static";

export default function PaginaOffline() {
  return (
    <Container largura="sm" className="py-16">
      <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
        Sem conexão
      </h1>
      <p className="font-body mt-4 text-base text-[var(--text-secondary)]">
        O Iris precisa de internet para mostrar dados clínicos. Nenhuma
        informação de paciente fica guardada neste aparelho.
      </p>
      <p className="font-body mt-3 text-base text-[var(--text-secondary)]">
        Assim que a conexão voltar, toque em continuar.
      </p>
      <Link
        href="/"
        className="font-display mt-8 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--brand-tint)] px-5 font-bold text-[var(--text-primary)]"
      >
        Tentar de novo
      </Link>
    </Container>
  );
}
```

- [ ] **Step 2: Escrever o E2E (vai falhar)**

Criar `e2e/mobile-pwa.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * PWA de ponta a ponta (#185, Etapa 2). Roda no projeto `mobile-360`.
 *
 * ⚠️ O `webServer` do Playwright sobe `next start` — produção. É condição
 * necessária: `RegistrarServiceWorker` não registra nada fora de produção.
 */
test("serve o manifesto e o navegador o enxerga", async ({ page }) => {
  await page.goto("/");

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();

  const resposta = await page.request.get(href!);
  expect(resposta.status()).toBe(200);

  const manifesto = await resposta.json();
  expect(manifesto.display).toBe("standalone");
  expect(manifesto.start_url).toBe("/");
  expect(manifesto.icons).toHaveLength(4);
});

test("todos os ícones do manifesto respondem 200", async ({ page }) => {
  const resposta = await page.request.get("/manifest.webmanifest");
  const manifesto = await resposta.json();

  for (const icone of manifesto.icons) {
    const r = await page.request.get(icone.src);
    expect(r.status(), `${icone.src} não respondeu 200`).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("registra o service worker", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 15_000 },
  );
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
  ).toContain("/sw.js");
});

test("cacheia asset estático e NÃO cacheia rota de app", async ({ page }) => {
  await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
  await page.goto("/pacientes");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Segunda visita: dá ao SW a chance de gravar o que ele fosse gravar.
  await page.reload();
  await page.waitForLoadState("networkidle");

  const chaves = await page.evaluate(async () => {
    const nomes = await caches.keys();
    const todas: string[] = [];
    for (const nome of nomes) {
      const cache = await caches.open(nome);
      for (const req of await cache.keys())
        todas.push(new URL(req.url).pathname);
    }
    return todas;
  });

  // Prova positiva: o cache não está vazio (senão o teste abaixo passaria por
  // vacuidade — SW que não cacheia nada também nunca cacheia paciente).
  expect(
    chaves.some(
      (c) => c.startsWith("/_next/static/") || c.startsWith("/icons/"),
    ),
    `cache não recebeu nenhum asset estático: ${JSON.stringify(chaves)}`,
  ).toBe(true);

  // Prova negativa: nenhuma rota de app nem de API entrou.
  const proibidos = chaves.filter(
    (c) =>
      c.startsWith("/api/") ||
      c.startsWith("/_next/data/") ||
      ["/pacientes", "/agenda", "/diario", "/validacao", "/relatorios"].some(
        (r) => c === r || c.startsWith(`${r}/`),
      ),
  );
  expect(
    proibidos,
    `rota de dado clínico entrou no cache do navegador: ${JSON.stringify(proibidos)}`,
  ).toEqual([]);
});

test("mostra a página offline quando a rede cai", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.goto("/agenda").catch(() => {
    // Navegação offline pode rejeitar; o que importa é o que ficou na tela.
  });

  await expect(
    page.getByRole("heading", { name: "Sem conexão" }),
  ).toBeVisible();
  await context.setOffline(false);
});
```

- [ ] **Step 3: Rodar**

```bash
pnpm build
pnpm seed:e2e
pnpm exec playwright test --project=mobile-360 e2e/mobile-pwa.spec.ts
```

Esperado: `5 passed`.

Se "mostra a página offline" falhar por a página não estar no precache: conferir que `pnpm build` gerou `/offline` como rota estática (`○ /offline` na saída do build). Se o build local no Windows tiver `.next` obsoleto, apagar e rebuildar (`rm -rf .next && pnpm build`) — o repo já teve falso-negativo por isso.

- [ ] **Step 4: Rodar a suíte inteira**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test
```

Esperado: verde, contagens conferidas — `mobile-360` agora com `35 + 5 = 40`.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write src/app/offline/page.tsx e2e/mobile-pwa.spec.ts
git add src/app/offline/page.tsx e2e/mobile-pwa.spec.ts
git commit -m "feat(pwa): página offline precacheada e E2E de política de cache, issue #185"
```

---

### Task 5: Medição Lighthouse e documento da política de cache

Entrega: o critério de aceite nº 2 da spec (Lighthouse mobile ≥ 90) medido, com número registrado, e a política de cache documentada onde a próxima pessoa a mexer no SW vai olhar.

**Files:**

- Create: `docs/arquitetura/pwa-e-cache.md`
- Modify: `README.md` (linha do mapa de docs)

**Interfaces:**

- Consumes: tudo das Tasks 1-4.
- Produces: documento de referência citado pela Etapa 3.

- [ ] **Step 1: Subir o app em produção local**

```bash
pnpm build
pnpm start
```

Deixar rodando noutro terminal.

- [ ] **Step 2: Medir**

```bash
pnpm dlx lighthouse http://localhost:3000/ \
  --preset=desktop=false \
  --form-factor=mobile \
  --screenEmulation.mobile \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output=html \
  --output-path=./lighthouse-mobile \
  --chrome-flags="--headless=new"
```

Anotar os 4 números. Se algum ficar abaixo de 90, anotar as oportunidades listadas pelo relatório — **não** silenciar a métrica.

⚠️ `lighthouse-mobile.report.html` e `.report.json` **não** vão para o repositório. Acrescentar ao `.gitignore` se ainda não casarem uma regra existente.

- [ ] **Step 3: Escrever o documento**

Criar `docs/arquitetura/pwa-e-cache.md`, preenchendo os números medidos no Step 2:

````markdown
# PWA do Iris — política de cache e medição

> Origem: issue #185, Etapa 2. Decisões ratificadas em 27/08/2026.

## Por que o Service Worker é escrito à mão

`@serwist/next` (sucessor do `next-pwa`) cacheia rota de aplicação por padrão.
Neste produto isso é incidente LGPD, não configuração agressiva: a resposta de
`/pacientes` carrega nome de criança e conteúdo clínico. Reconfigurar a
biblioteca para não fazer o que ela faz por padrão custa mais atenção
permanente do que manter 90 linhas próprias — e uma atualização menor da
biblioteca pode reintroduzir o padrão sem que ninguém note.

`public/sw.js` tem ~90 linhas e nenhuma dependência.

## A política, em uma frase

Só asset estático entra em cache. Tudo mais vai direto à rede e o Service
Worker nem intercepta.

### Allowlist (o que É cacheável)

| Padrão                                | Por quê                                             |
| ------------------------------------- | --------------------------------------------------- |
| `/_next/static/**`                    | Bundle e CSS com hash no nome — imutável, sem dado. |
| `/fonts/**`, `/icons/**`, `/brand/**` | Asset de marca, sem dado.                           |
| `/manifest.webmanifest`, `/icon.svg`  | Metadados de instalação.                            |

Só método `GET`, só mesma origem, só resposta `200` completa.

### O que NUNCA entra

Tudo o mais, por construção — é allowlist, não denylist. Em particular:
`/api/**`, `/_next/data/**` (payload de rota, carrega dado de paciente), e toda
navegação (`request.mode === "navigate"`).

Navegação usa rede-primeiro com fallback para `/offline`; a resposta de rede
não é gravada em momento nenhum.

### `/offline`

Página `force-static`, sem nenhuma leitura de banco. Ela vive no cache do
aparelho, fora de sessão e de RLS: qualquer conteúdo dinâmico ali seria dado
clínico persistido em claro no dispositivo.

## Como isso é vigiado

- `src/app/sw.test.ts` executa o `public/sw.js` **real** num sandbox `node:vm`
  e afirma a allowlist. Um guard escrito contra uma cópia em TS passaria verde
  enquanto o arquivo servido divergisse.
- `e2e/mobile-pwa.spec.ts` inspeciona o `CacheStorage` do navegador depois de
  uma sessão autenticada em `/pacientes`. Ele faz as duas provas: que o cache
  recebeu asset estático (senão o teste passaria por vacuidade) e que nenhuma
  rota de app entrou.

## Medição de Lighthouse (mobile)

Medido em `http://localhost:3000/` com `next start`, form factor mobile.

| Data      | Performance | Acessibilidade | Boas práticas | SEO       |
| --------- | ----------- | -------------- | ------------- | --------- |
| PREENCHER | PREENCHER   | PREENCHER      | PREENCHER     | PREENCHER |

Comando:

​`bash
pnpm build && pnpm start
pnpm dlx lighthouse http://localhost:3000/ --form-factor=mobile \
  --screenEmulation.mobile --only-categories=performance,accessibility,best-practices,seo \
  --output=html --output-path=./lighthouse-mobile --chrome-flags="--headless=new"
​`

Não há gate de Lighthouse em CI: a métrica varia com a máquina do runner e
viraria vermelho crônico sem defeito. A medição é feita à mão e registrada
nesta tabela a cada mudança relevante de bundle.
````

Substituir cada `PREENCHER` pelo número real do Step 2 e a data por `27/08/2026` (ou a data da execução). Remover o caractere zero-width dos blocos `​```bash` ao colar (ele está aqui só para não fechar o bloco externo).

- [ ] **Step 4: Registrar no mapa de docs**

Em `README.md`, na tabela do mapa de documentação, acrescentar a linha:

```markdown
| Política de cache do PWA e medição mobile | `docs/arquitetura/pwa-e-cache.md` |
```

- [ ] **Step 5: Verificar que o documento não mente**

Reler o documento contra `public/sw.js`. Cada linha da tabela de allowlist tem de casar um item de `PREFIXOS_PERMITIDOS` ou `CAMINHOS_PERMITIDOS`. Se divergir, o errado é o documento.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write docs/arquitetura/pwa-e-cache.md README.md
git add docs/arquitetura/pwa-e-cache.md README.md .gitignore
git commit -m "docs(pwa): política de cache do service worker e medição Lighthouse, issue #185"
```

---

## Definição de Pronto — Etapa 2

- [ ] `/manifest.webmanifest` responde 200 e os 4 ícones respondem 200 `image/png`.
- [ ] `pnpm exec vitest run src/app/sw.test.ts` verde com 17 testes contados.
- [ ] As duas mutações do Step 5 da Task 3 foram executadas e **falharam** o teste.
- [ ] `pnpm exec playwright test --project=mobile-360` verde com 40 testes contados.
- [ ] `CacheStorage` inspecionado depois de sessão autenticada em `/pacientes`: contém asset estático, não contém rota de app nem `/api/`.
- [ ] Lighthouse mobile medido e os 4 números registrados em `docs/arquitetura/pwa-e-cache.md`.
- [ ] `package.json` sem dependência nova (só o script `icons:pwa`).
