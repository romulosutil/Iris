# Fase 5 — Fatia 1: Fila de Validação do Coordenador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fila de validação por exceção do coordenador (V1a/V1b) com as 4 ações V2 (confirmar/reclassificar/devolver/invalidar), o par completo de "devolver" (responder pelo terapeuta), trilha `audit_log`, recompute retroativo e superfície passiva de V4 — sem migração de banco.

**Architecture:** Rota dedicada `src/app/(app)/validacao/` (coordenador-only) espelhando o padrão testável de `revisao/[sessionId]/actions.ts` (core `(ctx, input)` + wrapper `comCtx(formData)`, `withTenant`, `requireRole`, advisory lock por paciente, `CONCURRENCY_ERROR` como retorno estruturado). A fila é derivada por leitura (nenhuma coluna de estado nova). Reclassificar/invalidar/devolver/responder gravam no log append-only da Fase 4 (`evidence_revision`/`evidence_query`) e chamam `materializarSnapshot` na mesma tx (recompute mid-history é seguro — teste `fase4-materializar:287`). Nova rota `src/app/(app)/duvidas/` dá ao terapeuta a superfície de responder queries.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle, Postgres (RLS nativo já cobre os gates de `evidence_*`), Vitest (`.int.test.ts` + a11y `.test.tsx`), `withTenant` (`@/db/rls`), `materializarSnapshot` (`@/lib/evidence/materializar`), `resolverAlvoParaFks` (`@/lib/evidence/resolver`).

## Global Constraints

- **SEM migração de banco.** A camada de dados (Fase 4 + `audit_log` do F0) já cobre tudo. Se alguma coluna faltar, PARE e reporte — não crie schema sem aprovação.
- **Copy/UI em pt-BR.** Commits em inglês (Conventional Commits). **Design system sempre** — nunca hardcodar componente ([[workflow-subagents-skills-design-system]]).
- **RLS já é o gate — não duplicar nem enfraquecer.** `evidence_query_insert` (coordenador-only), `evidence_query_update` (terapeuta-da-equipe/coordenador, só `respondido_em IS NULL`), `evidence_revision_insert` (coordenador livre; terapeuta só com query aberta). `evidence`/`evidence_revision` são append-only por `REVOKE UPDATE,DELETE`. A app **reforça** `requireRole`, não substitui.
- **Padrão de action (espelhar `revisao/[sessionId]/actions.ts`):** core `fn(ctx, input)` com Zod + `withTenant` + `requireRole` + advisory lock `SELECT pg_advisory_xact_lock(hashtextextended(${patientId}::text, 0))` + retorno estruturado; wrapper `comCtx(formData, fn)` re-deriva `ctx` via `getTenantContext()`, lê FormData, `revalidatePath`, mapeia `CONCURRENCY_ERROR`/`RoleError`. **`CONCURRENCY_ERROR` é retorno, não throw.**
- **Recompute:** `await materializarSnapshot(drizzleMaterializarQueries(tx), patientId, sessionNumeroDaEvidencia)` na MESMA tx, após a escrita, sob o advisory lock. Mid-history é seguro (lê história inteira, escreve `≥ desdeNumero`).
- **Forma do jsonb de classificação:** `classificacao_original`/`classificacao_nova` = `{ ...conteúdo da evidência (nivel_ajuda, polaridade, descricao...), alvo: { goal_id, protocol_id, dominio_id } }` (chaves **snake**, refs cruas). **Espelhar a forma exata do teste `db/tests/fase4-materializar.int.test.ts:287+`** (o bloco "recompute retroativo" que reclassifica) — é a fonte canônica de como `classificacao_nova` deve ser montada para o recompute consumir.
- **`evidence_current` é VIEW SQL** (não Drizzle) — ler via `tx.execute(sql\`SELECT ... FROM evidence_current WHERE ...\`)`. Expõe `e.*` + `classificacao_atual` (jsonb) + `invalidada` (bool).
- **Teste `.int.test.ts`:** `vi.mock("server-only", () => ({}))` no topo; `const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;` + `describe.skipIf(!hasDb)`; owner via `postgres(process.env.MIGRATION_DATABASE_URL!, {max:1})` p/ seed; app via `withTenant`. **Se auto-skipar, é falha — DB tem que estar no ar.**
- **Papéis:** `terapeuta | coordenador | admin_recepcao`. Coordenador é clínica-wide; terapeuta é `app_is_on_team`.
- **Spec-fonte:** `docs/superpowers/specs/2026-07-19-fase5-fatia1-fila-validacao-design.md` (endurecida por pre-mortem).

---

### Task 1: Query da fila — `validacao/queries.ts`

**Files:**
- Create: `src/app/(app)/validacao/queries.ts`
- Test: `src/app/(app)/validacao/queries.int.test.ts`

**Interfaces:**
- Produces:
  - `type ItemFila = { evidenceId: string; patientId: string; patientNome: string; sessionNumero: number; trecho: string; classificacaoAtual: unknown; motivo: ("baixa_confianca"|"inconsistente_historico")[]; protocolId: string | null }`
  - `async function listarFilaValidacao(ctx: TenantContext): Promise<{ itens: ItemFila[]; total: number }>`

