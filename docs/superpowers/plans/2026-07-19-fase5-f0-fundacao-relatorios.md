# Fase 5 — F0: Fundação de Relatórios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a fundação compartilhada da Fase 5 — tabelas `report`, `report_pdf`, `audit_log`, RLS multi-tenant, purga rastreada e a lib de export de PDF com snapshot imutável — sem construir o conteúdo de nenhum relatório.

**Architecture:** DDL via Drizzle (migração `0038` gerada) + RLS/purga em SQL à mão (`0039_fase5_report_audit_rls.sql`, padrão dos `*_rls.sql`). O blob do PDF vive isolado em `report_pdf` (1:1) com RLS própria. Export é uma transação única com trava de race (`FOR UPDATE` + `payload_versao`) que congela bytes + grava trilha antes de liberar download. O renderer de PDF é injetável: um stub determinístico testa toda a lógica de export sem browser; o renderer Chromium real (infra nova) é a última tarefa, isolada.

**Tech Stack:** Next.js 16, Drizzle ORM, Postgres (RLS nativo), Vitest (integração via `vitest.integration.config.ts`), `withTenant` (`src/db/rls.ts`), Node `crypto` (sha256), Playwright/Chromium (só na tarefa final de render).

## Global Constraints

- **Copy/documentação em pt-BR.** Commits em inglês (Conventional Commits — ver [[commit-e-branch-conventions]]).
- **Numeração de migração:** próxima livre = `0038` (Drizzle-gerada) + `0039` (RLS à mão). Última existente = `0037`.
- **Journal `when` de migração à mão:** entrada de `0039` em `db/migrations/meta/_journal.json` com `when` = `when` de `0038` **+ 1000** (ver [[drizzle-hand-migration-when-ordering]]). Sem isso a migração é pulada.
- **RLS é o gargalo único:** todo acesso a dado de paciente passa por `withTenant(ctx, tx => ...)`. Session vars são setadas server-side via `set_config(..., true)`; **nunca** a partir de input de request.
- **Leitura de session var em SQL:** sempre `current_setting('app.clinic_id')::uuid` / `('app.user_id')::uuid` (com `::uuid`, sem `missing_ok`); papel `current_setting('app.user_role')` sem cast.
- **Papéis (`user_role_tipo`):** `terapeuta` | `coordenador` | `admin_recepcao`. Não existe `admin` isolado.
- **Toda tabela nova:** `ENABLE` **e** `FORCE ROW LEVEL SECURITY`. Statements SQL à mão separados por `--> statement-breakpoint`.
- **Ambiente de teste:** `pnpm test:rls` roda `*.int.test.ts`; conexão de produto via `withTenant`/`sql` (`app_role`, RLS aplica) + conexão owner via `postgres(process.env.MIGRATION_DATABASE_URL!)` (bypassa RLS, p/ seed). Auto-skip com `describe.skipIf(!hasDb)`.
- **IA nunca gera número** ([[convenio-report-requirements]]); `convenio_bruto` ⇒ `gerado_por_ia = false` (CHECK).
- **Spec-fonte:** `docs/superpowers/specs/2026-07-19-fase5-f0-fundacao-relatorios-design.md` (2 passadas adversariais aplicadas).

---

### Task 1: Schema Drizzle — customType `bytea`, enums e as 3 tabelas (migração `0038`)

**Files:**
- Modify: `src/db/schema.ts` (adicionar ao fim: customType, enums, tabelas)
- Create (gerado): `db/migrations/0038_<random>.sql` via `pnpm db:generate`
- Test: `db/tests/fase5-report-schema.int.test.ts`

**Interfaces:**
- Produces:
  - `bytea` — `customType<{ data: Buffer; default: false }>` para colunas binárias.
  - `reportTipo` = pgEnum `report_tipo` (`familia` | `convenio_bruto` | `convenio_narrativo` | `avaliativo_interdisciplinar`).
  - `reportStatus` = pgEnum `report_status` (`rascunho` | `revisado` | `exportado`).
  - `report` — colunas: `id, clinicId, patientId, tipo, periodoInicio, periodoFim, status, payload, payloadVersao, geradoPorIa, pdfHash, deletadoEm, revisadoPor, exportadoPor, exportadoEm, criadoEm`.
  - `reportPdf` — colunas: `reportId` (PK, FK→report onDelete cascade), `bytes` (bytea), `hash`, `criadoEm`.
  - `auditLog` — colunas: `id, clinicId, atorId, acao, entidade, entidadeId, patientId, detalhe, criadoEm`.

- [ ] **Step 1: Escrever o teste de integração falho (constraints do banco)**

Cria `db/tests/fase5-report-schema.int.test.ts`. Usa conexão **owner** (bypassa RLS) só para provar que as CHECKs do banco existem e rejeitam. Segue o padrão de `db/tests/fase4-evidence-rls.int.test.ts` para conexão/skip.

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const hasDb = !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;

// UUIDs fixos de seed mínimo (clínica + paciente + user) — reaproveitar de um seed helper se existir.
const CLINIC = "00000000-0000-0000-0000-0000000000c1";
const USER = "00000000-0000-0000-0000-0000000000u1";
const PATIENT = "00000000-0000-0000-0000-0000000000d1";

