# Super Admin Backoffice (`/benjamin`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of the Super Admin Backoffice module under the obscured route `/benjamin` (harden against brute-force/discovery), providing MRR, clinic management, and integration health metrics with strict Zero-Knowledge LGPD compliance.

**Architecture:** Route `/benjamin/*` protected by `exigirSuperAdmin()` server guard returning `notFound()` for unauthorized access. Data queries run via system connection (`authDb`) aggregating cross-tenant metrics without exposing patient clinical data or PII. Clean Next.js 16 App Router structure using Iris design system tokens.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Drizzle ORM, Postgres, Tailwind CSS v4.

---

### Task 1: Database Migration & Schema for Super Admin Flag

**Files:**

- Create: `db/migrations/0072_super_admin_role.sql`
- Modify: `db/migrations/meta/_journal.json`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Write hand-crafted SQL migration `0072_super_admin_role.sql`**
      Add `is_super_admin` boolean column to `app_user` with default `false`.

- [ ] **Step 2: Register migration in `_journal.json`**
      Add entry `idx: 72`, `when: 1785422581000`, `tag: "0072_super_admin_role"`.

- [ ] **Step 3: Update `src/db/schema.ts`**
      Add `isSuperAdmin: boolean("is_super_admin").notNull().default(false)` to `appUser` schema.

- [ ] **Step 4: Verify migration & typecheck**
      Run: `pnpm typecheck`
      Expected: PASS

---

### Task 2: Super Admin Guard & Auth Helpers

**Files:**

- Create: `src/auth/super-admin.ts`
- Create: `src/auth/super-admin.test.ts`

- [ ] **Step 1: Write failing unit test for `exigirSuperAdmin`**
      Test unauthenticated user returns 404 (notFound), non-super admin returns 404, super admin user succeeds.

- [ ] **Step 2: Run test to verify failure**
      Run: `pnpm test src/auth/super-admin.test.ts`

- [ ] **Step 3: Implement `src/auth/super-admin.ts`**
      Implement `exigirSuperAdmin()` using `auth.api.getSession` and `authDb` query on `appUser.isSuperAdmin`. Call `notFound()` on failure.

- [ ] **Step 4: Run test to verify pass**
      Run: `pnpm test src/auth/super-admin.test.ts`
      Expected: PASS

---

### Task 3: Super Admin Data Layer & Queries (Zero-Knowledge LGPD)

**Files:**

- Create: `src/app/(admin)/benjamin/queries.ts`
- Create: `src/app/(admin)/benjamin/queries.int.test.ts`

- [ ] **Step 1: Write integration tests for `queries.ts`**
      Verify KPI calculation (MRR, Clinics, Trial, Exempt), Clinic List search/sort, and Webhook/Integration Health. Assert no patient clinical data or patient names are exposed.

- [ ] **Step 2: Run test to verify failure**
      Run: `pnpm test:rls src/app/(admin)/benjamin/queries.int.test.ts`

- [ ] **Step 3: Implement `queries.ts`**
      Write optimized Postgres queries using `authDb` to calculate MRR via `calcularMensalidadeCentavos`, count active patients per clinic, fetch clinic owner contact info, and retrieve webhook events.

- [ ] **Step 4: Run test to verify pass**
      Run: `pnpm test:rls src/app/(admin)/benjamin/queries.int.test.ts`
      Expected: PASS

---

### Task 4: UI Components & Route Setup (`/benjamin`)

**Files:**

- Create: `src/app/(admin)/benjamin/layout.tsx`
- Create: `src/app/(admin)/benjamin/page.tsx`
- Create: `src/app/(admin)/benjamin/clinicas/page.tsx`
- Create: `src/app/(admin)/benjamin/saude/page.tsx`
- Create: `src/components/admin/admin-nav.tsx`
- Create: `src/components/admin/kpi-card.tsx`

- [ ] **Step 1: Implement Layout & Navigation**
      `layout.tsx` executes `exigirSuperAdmin()`. Renders top nav with links for Visão Geral (`/benjamin`), Clínicas (`/benjamin/clinicas`), Saúde (`/benjamin/saude`).

- [ ] **Step 2: Implement Visão Geral Dashboard (`/benjamin/page.tsx`)**
      Displays main KPI Cards (Estimated MRR, Active Clinics, Total Active Patients, Clinics in Trial, Exempt Clinics) and high-level summary.

- [ ] **Step 3: Implement Tabela de Clínicas (`/benjamin/clinicas/page.tsx`)**
      Search & filter by clinic name/owner, sorting by revenue/date, badges for status (Trial, Ativa, Inadimplente, Isenta), active patient counts, estimated monthly BRL.

- [ ] **Step 4: Implement Saúde & Integrações (`/benjamin/saude/page.tsx`)**
      Asaas Webhooks status monitor (last events, processing timestamps, failures) and Resend email status.

- [ ] **Step 5: Verify build & UI typecheck**
      Run: `pnpm typecheck`

---

### Task 5: Adversarial Tech Lead Audits & Verification

- [ ] **Adversarial Tech Lead 1 (Security & LGPD Audit):**
  - Verify `/benjamin` obscurity & `notFound()` behavior.
  - Audit zero patient PII / zero clinical notes exposure in queries.
  - Verify RBAC platform level separation from clinic roles.

- [ ] **Adversarial Tech Lead 2 (Architecture & System Integrity Audit):**
  - Verify hand-crafted migration `0072_super_admin_role.sql` and `_journal.json`.
  - Run full lint (`pnpm lint`), typecheck (`pnpm typecheck`), and tests (`pnpm test`).

---

### Task 6: Git Branch & Pull Request Creation

- [ ] **Step 1: Commit all changes to branch `feat/issue-184-super-admin-benjamin`**
- [ ] **Step 2: Push branch to GitHub**
- [ ] **Step 3: Open Pull Request referencing Issue #184**
