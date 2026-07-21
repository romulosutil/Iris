# Fatia 3 — Dossiê de Convênio (`convenio_bruto`) + PDF real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exportar o dossiê factual de auditoria de convênio (`report_tipo=convenio_bruto`) como PDF real via Chromium, sem IA, respeitando RLS e sem tocar o trilho F0.

**Architecture:** Builder de payload lê `session`/`evidence` sob RLS e grava jsonb factual em `report`; um template HTML puro (com escape) vira PDF por um `PlaywrightPdfRenderer` sandboxado e serializado por semáforo; a server action insere `report` (rascunho transiente) e chama o `exportReport` do F0 na **mesma transação**. Spec: `docs/superpowers/specs/2026-07-20-fase5-fatia3-dossie-convenio-bruto-design.md`.

**Tech Stack:** Next.js 16 (App Router), Drizzle + Postgres (RLS via `withTenant`), Playwright (Chromium headless, runtime), Vitest.

## Global Constraints

- Runtime & versão: Node >= 22, Next.js 16, React 19, TypeScript. Copy/UI em **pt-BR**.
- **Nunca exportar helper que aceita `ctx: TenantContext` de dentro de um módulo `"use server"`** — helpers ctx-accepting vivem em `queries.ts`/libs sem `"use server"`; a action deriva o ctx com `getTenantContext()` internamente. (Regra endurecida Fatia 2.)
- `TenantContext = { clinicId: string; userId: string; role: "terapeuta"|"coordenador"|"admin_recepcao" }` (`src/db/rls.ts:6-9`). **Não há `patientId` no ctx.**
- Escritas sob RLS: `withTenant(ctx, async (tx) => …)`; INSERTs via `tx.execute(sql\`INSERT … VALUES (${v}::uuid, …)\`)` com casts explícitos `::uuid`/`::jsonb`/`::date` (params chegam como texto). Espelhar `src/app/(app)/validacao/actions.ts:105-143`.
- **Não modificar** `src/lib/report/export.ts`, `download.ts`, `hash.ts` (trilho F0 auditado). `PdfRenderer` interface (`src/lib/report/renderer.ts:3-5`): `render(html: string): Promise<Buffer>`.
- **Sem migration nesta fatia**: `convenio_bruto` já é valor do enum `reportTipo` (`src/db/schema.ts:941`); a policy `report_scope FOR ALL` (`db/migrations/0039_fase5_report_audit_rls.sql:21-34`) já cobre o INSERT (coordenador clínica OU terapeuta on-team).
- Testes de integração: guard `describe.skipIf(!hasDb)`; seed com owner (`MIGRATION_DATABASE_URL`, bypassa RLS) + `TRUNCATE … RESTART IDENTITY CASCADE`; asserts sob `withTenant`. Espelhar `src/lib/report/export.int.test.ts` e `src/db/rls.int.test.ts`.
- `admin_recepcao` **nunca** acessa dado clínico.

---

## File Structure

```
src/lib/report/convenio-bruto/
  types.ts            # PayloadConvenioBruto (fora de "use server")
  build-html.ts       # buildConvenioBrutoHtml(payload): string  [puro, escapeHtml]
  build-payload.ts    # buildConvenioBrutoPayload(tx, args): Promise<PayloadConvenioBruto>
  build-html.test.ts
  build-payload.int.test.ts
src/lib/report/
  render-lock.ts          # withRenderLock<T>(fn): Promise<T>  [semáforo N=1]
  render-lock.test.ts
  playwright-renderer.ts  # PlaywrightPdfRenderer implements PdfRenderer
  playwright-renderer.int.test.ts   # SSRF + PDF real
src/app/(app)/relatorios/
  queries.ts          # previewConvenioBruto(ctx, args)  [server-only, ctx-accepting]
  queries.int.test.ts
  actions.ts          # "use server" — exportarConvenioBruto core + comCtx wrapper
  actions.int.test.ts
  page.tsx            # UI seleção+preview+export+download
src/db/rls.int.test.ts   # +casos report convenio_bruto (modificar)
infra/Dockerfile         # runner stage Chromium (modificar) — INFRA-GATE
package.json             # playwright → dependencies (modificar)
BACKLOG.md               # fechamento + dívidas (modificar)
```

---

### Task 1: Tipo do payload + template HTML puro

**Files:**
- Create: `src/lib/report/convenio-bruto/types.ts`
- Create: `src/lib/report/convenio-bruto/build-html.ts`
- Test: `src/lib/report/convenio-bruto/build-html.test.ts`

**Interfaces:**
- Produces: `type PayloadConvenioBruto` (shape jsonb); `buildConvenioBrutoHtml(payload: PayloadConvenioBruto): string`.
- Consumes: `escapeHtml` de `src/lib/report/sanitize.ts:6-8`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/convenio-bruto/build-html.test.ts
import { describe, expect, test } from "vitest";
import { buildConvenioBrutoHtml } from "./build-html";
import type { PayloadConvenioBruto } from "./types";