describe.skipIf(!hasDb)("report — constraints de banco", () => {
  beforeAll(async () => {
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C1') ON CONFLICT DO NOTHING`;
    await owner!`INSERT INTO app_user (id, clinic_id, nome, email) VALUES (${USER}, ${CLINIC}, 'U', 'u@e.com') ON CONFLICT DO NOTHING`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC}, 'P') ON CONFLICT DO NOTHING`;
  });
  afterAll(async () => { await owner?.end(); });

  test("periodo_fim < periodo_inicio é rejeitado", async () => {
    await expect(
      owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
             VALUES (${CLINIC}, ${PATIENT}, 'familia', '2026-02-01', '2026-01-01', '{}'::jsonb)`,
    ).rejects.toThrow();
  });

  test("convenio_bruto com gerado_por_ia=true é rejeitado", async () => {
    await expect(
      owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload, gerado_por_ia)
             VALUES (${CLINIC}, ${PATIENT}, 'convenio_bruto', '2026-01-01', '2026-01-31', '{}'::jsonb, true)`,
    ).rejects.toThrow();
  });

  test("status=exportado sem pdf_hash/exportado_por/exportado_em é rejeitado", async () => {
    await expect(
      owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload, status)
             VALUES (${CLINIC}, ${PATIENT}, 'familia', '2026-01-01', '2026-01-31', '{}'::jsonb, 'exportado')`,
    ).rejects.toThrow();
  });

  test("report rascunho válido insere e payload_versao default = 1", async () => {
    const [r] = await owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
             VALUES (${CLINIC}, ${PATIENT}, 'familia', '2026-01-01', '2026-01-31', '{"x":1}'::jsonb)
             RETURNING payload_versao, status`;
    expect(r.payload_versao).toBe(1);
    expect(r.status).toBe("rascunho");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test:rls db/tests/fase5-report-schema.int.test.ts`
Expected: FAIL — tabela `report` não existe (`relation "report" does not exist`).

- [ ] **Step 3: Adicionar customType, enums e tabelas em `src/db/schema.ts`**

No topo dos imports, garantir `customType` na lista de `drizzle-orm/pg-core`. Ao fim do arquivo:

```ts
// ── Fase 5: relatórios ────────────────────────────────────────────────
// customType para bytea (não havia binário no banco até aqui). data = Buffer.
export const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const reportTipo = pgEnum("report_tipo", [
  "familia",
  "convenio_bruto",
  "convenio_narrativo",
  "avaliativo_interdisciplinar",
]);

export const reportStatus = pgEnum("report_status", [
  "rascunho",
  "revisado",
  "exportado",
]);

export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id),
    tipo: reportTipo("tipo").notNull(),
    periodoInicio: date("periodo_inicio").notNull(),
    periodoFim: date("periodo_fim").notNull(),
    status: reportStatus("status").notNull().default("rascunho"),
    payload: jsonb("payload").notNull(),
    // incrementa a cada UPDATE de payload; trava a race de export (spec §5)
    payloadVersao: integer("payload_versao").notNull().default(1),
    geradoPorIa: boolean("gerado_por_ia").notNull().default(false),
    // null até export; sha256 hex dos bytes (bytes ficam em report_pdf)
    pdfHash: text("pdf_hash"),
    // null = vigente; soft-delete p/ retenção/erasure LGPD (spec §3.1)
    deletadoEm: timestamp("deletado_em", { withTimezone: true }),
    revisadoPor: uuid("revisado_por").references(() => appUser.id),
    exportadoPor: uuid("exportado_por").references(() => appUser.id),
    exportadoEm: timestamp("exportado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("report_periodo", sql`${t.periodoFim} >= ${t.periodoInicio}`),
    check(
      "report_exportado_congelado",
      sql`${t.status} <> 'exportado' OR (${t.exportadoPor} IS NOT NULL AND ${t.exportadoEm} IS NOT NULL AND ${t.pdfHash} IS NOT NULL)`,
    ),
    check(
      "report_bruto_sem_ia",
      sql`${t.tipo} <> 'convenio_bruto' OR ${t.geradoPorIa} = false`,
    ),
    index("idx_report_patient").on(t.patientId, t.criadoEm.desc()),
    index("idx_report_clinic_tipo").on(t.clinicId, t.tipo),
    index("idx_report_vigente")
      .on(t.patientId, t.criadoEm.desc())
      .where(sql`${t.deletadoEm} IS NULL`),
  ],
);

// Blob isolado da tabela quente de listagem (spec §1.1). 1:1 com report.
export const reportPdf = pgTable("report_pdf", {
  reportId: uuid("report_id")
    .primaryKey()
    .references(() => report.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
  hash: text("hash").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Trilha de auditoria LGPD (spec §2). entidade_id SEM FK — sobrevive ao delete do alvo.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id),
    atorId: uuid("ator_id")
      .notNull()
      .references(() => appUser.id),
    acao: text("acao").notNull(),
    entidade: text("entidade").notNull(),
    entidadeId: uuid("entidade_id").notNull(),
    patientId: uuid("patient_id").references(() => patient.id),
    detalhe: jsonb("detalhe"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_audit_log_patient").on(t.patientId, t.criadoEm.desc())],
);
```

> Confirmar os nomes reais de `clinic`, `patient`, `appUser` no schema antes de referenciar (o recon confirmou `appUser`, `patient`, `clinic`). Ajustar colunas de seed (`nome`, `email`) ao que a tabela real exige (NOT NULLs) — ler a definição de `clinic`/`patient`/`appUser` se o INSERT de seed do teste falhar.

- [ ] **Step 4: Gerar a migração `0038`**

Run: `pnpm db:generate`
Expected: cria `db/migrations/0038_<random>.sql` com os `CREATE TYPE`, `CREATE TABLE report/report_pdf/audit_log`, índices e CHECKs; atualiza `db/migrations/meta/_journal.json` com a entrada `idx: 38`. Conferir o SQL gerado: as 3 CHECKs nomeadas e o `bytea` em `report_pdf.bytes` presentes.

- [ ] **Step 5: Aplicar a migração local**

Run: `pnpm db:migrate` (ou aplicar o SQL à mão via psql se o tracking estiver dessincronizado — ver [[dev-db-migrate-desync]]).
Expected: migração aplica sem erro; `\d report` mostra as colunas e CHECKs.

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `pnpm test:rls db/tests/fase5-report-schema.int.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts db/migrations/0038_*.sql db/migrations/meta/_journal.json db/tests/fase5-report-schema.int.test.ts
git commit -m "feat(db): add report, report_pdf, audit_log tables (fase5 f0)"
```

---

### Task 2: RLS das 3 tabelas + helper `app_report_visivel` (migração `0039`)

**Files:**
- Create: `db/migrations/0039_fase5_report_audit_rls.sql`
- Modify: `db/migrations/meta/_journal.json` (entrada manual `idx: 39`, `when` = `when` de 0038 + 1000)
- Test: `db/tests/fase5-report-rls.int.test.ts`

**Interfaces:**
- Consumes: helpers existentes `app_patient_in_clinic(uuid)`, `app_is_on_team(uuid)`; `withTenant` de `src/db/rls.ts`; tabelas da Task 1.
- Produces: policies `report_scope`, `report_pdf_scope`, `audit_insert`, `audit_select`; função `app_report_visivel(uuid) RETURNS boolean`.

- [ ] **Step 1: Escrever o teste RLS falho**

Cria `db/tests/fase5-report-rls.int.test.ts`. Espelha `src/db/rls.int.test.ts`: duas clínicas, coordenador, terapeuta on/off-team, cross-tenant → 0.

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { report, reportPdf, auditLog } from "../../src/db/schema";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const CLINIC_B = "00000000-0000-0000-0000-00000000000b";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const U_TER_A = "00000000-0000-0000-0000-0000000000a1"; // on team de P1
const U_TER_A2 = "00000000-0000-0000-0000-0000000000a2"; // fora da equipe de P1
const P1 = "00000000-0000-0000-0000-0000000000d1"; // clínica A
const P_B = "00000000-0000-0000-0000-0000000000db"; // clínica B
const R1 = "00000000-0000-0000-0000-0000000000f1"; // report de P1 (A)
const R_B = "00000000-0000-0000-0000-0000000000fb"; // report de P_B (B)

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("report/report_pdf/audit_log — RLS", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    // seed: clínicas, users, pacientes, care_team (U_TER_A ↔ P1), reports em cada clínica.
    // (usar helpers de seed do repo; senão INSERT direto como owner — ver fase4-evidence-rls seed)
    // ... INSERT clinic A/B, app_user coord/ter, patient P1(A)/P_B(B),
    //     care_team_membership (U_TER_A, P1, vigencia_fim NULL),
    //     report R1(A,P1,familia,rascunho), report R_B(B,P_B,familia,rascunho).
  });
  afterAll(async () => { await owner?.end(); });

  test("coordenador da clínica A vê report de A, não de B", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.select().from(report),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(R1);
    expect(ids).not.toContain(R_B); // isolamento cross-tenant
  });

  test("terapeuta fora da equipe de P1 não vê R1", async () => {
    const rows = await withTenant(ctx("terapeuta", U_TER_A2), (db) =>
      db.select().from(report),
    );
    expect(rows.map((r) => r.id)).not.toContain(R1);
  });

  test("report soft-deletado fica invisível", async () => {
    await owner!`UPDATE report SET deletado_em = now() WHERE id = ${R1}`;
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.select().from(report),
    );
    expect(rows.map((r) => r.id)).not.toContain(R1);
    await owner!`UPDATE report SET deletado_em = NULL WHERE id = ${R1}`;
  });

  test("report_pdf cross-tenant → 0 linhas", async () => {
    await owner!`INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${R_B}, '\\x00', 'h') ON CONFLICT DO NOTHING`;
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.select().from(reportPdf),
    );
    expect(rows.map((r) => r.reportId)).not.toContain(R_B);
  });

  test("audit_log: INSERT com ator_id ≠ sessão é rejeitado (ator amarrado)", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id)
          VALUES (${CLINIC_A}::uuid, ${U_TER_A}::uuid, 'x', 'report', ${R1}::uuid)`),
      ),
    ).rejects.toThrow();
  });

  test("audit_log: UPDATE/DELETE por app_role falham (append-only)", async () => {
    await owner!`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id)
      VALUES (${CLINIC_A}, ${U_COORD_A}, 'relatorio_exportado', 'report', ${R1})`;
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`DELETE FROM audit_log WHERE clinic_id = ${CLINIC_A}::uuid`),
      ),
    ).rejects.toThrow();
  });

  test("audit_log: terapeuta não lê a trilha", async () => {
    const rows = await withTenant(ctx("terapeuta", U_TER_A), (db) =>
      db.select().from(auditLog),
    );
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls db/tests/fase5-report-rls.int.test.ts`
Expected: FAIL — sem RLS, coordenador vê `R_B` / terapeuta lê `audit_log` (asserções quebram), ou erro por policy inexistente.

