# Etapa 1 — Responsividade Mobile (Landing + App Logado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que nenhuma tela do Iris estoure horizontalmente em 360px, que todo controle interativo tenha alvo de toque ≥ 44×44px, e que a área autenticada ganhe uma Bottom Navigation Bar em telas de celular.

**Architecture:** A auditoria vira _gate executável_, não checklist: um projeto Playwright `mobile-360` mede `document.documentElement.scrollWidth` contra `clientWidth` em cada rota e falha quando há estouro, listando os elementos culpados. Os defeitos que ele acusa são corrigidos no mesmo commit em que o gate entra verde. A navegação mobile ganha um componente novo (`BottomNav`) que reaproveita o `Drawer` já existente no `Header` — o hambúrguer do topo é aposentado abaixo de `sm`, e a barra inferior passa a ser o único ponto de entrada do menu.

**Tech Stack:** Next.js 16.3.1 (App Router), React 19.2.8, Tailwind CSS v4, Playwright, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-03-mobile-responsividade-pwa-twa-android-design.md` (§2 Etapa 1, §3 critérios 1 e 2) + decisões ratificadas em 27/08/2026 registradas na §4 da própria spec.

**Issue:** #185 (Etapa 1 de 3).

## Global Constraints

- **Piso de viewport: 360px.** Decisão ratificada 27/08/2026 — sobrepõe o "320px" do corpo da issue #185. Todo gate mede em `360×740`.
- **Alvo de toque: 44×44px CSS mínimo** (`min-h-11 min-w-11` no Tailwind v4 deste repo). Exceção permitida apenas para link em fluxo de texto corrido (WCAG 2.2 SC 2.5.8, exceção "inline"), marcado explicitamente com `data-toque-inline`.
- **Navegação mobile: Bottom Bar com 4 destinos + botão de menu**, coexistindo com o `Drawer` existente. O `Drawer` NÃO é removido; ele deixa de ser acionado pelo hambúrguer do header abaixo de `sm` e passa a ser acionado pelo 5º slot da Bottom Bar.
- **Breakpoint de corte: `sm` (640px)** — é o breakpoint que o `Header` já usa (`src/components/ui/header.tsx:239` e `:341`). Não introduzir um breakpoint novo.
- **Idioma:** código, comentários, copy e mensagens de teste em **pt-BR**. Commits em **pt-BR**, Conventional Commits.
- **Gerenciador de pacotes:** `pnpm` (o repo trava a versão via campo `packageManager`; invocar binários por `pnpm exec`).
- **Nada de dependência nova nesta etapa.** Todo o ferramental já está no repo.
- **Nenhuma mudança de schema, RLS ou migração** nesta etapa.
- **Desvio consciente da spec §2:** a spec pede "renderização condicional de tabelas densas como cards em telas pequenas". Esta etapa resolve estouro de tabela com wrapper `overflow-x-auto` — padrão que o repo já usa em `agenda-calendar-grid` e `comparative-matrix` — e não com uma segunda árvore de renderização por breakpoint. Duas árvores para o mesmo dado dobram a superfície de teste e de a11y numa tela clínica densa. O critério de aceite nº 1 (zero estouro em 360px) é atendido pelos dois caminhos; se o Rômulo quiser a versão em cards como decisão de produto, ela é issue própria.

## File Structure

| Arquivo                                 | Responsabilidade                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/helpers/viewport.ts`               | **Criar.** Helper puro de medição: `medirOverflowHorizontal(page)` e `medirAlvosDeToque(page)`. Sem asserção — devolve dado; quem asserta é o spec.  |
| `e2e/mobile-publico.spec.ts`            | **Criar.** Gate de overflow nas rotas públicas (sem sessão).                                                                                         |
| `e2e/mobile-app.spec.ts`                | **Criar.** Gate de overflow nas rotas autenticadas (coordenador + terapeuta).                                                                        |
| `e2e/mobile-toque.spec.ts`              | **Criar.** Gate de alvo de toque de 44px.                                                                                                            |
| `playwright.config.ts`                  | **Modificar** (`projects`, linhas 83-94). Adiciona projeto `mobile-360`; exclui os specs `mobile-*` do projeto `chromium`.                           |
| `src/app/layout.tsx`                    | **Modificar.** Adiciona `export const viewport` com `viewportFit: "cover"` e `themeColor` (pré-requisito de safe-area da Bottom Bar).                |
| `src/components/ui/bottom-nav.tsx`      | **Criar.** Componente de apresentação da Bottom Navigation Bar. Não conhece rota nem sessão.                                                         |
| `src/components/ui/bottom-nav.test.tsx` | **Criar.** Testes unitários do `BottomNav`.                                                                                                          |
| `src/components/ui/header.tsx`          | **Modificar.** Campo `labelCurto` em `NavItem`; hambúrguer some abaixo de `sm`; `BottomNav` renderizado com o `Drawer` controlado pelo mesmo estado. |
| `src/app/(app)/layout.tsx`              | **Modificar** (linha ~162, o `<Container como="main">`). Reserva espaço inferior para a barra não cobrir conteúdo.                                   |

---

### Task 1: Harness de medição + gate de overflow nas rotas públicas

Entrega: projeto Playwright `mobile-360` rodando, helper de medição, gate verde sobre `/`, `/sobre`, `/termos`, `/privacidade`, `/login`, `/cadastro`, incluindo as correções de layout que ele acusar.

**Files:**

- Create: `e2e/helpers/viewport.ts`
- Create: `e2e/mobile-publico.spec.ts`
- Modify: `playwright.config.ts:83-94` (bloco `projects`)
- Modify: arquivos de layout acusados pelo gate (descobertos ao rodar; catálogo de correções no Step 4)

**Interfaces:**

- Consumes: nada de tarefas anteriores.
- Produces:
  - `medirOverflowHorizontal(page: Page): Promise<ResultadoOverflow>` onde
    `interface ResultadoOverflow { larguraViewport: number; larguraDocumento: number; culpados: Culpado[] }`
    e `interface Culpado { descricao: string; direita: number; largura: number }`.
  - Projeto Playwright de nome `"mobile-360"`, `testMatch: /mobile-.*\.spec\.ts/`.
  - Constante exportada `VIEWPORT_MOBILE = { width: 360, height: 740 }` em `e2e/helpers/viewport.ts`.

- [ ] **Step 1: Escrever o helper de medição**

Criar `e2e/helpers/viewport.ts`:

```ts
import type { Page } from "@playwright/test";

/**
 * Piso de viewport do gate mobile (#185, decisão de 27/08/2026).
 *
 * 360×740 é o menor Android relevante em uso (linha Galaxy A). O corpo da issue
 * #185 falava em 320px; a spec falava em 360px. O 360 venceu porque nenhum
 * aparelho em circulação entrega 320px CSS, e cada pixel a menos no piso cobra
 * ajuste de layout em tabela clínica densa sem público que o justifique.
 */
export const VIEWPORT_MOBILE = { width: 360, height: 740 } as const;

export interface Culpado {
  /** `tag#id.classe` — o suficiente para achar o elemento no código. */
  descricao: string;
  /** Borda direita do elemento, em px, relativa à origem do documento. */
  direita: number;
  largura: number;
}

export interface ResultadoOverflow {
  larguraViewport: number;
  larguraDocumento: number;
  culpados: Culpado[];
}

/**
 * Mede estouro horizontal da PÁGINA, não de contêineres internos.
 *
 * O oráculo é `documentElement.scrollWidth > clientWidth`: é exatamente isso
 * que o usuário sente como "a tela desliza para o lado". Uma tabela larga
 * dentro de um `overflow-x-auto` NÃO estoura o documento — e é um padrão
 * legítimo que o repo já usa em `agenda-calendar-grid` e `comparative-matrix`.
 * Assertar elemento a elemento reprovaria esses casos.
 *
 * A lista de `culpados` é diagnóstico, não oráculo: serve para a mensagem de
 * falha apontar o que consertar. Ela existe porque o modo de falha mais caro
 * aqui é invisível — um `sr-only` dentro de `<table>` não limita a largura da
 * tabela e produz rolagem horizontal que ninguém vê na tela (memória
 * `sr-only-em-table-nao-limita-largura`).
 */
