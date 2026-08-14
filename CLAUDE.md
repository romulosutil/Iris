# CLAUDE.md — Iris

> **Master Instruction Ledger**. Ler [`AGENTS.md`](AGENTS.md) primeiro: porta de entrada universal, governança em 3 camadas, matriz de responsabilidade (Claude/Gemini = Arquitetos de Produto; Jules = Executor Autônomo), protocolo de colaboração (idioma PT-BR obrigatório para Jules, acionamento via label `jules`, PRs em estado Draft até 100% de aprovação nos testes), guardrails inegociáveis de engenharia, checklist LGPD e definição de pronto.

## Stack Tecnológica & Comandos

### Stack do Projeto

- **Framework**: Next.js 16 (App Router)
- **Runtime & UI**: Node.js >= 22, React 19, React DOM 19, TypeScript
- **Estilização**: Tailwind CSS v4, PostCSS
- **Banco de Dados**: Postgres, Drizzle ORM, drizzle-kit
- **Autenticação**: Better Auth
- **Qualidade & Testes**: ESLint, Prettier, Vitest, Playwright (E2E), Storybook

### Comandos de Desenvolvimento e Build

- Servidor dev: `pnpm dev`
- Storybook local: `pnpm storybook`
- Formatar: `pnpm format`
- Build: `pnpm build`

### Comandos de Testes e Linting

- ESLint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Testes unitários/integração: `pnpm test`
- Testes RLS: `pnpm test:rls`
- Testes E2E (Playwright): `pnpm test:e2e`

### Comandos de Banco de Dados

- Aplicar migrações: `pnpm db:migrate`
- Seed local limpo: `pnpm seed:local`
- Gerar migrações: `pnpm db:generate`

#### ⚠️ Migrações: como escrever sem derrubar o banco

