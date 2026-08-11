# Resolução D23 — Tarefas de Implementação

> **For agentic workers:** Execute task-by-task. Ao fim de cada tarefa: rode o gate declarado, atualize o Status neste arquivo e faça um commit atômico com a mensagem sugerida.

**Goal:** Eliminar `current_setting('app.user_role')` 1-arg e `current_setting('app.user_id')::uuid` cru de dentro de funções `SECURITY DEFINER`, substituindo por helpers diagnósticáveis (`app_user_role_exigido()`, `app_user_id_exigido()`, `app_user_id_atual()`), com guard de CI que impede regressão.

**Architecture:** Migração `0093` cria os helpers e reescreve as 6 funções DEFINER. Testes ampliam `clinic-id-helper-rls.int.test.ts`.

**Tech Stack:** PostgreSQL (SECURITY DEFINER, plpgsql, SQL/STABLE), Vitest, TypeScript.

---

### Task 1: Criar migração `0093_user_role_id_helpers.sql` — helpers de GUC

**Files:**
- Create: `db/migrations/0093_user_role_id_helpers.sql`
- Modify: `db/migrations/meta/_journal.json`

**Status:** `[x]`

- [x] **Step 1: Criar os 6 helpers**

  Em `db/migrations/0093_user_role_id_helpers.sql`:
  1. `app_user_role_nao_resolvido()` — plpgsql, STABLE, RAISE P0001.
  2. `app_user_id_nao_resolvido()` — plpgsql, STABLE, RAISE P0001.
  3. `app_user_role_atual()` — SQL, STABLE, `NULLIF(BTRIM(current_setting('app.user_role', true)), '')`.
  4. `app_user_id_atual()` — SQL, STABLE, regex + CASE (padrão `app_clinic_id_atual`).
  5. `app_user_role_exigido()` — SQL, STABLE, `COALESCE(atual, raiser)`.
  6. `app_user_id_exigido()` — SQL, STABLE, `COALESCE(atual, raiser)`.

  Cada helper: `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO app_role` + `GRANT EXECUTE TO iris_auth`.

- [x] **Step 2: Reescrever as 6 funções DEFINER**

  Gerar corpos atuais de `pg_get_functiondef()` no banco local (após `pnpm db:migrate`), substituir **apenas** os casts crus:

  | Função | `user_role` | `user_id` |
  |--------|-------------|-----------|
  | `app_alerta_risco_visivel` | → `app_user_role_exigido()` | → `app_user_id_exigido()` |
  | `app_session_clinica_visivel` | → `app_user_role_exigido()` | → `app_user_id_exigido()` |
  | `app_salvar_config_emergencia` | → `app_user_role_exigido()` | → `app_user_id_atual()` (leniente, no COALESCE) |
  | `app_salvar_cpf_cnpj_clinica` | → `app_user_role_exigido()` | N/A |
  | `app_desarquivar_paciente` | → `app_user_role_exigido()` | → `app_user_id_exigido()` |
  | `app_criar_alerta_risco` | N/A | `nullif(...)::uuid` → `app_user_id_atual()` |

- [x] **Step 3: Adicionar entrada no `_journal.json`**

  `idx: 93`, `when: 1786456849181` (anterior + 1000), tag `0093_user_role_id_helpers`.

- [x] **Step 4: Rodar gate de migrações e aplicar**

  Gate: `pnpm vitest run src/db/migrations.test.ts` e `pnpm db:migrate`.
  Expected: PASS.

- [x] **Step 5: Commit**

  ```bash
  git add db/migrations/0093_user_role_id_helpers.sql db/migrations/meta/_journal.json
  git commit -m "feat(db): D23 — helpers app_user_role_exigido() e app_user_id_exigido() + reescrita de 6 funções DEFINER"
  ```

---

### Task 2: Ampliar guard de CI — testes de helpers e invariantes

**Files:**
- Modify: `db/tests/clinic-id-helper-rls.int.test.ts`

**Status:** `[x]`

- [x] **Step 1: Testes dos helpers lenientes**

  Novos casos no mesmo `describe`:
  - `app_user_role_atual()` devolve `NULL` nos 3 estados ruins (ausente, vazio, lixo).
  - `app_user_id_atual()` devolve `NULL` nos 4 estados ruins (ausente, vazio, lixo, truncado).
  - Contraprovas: devolvem valor/uuid quando GUC bem formado.

- [x] **Step 2: Testes dos helpers estritos**

  - `app_user_role_exigido()` levanta `P0001` nos 3 estados ruins (não `42704`).
  - `app_user_id_exigido()` levanta `P0001` nos 4 estados ruins (não `42704`, não `22P02`).
  - Contraprovas: devolvem valor/uuid quando GUC bem formado.

- [x] **Step 3: Guard negativo — nenhuma função DEFINER usa cast cru**

  Novos invariantes (mesmo padrão da `0087`):
  - Nenhuma função pública usa `current_setting('app.user_id')::uuid` cru (exceto `app_user_id_atual` que é o próprio helper).
  - Nenhuma função pública usa `current_setting('app.user_role')` 1-arg (sem `missing_ok`), exceto onde já protegido.
  
  **Nota:** Usar regex do Postgres com barras DUPLAS no template literal JS (lição da `0087`).

- [x] **Step 4: Guard positivo — conjunto exato de funções com helpers**

  Arrays literais escritos à mão:
  - `FUNCOES_COM_USER_ROLE_HELPER`: funções que chamam `app_user_role_exigido()`.
  - `FUNCOES_COM_USER_ID_EXIGIDO_HELPER`: funções que chamam `app_user_id_exigido()`.
  - `FUNCOES_COM_USER_ID_ATUAL_HELPER`: funções que chamam `app_user_id_atual()`.
  - Comparação de conjunto exato com query em `pg_proc`.

- [x] **Step 5: Rodar gate completo**

  Gate: `pnpm test:rls`
  Expected: PASS (novos + existentes).

- [x] **Step 6: Commit**

  ```bash
  git add db/tests/clinic-id-helper-rls.int.test.ts
  git commit -m "test(rls): D23 — guards de CI para helpers de user_role e user_id"
  ```

---

### Task 3: Verificação cruzada — testes unitários e RLS existentes

**Files:** Nenhuma modificação.

**Status:** `[ ]`

- [ ] **Step 1: Rodar suíte unitária**

  Gate: `pnpm test`
  Expected: PASS (nenhum teste regrediu).

- [ ] **Step 2: Rodar suíte RLS completa**

  Gate: `pnpm test:rls`
  Expected: PASS (todos os testes, inclusive os novos da Task 2).

- [ ] **Step 3: Atualizar BACKLOG.md — fechar D23**

  Marcar D23 como fechado com a data, referência à `0093`, e contagem de funções reescritas.

- [ ] **Step 4: Commit**

  ```bash
  git add BACKLOG.md
  git commit -m "docs: D23 fechado — helpers de GUC de papel e identidade (0093)"
  ```
