# Fase 2 — Plano 2: Diário + Consolidação + Fila + Costura de Extração Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o loop do dia do terapeuta — captura de diário (texto + áudio local), consolidação (que popula `numero_sequencial_paciente` e dispara a extração via costura), e a Fila de pendências — com a extração isolada atrás de um `ExtractionProvider` (stub para clínicas demo, null para produção).

**Architecture:** Server Actions com o padrão da 1d (`withTenant(ctx, tx => ...)` + `requireRole` + Zod). A extração fica atrás da interface `ExtractionProvider` (uma responsabilidade), roteada por `clinic.is_demo`. UI mobile-first com o Design System; áudio grava/guarda local (MediaRecorder + IndexedDB), sem backend de upload. Fila de pendências lê `session_note`/`extraction`.

**Tech Stack:** Next.js App Router · Drizzle · Postgres RLS · Vitest (unit `vitest.config.ts` / int `vitest.integration.config.ts`) · Playwright (E2E) · MediaRecorder + IndexedDB (áudio local) · pnpm.

## Global Constraints

- Server Actions: núcleo testável recebe `ctx: TenantContext` como 1º parâmetro; nunca resolve tenant internamente. Abrir DB só via `withTenant(ctx, tx => ...)` (`@/db/rls`). Wrappers `*Action(_prev, formData)` para `useActionState`, resolvem `ctx = await getTenantContext()`, tratam `RoleError`, chamam `revalidatePath`.
- `requireRole(ctx, ...papeis)` no topo de ações de escrita. Escrita de diário (captura/consolidação) = **terapeuta dono da sessão** (recepção/coordenação não escrevem nota clínica).
- Validação de entrada com Zod (`safeParse`, retorna `{ error: parsed.error.issues[0]!.message }`).
- Guardrail #6: **nenhum código chama LLM nesta fase**. `DemoStubProvider` gera dados fake determinísticos; `NullProvider` não gera nada.
- Guardrail #1: recepção sem dado clínico (já garantido pela RLS da 0006).
- Áudio: grava e guarda LOCAL (IndexedDB), estado `rascunho_local`, sem upload. UX obrigatória: ouvir, descartar (apaga rascunho local), regravar antes de confirmar.
- `numero_sequencial_paciente` populado na consolidação (1ª `nota_consolidada` da sessão): próximo inteiro por paciente. Idempotente (reconsolidar não duplica).
- Design System: componentes de `@/components/ui/*` (Form/Field/Input/Tabs/Chip/Button/Alert/Card). Toda tela nova passa no gate a11y (axe, zero violação).
- pt-BR em copy/testes/comentários. Conventional Commits (escopo `fase-2`).
- `pnpm` via `"/c/Program Files/nodejs/corepack" pnpm <cmd>` no ambiente de execução; testes de integração exigem `DATABASE_URL`+`MIGRATION_DATABASE_URL` (auto-skip sem eles).

**Padrões de referência no código (ler antes):** `src/app/(app)/agenda/actions.ts` (estrutura de action), `src/app/(app)/agenda/actions.int.test.ts` (harness int), `src/app/(app)/agenda/a11y.test.tsx` (gate axe), `db/tests/fase2-rls.int.test.ts` (seed das tabelas F2), `src/db/rls.ts` (`withTenant`), `src/auth/require-role.ts`, `src/auth/tenant.ts` (`getTenantContext`).

---

## File Structure

- `src/lib/extraction/provider.ts` — **Create**: interface `ExtractionProvider`, `resolveProvider(clinic)`, tipos.
- `src/lib/extraction/demo-stub-provider.ts` — **Create**: `DemoStubProvider` (extrações fake determinísticas).
- `src/lib/extraction/null-provider.ts` — **Create**: `NullProvider` (marca pendente).
- `src/lib/extraction/provider.test.ts` — **Create**: unit do roteamento + stub.
- `src/app/(app)/diario/[sessionId]/actions.ts` — **Create**: `capturarDiario`, `corrigirEscopoProtocolo`, `registrarAudioLocal`, `consolidarSessao`.
- `src/app/(app)/diario/[sessionId]/actions.int.test.ts` — **Create**: RLS/integração das actions.
- `src/app/(app)/diario/[sessionId]/page.tsx` — **Create**: tela de captura (Server Component + forms).
- `src/app/(app)/diario/[sessionId]/captura-form.tsx` — **Create**: form texto/áudio (client).
- `src/app/(app)/diario/[sessionId]/audio-local.tsx` — **Create**: gravador de áudio local (client).
- `src/lib/audio/local-store.ts` — **Create**: wrapper IndexedDB (guardar/ler/apagar blob).
- `src/app/(app)/diario/[sessionId]/consolidar-form.tsx` — **Create**: form da nota consolidada (client).
- `src/app/(app)/pendencias/page.tsx` — **Create**: Fila de pendências (Server Component).
- `src/app/(app)/pendencias/queries.ts` — **Create**: consultas da fila (capturas a consolidar, extração pendente, sugestões demo).
- `src/app/(app)/diario/a11y.test.tsx` + `src/app/(app)/pendencias/a11y.test.tsx` — **Create**: gates axe.
- `src/app/(app)/layout.tsx` — **Modify**: link "Pendências" no shell + banner de contagem.
- `e2e/diario-demo.spec.ts` — **Create**: E2E do fluxo demo.
- `db/tests/fase2-rls.int.test.ts` — **Modify**: isolar teste J2 (fixtures dedicadas), cobrir M-c.