- [ ] **Step 1: Escrever o teste falho**

Cria `src/app/(app)/validacao/queries.int.test.ts`. Segue o padrão de `revisao/[sessionId]/actions.int.test.ts` (mock server-only, hasDb, owner seed). Seed: 1 clínica, coordenador, 1 paciente, 1 sessão, 1 `extraction` com `confianca='baixa'`, e `evidence` dela; + 1 extraction `confianca='alta', inconsistente_com_historico=false` com evidence (NÃO deve aparecer); + 1 evidence de outra clínica (cross-tenant → não aparece).

```ts
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
// ... constantes UUID hex, owner, seed no beforeAll (espelhar actions.int.test.ts) ...

describe.skipIf(!hasDb)("listarFilaValidacao", () => {
  test("inclui evidência de baixa confiança, exclui alta confiança sem inconsistência", async () => {
    const { itens } = await listarFilaValidacao(ctxCoord);
    const ids = itens.map((i) => i.evidenceId);
    expect(ids).toContain(EV_BAIXA);
    expect(ids).not.toContain(EV_OK);
    expect(itens.find((i) => i.evidenceId === EV_BAIXA)!.motivo).toContain("baixa_confianca");
  });
  test("inclui evidência inconsistente com histórico", async () => {
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).toContain(EV_INCONSISTENTE);
  });
  test("exclui evidência já tratada (tem evidence_revision)", async () => {
    await owner!`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, justificativa, autor_id)
      VALUES (${EV_BAIXA}, 'confirmar', '{}'::jsonb, 'x', ${U_COORD})`;
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).not.toContain(EV_BAIXA);
  });
  test("exclui evidência com evidence_query aberta", async () => {
    await owner!`INSERT INTO evidence_query (evidence_id, coordenador_id, pergunta)
      VALUES (${EV_INCONSISTENTE}, ${U_COORD}, 'dúvida?')`;
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).not.toContain(EV_INCONSISTENTE);
  });
  test("cross-tenant → não vê evidência de outra clínica", async () => {
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).not.toContain(EV_OUTRA_CLINICA);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/app/(app)/validacao/queries.int.test.ts`
Expected: FAIL — `listarFilaValidacao` não existe.

- [ ] **Step 3: Implementar `queries.ts`**

Usa `withTenant` + SQL cru para a view `evidence_current` (não é Drizzle). Junta `extraction` (confianca/inconsistente), `patient` (nome), `session` (trecho do diário). Predicado: `(extraction.confianca='baixa' OR extraction.inconsistente_com_historico) AND NOT EXISTS(evidence_revision) AND NOT EXISTS(evidence_query aberta) AND NOT invalidada`. Captura `Date.now()` fora do render se precisar.