export async function medirOverflowHorizontal(
  page: Page,
): Promise<ResultadoOverflow> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const larguraViewport = doc.clientWidth;
    const culpados: {
      descricao: string;
      direita: number;
      largura: number;
    }[] = [];

    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    )) {
      const estilo = getComputedStyle(el);
      if (estilo.display === "none" || estilo.visibility === "hidden") continue;

      const retangulo = el.getBoundingClientRect();
      if (retangulo.width === 0 && retangulo.height === 0) continue;

      const direita = Math.round(retangulo.right + window.scrollX);
      // Tolerância de 1px: arredondamento sub-pixel de layout não é defeito.
      if (direita <= larguraViewport + 1) continue;

      // Elemento dentro de um contêiner que rola na horizontal de propósito
      // não é culpado — o pai absorve o transbordo.
      let pai = el.parentElement;
      let absorvido = false;
      while (pai && pai !== document.body) {
        const estiloPai = getComputedStyle(pai);
        if (
          estiloPai.overflowX === "auto" ||
          estiloPai.overflowX === "scroll"
        ) {
          absorvido = true;
          break;
        }
        pai = pai.parentElement;
      }
      if (absorvido) continue;

      const id = el.id ? `#${el.id}` : "";
      const classe = el.className
        ? `.${String(el.className).trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
      culpados.push({
        descricao: `${el.tagName.toLowerCase()}${id}${classe}`,
        direita,
        largura: Math.round(retangulo.width),
      });
    }

    return {
      larguraViewport,
      larguraDocumento: doc.scrollWidth,
      culpados: culpados.slice(0, 12),
    };
  });
}
```

- [ ] **Step 2: Registrar o projeto `mobile-360` no Playwright**

Em `playwright.config.ts`, substituir o bloco `projects` (linhas 83-94) por:

```ts
  projects: [
    // Roda antes de tudo e confirma que quem atende na `baseURL` é o Iris.
    // `reuseExistingServer` reaproveita *qualquer coisa* servindo na porta: em
    // #209 o Playwright rodou contra outro projeto na 3000 e o
    // `{"error":"Not found"}` do `/api/auth` parecia bug do Iris.
    { name: "servidor", testMatch: /servidor\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Os specs `mobile-*` só fazem sentido no viewport de 360px. Sem este
      // ignore eles rodariam DUAS vezes — uma delas em 1280px de largura, onde
      // passariam sempre e dariam a impressão de cobertura mobile.
      testIgnore: /mobile-.*\.spec\.ts/,
      dependencies: ["servidor"],
    },
    {
      // Gate mobile de #185. `isMobile` liga a emulação de meta viewport do
      // Chromium (sem ela, `viewport-fit=cover` e `env(safe-area-inset-*)` não
      // são exercitados) e `hasTouch` faz o layout responder como celular.
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
      testMatch: /mobile-.*\.spec\.ts/,
      dependencies: ["servidor"],
    },
  ],
```

- [ ] **Step 3: Escrever o spec público (vai falhar)**

Criar `e2e/mobile-publico.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { medirOverflowHorizontal } from "./helpers/viewport";

/**
 * Gate de estouro horizontal das rotas PÚBLICAS em 360px (#185, Etapa 1).
 *
 * Roda só no projeto `mobile-360` (ver `testIgnore` do projeto `chromium`).
 * Não depende de seed: nenhuma destas rotas exige sessão.
 */
const ROTAS_PUBLICAS = [
  { caminho: "/", nome: "landing" },
  { caminho: "/sobre", nome: "sobre" },
  { caminho: "/termos", nome: "termos de uso" },
  { caminho: "/privacidade", nome: "política de privacidade" },
  { caminho: "/login", nome: "login" },
  { caminho: "/cadastro", nome: "cadastro" },
];

for (const rota of ROTAS_PUBLICAS) {
  test(`sem estouro horizontal em 360px — ${rota.nome}`, async ({ page }) => {
    await page.goto(rota.caminho);
    await page.waitForLoadState("networkidle");

    const medida = await medirOverflowHorizontal(page);

    expect(
      medida.larguraDocumento,
      `${rota.caminho} rola na horizontal em ${medida.larguraViewport}px. ` +
        `Documento tem ${medida.larguraDocumento}px. Culpados: ` +
        JSON.stringify(medida.culpados, null, 2),
    ).toBeLessThanOrEqual(medida.larguraViewport + 1);
  });
}
```

- [ ] **Step 4: Rodar o gate e catalogar as falhas**

Pré-requisito (o `webServer` sobe `next start`, que exige build):

```bash
pnpm build
pnpm exec playwright test --project=mobile-360 e2e/mobile-publico.spec.ts
```

Esperado nesta primeira execução: uma ou mais rotas FALHAM. A mensagem de erro traz `culpados` com `tag.classe`. Anotar a lista antes de mexer em qualquer arquivo.

Catálogo de correção — aplicar a técnica que casa com o culpado, **na ordem**:

| Sintoma no culpado                                             | Correção                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elemento com `w-[NNNpx]` ou `min-w-[NNNpx]` fixo maior que 360 | Trocar por `w-full max-w-[NNNpx]`.                                                                                                                                                                               |
| `<table>` ou grid denso                                        | Envolver num `<div className="overflow-x-auto">`. Se o conteúdo for `sr-only`, o wrapper vai por fora: `<div className="sr-only"><table>…</table></div>` (a classe `sr-only` numa `<table>` não limita largura). |
| Texto longo sem quebra (URL, e-mail, hash)                     | Adicionar `break-words` no contêiner de texto; `break-all` só em token sem espaço.                                                                                                                               |
| Grid com `grid-cols-N` fixo                                    | Trocar por `grid-cols-1 sm:grid-cols-N`.                                                                                                                                                                         |
| `flex` com filhos que não encolhem                             | Adicionar `min-w-0` no filho de texto (o padrão `min-width:auto` do flex impede o encolhimento).                                                                                                                 |
| Margem negativa (`-mx-*`) sem `overflow-hidden` no pai         | Adicionar `overflow-x-hidden` no contêiner que aplica a margem, não no `body`.                                                                                                                                   |

**Proibido:** `overflow-x: hidden` no `<body>` ou no `<html>`. Isso apaga o sintoma, mantém o defeito, e cega este gate para sempre.

- [ ] **Step 5: Aplicar as correções e rodar até verde**

```bash
pnpm exec playwright test --project=mobile-360 e2e/mobile-publico.spec.ts
```

Esperado: `6 passed`. Conferir a CONTAGEM, não só a ausência de vermelho — um `testMatch` errado produz "0 passed" com saída verde.

- [ ] **Step 6: Rodar lint, typecheck e a suíte desktop (não regredir)**

```bash
pnpm lint
pnpm typecheck
pnpm exec playwright test --project=chromium
```

Esperado: lint e typecheck limpos; a suíte `chromium` com a mesma contagem de antes (os specs `mobile-*` não aparecem nela).

- [ ] **Step 7: Formatar apenas os arquivos tocados**

```bash
pnpm exec prettier --write playwright.config.ts e2e/helpers/viewport.ts e2e/mobile-publico.spec.ts
```

(`pnpm format` reformata o repo inteiro, incluindo worktrees aninhados — não usar.)

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts e2e/helpers/viewport.ts e2e/mobile-publico.spec.ts
git add -u
git commit -m "test(mobile): gate de estouro horizontal em 360px nas rotas públicas, issue #185"
```

---

### Task 2: Gate de overflow nas rotas autenticadas

Entrega: o mesmo gate cobrindo o app logado, nos dois papéis clínicos, com as correções que ele acusar.

**Files:**

- Create: `e2e/mobile-app.spec.ts`
- Modify: arquivos de layout acusados pelo gate

**Interfaces:**

- Consumes: `medirOverflowHorizontal` de `e2e/helpers/viewport.ts` (Task 1); `entrarComMfa(page, email, senha): Promise<void>` de `e2e/helpers/sessao.ts` (já existe, `e2e/helpers/sessao.ts:33`).
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Semear o banco E2E**

```bash
pnpm seed:e2e
```

Contas criadas (`scripts/seed-e2e.ts:31`, `:110`):

- Coordenador: `e2e@iris.test` / `Senha E2E 123`
- Terapeuta: `terapeuta.demo@iris.test` / `Senha Demo 123`

⚠️ `seed:e2e` **TRUNCA** as tabelas de domínio do banco local. É o comportamento esperado da suíte E2E deste repo.

- [ ] **Step 2: Escrever o spec autenticado (vai falhar)**

Criar `e2e/mobile-app.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";
import { medirOverflowHorizontal } from "./helpers/viewport";

/**
 * Gate de estouro horizontal das rotas AUTENTICADAS em 360px (#185, Etapa 1).
 *
 * Dois papéis porque a navegação e as telas divergem: o coordenador tem a
 * Central de Validação, Equipe e os dados da clínica; o terapeuta tem a fila de
 * pendências. Um gate só no coordenador deixaria metade do shell sem medição.
 *
 * Pré-requisito: `pnpm seed:e2e`.
 */
const ROTAS_COORDENADOR = [
  "/agenda",
  "/pacientes",
  "/validacao",
  "/equipe",
  "/relatorios",
  "/clinica/dados",
  "/duvidas",
  "/perfil",
];

const ROTAS_TERAPEUTA = ["/agenda", "/pacientes", "/pendencias", "/relatorios"];

test.describe("coordenador", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
  });

  for (const caminho of ROTAS_COORDENADOR) {
    test(`sem estouro horizontal em 360px — ${caminho}`, async ({ page }) => {
      await page.goto(caminho);
      await page.waitForLoadState("networkidle");

      const medida = await medirOverflowHorizontal(page);

      expect(
        medida.larguraDocumento,
        `${caminho} rola na horizontal em ${medida.larguraViewport}px. ` +
          `Documento tem ${medida.larguraDocumento}px. Culpados: ` +
          JSON.stringify(medida.culpados, null, 2),
      ).toBeLessThanOrEqual(medida.larguraViewport + 1);
    });
  }
});

