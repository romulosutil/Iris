# Fase 1b — Fundação Auth/Tenant (design)

Data: 2026-07-10
Status: proposta (aguardando revisão do Rômulo antes do plano de implementação)
Branch alvo: `fase-1b-fundacao-auth-tenant` (a partir de `main`)

## Contexto

A Fase 1a (PR #3, merged) entregou a fundação de DADOS: schema Drizzle (13
tabelas), Better-Auth com `app_user` como tabela `user`, RLS multi-tenant via
session GUC (`app.clinic_id/user_id/user_role`) + gargalo único `withTenant`,
e testes de integração RLS. Não existe ainda **nenhuma camada de aplicação**:
sem route handler do Better-Auth, sem login, sem ponte sessão→`TenantContext`,
sem shell protegido.

A Fase 1b constrói essa fundação de aplicação — e **só ela**. Cadastro
(administrativo/clínico) é a Fase 1c; agenda + check-in (com tabela `session`
nova e sua RLS) é a Fase 1d. Fatiamento decidido para manter cada PR pequeno e
a review Jules gerenciável (as policies RLS das tabelas globais são sutis).

A Fase 1b também **fecha o item de segurança diferido** apontado em 4 rodadas
de review Jules na Fase 1a: as tabelas globais (`clinic`, `app_user`,
`user_role`, `auth_*`) receberam `GRANT ALL` para `app_role` **sem RLS**. Esse
item foi explicitamente amarrado ao "fluxo de auth/resolução de tenant ainda
não construído" — que é exatamente o que a 1b constrói.

## Objetivo e critério de pronto

**Objetivo:** um usuário faz login, o sistema resolve com segurança em qual
clínica e com qual papel ele está operando, e serve um shell protegido com
troca de clínica (e de papel quando aplicável). O acesso a dado de produto
continua passando exclusivamente pelo `withTenant`.

**Critério de pronto:**

1. Um coordenador semeado por script faz login e chega ao shell protegido.
2. Um usuário com papel em 2 clínicas troca de clínica pelo switcher e o
   escopo de dado muda de acordo (verificado por teste).
3. `app_role` **não consegue** ler/escrever `auth_*`; só vê linhas de
   `app_user`/`user_role`/`clinic` da clínica ativa (verificado por teste).
4. Provisionar um usuário em clínica onde o ator não é coordenador é barrado.

## Decisões travadas nesta rodada de brainstorming

| Decisão             | Escolha                      | Nota                                                   |
| ------------------- | ---------------------------- | ------------------------------------------------------ |
| Escopo da 1b        | Só fundação auth/tenant      | Cadastro=1c, agenda=1d                                 |
| Clínica ativa       | Cookie de seleção + switcher | **Cookie só seleciona; papel re-derivado server-side** |
| RLS tabelas globais | Resolver na 1b               | Fecha o item diferido das 4 rodadas Jules              |
| Provisioning        | Seed script (1b)             | Convite UI movido p/ 1c                                |

## Achados do red-team incorporados ao design

Estes são invariantes de segurança, não detalhes — cada um vira teste.

- **A1 — cookie é seleção, não concessão.** O cookie de clínica ativa carrega
  **apenas** `clinicId` (opaco). `role` e pertencimento são **re-derivados no
  servidor a cada request** consultando `user_role`. Nunca confiar no cookie
  para `role`. Assinar o cookie só previne lixo/adulteração grosseira — não é
  autorização. Efeito colateral desejado: revogar `user_role` passa a valer na
  request seguinte.
- **A2 — papel ativo determinístico.** A PK `(user_id, clinic_id, papel)`
  permite múltiplos papéis na mesma clínica (persona Diego: coordenador +
  terapeuta). `coordenador` é superset (vê todo paciente + todo clínico) → se
  presente na clínica ativa, é o papel ativo. Papel único → usa. Combo
  `admin_recepcao` + `terapeuta` sem coordenador (escopos disjuntos) → exige
  **switcher de papel** além do de clínica.
- **A3 — sem BYPASSRLS.** A role de auth (`iris_auth`) é `NOBYPASSRLS`. Ela
  recebe GRANTs em `auth_*` + **policies role-targeted permissivas**
  (`TO iris_auth USING (true)`) em `app_user`/`clinic`/`user_role` para o
  bootstrap ler pré-GUC. Least-privilege em vez de bypass, para não furar o
  modelo do gargalo único.
- **A6 — provisionamento é upsert por email.** Email é `unique`; provisionar
  um email que já existe anexa `user_role`, não cria 2º `app_user`.