- [ ] **Step 3: Escrever `0039_fase5_report_audit_rls.sql`**

```sql
-- Fase 5 F0 — RLS de report, report_pdf, audit_log + helper e purga.
-- GRANT explícito porque o "GRANT ON ALL TABLES" da 0001 é point-in-time (tabelas novas não herdam).
--> statement-breakpoint
-- Helper: um report é visível ao usuário atual? (encapsula tenant+equipe+soft-delete)
CREATE OR REPLACE FUNCTION app_report_visivel(p_report uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM report r
    WHERE r.id = p_report
      AND r.deletado_em IS NULL
      AND app_patient_in_clinic(r.patient_id)
      AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(r.patient_id))
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_report_visivel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_report_visivel(uuid) TO app_role;
--> statement-breakpoint
-- ── report ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON report TO app_role;  -- sem DELETE (soft-delete + purga definer)
--> statement-breakpoint
ALTER TABLE report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY report_scope ON report FOR ALL TO app_role USING (
  deletado_em IS NULL
  AND app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
) WITH CHECK (
  app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
-- ── report_pdf ──────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON report_pdf FROM app_role;   -- write-once
--> statement-breakpoint
GRANT SELECT, INSERT ON report_pdf TO app_role;
--> statement-breakpoint
ALTER TABLE report_pdf ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_pdf FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY report_pdf_scope ON report_pdf FOR ALL TO app_role
  USING (app_report_visivel(report_id))
  WITH CHECK (app_report_visivel(report_id));
--> statement-breakpoint
-- ── audit_log ───────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON audit_log FROM app_role;    -- imutável (LGPD)
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO app_role;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_log FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND ator_id = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY audit_select ON audit_log FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
);
```