test.describe("terapeuta", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
  });

  for (const caminho of ROTAS_TERAPEUTA) {
    test(`sem estouro horizontal em 360px — ${caminho}`, async ({ page }) => {
      await page.goto(caminho);
      await page.waitForLoadState("networkidle");

      const medida = await medirOverflowHorizontal(page);

      expect(
        medida.larguraDocumento,
        `${caminho} rola na horizontal em ${medida.larguraViewport}px. ` +
          `Documento tem ${medida.larguraDocumento}px. Culpados: ` +
          JSON.stringify(medida.culpados, null, 2),
      ).toBeLessThanOrEqual(medida.larguraViewport + 1);
    });
  }
});
```

- [ ] **Step 3: Rodar e catalogar**

```bash
pnpm build
pnpm exec playwright test --project=mobile-360 e2e/mobile-app.spec.ts
```

Esperado: falhas. Suspeitos conhecidos, pelo grep de `overflow-x-auto` já presente no repo (esses ficam OK) e pelos que NÃO têm wrapper:

- `src/components/ui/agenda-calendar-grid.tsx` — grade de horários com colunas fixas.
- `src/components/ui/calendar/calendar-grid.tsx` — mesmo padrão.
- Tabelas de `/pacientes`, `/equipe` e `/relatorios`.

Aplicar o **mesmo catálogo de correção da Task 1, Step 4**, repetido aqui para quem lê esta tarefa fora de ordem:

| Sintoma no culpado                                             | Correção                                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elemento com `w-[NNNpx]` ou `min-w-[NNNpx]` fixo maior que 360 | Trocar por `w-full max-w-[NNNpx]`.                                                                                                                        |
| `<table>` ou grid denso                                        | Envolver num `<div className="overflow-x-auto">`. Se o conteúdo for `sr-only`, o wrapper vai por fora: `<div className="sr-only"><table>…</table></div>`. |
| Texto longo sem quebra (URL, e-mail, hash)                     | `break-words` no contêiner; `break-all` só em token sem espaço.                                                                                           |
| Grid com `grid-cols-N` fixo                                    | `grid-cols-1 sm:grid-cols-N`.                                                                                                                             |
| `flex` com filhos que não encolhem                             | `min-w-0` no filho de texto.                                                                                                                              |
| Margem negativa (`-mx-*`) sem `overflow-hidden` no pai         | `overflow-x-hidden` no contêiner que aplica a margem, nunca no `body`.                                                                                    |

**Proibido:** `overflow-x: hidden` no `<body>` / `<html>`.

- [ ] **Step 4: Aplicar as correções e rodar até verde**

```bash
pnpm exec playwright test --project=mobile-360 e2e/mobile-app.spec.ts
```

Esperado: `12 passed` (8 do coordenador + 4 do terapeuta). Conferir a contagem.

- [ ] **Step 5: Verificar que a suíte de componentes não regrediu**

```bash
pnpm test
pnpm typecheck
```

Esperado: mesma contagem de antes, sem novos "skipped".

- [ ] **Step 6: Formatar e commitar**

```bash
pnpm exec prettier --write e2e/mobile-app.spec.ts
git add e2e/mobile-app.spec.ts
git add -u
git commit -m "test(mobile): gate de estouro horizontal em 360px no app logado, issue #185"
```

---

### Task 3: `viewport` do documento com `viewport-fit=cover`

Entrega: o `<meta name="viewport">` do Next passa a declarar `viewport-fit=cover`, habilitando `env(safe-area-inset-bottom)` — pré-requisito da Bottom Bar não ficar por baixo da barra de gestos do Android/iOS. Também declara `themeColor`, que a Etapa 2 (PWA) vai reaproveitar.

**Files:**

- Modify: `src/app/layout.tsx` (adicionar export após o `export const metadata`, linha ~40)
- Create: `src/app/viewport.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces: `export const viewport: Viewport` em `src/app/layout.tsx`, com `themeColor: "#f2b705"` — a Etapa 2 usa o MESMO valor no `manifest.ts`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `src/app/viewport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { viewport } from "./layout";

describe("viewport do documento", () => {
  it("declara viewport-fit=cover para habilitar env(safe-area-inset-*)", () => {
    // Sem `viewportFit: "cover"` o Chrome no Android reserva a barra de gestos
    // e `env(safe-area-inset-bottom)` resolve para 0px — a Bottom Bar de #185
    // ficaria por baixo da barra do sistema sem nenhum sinal em teste de
    // componente (jsdom não emula safe-area).
    expect(viewport.viewportFit).toBe("cover");
  });

  it("usa o dourado da marca como theme-color", () => {
    // Mesmo valor que o `manifest.ts` da Etapa 2 declara. Divergir entre os
    // dois faz a barra de status do TWA piscar de cor na primeira navegação.
    expect(viewport.themeColor).toBe("#f2b705");
  });

  it("não trava o zoom do usuário", () => {
    // `maximumScale`/`userScalable` bloqueados reprovam WCAG 1.4.4 e são o
    // atalho mais comum para "resolver" estouro horizontal.
    expect(viewport.maximumScale).toBeUndefined();
    expect(viewport.userScalable).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run src/app/viewport.test.ts
```

Esperado: FAIL — `viewport` não é exportado de `./layout`.

- [ ] **Step 3: Adicionar o export**

Em `src/app/layout.tsx`, trocar a primeira linha de import por:

```ts
import type { Metadata, Viewport } from "next";
```

