# Plano de Implementação — PR 138: SEO Técnico, Acessibilidade & Ajustes de Middleware

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar SEO técnico completo (sitemap.ts, robots.ts, OpenGraph), testes E2E de acessibilidade WCAG 2.1 AA na Landing Page e corrigir as observações [BLOCKING] e [WARN] da PR 138 no middleware/proxy e headers de forma robusta e sem regressões.

**Architecture:** Next.js 16 App Router com `MetadataRoute.Sitemap` e `MetadataRoute.Robots`, OpenGraph/Twitter Metadata em `src/app/page.tsx`, ajuste no proxy de rotas `src/proxy.ts` (métodos HTTP seguros `GET/HEAD` e `headers.append("Link")` para preservar prefetch do Next.js), remoção de `src/app/auth.md/route.ts` em favor de serving estático via `public/auth.md` + `next.config.ts`, e teste de acessibilidade E2E com `@axe-core/playwright`.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@axe-core/playwright`, Vitest, Playwright E2E.

---

## Mapeamento de Arquivos

- **Middleware & Infra (PR 138 fixes):**
  - Delete: `src/app/auth.md/route.ts` (se existir)
  - Modify: `next.config.ts` (headers estáticos para `/auth.md` / `public/auth.md`)
  - Modify: `src/proxy.ts` (gating de métodos HTTP `GET/HEAD` e uso de `headers.append("Link")`)
  - Create/Modify: `src/proxy.test.ts` (testes unitários do proxy)
- **SEO & Indexação:**
  - Create: `src/app/sitemap.ts`
  - Create: `src/app/sitemap.test.ts`
  - Create: `src/app/robots.ts`
  - Create: `src/app/robots.test.ts`
  - Modify: `src/app/page.tsx` & `src/app/institucional/page.tsx` (OpenGraph/Twitter Cards)
- **Acessibilidade & QA:**
  - Create: `e2e/landing-a11y.spec.ts`

---

## Tarefas de Implementação

### Task 1: Corrigir Apontamentos [BLOCKING] e [WARN] no Proxy/Middleware (`src/proxy.ts` & `next.config.ts`)

**Files:**

- Delete: `src/app/auth.md/route.ts` (se existir)
- Modify: `next.config.ts`
- Modify: `src/proxy.ts`
- Create: `src/proxy.test.ts`

**Contexto:**

1. `src/app/auth.md/route.ts` usava `fs.readFile` em runtime com `process.cwd()`, gerando erro `ENOENT` em serverless (Vercel/Easypanel) e gerando conflito com `public/auth.md`. A solução recomendada pela revisão é remover a rota e usar `next.config.ts` `headers()`.
2. Em `src/proxy.ts`, qualquer interceptação por `text/markdown` deve ser restrita apenas a métodos de leitura (`GET` e `HEAD`), para evitar interceptar requisições de mutação (`POST`, `PUT`, `DELETE`).
3. Em `src/proxy.ts`, qualquer alteração do header `Link` deve utilizar `response.headers.append("Link", ...)` em vez de `set("Link", ...)`, preservando as tags de preload/prefetch de assets do Next.js.

- [ ] **Step 1: Remover `src/app/auth.md/route.ts` se existir**

Verificar existência de `src/app/auth.md/route.ts` e remover o arquivo para evitar conflito com a pasta `public/`.

- [ ] **Step 2: Configurar `headers()` estáticos no `next.config.ts`**

File: `next.config.ts`
Adicionar o bloco `headers()` em `nextConfig`:

```typescript
  async headers() {
    return [
      {
        source: "/auth.md",
        headers: [
          { key: "Content-Type", value: "text/markdown; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400" },
        ],
      },
    ];
  },
