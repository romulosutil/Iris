# Especificação Técnica — Issue #189: SEO Técnico, OpenGraph & Acessibilidade (WCAG 2.1 AA)

**Data:** 03/08/2026  
**Issue GitHub:** [#189](https://github.com/romulosutil/Iris/issues/189) (Encerrada em 03/08/2026)  
**Plano Base:** [`docs/superpowers/plans/2026-08-03-seo-a11y-pr138-fixes-plan.md`](../plans/2026-08-03-seo-a11y-pr138-fixes-plan.md)  
**Escopo:** Implementação de SEO técnico completo (sitemap.ts, robots.ts, OpenGraph), testes E2E de acessibilidade WCAG 2.1 AA na Landing Page e hardening de proxy/middleware.

---

## 🎯 Requisitos & Entregáveis

1. **Limpeza de Rotas & Header `/auth.md`:**
   - Remoção da rota legada com `fs.readFile` em runtime (`src/app/auth.md/route.ts`).
   - Configuração de cabeçalho estático no `next.config.ts` (`Content-Type: text/markdown; charset=utf-8`, `Cache-Control`).
2. **Sitemap Dinâmico (`src/app/sitemap.ts`):**
   - Mapeamento das rotas públicas (`/`, `/login`, `/cadastro`, `/termos`, `/privacidade`) com frequências de alteração e prioridades.
   - Suíte de teste em `src/app/sitemap.test.ts`.
3. **Robots.txt Dinâmico (`src/app/robots.ts`):**
   - Configuração de diretivas para crawlers (permitir `/`, disallow em `/api/`, `/agenda`, `/pacientes`, etc.) apontando `/sitemap.xml`.
   - Suíte de teste em `src/app/robots.test.ts`.
4. **Metadados OpenGraph & Twitter Cards:**
   - Metadados completos em `src/app/institucional/page.tsx` (re-exportados por `src/app/page.tsx`).
   - Tags OpenGraph (`og:title`, `og:description`, `og:image`, `og:url`, `canonical`) e Twitter Cards (`summary_large_image`).
5. **Suíte de Acessibilidade (WCAG 2.1 AA):**
   - Automação Playwright em `e2e/landing-a11y.spec.ts` com `@axe-core/playwright` garantindo 0 violações automáticas.
   - Teste unitário de acessibilidade de formulários e componentes em `src/components/ui/a11y.test.tsx`.
6. **Hardening de Proxy/Middleware (`src/proxy.ts`):**
   - Restrição de interceptação a métodos de leitura (`GET/HEAD`).
   - Preservação de headers nativos de preload/prefetch do Next.js via `.headers.append("Link", ...)`.
   - Suíte de teste em `src/proxy.test.ts`.

---

## 📊 Estado Final de Implementação — 100% Concluído
- Todos os 6 itens técnicos foram implementados, testados com 100% de aprovação e validados no repositório (`pnpm test` e `pnpm typecheck`).
- Issue #189 encerrada como concluída no GitHub.