e inserir, logo depois do fechamento do objeto `metadata` (após a linha `};` que encerra `export const metadata`):

```ts
/**
 * `viewport-fit=cover` é pré-requisito de `env(safe-area-inset-*)` (#185).
 * Sem ele, a Bottom Navigation Bar do app logado fica por baixo da barra de
 * gestos no Android e do indicador de home no iOS.
 *
 * `themeColor` pinta a barra de status quando o app roda instalado (PWA/TWA).
 * O valor tem de ser idêntico ao `theme_color` do `manifest.ts`.
 *
 * `maximumScale`/`userScalable` ficam de fora de propósito: travar zoom reprova
 * o WCAG 1.4.4 e é o atalho errado para esconder estouro horizontal.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2b705",
};
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm exec vitest run src/app/viewport.test.ts
pnpm typecheck
```

Esperado: `3 passed`; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write src/app/layout.tsx src/app/viewport.test.ts
git add src/app/layout.tsx src/app/viewport.test.ts
git commit -m "feat(mobile): declara viewport-fit=cover e theme-color, issue #185"
```

---

### Task 4: Componente `BottomNav`

Entrega: componente de apresentação puro, testado, ainda não montado em lugar nenhum.

**Files:**

- Create: `src/components/ui/bottom-nav.tsx`
- Create: `src/components/ui/bottom-nav.test.tsx`
- Modify: `src/components/ui/header.tsx` (só o `interface NavItem`, linhas 31-37)

**Interfaces:**

- Consumes: `NavItem` e `NavBadgeTom` de `src/components/ui/header.tsx`; `cn` de `@/lib/cn`.
- Produces:
  - `NavItem` ganha o campo opcional `labelCurto?: string`.
  - `export function BottomNav(props: BottomNavProps)` com
    ```ts
    interface BottomNavProps {
      items: NavItem[];
      onAbrirMenu: () => void;
      renderLink?: (
        item: NavItem,
        children: React.ReactNode,
        className: string,
      ) => React.ReactNode;
    }
    ```
  - `export const MAX_ITENS_BOTTOM_NAV = 4`.

- [ ] **Step 1: Adicionar `labelCurto` ao `NavItem`**

Em `src/components/ui/header.tsx`, substituir a interface `NavItem` (linhas 31-37) por:

```ts
export interface NavItem {
  href: string;
  label: string;
  /**
   * Rótulo abreviado para a Bottom Navigation Bar (#185). Cada slot tem ~68px
   * em 360px de viewport; "Central de Validação" não cabe. Quando ausente, a
   * `BottomNav` cai no `label`. O `aria-label` do link continua sendo o `label`
   * completo — quem usa leitor de tela não perde a palavra "Central".
   */
  labelCurto?: string;
  badge?: number;
  badgeTom?: NavBadgeTom;
  active?: boolean;
}
```

- [ ] **Step 2: Escrever os testes (vão falhar)**

Criar `src/components/ui/bottom-nav.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav, MAX_ITENS_BOTTOM_NAV } from "./bottom-nav";
import type { NavItem } from "./header";

const ITENS_COORDENADOR: NavItem[] = [
  {
    href: "/validacao",
    label: "Central de Validação",
    labelCurto: "Validação",
    badge: 3,
    badgeTom: "ia",
  },
  { href: "/agenda", label: "Agenda", active: true },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/equipe", label: "Equipe" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/duvidas", label: "Dúvidas" },
  { href: "/perfil", label: "Meu Perfil" },
];