## Arquitetura

### 1. Duas conexões / duas roles de banco (crux de segurança)

Uma conexão = uma role. Duas roles são necessárias porque `auth_*` é revogada
de `app_role`:

- **`iris_auth`** (`NOLOGIN NOBYPASSRLS`, com um usuário `LOGIN ... IN ROLE
iris_auth` criado por ambiente): usada **só** pelo adapter do Better-Auth e
  pela função `resolveTenant()`. GRANTs em `auth_*` + policies permissivas
  `TO iris_auth` em `app_user`/`clinic`/`user_role`. Nenhum acesso a tabela de
  dado clínico de paciente.
- **`app_role`** (já existe, `NOBYPASSRLS`): todo dado de produto, sempre via
  `withTenant`. `auth_*` **revogada**.

`src/db/client.ts` passa a exportar duas instâncias Drizzle: `authDb` (conexão
`iris_auth`, usada pelo Better-Auth e pelo resolver) e `db` (conexão
`app_role`, base do `withTenant`). Regra de engenharia: **`authDb` nunca toca
dado de paciente**; só `auth_*` e as três globais de identidade. Um comentário
grande no arquivo torna isso explícito, no mesmo espírito do aviso já existente
no `db` cru.

### 2. Better-Auth: route handler + client

- `src/app/api/auth/[...all]/route.ts` — handler do Better-Auth (GET/POST).
- `src/auth/client.ts` — `authClient` (React) para as telas de login.
- `src/auth/auth.ts` — passa a usar `authDb` (hoje usa `db`).

### 3. RLS das tabelas globais — migração `0002_rls_globais.sql`

Escrita à mão (mesma disciplina do `0001_rls.sql`). Conteúdo:

- Criar role `iris_auth` (idempotente, mesmo padrão do `app_role`).
- `auth_session`/`auth_account`/`auth_verification`: `REVOKE ALL FROM app_role`;
  `GRANT ... TO iris_auth`. (Sem RLS necessária — só `iris_auth` as toca.)
- `app_user`: `ENABLE`/`FORCE` RLS.
  - Policy `app_user_auth_all TO iris_auth USING (true) WITH CHECK (true)`
    (bootstrap + provisionamento).
  - Policy `app_user_read TO app_role FOR SELECT USING (EXISTS (SELECT 1 FROM
user_role r WHERE r.user_id = app_user.id AND r.clinic_id =
current_setting('app.clinic_id')::uuid))` — produto vê só nomes/identidade
    de gente da clínica ativa.
- `clinic`: `ENABLE`/`FORCE` RLS.
  - `TO iris_auth USING (true)` (bootstrap lê clínicas do usuário).
  - `TO app_role FOR SELECT USING (id = current_setting('app.clinic_id')::uuid)`.
- `user_role`: `ENABLE`/`FORCE` RLS.
  - `TO iris_auth USING (true)` (resolver lê papéis pré-GUC).
  - `TO app_role FOR SELECT USING (clinic_id =
current_setting('app.clinic_id')::uuid)`.
  - Escrita de `user_role` por `app_role` fica **fora do escopo da 1b** (é o
    convite, 1c). Na 1b só `iris_auth` escreve `user_role` (seed/provisioning).
- `current_setting('app.clinic_id')` permanece de **um argumento** (estoura se
  o GUC não estiver setado) — falha fechada, mantém o padrão do `0001`.
- Teste explícito de **não-recursão**: as policies de produto que consultam
  identidade usam helpers `SECURITY DEFINER` (`app_user_in_clinic` etc., já
  existentes), então a RLS nova de `user_role`/`app_user` não deve recursar —
  confirmar com um teste que exercita `care_team_membership` write (que chama
  `app_user_in_clinic`) com a RLS nova ativa.

### 4. Resolução sessão → `TenantContext`

`src/auth/tenant.ts`:

- `resolveTenant(): Promise<TenantResolution>` — server-only. Passos:
  1. Lê a sessão do Better-Auth (via `authDb`). Sem sessão → `unauthenticated`.
  2. Lê o cookie `iris_active_clinic` (assinado). Consulta, via `authDb`,
     `user_role WHERE user_id = session.userId` → lista de `(clinicId, papel)`.
  3. Se o cookie aponta uma clínica onde o usuário **não tem papel** → ignora o
     cookie (trata como não-selecionado).
  4. Zero clínicas → `no_access`. Uma clínica e cookie ausente → seleciona
     automaticamente. Várias clínicas e cookie ausente/ inválido →
     `needs_clinic_selection` (lista de opções).
  5. Determina o papel ativo (regra A2). Combo disjunto sem seleção de papel →
     `needs_role_selection`.
  6. Sucesso → `TenantContext { clinicId, userId, role }`.
