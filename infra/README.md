# Infra — Iris (VPS Hostinger + Easypanel)

Stack self-hosted decidida em `docs/arquitetura/plano-bootstrap-e-stack-vps.md`:
Postgres puro + Better-Auth (in-app) + MinIO, num VPS Hostinger São Paulo (LGPD)
rodando Easypanel (Docker Swarm).

## Dev local

Sobe Postgres + MinIO com paridade de produção; o app roda fora do compose.

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres:5432, MinIO:9000/9001
cp .env.example .env                               # e preencher DATABASE_URL etc.
pnpm dev
```

`DATABASE_URL=postgres://iris:iris@localhost:5432/iris` (ver compose para MinIO).

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

## Migrations e seed

```bash
pnpm db:generate   # gera SQL a partir de src/db/schema.ts (offline)
pnpm db:migrate    # aplica em db/migrations (usa MIGRATION_DATABASE_URL)
pnpm test:rls      # prova o isolamento contra o Postgres (5 casos por papel)
```

## Notas

- O `Dockerfile` usa Next standalone (`output: "standalone"` em `next.config.ts`)
  → imagem enxuta. `outputFileTracingRoot` fixa a raiz do trace.
- Storybook publica-se como serviço estático separado no Easypanel (`pnpm
build-storybook` → `storybook-static/`), com Password Protection.
- Migrations (Drizzle) rodam manualmente contra o Postgres via `DATABASE_URL`,
  nunca automáticas no deploy (dado clínico não migra sozinho).
