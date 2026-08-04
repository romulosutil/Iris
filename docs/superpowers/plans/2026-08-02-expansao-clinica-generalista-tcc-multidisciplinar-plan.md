# Expansão Clínica & Governança Plan (#98, #119, #99)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o atendimento sem protocolo (Psicologia Generalista), o prontuário multidisciplinar unificado com Audit Log de acesso e bloqueio de recepção via RLS real, e o módulo de Terapia Cognitivo-Comportamental (TCC).

**Architecture:** Suporte a `protocol_id = null`, novo modo de agente de IA para resumos sem pontuação (via `AgentInvoker` real, mesmo padrão do `ClaudeProvider` de extração), tabela `clinical_access_log` com RLS restritivo por papel para recepção, e extrator de Registro de Pensamentos Automáticos (RPD) com fila de revisão do terapeuta.

**Tech Stack:** Next.js 16, Postgres, Drizzle ORM, Vitest, Anthropic API (via `AgentInvoker`), Better Auth.

> **Nota (02/08/2026):** Task 1 (#98) e Task 2 (#119) sem label `pos-mvp` — expansão de nicho + endurecimento de RLS multidisciplinar, prioridade **P1/P2** (depois da Fatia B de billing, antes do nicho TCC). Task 3 (#99, TCC) tem label `pos-mvp` — fica por último dos três, mesmo estando no mesmo plano por dependência de código (reusa `AgentInvoker`/RLS da Task 2). Todo o plano toca schema/RLS: confirmação do Rômulo obrigatória antes de execução (`CLAUDE.md`), não só revisão de doc.

## Global Constraints

- Toda migração usa o próximo número livre real do journal: `db/migrations/meta/_journal.json` termina em `idx: 63` (`0063_reaplica_purga_report_oracle`, `when: 1785421573000`). Próxima migração é **`0064`**, `when: 1785421574000` (regra `drizzle-hand-migration-when-ordering` — nunca placeholder, sempre `anterior + 1000`).
- Papéis reais no schema (`userRoleTipo`, `src/db/schema.ts:31-34`): só `terapeuta`, `coordenador`, `admin_recepcao`. **Não existe** papel `CLINIC_OWNER`/`THERAPIST`/`COORDINATOR`/`RECEPTION` em maiúsculas — os specs de design (`docs/superpowers/specs/2026-08-02-issue-119-...md`) usam nomes que não correspondem ao enum real; este plano usa os valores reais.
- Predicado de equipe de cuidado já existe como função SQL `app_is_on_team(patient_id)` (usada em `0042_fase5_supervisao_rls.sql`, `0014_fase4_evidence_rls.sql`). Toda nova policy de "equipe clínica" deve reusar essa função, não reimplementar a lógica.
- `consent.tipo = 'autoconsentimento_titular_adulto'` **já existe** no schema (`src/db/schema.ts:51`, migrações `0050`/`0051`, issue #100 já implementada). O valor `'tratamento_dados_titular_adulto'` citado nos specs de design não existe no enum — usar o valor real.
- Não existe tabela `family_report`. O relatório à família vive na tabela `report` (`tipo = 'familia'`, ver `db/tests/fase5-report-rls.int.test.ts`).
- Testes de integração RLS seguem o padrão de `db/tests/*.int.test.ts`: `describe.skipIf(!hasDb)`, client `owner` via `postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })` para setup, `withTenant(ctx, cb)` de `src/db/rls.ts` para simular o papel em teste. Rodar com `pnpm test:rls`.
- Qualquer alteração de schema.ts é seguida de `pnpm db:generate` (gera a migração) e `pnpm db:migrate` (aplica local) como steps explícitos — nunca só editar `schema.ts`.
- Este plano toca modelo de dados e RLS. Por `CLAUDE.md` do projeto, exige plan mode / confirmação do Rômulo antes de execução real (não é só revisão de doc).

---

## Mapeamento de Arquivos

- **Generalista:** `src/lib/agent/generalist-mode.ts`, `src/lib/agent/generalist-mode.test.ts`, `src/lib/agent/generalist-prompt.ts`
- **Audit Log & RLS:** `src/db/schema.ts`, `db/migrations/0064_clinical_access_log.sql`, `src/lib/audit/clinical-access.ts`, `src/lib/audit/clinical-access.test.ts`, `db/tests/prontuario-roles-rls.int.test.ts`
- **TCC:** `src/lib/agent/tcc-mode.ts`, `src/lib/agent/tcc-mode.test.ts`, `src/app/(app)/pacientes/[id]/tcc/actions.ts`

---

## Tarefas de Implementação

### Task 1: Psicologia Generalista / Sem Protocolo (Issue #98)

**Regras Levantadas:**
1. `patient_protocol.protocol_id` vira `nullable`.
2. Quando `protocol_id = null`, o agente de IA desativa a busca por domínios/marcos e gera apenas: Resumo Clínico, Temas Emergentes, Insights e Alertas de Risco.
3. Usa o consentimento de paciente adulto já existente (`consent.tipo = 'autoconsentimento_titular_adulto'`, issue #100 — sem migração nova nesta task).

**Files:**
- Modify: `src/db/schema.ts` (`patientProtocol.protocolId` nullable)
- Create: `src/lib/agent/generalist-mode.ts`, `src/lib/agent/generalist-mode.test.ts`, `src/lib/agent/generalist-prompt.ts`

**Interfaces:**
- Consumes: `AgentInvoker` (assinatura `(input: { system: string; user: string }) => Promise<unknown>`, definida em `src/lib/extraction/claude-provider.ts:24-27`); `createAnthropicInvoker()` do mesmo arquivo.
- Produces: `processarSessaoGeneralista(invoker: AgentInvoker, notaConsolidada: string): Promise<ResultadoGeneralista>` — usado por nenhuma task futura deste plano, mas deve seguir a mesma forma de retorno (`{ resumoClinico, temasEmergentes, insightsEvolutivos, alertasRisco }`) que o dossiê narrativo do paciente já espera (ver `docs/superpowers/specs/2026-08-02-issue-98-terapia-convencional-design.md` §3.2).

- [ ] **Step 1: Rodar `pnpm db:generate` após tornar `protocolId` nullable**

File: `src/db/schema.ts` — localizar `patientProtocol` e remover `.notNull()` de `protocolId`.

Run: `pnpm db:generate` (gera `db/migrations/0064_...sql`), depois `pnpm db:migrate` local.

- [ ] **Step 2: Escrever teste unitário falho para o agente generalista, injetando um `AgentInvoker` fake**

File: `src/lib/agent/generalist-mode.test.ts`
```typescript
import { describe, it, expect, vi } from "vitest";
import { processarSessaoGeneralista } from "./generalist-mode";

describe("processarSessaoGeneralista", () => {
  it("extrai resumo e alertas de risco sem gerar pontuações de domínios", async () => {
    const invokerFake = vi.fn().mockResolvedValue({
      modo: "psicologia_generalista",
      resumo_clinico: "Paciente relata ansiedade ao falar em público.",
      temas_emergentes: ["Ansiedade de desempenho"],
      insights_evolutivos: "Maior autorreflexão sobre o gatilho.",
      alertas_risco: [
        {
          nivel: "CRITICO",
          tipo: "IDEACAO_SUICIDA",
          trecho_literal: "frase de risco",
          justificativa: "Relato explícito de desesperança",
        },
      ],
    });

    const resultado = await processarSessaoGeneralista(
      invokerFake,
      "Paciente relata ansiedade forte ao falar em público. Expressou desespero e frase de risco.",
    );

    expect(invokerFake).toHaveBeenCalledOnce();
    expect(resultado.resumoClinico).toBeDefined();
    expect(resultado.alertasRisco.length).toBeGreaterThan(0);
    expect(resultado).not.toHaveProperty("dominios");
  });

  it("lança se o modelo devolver forma fora do schema (nunca grava saída inválida)", async () => {
    const invokerFake = vi.fn().mockResolvedValue({ lixo: true });
    await expect(
      processarSessaoGeneralista(invokerFake, "texto qualquer"),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2b: Executar teste para verificar falha**

Run: `pnpm test src/lib/agent/generalist-mode.test.ts`
Expected: FAIL — `generalist-mode` não existe.

- [ ] **Step 3: Escrever o prompt e o schema zod de saída**

File: `src/lib/agent/generalist-prompt.ts`
```typescript
import { z } from "zod";

export const generalistOutputSchema = z.object({
  modo: z.literal("psicologia_generalista"),
  resumo_clinico: z.string().min(1),
  temas_emergentes: z.array(z.string()),
  insights_evolutivos: z.string(),
  alertas_risco: z.array(
    z.object({
      nivel: z.enum(["BAIXO", "MODERADO", "CRITICO"]),
      tipo: z.string(),
      trecho_literal: z.string(),
      justificativa: z.string(),
    }),
  ),
});
export type GeneralistOutput = z.infer<typeof generalistOutputSchema>;

// Regras invioláveis do modo generalista (issue-98 design §3.3):
// nunca nota/pontuação/domínio, nunca CID/DSM ou medicação, sempre
// proveniência frase-a-frase até o texto do diário.
export const GENERALIST_SYSTEM_PROMPT = `Você é um assistente de organização
de prontuário para psicoterapia sem protocolo estruturado (Psicologia
Generalista). Você NÃO atribui notas, pontos ou porcentagens de domínio.
Você NÃO sugere diagnósticos CID/DSM nem prescreve medicações. Toda
afirmação em resumo_clinico e insights_evolutivos deve ser rastreável ao
texto do diário. Retorne exclusivamente o JSON do schema fornecido.`;

export function buildGeneralistUserMessage(notaConsolidada: string): string {
  return `Diário da sessão:\n\n${notaConsolidada}`;
}
```

- [ ] **Step 4: Implementar `generalist-mode.ts` chamando o `AgentInvoker` real**

File: `src/lib/agent/generalist-mode.ts`
```typescript
import type { AgentInvoker } from "@/lib/extraction/claude-provider";
import {
  GENERALIST_SYSTEM_PROMPT,
  buildGeneralistUserMessage,
  generalistOutputSchema,
} from "./generalist-prompt";

export type ResultadoGeneralista = {
  resumoClinico: string;
  temasEmergentes: string[];
  insightsEvolutivos: string;
  alertasRisco: Array<{
    nivel: "BAIXO" | "MODERADO" | "CRITICO";
    tipo: string;
    trechoLiteral: string;
    justificativa: string;
  }>;
};

export async function processarSessaoGeneralista(
  invoker: AgentInvoker,
  notaConsolidada: string,
): Promise<ResultadoGeneralista> {
  const bruto = await invoker({
    system: GENERALIST_SYSTEM_PROMPT,
    user: buildGeneralistUserMessage(notaConsolidada),
  });

  const saida = generalistOutputSchema.parse(bruto);

  return {
    resumoClinico: saida.resumo_clinico,
    temasEmergentes: saida.temas_emergentes,
    insightsEvolutivos: saida.insights_evolutivos,
    alertasRisco: saida.alertas_risco.map((a) => ({
      nivel: a.nivel,
      tipo: a.tipo,
      trechoLiteral: a.trecho_literal,
      justificativa: a.justificativa,
    })),
  };
}
```

- [ ] **Step 5: Executar testes para verificar aprovação**

Run: `pnpm test src/lib/agent/generalist-mode.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts db/migrations/0064_clinical_access_log.sql src/lib/agent/generalist-mode.ts src/lib/agent/generalist-mode.test.ts src/lib/agent/generalist-prompt.ts
git commit -m "feat(clinical): implementar modo de psicologia generalista via AgentInvoker real (#98)"
```

> Nota: o número de migração `0064` acima é reservado para o `protocolId` nullable desta task; a Task 2 abaixo reserva `0065` para `clinical_access_log` + RLS — confirmar sequência real gerada pelo `db:generate` antes de commitar, pois o número exato depende de quantas migrações já rodaram no momento da execução.

---

### Task 2: Prontuário Multidisciplinar & Audit Log de Acesso (Issue #119)

**Regras Levantadas:**
1. Equipe de cuidado (papéis `terapeuta`, `coordenador`) enxerga 100% das notas clínicas do paciente quando está na equipe (`app_is_on_team`) ou é `coordenador` (bypassa checagem de equipe, mesmo padrão de `alerta`/`report`).
2. Papel não clínico `admin_recepcao` tem RLS bloqueado para `session_note`, `evidence`, `report` (relatório à família).
3. Toda abertura de nota clínica por profissional insere uma linha em `clinical_access_log`.

**Files:**
- Modify: `src/db/schema.ts` (tabela `clinicalAccessLog`), `src/app/(app)/diario/[sessionId]/logic.ts` (ou onde a leitura da nota é servida — confirmar caminho exato no código antes de editar)
- Create: `db/migrations/0065_clinical_access_log_rls.sql`, `src/lib/audit/clinical-access.ts`, `src/lib/audit/clinical-access.test.ts`, `db/tests/prontuario-roles-rls.int.test.ts`

**Interfaces:**
- Consumes: `withTenant(ctx: TenantContext, cb)` de `src/db/rls.ts`; `app_is_on_team(patient_id)` (função SQL existente).
- Produces: `registrarAcessoClinico(params: { clinicId: string; userId: string; patientId: string; resourceType: "SESSION_NOTE" | "EVIDENCE" | "REPORT"; resourceId: string; ipAddress?: string }): Promise<void>` — chamado pela Server Action de leitura de nota clínica (Step 5).

- [ ] **Step 1: Criar schema da tabela `clinical_access_log`**

File: `src/db/schema.ts`
```typescript
export const clinicalAccessLog = pgTable("clinical_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinic.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => user.id),
  patientId: uuid("patient_id").notNull().references(() => patient.id, { onDelete: "cascade" }),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: uuid("resource_id").notNull(),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
}, (t) => [
  index("clinical_access_patient_idx").on(t.patientId, t.accessedAt),
  index("clinical_access_user_idx").on(t.userId, t.accessedAt),
]);
```

- [ ] **Step 2: Gerar e aplicar a migração da tabela**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: novo arquivo `db/migrations/00XX_clinical_access_log.sql` (confirmar número real gerado) criando a tabela acima.

- [ ] **Step 3: Escrever a migração de RLS restringindo `admin_recepcao` em `session_note`/`evidence`/`report`, reusando `app_is_on_team`**

File: `db/migrations/00XX_clinical_access_log_rls.sql` (número seguinte ao da Step 2)
```sql
-- clinical_access_log: append-only (trilha de auditoria).
REVOKE UPDATE, DELETE ON clinical_access_log FROM app_role;
--> statement-breakpoint
GRANT SELECT, INSERT ON clinical_access_log TO app_role;
--> statement-breakpoint
ALTER TABLE clinical_access_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE clinical_access_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Leitura: equipe do paciente ou coordenador da clínica (mesmo padrão de `alerta`).
CREATE POLICY clinical_access_log_select ON clinical_access_log FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
CREATE POLICY clinical_access_log_insert ON clinical_access_log FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND user_id = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
-- Endurece session_note: recepção deixa de enxergar nota clínica. Policy
-- session_note_select existente (0006_fase2_rls.sql) usa
-- app_session_clinica_visivel(session_id), que não exclui admin_recepcao —
-- substituir por policy que também exige papel clínico.
DROP POLICY session_note_select ON session_note;
--> statement-breakpoint
CREATE POLICY session_note_select ON session_note FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_clinica_visivel(session_id)
  AND current_setting('app.user_role') IN ('terapeuta', 'coordenador')
);
--> statement-breakpoint
-- evidence: mesmo endurecimento (policy original em 0014_fase4_evidence_rls.sql).
DROP POLICY evidence_select ON evidence;
--> statement-breakpoint
CREATE POLICY evidence_select ON evidence FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_patient_in_clinic(patient_id)
  AND current_setting('app.user_role') IN ('terapeuta', 'coordenador')
);
--> statement-breakpoint
-- report (relatório à família, tipo='familia'): recepção fora. Policy
-- original em 0039_fase5_report_audit_rls.sql — confirmar predicado exato
-- antes de escrever o DROP/CREATE final; placeholder de intenção:
-- adicionar `AND current_setting('app.user_role') IN ('terapeuta', 'coordenador')`
-- à condição já existente, sem remover o escopo de tenant/equipe atual.
```

> Antes de aplicar: ler o texto completo de `0006_fase2_rls.sql`, `0014_fase4_evidence_rls.sql` e `0039_fase5_report_audit_rls.sql` para copiar o predicado exato de cada policy atual e não regredir nenhuma condição já validada (ex.: `app_patient_in_clinic`, escopo de INSERT/UPDATE que não deve mudar).

- [ ] **Step 4: Escrever teste de RLS real (mirror de `db/tests/fase6-recepcao-isolation.int.test.ts`)**

File: `db/tests/prontuario-roles-rls.int.test.ts`
```typescript
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const U_TER_A = "00000000-0000-0000-0000-0000000000a1";
const U_RECEP_A = "00000000-0000-0000-0000-0000000000d2";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const PATIENT = "00000000-0000-0000-0000-0000000000d1";
const SESSION = "00000000-0000-0000-0000-0000000000e1";