---

## Task 1: Costura `ExtractionProvider` (interface + Null + DemoStub + roteamento)

**Files:**

- Create: `src/lib/extraction/provider.ts`, `src/lib/extraction/null-provider.ts`, `src/lib/extraction/demo-stub-provider.ts`
- Test: `src/lib/extraction/provider.test.ts`

**Interfaces:**

- Produces:
  - `type ExtractionContext = { sessionId: string; clinicId: string; notaConsolidada: string; metasAtivas: Array<{ id: string; descricao: string }> }`
  - `interface ExtractionProvider { extrair(ctx: ExtractionContext): Promise<ExtractionDraft[]> }`
  - `type ExtractionDraft = { subtipo: string; trechoFonte: string; confianca: "alta"|"media"|"baixa"; justificativaConfianca?: string; inconsistenteComHistorico: boolean; parContrasteId: string|null; payload: unknown; estado: "sugerida"|"pendente_reprocessamento" }`
  - `function resolveProvider(clinic: { isDemo: boolean }): ExtractionProvider`

- [ ] **Step 1: Escrever o teste**

```ts
// src/lib/extraction/provider.test.ts
import { describe, expect, test } from "vitest";
import { resolveProvider } from "./provider";
import { DemoStubProvider } from "./demo-stub-provider";
import { NullProvider } from "./null-provider";

const ctx = {
  sessionId: "s1",
  clinicId: "c1",
  notaConsolidada:
    "Pediu água apontando; falou 'á' sozinho. Depois não respondeu à pergunta.",
  metasAtivas: [{ id: "g1", descricao: "Pedir água sozinho" }],
};

describe("resolveProvider", () => {
  test("clínica demo usa o DemoStubProvider", () => {
    expect(resolveProvider({ isDemo: true })).toBeInstanceOf(DemoStubProvider);
  });
  test("clínica de produção usa o NullProvider", () => {
    expect(resolveProvider({ isDemo: false })).toBeInstanceOf(NullProvider);
  });
});

describe("NullProvider", () => {
  test("não gera sugestão; marca a extração como pendente de reprocessamento", async () => {
    const drafts = await new NullProvider().extrair(ctx);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.estado).toBe("pendente_reprocessamento");
    expect(drafts[0]!.subtipo).toBe("pendente");
  });
});

describe("DemoStubProvider", () => {
  test("gera >=1 extração fake 'sugerida' ligada a texto da nota", async () => {
    const drafts = await new DemoStubProvider().extrair(ctx);
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts.every((d) => d.estado === "sugerida")).toBe(true);
    // determinístico: mesmo input → mesma quantidade
    const again = await new DemoStubProvider().extrair(ctx);
    expect(again.length).toBe(drafts.length);
    // trecho_fonte vem do texto da nota (fatia real, não inventada)
    expect(ctx.notaConsolidada).toContain(drafts[0]!.trechoFonte);
  });
});
```

- [ ] **Step 2: Rodar o teste (falha)**

Run: `"/c/Program Files/nodejs/corepack" pnpm test -- src/lib/extraction/provider.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar `provider.ts`**

```ts
// src/lib/extraction/provider.ts
export type ExtractionContext = {
  sessionId: string;
  clinicId: string;
  notaConsolidada: string;
  metasAtivas: Array<{ id: string; descricao: string }>;
};

export type ExtractionDraft = {
  subtipo: string;
  trechoFonte: string;
  confianca: "alta" | "media" | "baixa";
  justificativaConfianca?: string;
  inconsistenteComHistorico: boolean;
  parContrasteId: string | null;
  payload: unknown;
  estado: "sugerida" | "pendente_reprocessamento";
};

export interface ExtractionProvider {
  extrair(ctx: ExtractionContext): Promise<ExtractionDraft[]>;
}

import { DemoStubProvider } from "./demo-stub-provider";
import { NullProvider } from "./null-provider";