describe("BottomNav", () => {
  it("mostra no máximo 4 destinos, na ordem recebida", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(MAX_ITENS_BOTTOM_NAV);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/validacao",
      "/agenda",
      "/pacientes",
      "/equipe",
    ]);
  });

  it("usa labelCurto no texto visível e label completo no nome acessível", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);

    const link = screen.getByRole("link", { name: /Central de Validação/ });
    expect(link.textContent).toContain("Validação");
    expect(link.textContent).not.toContain("Central de Validação");
  });

  it("cai no label quando não há labelCurto", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Agenda/ }).textContent).toContain(
      "Agenda",
    );
  });

  it("marca a rota ativa com aria-current", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: /Agenda/ }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: /Pacientes/ })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("mostra a contagem da fila quando maior que zero", () => {
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("omite a contagem quando é zero", () => {
    const itens = ITENS_COORDENADOR.map((i) =>
      i.href === "/validacao" ? { ...i, badge: 0 } : i,
    );
    render(<BottomNav items={itens} onAbrirMenu={vi.fn()} />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("aciona onAbrirMenu no botão de menu", async () => {
    const abrir = vi.fn();
    render(<BottomNav items={ITENS_COORDENADOR} onAbrirMenu={abrir} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Abrir menu de navegação" }),
    );
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("usa renderLink quando fornecido", () => {
    render(
      <BottomNav
        items={ITENS_COORDENADOR}
        onAbrirMenu={vi.fn()}
        renderLink={(item, children, className) => (
          <a
            key={item.href}
            href={item.href}
            className={className}
            data-custom="1"
          >
            {children}
          </a>
        )}
      />,
    );
    expect(screen.getAllByRole("link")[0]?.getAttribute("data-custom")).toBe(
      "1",
    );
  });

  it("não renderiza nada quando não há itens", () => {
    const { container } = render(
      <BottomNav items={[]} onAbrirMenu={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
pnpm exec vitest run src/components/ui/bottom-nav.test.tsx
```

Esperado: FAIL — `Failed to resolve import "./bottom-nav"`.

- [ ] **Step 4: Implementar o componente**

Criar `src/components/ui/bottom-nav.tsx`:

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { NavItem, NavBadgeTom } from "@/components/ui/header";

/**
 * Quantos destinos cabem na barra antes do slot de menu.
 *
 * Em 360px, 5 slots dão ~72px cada — o piso de 44px de toque com folga para o
 * rótulo. Um 6º slot derruba o rótulo abaixo do legível.
 */
export const MAX_ITENS_BOTTOM_NAV = 4;

const badgeTomClasse: Record<NavBadgeTom, string> = {
  neutro:
    "border-[var(--surface-muted-border)] bg-[var(--surface-muted)] text-[var(--text-primary)]",
  ia: "border-[var(--status-ia-border)] bg-[var(--status-ia-bg)] text-[var(--status-ia-fg)]",
  risco:
    "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
};

function MenuIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export interface BottomNavProps {
  /** Lista completa de destinos do papel. A barra fatia os 4 primeiros. */
  items: NavItem[];
  /** Abre o Drawer que já existe no `Header` — a barra não tem estado próprio. */
  onAbrirMenu: () => void;
  renderLink?: (
    item: NavItem,
    children: React.ReactNode,
    className: string,
  ) => React.ReactNode;
}

/**
 * Bottom Navigation Bar do app logado em telas de celular (#185, Etapa 1).
 *
 * Por que os 4 PRIMEIROS itens e não uma lista configurável: `AppLayout` já
 * monta `itemsNav` em ordem de prioridade por papel (coordenador abre na
 * Central de Validação; terapeuta abre na Agenda do Dia). Uma segunda lista de
 * "itens da barra" seria um lugar a mais para esquecer de atualizar quando um
 * papel novo nascer — e o modo de falha seria silencioso: barra vazia.
 *
 * A barra NÃO substitui o Drawer. Ela é o único gatilho dele abaixo de `sm`,
 * porque o coordenador tem 9 destinos e só 4 cabem aqui.
 */
export function BottomNav({ items, onAbrirMenu, renderLink }: BottomNavProps) {
  if (items.length === 0) return null;

  const visiveis = items.slice(0, MAX_ITENS_BOTTOM_NAV);

  const classeSlot =
    "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 " +
    "px-1 py-2 font-display text-[11px] font-semibold leading-tight text-center " +
    "focus-visible:outline-focus";

  const classeItem = (item: NavItem) =>
    cn(
      classeSlot,
      item.active
        ? "border-t-2 border-[var(--border-brutal)] bg-[var(--brand-tint)] font-bold text-[var(--text-primary)]"
        : "border-t-2 border-transparent text-[var(--text-secondary)]",
    );

  const conteudo = (item: NavItem) => (
    <>
      <span className="w-full truncate">{item.labelCurto ?? item.label}</span>
      {item.badge !== undefined && item.badge > 0 ? (
        <span
          className={cn(
            "absolute top-1 right-1/4 rounded-[var(--radius-pill)] border px-1.5 font-mono text-[10px] font-bold",
            badgeTomClasse[item.badgeTom ?? "neutro"],
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </>
  );

  return (
    <nav
      aria-label="Navegação rápida"
      className={cn(
        // `fixed` posiciona pelo viewport mesmo renderizado de dentro do
        // <header>. `pb-[env(...)]` depende do `viewport-fit=cover` declarado
        // em `src/app/layout.tsx`.
        "fixed inset-x-0 bottom-0 z-50 flex items-stretch",
        "border-t-2 border-[var(--border-brutal)] bg-[var(--surface-card)]",
        "pb-[env(safe-area-inset-bottom)] shadow-[var(--ds-shadow)]",
        "sm:hidden",
      )}
    >
      {visiveis.map((item) => {
        const classe = classeItem(item);
        if (renderLink) return renderLink(item, conteudo(item), classe);
        return (
          <a
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={item.active ? "page" : undefined}
            className={classe}
          >
            {conteudo(item)}
          </a>
        );
      })}

      <button
        type="button"
        onClick={onAbrirMenu}
        aria-label="Abrir menu de navegação"
        className={cn(
          classeSlot,
          "border-t-2 border-transparent text-[var(--text-secondary)]",
        )}
      >
        <MenuIcon />
        <span>Menu</span>
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
pnpm exec vitest run src/components/ui/bottom-nav.test.tsx
pnpm typecheck
pnpm lint
```

Esperado: `9 passed`; typecheck e lint limpos.

- [ ] **Step 6: Provar que o teste testa (mutação)**

Trocar `items.slice(0, MAX_ITENS_BOTTOM_NAV)` por `items.slice(0, 5)` e rodar de novo.

Esperado: FALHA em "mostra no máximo 4 destinos". Reverter a mutação **com patch inverso** (`items.slice(0, 5)` → `items.slice(0, MAX_ITENS_BOTTOM_NAV)`), nunca com `git checkout` — o arquivo é novo e o checkout apagaria o componente inteiro.

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write src/components/ui/bottom-nav.tsx src/components/ui/bottom-nav.test.tsx src/components/ui/header.tsx
git add src/components/ui/bottom-nav.tsx src/components/ui/bottom-nav.test.tsx src/components/ui/header.tsx
git commit -m "feat(mobile): componente BottomNav para navegação em celular, issue #185"
```

---

### Task 5: Montar a `BottomNav` no shell autenticado

Entrega: a barra aparece abaixo de `sm` em todas as rotas do app logado, o hambúrguer do topo some no mesmo breakpoint, o conteúdo não fica coberto, e o Drawer continua acessível pelo 5º slot.

**Files:**

- Modify: `src/components/ui/header.tsx` (bloco do hambúrguer, linhas 238-329; e o retorno do componente)
- Modify: `src/app/(app)/layout.tsx` (o `<Container como="main">`, linha ~162)
- Modify: `src/app/(app)/app-header.tsx` (rótulos curtos)
- Create: `e2e/mobile-navegacao.spec.ts`

**Interfaces:**

- Consumes: `BottomNav`, `MAX_ITENS_BOTTOM_NAV` de `src/components/ui/bottom-nav.tsx` (Task 4); `labelCurto` em `NavItem` (Task 4); `medirOverflowHorizontal` de `e2e/helpers/viewport.ts` (Task 1); `entrarComMfa` de `e2e/helpers/sessao.ts`.
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Refatorar o `Header` para separar o `Drawer` do gatilho**

Em `src/components/ui/header.tsx`:

1. Adicionar aos imports:

```ts
import { BottomNav } from "@/components/ui/bottom-nav";
```

2. Substituir o bloco `{/* Botão Hambúrguer (Mobile < 640px) */}` (linhas 238-329) — que hoje envolve o `<Drawer>` inteiro dentro do header — por **apenas** o fechamento da linha de identidade. Ou seja: remover aquele `<div className="sm:hidden"> … </div>` por completo.

3. Extrair o conteúdo do drawer para uma variável logo antes do `return`:

```tsx
/**
 * O Drawer sai de dentro da faixa de identidade (#185). Antes ele estava
 * acoplado ao botão hambúrguer via `DrawerTrigger`; agora o gatilho é a
 * `BottomNav`, que fica `fixed` no rodapé. Como o `Drawer` já é controlado
 * por `open`/`onOpenChange`, basta chamar `setDrawerOpen(true)` — não é
 * preciso um segundo `DrawerTrigger`.
 */
const drawerNavegacao = (
  <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
    <DrawerContent posicao="right">
      <DrawerHeader>
        <DrawerTitle>Menu Principal</DrawerTitle>
      </DrawerHeader>

      <div className="flex flex-col gap-4 py-4">
        <div className="border-b border-[var(--border-brutal)]/30 pb-2">
          <p className="mb-1 font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase">
            Clínica Ativa
          </p>
          <p className="font-display text-base font-bold text-[var(--text-primary)]">
            {clinicaAtivaNome}
          </p>
          {outrasClinicas.map((c) => (
            <Button
              key={c.id}
              variante="neutra"
              tamanho="sm"
              className="mt-2 w-full justify-start"
              onClick={() => {
                onTrocarClinica?.(c.id);
                setDrawerOpen(false);
              }}
            >
              Trocar para {c.nome}
            </Button>
          ))}
        </div>

        <nav aria-label="Navegação mobile" className="flex flex-col gap-2">
          {itemsNav.map((item) => {
            const content = (
              <span className="flex w-full items-center justify-between">
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 ? (
                  <NavBadge valor={item.badge} tom={item.badgeTom} />
                ) : null}
              </span>
            );

            return (
              <div
                key={item.href}
                onClick={() => setDrawerOpen(false)}
                className="w-full"
              >
                {linkRenderer(item, content)}
              </div>
            );
          })}
        </nav>
      </div>

      <DrawerFooter>
        {usuarioNome ? (
          <p className="font-body mb-2 text-sm font-semibold text-[var(--text-secondary)]">
            {usuarioNome}
          </p>
        ) : null}
        {signOutSlot ? (
          signOutSlot
        ) : onSignOut ? (
          <Button variante="terciaria" tamanho="sm" onClick={onSignOut}>
            Sair da conta
          </Button>
        ) : null}
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
);
```

4. Remover `DrawerTrigger` da lista de imports (linha 13) — ele deixa de ser usado. A função `MenuIcon` (linhas 62-80) também fica órfã: **remover**, pois a `BottomNav` tem a sua própria.

5. No `return`, imediatamente antes de `</header>`, inserir:

```tsx
{
  itemsNav.length > 0 ? (
    <>
      {drawerNavegacao}
      <BottomNav
        items={itemsNav}
        onAbrirMenu={() => setDrawerOpen(true)}
        renderLink={renderLink}
      />
    </>
  ) : null;
}
```

- [ ] **Step 2: Dar rótulos curtos aos destinos longos**

Em `src/app/(app)/layout.tsx`, no array `itemsNav` do coordenador, trocar a primeira entrada por:

```ts
      {
        href: "/validacao",
        label: "Central de Validação",
        labelCurto: "Validação",
        badge: totalPendencias,
        // Fila alimentada pela extração da IA: violeta é o tom de "candidato
        // pendente de olhar clínico". Vermelho fica reservado a alerta de risco.
        badgeTom: "ia",
      },
```

e, no array do terapeuta, a primeira e a segunda:

```ts
      { href: "/agenda", label: "Agenda do Dia", labelCurto: "Agenda" },
      { href: "/pacientes", label: "Pacientes & PEIs", labelCurto: "Pacientes" },
```

- [ ] **Step 3: Reservar espaço para a barra não cobrir o conteúdo**

Em `src/app/(app)/layout.tsx`, trocar o `<Container como="main">` por:

```tsx
{
  /*
        O `pb` inferior reserva a altura da BottomNav (#185): ~56px de barra +
        a safe-area do aparelho. Sem isso, o último botão de cada tela (salvar
        diário, confirmar validação) fica embaixo da barra — invisível e
        inclicável, e nenhum teste de componente pega, porque o jsdom não
        conhece `position: fixed`.
      */
}
<Container
  como="main"
  largura="md"
  className="flex-1 py-6 pb-[calc(56px+env(safe-area-inset-bottom)+1.5rem)] sm:py-10 sm:pb-10"
>
  {children}
</Container>;
```

- [ ] **Step 4: Escrever o E2E de navegação (vai falhar)**

Criar `e2e/mobile-navegacao.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Navegação mobile do app logado (#185, Etapa 1).
 *
 * Roda só no projeto `mobile-360`. Pré-requisito: `pnpm seed:e2e`.
 */
test.describe("BottomNav do coordenador", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
    await page.goto("/agenda");
  });

  test("mostra a barra inferior com 4 destinos e o menu", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(barra).toBeVisible();
    await expect(barra.getByRole("link")).toHaveCount(4);
    await expect(
      barra.getByRole("button", { name: "Abrir menu de navegação" }),
    ).toBeVisible();
  });

  test("marca a rota atual na barra", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(barra.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("o menu abre o Drawer com a lista completa", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await barra
      .getByRole("button", { name: "Abrir menu de navegação" })
      .click();

    await expect(page.getByText("Menu Principal")).toBeVisible();
    const drawerNav = page.getByRole("navigation", {
      name: "Navegação mobile",
    });
    // Coordenador: 8 destinos do if/else + `/perfil` acrescentado fora dele.
    await expect(drawerNav.getByRole("link")).toHaveCount(9);
  });

  test("navega pelo 2º slot da barra", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await barra.getByRole("link", { name: "Pacientes" }).click();
    await expect(page).toHaveURL(/\/pacientes$/);
  });

  test("todo slot da barra cumpre 44px de alvo de toque", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    const slots = await barra.getByRole("link").all();
    slots.push(barra.getByRole("button", { name: "Abrir menu de navegação" }));

    for (const slot of slots) {
      const caixa = await slot.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa!.height).toBeGreaterThanOrEqual(44);
      expect(caixa!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("o rodapé da página não fica coberto pela barra", async ({ page }) => {
    await page.goto("/perfil");
    await page.waitForLoadState("networkidle");
    // Rola até o fim e confere que o último elemento do <main> termina acima
    // do topo da barra fixa.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const fundoDoMain = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? main.getBoundingClientRect().bottom : 0;
    });
    const topoDaBarra = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegação rápida"]');
      return nav ? nav.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
    });

    expect(fundoDoMain).toBeLessThanOrEqual(topoDaBarra);
  });
});

test.describe("BottomNav do terapeuta", () => {
  test("mostra os 4 destinos do papel, com rótulo curto", async ({ page }) => {
    await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
    await page.goto("/agenda");

    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(barra.getByRole("link")).toHaveCount(4);
    // `label` = "Agenda do Dia" (nome acessível), `labelCurto` = "Agenda".
    const primeiro = barra.getByRole("link", { name: "Agenda do Dia" });
    await expect(primeiro).toBeVisible();
    await expect(primeiro).toHaveText("Agenda");
  });
});
```

- [ ] **Step 5: Rodar tudo**

```bash
pnpm build
pnpm exec playwright test --project=mobile-360
pnpm test
pnpm typecheck
pnpm lint
```

Esperado: `mobile-360` com `6 + 12 + 7 = 25 passed`; `pnpm test` com a suíte de componentes verde (incluindo `app-header.test.tsx`, que continua válido — o Drawer segue renderizando os links).

Se `app-header.test.tsx` quebrar por contagem de links duplicados (o mesmo destino aparece no Drawer e na BottomNav), o teste usa `getAllByRole(...)[0]` e não deve quebrar — se quebrar, é sinal de que a barra renderizou onde não devia (`sm:hidden` ausente); corrigir o componente, não o teste.

- [ ] **Step 6: Verificação visual no navegador**

```bash
pnpm exec playwright test --project=mobile-360 e2e/mobile-navegacao.spec.ts --headed
```

Conferir a olho: barra colada no rodapé, rótulos não truncados, slot ativo destacado, Drawer abrindo pela direita por cima da barra.

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write src/components/ui/header.tsx "src/app/(app)/layout.tsx" e2e/mobile-navegacao.spec.ts
git add src/components/ui/header.tsx "src/app/(app)/layout.tsx" e2e/mobile-navegacao.spec.ts
git commit -m "feat(mobile): Bottom Navigation Bar no shell autenticado, issue #185"
```

---

### Task 6: Gate de alvo de toque de 44px

Entrega: gate executável que reprova qualquer controle interativo menor que 44×44px em 360px, mais as correções que ele acusar.

**Files:**

- Modify: `e2e/helpers/viewport.ts` (adiciona `medirAlvosDeToque`)
- Create: `e2e/mobile-toque.spec.ts`
- Modify: componentes acusados pelo gate

**Interfaces:**

- Consumes: `medirOverflowHorizontal` já em `e2e/helpers/viewport.ts` (Task 1); `entrarComMfa` de `e2e/helpers/sessao.ts`.
- Produces: `medirAlvosDeToque(page: Page): Promise<AlvoPequeno[]>` onde
  `interface AlvoPequeno { descricao: string; texto: string; largura: number; altura: number }`.

- [ ] **Step 1: Estender o helper**

Acrescentar ao fim de `e2e/helpers/viewport.ts`:

```ts
export interface AlvoPequeno {
  descricao: string;
  /** Primeiros 40 caracteres do texto — para achar o controle na tela. */
  texto: string;
  largura: number;
  altura: number;
}

/**
 * Lista os controles interativos visíveis abaixo de 44×44px CSS.
 *
 * O piso vem do WCAG 2.2 SC 2.5.8 (Target Size Minimum) e do guardrail da
 * issue #185. Duas exceções, ambas previstas pelo próprio critério:
 *
 *  - link em fluxo de texto corrido (`inline`): dentro de <p>, <li> ou
 *    elemento com `display: inline`. Encolher esses alvos quebraria o
 *    parágrafo. O produto marca casos limítrofes com `data-toque-inline`.
 *  - controle sem caixa (largura ou altura zero): já é invisível; se estiver
 *    errado, quem pega é o teste de a11y, não este.
 */
export async function medirAlvosDeToque(page: Page): Promise<AlvoPequeno[]> {
  return page.evaluate(() => {
    const PISO = 44;
    const seletor =
      'a[href], button, input:not([type="hidden"]), select, textarea, ' +
      '[role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"]';

    const pequenos: {
      descricao: string;
      texto: string;
      largura: number;
      altura: number;
    }[] = [];

    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(seletor),
    )) {
      const estilo = getComputedStyle(el);
      if (estilo.display === "none" || estilo.visibility === "hidden") continue;
      if (el.hasAttribute("data-toque-inline")) continue;
      if (estilo.display === "inline") continue;
      if (el.closest("p, li")) continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width >= PISO && r.height >= PISO) continue;

      const id = el.id ? `#${el.id}` : "";
      pequenos.push({
        descricao: `${el.tagName.toLowerCase()}${id}`,
        texto: (el.textContent ?? el.getAttribute("aria-label") ?? "")
          .trim()
          .slice(0, 40),
        largura: Math.round(r.width),
        altura: Math.round(r.height),
      });
    }

    return pequenos;
  });
}
```

- [ ] **Step 2: Escrever o spec (vai falhar)**

Criar `e2e/mobile-toque.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";
import { medirAlvosDeToque } from "./helpers/viewport";

/**
 * Gate de alvo de toque (WCAG 2.2 SC 2.5.8) em 360px — #185, Etapa 1.
 *
 * Pré-requisito das rotas autenticadas: `pnpm seed:e2e`.
 */
const ROTAS_PUBLICAS = ["/", "/login", "/cadastro"];
const ROTAS_APP = ["/agenda", "/pacientes", "/validacao", "/perfil"];

for (const caminho of ROTAS_PUBLICAS) {
  test(`alvos de toque ≥ 44px — público ${caminho}`, async ({ page }) => {
    await page.goto(caminho);
    await page.waitForLoadState("networkidle");

    const pequenos = await medirAlvosDeToque(page);

    expect(
      pequenos,
      `${caminho} tem controles abaixo de 44px:\n` +
        JSON.stringify(pequenos, null, 2),
    ).toEqual([]);
  });
}

test.describe("app logado", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
  });

  for (const caminho of ROTAS_APP) {
    test(`alvos de toque ≥ 44px — ${caminho}`, async ({ page }) => {
      await page.goto(caminho);
      await page.waitForLoadState("networkidle");

      const pequenos = await medirAlvosDeToque(page);

      expect(
        pequenos,
        `${caminho} tem controles abaixo de 44px:\n` +
          JSON.stringify(pequenos, null, 2),
      ).toEqual([]);
    });
  }
});
```

- [ ] **Step 3: Rodar e catalogar**

```bash
pnpm build
pnpm exec playwright test --project=mobile-360 e2e/mobile-toque.spec.ts
```

Esperado: falhas. Correções, por ordem de preferência:

1. **Aumentar a área sem mudar o visual** — adicionar `min-h-11 min-w-11 inline-flex items-center justify-center` no elemento. É o padrão que o repo já usa em `src/components/ui/chip.tsx:142` e `src/components/ui/accordion.tsx:61`.
2. **Puxar a área para o rótulo inteiro** — se o controle é um ícone ao lado de um texto clicável, mover o `href`/`onClick` para o wrapper e dar `min-h-11` a ele. Padrão de `src/components/ui/checkbox.tsx:70`.
3. **Marcar como exceção inline** — só quando o controle é de fato um link dentro de frase corrida: acrescentar `data-toque-inline` e um comentário de uma linha dizendo por quê.

**Proibido:** relaxar o piso no helper, ou adicionar a rota à lista de exceções do spec.

- [ ] **Step 4: Aplicar as correções e rodar até verde**

```bash
pnpm exec playwright test --project=mobile-360
```

Esperado: `25 + 7 = 32 passed`.

- [ ] **Step 5: Provar que o gate mata mutante**

Remover `min-h-11` de `src/components/ui/accordion.tsx:61` e rodar:

```bash
pnpm exec playwright test --project=mobile-360 e2e/mobile-toque.spec.ts
```

Esperado: FALHA em alguma rota que renderiza `Accordion`. Se passar verde, o gate não alcança o componente — ampliar a lista de rotas até alcançar. Reverter a mutação com patch inverso.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test
```