const base: PayloadConvenioBruto = {
  paciente: { nome: "Miguel S." },
  periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
  geradoEm: "2026-07-20T12:00:00.000Z",
  sessoes: [
    { numeroSequencial: 8, data: "2026-06-10", disciplina: "ABA", modalidade: "presencial",
      estado: "realizada", justificada: null, terapeuta: "Dra. Ana" },
  ],
  evidencias: [
    { data: "2026-06-10", metaOuDominio: "Mando", classificacao: '{"rotulo":"adquirido"}', autor: "Dra. Ana" },
  ],
  presenca: { sessoesRealizadas: 8, faltasJustificadas: 1, faltasNaoJustificadas: 0 },
};

test("monta HTML com dados factuais do período", () => {
  const html = buildConvenioBrutoHtml(base);
  expect(html).toContain("Miguel S.");
  expect(html).toContain("8 sessões realizadas");
  expect(html).toContain("Dra. Ana");
});

test("escapa texto livre (anti-injeção de markup)", () => {
  const html = buildConvenioBrutoHtml({ ...base, paciente: { nome: '<script>x</script>' } });
  expect(html).not.toContain("<script>x</script>");
  expect(html).toContain("&lt;script&gt;");
});

test("não interpola URL/asset remoto nem <script> próprio", () => {
  const html = buildConvenioBrutoHtml(base);
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toMatch(/<script\b(?![^>]*\/nonce)/); // sem <script> executável
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/report/convenio-bruto/build-html.test.ts`
Expected: FAIL — `Cannot find module './build-html'`.

- [ ] **Step 3: Write `types.ts`**

```ts
// src/lib/report/convenio-bruto/types.ts
export type PayloadConvenioBruto = {
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  geradoEm: string;
  sessoes: Array<{
    numeroSequencial: number | null;
    data: string;
    disciplina: string;
    modalidade: string;
    estado: string;
    justificada: boolean | null;
    terapeuta: string;
  }>;
  evidencias: Array<{
    data: string;
    metaOuDominio: string;
    classificacao: string;
    autor: string;
  }>;
  presenca: {
    sessoesRealizadas: number;
    faltasJustificadas: number;
    faltasNaoJustificadas: number;
  };
};
```

- [ ] **Step 4: Write `build-html.ts`**

```ts
// src/lib/report/convenio-bruto/build-html.ts
import { escapeHtml } from "../sanitize";
import type { PayloadConvenioBruto } from "./types";

const ESTADO_LABEL: Record<string, string> = {
  realizada: "Realizada",
  falta_paciente: "Falta (paciente)",
  falta_terapeuta: "Falta (terapeuta)",
  cancelada: "Cancelada",
  agendada: "Agendada",
};

function linhaSessao(s: PayloadConvenioBruto["sessoes"][number]): string {
  const just = s.justificada === true ? " · justificada" : "";
  return `<tr>
    <td>${s.numeroSequencial ?? "—"}</td>
    <td>${escapeHtml(s.data)}</td>
    <td>${escapeHtml(s.disciplina)}</td>
    <td>${escapeHtml(s.modalidade)}</td>
    <td>${escapeHtml(ESTADO_LABEL[s.estado] ?? s.estado)}${just}</td>
    <td>${escapeHtml(s.terapeuta)}</td>
  </tr>`;
}

function linhaEvidencia(e: PayloadConvenioBruto["evidencias"][number]): string {
  return `<tr>
    <td>${escapeHtml(e.data)}</td>
    <td>${escapeHtml(e.metaOuDominio)}</td>
    <td>${escapeHtml(e.classificacao)}</td>
    <td>${escapeHtml(e.autor)}</td>
  </tr>`;
}

export function buildConvenioBrutoHtml(p: PayloadConvenioBruto): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  html{font-family:system-ui,sans-serif;color:#111;font-size:12px}
  h1{font-size:18px} table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
  .rodape{margin-top:16px;font-size:10px;color:#555}
</style></head><body>
<h1>Dossiê para convênio — ${escapeHtml(p.paciente.nome)}</h1>
<p>Período: ${escapeHtml(p.periodo.inicio)} a ${escapeHtml(p.periodo.fim)} · Gerado em ${escapeHtml(p.geradoEm)}</p>
<p>${p.presenca.sessoesRealizadas} sessões realizadas, ${p.presenca.faltasJustificadas} falta(s) justificada(s), ${p.presenca.faltasNaoJustificadas} não justificada(s).</p>
<h2>Sessões</h2>
<table><thead><tr><th>#</th><th>Data</th><th>Disciplina</th><th>Modalidade</th><th>Estado</th><th>Terapeuta</th></tr></thead>
<tbody>${p.sessoes.map(linhaSessao).join("")}</tbody></table>
<h2>Evidências aprovadas</h2>
<table><thead><tr><th>Data</th><th>Meta/Domínio</th><th>Classificação</th><th>Autor</th></tr></thead>
<tbody>${p.evidencias.map(linhaEvidencia).join("")}</tbody></table>
<p class="rodape">Documento factual, sem interpretação — cada linha remete à sessão/evidência de origem, auditável ponto a ponto.</p>
</body></html>`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/report/convenio-bruto/build-html.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/report/convenio-bruto/types.ts src/lib/report/convenio-bruto/build-html.ts src/lib/report/convenio-bruto/build-html.test.ts
git commit -m "feat(fase5): template HTML factual do dossiê convenio_bruto"
```

---

### Task 2: Builder de payload (leitura sob RLS)

**Files:**
- Create: `src/lib/report/convenio-bruto/build-payload.ts`
- Test: `src/lib/report/convenio-bruto/build-payload.int.test.ts`

**Interfaces:**
- Consumes: `Tx` de `src/db/rls.ts:14`; tabelas `session`, `evidence`, `app_user`; `PayloadConvenioBruto` (Task 1).
- Produces: `buildConvenioBrutoPayload(tx: Tx, args: { patientId: string; nomePaciente: string; periodoInicio: string; periodoFim: string }): Promise<PayloadConvenioBruto>`.

> **Nota de leitura de rows:** `tx.execute(sql\`SELECT …\`)` devolve a lista de linhas. Espelhe o acesso a rows de `src/app/(app)/validacao/queries.ts:43-60` (mesma stack drizzle+postgres-js). Use `for (const r of rows)` iterando o resultado.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/convenio-bruto/build-payload.int.test.ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../../db/rls";
import { buildConvenioBrutoPayload } from "./build-payload";

const hasDb = !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!) : (null as never);

const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA = "33333333-3333-3333-3333-333333333333";
const PAC = "44444444-4444-4444-4444-444444444444";
const SES = "55555555-5555-5555-5555-555555555555";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({ role, userId, clinicId: CLINIC });

describe.skipIf(!hasDb)("buildConvenioBrutoPayload", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session, evidence RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD}, 'Coord', 'c@a.test'), (${TERA}, 'Dra. Ana', 't@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD}, ${CLINIC}, 'coordenador'), (${TERA}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel S.')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, estado, numero_sequencial_paciente)
      VALUES (${SES}, ${CLINIC}, ${PAC}, ${TERA}, 'ABA', '2026-06-10T09:00:00Z', 'realizada', 8)`;
    await owner`INSERT INTO evidence (id, clinic_id, patient_id, session_id, session_numero, aprovado_por, aprovado_em, classificacao_original, goal_ref)
      VALUES (gen_random_uuid(), ${CLINIC}, ${PAC}, ${SES}, 8, ${TERA}, '2026-06-10T10:00:00Z', '{"rotulo":"adquirido"}'::jsonb, 'Mando')`;
  });
  afterAll(async () => { if (hasDb) await owner.end(); });

  test("coordenador agrega sessões, evidências e presença do período", async () => {
    const payload = await withTenant(ctx("coordenador", COORD), (tx) =>
      buildConvenioBrutoPayload(tx, { patientId: PAC, nomePaciente: "Miguel S.", periodoInicio: "2026-06-01", periodoFim: "2026-06-30" }));
    expect(payload.sessoes).toHaveLength(1);
    expect(payload.sessoes[0]!.terapeuta).toBe("Dra. Ana");
    expect(payload.evidencias).toHaveLength(1);
    expect(payload.evidencias[0]!.metaOuDominio).toBe("Mando");
    expect(payload.presenca.sessoesRealizadas).toBe(1);
  });

  test("exclui dados fora do período", async () => {
    const payload = await withTenant(ctx("coordenador", COORD), (tx) =>
      buildConvenioBrutoPayload(tx, { patientId: PAC, nomePaciente: "Miguel S.", periodoInicio: "2026-05-01", periodoFim: "2026-05-31" }));
    expect(payload.sessoes).toHaveLength(0);
    expect(payload.evidencias).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/report/convenio-bruto/build-payload.int.test.ts`
Expected: FAIL — módulo `./build-payload` não existe.

- [ ] **Step 3: Write `build-payload.ts`**

```ts
// src/lib/report/convenio-bruto/build-payload.ts
import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/rls";
import type { PayloadConvenioBruto } from "./types";

type Args = { patientId: string; nomePaciente: string; periodoInicio: string; periodoFim: string };

export async function buildConvenioBrutoPayload(tx: Tx, args: Args): Promise<PayloadConvenioBruto> {
  const { patientId, nomePaciente, periodoInicio, periodoFim } = args;

  const sessoesRows = (await tx.execute(sql`
    SELECT s.numero_sequencial_paciente AS num, to_char(s.agendada_para, 'YYYY-MM-DD') AS data,
           s.disciplina, s.modalidade::text AS modalidade, s.estado::text AS estado, s.justificada, u.name AS terapeuta
    FROM session s JOIN app_user u ON u.id = s.terapeuta_id
    WHERE s.patient_id = ${patientId}::uuid
      AND s.agendada_para >= ${periodoInicio}::date
      AND s.agendada_para < (${periodoFim}::date + 1)
    ORDER BY s.agendada_para
  `)) as unknown as Array<Record<string, unknown>>;

  const evidRows = (await tx.execute(sql`
    SELECT to_char(e.aprovado_em, 'YYYY-MM-DD') AS data,
           COALESCE(e.goal_ref, e.protocol_slug, e.dominio_id, 'n/d') AS meta,
           e.classificacao_original::text AS classificacao, u.name AS autor
    FROM evidence e JOIN app_user u ON u.id = e.aprovado_por
    WHERE e.patient_id = ${patientId}::uuid
      AND e.aprovado_em >= ${periodoInicio}::date
      AND e.aprovado_em < (${periodoFim}::date + 1)
    ORDER BY e.aprovado_em
  `)) as unknown as Array<Record<string, unknown>>;

  const sessoes = sessoesRows.map((r) => ({
    numeroSequencial: r.num === null ? null : Number(r.num),
    data: String(r.data),
    disciplina: String(r.disciplina),
    modalidade: String(r.modalidade),
    estado: String(r.estado),
    justificada: r.justificada === null ? null : Boolean(r.justificada),
    terapeuta: String(r.terapeuta),
  }));

  const evidencias = evidRows.map((r) => ({
    data: String(r.data),
    metaOuDominio: String(r.meta),
    classificacao: String(r.classificacao),
    autor: String(r.autor),
  }));

  const presenca = {
    sessoesRealizadas: sessoes.filter((s) => s.estado === "realizada").length,
    faltasJustificadas: sessoes.filter((s) => s.estado.startsWith("falta") && s.justificada === true).length,
    faltasNaoJustificadas: sessoes.filter((s) => s.estado.startsWith("falta") && s.justificada !== true).length,
  };

  return {
    paciente: { nome: nomePaciente },
    periodo: { inicio: periodoInicio, fim: periodoFim },
    geradoEm: new Date().toISOString(),
    sessoes,
    evidencias,
    presenca,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/report/convenio-bruto/build-payload.int.test.ts`
Expected: PASS (2 testes). Se `hasDb` falso, SKIPPED — subir DB local (`docker compose -f infra/docker-compose.yml up -d`) e reexecutar.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/convenio-bruto/build-payload.ts src/lib/report/convenio-bruto/build-payload.int.test.ts
git commit -m "feat(fase5): builder de payload factual do dossiê convenio_bruto"
```

---

### Task 3: Semáforo de render (concorrência N=1)

**Files:**
- Create: `src/lib/report/render-lock.ts`
- Test: `src/lib/report/render-lock.test.ts`

**Interfaces:**
- Produces: `withRenderLock<T>(fn: () => Promise<T>): Promise<T>` — serializa execuções (máx `RENDER_MAX_CONCURRENCY`, default 1); os demais aguardam em fila FIFO.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report/render-lock.test.ts
import { describe, expect, test } from "vitest";
import { withRenderLock } from "./render-lock";

test("serializa: nunca mais de 1 execução concorrente", async () => {
  let ativos = 0;
  let maxAtivos = 0;
  const tarefa = () => withRenderLock(async () => {
    ativos++; maxAtivos = Math.max(maxAtivos, ativos);
    await new Promise((r) => setTimeout(r, 20));
    ativos--; return "ok";
  });
  const res = await Promise.all([tarefa(), tarefa(), tarefa()]);
  expect(res).toEqual(["ok", "ok", "ok"]);
  expect(maxAtivos).toBe(1);
});

test("libera o lock mesmo se fn lançar", async () => {
  await expect(withRenderLock(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  await expect(withRenderLock(async () => "recuperou")).resolves.toBe("recuperou");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/report/render-lock.test.ts`
Expected: FAIL — módulo `./render-lock` não existe.

- [ ] **Step 3: Write `render-lock.ts`**

```ts
// src/lib/report/render-lock.ts
const MAX = Number(process.env.RENDER_MAX_CONCURRENCY ?? "1");

let emUso = 0;
const fila: Array<() => void> = [];

function adquirir(): Promise<void> {
  if (emUso < MAX) { emUso++; return Promise.resolve(); }
  return new Promise((resolve) => fila.push(resolve));
}

function liberar(): void {
  const proximo = fila.shift();
  if (proximo) proximo();
  else emUso--;
}

export async function withRenderLock<T>(fn: () => Promise<T>): Promise<T> {
  await adquirir();
  try {
    return await fn();
  } finally {
    liberar();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/report/render-lock.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/render-lock.ts src/lib/report/render-lock.test.ts
git commit -m "feat(fase5): semáforo de concorrência de render (anti-OOM)"
```

---

### Task 4: PlaywrightPdfRenderer + sandbox SSRF

**Files:**
- Modify: `package.json` (adicionar `playwright` em `dependencies`)
- Create: `src/lib/report/playwright-renderer.ts`
- Test: `src/lib/report/playwright-renderer.int.test.ts`

**Interfaces:**
- Consumes: `PdfRenderer` (`src/lib/report/renderer.ts:3-5`); `withRenderLock` (Task 3).
- Produces: `class PlaywrightPdfRenderer implements PdfRenderer` com `render(html: string): Promise<Buffer>`; export `const playwrightRenderer = new PlaywrightPdfRenderer()`.

- [ ] **Step 1: Adicionar Playwright como dependência de runtime**

Run:
```bash
pnpm add playwright
pnpm exec playwright install chromium
```
Expected: `playwright` aparece em `dependencies` do `package.json`; Chromium baixado no cache local.

- [ ] **Step 2: Write the failing SSRF test**

```ts
// src/lib/report/playwright-renderer.int.test.ts
import { afterAll, describe, expect, test } from "vitest";
import { PlaywrightPdfRenderer } from "./playwright-renderer";

const renderer = new PlaywrightPdfRenderer();
afterAll(async () => { await renderer.close(); });

const VETORES: Array<[string, string]> = [
  ["img file", `<img src="file:///etc/passwd">`],
  ["img http", `<img src="http://169.254.169.254/latest/meta-data/">`],
  ["font remoto", `<style>@font-face{font-family:x;src:url(http://attacker.test/f.woff)}</style><p style="font-family:x">a</p>`],
  ["css import", `<style>@import url(http://attacker.test/x.css);</style>`],
  ["meta refresh", `<meta http-equiv="refresh" content="0;url=http://attacker.test/">`],
  ["svg image", `<svg><image href="http://attacker.test/x.png"/></svg>`],
  ["iframe", `<iframe src="http://attacker.test/"></iframe>`],
  ["link prefetch", `<link rel="prefetch" href="http://attacker.test/x">`],
];

test.each(VETORES)("zero request de saída — %s", async (_nome, corpo) => {
  const { buffer, requestsExternas } = await renderer.renderComAuditoria(
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${corpo}</body></html>`,
  );
  expect(requestsExternas).toEqual([]);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
});

test("render de HTML factual gera PDF real", async () => {
  const pdf = await renderer.render(`<!doctype html><html><body><h1>Dossiê</h1></body></html>`);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(500);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/report/playwright-renderer.int.test.ts`
Expected: FAIL — módulo `./playwright-renderer` não existe.

- [ ] **Step 4: Write `playwright-renderer.ts`**

```ts
// src/lib/report/playwright-renderer.ts
import { chromium, type Browser } from "playwright";
import type { PdfRenderer } from "./renderer";
import { withRenderLock } from "./render-lock";

export class PlaywrightPdfRenderer implements PdfRenderer {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
    return this.browser;
  }

  /** Render com auditoria de rede — usado nos testes SSRF. */
  async renderComAuditoria(html: string): Promise<{ buffer: Buffer; requestsExternas: string[] }> {
    return withRenderLock(async () => {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ javaScriptEnabled: false });
      const requestsExternas: string[] = [];
      try {
        const page = await context.newPage();
        await page.route("**/*", (route) => {
          requestsExternas.push(route.request().url());
          void route.abort();
        });
        await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
        const buffer = await page.pdf({ format: "A4", printBackground: true });
        return { buffer, requestsExternas };
      } finally {
        await context.close();
      }
    });
  }

  async render(html: string): Promise<Buffer> {
    const { buffer } = await this.renderComAuditoria(html);
    return buffer;
  }

  async close(): Promise<void> {
    if (this.browser) { await this.browser.close(); this.browser = null; }
  }
}

export const playwrightRenderer = new PlaywrightPdfRenderer();
```

> **Nota:** `page.setContent` não emite request de navegação; qualquer sub-recurso (img/font/@import/iframe/svg/prefetch) passa por `page.route` e é abortado, então aparece em `requestsExternas` **antes** do abort — o teste falha se qualquer vetor tentar sair. `javaScriptEnabled:false` neutraliza `<script>` e a maioria dos refreshes dinâmicos; o meta-refresh estático é uma navegação abortada pelo route.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/report/playwright-renderer.int.test.ts`
Expected: PASS (9 testes: 8 vetores + PDF real). Requer Chromium instalado (Step 1).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/report/playwright-renderer.ts src/lib/report/playwright-renderer.int.test.ts
git commit -m "feat(fase5): PlaywrightPdfRenderer com sandbox SSRF provado por teste"
```

---

### Task 5: Query de preview (server-only, ctx-accepting)

**Files:**
- Create: `src/app/(app)/relatorios/queries.ts`
- Test: `src/app/(app)/relatorios/queries.int.test.ts`

**Interfaces:**
- Consumes: `buildConvenioBrutoPayload` (Task 2); `withTenant`, `TenantContext`, `Tx`.
- Produces: `previewConvenioBruto(ctx: TenantContext, args: { patientId: string; nomePaciente: string; periodoInicio: string; periodoFim: string }): Promise<{ sessoesRealizadas: number; faltasJustificadas: number; evidenciasAprovadas: number }>`.

> Reusa o builder para derivar contagens; o preview **não grava nada**.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/(app)/relatorios/queries.int.test.ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { withTenant, type TenantContext } from "@/db/rls";
import { previewConvenioBruto } from "./queries";

const hasDb = !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!) : (null as never);
const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA = "33333333-3333-3333-3333-333333333333";
const PAC = "44444444-4444-4444-4444-444444444444";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({ role, userId, clinicId: CLINIC });

describe.skipIf(!hasDb)("previewConvenioBruto", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD}, 'Coord', 'c@a.test'), (${TERA}, 'Ana', 't@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD}, ${CLINIC}, 'coordenador'), (${TERA}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, estado)
      VALUES (gen_random_uuid(), ${CLINIC}, ${PAC}, ${TERA}, 'ABA', '2026-06-10T09:00:00Z', 'realizada')`;
  });
  afterAll(async () => { if (hasDb) await owner.end(); });

  test("retorna contagens do período", async () => {
    const r = await withTenant(ctx("coordenador", COORD), () =>
      previewConvenioBruto(ctx("coordenador", COORD), { patientId: PAC, nomePaciente: "Miguel", periodoInicio: "2026-06-01", periodoFim: "2026-06-30" }));
    expect(r.sessoesRealizadas).toBe(1);
    expect(r.evidenciasAprovadas).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/\(app\)/relatorios/queries.int.test.ts`
Expected: FAIL — módulo `./queries` não existe.

- [ ] **Step 3: Write `queries.ts`**

```ts
// src/app/(app)/relatorios/queries.ts
import "server-only";
import { withTenant, type TenantContext } from "@/db/rls";
import { buildConvenioBrutoPayload } from "@/lib/report/convenio-bruto/build-payload";

type PreviewArgs = { patientId: string; nomePaciente: string; periodoInicio: string; periodoFim: string };

export async function previewConvenioBruto(ctx: TenantContext, args: PreviewArgs): Promise<{
  sessoesRealizadas: number;
  faltasJustificadas: number;
  evidenciasAprovadas: number;
}> {
  return withTenant(ctx, async (tx) => {
    const p = await buildConvenioBrutoPayload(tx, args);
    return {
      sessoesRealizadas: p.presenca.sessoesRealizadas,
      faltasJustificadas: p.presenca.faltasJustificadas,
      evidenciasAprovadas: p.evidencias.length,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/\(app\)/relatorios/queries.int.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/relatorios/queries.ts" "src/app/(app)/relatorios/queries.int.test.ts"
git commit -m "feat(fase5): preview factual do dossiê convenio_bruto"
```

---

### Task 6: Server action de export (INSERT + exportReport na mesma tx) + RLS

**Files:**
- Create: `src/app/(app)/relatorios/actions.ts`
- Test: `src/app/(app)/relatorios/actions.int.test.ts`
- Modify: `src/db/rls.int.test.ts` (+casos de escopo para o INSERT de `convenio_bruto`)

**Interfaces:**
- Consumes: `buildConvenioBrutoPayload` (Task 2), `buildConvenioBrutoHtml` (Task 1), `playwrightRenderer` (Task 4), `exportReport` (`src/lib/report/export.ts:37`), `requireRole`/`RoleError` (`src/auth/require-role.ts`), `getTenantContext` (`src/auth/tenant.ts`), `withTenant`.
- Produces: core `exportarConvenioBruto(ctx: TenantContext, input: ExportarInput, renderer?: PdfRenderer): Promise<{ reportId: string; hash: string } | { error: string }>`; wrapper `exportarConvenioBrutoAction(input: ExportarInput)` (deriva ctx do request).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/(app)/relatorios/actions.int.test.ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { StubPdfRenderer } from "@/lib/report/renderer";
import { exportarConvenioBruto } from "./actions";
import type { TenantContext } from "@/db/rls";

const hasDb = !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!) : (null as never);
const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA_ON = "33333333-3333-3333-3333-333333333333";
const TERA_OFF = "66666666-6666-6666-6666-666666666666";
const RECEP = "77777777-7777-7777-7777-777777777777";
const PAC = "44444444-4444-4444-4444-444444444444";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({ role, userId, clinicId: CLINIC });
const input = { patientId: PAC, nomePaciente: "Miguel", periodoInicio: "2026-06-01", periodoFim: "2026-06-30" };

describe.skipIf(!hasDb)("exportarConvenioBruto", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session, report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD},'Coord','c@a.test'),(${TERA_ON},'Ana','a@a.test'),(${TERA_OFF},'Bob','b@a.test'),(${RECEP},'Rec','r@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD},${CLINIC},'coordenador'),(${TERA_ON},${CLINIC},'terapeuta'),(${TERA_OFF},${CLINIC},'terapeuta'),(${RECEP},${CLINIC},'admin_recepcao')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES (${PAC}, ${TERA_ON}, 'ABA', 'terapeuta_referencia')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, estado) VALUES (gen_random_uuid(), ${CLINIC}, ${PAC}, ${TERA_ON}, 'ABA', '2026-06-10T09:00:00Z', 'realizada')`;
  });
  afterAll(async () => { if (hasDb) await owner.end(); });

  test("coordenador exporta: report exportado + report_pdf + audit_log", async () => {
    const r = await exportarConvenioBruto(ctx("coordenador", COORD), input, new StubPdfRenderer());
    expect("hash" in r).toBe(true);
    const [rep] = await owner`SELECT status, tipo, gerado_por_ia FROM report WHERE patient_id=${PAC}`;
    expect(rep.status).toBe("exportado");
    expect(rep.tipo).toBe("convenio_bruto");
    expect(rep.gerado_por_ia).toBe(false);
    const pdfs = await owner`SELECT 1 FROM report_pdf`;
    expect(pdfs.length).toBe(1);
    const logs = await owner`SELECT acao FROM audit_log WHERE acao='relatorio_exportado'`;
    expect(logs.length).toBe(1);
  });

  test("terapeuta on-team exporta próprio paciente", async () => {
    const r = await exportarConvenioBruto(ctx("terapeuta", TERA_ON), input, new StubPdfRenderer());
    expect("hash" in r).toBe(true);
  });

  test("terapeuta fora da equipe é bloqueado (RLS)", async () => {
    await expect(exportarConvenioBruto(ctx("terapeuta", TERA_OFF), input, new StubPdfRenderer())).rejects.toThrow();
  });

  test("admin_recepcao é bloqueado (requireRole)", async () => {
    const r = await exportarConvenioBruto(ctx("admin_recepcao", RECEP), input, new StubPdfRenderer());
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/\(app\)/relatorios/actions.int.test.ts`
Expected: FAIL — módulo `./actions` não existe.

- [ ] **Step 3: Write `actions.ts`**

```ts
// src/app/(app)/relatorios/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import type { PdfRenderer } from "@/lib/report/renderer";
import { exportReport } from "@/lib/report/export";
import { buildConvenioBrutoPayload } from "@/lib/report/convenio-bruto/build-payload";
import { buildConvenioBrutoHtml } from "@/lib/report/convenio-bruto/build-html";
import type { PayloadConvenioBruto } from "@/lib/report/convenio-bruto/types";
import { playwrightRenderer } from "@/lib/report/playwright-renderer";

const exportarSchema = z.object({
  patientId: z.string().uuid(),
  nomePaciente: z.string().min(1),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ExportarInput = z.infer<typeof exportarSchema>;

/** Núcleo testável — recebe ctx (nunca do request) + renderer injetável. */
export async function exportarConvenioBruto(
  ctx: TenantContext,
  input: ExportarInput,
  renderer: PdfRenderer = playwrightRenderer,
): Promise<{ reportId: string; hash: string } | { error: string }> {
  const parsed = exportarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador", "terapeuta");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }
  const { patientId, nomePaciente, periodoInicio, periodoFim } = parsed.data;

  return withTenant(ctx, async (tx) => {
    const payload = await buildConvenioBrutoPayload(tx, { patientId, nomePaciente, periodoInicio, periodoFim });
    const rows = (await tx.execute(sql`
      INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload, gerado_por_ia)
      VALUES (${ctx.clinicId}::uuid, ${patientId}::uuid, 'convenio_bruto', ${periodoInicio}::date, ${periodoFim}::date, 'rascunho', ${JSON.stringify(payload)}::jsonb, false)
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    const reportId = rows[0]!.id;
    const { hash } = await exportReport(tx, {
      reportId,
      atorId: ctx.userId,
      buildHtml: (pl) => buildConvenioBrutoHtml(pl as PayloadConvenioBruto),
      renderer,
    });
    return { reportId, hash };
  });
}

/** Wrapper de request — deriva o tenant do servidor. */
export async function exportarConvenioBrutoAction(input: ExportarInput) {
  const ctx = await getTenantContext();
  const res = await exportarConvenioBruto(ctx, input);
  revalidatePath("/relatorios");
  return res;
}
```

> **Verificar:** a assinatura de `ExportParams` em `src/lib/report/export.ts:17-22` é `{ reportId, atorId, buildHtml, renderer }`. Se o nome de algum campo divergir (ex.: `ator` vs `atorId`), ajuste a chamada — não altere `export.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/\(app\)/relatorios/actions.int.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Adicionar casos de RLS ao suíte central**

Em `src/db/rls.int.test.ts`, acrescente um bloco espelhando o seed existente que verifica: (a) terapeuta on-team consegue `INSERT INTO report (tipo='convenio_bruto')` sob `withTenant`; (b) terapeuta fora da equipe recebe erro no INSERT (WITH CHECK); (c) `admin_recepcao` sem membership é barrado. Use o padrão `.rejects.toThrow()` já presente (`rls.int.test.ts:128-136`).

- [ ] **Step 6: Run RLS suite**

Run: `pnpm test:rls`
Expected: PASS incluindo os novos casos.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/relatorios/actions.ts" "src/app/(app)/relatorios/actions.int.test.ts" src/db/rls.int.test.ts
git commit -m "feat(fase5): action de export do dossiê convenio_bruto (tx única, RLS)"
```

---

### Task 7: UI da rota `/relatorios`

**Files:**
- Create: `src/app/(app)/relatorios/page.tsx`

**Interfaces:**
- Consumes: `previewConvenioBruto` (Task 5) via server component; `exportarConvenioBrutoAction` (Task 6); `getReportPdf` (`src/lib/report/download.ts:14`) para o download.

> Seguir o design system existente (sem hardcodar componentes — reusar os componentes do projeto). Espelhar a estrutura de página de `src/app/(app)/validacao/page.tsx`. Fluxo (wireframe §4.6): seleção paciente + período → preview de contagens → botão "Gerar dossiê em PDF" → download. Tier Diário mostra só o tile "Dossiê para convênio".

- [ ] **Step 1: Implementar a página** (server component + form client para a action). Preview via `previewConvenioBruto`; submit chama `exportarConvenioBrutoAction`; ao sucesso, link de download que serve os bytes de `getReportPdf`.

- [ ] **Step 2: Rodar dev e validar o fluxo**

Run: `pnpm dev` e navegar `/relatorios`; selecionar paciente+período, ver preview, gerar, baixar PDF.
Expected: PDF factual baixado; nova linha `report` (exportado) + `report_pdf` + `audit_log`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/relatorios/page.tsx"
git commit -m "feat(fase5): UI da rota /relatorios (dossiê convenio_bruto)"
```

---

### Task 8: Runner Docker com Chromium — **INFRA-GATE (sign-off do Rômulo)**

**Files:**
- Modify: `infra/Dockerfile` (runner stage)

> ⚠️ **Item "confirmar antes / via única" (CLAUDE.md).** Não mergear sem sign-off explícito do Rômulo no PR. Raio de explosão: base musl→glibc, +~300 MB, preservar stage `migrate` e o gate de deploy.

- [ ] **Step 1: Ajustar o runner** para embarcar Chromium do Playwright. Trocar base do stage runner de `node:22-alpine` para `node:22-slim`; instalar deps do Chromium e o browser (`pnpm exec playwright install --with-deps chromium`) no estágio apropriado e copiar o cache/`node_modules` de `playwright-core` para o standalone; setar `PLAYWRIGHT_BROWSERS_PATH` consistente entre build e runtime. Preservar o stage `migrate` e a ordem de gate de deploy intactos.

- [ ] **Step 2: Build da imagem**

Run: `docker build -f infra/Dockerfile -t iris-app:f3 .`
Expected: build verde; imagem contém Chromium.

- [ ] **Step 3: Smoke test do render no container**

Run: subir o container e exportar um dossiê (ou script mínimo que chama `playwrightRenderer.render`).
Expected: PDF `%PDF-` gerado dentro do container.

- [ ] **Step 4: Commit**

```bash
git add infra/Dockerfile
git commit -m "infra(fase5): runner Docker com Chromium p/ render de PDF (infra-gate)"
```

---

### Task 9: Fechamento — BACKLOG + verificação final

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Rodar a bateria completa**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:rls`
Expected: tudo verde.

- [ ] **Step 2: Atualizar `BACKLOG.md`** — marcar Fatia 3 concluída (dossiê `convenio_bruto` + PDF real); registrar as **dívidas**: (a) `report_pdf.bytes` bytea → offload MinIO quando volume crescer; (b) render in-process → worker se justificar; (c) "incidente grave" sem coluna no schema (modelar). Atualizar `docs/superpowers/` referências.

- [ ] **Step 3: Commit**

```bash
git add BACKLOG.md
git commit -m "docs(fase5): Fatia 3 concluída + dívidas registradas"
```

- [ ] **Step 4: Abrir PR** com descrição contextualizada (decisões: linha da IA, tx única, sandbox SSRF, semáforo, infra-gate) — Jules/reviewer só vê o diff.

---

## Self-Review

**Spec coverage:** §1 escopo→Tasks 1-9; §4 tx única→Task 6; §5 payload→Tasks 1-2 (incidentesGraves removido, gap→Task 9); §6 HTML→Task 1; §7 SSRF→Task 4; §8 autz/RLS→Task 6; §9 concorrência→Task 3; §10 Docker→Task 8; §11 dívidas→Task 9; §12 testes→cada task. Coberto.

**Placeholder scan:** Task 7 (UI) e Task 8 (Dockerfile) descrevem passos sem colar 100% do código — justificado: UI depende do design system do projeto (reusar componentes existentes, não inventar) e o Dockerfile é infra-gate revisada manualmente. Demais tasks têm código completo.

**Type consistency:** `PayloadConvenioBruto` (Task 1) usado em Tasks 2, 6; `buildConvenioBrutoPayload(tx, args)` assinatura idêntica em Tasks 2, 5, 6; `PdfRenderer.render(html)` consistente; `exportarConvenioBruto(ctx, input, renderer?)` idem. OK.