// Roteamento por flag de clínica. Fase 3 troca o ramo de produção pelo
// ClaudeProvider real (R1-R19 + hardening prompt-injection) — mudança de 1 linha.
export function resolveProvider(clinic: {
  isDemo: boolean;
}): ExtractionProvider {
  return clinic.isDemo ? new DemoStubProvider() : new NullProvider();
}
```

- [ ] **Step 4: Implementar `null-provider.ts`**

```ts
// src/lib/extraction/null-provider.ts
import type {
  ExtractionContext,
  ExtractionDraft,
  ExtractionProvider,
} from "./provider";

// Produção sem agente real ainda (Fase 3). Registra uma linha marcando que a
// extração ficou pendente de reprocessamento — mesmo estado do caminho de falha
// dos wireframes. NENHUM LLM é chamado (guardrail #6).
export class NullProvider implements ExtractionProvider {
  async extrair(ctx: ExtractionContext): Promise<ExtractionDraft[]> {
    return [
      {
        subtipo: "pendente",
        trechoFonte: "",
        confianca: "baixa",
        inconsistenteComHistorico: false,
        parContrasteId: null,
        payload: { motivo: "extracao_pendente_fase3" },
        estado: "pendente_reprocessamento",
      },
    ];
  }
}
```

- [ ] **Step 5: Implementar `demo-stub-provider.ts`**

```ts
// src/lib/extraction/demo-stub-provider.ts
import type {
  ExtractionContext,
  ExtractionDraft,
  ExtractionProvider,
} from "./provider";

// Gera extrações fake plausíveis para clínicas de demonstração, de forma
// DETERMINÍSTICA (sem Math.random) — pega frases reais da nota consolidada como
// trecho_fonte e alterna confiança/subtipo. NÃO chama LLM (guardrail #6).
export class DemoStubProvider implements ExtractionProvider {
  async extrair(ctx: ExtractionContext): Promise<ExtractionDraft[]> {
    const frases = ctx.notaConsolidada
      .split(/(?<=[.!?])\s+/)
      .map((f) => f.trim())
      .filter((f) => f.length >= 8);
    const confs: ExtractionDraft["confianca"][] = ["alta", "media", "baixa"];
    const meta = ctx.metasAtivas[0]?.id ?? null;
    return frases.slice(0, 6).map((frase, i) => ({
      subtipo: "evidencia",
      trechoFonte: frase,
      confianca: confs[i % 3]!,
      justificativaConfianca: "Sugestão de demonstração (dados fictícios).",
      inconsistenteComHistorico: false,
      parContrasteId: null,
      payload: {
        alvos: meta ? [{ goal_id: meta }] : [],
        polaridade: i % 2 === 0 ? "positiva" : "negativa",
      },
      estado: "sugerida",
    }));
  }
}
```

- [ ] **Step 6: Rodar (passa)**

Run: `"/c/Program Files/nodejs/corepack" pnpm test -- src/lib/extraction/provider.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/extraction
git commit -m "feat(fase-2): costura ExtractionProvider (stub demo + null produção)"
```

---

## Task 2: Actions de captura de diário (`capturarDiario`, `corrigirEscopoProtocolo`, `registrarAudioLocal`)

**Files:**

- Create: `src/app/(app)/diario/[sessionId]/actions.ts`
- Test: `src/app/(app)/diario/[sessionId]/actions.int.test.ts`

**Interfaces:**

- Consumes: `withTenant`, `getTenantContext`, `requireRole`/`RoleError`, `session`/`sessionNote`/`sessionProtocolScope`/`audioCapture` de `@/db/schema`.
- Produces:
  - `capturarDiario(ctx, { sessionId, texto }): Promise<{ error?: string; id?: string }>` — grava `session_note` `captura_rapida`.
  - `corrigirEscopoProtocolo(ctx, { sessionId, protocolIds }): Promise<{ error?: string }>` — upsert de `session_protocol_scope` (`origem='ajustado_manualmente'`, `ajustado_por=ctx.userId`).
  - `registrarAudioLocal(ctx, { sessionId, duracaoSegundos }): Promise<{ error?: string; id?: string }>` — cria `audio_capture` `status_upload='rascunho_local'`, retorna id (chave do blob no IndexedDB).

- [ ] **Step 1: Escrever o teste de integração** (seguir harness de `db/tests/fase2-rls.int.test.ts` — conexão owner p/ seed, ctx literais, `describe.skipIf`)

```ts
// src/app/(app)/diario/[sessionId]/actions.int.test.ts
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

const hasDb =
  !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1";
