# Fase 2 — Plano 1: Fundação de Dados (Metas + Diário) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assentar todo o modelo de dados de metas/diário da Fase 2 numa migração coerente (tabelas + enums + RLS + `clinic.is_demo`), com testes de isolamento RLS por tabela.

**Architecture:** Tabelas definidas via Drizzle em `src/db/schema.ts`; RLS/GRANT/REVOKE em migração SQL escrita à mão (`db/migrations/*_rls.sql`), espelhando o padrão da 1d (`0004_session_rls.sql`). Policies leem GUCs de tenant (`app.clinic_id`/`app.user_id`/`app.user_role`) setados por `withTenant`. Tabelas-filhas de `session` (nota, escopo, extração, áudio) usam helpers `SECURITY DEFINER` novos para computar visibilidade clínica sem recursão de RLS.

**Tech Stack:** Next.js (App Router) · Drizzle ORM · drizzle-kit · PostgreSQL + RLS · Vitest (unit `vitest.config.ts` / integração `vitest.integration.config.ts`) · pnpm.

## Global Constraints

- Só **tabelas** em `src/db/schema.ts`; RLS/roles/REVOKE/GRANT/seed em migração SQL à mão. (convenção do cabeçalho do schema.ts)
- Migração gerada por `drizzle-kit generate` = nome auto (ex.: `0005_*`); migração manual = nome descritivo com sufixo (ex.: `0006_fase2_rls.sql`).
- Todo statement de migração manual separado por `--> statement-breakpoint`.
- Toda tabela nova precisa de **GRANT explícito** para `app_role` (o `GRANT ON ALL TABLES` da 0001 é point-in-time).
- RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY`; policies leem `current_setting('app.*')::uuid`; `WITH CHECK` repete validação de tenant + fecha FKs que bypassam RLS.
- `admin_recepcao` é barrado de dado clínico (guardrail #1) — nota/escopo/extração/áudio NÃO são visíveis à recepção.
- Enums nomeados com sufixo `_tipo`/estado conforme convenção (`pgEnum`).
- Testes de integração auto-skipam sem `DATABASE_URL` + `MIGRATION_DATABASE_URL`; rodam com `pnpm test:rls`. Unit com `pnpm test`. Typecheck: `pnpm typecheck`.
- pt-BR em nomes de teste, comentários e copy.
- Commits frequentes, Conventional Commits em pt-BR (escopo `fase-2` ou `db`).

**Helpers `SECURITY DEFINER` existentes** (em `db/migrations/0001_rls.sql`), reusáveis:
`app_patient_in_clinic(uuid)`, `app_is_on_team(uuid)`, `app_protocol_in_clinic(uuid)`, `app_user_in_clinic(uuid)` — todos `LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public`.

---

## File Structure

- `src/db/schema.ts` — **Modify**: adiciona enums e ~9 tabelas + coluna `clinic.is_demo`.
- `db/migrations/0005_*.sql` — **Create** (via `drizzle-kit generate`): DDL das tabelas/colunas.
- `db/migrations/0006_fase2_rls.sql` — **Create** (à mão): helpers novos, ENABLE/FORCE RLS, policies, GRANT.
- `src/app/(app)/agenda/__fase2_rls__.int.test.ts` — não; testes ficam junto do domínio. Ver abaixo.
- `db/tests/fase2-rls.int.test.ts` — **Create**: testes de integração RLS das tabelas novas (o `vitest.integration.config.ts` já inclui `db/tests/**/*.int.test.ts`).

> Decisão: os testes RLS desta fundação ficam em `db/tests/fase2-rls.int.test.ts` (não numa rota de app), porque testam o banco/policies, não uma Server Action. Seguem o mesmo harness de `actions.int.test.ts` (conexão owner p/ seed, ctx literais, `withTenant`).

---

## Tabelas a criar (resumo de responsabilidade)

| Tabela                   | Responsabilidade                      | RLS-classe                 |
| ------------------------ | ------------------------------------- | -------------------------- |
| `session_note`           | texto do diário (captura/consolidada) | clínica (filha de session) |
| `session_protocol_scope` | protocolos que a sessão alimenta      | clínica (filha de session) |
| `audio_capture`          | ref do áudio local + status           | clínica (filha de session) |
| `extraction`             | saída da extração (estado sugerida)   | clínica (filha de session) |
| `goal`                   | meta + criterio_dominio               | clínica (paciente)         |
| `goal_milestone_mapping` | meta↔marco M:N                        | clínica (via goal)         |
| `milestone`              | marcos por protocolo                  | catálogo (via protocol)    |
| `goal_candidacy`         | candidatura a dominada (dormente)     | clínica (via goal)         |
| `milestone_candidacy`    | candidatura a avaliação (dormente)    | clínica (paciente)         |
| `clinic.is_demo`         | flag de clínica demo (coluna)         | —                          |

---

## Task 1: Enums, coluna `is_demo` e tabelas em `schema.ts` + migração gerada

**Files:**

- Modify: `src/db/schema.ts` (adicionar ao fim, antes de nenhum export circular; enums no topo junto dos outros `pgEnum`)
- Create (gerado): `db/migrations/0005_*.sql`

**Interfaces:**

- Consumes: `clinic`, `patient`, `appUser`, `protocol`, `session` (tabelas já existentes em `schema.ts`).
- Produces: exports Drizzle `sessionNote`, `sessionProtocolScope`, `audioCapture`, `extraction`, `goal`, `goalMilestoneMapping`, `milestone`, `goalCandidacy`, `milestoneCandidacy`; enums `sessionNoteTipo`, `audioStatusUpload`, `extractionEstado`, `goalEstado`, `sessionProtocolScopeOrigem`, `milestoneTipoEstrutura`; coluna `clinic.isDemo`.

- [ ] **Step 1: Adicionar os enums** (junto ao bloco de `pgEnum` existente em `schema.ts`, ~linha 24-46)

```ts
export const goalEstado = pgEnum("goal_estado", [
  "rascunho",
  "ativa",
  "dominada",
  "pausada",
  "descontinuada",
]);

