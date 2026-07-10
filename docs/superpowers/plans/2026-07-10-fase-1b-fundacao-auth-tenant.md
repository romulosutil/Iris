# Fase 1b — Fundação Auth/Tenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login + resolução segura de clínica/papel ativos + shell protegido, sobre o schema/RLS da Fase 1a, fechando a brecha RLS das tabelas globais.

**Architecture:** Duas roles/conexões de banco (`iris_auth` NOBYPASSRLS só para auth + bootstrap; `app_role` para todo dado de produto via `withTenant`). Sessão do Better-Auth → `resolveTenant()` re-deriva papel server-side toda request (cookie só seleciona clínica). RLS nas tabelas globais com policies role-targeted.

**Tech Stack:** Next.js 16 (App Router), Better-Auth 1.6.23, Drizzle 0.45 + postgres-js, Postgres puro, Vitest (unit jsdom + integração node), Playwright, design system "Espectro Brutal" (Storybook 10).

## Global Constraints

- **Nunca hardcode componente de UI** (HANDOFF §0): toda peça visual consome um componente do design system; componente novo é formalizado no Storybook (token-driven, matriz de estados, `addon-a11y` limpo) **antes** de usar na tela.
- **Gargalo único de dado de paciente é `withTenant`** (`src/db/rls.ts`); `authDb` **nunca** toca dado de paciente — só `auth_*` e as três globais de identidade (`app_user`/`clinic`/`user_role`).
- **Cookie de clínica/papel ativo é seleção, não concessão** (A1): `role` e pertencimento re-derivados server-side de `user_role` a cada request; nunca confiar no cookie para `role`.
- **`iris_auth` é `NOBYPASSRLS`** (A3): sem BYPASSRLS em lugar nenhum.
- **`current_setting('app.clinic_id')` sempre de um argumento** (estoura se GUC ausente — falha fechada), igual ao `0001_rls.sql`.
- Documentação e copy em **pt-BR**. Commits em **Conventional Commits pt-BR**.
- TS strict; imports via alias `@` = `src`. Colunas snake_case, chaves Drizzle camelCase.
- Migração SQL escrita à mão em `db/migrations/`, com `--> statement-breakpoint` entre statements (padrão do `0001_rls.sql`).
- Rodar `pnpm lint` e `pnpm typecheck` limpos antes de cada commit de código.

---

### Task 1: Segunda conexão de banco (`authDb`) + env + runbook de infra

**Files:**
- Modify: `src/db/client.ts`
- Modify: `.env.example`
- Modify: `infra/README.md` (ou criar se não existir a seção)

**Interfaces:**
- Produces: `authDb` (Drizzle sobre conexão `iris_auth`), `authSql` (pool postgres-js), exportados de `@/db/client`. Assinatura idêntica ao `db` existente.

- [ ] **Step 1: Adicionar a conexão `authDb` ao client**

Em `src/db/client.ts`, após o bloco do `db`, adicionar:

```ts
// ─── Conexão de AUTH/bootstrap (role iris_auth, NOBYPASSRLS) ─────────────────
// Usada SÓ pelo adapter do Better-Auth e por src/auth/{tenant,provisioning}.ts.
// iris_auth tem GRANT em auth_* (revogadas de app_role) + policies role-targeted
// permissivas em app_user/clinic/user_role p/ ler/escrever identidade pré-GUC.
// ⚠️ authDb NUNCA toca dado de paciente — isso fura o gargalo único withTenant.
const authUrl = process.env.AUTH_DATABASE_URL;
if (!authUrl) throw new Error("AUTH_DATABASE_URL não definida");
export const authSql = postgres(authUrl, { max: 5 });
export const authDb = drizzle(authSql, { schema, casing: "snake_case" });
```

- [ ] **Step 2: Documentar a env**

Em `.env.example`, logo após o bloco `DATABASE_URL`, adicionar:

```bash
# Conexão de AUTH (role iris_auth, NOBYPASSRLS) — obrigatória a partir da Fase 1b.
# Usuário de login membro de iris_auth (ver infra/README). Só toca auth_* e as
# globais de identidade; nunca dado de paciente.
# Local (docker-compose): postgres://iris_auth_login:iris@localhost:5432/iris
AUTH_DATABASE_URL=
```

- [ ] **Step 3: Documentar o provisionamento da role no runbook**

Em `infra/README.md`, adicionar seção "Roles de banco (Fase 1b)" com o SQL a rodar **uma vez** por ambiente, como superuser, depois de aplicar a migração `0002` (que cria a role de privilégio `iris_auth`):

```sql
-- Cria o usuário de LOGIN membro de iris_auth (senha por ambiente, nunca versionada).
CREATE ROLE iris_auth_login LOGIN PASSWORD :'authpwd' IN ROLE iris_auth;
-- O usuário de app_role (app_login) já existe desde a Fase 1a; mesma receita.
```

Nota no runbook: em dev local (docker-compose) o superuser é `iris`; rodar o SQL acima com `psql` apontando pro container. Em produção (Easypanel `iris-postgres`), idem via console SQL do serviço.

- [ ] **Step 4: Verificar typecheck/lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (o `throw` em import segue o mesmo padrão do `db` existente; nenhum consumidor novo ainda).

- [ ] **Step 5: Commit**

```bash
git add src/db/client.ts .env.example infra/README.md
git commit -m "feat(db): adiciona conexão authDb (role iris_auth) p/ auth e bootstrap"
```

---

### Task 2: Migração `0002` — RLS das tabelas globais (crux de segurança)

**Files:**
- Create: `db/migrations/0002_rls_globais.sql`
- Create: `db/tests/rls_globais.int.test.ts`

**Interfaces:**
- Consumes: `authDb`, `authSql` de `@/db/client` (Task 1); `sql as appSql` (app_role) de `@/db/client`.
- Produces: role `iris_auth`; RLS ativa em `app_user`/`clinic`/`user_role`; `auth_*` revogada de `app_role`.

- [ ] **Step 1: Escrever o teste de integração (falha primeiro)**

Criar `db/tests/rls_globais.int.test.ts`:

