# Infra — Iris (VPS Hostinger + Easypanel)

Stack self-hosted decidida em `docs/arquitetura/plano-bootstrap-e-stack-vps.md`:
Postgres puro + Better-Auth (in-app) + MinIO, num VPS Hostinger São Paulo (LGPD)
rodando Easypanel (Docker Swarm).

## Dev local

Sobe Postgres + MinIO com paridade de produção; o app roda fora do compose.

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres:5433, MinIO:9000/9001
cp .env.example .env                               # e preencher DATABASE_URL etc.
pnpm dev
```

`DATABASE_URL=postgres://iris:iris@localhost:5433/iris` (ver compose para MinIO).

## Deploy no Easypanel (provisionamento — via única do Rômulo)

1. **VPS Hostinger** KVM 4 (16 GB), **região São Paulo** (bloqueador LGPD —
   confirmar no checkout). Ubuntu 22.04+.
2. **Easypanel**: `curl -sSL https://get.easypanel.io | sh`; abrir `https://<IP>:3000`.
3. **Serviços** (templates Easypanel): **Postgres** e **MinIO**. Guardar
   credenciais.
4. **Domínio**: `irisclinica.ia.br` (A record → IP). Let's Encrypt automático.
5. **App**: novo serviço App → Code Source `romulosutil/Iris` → Builder
   **Dockerfile** com path `infra/Dockerfile` e build context na raiz →
   branch `main`, autodeploy on push.
6. **Env vars do App**: `DATABASE_URL`, `BETTER_AUTH_SECRET`
   (`openssl rand -base64 32`), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`.
   `ANTHROPIC_API_KEY` só na Fase 3.
7. **Segurança do SO** (responsabilidade nossa): SSH só por chave, firewall
   (80/443/SSH), `unattended-upgrades`, `pg_dump` agendado + restore testado
   (item LGPD antes de dado real).

## Banco — role de runtime (CRÍTICO para o RLS)

O RLS **só se aplica a roles não-superuser e não-donos da tabela**. Um superuser
(o usuário default do Postgres do Easypanel) **bypassa o RLS silenciosamente**.

- **Migrations** rodam como o dono/superuser (via `MIGRATION_DATABASE_URL`).
  A migração cria `app_role` como role de **privilégio, NOLOGIN** (alvo das
  policies + grants).
- **O app** deve conectar via `DATABASE_URL` com um **usuário de login dedicado,
  membro de `app_role`, NÃO superuser**. Criar uma vez, por ambiente:

  ```sql
  CREATE ROLE iris_app LOGIN PASSWORD '<senha forte>' IN ROLE app_role;
  ```

  Depois `DATABASE_URL=postgres://iris_app:<senha>@<host>:5432/iris`. Conferir
  que ele NÃO tem `SUPERUSER`/`BYPASSRLS` (`\du iris_app`), senão o isolamento
  multi-tenant não vale.

## Roles de banco (Fase 1b)

Além de `iris_app` (acima), a Fase 1b introduz a role de privilégio `iris_auth`
(criada pela migração `0002`, NOBYPASSRLS) para isolar o acesso do Better-Auth
e do bootstrap de identidade das tabelas de dado de paciente. Depois de aplicar
a migração `0002`, criar **uma vez** por ambiente, como superuser, o usuário de
login membro dela:

```sql
-- Cria o usuário de LOGIN membro de iris_auth (senha por ambiente, nunca versionada).
CREATE ROLE iris_auth_login LOGIN PASSWORD :'authpwd' IN ROLE iris_auth;
-- O usuário de app_role (app_login) já existe desde a Fase 1a; mesma receita.
```

Em dev local (docker-compose) o superuser é `iris`; rodar o SQL acima com
`psql` apontando pro container. Em produção (Easypanel `iris-postgres`), idem
via console SQL do serviço.

## Migrations e seed

```bash
pnpm db:generate   # gera SQL a partir de src/db/schema.ts (offline)
pnpm db:migrate    # aplica em db/migrations (usa MIGRATION_DATABASE_URL)
pnpm test:rls      # prova o isolamento contra o Postgres (5 casos por papel)
pnpm seed:clinic   # dados clínicos base (papéis, protocolos)
pnpm seed:demo     # dados de demonstração para navegar as telas
```

`seed:demo` popula dado sintético para o smoke de navegação por papel.

## Gotchas de dev local

- **Porta do Postgres:** o compose mapeia o host em **5433** (evita conflito com
  outros Postgres locais) → `DATABASE_URL=...@localhost:5433/iris`. Usar 5432 no
  host não conecta.
- **`BYPASS_MFA_FOR_DEV=true`:** destrava navegar como papel clínico (coordenador/
  terapeuta/recepção) sem enrollment de MFA em dev. Só em dev — em produção o boot
  falha de propósito (fail-closed). Ver `.env.example` e `src/auth/mfa-gate.ts`.
- **Drizzle desync (`db:migrate` falha):** se o tracking do drizzle ficar atrás do
  schema, `pnpm db:migrate` aborta. Workaround: aplicar o SQL da migração à mão via
  `psql` apontando pro container (`psql postgres://iris:iris@localhost:5433/iris -f
  db/migrations/<arquivo>.sql`) e seguir.

## Gate de schema no deploy (autodeploy on push ligado)

O app faz **autodeploy on push** (§Deploy passo 5), mas migração é gate humano.
Sem uma barreira, um push que assume schema novo sobe o app à frente do banco e
quebra em prod — foi o que aconteceu com a Agenda 2.0 (`bloqueio` / `clinic.
passo_grade_min` inexistentes). A barreira é o stage **`migrate`** do Dockerfile:

- `stage migrate` = job de deploy que roda `node scripts/migrate.mjs` com
  `MIGRATION_DATABASE_URL` (role dona, DDL) e **sai != 0 se falhar**.
- **Ordem no Easypanel:** rodar o serviço `migrate` (build target `migrate`) e
  esperar sucesso **ANTES** de promover o app. Se migrate falhar, abortar o
  deploy do app — o app velho continua no ar contra o schema velho (consistente),
  em vez do app novo contra schema velho (quebrado).
- O migrate usa a role dona (`MIGRATION_DATABASE_URL`), nunca a `DATABASE_URL`
  do app (app_role não tem DDL) — mesma separação de role do `pnpm db:migrate`.

`MIGRATION_DATABASE_URL` entra como env var do serviço `migrate` (não do app).

## Notas

- O `Dockerfile` usa Next standalone (`output: "standalone"` em `next.config.ts`)
  → imagem enxuta. `outputFileTracingRoot` fixa a raiz do trace.
- Storybook publica-se como serviço estático separado no Easypanel (`pnpm
build-storybook` → `storybook-static/`), com Password Protection.
- Migrations (Drizzle) usam `MIGRATION_DATABASE_URL` (role dona), nunca a
  `DATABASE_URL` do app (app_role, sem DDL). Não rodam dentro do container do
  app; rodam no stage `migrate`, gated ANTES do app (ver §Gate de schema). Dado
  clínico não migra sozinho — o gate é executado por release, não em cada boot.