- [ ] **Step 4: Registrar a migração no journal**

Ler `db/migrations/meta/_journal.json`, achar a entrada `idx: 38` e seu `when`. Adicionar entrada `idx: 39`:

```json
{ "idx": 39, "version": "7", "when": <when_de_0038 + 1000>, "tag": "0039_fase5_report_audit_rls", "breakpoints": true }
```

Usar o mesmo `version` das entradas vizinhas. `when` = valor numérico de 0038 + 1000 (ver Global Constraints).

- [ ] **Step 5: Aplicar e rodar o teste**

Run: `pnpm db:migrate` depois `pnpm test:rls db/tests/fase5-report-rls.int.test.ts`
Expected: migração aplica; 7 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0039_fase5_report_audit_rls.sql db/migrations/meta/_journal.json db/tests/fase5-report-rls.int.test.ts
git commit -m "feat(db): RLS for report/report_pdf/audit_log + app_report_visivel (fase5 f0)"
```

---

### Task 3: Purga rastreada — `app_purgar_report` (SECURITY DEFINER, append em `0039`)

**Files:**
- Modify: `db/migrations/0039_fase5_report_audit_rls.sql` (append da função + grants)
- Test: `db/tests/fase5-report-purga.int.test.ts`

**Interfaces:**
- Produces: `app_purgar_report(p_report uuid, p_motivo text) RETURNS void` — grava `audit_log(acao='relatorio_purgado')` e depois `DELETE` de `report` (cascata em `report_pdf`), na mesma tx. Executável só por coordenador.

> Nota: esta task **acrescenta** statements ao `0039` da Task 2 (mesma migração, mesma entrada de journal). Se a Task 2 já foi aplicada, adicionar a função exige uma nova migração `0040_fase5_purga.sql` em vez de editar a `0039` já commitada (não reescrever migração aplicada — ver CLAUDE.md). Preferir: implementar Task 2 e 3 **antes** do primeiro `db:migrate`, mantendo tudo em `0039`. Se já migrou, criar `0040_fase5_purga_rls.sql` (journal `when` = 0039 + 1000).

- [ ] **Step 1: Escrever o teste falho**

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;
// reusar constantes/seed do fase5-report-rls (extrair p/ um helper se preferir).
const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const U_TER_A = "00000000-0000-0000-0000-0000000000a1";
const R1 = "00000000-0000-0000-0000-0000000000f1";
const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("app_purgar_report", () => {
  // beforeAll: seed clínica/user/paciente/report R1 exportado + report_pdf de R1.
  afterAll(async () => { await owner?.end(); });

  test("purga grava audit_log ANTES e remove report + report_pdf (cascata)", async () => {
    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT app_purgar_report(${R1}::uuid, 'fim de retenção')`),
    );
    const rep = await owner!`SELECT 1 FROM report WHERE id = ${R1}`;
    const pdf = await owner!`SELECT 1 FROM report_pdf WHERE report_id = ${R1}`;
    const log = await owner!`SELECT acao FROM audit_log WHERE entidade_id = ${R1} AND acao = 'relatorio_purgado'`;
    expect(rep).toHaveLength(0);
    expect(pdf).toHaveLength(0);
    expect(log).toHaveLength(1); // trilha sobrevive ao delete (entidade_id sem FK)
  });

  test("terapeuta não pode executar a purga", async () => {
    await expect(
      withTenant(ctx("terapeuta", U_TER_A), (db) =>
        db.execute(sql`SELECT app_purgar_report(${R1}::uuid, 'x')`),
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls db/tests/fase5-report-purga.int.test.ts`
Expected: FAIL — `function app_purgar_report(uuid, text) does not exist`.

- [ ] **Step 3: Adicionar a função ao SQL de RLS (`0039`, ou `0040` se já migrou)**

```sql
--> statement-breakpoint
-- Purga rastreada (retenção/erasure LGPD). Log ANTES do delete; um único report; só coordenador.
CREATE OR REPLACE FUNCTION app_purgar_report(p_report uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_patient uuid; v_clinic uuid; v_hash text;
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_report: só coordenador purga (papel atual %)', current_setting('app.user_role');
  END IF;
  SELECT patient_id, clinic_id, pdf_hash INTO v_patient, v_clinic, v_hash FROM report WHERE id = p_report;
  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'app_purgar_report: report % inexistente', p_report;
  END IF;
  IF NOT app_patient_in_clinic(v_patient) THEN
    RAISE EXCEPTION 'app_purgar_report: report % fora da clínica do chamador', p_report;
  END IF;
  -- 1) trilha PRIMEIRO (entidade_id sem FK → sobrevive ao delete)
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, current_setting('app.user_id')::uuid, 'relatorio_purgado', 'report', p_report, v_patient,
          jsonb_build_object('motivo', p_motivo, 'hash', v_hash));
  -- 2) delete físico (cascata remove report_pdf)
  DELETE FROM report WHERE id = p_report;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_purgar_report(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_purgar_report(uuid, text) TO app_role;
```

> A função é `GRANT`-ada a `app_role` mas o gate de papel (`coordenador`) é interno — terapeuta chama e recebe EXCEPTION. Isso espelha o padrão de `app_aplicar_snapshot` (checagem de tenant dentro do definer).

- [ ] **Step 4: Aplicar e rodar o teste**

Run: `pnpm db:migrate` depois `pnpm test:rls db/tests/fase5-report-purga.int.test.ts`
Expected: 2 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/*.sql db/migrations/meta/_journal.json db/tests/fase5-report-purga.int.test.ts
git commit -m "feat(db): app_purgar_report — traced retention purge (fase5 f0)"
```

---

### Task 4: Lib de report — hash + interface de renderer + stub + sanitize

**Files:**
- Create: `src/lib/report/hash.ts`
- Create: `src/lib/report/renderer.ts`
- Create: `src/lib/report/sanitize.ts`
- Test: `src/lib/report/hash.test.ts`, `src/lib/report/sanitize.test.ts`

**Interfaces:**
- Produces:
  - `sha256Hex(buf: Buffer): string`
  - `interface PdfRenderer { render(html: string): Promise<Buffer> }`
  - `class StubPdfRenderer implements PdfRenderer` — retorna bytes determinísticos derivados do html (p/ testes de export).
  - `escapeHtml(s: string): string` — escapa `& < > " '`.

- [ ] **Step 1: Escrever os testes falhos (unit, sem DB)**

`src/lib/report/hash.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  test("hash conhecido de 'abc'", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
```

`src/lib/report/sanitize.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { escapeHtml } from "./sanitize";

describe("escapeHtml", () => {
  test("neutraliza markup injetado no texto livre", () => {
    expect(escapeHtml(`<img src=x onerror=1>`)).toBe(
      "&lt;img src=x onerror=1&gt;",
    );
    expect(escapeHtml(`a & b "c" 'd'`)).toBe("a &amp; b &quot;c&quot; &#39;d&#39;");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `pnpm test src/lib/report/hash.test.ts src/lib/report/sanitize.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar os módulos**

`src/lib/report/hash.ts`:
```ts
import { createHash } from "node:crypto";

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
```

`src/lib/report/sanitize.ts`:
```ts
const MAP: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

// Texto livre de terapeuta NUNCA vira markup no template (spec §5, red-team #2).
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => MAP[c]);
}
```

`src/lib/report/renderer.ts`:
```ts
import { sha256Hex } from "./hash";

export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
}

// Renderer determinístico p/ testes de export — sem browser.
export class StubPdfRenderer implements PdfRenderer {
  async render(html: string): Promise<Buffer> {
    // bytes estáveis derivados do conteúdo, p/ asserção de hash em testes.
    return Buffer.from(`%PDF-STUB ${sha256Hex(Buffer.from(html))}`);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `pnpm test src/lib/report/hash.test.ts src/lib/report/sanitize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/hash.ts src/lib/report/sanitize.ts src/lib/report/renderer.ts src/lib/report/hash.test.ts src/lib/report/sanitize.test.ts
git commit -m "feat(report): hash, sanitize, renderer interface + stub (fase5 f0)"
```

---

### Task 5: Serviço de export — transação com trava de race + trilha

**Files:**
- Create: `src/lib/report/export.ts`
- Test: `src/lib/report/export.int.test.ts`

**Interfaces:**
- Consumes: `PdfRenderer` (Task 4), `sha256Hex` (Task 4), `withTenant`/`Tx`, tabelas (Task 1), policies (Task 2).
- Produces:
  - `type ExportParams = { reportId: string; atorId: string; buildHtml: (payload: unknown) => string; renderer: PdfRenderer }`
  - `async function exportReport(tx: Tx, params: ExportParams): Promise<{ hash: string }>` — lê o report `FOR UPDATE`, re-confere `payload_versao`, renderiza fora do lock não é possível aqui (ver nota), insere `report_pdf`, marca `report` exportado, grava `audit_log`. Lança se status ≠ rascunho/revisado ou se a versão mudou.

> **Ordem contra a race (spec §5):** renderizar ANTES de abrir o lock e reconferir a versão dentro. Como `exportReport` recebe `tx` já aberto, o padrão é: (1) o **caller** lê `report` (via `withTenant`), renderiza o PDF e o hash, e chama `exportReport(tx, { ..., precomputed })`; OU (2) `exportReport` faz duas fases: lê versão `V` sem lock → render → `SELECT ... FOR UPDATE` e reconfere `V`. Este plano usa (2) dentro de uma única `withTenant`, aceitando que o render ocorre com a transação aberta mas ANTES do `FOR UPDATE` (o lock é curto, só na fase de escrita). Documentar o trade-off no topo do arquivo.

- [ ] **Step 1: Escrever o teste de integração falho (com StubPdfRenderer)**

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../db/rls";
import { StubPdfRenderer } from "./renderer";
import { exportReport } from "./export";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;
const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const P1 = "00000000-0000-0000-0000-0000000000d1";
const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;
const renderer = new StubPdfRenderer();
const buildHtml = (p: unknown) => `<h1>${JSON.stringify(p)}</h1>`;

async function seedReport(id: string) {
  await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
    VALUES (${id}, ${CLINIC_A}, ${P1}, 'familia', '2026-01-01', '2026-01-31', '{"v":1}'::jsonb)`;
}

describe.skipIf(!hasDb)("exportReport", () => {
  // beforeAll: seed clínica A + coord + P1 (+ care_team se necessário para coordenador? não — coordenador é clínica-wide)
  afterAll(async () => { await owner?.end(); });

  test("congela report_pdf + marca exportado + grava audit_log, atomicamente", async () => {
    const R = "00000000-0000-0000-0000-0000000000e1";
    await seedReport(R);
    const { hash } = await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      exportReport(tx, { reportId: R, atorId: U_COORD_A, buildHtml, renderer }),
    );
    const [rep] = await owner!`SELECT status, pdf_hash FROM report WHERE id = ${R}`;
    const [pdf] = await owner!`SELECT hash FROM report_pdf WHERE report_id = ${R}`;
    const [log] = await owner!`SELECT acao FROM audit_log WHERE entidade_id = ${R} AND acao = 'relatorio_exportado'`;
    expect(rep.status).toBe("exportado");
    expect(rep.pdf_hash).toBe(hash);
    expect(pdf.hash).toBe(hash);
    expect(log.acao).toBe("relatorio_exportado");
  });

  test("aborta se payload_versao mudou entre leitura e commit (race)", async () => {
    const R = "00000000-0000-0000-0000-0000000000e2";
    await seedReport(R);
    // renderer que muda a versão no banco no meio do render, simulando edição concorrente
    const racingRenderer = {
      async render(html: string) {
        await owner!`UPDATE report SET payload_versao = payload_versao + 1 WHERE id = ${R}`;
        return Buffer.from(html);
      },
    };
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (tx) =>
        exportReport(tx, { reportId: R, atorId: U_COORD_A, buildHtml, renderer: racingRenderer }),
      ),
    ).rejects.toThrow(/vers/i);
    const [rep] = await owner!`SELECT status FROM report WHERE id = ${R}`;
    expect(rep.status).toBe("rascunho"); // não congelou payload obsoleto
  });

  test("re-export de report já exportado é rejeitado", async () => {
    const R = "00000000-0000-0000-0000-0000000000e1"; // já exportado no 1º teste
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (tx) =>
        exportReport(tx, { reportId: R, atorId: U_COORD_A, buildHtml, renderer }),
      ),
    ).rejects.toThrow(/status/i);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/lib/report/export.int.test.ts`
Expected: FAIL — `exportReport` não existe.

- [ ] **Step 3: Implementar `exportReport`**

```ts
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sha256Hex } from "./hash";
import type { PdfRenderer } from "./renderer";