```ts
/**
 * Integração — RLS das tabelas globais (Fase 1b). Prova o item que 4 rodadas
 * Jules deixaram diferido: app_role não toca auth_*; vê só identidade da
 * clínica ativa; iris_auth (bootstrap) vê tudo; sem recursão de policy.
 * Requer DATABASE_URL (app_role), AUTH_DATABASE_URL (iris_auth),
 * MIGRATION_DATABASE_URL (superuser). Auto-skip sem eles.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { withTenant } from "../../src/db/rls";
import { careTeamMembership, appUser, userRole, clinic } from "../../src/db/schema";
import { sql as appSql, authSql, authDb } from "../../src/db/client";

const hasDb =
  !!process.env.DATABASE_URL &&
  !!process.env.AUTH_DATABASE_URL &&
  !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002"; // equipe de P1
const U_EXT = "a0000000-0000-0000-0000-000000000006"; // só clínica B
const P2 = "b0000000-0000-0000-0000-000000000002"; // clínica A

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("RLS tabelas globais — Fase 1b", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord@a.test'),
      (${U_TERA}, 'Tera', 'tera@a.test'),
      (${U_EXT}, 'Ext', 'ext@b.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_TERA}, ${CLINIC_A}, 'terapeuta'),
      (${U_EXT}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${P2}, ${CLINIC_A}, 'P2')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
    await authSql.end();
  });

  test("app_role NÃO lê auth_session (revogado)", async () => {
    await expect(appSql`SELECT 1 FROM auth_session LIMIT 1`).rejects.toThrow();
  });

  test("app_role vê só app_user/user_role/clinic da clínica ativa", async () => {
    const users = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select({ id: appUser.id }).from(appUser),
    );
    const ids = users.map((u) => u.id).sort();
    // U_EXT (só clínica B) não aparece; U_COORD e U_TERA (clínica A) aparecem.
    expect(ids).toEqual([U_COORD, U_TERA].sort());
    expect(ids).not.toContain(U_EXT);

    const clinicas = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select({ id: clinic.id }).from(clinic),
    );
    expect(clinicas.map((c) => c.id)).toEqual([CLINIC_A]);

    const papeis = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select({ cid: userRole.clinicId }).from(userRole),
    );
    expect(papeis.every((p) => p.cid === CLINIC_A)).toBe(true);
  });

  test("iris_auth (bootstrap) lê user_role de qualquer clínica do usuário", async () => {
    const rows = await authDb
      .select({ cid: userRole.clinicId })
      .from(userRole);
    const clinicas = new Set(rows.map((r) => r.cid));
    expect(clinicas.has(CLINIC_A)).toBe(true);
    expect(clinicas.has(CLINIC_B)).toBe(true); // vê além da clínica ativa
  });

  test("não-recursão: ctm_write (chama app_user_in_clinic) funciona com RLS nova", async () => {
    // app_user_in_clinic é SECURITY DEFINER → não recursar na RLS de user_role.
    await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) =>
        db.insert(careTeamMembership).values({
          patientId: P2,
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
        }),
    );
    const equipe = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select().from(careTeamMembership),
    );
    expect(equipe.map((m) => m.userId)).toContain(U_TERA);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `pnpm test:rls db/tests/rls_globais.int.test.ts`
Expected: FAIL (sem a migração `0002`, `auth_session` ainda é legível por app_role e app_user não tem RLS → o teste de escopo retorna U_EXT). Se não houver DBs, o teste se auto-skipa — nesse caso, garantir os três env vars antes de prosseguir.

- [ ] **Step 3: Escrever a migração**

Criar `db/migrations/0002_rls_globais.sql`:

```sql
-- Fase 1b — RLS das tabelas globais + role de auth (iris_auth).
-- Fecha o item diferido das 4 rodadas Jules: clinic/app_user/user_role/auth_*
-- tinham GRANT ALL a app_role SEM RLS. iris_auth é NOBYPASSRLS (least-privilege,
-- não fura o gargalo withTenant). Ver docs/superpowers/specs/2026-07-10-fase-1b-*.

-- iris_auth: role de PRIVILÉGIO (NOLOGIN). O usuário que conecta é criado por
-- ambiente (LOGIN ... IN ROLE iris_auth), fora das migrations. Ver infra/README.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'iris_auth') THEN
    CREATE ROLE iris_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO iris_auth;
--> statement-breakpoint

-- auth_* : só iris_auth toca. Revoga de app_role (maior brecha: app_role
-- escrevendo/lendo tabela de sessão e credencial).
REVOKE ALL ON auth_session, auth_account, auth_verification FROM app_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_session, auth_account, auth_verification TO iris_auth;
--> statement-breakpoint
-- Globais de identidade: iris_auth lê (bootstrap) e escreve (seed/provisioning).
GRANT SELECT, INSERT, UPDATE, DELETE ON app_user, clinic, user_role TO iris_auth;
--> statement-breakpoint

-- ─── app_user (identidade global; app_role vê só quem é da clínica ativa) ─────
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_user FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_user_auth_all ON app_user FOR ALL TO iris_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY app_user_read ON app_user FOR SELECT TO app_role USING (
  EXISTS (
    SELECT 1 FROM user_role r
    WHERE r.user_id = app_user.id
      AND r.clinic_id = current_setting('app.clinic_id')::uuid
  )
);
--> statement-breakpoint

-- ─── clinic ──────────────────────────────────────────────────────────────────
ALTER TABLE clinic ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE clinic FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY clinic_auth_all ON clinic FOR ALL TO iris_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY clinic_read ON clinic FOR SELECT TO app_role
  USING (id = current_setting('app.clinic_id')::uuid);
--> statement-breakpoint