Esperado: tudo verde, contagens conferidas.

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write e2e/helpers/viewport.ts e2e/mobile-toque.spec.ts
git add e2e/helpers/viewport.ts e2e/mobile-toque.spec.ts
git add -u
git commit -m "test(mobile): gate de alvo de toque de 44px em 360px, issue #185"
```

---

### Task 7: Barras de ação `sticky` e teclado virtual

Entrega: a `BottomNav` deixa de cobrir a barra de ação de lote, e some enquanto o teclado virtual estiver aberto — fechando o item "Editor de Diário e Metas: otimização para teclado virtual (evitando sobreposição de botões de salvar)" da spec §2.

Contexto do defeito que a Task 5 **introduz**: `src/components/ui/patterns/batch-bar.tsx:45,73` posiciona a barra de ação em `sticky bottom-4 z-30`. A `BottomNav` é `fixed bottom-0 z-50`. Em 360px, a barra de lote da Central de Validação passa a ficar **por baixo** da barra de navegação — e o botão de confirmar fica inclicável. Fechar esta tarefa é parte de fechar a Task 5, não um extra.

**Files:**

- Create: `src/lib/hooks/use-teclado-virtual.ts`
- Create: `src/lib/hooks/use-teclado-virtual.test.ts`
- Modify: `src/components/ui/bottom-nav.tsx`
- Modify: `src/components/ui/patterns/batch-bar.tsx:45` e `:73`
- Modify: `e2e/mobile-navegacao.spec.ts` (acrescenta 2 testes)

**Interfaces:**

- Consumes: `BottomNav` de `src/components/ui/bottom-nav.tsx` (Task 4); projeto `mobile-360` (Task 1).
- Produces: `export function useTecladoVirtualAberto(): boolean` em `src/lib/hooks/use-teclado-virtual.ts`.

- [ ] **Step 1: Escrever o teste do hook (vai falhar)**

Criar `src/lib/hooks/use-teclado-virtual.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTecladoVirtualAberto } from "./use-teclado-virtual";