export const sessionProtocolScopeOrigem = pgEnum(
  "session_protocol_scope_origem",
  ["inferido_disciplina", "ajustado_manualmente"],
);

export const sessionNoteTipo = pgEnum("session_note_tipo", [
  "captura_rapida",
  "nota_consolidada",
]);

export const audioStatusUpload = pgEnum("audio_status_upload", [
  "rascunho_local",
  "pendente",
  "confirmado",
  "falhou",
]);

export const extractionEstado = pgEnum("extraction_estado", [
  "sugerida",
  "pendente_reprocessamento",
]);

export const milestoneTipoEstrutura = pgEnum("milestone_tipo_estrutura", [
  "marco_simples",
  "marco_com_barreira",
  "escore_composto",
  "faixa_normativa",
]);
```

- [ ] **Step 2: Adicionar `is_demo` à tabela `clinic`**

Localize a definição de `clinic` em `schema.ts` e adicione a coluna (mesmo estilo `boolean(...).notNull().default(false)`):

```ts
  isDemo: boolean("is_demo").notNull().default(false),
```

- [ ] **Step 3: Adicionar as tabelas de diário (filhas de session)**

```ts
export const sessionNote = pgTable(
  "session_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    tipo: sessionNoteTipo("tipo").notNull(),
    texto: text("texto").notNull(),
    autorId: uuid("autor_id")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 1 captura_rapida + 1 nota_consolidada por sessão
    unique("uq_session_note_tipo").on(t.sessionId, t.tipo),
    index("idx_session_note_session").on(t.sessionId),
  ],
);

export const sessionProtocolScope = pgTable(
  "session_protocol_scope",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocol.id, { onDelete: "restrict" }),
    origem: sessionProtocolScopeOrigem("origem")
      .notNull()
      .default("inferido_disciplina"),
    ajustadoPor: uuid("ajustado_por").references(() => appUser.id),
  },
  (t) => [unique("uq_session_protocol_scope").on(t.sessionId, t.protocolId)],
);

export const audioCapture = pgTable(
  "audio_capture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    statusUpload: audioStatusUpload("status_upload")
      .notNull()
      .default("rascunho_local"),
    // Referência ao objeto no storage — nulo enquanto o áudio vive só local (Fase 2).
    objetoRef: text("objeto_ref"),
    duracaoSegundos: integer("duracao_segundos"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_audio_capture_session").on(t.sessionId)],
);

export const extraction = pgTable(
  "extraction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    estado: extractionEstado("estado").notNull().default("sugerida"),
    subtipo: text("subtipo").notNull(), // evidencia | registro_abc | ...
    trechoFonte: text("trecho_fonte").notNull(),
    confianca: text("confianca").notNull(), // alta | media | baixa
    justificativaConfianca: text("justificativa_confianca"),
    inconsistenteComHistorico: boolean("inconsistente_com_historico")
      .notNull()
      .default(false),
    parContrasteId: uuid("par_contraste_id"),
    payload: jsonb("payload").notNull(), // a forma do subtipo (output-schema.json)
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_extraction_session").on(t.sessionId)],
);
```

- [ ] **Step 4: Adicionar as tabelas de metas/marcos**

```ts
export const milestone = pgTable(
  "milestone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocol.id, { onDelete: "cascade" }),
    dominioId: text("dominio_id").notNull(), // 'mando','tato',... chave estável do agente
    nome: text("nome").notNull(),
    nivel: text("nivel"),
    tipoEstrutura: milestoneTipoEstrutura("tipo_estrutura").notNull(),
    estrutura: jsonb("estrutura").notNull(), // escala/critério formal/componentes
    ordem: integer("ordem"),
  },
  (t) => [
    unique("uq_milestone_protocol_dominio_nivel").on(
      t.protocolId,
      t.dominioId,
      t.nivel,
    ),
    index("idx_milestone_protocol_dominio").on(t.protocolId, t.dominioId),
  ],
);