```ts
import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

export type ItemFila = {
  evidenceId: string; patientId: string; patientNome: string; sessionNumero: number;
  trecho: string; classificacaoAtual: unknown;
  motivo: ("baixa_confianca" | "inconsistente_historico")[]; protocolId: string | null;
};

export async function listarFilaValidacao(ctx: TenantContext): Promise<{ itens: ItemFila[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ec.id AS evidence_id, ec.patient_id, p.nome AS patient_nome,
             ec.session_numero, ec.protocol_id, ec.classificacao_atual,
             s.nota_bruta AS trecho,           -- confirmar o nome real da coluna do texto do diário em session
             x.confianca, x.inconsistente_com_historico
      FROM evidence_current ec
      JOIN extraction x ON x.id = ec.extraction_id
      JOIN patient p ON p.id = ec.patient_id
      JOIN session s ON s.id = ec.session_id
      WHERE ec.invalidada = false
        AND (x.confianca = 'baixa' OR x.inconsistente_com_historico = true)
        AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
        AND NOT EXISTS (SELECT 1 FROM evidence_query q WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL)
      ORDER BY ec.session_numero ASC, ec.alvo_ordinal ASC`);
    const itens: ItemFila[] = (rows as unknown as any[]).map((r) => {
      const motivo: ItemFila["motivo"] = [];
      if (r.confianca === "baixa") motivo.push("baixa_confianca");
      if (r.inconsistente_com_historico) motivo.push("inconsistente_historico");
      return {
        evidenceId: r.evidence_id, patientId: r.patient_id, patientNome: r.patient_nome,
        sessionNumero: r.session_numero, trecho: r.trecho ?? "",
        classificacaoAtual: r.classificacao_atual, motivo, protocolId: r.protocol_id,
      };
    });
    return { itens, total: itens.length };
  });
}
```

> Confirmar no build: o nome real da coluna do texto do diário na tabela `session` (o snippet usa `nota_bruta` como placeholder — ler o schema de `session` e ajustar; provavelmente uma coluna de nota/observação da sessão). Se a evidência não tiver o texto na `session`, buscar de onde a timeline pega o trecho.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls src/app/(app)/validacao/queries.int.test.ts`
Expected: 5 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/validacao/queries.ts" "src/app/(app)/validacao/queries.int.test.ts"
git commit -m "feat(validacao): fila de validação query V1a/V1b (fase5 fatia1)"
```

---

### Task 2: Ações Confirmar + Invalidar — `validacao/actions.ts`

**Files:**
- Create: `src/app/(app)/validacao/actions.ts`
- Test: `src/app/(app)/validacao/actions.int.test.ts`

**Interfaces:**
- Consumes: `withTenant`, `requireRole`, `materializarSnapshot`/`drizzleMaterializarQueries`, tabelas `evidence`/`evidence_revision`/`audit_log`, view `evidence_current`.
- Produces:
  - `type ValidacaoResult = { ok?: boolean; error?: string }`
  - `async function confirmarEvidencia(ctx, { evidenceId: string }): Promise<ValidacaoResult>`
  - `async function invalidarEvidencia(ctx, { evidenceId: string; motivo: string }): Promise<ValidacaoResult>`
  - `type ValidacaoState = { ok?: boolean; error?: string }` + wrappers `confirmarEvidenciaAction`/`invalidarEvidenciaAction(prev, formData)`.
  - Helper interno `lerEvidenciaParaValidar(tx, evidenceId)` → `{ patientId, sessionNumero, classificacaoAtual } | null` (lê `evidence_current`, re-checa que não há revisão/query aberta — guarda de concorrência).

- [ ] **Step 1: Escrever os testes falhos**

`src/app/(app)/validacao/actions.int.test.ts` (mock server-only, hasDb, owner seed com evidência elegível). Casos desta task:

```ts
test("confirmar grava evidence_revision(acao=confirmar), sem audit, sem recompute", async () => {
  const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV });
  expect(r.ok).toBe(true);
  const [rev] = await owner!`SELECT acao, justificativa FROM evidence_revision WHERE evidence_id=${EV}`;
  expect(rev.acao).toBe("confirmar");
});
test("confirmar de novo (já tratada) → CONCURRENCY_ERROR", async () => {
  const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV });
  expect(r.error).toBe("CONCURRENCY_ERROR");
});
test("invalidar sem motivo → rejeita", async () => {
  const r = await invalidarEvidencia(ctxCoord, { evidenceId: EV2, motivo: "  " });
  expect(r.error).toBeTruthy();
  const rows = await owner!`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV2}`;
  expect(rows).toHaveLength(0);
});
test("invalidar grava revisão + audit_log(invalidacao) + evidência sai do cômputo", async () => {
  const r = await invalidarEvidencia(ctxCoord, { evidenceId: EV2, motivo: "fora de contexto" });
  expect(r.ok).toBe(true);
  const [rev] = await owner!`SELECT acao FROM evidence_revision WHERE evidence_id=${EV2}`;
  expect(rev.acao).toBe("invalidar");
  const [log] = await owner!`SELECT acao FROM audit_log WHERE entidade_id=${EV2} AND acao='invalidacao'`;
  expect(log.acao).toBe("invalidacao");
  const [ec] = await owner!`SELECT invalidada FROM evidence_current WHERE id=${EV2}`;
  expect(ec.invalidada).toBe(true);
});
test("terapeuta não valida (rota coordenador-only via requireRole)", async () => {
  const r = await confirmarEvidencia(ctxTerapeuta, { evidenceId: EV3 });
  expect(r.error).toBeTruthy();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/app/(app)/validacao/actions.int.test.ts`
Expected: FAIL — actions não existem.

- [ ] **Step 3: Implementar confirmar + invalidar + o esqueleto compartilhado**

Espelhar `revisao/[sessionId]/actions.ts` (imports `"use server"`, `getTenantContext`, `requireRole`/`RoleError`, `withTenant`, `revalidatePath`, Zod). Cada core: `requireRole(ctx, "coordenador")`; `withTenant`; advisory lock por paciente; `lerEvidenciaParaValidar` (re-check dentro da tx = guarda de concorrência → `CONCURRENCY_ERROR` se já tratada); insere; (invalidar) grava `audit_log` + recompute.

```ts
"use server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { drizzleMaterializarQueries, materializarSnapshot } from "@/lib/evidence/materializar";

export type ValidacaoResult = { ok?: boolean; error?: string };
export type ValidacaoState = { ok?: boolean; error?: string };

// Lê evidence_current + re-checa que ainda está na fila (guarda de concorrência).
async function lerEvidenciaParaValidar(tx: any, evidenceId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(
    (SELECT patient_id::text FROM evidence WHERE id = ${evidenceId}), 0))`);
  const rows = await tx.execute(sql`
    SELECT ec.patient_id, ec.session_numero, ec.classificacao_atual, ec.invalidada
    FROM evidence_current ec WHERE ec.id = ${evidenceId}`);
  const e = (rows as unknown as any[])[0];
  if (!e) return { erro: "NAO_ENCONTRADA" as const };
  if (e.invalidada) return { erro: "CONCURRENCY_ERROR" as const };
  const jaTratada = (await tx.execute(sql`
    SELECT 1 FROM evidence_revision WHERE evidence_id = ${evidenceId}
    UNION ALL SELECT 1 FROM evidence_query WHERE evidence_id = ${evidenceId} AND respondido_em IS NULL
    LIMIT 1`) as unknown as any[]).length > 0;
  if (jaTratada) return { erro: "CONCURRENCY_ERROR" as const };
  return { patientId: e.patient_id as string, sessionNumero: e.session_numero as number,
           classificacaoAtual: e.classificacao_atual };
}

export async function confirmarEvidencia(ctx: TenantContext, input: { evidenceId: string }): Promise<ValidacaoResult> {
  const p = z.object({ evidenceId: z.string().uuid() }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  requireRole(ctx, "coordenador");
  return withTenant(ctx, async (tx) => {
    const e = await lerEvidenciaParaValidar(tx, p.data.evidenceId);
    if ("erro" in e) return { error: e.erro === "NAO_ENCONTRADA" ? "Evidência não encontrada." : "CONCURRENCY_ERROR" };
    await tx.execute(sql`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${p.data.evidenceId}, 'confirmar', ${JSON.stringify(e.classificacaoAtual)}::jsonb, NULL, 'Confirmado.', ${ctx.userId}::uuid)`);
    return { ok: true };
  });
}

export async function invalidarEvidencia(ctx: TenantContext, input: { evidenceId: string; motivo: string }): Promise<ValidacaoResult> {
  const p = z.object({ evidenceId: z.string().uuid(), motivo: z.string().trim().min(1, "Motivo obrigatório.") }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  requireRole(ctx, "coordenador");
  return withTenant(ctx, async (tx) => {
    const e = await lerEvidenciaParaValidar(tx, p.data.evidenceId);
    if ("erro" in e) return { error: e.erro === "NAO_ENCONTRADA" ? "Evidência não encontrada." : "CONCURRENCY_ERROR" };
    await tx.execute(sql`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${p.data.evidenceId}, 'invalidar', ${JSON.stringify(e.classificacaoAtual)}::jsonb, NULL, ${p.data.motivo}, ${ctx.userId}::uuid)`);
    await tx.execute(sql`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'invalidacao', 'evidence', ${p.data.evidenceId}::uuid, ${e.patientId}::uuid, jsonb_build_object('motivo', ${p.data.motivo}::text))`);
    await materializarSnapshot(drizzleMaterializarQueries(tx), e.patientId, e.sessionNumero);
    return { ok: true };
  });
}

async function comCtx(formData: FormData, fn: (ctx: TenantContext) => Promise<ValidacaoResult>): Promise<ValidacaoState> {
  const ctx = await getTenantContext();
  try {
    const r = await fn(ctx);
    if (r.error) return { error: r.error };
    revalidatePath("/validacao");
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o coordenador valida." };
    console.error("wrapper validação:", err);
    return { error: "Não foi possível registrar a validação." };
  }
}

export async function confirmarEvidenciaAction(_p: ValidacaoState, fd: FormData): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) => confirmarEvidencia(ctx, { evidenceId: String(fd.get("evidenceId") ?? "") }));
}
export async function invalidarEvidenciaAction(_p: ValidacaoState, fd: FormData): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) => invalidarEvidencia(ctx, { evidenceId: String(fd.get("evidenceId") ?? ""), motivo: String(fd.get("motivo") ?? "") }));
}
```