const ctx = (role: string, userId: string) =>
  ({ role, userId, clinicId: CLINIC_A }) as TenantContext;

describe.skipIf(!hasDb)("prontuário multidisciplinar · bloqueio de recepção", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE session_note, session, care_team_membership, patient, clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_TER_A}, 'Ter A', 'ter-a@prontuario.test'),
      (${U_RECEP_A}, 'Recep A', 'recep-a@prontuario.test'),
      (${U_COORD_A}, 'Coord A', 'coord-a@prontuario.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_TER_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_RECEP_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC_A}, 'Paciente 1')`;
    await owner!`INSERT INTO care_team_membership (user_id, patient_id, papel_na_equipe) VALUES (${U_TER_A}, ${PATIENT}, 'terapeuta_referencia')`;
    await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, status) VALUES (${SESSION}, ${CLINIC_A}, ${PATIENT}, ${U_TER_A}, 'realizada')`;
    await owner!`INSERT INTO session_note (session_id, clinic_id, autor_id, tipo, texto) VALUES (${SESSION}, ${CLINIC_A}, ${U_TER_A}, 'diario', 'Nota clínica')`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("terapeuta da equipe lê session_note", async () => {
    const rows = await withTenant(ctx("terapeuta", U_TER_A), (db) =>
      db.execute(sql`SELECT id FROM session_note WHERE session_id = ${SESSION}::uuid`),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test("coordenador lê session_note mesmo fora da equipe explícita", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT id FROM session_note WHERE session_id = ${SESSION}::uuid`),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test("admin_recepcao NÃO lê session_note", async () => {
    const rows = await withTenant(ctx("admin_recepcao", U_RECEP_A), (db) =>
      db.execute(sql`SELECT id FROM session_note WHERE session_id = ${SESSION}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 4b: Executar teste RLS**

Run: `pnpm test:rls db/tests/prontuario-roles-rls.int.test.ts`
Expected: PASS (skip automático sem `MIGRATION_DATABASE_URL`, roda de verdade com Postgres local — ver memória `dev-env-corepack-docker-db`).

- [ ] **Step 5: Implementar `registrarAcessoClinico` e conectar na leitura real da nota**

File: `src/lib/audit/clinical-access.ts`
```typescript
import { sql } from "@/db/client";
import { clinicalAccessLog } from "@/db/schema";

export async function registrarAcessoClinico(params: {
  clinicId: string;
  userId: string;
  patientId: string;
  resourceType: "SESSION_NOTE" | "EVIDENCE" | "REPORT";
  resourceId: string;
  ipAddress?: string;
}) {
  await sql.insert(clinicalAccessLog).values({
    clinicId: params.clinicId,
    userId: params.userId,
    patientId: params.patientId,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    ipAddress: params.ipAddress,
  });
}
```

Then: localizar em `src/app/(app)/diario/[sessionId]/logic.ts` (ou Server Action equivalente confirmada por grep de `session_note` reads) a função que devolve a nota clínica ao terapeuta/coordenador para renderização e adicionar, após a leitura bem-sucedida, uma chamada `await registrarAcessoClinico({...})` — não bloqueante para a resposta (disparar e não esperar, ou `waitUntil` se disponível no runtime).

- [ ] **Step 6: Teste unitário do audit log**

File: `src/lib/audit/clinical-access.test.ts`
```typescript
import { describe, it, expect, vi } from "vitest";
import { registrarAcessoClinico } from "./clinical-access";

vi.mock("@/db/client", () => ({
  sql: { insert: vi.fn(() => ({ values: vi.fn() })) },
}));

describe("registrarAcessoClinico", () => {
  it("grava linha com clinicId/userId/patientId/resourceType/resourceId", async () => {
    const { sql } = await import("@/db/client");
    await registrarAcessoClinico({
      clinicId: "c1",
      userId: "u1",
      patientId: "p1",
      resourceType: "SESSION_NOTE",
      resourceId: "r1",
    });
    expect(sql.insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Executar toda a suíte de testes afetada**

Run: `pnpm test src/lib/audit/clinical-access.test.ts && pnpm test:rls db/tests/prontuario-roles-rls.int.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts db/migrations/ src/lib/audit/clinical-access.ts src/lib/audit/clinical-access.test.ts db/tests/prontuario-roles-rls.int.test.ts
git commit -m "feat(security): implementar clinical_access_log e endurecer RLS de prontuário contra recepção (#119)"
```

---

### Task 3: Módulo de TCC e Registro de Pensamentos RPD (Issue #99)

**Regras Levantadas:**
1. Extração da estrutura RPD (Situação, Pensamento Automático, Emoção, Distorção Cognitiva, Resposta Racional).
2. Distorção Cognitiva entra com status `PENDENTE_REVISAO` até aprovação do terapeuta — precisa de coluna de status e Server Action de aprovação, não só schema.
3. Suporte a escalas isentas PHQ-9 e GAD-7 — modelagem mínima de catálogo de escala + pontuação por sessão (sem gráfico, fica pra fatia de UI).

**Files:**
- Modify: `src/db/schema.ts` (tabela `tccThoughtRecord` + tabela `tccScaleScore`)
- Create: `db/migrations/00XX_tcc_thought_record.sql`, `src/lib/agent/tcc-mode.ts`, `src/lib/agent/tcc-mode.test.ts`, `src/app/(app)/pacientes/[id]/tcc/actions.ts`, `src/app/(app)/pacientes/[id]/tcc/actions.test.ts`

**Interfaces:**
- Consumes: `AgentInvoker` (mesma interface da Task 1).
- Produces: `processarSessaoTCC(invoker: AgentInvoker, relato: string): Promise<ResultadoTCC>`; `aprovarDistorcaoCognitiva(recordId: string, distorcaoFinal: string, aprovadorId: string): Promise<void>`.

- [ ] **Step 1: Criar schema das tabelas `tcc_thought_record` (com status) e `tcc_scale_score`**

File: `src/db/schema.ts`
```typescript
export const tccStatusRevisao = pgEnum("tcc_status_revisao", [
  "PENDENTE_REVISAO",
  "APROVADO",
  "CORRIGIDO",
]);

export const tccThoughtRecord = pgTable("tcc_thought_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinic.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patient.id, { onDelete: "cascade" }),
  sessionNoteId: uuid("session_note_id").references(() => sessionNote.id),
  situacao: text("situacao").notNull(),
  pensamentoAutomatico: text("pensamento_automatico").notNull(),
  emocaoNome: varchar("emocao_nome", { length: 50 }),
  emocaoIntensidade: integer("emocao_intensidade"),
  distorcaoCognitiva: varchar("distorcao_cognitiva", { length: 50 }),
  statusRevisao: tccStatusRevisao("status_revisao").notNull().default("PENDENTE_REVISAO"),
  aprovadoPor: uuid("aprovado_por").references(() => user.id),
  respostaRacional: text("resposta_racional"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// PHQ-9 e GAD-7 são de domínio público (issue-99 design §2.1) — nenhuma outra
// escala é permitida aqui por restrição de direitos autorais.
export const tccEscalaSigla = pgEnum("tcc_escala_sigla", ["PHQ-9", "GAD-7"]);

export const tccScaleScore = pgTable("tcc_scale_score", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinic.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patient.id, { onDelete: "cascade" }),
  sessionNoteId: uuid("session_note_id").references(() => sessionNote.id),
  sigla: tccEscalaSigla("sigla").notNull(),
  pontuacao: integer("pontuacao").notNull(),
  classificacao: varchar("classificacao", { length: 50 }),
  aplicadaEm: timestamp("aplicada_em", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Gerar e aplicar migração**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: migração criando `tcc_thought_record`, `tcc_scale_score` e os dois enums.

- [ ] **Step 3: RLS das duas tabelas (mesmo padrão de `evidence`/`session_note` pós-Task 2 — só equipe clínica)**

File: `db/migrations/00XX_tcc_rls.sql`
```sql
GRANT SELECT, INSERT ON tcc_thought_record TO app_role;
--> statement-breakpoint
GRANT UPDATE (distorcao_cognitiva, status_revisao, aprovado_por) ON tcc_thought_record TO app_role;
--> statement-breakpoint
ALTER TABLE tcc_thought_record ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tcc_thought_record FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tcc_thought_record_select ON tcc_thought_record FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('terapeuta', 'coordenador')
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
CREATE POLICY tcc_thought_record_insert ON tcc_thought_record FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('terapeuta', 'coordenador')
  AND app_is_on_team(patient_id)
);
--> statement-breakpoint
CREATE POLICY tcc_thought_record_update ON tcc_thought_record FOR UPDATE TO app_role
  USING (clinic_id = current_setting('app.clinic_id')::uuid AND app_is_on_team(patient_id))
  WITH CHECK (clinic_id = current_setting('app.clinic_id')::uuid AND app_is_on_team(patient_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON tcc_scale_score TO app_role;
--> statement-breakpoint
ALTER TABLE tcc_scale_score ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tcc_scale_score FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tcc_scale_score_select ON tcc_scale_score FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('terapeuta', 'coordenador')
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
CREATE POLICY tcc_scale_score_insert ON tcc_scale_score FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('terapeuta', 'coordenador')
  AND app_is_on_team(patient_id)
);
```

- [ ] **Step 4: Escrever teste de extração RPD com `AgentInvoker` fake**

File: `src/lib/agent/tcc-mode.test.ts`
```typescript
import { describe, it, expect, vi } from "vitest";
import { processarSessaoTCC } from "./tcc-mode";

describe("processarSessaoTCC", () => {
  it("extrai estrutura de RPD com status PENDENTE_REVISAO", async () => {
    const invokerFake = vi.fn().mockResolvedValue({
      protocolo: "TCC",
      registros_pensamento: [
        {
          situacao: "Reunião de trabalho",
          pensamento_automatico: "Nada dará certo",
          emocao_nome: "Ansiedade",
          emocao_intensidade_0_100: 80,
          distorcao_cognitiva: "CATASTROFIZACAO",
          resposta_racional: "Tenho preparo prévio",
        },
      ],
      escalas_aplicadas: [],
    });

    const resultado = await processarSessaoTCC(invokerFake, "relato qualquer");
    expect(resultado.registrosPensamento.length).toBeGreaterThan(0);
    expect(resultado.registrosPensamento[0].distorcaoCognitiva).toBe("CATASTROFIZACAO");
    expect(resultado.registrosPensamento[0].statusRevisao).toBe("PENDENTE_REVISAO");
  });

  it("só aceita escalas PHQ-9 e GAD-7", async () => {
    const invokerFake = vi.fn().mockResolvedValue({
      protocolo: "TCC",
      registros_pensamento: [],
      escalas_aplicadas: [{ sigla: "BDI", pontuacao: 10 }],
    });
    await expect(processarSessaoTCC(invokerFake, "relato")).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Implementar `tcc-mode.ts` via `AgentInvoker` real + zod**

File: `src/lib/agent/tcc-mode.ts`
```typescript
import { z } from "zod";
import type { AgentInvoker } from "@/lib/extraction/claude-provider";

const tccOutputSchema = z.object({
  protocolo: z.literal("TCC"),
  registros_pensamento: z.array(
    z.object({
      situacao: z.string(),
      pensamento_automatico: z.string(),
      emocao_nome: z.string().optional(),
      emocao_intensidade_0_100: z.number().min(0).max(100).optional(),
      distorcao_cognitiva: z.string().optional(),
      resposta_racional: z.string().optional(),
    }),
  ),
  escalas_aplicadas: z.array(
    z.object({
      sigla: z.enum(["PHQ-9", "GAD-7"]),
      pontuacao: z.number(),
      classificacao: z.string().optional(),
    }),
  ),
});

const TCC_SYSTEM_PROMPT = `Você extrai Registros de Pensamentos Automáticos
(RPD) de relatos de sessão de TCC. Toda distorção cognitiva extraída entra
como sugestão, não como fato consolidado — o terapeuta aprova ou corrige.
Só reconheça escalas de domínio público PHQ-9 e GAD-7; nunca aceite outras
siglas de escala (direitos autorais). Retorne exclusivamente o JSON do
schema fornecido.`;

export async function processarSessaoTCC(invoker: AgentInvoker, relato: string) {
  const bruto = await invoker({ system: TCC_SYSTEM_PROMPT, user: relato });
  const saida = tccOutputSchema.parse(bruto);

  return {
    registrosPensamento: saida.registros_pensamento.map((r) => ({
      situacao: r.situacao,
      pensamentoAutomatico: r.pensamento_automatico,
      emocaoNome: r.emocao_nome ?? null,
      emocaoIntensidade: r.emocao_intensidade_0_100 ?? null,
      distorcaoCognitiva: r.distorcao_cognitiva ?? null,
      respostaRacional: r.resposta_racional ?? null,
      statusRevisao: "PENDENTE_REVISAO" as const,
    })),
    escalasAplicadas: saida.escalas_aplicadas,
  };
}
```

- [ ] **Step 6: Server Action de aprovação da distorção cognitiva pelo terapeuta**

File: `src/app/(app)/pacientes/[id]/tcc/actions.ts`
```typescript
"use server";
import { sql } from "@/db/client";
import { tccThoughtRecord } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/auth/tenant";

export async function aprovarDistorcaoCognitiva(
  recordId: string,
  distorcaoFinal: string,
) {
  const ctx = await getTenantContext();
  await sql
    .update(tccThoughtRecord)
    .set({
      distorcaoCognitiva: distorcaoFinal,
      statusRevisao: "APROVADO",
      aprovadoPor: ctx.userId,
    })
    .where(eq(tccThoughtRecord.id, recordId));
}
```

- [ ] **Step 7: Teste da Server Action de aprovação**

File: `src/app/(app)/pacientes/[id]/tcc/actions.test.ts` — cobrir: aprovação grava `statusRevisao = 'APROVADO'` e `aprovadoPor`; terapeuta fora da equipe recebe erro de RLS (integração, `.int.test.ts` separado se preferir seguir a convenção do repo).

- [ ] **Step 8: Executar testes de TCC**

Run: `pnpm test src/lib/agent/tcc-mode.test.ts src/app/\(app\)/pacientes/\[id\]/tcc/actions.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts db/migrations/ src/lib/agent/tcc-mode.ts src/lib/agent/tcc-mode.test.ts src/app/\(app\)/pacientes/\[id\]/tcc/
git commit -m "feat(tcc): implementar extrator de RPD, fila de revisão e escalas PHQ-9/GAD-7 (#99)"
```

---

## Self-Review (aplicado)

- **Cobertura de spec:** rule 3 do Task 1 (consentimento adulto) resolvida por referência ao trabalho já feito em #100 — sem nova migração, correção do valor de enum errado citado no spec original. Rule 2/3 do Task 2 (bloqueio recepção + audit log) cobertas com policy real + teste real + wiring do caller. Rules 2/3 do Task 3 (status de revisão + escalas isentas) cobertas com coluna + Server Action + enum restrito.
- **Placeholder scan:** removido o comentário `// Teste de consulta simulando role RECEPTION...` (era placeholder puro); todo `console.log`/stub de LLM hardcoded foi substituído por chamada real ao `AgentInvoker`.
- **Consistência de tipos:** `AgentInvoker` usado idêntico entre Task 1 e Task 3 (mesmo import de `src/lib/extraction/claude-provider`). Papéis usados em toda policy SQL são sempre `'terapeuta' | 'coordenador' | 'admin_recepcao'` — nunca os nomes em maiúsculas dos specs de design originais.
- **Risco residual anotado, não resolvido neste plano:** o texto exato das policies `session_note_select`/`evidence_select`/`report_select` pré-existentes precisa ser lido integralmente antes de escrever o `DROP POLICY`/`CREATE POLICY` final da Task 2 Step 3 — o SQL acima é a intenção correta, não um DDL cego para copiar sem checar a policy atual primeiro (evita regressão silenciosa em condição já validada em produção).