interface ViewportFalso {
  height: number;
  addEventListener: (nome: string, fn: () => void) => void;
  removeEventListener: (nome: string, fn: () => void) => void;
  disparar: () => void;
}

function instalarVisualViewport(alturaInicial: number): ViewportFalso {
  const ouvintes: (() => void)[] = [];
  const vv: ViewportFalso = {
    height: alturaInicial,
    addEventListener: (_nome, fn) => ouvintes.push(fn),
    removeEventListener: (_nome, fn) => {
      const i = ouvintes.indexOf(fn);
      if (i >= 0) ouvintes.splice(i, 1);
    },
    disparar: () => ouvintes.forEach((fn) => fn()),
  };
  Object.defineProperty(window, "visualViewport", {
    value: vv,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: alturaInicial,
    configurable: true,
    writable: true,
  });
  return vv;
}

afterEach(() => {
  Reflect.deleteProperty(window, "visualViewport");
});

describe("useTecladoVirtualAberto", () => {
  it("começa fechado", () => {
    instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());
    expect(result.current).toBe(false);
  });

  it("acusa aberto quando o viewport visual encolhe além do limiar", () => {
    const vv = instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());

    act(() => {
      vv.height = 380; // teclado ocupando ~360px
      vv.disparar();
    });
    expect(result.current).toBe(true);
  });

  it("volta a fechado quando o viewport visual cresce", () => {
    const vv = instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());

    act(() => {
      vv.height = 380;
      vv.disparar();
    });
    act(() => {
      vv.height = 740;
      vv.disparar();
    });
    expect(result.current).toBe(false);
  });

  it("ignora encolhimento pequeno (barra de URL do navegador)", () => {
    // O Chrome no Android recolhe a barra de endereço ao rolar, encolhendo o
    // viewport visual em ~60px. Tratar isso como teclado faria a BottomNav
    // piscar a cada rolagem.
    const vv = instalarVisualViewport(740);
    const { result } = renderHook(() => useTecladoVirtualAberto());

    act(() => {
      vv.height = 680;
      vv.disparar();
    });
    expect(result.current).toBe(false);
  });

  it("devolve false onde não há visualViewport", () => {
    // Servidor, jsdom sem stub e navegador antigo. O padrão seguro é
    // "teclado fechado": a barra aparece, que é o comportamento de sempre.
    const { result } = renderHook(() => useTecladoVirtualAberto());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run src/lib/hooks/use-teclado-virtual.test.ts
```

Esperado: FAIL — `Failed to resolve import "./use-teclado-virtual"`.

- [ ] **Step 3: Implementar o hook**

Criar `src/lib/hooks/use-teclado-virtual.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Diferença mínima, em px, entre a altura da janela e a do viewport visual
 * para considerar que o teclado virtual está aberto.
 *
 * 150px separa os dois casos que importam: a barra de endereço do Chrome no
 * Android recolhe ~60px ao rolar (não é teclado), enquanto o menor teclado de
 * celular ocupa ~250px. Um limiar baixo demais faz a BottomNav piscar a cada
 * rolagem da página.
 */
const LIMIAR_PX = 150;

/**
 * Diz se o teclado virtual está ocupando a tela (#185, Etapa 1).
 *
 * Não existe API de "teclado aberto" portável. O sinal disponível é o
 * `visualViewport`: quando o teclado sobe, o viewport VISUAL encolhe enquanto
 * `window.innerHeight` (o viewport de layout) fica igual. A diferença entre os
 * dois é a altura do teclado.
 *
 * Fora do navegador, sem `visualViewport`, o retorno é `false` — o padrão
 * seguro, porque significa "mostre a barra", que é o comportamento de sempre.
 */
export function useTecladoVirtualAberto(): boolean {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const avaliar = () => {
      setAberto(window.innerHeight - vv.height > LIMIAR_PX);
    };

    avaliar();
    vv.addEventListener("resize", avaliar);
    return () => vv.removeEventListener("resize", avaliar);
  }, []);

  return aberto;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm exec vitest run src/lib/hooks/use-teclado-virtual.test.ts
```

Esperado: `5 passed`.

Mutação: trocar `LIMIAR_PX = 150` por `LIMIAR_PX = 50` e rodar de novo. Esperado: FALHA em "ignora encolhimento pequeno". Reverter com patch inverso.

- [ ] **Step 5: Esconder a `BottomNav` com o teclado aberto**

Em `src/components/ui/bottom-nav.tsx`:

1. Acrescentar ao bloco de imports:

```ts
import { useTecladoVirtualAberto } from "@/lib/hooks/use-teclado-virtual";
```

2. Substituir a primeira linha do corpo de `BottomNav`:

```tsx
export function BottomNav({ items, onAbrirMenu, renderLink }: BottomNavProps) {
  // Hook antes de qualquer retorno antecipado: as regras dos Hooks proíbem
  // chamada condicional, e `items` vazio é um retorno antecipado.
  const tecladoAberto = useTecladoVirtualAberto();

  if (items.length === 0) return null;
  // Com o teclado aberto a barra rouba a faixa onde ficam os botões de salvar
  // do editor de diário e da barra de lote. Sair de cena é o comportamento
  // certo: o usuário está digitando, não navegando.
  if (tecladoAberto) return null;
```

3. Acrescentar ao final de `src/components/ui/bottom-nav.test.tsx` um caso novo:

```tsx
it("some quando o teclado virtual está aberto", () => {
  const ouvintes: (() => void)[] = [];
  Object.defineProperty(window, "visualViewport", {
    value: {
      height: 380,
      addEventListener: (_n: string, fn: () => void) => ouvintes.push(fn),
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 740,
    configurable: true,
    writable: true,
  });

  const { container } = render(
    <BottomNav items={ITENS_COORDENADOR} onAbrirMenu={vi.fn()} />,
  );
  expect(container.firstChild).toBeNull();

  Reflect.deleteProperty(window, "visualViewport");
});
```

- [ ] **Step 6: Levantar as barras `sticky` acima da `BottomNav`**

Em `src/components/ui/patterns/batch-bar.tsx`, trocar as duas ocorrências de `sticky bottom-4` (linhas 45 e 73) por:

```
sticky bottom-[calc(56px+1rem+env(safe-area-inset-bottom))] sm:bottom-4
```

56px é a altura da `BottomNav`; `1rem` preserva a folga original do `bottom-4`; a safe-area acompanha a barra de gestos. Acima de `sm` a `BottomNav` não existe e o valor volta a ser o de sempre.

Acrescentar, acima da primeira ocorrência, o comentário:

```tsx
// O offset inferior sobe acima da BottomNav em celular (#185): a barra
// de navegação é `fixed bottom-0 z-50` e cobriria o botão de confirmar
// desta barra de lote — que continuaria clicável para o teste e
// inalcançável para o dedo.
```

- [ ] **Step 7: Escrever o E2E de não-sobreposição**

Acrescentar ao fim de `e2e/mobile-navegacao.spec.ts`:

```ts
test.describe("barras de ação x BottomNav", () => {
  test("a barra de lote da validação não fica sob a BottomNav", async ({
    page,
  }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
    await page.goto("/validacao");
    await page.waitForLoadState("networkidle");

    const barraLote = page.locator(".sticky").first();
    const visivel = await barraLote.isVisible().catch(() => false);
    // A fila pode estar vazia no seed; nesse caso não há barra de lote e não há
    // o que medir. Registrar em vez de passar em silêncio.
    test.skip(!visivel, "fila de validação sem itens — barra de lote ausente");

    const caixaBarra = await barraLote.boundingBox();
    const caixaNav = await page
      .getByRole("navigation", { name: "Navegação rápida" })
      .boundingBox();

    expect(caixaBarra).not.toBeNull();
    expect(caixaNav).not.toBeNull();
    expect(
      caixaBarra!.y + caixaBarra!.height,
      "a barra de ação termina abaixo do topo da BottomNav — o botão fica inalcançável",
    ).toBeLessThanOrEqual(caixaNav!.y);
  });

  test("a BottomNav some quando um campo de texto recebe o teclado", async ({
    page,
  }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
    await page.goto("/perfil");
    await page.waitForLoadState("networkidle");

    // O Playwright não abre teclado virtual de verdade. Encolhemos o
    // `visualViewport` do mesmo jeito que o teclado encolheria e conferimos a
    // reação — é o sinal que o hook realmente observa em produção.
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, "height", { value: 380, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });

    await expect(
      page.getByRole("navigation", { name: "Navegação rápida" }),
    ).toBeHidden();
  });
});
```

- [ ] **Step 8: Rodar tudo**

```bash
pnpm build
pnpm exec playwright test --project=mobile-360
pnpm test
pnpm typecheck
pnpm lint
```

Esperado: `mobile-360` com `35 passed` (32 da Task 6 + 3 aqui, contando um possível `skipped` na barra de lote se a fila estiver vazia — nesse caso a saída diz `34 passed, 1 skipped`, e o `skipped` é informação, não sucesso).

- [ ] **Step 9: Commit**

```bash
pnpm exec prettier --write src/lib/hooks/use-teclado-virtual.ts src/lib/hooks/use-teclado-virtual.test.ts src/components/ui/bottom-nav.tsx src/components/ui/bottom-nav.test.tsx src/components/ui/patterns/batch-bar.tsx e2e/mobile-navegacao.spec.ts
git add src/lib/hooks/use-teclado-virtual.ts src/lib/hooks/use-teclado-virtual.test.ts src/components/ui/bottom-nav.tsx src/components/ui/bottom-nav.test.tsx src/components/ui/patterns/batch-bar.tsx e2e/mobile-navegacao.spec.ts
git commit -m "fix(mobile): BottomNav não cobre barra de ação nem disputa espaço com o teclado, issue #185"
```

---

## Definição de Pronto — Etapa 1

- [ ] `pnpm exec playwright test --project=mobile-360` verde, com 35 testes contados (não só "sem vermelho"); qualquer `skipped` conferido um a um.
- [ ] `pnpm exec playwright test --project=chromium` com a mesma contagem de antes da etapa.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` verdes.
- [ ] Bottom Bar visível abaixo de 640px e ausente acima, verificada a olho em `--headed`.
- [ ] Bottom Bar some com o teclado virtual aberto e não cobre a barra de ação de lote (medido por `boundingBox`, não presumido).
- [ ] As 3 mutações previstas (slice de 4, limiar de 150px, `min-h-11` do accordion) foram executadas e **falharam** os testes correspondentes.
- [ ] Nenhum `overflow-x: hidden` em `body`/`html` introduzido pelo diff.
- [ ] Nenhuma dependência nova em `package.json`.