> `requireRole` lança `RoleError` (não retorna) — por isso o core chama antes do `withTenant` e o wrapper captura. Confirmar a assinatura real de `requireRole` em `@/auth/require-role` (o teste "terapeuta não valida" prova o gate). Se `requireRole` for chamado dentro do core e o teste chamar o core direto, o `RoleError` propaga como throw — o teste deve usar `await expect(...).rejects` OU o core deve capturar; alinhar com o padrão de `revisao` (lá o wrapper captura). Para os testes de core desta task, envolver a chamada de papel-errado em `expect().rejects.toThrow()` OU testar via wrapper. Seguir o que `revisao/actions.int.test.ts` faz.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls src/app/(app)/validacao/actions.int.test.ts`
Expected: os 5 testes desta task PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/validacao/actions.ts" "src/app/(app)/validacao/actions.int.test.ts"
git commit -m "feat(validacao): confirmar + invalidar actions with audit + recompute (fase5 fatia1)"
```

---

### Task 3: Ação Reclassificar (com validação estruturada) — `validacao/actions.ts`

**Files:**
- Modify: `src/app/(app)/validacao/actions.ts` (adicionar a action)
- Create: `src/app/(app)/validacao/alvos.ts` (helper de alvos válidos + validação)
- Modify: `src/app/(app)/validacao/actions.int.test.ts` (casos de reclassificar)

**Interfaces:**
- Produces:
  - `alvos.ts`: `async function alvosValidosDoPaciente(tx, patientId): Promise<Alvo[]>` (alvos dos protocolos ATIVOS: goals/milestones + `tipo_estrutura`); `function montarClassificacaoNova(anterior, novoAlvo): unknown` (espelha a forma de `fase4-materializar:287`); validação de que o novo alvo resolve (`resolverAlvoParaFks` não-nulo) e `tipo_estrutura` compatível.
  - `reclassificarEvidencia(ctx, { evidenceId, novoAlvo, justificativa }): Promise<ValidacaoResult>` + wrapper.

- [ ] **Step 1: Escrever os testes falhos**