export const goal = pgTable(
  "goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    descricao: text("descricao").notNull(), // linguagem simples (família também vê)
    estado: goalEstado("estado").notNull().default("rascunho"),
    criterioDominio: jsonb("criterio_dominio").notNull(), // {"tipo":"...","valor":3}
    cicloRevisaoSemanas: integer("ciclo_revisao_semanas").notNull().default(10),
    proximaRevisaoEm: date("proxima_revisao_em"),
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_goal_patient_estado").on(t.patientId, t.estado)],
);

export const goalMilestoneMapping = pgTable(
  "goal_milestone_mapping",
  {
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goal.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.milestoneId] })],
);

export const goalCandidacy = pgTable("goal_candidacy", {
  goalId: uuid("goal_id")
    .primaryKey()
    .references(() => goal.id, { onDelete: "cascade" }),
  isCandidateDominada: boolean("is_candidate_dominada")
    .notNull()
    .default(false),
  since: timestamp("since", { withTimezone: true }),
});

export const milestoneCandidacy = pgTable(
  "milestone_candidacy",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "cascade" }),
    isCandidate: boolean("is_candidate").notNull().default(false),
    candidacySince: timestamp("candidacy_since", { withTimezone: true }),
    evidenceCount: integer("evidence_count").notNull().default(0),
    distinctSessions: integer("distinct_sessions").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.patientId, t.milestoneId] })],
);
```

- [ ] **Step 5: Garantir o import de `unique`** no topo de `schema.ts`

O bloco de imports de `drizzle-orm/pg-core` deve incluir `unique`. Se não estiver, adicione-o à lista:

```ts
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 6: Gerar a migração**

