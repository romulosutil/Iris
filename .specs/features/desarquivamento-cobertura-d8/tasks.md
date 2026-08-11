# Resolução D8 — Tarefas de Implementação (Tech Lead Validated)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que terapeutas de cobertura (designados via `session.terapeuta_id` ou `session.atendido_por_id`) desarquivem pacientes automaticamente ao realizar atos clínicos de sessão, fechando o débito técnico D8 no BACKLOG.

**Architecture:** Atualização da procedure `app_desarquivar_paciente` (SECURITY DEFINER) para incluir autorização por sessão de cobertura na mesma clínica, remoção do gate restritivo em `desarquivarPacienteSeArquivado` e testes de ponta a ponta.

**Tech Stack:** TypeScript, PostgreSQL (SECURITY DEFINER, RLS), Drizzle ORM, Vitest.

---

### Task 1: Criar Migração `0092_desarquivar_paciente_cobertura.sql` e Atualizar Journal

**Files:**
- Create: `db/migrations/0092_desarquivar_paciente_cobertura.sql`
- Modify: `db/migrations/meta/_journal.json`

- [x] **Step 1: Criar o arquivo de migração SQL**

Escrever `db/migrations/0092_desarquivar_paciente_cobertura.sql` atualizando `app_desarquivar_paciente` com o guard de cobertura (`session.terapeuta_id` e `session.atendido_por_id` na mesma clínica).

- [x] **Step 2: Adicionar entrada no `db/migrations/meta/_journal.json`**

Adicionar entrada com `idx: 92`, `when: 1786456848181` (when anterior + 1000), tag `0092_desarquivar_paciente_cobertura`.

- [x] **Step 3: Rodar gate de migrações e aplicar migração**

Gate: `pnpm vitest run src/db/migrations.test.ts` e `pnpm db:migrate`.  
Expected: PASS (journal válido e migração aplicada no banco local).

- [x] **Step 4: Commit**

```bash
git add db/migrations/0092_desarquivar_paciente_cobertura.sql db/migrations/meta/_journal.json
git commit -m "feat(db): autoriza terapeuta de cobertura a desarquivar paciente (D8 / #174)"
```

---

### Task 2: Atualizar Testes de RLS para Cobertura de Terapeuta

**Files:**
- Modify: `db/tests/patient-arquivado-rls.int.test.ts`

- [x] **Step 1: Adicionar testes de desarquivamento por terapeuta de cobertura**

Em `db/tests/patient-arquivado-rls.int.test.ts`:
1. Criar sessão atribuída a terapeuta de cobertura para paciente arquivado.
2. Verificar que terapeuta de cobertura consegue invocar `app_desarquivar_paciente` e desarquivar com sucesso.
3. Verificar que terapeuta sem equipe E sem sessão continua estourando erro de autorização cross-team (`fora da equipe ou cobertura`).
4. Verificar que terapeuta com sessão em outra clínica continua estourando isolamento multi-tenant.

- [x] **Step 2: Rodar teste de RLS**

Gate: `pnpm vitest run db/tests/patient-arquivado-rls.int.test.ts`  
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add db/tests/patient-arquivado-rls.int.test.ts
git commit -m "test(rls): adiciona testes de desarquivamento por terapeuta de cobertura (D8)"
```

---

### Task 3: Refatorar Helper de Domínio e Atualizar Testes de Integração

**Files:**
- Modify: `src/lib/patient/desarquivamento.ts`
- Modify: `src/lib/patient/desarquivamento.int.test.ts`

- [x] **Step 1: Atualizar `src/lib/patient/desarquivamento.ts`**

Chamar `app_desarquivar_paciente` diretamente no `tx`, removendo o `tx.select().from(patient)` que bloqueava terapeutas de cobertura.

- [x] **Step 2: Atualizar testes em `src/lib/patient/desarquivamento.int.test.ts`**

Adicionar caso de teste com terapeuta de cobertura (com sessão cadastrada) executando `desarquivarPacienteSeArquivado`.

- [x] **Step 3: Rodar testes de integração do helper**

Gate: `pnpm vitest run src/lib/patient/desarquivamento.int.test.ts`  
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/lib/patient/desarquivamento.ts src/lib/patient/desarquivamento.int.test.ts
git commit -m "refactor(patient): delega autorizacao de desarquivamento a procedure com suporte a cobertura (D8)"
```

---

### Task 4: Testar Desarquivamento por Terapeuta de Cobertura no Fluxo de Diário

**Files:**
- Modify: `src/app/(app)/diario/[sessionId]/actions.int.test.ts`

- [x] **Step 1: Escrever teste de integração para captura de diário por terapeuta de cobertura**

Em `src/app/(app)/diario/[sessionId]/actions.int.test.ts`, adicionar teste onde:
1. Paciente está arquivado.
2. Sessão é atribuída a terapeuta substituto / cobertura (`session.terapeuta_id = U_TER_COBERTURA`).
3. `capturarDiario` ou `registrarAudioLocal` salva a nota e desarquiva o paciente automaticamente.
4. `audit_log` é criado com `atorId = U_TER_COBERTURA` e origem `"registro_clinico"`.

- [x] **Step 2: Rodar testes de diário**

Gate: `pnpm vitest run src/app/(app)/diario/[sessionId]/actions.int.test.ts`  
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add src/app/(app)/diario/[sessionId]/actions.int.test.ts
git commit -m "test(diario): verifica desarquivamento automatico por terapeuta de cobertura em sessao (D8)"
```

---

### Task 5: Fechar Débito D8 no BACKLOG e Validação Completa

**Files:**
- Modify: `BACKLOG.md`
- Modify: `.specs/features/desarquivamento-cobertura-d8/tasks.md`

- [ ] **Step 1: Atualizar entrada D8 no BACKLOG.md**

Marcar **D8** como **Fechado em 11/08/2026** detalhando a autorização da procedure `app_desarquivar_paciente` para condutores e substitutos de sessão com evidência de testes.

- [ ] **Step 2: Rodar verificação completa do repositório**

Gate:
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:rls`

Expected: 0 erros, 100% dos testes verdes.

- [ ] **Step 3: Commit**

```bash
git add BACKLOG.md .specs/features/desarquivamento-cobertura-d8/tasks.md
git commit -m "docs(backlog): fecha debito D8 com desarquivamento por terapeuta de cobertura (#174)"
```