```ts
test("reclassificar sem justificativa → rejeita", async () => {
  const r = await reclassificarEvidencia(ctxCoord, { evidenceId: EV, novoAlvo: ALVO_VALIDO, justificativa: " " });
  expect(r.error).toBeTruthy();
});
test("reclassificar com alvo inválido (fora dos protocolos ativos) → rejeita", async () => {
  const r = await reclassificarEvidencia(ctxCoord, { evidenceId: EV, novoAlvo: ALVO_FORA, justificativa: "x" });
  expect(r.error).toMatch(/alvo/i);
});
test("reclassificar grava classificacao_nova estruturada + audit(reclassificacao) + recompute reflete", async () => {
  const r = await reclassificarEvidencia(ctxCoord, { evidenceId: EV, novoAlvo: ALVO_VALIDO, justificativa: "texto indica mando" });
  expect(r.ok).toBe(true);
  const [rev] = await owner!`SELECT acao, classificacao_nova FROM evidence_revision WHERE evidence_id=${EV}`;
  expect(rev.acao).toBe("reclassificar");
  expect(rev.classificacao_nova).not.toBeNull();
  const [log] = await owner!`SELECT 1 FROM audit_log WHERE entidade_id=${EV} AND acao='reclassificacao'`;
  expect(log).toBeTruthy();
  const [ec] = await owner!`SELECT classificacao_atual FROM evidence_current WHERE id=${EV}`;
  // classificacao_atual reflete o novo alvo
  expect(JSON.stringify(ec.classificacao_atual)).toContain(ALVO_VALIDO.goal_id);
});
```

