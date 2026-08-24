# Tasks — Painel de Governança e Segurança da Clínica

- [ ] **Task 1: Especificação e Migração SQL**
  - [x] Criar spec.md e design.md em `.specs/features/painel-governanca-seguranca/`.
  - [ ] Criar migração SQL `NNNN_funcao_status_mfa_equipe.sql` em `db/migrations/`.
  - [ ] Atualizar `db/migrations/meta/_journal.json`.

- [ ] **Task 2: Queries e Backend de Governança**
  - [ ] Criar `src/app/(app)/configuracoes/seguranca/queries.ts`.
  - [ ] Implementar chamada para `app_obter_status_mfa_equipe()`, consulta a `audit_log` e gerador do Termo de Governança.

- [ ] **Task 3: Interface e Navegação**
  - [ ] Criar `src/app/(app)/configuracoes/seguranca/page.tsx` e componentes associados (`status-mfa-card.tsx`, `audit-logs-card.tsx`, `termo-governanca-card.tsx`).
  - [ ] Adicionar link de navegação para a página no `AppLayout` / `AppHeader`.

- [ ] **Task 4: Testes de RLS e Validação**
  - [ ] Criar `src/app/(app)/configuracoes/seguranca/mfa.int.test.ts` para testar acesso do coordenador, bloqueio de terapeuta e isolamento cross-tenant.
  - [ ] Executar testes e typecheck (`pnpm typecheck`, `pnpm test`, `pnpm test:rls`).