-- ─── user_role ───────────────────────────────────────────────────────────────
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_role FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_role_auth_all ON user_role FOR ALL TO iris_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Escrita de user_role por app_role (convite) entra na Fase 1c; na 1b só
-- iris_auth escreve (seed/provisioning). app_role só lê a própria clínica.
CREATE POLICY user_role_read ON user_role FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id')::uuid);
```

- [ ] **Step 4: Aplicar a migração + criar o login user local**

Run:
```bash
pnpm db:migrate
psql "$MIGRATION_DATABASE_URL" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='iris_auth_login') THEN CREATE ROLE iris_auth_login LOGIN PASSWORD 'iris' IN ROLE iris_auth; END IF; END \$\$;"
```
Expected: migração aplicada; role de login criada (idempotente). Garantir que `AUTH_DATABASE_URL` no `.env` aponta pra `iris_auth_login`.

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `pnpm test:rls db/tests/rls_globais.int.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Confirmar que o RLS da Fase 1a não regrediu**

Run: `pnpm test:rls`
Expected: PASS (a suíte inteira, incluindo `src/db/rls.int.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0002_rls_globais.sql db/tests/rls_globais.int.test.ts
git commit -m "feat(db): RLS nas tabelas globais + role iris_auth (fecha item diferido Jules)"
```

---

### Task 3: Better-Auth usa `authDb` + route handler + client

**Files:**
- Modify: `src/auth/auth.ts:23` (troca `db` por `authDb`)
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/auth/client.ts`

**Interfaces:**
- Consumes: `authDb` de `@/db/client`; `auth` de `@/auth/auth`.
- Produces: rota `/api/auth/*`; `authClient` (com `signIn`, `signOut`, `useSession`) de `@/auth/client`.

- [ ] **Step 1: Apontar o adapter para `authDb`**

Em `src/auth/auth.ts`, trocar o import e o uso:

```ts
import { authDb } from "@/db/client";
// ...
  database: drizzleAdapter(authDb, {
```

Remover o import antigo de `db` (fica só `authDb`).

- [ ] **Step 2: Criar o route handler**

Criar `src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 3: Criar o auth client**

Criar `src/auth/client.ts`:

```ts
"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 4: Verificar build/typecheck**

Run: `pnpm typecheck && pnpm build`
Expected: PASS (rota `/api/auth/[...all]` compila; nenhuma tela ainda a consumir).

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.ts src/app/api/auth src/auth/client.ts
git commit -m "feat(auth): route handler Better-Auth + client; adapter usa authDb"
```

---

### Task 4: Regra de papel ativo (`papelAtivo`) — função pura + unit test (A2)

**Files:**
- Create: `src/auth/papel-ativo.ts`
- Test: `src/auth/papel-ativo.test.ts`

**Interfaces:**
- Produces: `type Papel = "coordenador" | "terapeuta" | "admin_recepcao"`; `papelAtivo(papeis: Papel[]): PapelResolvido` onde `type PapelResolvido = { papel: Papel } | { needsSelection: Papel[] }`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `src/auth/papel-ativo.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { papelAtivo } from "./papel-ativo";

describe("papelAtivo (A2 — múltiplos papéis na mesma clínica)", () => {
  test("papel único → usa esse papel", () => {
    expect(papelAtivo(["terapeuta"])).toEqual({ papel: "terapeuta" });
  });

  test("coordenador presente → coordenador vence (superset)", () => {
    expect(papelAtivo(["terapeuta", "coordenador"])).toEqual({
      papel: "coordenador",
    });
    expect(papelAtivo(["admin_recepcao", "coordenador", "terapeuta"])).toEqual({
      papel: "coordenador",
    });
  });

  test("combo disjunto admin_recepcao + terapeuta → precisa selecionar", () => {
    const r = papelAtivo(["admin_recepcao", "terapeuta"]);
    expect(r).toHaveProperty("needsSelection");
    if ("needsSelection" in r) {
      expect(r.needsSelection.sort()).toEqual(
        ["admin_recepcao", "terapeuta"].sort(),
      );
    }
  });

  test("papéis duplicados são deduplicados", () => {
    expect(papelAtivo(["terapeuta", "terapeuta"])).toEqual({
      papel: "terapeuta",
    });
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test src/auth/papel-ativo.test.ts`
Expected: FAIL ("papelAtivo is not a function" / módulo inexistente).

- [ ] **Step 3: Implementar**

Criar `src/auth/papel-ativo.ts`:

```ts
export type Papel = "coordenador" | "terapeuta" | "admin_recepcao";

export type PapelResolvido = { papel: Papel } | { needsSelection: Papel[] };

/**
 * Resolve o papel ATIVO dado o conjunto de papéis do usuário na clínica ativa.
 * A PK (user_id, clinic_id, papel) permite múltiplos papéis na mesma clínica.
 * - coordenador é superset (vê todo paciente + todo clínico) → se presente, vence.
 * - papel único → usa.
 * - combo disjunto (admin_recepcao + terapeuta, escopos diferentes) → seleção.
 */
export function papelAtivo(papeis: Papel[]): PapelResolvido {
  const unicos = [...new Set(papeis)];
  if (unicos.includes("coordenador")) return { papel: "coordenador" };
  if (unicos.length === 1) return { papel: unicos[0] };
  return { needsSelection: unicos };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `pnpm test src/auth/papel-ativo.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/auth/papel-ativo.ts src/auth/papel-ativo.test.ts
git commit -m "feat(auth): regra determinística de papel ativo (A2)"
```

---

### Task 5: `resolveTenant` + `getTenantContext` + integração (A1)

**Files:**
- Create: `src/auth/tenant.ts`
- Test: `src/auth/tenant.int.test.ts`

**Interfaces:**
- Consumes: `authDb` de `@/db/client`; `auth` de `@/auth/auth`; `papelAtivo`, `Papel` de `@/auth/papel-ativo`; `withTenant`, `TenantContext` de `@/db/rls`.
- Produces:
  - `type TenantResolution =`
    `{ status: "unauthenticated" }` |
    `{ status: "no_access" }` |
    `{ status: "needs_clinic_selection"; opcoes: { clinicId: string; nome: string }[] }` |
    `{ status: "needs_role_selection"; clinicId: string; papeis: Papel[] }` |
    `{ status: "ok"; ctx: TenantContext }`
  - `resolveTenant(headers: Headers, cookies: { activeClinic?: string; activeRole?: string }): Promise<TenantResolution>`
  - `getTenantContext(): Promise<TenantContext>` (server-only; lê headers/cookies do Next e redireciona conforme o status).

**Nota de segurança (A1):** `resolveTenant` NUNCA usa o cookie para `role`. O cookie só indica QUAL clínica/papel o usuário selecionou; a existência do papel é sempre re-verificada contra `user_role`.

- [ ] **Step 1: Escrever o teste de integração (falha primeiro)**

Criar `src/auth/tenant.int.test.ts`:

```ts
/**
 * Integração — resolveTenant (Fase 1b). Foca no invariante A1: cookie é
 * seleção, não concessão. Semeia user_role via superuser e chama resolveTenant
 * com uma sessão simulada (mockando auth.api.getSession).
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { resolveTenant } from "./tenant";
import { authSql, sql as appSql } from "@/db/client";
import { auth } from "@/auth/auth";

const hasDb =
  !!process.env.DATABASE_URL &&
  !!process.env.AUTH_DATABASE_URL &&
  !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_MULTI = "a0000000-0000-0000-0000-000000000010"; // papel em A e B
const U_SINGLE = "a0000000-0000-0000-0000-000000000011"; // papel só em A

let owner: ReturnType<typeof postgres>;
const H = new Headers();

function mockSession(userId: string | null) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(
    userId ? ({ user: { id: userId } } as never) : null,
  );
}

describe.skipIf(!hasDb)("resolveTenant — A1 cookie é seleção", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_MULTI}, 'Multi', 'multi@x.test'), (${U_SINGLE}, 'Single', 'single@x.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_MULTI}, ${CLINIC_A}, 'coordenador'),
      (${U_MULTI}, ${CLINIC_B}, 'terapeuta'),
      (${U_SINGLE}, ${CLINIC_A}, 'terapeuta')`;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  test("sem sessão → unauthenticated", async () => {
    mockSession(null);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("unauthenticated");
  });

  test("uma clínica, sem cookie → ok e seleciona automaticamente", async () => {
    mockSession(U_SINGLE);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.ctx.clinicId).toBe(CLINIC_A);
      expect(r.ctx.role).toBe("terapeuta");
    }
  });

  test("A1: cookie aponta clínica SEM papel → ignora, cai em seleção", async () => {
    mockSession(U_SINGLE); // só tem papel em A
    const r = await resolveTenant(H, { activeClinic: CLINIC_B });
    // U_SINGLE não tem papel em B → cookie ignorado; como só tem A, resolve A.
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.ctx.clinicId).toBe(CLINIC_A);
  });

  test("multi-clínica sem cookie → needs_clinic_selection", async () => {
    mockSession(U_MULTI);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("needs_clinic_selection");
    if (r.status === "needs_clinic_selection") {
      expect(r.opcoes.map((o) => o.clinicId).sort()).toEqual(
        [CLINIC_A, CLINIC_B].sort(),
      );
    }
  });

  test("multi-clínica com cookie válido → ok com o papel daquela clínica", async () => {
    mockSession(U_MULTI);
    const r = await resolveTenant(H, { activeClinic: CLINIC_B });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.ctx.clinicId).toBe(CLINIC_B);
      expect(r.ctx.role).toBe("terapeuta"); // papel de B, não o coordenador de A
    }
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test:rls src/auth/tenant.int.test.ts`
Expected: FAIL (módulo `./tenant` inexistente).

- [ ] **Step 3: Implementar `resolveTenant` + `getTenantContext`**

Criar `src/auth/tenant.ts`:

```ts
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { userRole, clinic } from "@/db/schema";
import { auth } from "@/auth/auth";
import { papelAtivo, type Papel } from "@/auth/papel-ativo";
import type { TenantContext } from "@/db/rls";