- `getTenantContext(): Promise<TenantContext>` — açúcar para pages/actions;
  redireciona para login/seleção conforme o estado. Alimenta `withTenant`.

### 5. Shell protegido + login (design system)

Route groups do App Router:

- `src/app/(auth)/login/page.tsx` — email + senha, via `authClient`.
- `src/app/(auth)/selecionar-clinica/page.tsx` — quando
  `needs_clinic_selection`; grava o cookie e redireciona.
- `src/app/(app)/layout.tsx` — guarda de sessão (chama `getTenantContext`);
  header com o switcher de clínica (e de papel, quando combo disjunto).
- `src/app/(app)/page.tsx` — placeholder do dashboard (só confirma que o shell
  monta com o tenant resolvido; conteúdo real vem nas fases seguintes).

**Componentes novos do design system** (regra HANDOFF §0 — formalizar no
Storybook **antes** de usar na tela; nunca hardcode): `Input`, `Field`/`Label`,
`Form` (wrapper com estado de erro/submitting). `Botão`/`Card`/`Alerta` já
existem. Cada um com story + matriz de estados + `addon-a11y` limpo.

### 6. Provisioning

- `scripts/seed-clinic.ts` — cria `clinic` + 1º `app_user` (coordenador, com
  credencial Better-Auth) + `user_role`. Roda via `authDb`/`iris_auth`.
  Idempotente por email.
- Função de provisionamento reutilizável (`provisionUser({ email, nome,
clinicId, papel })`) em `src/auth/provisioning.ts`, chamada pelo seed e, na
  1c, pelo convite UI. Upsert de `app_user` por email + insert de `user_role`.
  Escreve via `authDb`. **Sem UI na 1b.**

## Interfaces (contratos entre unidades)

- `client.ts`: `db` (app_role, RLS), `authDb` (iris_auth), `sql`.
- `rls.ts`: `withTenant(ctx, fn)` — inalterado.
- `tenant.ts`: `resolveTenant()`, `getTenantContext()`, tipos de resolução.
- `provisioning.ts`: `provisionUser(input)`.
- `auth/client.ts`: `authClient`.

## Testes

**Integração (Postgres real, padrão do `rls.int.test.ts`):**

1. `app_role` faz `SELECT` em `auth_session` → erro/zero linhas (revogado).
2. `app_role` com `app.clinic_id = A` lê só `app_user`/`user_role`/`clinic` de A.
3. `iris_auth` lê `user_role` de qualquer clínica do usuário (bootstrap).
4. Escrita em `care_team_membership` (que chama `app_user_in_clinic`) funciona
   com a RLS nova de `user_role`/`app_user` ativa — **teste de não-recursão**.
5. `resolveTenant`: cookie apontando clínica sem papel é ignorado (A1).
6. Papel ativo: coordenador vence sobre terapeuta na mesma clínica (A2).
7. Provisionar email existente anexa `user_role` sem duplicar `app_user` (A6).

**E2E (Playwright):** login → (seleção de clínica quando >1) → shell monta.

**Unit:** regra de papel ativo (A2) como função pura testável isolada.

## Fora de escopo (fases seguintes)

- Cadastro administrativo e clínico + convite UI de equipe → **Fase 1c**.
- Tabela `session` (agendamento) + agenda semanal + check-in + sua RLS →
  **Fase 1d**.
- MFA/2FA, rate limiting de login, verificação de email → hardening pré-dado
  real (checklist LGPD, AGENTS.md §8).

## Riscos e mitigações

- **Recursão de policy** nas globais: mitigada por helpers `SECURITY DEFINER`
  já existentes + teste dedicado (Teste 4). Risco residual baixo.
- **`authDb` usada por engano em código de produto**: mitigada por comentário
  forte + escopo estreito (só Better-Auth + resolver + provisioning) +
  Teste 1/2 pegam vazamento de escopo em CI. Considerar, na revisão, um lint
  que proíba importar `authDb` fora de `src/auth/**`.
- **Escopo inchar** (halfway-house): convite UI já cortado p/ 1c; se as
  policies globais gerarem muitas rodadas Jules, a 1b ainda entrega valor
  fechado (auth + RLS-global) sem depender da 1c.
