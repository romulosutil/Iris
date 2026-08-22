# Resend Webhook (Bounces/Complaints) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Resend webhook endpoint (`src/app/api/webhooks/resend/route.ts` and alias `src/app/api/hooks/resend/route.ts`) to receive and verify Svix-signed delivery, bounce, and complaint events for transactional emails, logging structured metadata without sensitive PII.

**Architecture:** Next.js Route Handlers (`POST`) validating Svix signatures (`svix-id`, `svix-timestamp`, `svix-signature`) using the `svix` library against `RESEND_WEBHOOK_SECRET`. Unauthenticated requests yield 401 with zero logs; valid events yield 200 and structured console logs containing only message ID, event type, and timestamps (zero PII/clinical data).

**Tech Stack:** Next.js 16 App Router, TypeScript, `svix` 2.x, Vitest.

---

### Task 1: Webhook Helper & Route Handler Logic (TDD)

**Files:**

- Create: `src/lib/email/webhook.ts`
- Create: `src/lib/email/webhook.test.ts`
- Create: `src/app/api/webhooks/resend/route.ts`
- Create: `src/app/api/webhooks/resend/route.test.ts`
- Create: `src/app/api/hooks/resend/route.ts`

- [ ] **Step 1: Write failing tests for webhook signature verification and event handling**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/lib/email/webhook.ts` and route handlers**
- [ ] **Step 4: Run tests to verify they pass**

---

### Task 2: Environment Documentation & Reference Updates

**Files:**

- Modify: `.env.example`
- Modify: `BACKLOG.md`
- Modify: `checkpoint.md`
- Modify: `docs/GO_LIVE.md`

- [ ] **Step 1: Document `RESEND_WEBHOOK_SECRET` in `.env.example`**
- [ ] **Step 2: Update `BACKLOG.md`, `checkpoint.md`, and `docs/GO_LIVE.md`**
- [ ] **Step 3: Run full verification suite (`pnpm typecheck`, `pnpm lint`, `pnpm test`)**
- [ ] **Step 4: Update knowledge graph (`graphify update .`)**

---

### Task 3: Git Commit, Push & PR

- [ ] **Step 1: Commit and push changes on branch `feat/383-resend-webhook-bounces-complaints`**
- [ ] **Step 2: Create GitHub Pull Request linking issue #383**
