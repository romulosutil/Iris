# D52: Guardrail de Ambiente no Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger os scripts de seed contra execução acidental em ambientes remotos (staging e produção), garantindo que só executem contra `localhost` / `127.0.0.1` / `::1` a menos que a variável explícita `ALLOW_SEED_REMOTE=true` esteja presente.

**Architecture:** Módulo utilitário puro `scripts/lib/guardrail-seed.ts` com funções para extração segura de hostname de URLs do PostgreSQL (suportando `postgres://`, `postgresql://`, IPv4, IPv6 e formatos com ou sem porta), identificação de hosts locais (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`) e validação estrita com bloqueio fail-closed. O guardrail é integrado em todos os scripts de seed (`scripts/seed.ts`, `scripts/seed-local.ts`, `scripts/seed-demo-account.ts`, `scripts/seed-super-admin.ts`).

**Tech Stack:** TypeScript, Node.js (URL API), Vitest, Drizzle ORM / Postgres.js.

---

### Task 1: Criar o módulo de Guardrail `scripts/lib/guardrail-seed.ts`

**Files:**

- Create: `scripts/lib/guardrail-seed.ts`

- [ ] **Step 1: Escrever o helper de guardrail puro**

Implementar funções:

- `extractDatabaseHost(connectionString: string): string`
- `isLocalDatabaseHost(host: string): boolean`
- `isLocalDatabase(connectionString: string): boolean`
- `assertSeedAllowed(connectionString?: string, allowRemoteEnv?: string): { isLocal: boolean; host: string }`

---

### Task 2: Configurar Vitest e Escrever Testes Unitários de Cobertura Completa

**Files:**

- Modify: `vitest.config.ts`
- Create: `scripts/lib/guardrail-seed.test.ts`

- [ ] **Step 1: Atualizar `vitest.config.ts` para incluir testes TypeScript em `scripts/`**
- [ ] **Step 2: Criar suíte de testes em `scripts/lib/guardrail-seed.test.ts`**
- [ ] **Step 3: Executar os testes unitários e verificar aprovação**

---

### Task 3: Integrar o Guardrail nos Scripts de Seed Existentes

**Files:**

- Modify: `scripts/seed-local.ts`
- Modify: `scripts/seed-demo-account.ts`
- Modify: `scripts/seed-super-admin.ts`

- [ ] **Step 1: Atualizar `scripts/seed-local.ts`**
- [ ] **Step 2: Atualizar `scripts/seed-demo-account.ts`**
- [ ] **Step 3: Atualizar `scripts/seed-super-admin.ts`**

---

### Task 4: Criar `scripts/seed.ts` e Adicionar script ao `package.json`

**Files:**

- Create: `scripts/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: Criar `scripts/seed.ts` como ponto de entrada protegido**
- [ ] **Step 2: Adicionar `"seed": "tsx --conditions=react-server --env-file=.env scripts/seed.ts"` em `package.json`**

---

### Task 5: Documentar `ALLOW_SEED_REMOTE` no `.env.example`

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Documentar a flag `ALLOW_SEED_REMOTE` com explicação de segurança**

---

### Task 6: Executar Verificação e Testes de Mutação

**Files:**

- Run commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`

- [ ] **Step 1: Testes de mutação: verificar que alterar a lógica do guardrail derruba os testes**
- [ ] **Step 2: Verificar `pnpm typecheck`**
- [ ] **Step 3: Verificar `pnpm lint` e `pnpm format:check`**

---

### Task 7: Atualizar `BACKLOG.md` com Resolução e Evidências

**Files:**

- Modify: `BACKLOG.md`

- [ ] **Step 1: Marcar D52 como resolvido na tabela de débitos e registrar evidência de medição**