export const COOKIE_CLINICA = "iris_active_clinic";
export const COOKIE_PAPEL = "iris_active_role";

export type TenantResolution =
  | { status: "unauthenticated" }
  | { status: "no_access" }
  | { status: "needs_clinic_selection"; opcoes: { clinicId: string; nome: string }[] }
  | { status: "needs_role_selection"; clinicId: string; papeis: Papel[] }
  | { status: "ok"; ctx: TenantContext };

/**
 * Resolve clínica + papel ativos de forma SEGURA (A1): o cookie só indica a
 * SELEÇÃO do usuário; papel e pertencimento são sempre re-derivados de user_role.
 */
export async function resolveTenant(
  reqHeaders: Headers,
  ck: { activeClinic?: string; activeRole?: string },
): Promise<TenantResolution> {
  const session = await auth.api.getSession({ headers: reqHeaders });
  const userId = session?.user?.id;
  if (!userId) return { status: "unauthenticated" };

  // Papéis do usuário em TODAS as clínicas (bootstrap via iris_auth, pré-GUC).
  const vinculos = await authDb
    .select({ clinicId: userRole.clinicId, papel: userRole.papel, nome: clinic.nome })
    .from(userRole)
    .innerJoin(clinic, eq(clinic.id, userRole.clinicId))
    .where(eq(userRole.userId, userId));

  if (vinculos.length === 0) return { status: "no_access" };

  const clinicasIds = [...new Set(vinculos.map((v) => v.clinicId))];

  // Escolhe a clínica ativa: cookie SÓ vale se o usuário tem papel nela.
  let clinicId: string | undefined;
  if (ck.activeClinic && clinicasIds.includes(ck.activeClinic)) {
    clinicId = ck.activeClinic;
  } else if (clinicasIds.length === 1) {
    clinicId = clinicasIds[0];
  }
  if (!clinicId) {
    const nomePorId = new Map(vinculos.map((v) => [v.clinicId, v.nome]));
    return {
      status: "needs_clinic_selection",
      opcoes: clinicasIds.map((id) => ({ clinicId: id, nome: nomePorId.get(id)! })),
    };
  }

  // Papéis nessa clínica → papel ativo (A2). Cookie de papel também é só seleção.
  const papeis = vinculos
    .filter((v) => v.clinicId === clinicId)
    .map((v) => v.papel as Papel);
  const resolvido = papelAtivo(papeis);
  if ("needsSelection" in resolvido) {
    if (ck.activeRole && (resolvido.needsSelection as string[]).includes(ck.activeRole)) {
      return { status: "ok", ctx: { clinicId, userId, role: ck.activeRole as Papel } };
    }
    return { status: "needs_role_selection", clinicId, papeis: resolvido.needsSelection };
  }
  return { status: "ok", ctx: { clinicId, userId, role: resolvido.papel } };
}