Armadilhas reais do repo. Débito **D1** (#186) e **D2** (#187) fechados. CI valida em `src/db/migrations.test.ts` (roda no `pnpm test`).

**1. `pnpm db:generate` é caminho para mudança de schema.** Snapshot reconciliado em `0078` (#186): `db:generate` responde `No schema changes, nothing to migrate`. Toda mudança de schema deve passar por ele:

- **Está em `src/db/schema.ts`** (tabela, coluna, enum, índice, FK, constraint) → mudar `schema.ts`, rodar `pnpm db:generate`. Commitar `.sql` + `meta/NNNN_snapshot.json` juntos. Nunca escrever DDL de `schema.ts` à mão (dessincronizou snapshot entre `0042` e `0077`, gerando 128 linhas de `db:generate` recriando `two_factor`, `auth_throttle` e enums de `alerta_risco`).
- **Não está no `schema.ts`** (policy de RLS, `GRANT`, função `SECURITY DEFINER`, trigger, view, backfill de dados) → Drizzle não modela: escrever à mão em `db/migrations/NNNN_nome.sql` com comentários e `--> statement-breakpoint`. Não altera snapshot.
- Se misturar: gerar schema com `db:generate`, editar `.sql` gerado adicionando policies/grants (sem tocar snapshot).
- Constraints manuais: renomeadas na `0078` de nomes Postgres (`_fkey`/`_pkey`/`_key`) para padrão Drizzle (`_fk`/`_pk`/`_unique`). Nomear explicitamente no padrão Drizzle.

**2. Migração à mão exige entrada manual no `_journal.json`, com o `when` correto.** Se `when` <= última migração, Drizzle pula arquivo em silêncio. Usar `when` = anterior **+ 1000**. (`0055` fix cross-tenant #128 pulou em prod por isso, #165).
`src/db/migrations.test.ts` falha CI se houver `.sql` sem entrada, entrada órfã, `when` duplicado/não crescente, `idx` fora de sequência, tag fora de `NNNN_nome`.

**3. Verifique medindo, não lendo.** Após `pnpm db:migrate`, checar Postgres: `information_schema` (coluna/grant), `pg_proc` (função + `prosecdef`), `pg_trigger`, e `BEGIN … ROLLBACK`. `git log` não prova execução.

**4. Coluna nova quase sempre precisa de `GRANT` explícito.** Tabelas (`patient` na `0044`, `app_user`/`clinic` na `0057`) têm `UPDATE` revogado por tabela e concedido coluna a coluna. Falta de grant gera `permission denied for table X`.

**5. Escrita fora da RLS: usar `SECURITY DEFINER`, não de policy nova.** `UPDATE` barrado por RLS afeta 0 linhas em silêncio. No DEFINER, guard interno é fronteira: copiar predicado exato da policy de leitura correspondente (`0048`, `0064`, `0067`).

**6. Policy nunca resolve o tenant com `current_setting('app.clinic_id')` direto — use `app_clinic_id_exigido()`.** Cast cru estoura `42704` ou `22P02` dentro da policy sem nomear tenant (guard de `app_conta_somente_leitura()` não bastou, #215). O helper (`0085`, D16/#229) levanta `P0001` diagnosticável. Não usar `app_clinic_id_atual()` em predicado de isolamento (retorna `NULL` e oculta linha em silêncio). `app_clinic_id_atual()` é para dentro de funções. `db/tests/clinic-id-helper-rls.int.test.ts` valida no CI.

Regra vale para policies, 13 funções `SECURITY DEFINER` (`0087`), views e queries da app. Policies tenant-scoped delegam a funções (`app_patient_in_clinic`, `app_user_in_clinic`, …) cujo texto não aparece em `pg_policies.qual` — varrer só `pg_policies` não cobre o frame real. Guard varre `pg_policies` + `pg_proc` + `pg_views`:
- `current_setting('app.clinic_id', true)::uuid` com `missing_ok` mata `42704`, mas valor inválido estoura `22P02`. Para leniência usar `app_clinic_id_atual()`.
- Regex de auditoria em template literal JS: `\(` vira `(` e `\s` vira `s` se não dobrar barras.

## Onboarding de uma sessão nova (sem memória desta conversa)

Ordem de leitura:

1. Este arquivo + `AGENTS.md`.
2. `docs/archive/handoff-fase1.md` — briefing, decisões travadas, escopo da fase.
3. `README.md` — 8 princípios inegociáveis + mapa de docs (`docs/**`).
4. `docs/arquitetura/stack-e-plano-de-construcao.md` — stack, plano fases 0.5 a 6, checklist LGPD mínimo viável.
5. Docs da fase em construção (mapa em `README.md` — ex: `docs/dados/modelo-de-dados.md` + `docs/ux/fluxos-e-wireframes.md` para Fase 1, `docs/archive/handoff-fase1.md`).

Dúvida documentada: ler doc, não pedir reexplicação ao Rômulo.

## Como esta sessão deve operar

- Usar task list (todo) para trabalho > 2-3 passos. Checar "Definição de pronto por fase" (`AGENTS.md` §7).
- Usar plan mode antes de alterar modelo de dados, RLS ou schema de saída do agente de extração (`docs/agente/output-schema.json`).
- Fim de sessão com decisão nova/gap/resolução: atualizar `BACKLOG.md` (`AGENTS.md` §8).
- Documentação e copy: pt-BR. Commits: inglês (`docs/arquitetura/convencoes-de-codigo.md`). Para o agente Jules, commits, PRs, comentários em issues e planos de ação devem ser obrigatoriamente em PT-BR.
- Decisão nova de arquitetura ou produto: marcar como proposta pendente de validação com Rômulo.

## Protocolo de Colaboração entre Agentes & Jules

- **Ponte de Comando:** `AGENTS.md` é a porta de entrada universal de briefing; `CLAUDE.md` contém os detalhes operacionais e de engenharia (Master Instruction Ledger).
- **Matriz de Responsabilidade:**
  - **Estratégia & Design (Claude Code / Gemini):** Arquitetos de produto. Especificações técnicas, visões UX/UI, diagramas de jornada em Mermaid, detalhamento de tarefas em GitHub Issues.
  - **Execução & Qualidade (Jules):** Executor autônomo. Implementação técnica de issues, análise automatizada de qualidade, segurança e performance em PRs.
- **Protocolo de Invocação & Resolução:**
  1. Qualquer dívida técnica ou nova funcionalidade DEVE ser registrada como **GitHub Issue**.
  2. Adicionar a label `jules` na issue para acionar a execução autônoma do Jules.
  3. O Jules assume a tarefa, lê `AGENTS.md` e `CLAUDE.md`, constrói o plano, executa e abre o PR.
- **Estado do Pull Request & Idioma:**
  - O PR é obrigatoriamente aberto no estado **Draft (Rascunho)**.
  - O PR só é marcado como pronto para revisão (*Ready for Review*) após **100% de aprovação nos testes automatizados** (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls`).
  - Todas as interações do Jules destinadas a humanos (descrição do PR, comentários em issues, mensagens de commit, plano de ação) devem ser obrigatoriamente em **Português (PT-BR)**, traduzindo qualquer contexto que venha em inglês.
- **Contexto de Negócio, Testes e Mocks via `.env.example`:**
  - O Jules deve obrigatoriamente ler `.env.example` para compreender os serviços (Better-Auth, Asaas, LLMs, Resend, MinIO), as variáveis de ambiente ativas e os papéis de Postgres (`DATABASE_URL`, `AUTH_DATABASE_URL`, `MIGRATION_DATABASE_URL`).
  - `.env.example` serve de mapa para criar mocks coerentes, entender flags de teste (`ALLOW_SKIP_INTEGRATION`) e garantir que a execução de testes automatizados reflita com precisão o contexto do negócio.

## Gestão de tokens: atomização e checkpoint de contexto

Regra pós-mortem D22 (#239, PR #240, memória `d22-sessao-gastou-token-em-loops-redundantes`).

**1. Toda issue nova entra atomizada:**
- Toca modelo de dados, RLS/policy ou schema do agente → `/tlc-spec-driven`.
- Outros itens → `/superpowers:writing-plans`.

**1b. Antes de aplicar a label `jules`, fechar o checklist de handoff (`AGENTS.md` §5.2).** Regra pós-mortem #285/PR #295 (13-14/08/2026): RCA impecável, mas Design incompleto (limites de polling, dono da leitura, decisão de UI, régua de mutação por comportamento — todos "a validar") gerou 9 achados na revisão pós-PR. Fechar os 7 pontos da §5.2 na issue/spec ANTES do label evita que o executor autônomo escolha por você. Revisão pós-PR (Claude/Opus) sempre lê o diff contra a Definição de Pronto original — CI verde sozinho não basta (`AGENTS.md` §5.6).

**2. Teto de ~50 mensagens por sessão:** Ao se aproximar do teto, salvar checkpoint em `checkpoint.md` (feito, pendente, decisões, próximo passo) e avisar Rômulo para `/clear`.

## Permissões — o que rodar livremente vs. o que confirmar antes

**Rodar livremente:** lint, testes, build local, Storybook, criar branch, rodar/ler migrations locais (Drizzle/dbmate contra Postgres local), `pnpm install`.

**Confirmar com o Rômulo antes:** `supabase db push` remoto; DDL em tabela com dados; mudanças em `docs/legal/`; deletar/reescrever migrations commitadas; chamadas API Anthropic/Google antes da Fase 3; renomear pasta/repositório (`xpect` → `iris`); criar projetos Supabase/Vercel; provisionar VPS + Easypanel.

> ⚠️ **Pivô de infra em avaliação (09/07/2026):** migração potencial para VPS Hostinger + Easypanel + Postgres puro (`docs/arquitetura/plano-bootstrap-e-stack-vps.md`). Confirmar antes de agir.

## Onde procurar o quê (atalho — mapa completo está em README.md)

| Preciso de...                                              | Arquivo                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Escopo exato da fase atual / roadmap viva                  | `BACKLOG.md` (GitHub Issues/Milestones)                                |
| Histórico do Handoff da Fase 1                             | `docs/archive/handoff-fase1.md`                                        |
| DDL / modelo de dados (25 entidades)                       | `docs/dados/modelo-de-dados.md`                                        |
| Telas e wireframes da fase                                 | `docs/ux/fluxos-e-wireframes.md`                                       |
| Tokens e os 3 componentes do design system                 | `docs/ux/design-system-espectro-brutal.md`                             |
| Regras do agente de extração (R1-R19)                      | `docs/agente/system-instructions.md`, `docs/agente/output-schema.json` |
| Regras do agente de relatório à família (F1-F9)            | `docs/agente/agente-2-relatorio-familia.md`                            |
| Regras de validação/reclassificação do coordenador (V1-V5) | `docs/governanca/validacao-coordenador.md`                             |
| O que ainda falta / decisões abertas                       | `BACKLOG.md`                                                           |
| Convenções de código (proposta, a confirmar)               | `docs/arquitetura/convencoes-de-codigo.md`                             |
| Variáveis de ambiente                                      | `.env.example`                                                         |