> Antes de escrever `ALVO_VALIDO`/`montarClassificacaoNova`, LER `db/tests/fase4-materializar.int.test.ts` (bloco "recompute retroativo", ~L287) para copiar a forma EXATA do jsonb `classificacao_nova` que o recompute consome. É a fonte canônica.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/app/(app)/validacao/actions.int.test.ts -t reclassificar`
Expected: FAIL.

- [ ] **Step 3: Implementar `alvos.ts` + `reclassificarEvidencia`**

`alvos.ts`: lista alvos dos protocolos ativos (`patient_protocol` desativado_em IS NULL → `protocol` → `milestone`(dominio_id, tipo_estrutura)/`goal`), reusando o padrão de `resolver.ts` (`protocolosAtivos`, `marcos`). Valida o `novoAlvo` via `resolverAlvoParaFks` (non-null) e checa `tipo_estrutura` do marco resolvido. `montarClassificacaoNova(anterior, novoAlvo)` = `{ ...anterior, alvo: novoAlvo }` (espelhando a forma do teste canônico).

`reclassificarEvidencia`: Zod (`justificativa.trim().min(1)`), `requireRole('coordenador')`, `withTenant` + lock + `lerEvidenciaParaValidar`; valida `novoAlvo` (senão `{ error: "Alvo inválido..." }`); insere `evidence_revision(acao=reclassificar, classificacao_anterior=atual, classificacao_nova=montada, justificativa)`; `audit_log(acao='reclassificacao', detalhe={de,para,justificativa})`; `materializarSnapshot(tx, patientId, sessionNumero)`. Wrapper `reclassificarEvidenciaAction` lê `evidenceId`/`justificativa`/`novoAlvo`(JSON) do FormData.

(Código completo: espelhar exatamente `invalidarEvidencia` da Task 2, trocando a montagem de `classificacao_nova` e adicionando a validação de alvo de `alvos.ts`.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls src/app/(app)/validacao/actions.int.test.ts`
Expected: todos os testes (Task 2 + Task 3) PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/validacao/actions.ts" "src/app/(app)/validacao/alvos.ts" "src/app/(app)/validacao/actions.int.test.ts"
git commit -m "feat(validacao): reclassificar with structured target validation + recompute (fase5 fatia1)"
```

---

### Task 3b: Reclassificação de ALVO efetiva no recompute — tocar `materializar`

> **Por que existe (achado de implementação, decisão do Rômulo 19/07):** o `materializar` chaveia os
> streams de segmentação/repertório pelas **colunas estáticas** `evidence_current.goal_id/protocol_id/
> milestone_id` (congeladas de `evidence`) — do jsonb só lê `nivel_ajuda`/`polaridade`. Logo,
> reclassificar o ALVO (tato→mando) fica auditável mas **não move** a evidência de stream. Esta task
> corrige isso: reclassify passa a **persistir as FKs resolvidas** do novo alvo, e o `materializar`
> passa a **preferi-las** sobre as colunas estáticas. **Sem migração** (mudança na lógica/queries do
> `materializar` + na montagem de `classificacao_nova`; não altera o schema nem a view).

**Files:**
- Modify: `src/app/(app)/validacao/alvos.ts` (`montarClassificacaoNova` grava as FKs resolvidas)
- Modify: `src/lib/evidence/materializar.ts` (`rowParaObservacao` prefere as FKs reclassificadas)
- Test: `db/tests/fase4-materializar.int.test.ts` (novo caso: reclassificar ALVO move o stream)
- Test: `src/app/(app)/validacao/actions.int.test.ts` (reclassificar grava as FKs resolvidas)

**Interfaces:**
- Consumes: `resolverAlvoParaFks` (já usado na Task 3 para validar → devolve `{ goalId, protocolId, milestoneId }`).
- Produces: `classificacao_nova` passa a conter `alvo_resolvido: { goal_id, protocol_id, milestone_id }` (snake, os FKs resolvidos); `rowParaObservacao` lê `goalId/protocolId/milestoneId` de `classificacao_atual.alvo_resolvido` quando presente, senão das colunas estáticas.

- [ ] **Step 1: Escrever o teste falho (o cenário que hoje é inerte)**

Em `db/tests/fase4-materializar.int.test.ts`, novo caso no bloco de recompute: seed evidência no goal A; grava `evidence_revision(acao=reclassificar)` com `classificacao_nova.alvo_resolvido` apontando para o goal **B** (dos protocolos ativos); chama `materializarSnapshot(..., desdeNumero)`; **assere que o snapshot passa a contar a evidência no stream de B, não de A** (repertório/segmentação de B reflete; A não).

```ts
test("reclassificar o ALVO (goal A → goal B) move a evidência de stream no recompute", async () => {
  // seed evidência estática em GOAL_A; revisão reclassificar com alvo_resolvido = GOAL_B
  await owner!`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
    VALUES (${EV}, 'reclassificar', ${JSON.stringify(anterior)}::jsonb,
            ${JSON.stringify({ ...anterior, alvo_resolvido: { goal_id: GOAL_B, protocol_id: PROT, milestone_id: MS_B } })}::jsonb,
            'corrige alvo', ${U_COORD})`;
  await materializarSnapshot(postgresMaterializarQueries(owner!), PAC, 1);
  const snap = await lerSnapshot(SESS_NUMERO);
  expect(snap!.segmentacao[GOAL_B]).toBeDefined();   // evidência agora conta em B
  expect(snap!.segmentacao[GOAL_A]).toBeUndefined();  // não mais em A
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node_modules/.bin/vitest run --config vitest.integration.config.ts db/tests/fase4-materializar.int.test.ts -t "move a evidência"`
Expected: FAIL — hoje o stream continua em A (colunas estáticas).

- [ ] **Step 3: Implementar as duas mudanças**

`alvos.ts` — `montarClassificacaoNova(anterior, novoAlvo, fksResolvidas)` inclui `alvo_resolvido: { goal_id, protocol_id, milestone_id }` (as FKs que `resolverAlvoParaFks` já devolveu na validação). Ajustar `reclassificarEvidencia` (Task 3) para passar as FKs resolvidas.

`materializar.ts` `rowParaObservacao` (~L212-228) — preferir o alvo reclassificado:
```ts
const alvoRe = (r.classificacaoAtual ?? r.classificacao_atual)?.alvo_resolvido;
return {
  // ...
  goalId: alvoRe?.goal_id ?? (r.goalId ?? r.goal_id) ?? null,
  milestoneId: alvoRe?.milestone_id ?? (r.milestoneId ?? r.milestone_id) ?? null,
  protocolId: alvoRe?.protocol_id ?? (r.protocolId ?? r.protocol_id) ?? null,
  // ...
};
```
Garantir que ambos os adapters (drizzle L234-236, postgres L167-177) tragam `classificacao_atual` no SELECT (o drizzle já traz; confirmar o postgres). `invalidada`/conteúdo permanecem como estão.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node_modules/.bin/vitest run --config vitest.integration.config.ts db/tests/fase4-materializar.int.test.ts "src/app/(app)/validacao/actions.int.test.ts"`
Expected: o novo caso PASS + todos os casos existentes de `fase4-materializar` **continuam verdes** (não regredir o recompute de conteúdo).

- [ ] **Step 5: Commit**

```bash
git add "src/lib/evidence/materializar.ts" "src/app/(app)/validacao/alvos.ts" "src/app/(app)/validacao/actions.ts" db/tests/fase4-materializar.int.test.ts "src/app/(app)/validacao/actions.int.test.ts"
git commit -m "feat(evidence): recompute honors reclassified target (fase5 fatia1)"
```

---

### Task 4: Ação Devolver com dúvida — `validacao/actions.ts`

**Files:**
- Modify: `src/app/(app)/validacao/actions.ts`
- Modify: `src/app/(app)/validacao/actions.int.test.ts`

**Interfaces:**
- Produces: `devolverComDuvida(ctx, { evidenceId, pergunta }): Promise<ValidacaoResult>` + wrapper.

- [ ] **Step 1: Teste falho**

```ts
test("devolver sem pergunta → rejeita", async () => {
  const r = await devolverComDuvida(ctxCoord, { evidenceId: EV, pergunta: " " });
  expect(r.error).toBeTruthy();
});
test("devolver abre evidence_query + audit(devolucao) + recompute exclui do cômputo", async () => {
  const r = await devolverComDuvida(ctxCoord, { evidenceId: EV, pergunta: "isso é mando ou tato?" });
  expect(r.ok).toBe(true);
  const [q] = await owner!`SELECT respondido_em FROM evidence_query WHERE evidence_id=${EV}`;
  expect(q.respondido_em).toBeNull();
  const [log] = await owner!`SELECT 1 FROM audit_log WHERE entidade_id=${EV} AND acao='devolucao'`;
  expect(log).toBeTruthy();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/app/(app)/validacao/actions.int.test.ts -t devolver`
Expected: FAIL.

- [ ] **Step 3: Implementar `devolverComDuvida`**

Zod (`pergunta.trim().min(1)`), `requireRole('coordenador')`, `withTenant`+lock+`lerEvidenciaParaValidar`; `INSERT evidence_query(evidence_id, coordenador_id=ctx.userId, pergunta)`; `audit_log(acao='devolucao', detalhe={pergunta})`; `materializarSnapshot(tx, patientId, sessionNumero)` (query aberta → evidência sai do cômputo). Wrapper análogo.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls src/app/(app)/validacao/actions.int.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/validacao/actions.ts" "src/app/(app)/validacao/actions.int.test.ts"
git commit -m "feat(validacao): devolver com dúvida opens evidence_query + recompute (fase5 fatia1)"
```

---

### Task 5: Responder query (lado do terapeuta) — `duvidas/`

**Files:**
- Create: `src/app/(app)/duvidas/actions.ts`
- Create: `src/app/(app)/duvidas/queries.ts`
- Test: `src/app/(app)/duvidas/actions.int.test.ts`

**Interfaces:**
- Produces:
  - `queries.ts`: `listarDuvidasAbertas(ctx)` → queries abertas das evidências da equipe do terapeuta (via RLS `app_is_on_team`).
  - `actions.ts`: `responderQuery(ctx, { evidenceQueryId, respostaTexto, novoAlvo? }): Promise<ValidacaoResult>` + wrapper. Fecha a query e, se `novoAlvo`, cria a `evidence_revision(reclassificar)` resultante + liga em `resultante_evidence_revision_id`. Recompute re-inclui a evidência.

- [ ] **Step 1: Testes falhos**

```ts
test("terapeuta responde query → fecha (respondido_em) e recompute re-inclui a evidência", async () => {
  const r = await responderQuery(ctxTerapeuta, { evidenceQueryId: Q, respostaTexto: "é mando" });
  expect(r.ok).toBe(true);
  const [q] = await owner!`SELECT respondido_em FROM evidence_query WHERE id=${Q}`;
  expect(q.respondido_em).not.toBeNull();
});
test("responder com novoAlvo cria evidence_revision resultante e liga na query", async () => {
  const r = await responderQuery(ctxTerapeuta, { evidenceQueryId: Q2, respostaTexto: "corrigindo", novoAlvo: ALVO_VALIDO });
  expect(r.ok).toBe(true);
  const [q] = await owner!`SELECT resultante_evidence_revision_id FROM evidence_query WHERE id=${Q2}`;
  expect(q.resultante_evidence_revision_id).not.toBeNull();
});
test("terapeuta fora da equipe não responde (RLS)", async () => {
  const r = await responderQuery(ctxTerapeutaForaEquipe, { evidenceQueryId: Q3, respostaTexto: "x" });
  expect(r.ok).not.toBe(true);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/app/(app)/duvidas/actions.int.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`responderQuery`: `requireRole(ctx, "terapeuta", "coordenador")`; `withTenant`+lock (por paciente da evidência da query); se `novoAlvo`: validar (reusa `alvos.ts` da Task 3) + `INSERT evidence_revision(acao=reclassificar, ..., autor_id=ctx.userId)` (a RLS `evidence_revision_insert` permite o terapeuta porque há query aberta) → captura o `id`; `UPDATE evidence_query SET resposta_texto=…, respondido_em=now(), resultante_evidence_revision_id=<id|null> WHERE id=… AND respondido_em IS NULL` (a RLS `evidence_query_update` só deixa enquanto aberta e para equipe); ler `patientId`/`sessionNumero` da evidência; `materializarSnapshot(tx, patientId, sessionNumero)` (query fechada → evidência volta ao cômputo). Se o UPDATE afetar 0 linhas → `CONCURRENCY_ERROR` (já respondida). `queries.ts`: `listarDuvidasAbertas` via `withTenant` join `evidence_query`(respondido_em IS NULL) → `evidence` (RLS restringe à equipe).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls src/app/(app)/duvidas/actions.int.test.ts`
Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/duvidas/actions.ts" "src/app/(app)/duvidas/queries.ts" "src/app/(app)/duvidas/actions.int.test.ts"
git commit -m "feat(duvidas): terapeuta responde evidence_query + recompute re-includes (fase5 fatia1)"
```

---

### Task 6: UI da fila do coordenador — `validacao/page.tsx` + client

**Files:**
- Create: `src/app/(app)/validacao/page.tsx`
- Create: `src/app/(app)/validacao/validacao-fila.tsx`
- Test: `src/app/(app)/validacao/a11y.test.tsx`

**Interfaces:** Consome `listarFilaValidacao` (Task 1) + as 4 actions (Tasks 2-4) + `alvosValidosDoPaciente` (para o picker).

- [ ] **Step 1: a11y test falho** (espelha `excecoes/a11y.test.tsx`: renderiza o client com fixtures VAZIA/CHEIA, `axe.run`, sem violações).
- [ ] **Step 2: Rodar e confirmar que falha.** Run: `pnpm test src/app/(app)/validacao/a11y.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** `page.tsx` (server, `if (ctx.role !== "coordenador") notFound()`, chama `listarFilaValidacao`, passa itens ao client) + `validacao-fila.tsx` (client, **design system**, card "item N de M" com trecho, classificação atual, chips de motivo, barra `[Confirmar] [Reclassificar ▾] [Devolver] [Invalidar]`; forms `useActionState` com os wrappers; **reclassificar pede confirmação** (tiro-único) e usa picker de alvos; sem ação em lote). Ler os alvos do paciente para o picker (passar do server ou action dedicada).
- [ ] **Step 4: Rodar e confirmar que passa.** `pnpm test src/app/(app)/validacao/a11y.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(validacao): coordinator queue UI card + actions wiring (fase5 fatia1)`.

---

### Task 7: UI "dúvidas do coordenador" (terapeuta) — `duvidas/page.tsx` + client

**Files:**
- Create: `src/app/(app)/duvidas/page.tsx`, `src/app/(app)/duvidas/duvidas-lista.tsx`
- Test: `src/app/(app)/duvidas/a11y.test.tsx`

**Interfaces:** Consome `listarDuvidasAbertas` + `responderQuery` (Task 5).

- [ ] **Step 1: a11y test falho** (fixtures vazia/cheia).
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** `page.tsx` (server; terapeuta/coordenador; lista `listarDuvidasAbertas`) + `duvidas-lista.tsx` (client, design system, card com a pergunta do coordenador + campo de resposta + opção de corrigir alvo; form `useActionState` com `responderQuery`).
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit** `feat(duvidas): therapist answer-query surface (fase5 fatia1)`.

---

### Task 8: V4 passiva — revisão visível na timeline do terapeuta

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/timeline/queries.ts`
- Test: `src/app/(app)/pacientes/[id]/timeline/queries.int.test.ts` (adicionar caso)

**Interfaces:** a timeline passa a expor, por evidência, a revisão do coordenador (`acao`, `justificativa`, autor, `criado_em`) quando existir.

- [ ] **Step 1: Teste falho** — seed evidência + `evidence_revision(reclassificar, justificativa)`; a query da timeline deve retornar a justificativa + nome do autor da revisão.
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** — trocar/estender a leitura para pegar `evidence_current` (classificação atual/invalidada) e a **última `evidence_revision`** (join `app_user` p/ autor), expondo `justificativa`/`autorNome`/`acao`. Render mínimo do texto (a UI da timeline mostra "Revisado por <autor>: <justificativa>"). **Não** construir sino/push.
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit** `feat(timeline): surface coordinator revision (justificativa+autor) — V4 passive (fase5 fatia1)`.

---

### Task 9: Link de entrada + BACKLOG + verificação final

**Files:**
- Modify: `src/app/(app)/excecoes/page.tsx` (ou o shell coordenador) — link para `/validacao`.
- Modify: `BACKLOG.md`

- [ ] **Step 1:** Adicionar um link/entrada para a fila de validação onde o coordenador já entra (ex.: `excecoes/`), sem quebrar a a11y existente.
- [ ] **Step 2:** `BACKLOG.md` — registrar o adiado: sinais **V1c/V1d/V1e/V1f**; **V4 ativa (dívida de compliance)**; **checklist por protocolo** estruturado; **V5** (métricas/dataset); **caminho de correção de reclassificação** (fila hoje é tiro-único). Estilo das entradas existentes.
- [ ] **Step 3: Verificação final.** Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` → tudo verde.
- [ ] **Step 4: Commit** `docs(fase5): validacao entry link + backlog for fatia 1 deferred scope`.

---

## Definição de Pronto (Fatia 1) — mapeada às tasks

- [ ] Fila V1a/V1b, exclui tratada/devolvida/invalidada, cross-tenant → 0 (Task 1).
- [ ] Confirmar/invalidar/reclassificar/devolver: 1 tx, advisory lock, `requireRole('coordenador')`, guarda de concorrência (Tasks 2-4).
- [ ] Reclassificar: `classificacao_nova` estruturada validada (alvo ativo + `tipo_estrutura`), audit, recompute reflete (Task 3).
- [ ] Invalidar/devolver: audit + recompute (evidência sai do cômputo) (Tasks 2,4).
- [ ] Justificativa/motivo/pergunta vazio → rejeita (Tasks 2-4).
- [ ] `responderQuery`: fecha query, cria revisão resultante se corrige, recompute re-inclui; terapeuta fora da equipe barrado (Task 5).
- [ ] UI coordenador (card, 4 ações, confirmação em reclassificar, sem lote, design system) (Task 6).
- [ ] UI terapeuta "dúvidas" (Task 7).
- [ ] V4 passiva: revisão (justificativa+autor) na timeline (Task 8).
- [ ] Rotas: `validacao` coordenador-only; `duvidas` terapeuta-da-equipe.
- [ ] BACKLOG com o escopo adiado (Task 9).
- [ ] `pnpm typecheck`/`lint`/`test`/`test:rls` verdes (Task 9).