// Preferir reusar o tipo do gargalo único: se `rls.ts` exporta `Tx`, importar dele
// (`import type { Tx } from "../../db/rls"`) em vez de redefinir. Fallback local:
type Tx = PostgresJsDatabase<Record<string, never>>;

export type ExportParams = {
  reportId: string;
  atorId: string;
  buildHtml: (payload: unknown) => string;
  renderer: PdfRenderer;
};

// Export = 1 transação. Render antes do lock; FOR UPDATE + recheck de versão trava a race (spec §5).
export async function exportReport(tx: Tx, params: ExportParams): Promise<{ hash: string }> {
  const { reportId, atorId, buildHtml, renderer } = params;

  // Fase 1: ler estado + versão (sem lock). RLS garante tenant.
  const pre = await tx.execute(sql`
    SELECT payload, payload_versao, status, patient_id, clinic_id
    FROM report WHERE id = ${reportId}`);
  const row = (pre as unknown as any[])[0];
  if (!row) throw new Error(`exportReport: report ${reportId} não visível`);
  if (row.status !== "rascunho" && row.status !== "revisado") {
    throw new Error(`exportReport: status ${row.status} não exportável`);
  }
  const versao = row.payload_versao as number;

  // Fase 2: render + hash (fora do lock).
  const bytes = await renderer.render(buildHtml(row.payload));
  const hash = sha256Hex(bytes);

  // Fase 3: lock + recheck de versão.
  const locked = await tx.execute(sql`
    SELECT payload_versao, status FROM report WHERE id = ${reportId} FOR UPDATE`);
  const lrow = (locked as unknown as any[])[0];
  if (!lrow) throw new Error(`exportReport: report ${reportId} sumiu`);
  if (lrow.payload_versao !== versao) {
    throw new Error(`exportReport: payload_versao mudou (${versao} → ${lrow.payload_versao}); reinicie`);
  }
  if (lrow.status === "exportado") {
    throw new Error(`exportReport: status exportado durante o export`);
  }

  // Fase 4: congela bytes + marca exportado + trilha (tudo na mesma tx).
  await tx.execute(sql`
    INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${reportId}, ${bytes}, ${hash})`);
  await tx.execute(sql`
    UPDATE report SET status = 'exportado', pdf_hash = ${hash},
      exportado_por = ${atorId}, exportado_em = now() WHERE id = ${reportId}`);
  await tx.execute(sql`
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
    VALUES (${row.clinic_id}, ${atorId}, 'relatorio_exportado', 'report', ${reportId}, ${row.patient_id},
            jsonb_build_object('hash', ${hash}::text))`);

  return { hash };
}
```

> Ajustar o binding do `bytes` (Buffer) ao driver `postgres`: pode exigir `sql`-tag com bytea explícito. Se o INSERT de `bytes` falhar por tipo, usar `${sql`${bytes}::bytea`}` ou o helper de bytea do driver. Validar no Step 4; se necessário, passar `bytes` como parâmetro `Buffer` (o driver `postgres` serializa Buffer como bytea nativamente).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls src/lib/report/export.int.test.ts`
Expected: 3 testes PASS. Se o INSERT de `bytes` falhar, aplicar o ajuste de bytea da nota acima e repetir.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/export.ts src/lib/report/export.int.test.ts
git commit -m "feat(report): transactional export with race-guard + audit trail (fase5 f0)"
```

---

### Task 6: Re-download serve o snapshot — `getReportPdf`

**Files:**
- Create: `src/lib/report/download.ts`
- Test: `src/lib/report/download.int.test.ts`

**Interfaces:**
- Consumes: `report_pdf` + RLS (Task 2).
- Produces: `async function getReportPdf(tx: Tx, reportId: string): Promise<{ bytes: Buffer; hash: string } | null>` — devolve o snapshot congelado; **nunca** re-renderiza.

- [ ] **Step 1: Teste falho**

```ts
// ... imports e seed como export.int.test.ts; usa um report já exportado (R exportado).
test("getReportPdf devolve os bytes congelados, hash idêntico", async () => {
  const out = await withTenant(ctx("coordenador", U_COORD_A), (tx) => getReportPdf(tx, R));
  expect(out).not.toBeNull();
  expect(sha256Hex(out!.bytes)).toBe(out!.hash);
});
test("report de outra clínica → null (RLS)", async () => {
  const out = await withTenant(ctx("coordenador", U_COORD_A), (tx) => getReportPdf(tx, R_B));
  expect(out).toBeNull();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/lib/report/download.int.test.ts`
Expected: FAIL — `getReportPdf` não existe.

- [ ] **Step 3: Implementar**

```ts
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type Tx = PostgresJsDatabase<Record<string, never>>;

export async function getReportPdf(tx: Tx, reportId: string): Promise<{ bytes: Buffer; hash: string } | null> {
  const res = await tx.execute(sql`SELECT bytes, hash FROM report_pdf WHERE report_id = ${reportId}`);
  const row = (res as unknown as any[])[0];
  if (!row) return null;
  return { bytes: row.bytes as Buffer, hash: row.hash as string };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls src/lib/report/download.int.test.ts`
Expected: 2 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/download.ts src/lib/report/download.int.test.ts
git commit -m "feat(report): getReportPdf serves frozen snapshot (fase5 f0)"
```

---

### Task 7: Renderer Chromium sandboxed (INFRA NOVA — gate de confirmação)

> ⚠️ **Bloqueio de infra (CLAUDE.md "confirmar antes"):** não existe Chromium headless em runtime hoje (só Playwright devDep p/ E2E). Este renderer introduz browser no runtime do app. **Antes de implementar:** confirmar com o Rômulo a estratégia — Playwright core no server, `@sparticuz/chromium` (serverless), ou serviço de render dedicado — à luz do pivô VPS/Easypanel. Até lá, o produto usa `StubPdfRenderer`; toda a lógica de export (Tasks 5-6) já está testada sem browser.

**Files:**
- Create: `src/lib/report/chromium-renderer.ts`
- Create: `src/lib/report/factory.ts` (resolve renderer por ambiente, espelha `resolveProvider` de extraction)
- Test: `src/lib/report/chromium-renderer.security.test.ts` (E2E-ish; pode ir p/ `e2e/` se exigir browser real)

**Interfaces:**
- Consumes: `PdfRenderer` (Task 4).
- Produces: `class ChromiumPdfRenderer implements PdfRenderer`; `resolveRenderer(env): PdfRenderer`.

- [ ] **Step 1: Escrever o teste de segurança falho (SSRF/LFI)**

O teste renderiza um HTML com payload hostil e verifica que **nenhuma requisição de saída** ocorre e que JS não executa.

```ts
import { describe, expect, test } from "vitest";
import { ChromiumPdfRenderer } from "./chromium-renderer";

// Marcar como teste que exige Chromium instalado; skip se ausente.
describe("ChromiumPdfRenderer — sandbox", () => {
  test("não dispara requisição de saída para file:// nem metadata", async () => {
    const requests: string[] = [];
    const r = new ChromiumPdfRenderer({ onRequest: (u) => requests.push(u) }); // hook de teste
    const hostil = `<img src="file:///etc/passwd"><iframe src="http://169.254.169.254/latest/meta-data/"></iframe>`;
    await r.render(hostil);
    expect(requests.filter((u) => !u.startsWith("data:") && !u.startsWith("about:"))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/lib/report/chromium-renderer.security.test.ts`
Expected: FAIL — classe não existe.

- [ ] **Step 3: Implementar o renderer com sandbox**

```ts
import { chromium, type Browser } from "playwright";
import type { PdfRenderer } from "./renderer";

type Opts = { onRequest?: (url: string) => void };

// Sandbox obrigatório (spec §5, red-team #2): JS off, TODA requisição de saída abortada,
// file:// proibido, sem acesso a rede de metadata.
export class ChromiumPdfRenderer implements PdfRenderer {
  constructor(private opts: Opts = {}) {}

  async render(html: string): Promise<Buffer> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      // bloquear TODA saída: só data:/about: passam.
      await page.route("**/*", (route) => {
        const url = route.request().url();
        this.opts.onRequest?.(url);
        if (url.startsWith("data:") || url.startsWith("about:")) return route.continue();
        return route.abort();
      });
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      return pdf;
    } finally {
      await browser?.close();
    }
  }
}
```

`src/lib/report/factory.ts`:
```ts
import { StubPdfRenderer, type PdfRenderer } from "./renderer";
import { ChromiumPdfRenderer } from "./chromium-renderer";

// Demo/test → stub; prod → Chromium. Espelha resolveProvider de extraction.
export function resolveRenderer(env: { useChromium: boolean }): PdfRenderer {
  return env.useChromium ? new ChromiumPdfRenderer() : new StubPdfRenderer();
}
```

- [ ] **Step 4: Rodar e confirmar que passa (com Chromium instalado)**

Run: `pnpm exec playwright install chromium` (uma vez) depois `pnpm test src/lib/report/chromium-renderer.security.test.ts`
Expected: PASS — 0 requisições de saída não-data/about. Se o teste exigir browser e o ambiente não tiver, mover para `e2e/` e rodar via `pnpm test:e2e`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/chromium-renderer.ts src/lib/report/factory.ts src/lib/report/chromium-renderer.security.test.ts
git commit -m "feat(report): sandboxed Chromium PDF renderer (fase5 f0)"
```

---

### Task 8: Reconciliar documentação + BACKLOG

**Files:**
- Modify: `docs/dados/modelo-de-dados.md` (§1.6 e §4.4)
- Modify: `BACKLOG.md`

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Reconciliar `modelo-de-dados.md`**

Atualizar a DDL de `report` (§1.6) para refletir o construído: adicionar `payload_versao int NOT NULL DEFAULT 1`, `pdf_hash text`, `deletado_em timestamptz`; **remover** `pdf_bytes` da tabela `report` e documentar a tabela-filha `report_pdf` (1:1, bytea, RLS própria `report_pdf_scope`, helper `app_report_visivel`). Em §4.4, anotar o INSERT de `audit_log` com **ator amarrado** (`ator_id = app.user_id`) e a função `app_purgar_report`. Marcar as mudanças com a data (19/07/2026) no estilo das notas existentes.

- [ ] **Step 2: Atualizar `BACKLOG.md`**

Registrar como itens abertos (não implementados em F0):
- Tier-gating de relatório (família=Clínica / narrativo=Convênio / bruto=Diário) — diferido; falta modelo de plano/billing. Decidir onde mora o tier.
- Prazo concreto de retenção por `tipo` (fonte: `docs/legal/`, CFM/prontuário).
- **Bloqueador jurídico:** uso secundário de dado clínico de menor ("Iris empresa de dados") — exige 1 página em `docs/legal/` (base legal + anonimização) antes de qualquer pipeline de analytics/treino. F0 não abre nenhum caminho sobre `report`/`report_pdf`.
- Dívida: `bytea` no Postgres — reavaliar vs. storage dedicado se `pg_dump`/replicação incharem.
- Leitor da trilha (`admin_recepcao` vs. DPO à parte) — confirmar.
- Infra: Chromium em runtime (Task 7) — confirmar estratégia à luz do pivô VPS.

- [ ] **Step 3: Verificação final + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls`
Expected: tudo verde.

```bash
git add docs/dados/modelo-de-dados.md BACKLOG.md
git commit -m "docs(fase5): reconcile modelo-de-dados + backlog for f0 foundation"
```

---

## Definição de Pronto (F0) — mapeada às tasks

- [ ] Migrações `0038`+`0039` aplicam local e são reversíveis (Task 1, 2).
- [ ] RLS `report`: cross-tenant → 0; terapeuta off-team → 0; soft-deletado invisível (Task 2).
- [ ] RLS `report_pdf`: cross-tenant → 0; soft-delete esconde PDF (Task 2).
- [ ] `audit_log`: UPDATE/DELETE por `app_role` falham; ator forjado rejeitado; SELECT role-gated (Task 2).
- [ ] `report_pdf`: UPDATE/DELETE por `app_role` falham (write-once) (Task 2).
- [ ] CHECKs: `exportado ⇒ pdf_hash NOT NULL`, `periodo`, `bruto ⇒ !ia` (Task 1).
- [ ] Race de export: versão muda entre render e commit → aborta, não congela obsoleto (Task 5).
- [ ] Export grava `report_pdf`+`report`+`audit_log` na mesma tx; rollback atômico (Task 5).
- [ ] Re-download devolve `report_pdf.bytes`, hash idêntico, não re-renderiza (Task 6).
- [ ] Purga: log-antes-de-delete; cascata remove `report_pdf`; só coordenador (Task 3).
- [ ] Sandbox de render: `file://`/metadata → 0 requisições de saída; JS off (Task 7, infra-gated).
- [ ] `pnpm typecheck`/`lint`/`test`/`test:rls` verdes (Task 8).
- [ ] `modelo-de-dados.md` + `BACKLOG.md` reconciliados (Task 8).