const U_T2 = "00000000-0000-0000-0000-0000000072a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PROTO = "00000000-0000-0000-0000-00000070c0a1";
const SESS = "00000000-0000-0000-0000-00000005e1a1"; // terapeuta = U_T1
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let capturarDiario: typeof import("./actions").capturarDiario;
let corrigirEscopoProtocolo: typeof import("./actions").corrigirEscopoProtocolo;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("diário · captura", () => {
  beforeAll(async () => {
    ({ capturarDiario, corrigirEscopoProtocolo } = await import("./actions"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, protocol, session,
      session_note, session_protocol_scope, audio_capture, care_team_membership
      RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO protocol_familia_catalogo (id) VALUES ('aba_marcos_desenvolvimento') ON CONFLICT DO NOTHING`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_T1}, ${CLINIC_A}, 'terapeuta'), (${U_T2}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'P')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO}, ${CLINIC_A}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado)
      VALUES (${SESS}, ${CLINIC_A}, ${PAC}, ${U_T1}, now(), 'presente')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'ABA')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("terapeuta dono grava captura rápida", async () => {
    const r = await capturarDiario(ctxT1, {
      sessionId: SESS,
      texto: "Pediu água apontando",
    });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
  });

  test("terapeuta que não é dono da sessão é barrado", async () => {
    const r = await capturarDiario(ctxT2, {
      sessionId: SESS,
      texto: "indevido",
    });
    expect(r.error).toBeTruthy(); // RLS WITH CHECK bloqueia
  });

  test("corrigir escopo grava protocolo com origem ajustada", async () => {
    const r = await corrigirEscopoProtocolo(ctxT1, {
      sessionId: SESS,
      protocolIds: [PROTO],
    });
    expect(r.error).toBeUndefined();
    const rows =
      await owner`SELECT origem, ajustado_por FROM session_protocol_scope WHERE session_id = ${SESS}`;
    expect(rows[0]!.origem).toBe("ajustado_manualmente");
    expect(rows[0]!.ajustado_por).toBe(U_T1);
  });
});
```

- [ ] **Step 2: Rodar (falha)** — Run: `"/c/Program Files/nodejs/corepack" pnpm test:rls -- src/app/(app)/diario/[sessionId]/actions.int.test.ts` · Expected: FAIL (actions não existem).

- [ ] **Step 3: Implementar `actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { audioCapture, sessionNote, sessionProtocolScope } from "@/db/schema";

const capturaSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "Escreva algo antes de salvar."),
});

export async function capturarDiario(
  ctx: TenantContext,
  input: { sessionId: string; texto: string },
): Promise<{ error?: string; id?: string }> {
  requireRole(ctx, "terapeuta");
  const parsed = capturaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(sessionNote)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          tipo: "captura_rapida",
          texto: parsed.data.texto,
          autorId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: { texto: parsed.data.texto, atualizadoEm: new Date() },
        })
        .returning({ id: sessionNote.id }),
    );
    return { id: row!.id };
  } catch (err) {
    console.error("capturarDiario:", err);
    return { error: "Não foi possível salvar a captura." };
  }
}

const escopoSchema = z.object({
  sessionId: z.string().uuid(),
  protocolIds: z.array(z.string().uuid()).min(1),
});

export async function corrigirEscopoProtocolo(
  ctx: TenantContext,
  input: { sessionId: string; protocolIds: string[] },
): Promise<{ error?: string }> {
  requireRole(ctx, "terapeuta");
  const parsed = escopoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    await withTenant(ctx, async (tx) => {
      for (const protocolId of parsed.data.protocolIds) {
        await tx
          .insert(sessionProtocolScope)
          .values({
            sessionId: parsed.data.sessionId,
            protocolId,
            origem: "ajustado_manualmente",
            ajustadoPor: ctx.userId,
          })
          .onConflictDoUpdate({
            target: [
              sessionProtocolScope.sessionId,
              sessionProtocolScope.protocolId,
            ],
            set: { origem: "ajustado_manualmente", ajustadoPor: ctx.userId },
          });
      }
    });
    return {};
  } catch (err) {
    console.error("corrigirEscopoProtocolo:", err);
    return { error: "Não foi possível ajustar os protocolos." };
  }
}

const audioSchema = z.object({
  sessionId: z.string().uuid(),
  duracaoSegundos: z.number().int().positive().optional(),
});

export async function registrarAudioLocal(
  ctx: TenantContext,
  input: { sessionId: string; duracaoSegundos?: number },
): Promise<{ error?: string; id?: string }> {
  requireRole(ctx, "terapeuta");
  const parsed = audioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(audioCapture)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          statusUpload: "rascunho_local",
          duracaoSegundos: parsed.data.duracaoSegundos,
        })
        .returning({ id: audioCapture.id }),
    );
    return { id: row!.id };
  } catch (err) {
    console.error("registrarAudioLocal:", err);
    return { error: "Não foi possível registrar o áudio." };
  }
}
```

- [ ] **Step 4: Rodar (passa)** — Run: `"/c/Program Files/nodejs/corepack" pnpm test:rls -- src/app/(app)/diario/[sessionId]/actions.int.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/diario"
git commit -m "feat(fase-2): actions de captura de diário (texto, escopo de protocolo, áudio local)"
```

---

## Task 3: `consolidarSessao` — nota consolidada, `numero_sequencial_paciente`, dispara provider

**Files:**

- Modify: `src/app/(app)/diario/[sessionId]/actions.ts` (adicionar `consolidarSessao` + wrappers Action)
- Modify: `src/app/(app)/diario/[sessionId]/actions.int.test.ts` (casos de consolidação)

**Interfaces:**

- Consumes: `resolveProvider` (`@/lib/extraction/provider`), `extraction`/`goal`/`clinic`/`session`/`sessionNote` de schema.
- Produces: `consolidarSessao(ctx, { sessionId, texto }): Promise<{ error?: string; numeroSequencial?: number }>`.

- [ ] **Step 1: Escrever os testes** (adicionar ao describe existente)

```ts
test("consolidar grava nota, popula numero_sequencial e é idempotente", async () => {
  const { consolidarSessao } = await import("./actions");
  const r1 = await consolidarSessao(ctxT1, {
    sessionId: SESS,
    texto: "Nota final revisada da sessão.",
  });
  expect(r1.error).toBeUndefined();
  expect(r1.numeroSequencial).toBe(1);
  // reconsolidar NÃO incrementa o sequencial
  const r2 = await consolidarSessao(ctxT1, {
    sessionId: SESS,
    texto: "Nota final corrigida.",
  });
  expect(r2.numeroSequencial).toBe(1);
  const s =
    await owner`SELECT numero_sequencial_paciente FROM session WHERE id = ${SESS}`;
  expect(s[0]!.numero_sequencial_paciente).toBe(1);
});

test("clínica demo gera extrações sugeridas ao consolidar", async () => {
  await owner`UPDATE clinic SET is_demo = true WHERE id = ${CLINIC_A}`;
  const { consolidarSessao } = await import("./actions");
  await consolidarSessao(ctxT1, {
    sessionId: SESS,
    texto: "Pediu água. Falou 'á' sozinho. Não respondeu depois.",
  });
  const ex =
    await owner`SELECT estado FROM extraction WHERE session_id = ${SESS}`;
  expect(ex.length).toBeGreaterThanOrEqual(1);
  expect(ex.every((e) => e.estado === "sugerida")).toBe(true);
  await owner`UPDATE clinic SET is_demo = false WHERE id = ${CLINIC_A}`;
});

test("clínica de produção fica pendente de reprocessamento (sem LLM)", async () => {
  // limpa extrações da sessão do caso anterior
  await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
  const { consolidarSessao } = await import("./actions");
  await consolidarSessao(ctxT1, {
    sessionId: SESS,
    texto: "Nota de produção.",
  });
  const ex =
    await owner`SELECT estado FROM extraction WHERE session_id = ${SESS}`;
  expect(ex.some((e) => e.estado === "pendente_reprocessamento")).toBe(true);
});
```

- [ ] **Step 2: Rodar (falha)** — Expected: FAIL (`consolidarSessao` não existe).

- [ ] **Step 3: Implementar `consolidarSessao`** (adicionar em `actions.ts`)

```ts
import { resolveProvider } from "@/lib/extraction/provider";
import { clinic, extraction, goal, session } from "@/db/schema";
import { sql } from "drizzle-orm";

const consolidarSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "A nota consolidada não pode ficar vazia."),
});

export async function consolidarSessao(
  ctx: TenantContext,
  input: { sessionId: string; texto: string },
): Promise<{ error?: string; numeroSequencial?: number }> {
  requireRole(ctx, "terapeuta");
  const parsed = consolidarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    return await withTenant(ctx, async (tx) => {
      // 1) grava/atualiza a nota consolidada (upsert na chave única sessão+tipo)
      await tx
        .insert(sessionNote)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          tipo: "nota_consolidada",
          texto: parsed.data.texto,
          autorId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: { texto: parsed.data.texto, atualizadoEm: new Date() },
        });

      // 2) popula numero_sequencial_paciente só se ainda nulo (idempotente):
      //    próximo inteiro por paciente, resolvido no banco.
      const [sess] = await tx
        .select({
          patientId: session.patientId,
          numero: session.numeroSequencialPaciente,
        })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      let numero = sess!.numero ?? null;
      if (numero === null) {
        const [upd] = await tx.execute(sql`
          UPDATE session SET numero_sequencial_paciente = (
            COALESCE((SELECT MAX(numero_sequencial_paciente) FROM session
                      WHERE patient_id = ${sess!.patientId}), 0) + 1)
          WHERE id = ${parsed.data.sessionId} AND numero_sequencial_paciente IS NULL
          RETURNING numero_sequencial_paciente AS numero`);
        numero = (upd?.numero as number | undefined) ?? sess!.numero ?? null;
      }

      // 3) dispara a extração via costura (stub demo / null produção).
      const [cl] = await tx
        .select({ isDemo: clinic.isDemo })
        .from(clinic)
        .where(eq(clinic.id, ctx.clinicId));
      const metas = await tx
        .select({ id: goal.id, descricao: goal.descricao })
        .from(goal)
        .where(and(eq(goal.clinicId, ctx.clinicId), eq(goal.estado, "ativa")));
      const provider = resolveProvider({ isDemo: cl!.isDemo });
      const drafts = await provider.extrair({
        sessionId: parsed.data.sessionId,
        clinicId: ctx.clinicId,
        notaConsolidada: parsed.data.texto,
        metasAtivas: metas,
      });
      // regrava extrações desta sessão (consolidação re-roda o provider)
      await tx
        .delete(extraction)
        .where(eq(extraction.sessionId, parsed.data.sessionId));
      if (drafts.length > 0) {
        await tx.insert(extraction).values(
          drafts.map((d) => ({
            sessionId: parsed.data.sessionId,
            clinicId: ctx.clinicId,
            estado: d.estado,
            subtipo: d.subtipo,
            trechoFonte: d.trechoFonte,
            confianca: d.confianca,
            justificativaConfianca: d.justificativaConfianca,
            inconsistenteComHistorico: d.inconsistenteComHistorico,
            parContrasteId: d.parContrasteId,
            payload: d.payload as object,
          })),
        );
      }
      return { numeroSequencial: numero ?? undefined };
    });
  } catch (err) {
    console.error("consolidarSessao:", err);
    return { error: "Não foi possível consolidar a sessão." };
  }
}
```

> Nota de RLS: `extraction_insert` exige `app_session_terapeuta_id(session_id) = app.user_id` — por isso a consolidação roda no contexto do terapeuta dono. O `DELETE` de extrações usa a policy `extraction_delete` (mesma condição). Coerente com o guardrail.

- [ ] **Step 4: Adicionar wrappers `*Action` para `useActionState`** no fim de `actions.ts` (padrão da agenda), ex.:

```ts
export type ConsolidarState = { error?: string; ok?: boolean; numero?: number };
export async function consolidarSessaoAction(
  _prev: ConsolidarState,
  formData: FormData,
): Promise<ConsolidarState> {
  const ctx = await getTenantContext();
  try {
    const r = await consolidarSessao(ctx, {
      sessionId: String(formData.get("sessionId") ?? ""),
      texto: String(formData.get("texto") ?? ""),
    });
    if (r.error) return { error: r.error };
    revalidatePath("/pendencias");
    revalidatePath(`/diario/${formData.get("sessionId")}`);
    return { ok: true, numero: r.numeroSequencial };
  } catch (err) {
    if (err instanceof RoleError)
      return { error: "Só o terapeuta da sessão consolida." };
    console.error("consolidarSessaoAction:", err);
    return { error: "Não foi possível consolidar." };
  }
}
```

(análogo: `capturarDiarioAction`, `corrigirEscopoProtocoloAction`, `registrarAudioLocalAction`.)

- [ ] **Step 5: Rodar (passa)** — Run: `"/c/Program Files/nodejs/corepack" pnpm test:rls -- src/app/(app)/diario/[sessionId]/actions.int.test.ts` · Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/diario"
git commit -m "feat(fase-2): consolidação da sessão (numero sequencial + costura de extração)"
```

---

## Task 4: Áudio local (IndexedDB store + gravador com ouvir/descartar/regravar)

**Files:**

- Create: `src/lib/audio/local-store.ts`, `src/app/(app)/diario/[sessionId]/audio-local.tsx`
- Test: `src/lib/audio/local-store.test.ts`

**Interfaces:**

- Produces:
  - `local-store.ts`: `salvarAudioLocal(id: string, blob: Blob): Promise<void>`, `lerAudioLocal(id: string): Promise<Blob | null>`, `apagarAudioLocal(id: string): Promise<void>` (IndexedDB, store `iris-audio-rascunho`).
  - `audio-local.tsx`: componente client `<AudioLocal sessionId aoConfirmar={(audioCaptureId) => void} />` que grava via `MediaRecorder`, permite **ouvir** (playback do blob), **descartar** (apaga blob local + reseta) e **regravar**, e só ao confirmar chama `registrarAudioLocalAction` + `salvarAudioLocal(id, blob)`.

- [ ] **Step 1: Teste do store (jsdom + fake-indexeddb)**

```ts
// src/lib/audio/local-store.test.ts
import "fake-indexeddb/auto";
import { describe, expect, test } from "vitest";
import {
  apagarAudioLocal,
  lerAudioLocal,
  salvarAudioLocal,
} from "./local-store";

describe("audio local store (IndexedDB)", () => {
  test("salvar → ler → apagar um blob", async () => {
    const blob = new Blob(["fake-audio"], { type: "audio/webm" });
    await salvarAudioLocal("cap-1", blob);
    const lido = await lerAudioLocal("cap-1");
    expect(lido).not.toBeNull();
    await apagarAudioLocal("cap-1");
    expect(await lerAudioLocal("cap-1")).toBeNull();
  });
});
```

> Dependência: `fake-indexeddb` (devDependency). Se ainda não instalada: `"/c/Program Files/nodejs/corepack" pnpm add -D fake-indexeddb` (é a única dep nova permitida deste plano; anotar no commit).

- [ ] **Step 2: Rodar (falha)** — Expected: FAIL.

- [ ] **Step 3: Implementar `local-store.ts`** (IndexedDB puro, sem lib externa em runtime)

```ts
const DB = "iris-audio",
  STORE = "iris-audio-rascunho",
  VERSAO = 1;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSAO);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(db.transaction(STORE, modo).objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}
export const salvarAudioLocal = (id: string, blob: Blob) =>
  tx("readwrite", (s) => s.put(blob, id)).then(() => undefined);
export const lerAudioLocal = (id: string) =>
  tx<Blob | undefined>("readonly", (s) => s.get(id)).then((b) => b ?? null);
export const apagarAudioLocal = (id: string) =>
  tx("readwrite", (s) => s.delete(id)).then(() => undefined);
```

- [ ] **Step 4: Rodar (passa)** — Expected: PASS.

- [ ] **Step 5: Implementar `audio-local.tsx`** (client component — MediaRecorder + estados vazio/gravando/gravado; botões Ouvir/Descartar/Regravar/Confirmar; nota de privacidade). Usa `registrarAudioLocalAction` e `salvarAudioLocal`. Trata permissão de microfone negada com `Alert severidade="erro"` sem perder o texto do diário. (Componente client puro; sem teste unitário de MediaRecorder — coberto pelo gate a11y da Task 6 e pelo E2E da Task 9 quando possível.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/audio "src/app/(app)/diario/[sessionId]/audio-local.tsx"
git commit -m "feat(fase-2): áudio local (IndexedDB) com ouvir/descartar/regravar"
```

---

## Task 5: Tela de captura (`page.tsx` + `captura-form.tsx`) + consolidação (`consolidar-form.tsx`)

**Files:**

- Create: `src/app/(app)/diario/[sessionId]/page.tsx`, `captura-form.tsx`, `consolidar-form.tsx`
- Test: `src/app/(app)/diario/a11y.test.tsx`

**Interfaces:** Consome as actions das Tasks 2-3 e o `AudioLocal` da Task 4.

- [ ] **Step 1: Escrever o gate a11y** (seguir `agenda/a11y.test.tsx` — mock `server-only` + `@/db/client`, axe zero violações no `capturaForm`/`consolidarForm`).

- [ ] **Step 2: Rodar (falha)** — Expected: FAIL.

- [ ] **Step 3: Implementar as telas** (Server Component `page.tsx` carrega a sessão + escopo pré-preenchido pela disciplina; `captura-form.tsx` com toggle Texto/Áudio via `Tabs`, chip de protocolo via `Chip`/`ChipGroup` — "toca pra trocar", `useActionState`; `consolidar-form.tsx` com textarea + `Button`, mostra `numeroSequencial` no sucesso). Mobile-first (3 linhas por seção, sem scroll horizontal). Copy pt-BR + nota de privacidade do áudio.

- [ ] **Step 4: Rodar (passa)** — Expected: PASS (axe zero violação).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/diario"
git commit -m "feat(fase-2): telas de captura e consolidação do diário (DS, mobile-first)"
```

---

## Task 6: Fila de pendências (`page.tsx` + `queries.ts`) + banner no shell

**Files:**

- Create: `src/app/(app)/pendencias/page.tsx`, `src/app/(app)/pendencias/queries.ts`, `src/app/(app)/pendencias/a11y.test.tsx`
- Modify: `src/app/(app)/layout.tsx` (link + banner de contagem)
- Test: `src/app/(app)/pendencias/queries.int.test.ts`

**Interfaces:**

- Produces: `listarPendencias(ctx): Promise<{ capturasAConsolidar: {...}[]; extracaoPendente: {...}[]; sugestoesDemo: {...}[] }>`.

- [ ] **Step 1: Teste de integração das queries** (sessão com `captura_rapida` sem `nota_consolidada` → aparece em `capturasAConsolidar`; extração `pendente_reprocessamento` → `extracaoPendente`; extração `sugerida` (demo) → `sugestoesDemo`). Harness owner-seed padrão.

- [ ] **Step 2: Rodar (falha)** — Expected: FAIL.

- [ ] **Step 3: Implementar `queries.ts`** (via `withTenant`, joins de `session_note`/`session`/`extraction`; RLS já filtra por papel/tenant) e `page.tsx` (lista com `Card`/`Button` "Consolidar →"/"Revisar →"; estado vazio "dia limpo"). `listarPendencias` também expõe a contagem total para o banner.

- [ ] **Step 4: Banner no `layout.tsx`** — link "Pendências (N)" no shell (N = total). Não quebrar o gate a11y existente do layout.

- [ ] **Step 5: Rodar (passa)** — Expected: PASS (int + a11y).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/pendencias" "src/app/(app)/layout.tsx"
git commit -m "feat(fase-2): fila de pendências + banner no shell"
```

---

## Task 7: Dívida de teste (isolar J2, cobrir M-c) + E2E demo

**Files:**

- Modify: `db/tests/fase2-rls.int.test.ts`
- Create: `e2e/diario-demo.spec.ts`

- [ ] **Step 1: Isolar o teste J2** — o caso de `extraction_update` por não-dono que hoje muta `care_team_membership` compartilhado (acoplamento de ordem) passa a usar paciente/sessão/terapeuta dedicados (`PAC_A2`/`SESS_A2`/`U_T3`) semeados no `beforeAll`, sem mutar a equipe de `PAC_A1`. Rodar `pnpm test:rls` verde.

- [ ] **Step 2: Cobrir M-c** — o teste "qualquer papel lê o catálogo de marcos" passa a exercitar também `ctxCoordA` e `ctxRecepA` (não só terapeuta), confirmando que `milestone_select` é role-agnóstico. Rodar verde.

- [ ] **Step 3: Commit**

```bash
git add db/tests/fase2-rls.int.test.ts
git commit -m "test(fase-2): isola teste de extraction_update e cobre catálogo por múltiplos papéis"
```

- [ ] **Step 4: E2E demo** (`e2e/diario-demo.spec.ts`, Playwright, contra servidor real com clínica `is_demo=true` semeada): login terapeuta → abrir sessão → captura rápida (texto) → consolidar → conferir que a Fila mostra "N sugestões / Revisar". Seguir o padrão dos E2E existentes (requer DB+seed). Se o seed demo completo só chega no Plano 4, marcar o teste com `test.skip` documentado até lá.

- [ ] **Step 5: Commit**

```bash
git add e2e/diario-demo.spec.ts
git commit -m "test(fase-2): e2e do fluxo demo diário→consolidação→fila"
```

---

## Task 8: Verificação final da fase

- [ ] **Step 1: Typecheck** — `"/c/Program Files/nodejs/corepack" pnpm typecheck` · Expected: PASS.
- [ ] **Step 2: Unit + a11y** — `"/c/Program Files/nodejs/corepack" pnpm test` · Expected: PASS.
- [ ] **Step 3: Integração** — `"/c/Program Files/nodejs/corepack" pnpm test:rls` · Expected: PASS (novos + Plano 1 + agenda 1d, sem regressão).
- [ ] **Step 4: Commit de fechamento** (se algo ajustado) — `git commit -am "chore(fase-2): fecha plano 2 — testes verdes"`.

---

## Self-Review (feito na escrita)

**Cobertura do spec (§4, §5.1-5.3):**

- Costura ExtractionProvider (DemoStub/Null, roteamento is_demo) → Task 1 + integração na Task 3. ✅
- Captura texto + chip de protocolo (session_protocol_scope, origem ajustada) → Task 2 + Task 5. ✅
- Áudio local ouvir/descartar/regravar → Task 4. ✅
- Consolidação + `numero_sequencial_paciente` (idempotente) → Task 3. ✅
- Fila de pendências (consolidar / pendente / sugestões demo) + banner → Task 6. ✅
- Guardrail #6 (sem LLM) → stub determinístico, sem `Math.random`/`fetch`. ✅
- Dívida (J2 isolado, M-c) → Task 7. ✅

**Placeholders:** as Tasks 4 Step 5 e 5 Step 3 descrevem UI sem colar todo o JSX — são componentes de apresentação com contrato de props/ações já definido; o executor segue os componentes de referência (agenda/1c). Marcado explicitamente, não é "TODO".

**Consistência de tipos:** `ExtractionDraft`/`ExtractionContext`/`resolveProvider` usados igual entre Task 1 e Task 3; actions retornam `{ error?, id? }`/`{ error?, numeroSequencial? }` consistentes.

## Fora deste plano

- **Plano 3** — Metas (CRUD, critério N/M, ciclo, transição `dominada`). Inclui M-b (extraction subtipo/confianca → pgEnum).
- **Plano 4** — Seed demo alta-fidelidade das 4 famílias + clínica demo (destrava o E2E da Task 7 Step 4).