Run: `pnpm db:generate`
Expected: cria `db/migrations/0005_<nome-auto>.sql` com os `CREATE TABLE`/`CREATE TYPE`/`ALTER TABLE clinic ADD COLUMN is_demo` e atualiza `db/migrations/meta/`. Sem erro.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (0 erros). Corrija qualquer import/nome divergente antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts db/migrations/0005_* db/migrations/meta
git commit -m "feat(db): tabelas de metas e diário da Fase 2 (schema + migração gerada)"
```

---

## Task 2: RLS manual das tabelas novas (`0006_fase2_rls.sql`)

**Files:**

- Create: `db/migrations/0006_fase2_rls.sql`

**Interfaces:**

- Consumes: helpers `SECURITY DEFINER` da 0001 (`app_patient_in_clinic`, `app_is_on_team`, `app_user_in_clinic`, `app_protocol_in_clinic`); role `app_role`; GUCs `app.clinic_id`/`app.user_id`/`app.user_role`.
- Produces: helpers novos `app_session_clinica_visivel(uuid)`, `app_session_terapeuta_id(uuid)`; RLS habilitada + policies + GRANT nas 9 tabelas.

> Sem TDD de teste-unitário aqui — esta task entrega o SQL; a Task 3+ prova via integração. Mas ela termina rodando `pnpm db:migrate` num Postgres local e conferindo que aplica limpo.

- [ ] **Step 1: Escrever o arquivo `db/migrations/0006_fase2_rls.sql`**

```sql
-- RLS da Fase 2 (metas + diário). Espelha 0004_session_rls.sql.
-- Tabelas-filhas de `session` (nota, escopo, áudio, extração) computam
-- visibilidade CLÍNICA via helpers SECURITY DEFINER novos, evitando recursão de
-- RLS e excluindo admin_recepcao de dado clínico (guardrail #1).
-- O GRANT ... ON ALL TABLES da 0001 é point-in-time — GRANT explícito por tabela.

-- Helper: sessão clinicamente visível para o usuário atual (coordenador vê a
-- clínica toda; terapeuta vê própria sessão ou paciente da sua equipe).
-- Recepção NUNCA vê (dado clínico).
CREATE OR REPLACE FUNCTION app_session_clinica_visivel(p_session uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM session s
    WHERE s.id = p_session
      AND s.clinic_id = current_setting('app.clinic_id')::uuid
      AND (
        current_setting('app.user_role') = 'coordenador'
        OR s.terapeuta_id = current_setting('app.user_id')::uuid
        OR app_is_on_team(s.patient_id)
      )
  );
$$;
--> statement-breakpoint

-- Helper: terapeuta dono da sessão (para WITH CHECK de escrita da própria nota).
CREATE OR REPLACE FUNCTION app_session_terapeuta_id(p_session uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.terapeuta_id FROM session s
  WHERE s.id = p_session
    AND s.clinic_id = current_setting('app.clinic_id')::uuid;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_session_clinica_visivel(uuid) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_session_terapeuta_id(uuid) TO app_role;
--> statement-breakpoint

-- ============================ session_note ============================
GRANT SELECT, INSERT, UPDATE, DELETE ON session_note TO app_role;
--> statement-breakpoint
ALTER TABLE session_note ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session_note FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY session_note_select ON session_note FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
-- Terapeuta escreve só nota da própria sessão.
CREATE POLICY session_note_insert ON session_note FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND autor_id = current_setting('app.user_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY session_note_update ON session_note FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  );
--> statement-breakpoint

-- ==================== session_protocol_scope ====================
GRANT SELECT, INSERT, UPDATE, DELETE ON session_protocol_scope TO app_role;
--> statement-breakpoint
ALTER TABLE session_protocol_scope ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session_protocol_scope FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sps_select ON session_protocol_scope FOR SELECT TO app_role USING (
  app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
CREATE POLICY sps_insert ON session_protocol_scope FOR INSERT TO app_role WITH CHECK (
  app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  AND app_protocol_in_clinic(protocol_id)
);
--> statement-breakpoint
CREATE POLICY sps_update ON session_protocol_scope FOR UPDATE TO app_role
  USING (app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid)
  WITH CHECK (
    app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
    AND app_protocol_in_clinic(protocol_id)
  );
--> statement-breakpoint
CREATE POLICY sps_delete ON session_protocol_scope FOR DELETE TO app_role USING (
  app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint

-- ============================ audio_capture ============================
GRANT SELECT, INSERT, UPDATE, DELETE ON audio_capture TO app_role;
--> statement-breakpoint
ALTER TABLE audio_capture ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audio_capture FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audio_select ON audio_capture FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
CREATE POLICY audio_insert ON audio_capture FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY audio_update ON audio_capture FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  );
--> statement-breakpoint

-- ============================ extraction ============================
GRANT SELECT, INSERT, UPDATE, DELETE ON extraction TO app_role;
--> statement-breakpoint
ALTER TABLE extraction ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE extraction FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY extraction_select ON extraction FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
-- Escrita por qualquer papel clínico da clínica (o provider roda no contexto do
-- terapeuta que consolida; recepção não consolida). Fecha via terapeuta da sessão.
CREATE POLICY extraction_insert ON extraction FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY extraction_update ON extraction FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_clinica_visivel(session_id)
  )
  WITH CHECK (clinic_id = current_setting('app.clinic_id')::uuid);
--> statement-breakpoint
CREATE POLICY extraction_delete ON extraction FOR DELETE TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint

-- ============================ goal ============================
GRANT SELECT, INSERT, UPDATE, DELETE ON goal TO app_role;
--> statement-breakpoint
ALTER TABLE goal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE goal FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Leitura: papéis clínicos da clínica (coordenador toda a clínica; terapeuta
-- paciente da sua equipe). Recepção não vê meta (dado clínico).
CREATE POLICY goal_select ON goal FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND (
    current_setting('app.user_role') = 'coordenador'
    OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint
CREATE POLICY goal_insert ON goal FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('coordenador', 'terapeuta')
  AND app_patient_in_clinic(patient_id)
  AND criado_por = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY goal_update ON goal FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_patient_in_clinic(patient_id)
  );
--> statement-breakpoint

-- ==================== goal_milestone_mapping ====================
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_milestone_mapping TO app_role;
--> statement-breakpoint
ALTER TABLE goal_milestone_mapping ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE goal_milestone_mapping FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Helper de visibilidade de goal via SECURITY DEFINER seria ideal, mas o mapping
-- referencia goal diretamente; usamos EXISTS sobre goal (mesma role, RLS de goal
-- aplica e restringe consistentemente).
CREATE POLICY gmm_select ON goal_milestone_mapping FOR SELECT TO app_role USING (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
);
--> statement-breakpoint
CREATE POLICY gmm_insert ON goal_milestone_mapping FOR INSERT TO app_role WITH CHECK (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
);
--> statement-breakpoint
CREATE POLICY gmm_delete ON goal_milestone_mapping FOR DELETE TO app_role USING (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
);
--> statement-breakpoint

-- ============================ milestone ============================
-- Catálogo: leitura por qualquer papel da clínica dona do protocolo; escrita
-- pelo seed/coordenador (INSERT restrito ao protocolo da clínica ativa).
GRANT SELECT, INSERT, UPDATE, DELETE ON milestone TO app_role;
--> statement-breakpoint
ALTER TABLE milestone ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE milestone FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY milestone_select ON milestone FOR SELECT TO app_role USING (
  app_protocol_in_clinic(protocol_id)
);
--> statement-breakpoint
CREATE POLICY milestone_insert ON milestone FOR INSERT TO app_role WITH CHECK (
  current_setting('app.user_role') = 'coordenador'
  AND app_protocol_in_clinic(protocol_id)
);
--> statement-breakpoint
CREATE POLICY milestone_update ON milestone FOR UPDATE TO app_role
  USING (current_setting('app.user_role') = 'coordenador' AND app_protocol_in_clinic(protocol_id))
  WITH CHECK (app_protocol_in_clinic(protocol_id));
--> statement-breakpoint

-- ============================ goal_candidacy (dormente) ============================
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_candidacy TO app_role;
--> statement-breakpoint
ALTER TABLE goal_candidacy ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE goal_candidacy FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY goal_candidacy_select ON goal_candidacy FOR SELECT TO app_role USING (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
);
--> statement-breakpoint
CREATE POLICY goal_candidacy_write ON goal_candidacy FOR ALL TO app_role
  USING (EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id))
  WITH CHECK (EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id));
--> statement-breakpoint

-- ==================== milestone_candidacy (dormente) ====================
GRANT SELECT, INSERT, UPDATE, DELETE ON milestone_candidacy TO app_role;
--> statement-breakpoint
ALTER TABLE milestone_candidacy ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE milestone_candidacy FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY milestone_candidacy_select ON milestone_candidacy FOR SELECT TO app_role USING (
  app_patient_in_clinic(patient_id)
);
--> statement-breakpoint
CREATE POLICY milestone_candidacy_write ON milestone_candidacy FOR ALL TO app_role
  USING (app_patient_in_clinic(patient_id))
  WITH CHECK (app_patient_in_clinic(patient_id) AND app_milestone_in_clinic(milestone_id));
--> statement-breakpoint

-- Helper auxiliar para o WITH CHECK acima (marco pertence a protocolo da clínica).
CREATE OR REPLACE FUNCTION app_milestone_in_clinic(p_milestone uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM milestone m
    WHERE m.id = p_milestone AND app_protocol_in_clinic(m.protocol_id)
  );
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_milestone_in_clinic(uuid) TO app_role;
```

> ⚠️ **Ordem:** o `app_milestone_in_clinic` é usado pela policy `milestone_candidacy_write` mas definido depois. Em SQL, a checagem do corpo da policy só corre em runtime, então a definição posterior no mesmo script serve — **mas** para evitar surpresa, mova o bloco `CREATE FUNCTION app_milestone_in_clinic` + seu `GRANT` para ANTES da seção `milestone_candidacy` ao escrever o arquivo. (Passo 1b abaixo.)

- [ ] **Step 1b: Reordenar `app_milestone_in_clinic` para antes de seu uso**

Recorte o bloco `CREATE OR REPLACE FUNCTION app_milestone_in_clinic ...` + `GRANT EXECUTE ... app_milestone_in_clinic` e cole-o logo após o `GRANT EXECUTE ... app_session_terapeuta_id` (junto dos outros helpers, no topo).

- [ ] **Step 2: Aplicar as migrações num Postgres local**

Run: `pnpm db:migrate`
Expected: aplica `0005_*` e `0006_fase2_rls.sql` sem erro. Se faltar `DATABASE_URL`/config do drizzle, use o mesmo `.env` local dos outros migrates.

- [ ] **Step 3: Conferir que RLS está ativa**

Run:

```bash
psql "$MIGRATION_DATABASE_URL" -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('session_note','goal','milestone','extraction','audio_capture','session_protocol_scope','goal_milestone_mapping','goal_candidacy','milestone_candidacy') ORDER BY relname;"
```

Expected: todas com `relrowsecurity = t` e `relforcerowsecurity = t`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0006_fase2_rls.sql
git commit -m "feat(db): RLS das tabelas de metas e diário (Fase 2)"
```

---

## Task 3: Harness de teste RLS + isolamento de `session_note`

**Files:**

- Create: `db/tests/fase2-rls.int.test.ts`

**Interfaces:**

- Consumes: `withTenant` (`@/db/rls`), `sql`/`db` (`@/db/client`), tabelas de `@/db/schema`; env `DATABASE_URL` + `MIGRATION_DATABASE_URL`.
- Produces: constantes de seed (`CLINIC_A`, `CLINIC_B`, `U_COORD_A`, `U_T1_A`, `U_T2_A`, `U_RECEP_A`, `PAC_A1`, `SESS_A1`, `PROTO_A`, ...) e ctx literais reusados pelas tasks 4-8.

> Este teste segue o harness de `src/app/(app)/agenda/actions.int.test.ts`: conexão owner via `MIGRATION_DATABASE_URL` para seed/TRUNCATE, `withTenant(ctx, tx => ...)` para exercitar as policies como `app_role`, auto-skip sem banco.

- [ ] **Step 1: Escrever o arquivo com seed + primeiro caso (session_note) — teste que deve FALHAR se a RLS estiver errada**

```ts
import { sql as pgTagged } from "@/db/client"; // não; ver import real abaixo
```

Conteúdo completo:

```ts
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hasDb =
  !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

// IDs fixos do seed
const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0a1";
const U_T1_A = "00000000-0000-0000-0000-0000000071a1";
const U_T2_A = "00000000-0000-0000-0000-0000000072a1";
const U_RECEP_A = "00000000-0000-0000-0000-0000000052a1";
const U_T1_B = "00000000-0000-0000-0000-0000000071b1";
const PAC_A1 = "00000000-0000-0000-0000-0000000ac1a1";
const PROTO_A = "00000000-0000-0000-0000-00000070c0a1";
const SESS_A1 = "00000000-0000-0000-0000-00000005e1a1"; // terapeuta = T1
const MILE_A = "00000000-0000-0000-0000-000000m1cea1".replace(/m/g, "d"); // sanitize

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxT1A = {
  clinicId: CLINIC_A,
  userId: U_T1_A,
  role: "terapeuta",
} as const;
const ctxT2A = {
  clinicId: CLINIC_A,
  userId: U_T2_A,
  role: "terapeuta",
} as const;
const ctxRecepA = {
  clinicId: CLINIC_A,
  userId: U_RECEP_A,
  role: "admin_recepcao",
} as const;
const ctxT1B = {
  clinicId: CLINIC_B,
  userId: U_T1_B,
  role: "terapeuta",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("Fase 2 · RLS das tabelas de metas e diário", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, protocol, session,
      session_note, session_protocol_scope, audio_capture, extraction,
      goal, goal_milestone_mapping, milestone, goal_candidacy, milestone_candidacy
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A', false), (${CLINIC_B}, 'Clínica B', false)`;
    await owner`INSERT INTO app_user (id, email, nome) VALUES
      (${U_COORD_A}, 'coord.a@t.com', 'Coord A'),
      (${U_T1_A}, 't1.a@t.com', 'Terapeuta 1 A'),
      (${U_T2_A}, 't2.a@t.com', 'Terapeuta 2 A'),
      (${U_RECEP_A}, 'recep.a@t.com', 'Recepção A'),
      (${U_T1_B}, 't1.b@t.com', 'Terapeuta 1 B')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_RECEP_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO_A}, ${CLINIC_A}, 'VB-MAPP demo', 'ABA', 'aba_marcos_desenvolvimento')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado) VALUES
      (${SESS_A1}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'presente')`;
    // T1 está na equipe do paciente A1 (para app_is_on_team) — via care_team_membership.
    await owner`INSERT INTO care_team_membership (clinic_id, patient_id, user_id, papel)
      VALUES (${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, 'terapeuta')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  // ---------- session_note ----------
  test("terapeuta dono escreve e lê a própria nota da sessão", async () => {
    const [nota] = await withTenant(ctxT1A, (tx) =>
      tx
        .insert(schema.sessionNote)
        .values({
          sessionId: SESS_A1,
          clinicId: CLINIC_A,
          tipo: "captura_rapida",
          texto: "Pediu água e apontou",
          autorId: U_T1_A,
        })
        .returning({ id: schema.sessionNote.id }),
    );
    expect(nota?.id).toBeTruthy();

    const lidas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.sessionNote),
    );
    expect(lidas.length).toBe(1);
  });

  test("recepção NÃO lê nota clínica (guardrail #1)", async () => {
    const lidas = await withTenant(ctxRecepA, (tx) =>
      tx.select().from(schema.sessionNote),
    );
    expect(lidas.length).toBe(0);
  });

  test("terapeuta de outra clínica não vê a nota (cross-tenant)", async () => {
    const lidas = await withTenant(ctxT1B, (tx) =>
      tx.select().from(schema.sessionNote),
    );
    expect(lidas.length).toBe(0);
  });

  test("terapeuta que não é dono da sessão não escreve a nota", async () => {
    await expect(
      withTenant(ctxT2A, (tx) =>
        tx.insert(schema.sessionNote).values({
          sessionId: SESS_A1,
          clinicId: CLINIC_A,
          tipo: "nota_consolidada",
          texto: "tentativa indevida",
          autorId: U_T2_A,
        }),
      ),
    ).rejects.toThrow();
  });
});
```

> **Nota sobre `MILE_A`:** substitua a linha do `MILE_A` por um UUID válido fixo, ex.:
> `const MILE_A = "00000000-0000-0000-0000-00000000d1a1";` (o `.replace` foi só ilustrativo; use literal válido).

- [ ] **Step 2: Corrigir a constante `MILE_A`** para o literal `"00000000-0000-0000-0000-00000000d1a1"` (remover o `.replace`).

- [ ] **Step 3: Rodar o teste**

Run: `pnpm test:rls -- db/tests/fase2-rls.int.test.ts`
Expected: PASS nos 4 casos de `session_note` (ou auto-skip se sem banco — nesse caso, provisione o Postgres de teste conforme `.env`).

- [ ] **Step 4: Commit**

```bash
git add db/tests/fase2-rls.int.test.ts
git commit -m "test(db): isolamento RLS de session_note (Fase 2)"
```

---

## Task 4: Isolamento RLS de `goal` + `goal_milestone_mapping`

**Files:**

- Modify: `db/tests/fase2-rls.int.test.ts` (adicionar bloco de testes de goal ao `describe`)

**Interfaces:**

- Consumes: seed e ctx da Task 3; `MILE_A`, `PROTO_A`.

- [ ] **Step 1: Semear 1 milestone no `beforeAll`** (adicionar ao final do `beforeAll`, após o protocolo)

```ts
await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${MILE_A}, ${PROTO_A}, 'mando', 'Pedir item preferido', 'marco_simples', ${owner.json({ escala: [] })})`;
```

- [ ] **Step 2: Adicionar os casos de goal**

```ts
// ---------- goal ----------
test("coordenador cria meta; terapeuta da equipe lê", async () => {
  const [g] = await withTenant(ctxCoordA, (tx) =>
    tx
      .insert(schema.goal)
      .values({
        patientId: PAC_A1,
        clinicId: CLINIC_A,
        descricao: "Pedir água sozinho",
        criterioDominio: {
          tipo: "sessoes_consecutivas_independente",
          valor: 3,
        },
        criadoPor: U_COORD_A,
      })
      .returning({ id: schema.goal.id }),
  );
  expect(g?.id).toBeTruthy();

  const lidasT1 = await withTenant(ctxT1A, (tx) =>
    tx.select().from(schema.goal),
  );
  expect(lidasT1.length).toBe(1);
});

test("recepção não vê meta (dado clínico)", async () => {
  const lidas = await withTenant(ctxRecepA, (tx) =>
    tx.select().from(schema.goal),
  );
  expect(lidas.length).toBe(0);
});

test("terapeuta de outra clínica não vê meta (cross-tenant)", async () => {
  const lidas = await withTenant(ctxT1B, (tx) => tx.select().from(schema.goal));
  expect(lidas.length).toBe(0);
});

test("insert de meta com criado_por falsificado é barrado pelo WITH CHECK", async () => {
  await expect(
    withTenant(ctxT1A, (tx) =>
      tx.insert(schema.goal).values({
        patientId: PAC_A1,
        clinicId: CLINIC_A,
        descricao: "meta forjada",
        criterioDominio: { tipo: "x", valor: 1 },
        criadoPor: U_COORD_A, // != app.user_id
      }),
    ),
  ).rejects.toThrow();
});

test("mapear meta a marco e ler o mapeamento", async () => {
  const [g] = await withTenant(ctxCoordA, (tx) =>
    tx.select({ id: schema.goal.id }).from(schema.goal).limit(1),
  );
  await withTenant(ctxCoordA, (tx) =>
    tx
      .insert(schema.goalMilestoneMapping)
      .values({ goalId: g!.id, milestoneId: MILE_A }),
  );
  const maps = await withTenant(ctxT1A, (tx) =>
    tx.select().from(schema.goalMilestoneMapping),
  );
  expect(maps.length).toBe(1);
});
```

- [ ] **Step 3: Rodar**

Run: `pnpm test:rls -- db/tests/fase2-rls.int.test.ts`
Expected: PASS (session_note + goal).

- [ ] **Step 4: Commit**

```bash
git add db/tests/fase2-rls.int.test.ts
git commit -m "test(db): isolamento RLS de goal e goal_milestone_mapping (Fase 2)"
```

---

## Task 5: Isolamento RLS de `session_protocol_scope`, `audio_capture` e `extraction`

**Files:**

- Modify: `db/tests/fase2-rls.int.test.ts`

**Interfaces:**

- Consumes: seed/ctx das tasks anteriores; `SESS_A1`, `PROTO_A`.

- [ ] **Step 1: Adicionar os casos**

```ts
// ---------- session_protocol_scope ----------
test("terapeuta dono grava e lê escopo de protocolo da sessão", async () => {
  await withTenant(ctxT1A, (tx) =>
    tx.insert(schema.sessionProtocolScope).values({
      sessionId: SESS_A1,
      protocolId: PROTO_A,
      origem: "inferido_disciplina",
    }),
  );
  const lidas = await withTenant(ctxT1A, (tx) =>
    tx.select().from(schema.sessionProtocolScope),
  );
  expect(lidas.length).toBe(1);
});

test("recepção não vê escopo de protocolo (dado clínico)", async () => {
  const lidas = await withTenant(ctxRecepA, (tx) =>
    tx.select().from(schema.sessionProtocolScope),
  );
  expect(lidas.length).toBe(0);
});

// ---------- audio_capture ----------
test("terapeuta dono grava rascunho local de áudio e lê", async () => {
  await withTenant(ctxT1A, (tx) =>
    tx.insert(schema.audioCapture).values({
      sessionId: SESS_A1,
      clinicId: CLINIC_A,
      statusUpload: "rascunho_local",
    }),
  );
  const lidas = await withTenant(ctxT1A, (tx) =>
    tx.select().from(schema.audioCapture),
  );
  expect(lidas.length).toBe(1);
});

test("terapeuta de outra clínica não vê áudio (cross-tenant)", async () => {
  const lidas = await withTenant(ctxT1B, (tx) =>
    tx.select().from(schema.audioCapture),
  );
  expect(lidas.length).toBe(0);
});

// ---------- extraction ----------
test("extração gravada no contexto do terapeuta da sessão é lida por ele", async () => {
  await withTenant(ctxT1A, (tx) =>
    tx.insert(schema.extraction).values({
      sessionId: SESS_A1,
      clinicId: CLINIC_A,
      estado: "sugerida",
      subtipo: "evidencia",
      trechoFonte: "falou á sozinho",
      confianca: "alta",
      payload: { alvos: [] },
    }),
  );
  const lidas = await withTenant(ctxT1A, (tx) =>
    tx.select().from(schema.extraction),
  );
  expect(lidas.length).toBe(1);
});

test("recepção não vê extração (dado clínico)", async () => {
  const lidas = await withTenant(ctxRecepA, (tx) =>
    tx.select().from(schema.extraction),
  );
  expect(lidas.length).toBe(0);
});
```

- [ ] **Step 2: Rodar**

Run: `pnpm test:rls -- db/tests/fase2-rls.int.test.ts`
Expected: PASS (todos os blocos acumulados).

- [ ] **Step 3: Commit**

```bash
git add db/tests/fase2-rls.int.test.ts
git commit -m "test(db): isolamento RLS de escopo, áudio e extração (Fase 2)"
```

---

## Task 6: Isolamento RLS de `milestone` (catálogo) e tabelas de candidatura dormentes

**Files:**

- Modify: `db/tests/fase2-rls.int.test.ts`

- [ ] **Step 1: Adicionar os casos**

```ts
// ---------- milestone (catálogo) ----------
test("qualquer papel da clínica lê o catálogo de marcos do protocolo", async () => {
  const lidasT1 = await withTenant(ctxT1A, (tx) =>
    tx.select().from(schema.milestone),
  );
  expect(lidasT1.length).toBeGreaterThanOrEqual(1);
});

test("terapeuta não insere marco no catálogo (só coordenador)", async () => {
  await expect(
    withTenant(ctxT1A, (tx) =>
      tx.insert(schema.milestone).values({
        protocolId: PROTO_A,
        dominioId: "tato",
        nome: "nomear objeto",
        tipoEstrutura: "marco_simples",
        estrutura: { escala: [] },
      }),
    ),
  ).rejects.toThrow();
});

test("marco de protocolo de outra clínica não é visível (cross-tenant)", async () => {
  const lidasB = await withTenant(ctxT1B, (tx) =>
    tx.select().from(schema.milestone),
  );
  expect(lidasB.length).toBe(0);
});

// ---------- candidatura dormente ----------
test("tabelas de candidatura existem e respeitam escopo (dormentes)", async () => {
  const [g] = await withTenant(ctxCoordA, (tx) =>
    tx.select({ id: schema.goal.id }).from(schema.goal).limit(1),
  );
  await withTenant(ctxCoordA, (tx) =>
    tx
      .insert(schema.goalCandidacy)
      .values({ goalId: g!.id, isCandidateDominada: false }),
  );
  const lidas = await withTenant(ctxT1A, (tx) =>
    tx.select().from(schema.goalCandidacy),
  );
  expect(lidas.length).toBe(1);
});
```

- [ ] **Step 2: Rodar a suíte RLS inteira**

Run: `pnpm test:rls -- db/tests/fase2-rls.int.test.ts`
Expected: PASS em todos os casos.

- [ ] **Step 3: Rodar a suíte de integração completa (não regressão da 1d)**

Run: `pnpm test:rls`
Expected: PASS — os testes da agenda (1d) continuam verdes.

- [ ] **Step 4: Commit**

```bash
git add db/tests/fase2-rls.int.test.ts
git commit -m "test(db): RLS de catálogo de marcos e candidatura dormente (Fase 2)"
```

---

## Task 7: Verificação final da fundação

**Files:** nenhum novo — gate de qualidade.

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS (0 erros).

- [ ] **Step 3: Suíte unit (não regressão)**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Suíte de integração RLS completa**

Run: `pnpm test:rls`
Expected: PASS.

- [ ] **Step 5: Commit de fechamento (se algo foi ajustado)**

```bash
git add -A
git commit -m "chore(fase-2): fecha fundação de dados — typecheck/lint/testes verdes"
```

---

## Self-Review (feito na escrita deste plano)

**Cobertura do spec (§3 do design):**

- session_note, session_protocol_scope, audio_capture, extraction, goal, goal_milestone_mapping, milestone, goal_candidacy, milestone_candidacy, `clinic.is_demo` → todas na Task 1; RLS na Task 2; testes nas Tasks 3-6. ✅
- `session_snapshot` adiado (F4) → corretamente ausente. ✅
- Reconciliação `terapeuta_id` (não `profissional_id`) → helpers usam `s.terapeuta_id`. ✅
- `numero_sequencial_paciente` (populado na consolidação) → é lógica de Server Action, fica no **Plano 2** (Diário/consolidação), não nesta fundação. ✅ (marcado como fora deste plano)
- `extraction` sem `REVOKE UPDATE/DELETE` → confirmado (policies de UPDATE/DELETE presentes; imutabilidade é de `evidence`, F3). ✅
- Guardrail #1 (recepção sem dado clínico) → testado em session_note, goal, scope, extraction. ✅

**Placeholders:** nenhum "TBD/TODO"; a única marca de atenção é a reordenação do helper `app_milestone_in_clinic` (Step 1b) e a correção da constante `MILE_A` (Task 3 Step 2) — ambas com instrução concreta. ✅

**Consistência de tipos/nomes:** exports Drizzle em camelCase (`sessionNote`, `goalMilestoneMapping`), colunas snake_case; ctx literais reusados; helpers SQL nomeados de forma única. ✅

## Fora deste plano (próximos planos da Fase 2)

- **Plano 2** — Diário (captura texto/áudio local, consolidação → `numero_sequencial_paciente`), Fila de pendências, costura `ExtractionProvider` (DemoStub/Null), roteamento por `is_demo`. Telas + a11y + E2E demo.
- **Plano 3** — Metas: Server Actions de CRUD, form de critério N/M, ciclo de revisão, transição `dominada` (coordenador), telas + a11y.
- **Plano 4** — Seed de demonstração alta-fidelidade das 4 famílias + montagem da clínica demo (`is_demo=true`).