/**
 * Açúcar server-only p/ pages/actions: resolve e redireciona conforme o status.
 * Retorna sempre um TenantContext válido (ou nunca retorna — redireciona).
 */
export async function getTenantContext(): Promise<TenantContext> {
  const ck = await cookies();
  const r = await resolveTenant(await headers(), {
    activeClinic: ck.get(COOKIE_CLINICA)?.value,
    activeRole: ck.get(COOKIE_PAPEL)?.value,
  });
  switch (r.status) {
    case "ok":
      return r.ctx;
    case "unauthenticated":
      redirect("/login");
    case "no_access":
      redirect("/sem-acesso");
    case "needs_clinic_selection":
      redirect("/selecionar-clinica");
    case "needs_role_selection":
      redirect("/selecionar-papel");
  }
}
```

Nota: `TenantContext.role` é `UserRole` (`"terapeuta" | "coordenador" | "admin_recepcao"`) — idêntico a `Papel`. O cast `as Papel` é seguro porque o valor veio de `user_role` (enum do banco).

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `pnpm test:rls src/auth/tenant.int.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/tenant.ts src/auth/tenant.int.test.ts
git commit -m "feat(auth): resolveTenant + getTenantContext (A1 cookie é seleção)"
```

---

### Task 6: `provisionUser` (upsert por email) + integração (A6)

**Files:**
- Create: `src/auth/provisioning.ts`
- Test: `src/auth/provisioning.int.test.ts`

**Interfaces:**
- Consumes: `authDb` de `@/db/client`; `auth` de `@/auth/auth`; `appUser`, `userRole` de `@/db/schema`; `Papel` de `@/auth/papel-ativo`.
- Produces: `provisionUser(input: { email: string; nome: string; senha: string; clinicId: string; papel: Papel }): Promise<{ userId: string }>`.

- [ ] **Step 1: Escrever o teste de integração (falha primeiro)**

Criar `src/auth/provisioning.int.test.ts`:

```ts
/**
 * Integração — provisionUser (Fase 1b, A6). Upsert por email: um email que já
 * existe recebe novo user_role, sem duplicar app_user.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { provisionUser } from "./provisioning";
import { authDb, authSql, sql as appSql } from "@/db/client";
import { appUser, userRole } from "@/db/schema";

const hasDb =
  !!process.env.DATABASE_URL &&
  !!process.env.AUTH_DATABASE_URL &&
  !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("provisionUser — A6 upsert por email", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, auth_account RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
  });
  afterAll(async () => {
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  test("cria user novo + user_role", async () => {
    const { userId } = await provisionUser({
      email: "novo@x.test", nome: "Novo", senha: "senha-forte-123",
      clinicId: CLINIC_A, papel: "coordenador",
    });
    const users = await authDb.select().from(appUser).where(eq(appUser.email, "novo@x.test"));
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(userId);
    const papeis = await authDb.select().from(userRole).where(eq(userRole.userId, userId));
    expect(papeis).toHaveLength(1);
  });

  test("email existente NÃO duplica app_user; anexa novo user_role", async () => {
    const { userId } = await provisionUser({
      email: "novo@x.test", nome: "Novo", senha: "ignorada",
      clinicId: CLINIC_B, papel: "terapeuta",
    });
    const users = await authDb.select().from(appUser).where(eq(appUser.email, "novo@x.test"));
    expect(users).toHaveLength(1); // ainda 1 app_user
    const papeis = await authDb.select().from(userRole).where(eq(userRole.userId, userId));
    expect(papeis.map((p) => p.clinicId).sort()).toEqual([CLINIC_A, CLINIC_B].sort());
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test:rls src/auth/provisioning.int.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

Criar `src/auth/provisioning.ts`:

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { appUser, userRole } from "@/db/schema";
import { auth } from "@/auth/auth";
import type { Papel } from "@/auth/papel-ativo";

export type ProvisionInput = {
  email: string;
  nome: string;
  senha: string;
  clinicId: string;
  papel: Papel;
};

/**
 * Provisiona um usuário numa clínica (seed inicial e, na Fase 1c, convite).
 * A6: upsert por email — email já existente recebe novo user_role sem duplicar
 * app_user. Escreve via authDb (iris_auth). Não há UI de convite na Fase 1b.
 */
export async function provisionUser(
  input: ProvisionInput,
): Promise<{ userId: string }> {
  const existente = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, input.email))
    .limit(1);

  let userId: string;
  if (existente.length > 0) {
    userId = existente[0].id;
  } else {
    // Cria a credencial pelo Better-Auth (hash de senha + auth_account).
    const created = await auth.api.signUpEmail({
      body: { email: input.email, password: input.senha, name: input.nome },
    });
    userId = created.user.id;
  }

  await authDb
    .insert(userRole)
    .values({ userId, clinicId: input.clinicId, papel: input.papel })
    .onConflictDoNothing();

  return { userId };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `pnpm test:rls src/auth/provisioning.int.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/auth/provisioning.ts src/auth/provisioning.int.test.ts
git commit -m "feat(auth): provisionUser upsert por email (A6)"
```

---

### Task 7: Script de seed de clínica

**Files:**
- Create: `scripts/seed-clinic.ts`
- Modify: `package.json` (script `seed:clinic`)

**Interfaces:**
- Consumes: `provisionUser` de `@/auth/provisioning`; `authDb`, `authSql` de `@/db/client`; `clinic` de `@/db/schema`.

- [ ] **Step 1: Escrever o script**

Criar `scripts/seed-clinic.ts`:

```ts
/**
 * Seed de bootstrap: cria uma clínica + o 1º coordenador (com credencial
 * Better-Auth). Idempotente por nome de clínica e email. Rodar com:
 *   pnpm seed:clinic "Clínica Exemplo" coord@exemplo.test "Senha Forte 123"
 */
import { eq } from "drizzle-orm";
import { authDb, authSql } from "@/db/client";
import { clinic } from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";

async function main() {
  const [nome, email, senha, nomeCoord = "Coordenador(a)"] = process.argv.slice(2);
  if (!nome || !email || !senha) {
    throw new Error('Uso: pnpm seed:clinic "<clínica>" <email> <senha> [nome]');
  }

  const existente = await authDb.select().from(clinic).where(eq(clinic.nome, nome)).limit(1);
  const [c] =
    existente.length > 0
      ? existente
      : await authDb.insert(clinic).values({ nome }).returning();

  const { userId } = await provisionUser({
    email, nome: nomeCoord, senha, clinicId: c.id, papel: "coordenador",
  });

  console.log(`Clínica "${nome}" (${c.id}) + coordenador ${email} (${userId}) prontos.`);
  await authSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar o script ao package.json**

Em `package.json`, dentro de `"scripts"`, adicionar:

```json
"seed:clinic": "tsx scripts/seed-clinic.ts",
```

Se `tsx` não estiver instalado, rodar: `pnpm add -D tsx`.

- [ ] **Step 3: Rodar o seed contra o DB local**

Run: `pnpm seed:clinic "Clínica Piloto" coord@piloto.test "Senha Forte 123"`
Expected: log confirmando clínica + coordenador criados. Rodar de novo → idempotente (sem duplicar).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-clinic.ts package.json pnpm-lock.yaml
git commit -m "feat(scripts): seed de clínica + 1º coordenador"
```

---

### Task 8: Componentes de design system — `Input`, `Field`, `Form`

**Files:**
- Create: `src/components/ui/input.tsx`, `src/components/ui/input.stories.tsx`
- Create: `src/components/ui/field.tsx`, `src/components/ui/field.stories.tsx`
- Create: `src/components/ui/form.tsx`
- Modify: `src/components/ui/a11y.test.tsx` (incluir os novos no gate axe)

**Interfaces:**
- Produces: `<Input>` (input estilizado por tokens, estados default/focus/erro/disabled); `<Field label htmlFor error>` (label + slot + mensagem de erro acessível via `aria-describedby`); `<Form>` (wrapper `<form>` com `onSubmit` que trata submitting/erro).

**Nota:** seguir o padrão dos componentes existentes (`button.tsx`, `card.tsx`) — tokens do `globals.css`, `cn` de `@/lib/cn`, contraste AAA, `forced-colors`. Ler `button.tsx` e `button.stories.tsx` antes de escrever para copiar convenção de props/variantes/story.

- [ ] **Step 1: Ler os componentes existentes p/ convenção**

Run: (ler) `src/components/ui/button.tsx`, `src/components/ui/button.stories.tsx`, `src/components/ui/card.tsx`, `src/lib/cn.ts`.
Expected: entender padrão de `cn`, forwardRef, variantes, tokens CSS e formato de story (CSF3 + matriz de estados).

- [ ] **Step 2: Implementar `Input`**

Criar `src/components/ui/input.tsx` seguindo o padrão do `button.tsx` (forwardRef sobre `<input>`, classes de token, estado de erro via prop `aria-invalid`, foco visível AAA, `forced-colors: active`). Props: estende `React.InputHTMLAttributes<HTMLInputElement>`.

- [ ] **Step 3: Implementar `Field`**

Criar `src/components/ui/field.tsx`: recebe `label: string`, `htmlFor: string`, `error?: string`, `children`. Renderiza `<label>` associado, o `children` (o input), e — quando `error` — um `<p role="alert" id="{htmlFor}-error">` com a mensagem; o input consumidor liga `aria-describedby` a esse id. Contraste do texto de erro AAA sobre o fundo do modo ativo.

- [ ] **Step 4: Implementar `Form`**

Criar `src/components/ui/form.tsx`: wrapper `<form>` client component que recebe `action` (server action) ou `onSubmit`; expõe estado `submitting` e renderiza um `<Alerta>` (componente existente) quando recebe `error?: string`. Reusar `Alerta` de `@/components/ui/alert`.

- [ ] **Step 5: Escrever as stories (matriz de estados)**

Criar `input.stories.tsx` e `field.stories.tsx` (CSF3) com stories: `Default`, `ComValor`, `Foco`, `Erro`, `Desabilitado` (Input); `SemErro`, `ComErro` (Field). Espelhar a estrutura de `button.stories.tsx`.

- [ ] **Step 6: Incluir no gate de acessibilidade**

Em `src/components/ui/a11y.test.tsx`, adicionar os novos componentes ao teste axe existente (seguir exatamente o padrão já usado para Botão/Card/Alerta no arquivo).

- [ ] **Step 7: Rodar testes + storybook build**

