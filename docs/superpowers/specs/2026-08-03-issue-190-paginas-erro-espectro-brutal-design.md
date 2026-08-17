# Especificação Técnica — Issue #190: Páginas de Erro Customizadas (Espectro Brutal)

**Data:** 03/08/2026  
**Issue GitHub:** [#190](https://github.com/romulosutil/Iris/issues/190)  
**Escopo:** Implementação de páginas de erro customizadas (404 Not Found e 500 Internal Server Error) totalmente integradas ao Design System da Iris (Espectro Brutal).

---

## 🎯 Objetivos & Requisitos UX/UI

1. **Espectro Brutal (Design System):** Manter a mesma linguagem visual das demais telas públicas/autenticadas da plataforma (variáveis HSL de cores, fontes `font-display` e `font-mono`, bordas brutalistas `--border-brutal`, sombras `--ds-shadow` e cantos arredondados `--radius-control`).
2. **Página 404 (`not-found.tsx`):**
   - Substituir a página preta/padrão do Next.js App Router por um layout humanizado em pt-BR.
   - Fornecer um caminho de retorno claro (ex: link para `/agenda`).
3. **Página 500 (`error.tsx`):**
   - Atuar como Error Boundary do React no App Router.
   - Fornecer botão de "Tentar Novamente" acionando a função `reset()`.
   - Fornecer rota de fuga secundária (link para `/agenda`).
   - **Log Seguro & Guardrail LGPD/Segurança:** Registrar detalhes da exceção no lado do servidor/console (`useEffect`), mas **NUNCA** exibir mensagens brutas de erro, SQL queries ou stack traces no DOM do cliente final.

---

## 📊 Estado de Implementação

### 1. Página 404 (`src/app/not-found.tsx`) — ✅ Concluído

- **Commit:** `e9d5d20` (`feat(ui): página 404 on-brand (pt-BR, espectro-brutal)`).
- **Localização:** `src/app/not-found.tsx`.
- **Status:** Entregue e integrado ao Design System.

### 2. Página 500 (`src/app/error.tsx`) — 🚧 Pendente

- **Localização:** `src/app/error.tsx`.
- **Requisitos de código:**
  - Diretiva `"use client"`.
  - Assinatura: `export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void })`.
  - Capturar erro via `useEffect` logando com segurança (incluindo `error.digest` para correlação se disponível).
  - UI com marca (`Logo`), indicador de erro (ex: `Erro 500` / `Erro de Sistema`), copy amigável em pt-BR e botões de ação (`reset()` + voltar à agenda).

### 3. Página de Erro Global (`src/app/global-error.tsx`) — 🚧 Pendente (Opcional/Recomendado)

- **Localização:** `src/app/global-error.tsx`.
- Captura falhas críticas que ocorram dentro do próprio `root layout.tsx`. Renderiza tags `<html>` e `<body>` próprias.

### 4. Suíte de Testes Automatizados (`vitest`) — 🚧 Pendente

- **Localização:** `src/app/not-found.test.tsx` e `src/app/error.test.tsx`.
- Validação de renderização, copy em pt-BR e acionamento da função `reset()`.