```

- [ ] **Step 3: Escrever teste falho para as regras de proxy em `src/proxy.test.ts`**

File: `src/proxy.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("src/proxy.ts — segurança e preservação de headers", () => {
  it("ignora métodos de mutação (POST) mesmo se houver Accept text/markdown", () => {
    const req = new NextRequest("http://localhost:3000/api/test", {
      method: "POST",
      headers: { accept: "text/markdown" },
    });
    const res = proxy(req);
    expect(res.status).not.toBe(200);
  });
});
```

- [ ] **Step 4: Executar o teste unitário do proxy**

Run: `pnpm test src/proxy.test.ts`
Expected: PASS ou ajustar regras para cobrir.

- [ ] **Step 5: Ajustar `src/proxy.ts` com guards de método e `headers.append`**

File: `src/proxy.ts`

```typescript
import { NextResponse, type NextRequest } from "next/server";
import {
  NOME_COOKIE_TOKEN,
  opcoesCookieToken,
} from "@/app/(auth)/redefinir-senha/cookie";

export function proxy(request: NextRequest) {
  // Guard de métodos de leitura: apenas GET e HEAD são interceptáveis por leituras customizadas
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  const token = request.nextUrl.searchParams.get("token");
  if (token && request.nextUrl.pathname === "/redefinir-senha") {
    const urlLimpa = request.nextUrl.clone();
    urlLimpa.searchParams.delete("token");

    const resposta = NextResponse.redirect(urlLimpa);
    resposta.cookies.set(NOME_COOKIE_TOKEN, token, opcoesCookieToken());
    return resposta;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/redefinir-senha"],
};
```

- [ ] **Step 6: Executar suíte de testes do proxy**

Run: `pnpm test src/proxy.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit da Task 1**

```bash
git add next.config.ts src/proxy.ts src/proxy.test.ts
git commit -m "fix(infra): remover rota auth.md em favor de public estático, restringir métodos no proxy e usar headers.append (#138)"
```

---

### Task 2: Implementar Sitemap Dinâmico (`src/app/sitemap.ts`)

**Files:**

- Create: `src/app/sitemap.ts`
- Create: `src/app/sitemap.test.ts`

- [ ] **Step 1: Escrever teste unitário para o Sitemap**

File: `src/app/sitemap.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";

describe("Sitemap dinâmico (/sitemap.xml)", () => {
  it("retorna URLs públicas principais com prioridades corretas", async () => {
    const items = await sitemap();
    const urls = items.map((i) => i.url);
    expect(urls).toContain("https://irisclinica.ia.br");
    expect(urls).toContain("https://irisclinica.ia.br/login");
    expect(urls).toContain("https://irisclinica.ia.br/cadastro");
    expect(urls).toContain("https://irisclinica.ia.br/termos");
    expect(urls).toContain("https://irisclinica.ia.br/privacidade");
  });
});
```

- [ ] **Step 2: Executar o teste para verificar falha**

Run: `pnpm test src/app/sitemap.test.ts`
Expected: FAIL (módulo `./sitemap` não existe).

- [ ] **Step 3: Implementar `src/app/sitemap.ts`**

File: `src/app/sitemap.ts`

```typescript
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/cadastro`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/termos`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacidade`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
```

- [ ] **Step 4: Executar o teste para verificar aprovação**

Run: `pnpm test src/app/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit da Task 2**

```bash
git add src/app/sitemap.ts src/app/sitemap.test.ts
git commit -m "feat(seo): criar sitemap.ts dinâmico para URLs públicas (#114)"
```

---

### Task 3: Implementar Robots.txt Dinâmico (`src/app/robots.ts`)

**Files:**

- Create: `src/app/robots.ts`
- Create: `src/app/robots.test.ts`

- [ ] **Step 1: Escrever teste unitário para o Robots.txt**

File: `src/app/robots.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import robots from "./robots";

describe("Robots.txt dinâmico (/robots.txt)", () => {
  it("permite rotas públicas e bloqueia rotas de API/App", () => {
    const config = robots();
    expect(config.sitemap).toContain("/sitemap.xml");
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules.disallow).toContain("/api/");
  });
});
```

- [ ] **Step 2: Executar o teste para verificar falha**

Run: `pnpm test src/app/robots.test.ts`
Expected: FAIL (módulo `./robots` não existe).

- [ ] **Step 3: Implementar `src/app/robots.ts`**

File: `src/app/robots.ts`

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/validacao",
        "/agenda",
        "/pacientes",
        "/equipe",
        "/pendencias",
        "/revisao/",
        "/diario/",
        "/relatorios",
        "/supervisao",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Executar o teste para verificar aprovação**

Run: `pnpm test src/app/robots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit da Task 3**

```bash
git add src/app/robots.ts src/app/robots.test.ts
git commit -m "feat(seo): criar robots.ts com regras de crawlers e link para sitemap (#114)"
```

---

### Task 4: Enriquecer Metadados OpenGraph & Twitter Cards (`src/app/institucional/page.tsx` & `src/app/page.tsx`)

**Files:**

- Modify: `src/app/institucional/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Adicionar metadados completos de OpenGraph e Twitter Cards**

File: `src/app/institucional/page.tsx`

```typescript
export const metadata: Metadata = {
  title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
  description:
    "Sua equipe escreve o diário da sessão em texto livre; o Iris organiza em evidência ligada às metas do PEI, com a frase de origem anexa. 10 protocolos mapeados (VB-MAPP, ABLLS-R, Denver, PROC, MBGR e outros). Conta grátis, equipe ilimitada, cobrança por paciente ativo.",
  metadataBase: new URL("https://irisclinica.ia.br"),
  alternates: {
    canonical: "https://irisclinica.ia.br",
  },
  openGraph: {
    title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
    description:
      "Transforme diários de sessão em evidências rastreáveis do PEI. Relatórios para convênios e famílias em minutos.",
    url: "https://irisclinica.ia.br",
    siteName: "Iris Governança Clínica",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "https://irisclinica.ia.br/icon.svg",
        width: 512,
        height: 512,
        alt: "Iris Governança Clínica Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
    description:
      "Transforme diários de sessão em evidências rastreáveis do PEI. Relatórios para convênios e famílias em minutos.",
    images: ["https://irisclinica.ia.br/icon.svg"],
  },
};
```

- [ ] **Step 2: Executar typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit da Task 4**

```bash
git add src/app/institucional/page.tsx
git commit -m "feat(seo): adicionar OpenGraph, Twitter Cards e URL canônica na landing page (#114)"
```

---

### Task 5: Teste E2E de Acessibilidade (WCAG 2.1 AA) na Landing Page (`e2e/landing-a11y.spec.ts`)

**Files:**

- Create: `e2e/landing-a11y.spec.ts`

- [ ] **Step 1: Criar o spec do Playwright com `@axe-core/playwright`**

File: `e2e/landing-a11y.spec.ts`

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Acessibilidade da Landing Page (WCAG 2.1 AA)", () => {
  test("a rota raiz pública (/) não possui violações automáticas de acessibilidade", async ({
    page,
  }) => {
    await page.goto("/");

    // Executa auditoria do axe-core sobre a Landing Page
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Commit da Task 5**

```bash
git add e2e/landing-a11y.spec.ts
git commit -m "test(e2e): adicionar teste de acessibilidade WCAG 2.1 AA para a landing page (#114)"
```

---

### Task 6: Validação Geral & Auditoria do Tech Lead (Full Verification)

**Files:**

- All touched files

- [ ] **Step 1: Rodar Typecheck**
      Run: `pnpm typecheck`
      Expected: 0 erros.

- [ ] **Step 2: Rodar Linter**
      Run: `pnpm lint`
      Expected: 0 erros.

- [ ] **Step 3: Rodar Suíte de Testes Unitários e Integração**
      Run: `pnpm test`
      Expected: PASS (todos os testes verdes).

- [ ] **Step 4: Executar Build de Produção**
      Run: `pnpm build`
      Expected: PASS (build limpo, sitemap.xml e robots.txt gerados estaticamente/dinamicamente).

- [ ] **Step 5: Commit Final do Plano**

```bash
git add .
git commit -m "chore(release): consolidar SEO técnico, acessibilidade e correções de middleware da PR 138 (#114, #138)"
```