Run: `pnpm test && pnpm build-storybook`
Expected: PASS (axe 0 violações nos novos componentes; Storybook builda).

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/input.stories.tsx src/components/ui/field.tsx src/components/ui/field.stories.tsx src/components/ui/form.tsx src/components/ui/a11y.test.tsx
git commit -m "feat(ds): componentes Input, Field e Form (Storybook + a11y)"
```

---

### Task 9: Tela de login

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: `signIn` de `@/auth/client`; `Input`/`Field`/`Form` (Task 8); `Botão` de `@/components/ui/button`.

- [ ] **Step 1: Layout do grupo (auth)**

Criar `src/app/(auth)/layout.tsx` — layout centralizado simples (usa tokens; sem hardcode de componente), envolvendo `children`. Sem guarda de sessão (é a área pública).

- [ ] **Step 2: Página de login**

Criar `src/app/(auth)/login/page.tsx` (client component). Formulário email+senha via `Form`/`Field`/`Input`/`Botão`. No submit chama `signIn.email({ email, password })`; em erro mostra a mensagem no `Form`; em sucesso `router.push("/")`. Copy em pt-BR ("Entrar", "E-mail", "Senha", "E-mail ou senha inválidos.").

- [ ] **Step 3: Verificar build/typecheck/lint**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 4: Verificação manual (smoke)**

Run: `pnpm dev` e, em outro terminal, garantir DB migrado + seed rodado. Abrir `http://localhost:3000/login`, logar com o coordenador semeado.
Expected: login bem-sucedido redireciona para `/` (que ainda pode 404/redirecionar até a Task 11 — ok neste ponto).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)"
git commit -m "feat(ui): tela de login (Better-Auth + design system)"
```

---

### Task 10: Telas de seleção de clínica e de papel + escrita do cookie

**Files:**
- Create: `src/app/(auth)/selecionar-clinica/page.tsx`
- Create: `src/app/(auth)/selecionar-papel/page.tsx`
- Create: `src/app/(auth)/sem-acesso/page.tsx`
- Create: `src/auth/actions.ts` (server actions que gravam os cookies)

**Interfaces:**
- Consumes: `resolveTenant` de `@/auth/tenant`; `COOKIE_CLINICA`/`COOKIE_PAPEL` de `@/auth/tenant`.
- Produces: server actions `definirClinicaAtiva(clinicId: string)` e `definirPapelAtivo(papel: string)` que setam cookie httpOnly + `redirect("/")`.

**Nota (A1):** o cookie é apenas seleção. As actions setam o valor cru; `resolveTenant` re-valida contra `user_role` a cada request. Cookie `httpOnly`, `sameSite: "lax"`, `secure` em produção. Não é preciso assinar (a integridade não é usada para autorização).

- [ ] **Step 1: Server actions de seleção**

Criar `src/auth/actions.ts`:

```ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_CLINICA, COOKIE_PAPEL } from "@/auth/tenant";

const base = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function definirClinicaAtiva(clinicId: string) {
  const ck = await cookies();
  ck.set(COOKIE_CLINICA, clinicId, base);
  ck.delete(COOKIE_PAPEL); // troca de clínica reseta o papel selecionado
  redirect("/");
}

export async function definirPapelAtivo(papel: string) {
  const ck = await cookies();
  ck.set(COOKIE_PAPEL, papel, base);
  redirect("/");
}
```

- [ ] **Step 2: Página de seleção de clínica**

Criar `src/app/(auth)/selecionar-clinica/page.tsx` (server component): chama `resolveTenant(await headers(), { activeClinic: ... })`; se `status !== "needs_clinic_selection"` redireciona para `/`; senão renderiza a lista `opcoes` como botões que chamam `definirClinicaAtiva(clinicId)`. Copy pt-BR ("Selecione a clínica").

- [ ] **Step 3: Página de seleção de papel**

Criar `src/app/(auth)/selecionar-papel/page.tsx` (server component): análogo, para `needs_role_selection`; botões chamando `definirPapelAtivo(papel)`. Rótulos pt-BR por papel ("Recepção", "Terapeuta").

- [ ] **Step 4: Página sem-acesso**

Criar `src/app/(auth)/sem-acesso/page.tsx`: mensagem estática pt-BR ("Sua conta ainda não tem acesso a nenhuma clínica. Fale com o coordenador.") + botão de sair (`signOut`).

- [ ] **Step 5: Verificar build/typecheck/lint**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/selecionar-clinica" "src/app/(auth)/selecionar-papel" "src/app/(auth)/sem-acesso" src/auth/actions.ts
git commit -m "feat(ui): seleção de clínica/papel ativos + cookies de seleção"
```

---

### Task 11: Shell protegido `(app)` + switcher

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/page.tsx`
- Create: `src/components/app/clinic-switcher.tsx`
- Modify: `src/app/page.tsx` (redireciona `/` conforme sessão — ver nota)

**Interfaces:**
- Consumes: `getTenantContext` de `@/auth/tenant`; `resolveTenant` (para listar opções no switcher); `definirClinicaAtiva` de `@/auth/actions`; `signOut` de `@/auth/client`.

**Nota de roteamento:** a raiz `/` deve cair no shell `(app)`. Como `(auth)` e `(app)` são route groups (não afetam o path), definir a home dentro de `(app)` e remover/ajustar o `src/app/page.tsx` atual (a home institucional da Fase 0.5) para viver noutra rota (ex.: mover para `(marketing)` fora de escopo, ou simplesmente deixar `(app)/page.tsx` responder por `/`). Confirmar que não há duas `page.tsx` resolvendo `/`.

- [ ] **Step 1: Layout protegido**

Criar `src/app/(app)/layout.tsx` (server component): chama `const ctx = await getTenantContext()` (redireciona sozinho se não-ok). Renderiza um header com o nome da clínica ativa + `<ClinicSwitcher>` + botão sair, e `children`. Passa `ctx` para o switcher via props (clinicId ativo).

- [ ] **Step 2: Clinic switcher**

Criar `src/components/app/clinic-switcher.tsx` (client): recebe a lista de clínicas do usuário + a ativa; ao trocar, chama a server action `definirClinicaAtiva(clinicId)`. Se o usuário tem só 1 clínica, renderiza o nome sem dropdown. Usar componentes do design system (sem hardcode).

Para obter a lista, o layout (server) chama `resolveTenant` uma vez e passa as opções; ou, quando `status: "ok"`, faz uma consulta leve via `authDb` das clínicas do usuário. Implementar um helper `listarClinicasDoUsuario(userId)` em `src/auth/tenant.ts` e reusar.

- [ ] **Step 3: Home do shell**

Criar `src/app/(app)/page.tsx`: dashboard placeholder que confirma o tenant resolvido — saúda o usuário e mostra clínica + papel ativos (`await getTenantContext()`). Conteúdo real vem nas fases 1c+.

- [ ] **Step 4: Resolver conflito de `/`**

Ajustar `src/app/page.tsx` conforme a nota de roteamento (garantir uma única `page.tsx` para `/`). Rodar `pnpm build` e confirmar ausência de erro de rota duplicada.

- [ ] **Step 5: Verificar build/typecheck/lint + smoke manual**

Run: `pnpm typecheck && pnpm lint && pnpm build`, depois `pnpm dev`.
Expected: PASS. Logar → cair no shell; usuário multi-clínica vê seleção e depois o switcher troca o escopo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)" src/components/app/clinic-switcher.tsx src/app/page.tsx src/auth/tenant.ts
git commit -m "feat(ui): shell protegido + switcher de clínica"
```

---

### Task 12: E2E de login (Playwright)

**Files:**
- Create: `e2e/login.spec.ts` (ou o diretório que `playwright.config` já usa — confirmar)

**Interfaces:**
- Consumes: app rodando + DB semeado (coordenador de clínica única).

- [ ] **Step 1: Confirmar a config do Playwright**

Run: (ler) `playwright.config.ts`
Expected: descobrir `testDir`, `webServer` e `baseURL`. Se `webServer` não sobe o app + não há seed, ajustar o teste para assumir app em `NEXT_PUBLIC_APP_URL` e um usuário semeado conhecido (documentar o pré-requisito no topo do spec).

- [ ] **Step 2: Escrever o teste**

Criar `e2e/login.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Pré-requisito: DB migrado + `pnpm seed:clinic "Clínica E2E" e2e@iris.test "Senha E2E 123"`.
test("login de coordenador cai no shell protegido", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("e2e@iris.test");
  await page.getByLabel("Senha").fill("Senha E2E 123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Clínica E2E")).toBeVisible();
});
```

- [ ] **Step 3: Rodar o E2E**

Run: `pnpm seed:clinic "Clínica E2E" e2e@iris.test "Senha E2E 123"` e depois `pnpm test:e2e`
Expected: PASS (1 teste).

- [ ] **Step 4: Commit**

```bash
git add e2e/login.spec.ts
git commit -m "test(e2e): login de coordenador → shell protegido"
```

---

### Task 13: Atualizar BACKLOG + abrir PR

**Files:**
- Modify: `BACKLOG.md` (progresso da Fase 1, sub-bloco 1b)

**Interfaces:** nenhuma (documentação + PR).

- [ ] **Step 1: Registrar o progresso no BACKLOG**

Em `BACKLOG.md`, no item "Fase 1", adicionar um sub-bloco **"Progresso (Fase 1b — fundação auth/tenant)"** resumindo: duas conexões (`iris_auth` NOBYPASSRLS + `app_role`), RLS das globais fechando o item diferido das 4 rodadas Jules, resolução sessão→TenantContext (A1 cookie é seleção), papel ativo determinístico (A2), provisionamento upsert (A6), login + switcher, seed. Marcar explicitamente que **convite UI e cadastro ficaram para a Fase 1c** e **agenda+check-in (tabela `session`) para a 1d**. Referenciar o item aberto de RLS global agora RESOLVIDO.

- [ ] **Step 2: Rodar a suíte completa antes do PR**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:rls && pnpm build`
Expected: tudo PASS.

- [ ] **Step 3: Commit + push + PR**

```bash
git add BACKLOG.md
git commit -m "docs: registra progresso da Fase 1b no backlog"
git push -u origin fase-1b-fundacao-auth-tenant
```

Abrir PR com `gh pr create` — descrição **com contexto de arquitetura para o Jules** (ele só vê o diff): explicar as duas conexões/roles, por que `iris_auth` é NOBYPASSRLS, por que o cookie não é autorização (A1), e que o item de RLS global das 4 rodadas anteriores está sendo FECHADO aqui. Corpo do PR termina com:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 4: Atualizar o grafo (regra do projeto)**

Run: `graphify update .`
Expected: grafo reflete o código novo.

---

## Self-Review

**Spec coverage:**
- Duas conexões (crux) → Task 1 (client) + Task 2 (migração/grants). ✅
- RLS tabelas globais (auth_* revoke, app_user/clinic/user_role scoped, `TO iris_auth`) → Task 2. ✅
- Route handler + client Better-Auth → Task 3. ✅
- resolveTenant/getTenantContext + clínica ativa + switcher → Tasks 5, 11. ✅
- Papel ativo determinístico (A2) → Task 4. ✅
- Componentes DS novos (Input/Field/Form) → Task 8. ✅
- Login + seleção clínica/papel + shell → Tasks 9, 10, 11. ✅
- Provisioning (seed + função) → Tasks 6, 7. ✅
- Testes (RLS globais, resolveTenant A1, provisioning A6, papel ativo unit, e2e login) → Tasks 2,4,5,6,12. ✅
- Teste de não-recursão → Task 2 Step 1 (4º teste). ✅
- A1 (cookie seleção), A2 (papel), A3 (NOBYPASSRLS), A6 (upsert) → cobertos como invariantes testados. ✅
- Fora de escopo (convite UI=1c, agenda=1d) → registrado em Task 13. ✅

**Placeholder scan:** Tasks 8, 9, 10 Step 2/3, 11 descrevem componentes seguindo "o padrão de button.tsx" em vez de código literal completo — isto é deliberado (o design system tem convenção própria de tokens/variantes que o implementador DEVE ler e copiar; reproduzir CSS de token aqui divergiria da fonte real). Cada uma nomeia arquivo exato, props exatas, estados exigidos e o arquivo-modelo a copiar. Server actions, tenant, provisioning, migração e testes têm código literal completo.

**Type consistency:** `Papel` (papel-ativo.ts) ≡ `UserRole`/`TenantContext.role` (rls.ts) — mesma união de strings; cast documentado na Task 5. `resolveTenant(headers, cookies)` — assinatura idêntica em Interfaces (Task 5) e chamadas (Tasks 10, 11). `provisionUser` input idêntico em Tasks 6 e 7. `COOKIE_CLINICA`/`COOKIE_PAPEL` definidos na Task 5, consumidos na Task 10. `definirClinicaAtiva`/`definirPapelAtivo` definidos na Task 10, consumidos na Task 11.

**Riscos de execução conhecidos:**
- Better-Auth `auth.api.signUpEmail` / `getSession` — confirmar a assinatura exata na versão 1.6.23 ao implementar (Tasks 5, 6); a forma `{ body: {...} }` / `{ headers }` é a de 1.x, mas validar contra os tipos.
- `playwright.config.ts` pode não subir o app nem semear — Task 12 Step 1 obriga confirmar antes de escrever o teste.
- Conflito de `/` entre a home da Fase 0.5 e o shell (app) — tratado explicitamente na Task 11 Step 4.
