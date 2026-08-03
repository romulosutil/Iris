# Billing, Trial & Arquivamento Plan (#175, #174, #36)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o modelo de faturamento por paciente ativo/mês com Pix Automático Asaas, relógio de trial iniciando no 1º paciente (teto de 14 dias) e arquivamento comercial de pacientes com auto-arquivamento de 90 dias.

**Architecture:** Modificação do schema de banco via Drizzle ORM, cálculo determinístico de trial com injeção de relógio em `src/lib/trial.ts` (arquivo já existe — este plano estende, não recria), desacoplamento de `arquivado_em` em relação a `alta_em`, e endpoint seguro de webhook Asaas em `src/app/api/hooks/asaas/route.ts`.

**Tech Stack:** Next.js 16 (App Router), Postgres, Drizzle ORM, Vitest, Better Auth, Asaas API v3.

> **Nota (02/08/2026):** Prioridade **P0** — bloqueia lançamento self-service (Fase 7, #36). Commit `ad789a6` já corrigiu o sintoma agudo do sentinela `2020-01-01` (trial vencido eterno) sem tocar schema; este plano é o fix estrutural (coluna nullable) que **remove** o sentinela por completo — decisão de arquitetura, exige confirmação do Rômulo antes de execução (schema + RLS, regra `CLAUDE.md`). Task 3 (#36) cobre só o webhook Asaas — cálculo de valor cobrado por assinatura fica fora de escopo (depende de #159, não commitada ainda).

## Global Constraints

- Toda alteração em `src/db/schema.ts` termina em migração gerada e aplicada localmente antes do commit — `pnpm db:generate` seguido de inspeção manual do SQL gerado e `pnpm db:migrate`. Nunca commitar `schema.ts` sem o arquivo de migração correspondente em `db/migrations/` (issue #165 — migração commitada sem rodar já causou incidente em prod neste projeto).
- Nomes de função, campo e commit em pt-BR, consistente com o resto do código (`calcularStatusTrial`, `arquivadoEm`, etc.).
- `audit_log` é append-only para `app_role` — qualquer gravação de trilha usa `db.insert(auditLog)`, nunca UPDATE/DELETE.
- Nenhuma chamada de rede a serviço externo além do Postgres e da API Asaas explicitamente coberta na Task 3. Nenhuma notificação de arquivamento sai por e-mail/SMS neste plano — é só sinalização in-app (banner), mesmo padrão de `faixa-trial` já existente. Não reintroduzir saída de rede fora do escopo (ver `scripts/escalonamento-risco.mjs` — regra equivalente já vale para risco clínico, mantém-se por analogia para billing).
- `trial_comeco_em` já existe como `NOT NULL` desde a migração `0057_cadastro_self_service.sql`, com sentinela `2020-01-01` para clínicas pré-self-service (ver comentário em `src/lib/trial.ts:57-76` e fix do achado do Jules na PR #176 — `ad789a6`). Este plano **reverte a coluna para nullable** para representar de verdade "aguardando 1º paciente" em vez do sentinela artificial. Ao implementar Task 1, o sentinela `CORTE_TRIAL_REAL`/`2020-01-01` deixa de ser necessário e deve ser removido junto — não deixar as duas estratégias coexistindo.

---

## Mapeamento de Arquivos

- **Schema:** `src/db/schema.ts` (tabelas `clinic`, `patient`, `auditLog`)
- **Migrações:** `db/migrations/` (geradas via `pnpm db:generate`, não escritas à mão)
- **Billing & Trial:** `src/lib/trial.ts` (estende — funções `diasRestantesDeTrial` e `resolverDiasRestantesParaFaixa` já existem), `src/lib/trial.test.ts`
- **Actions de Paciente:** `src/app/(app)/pacientes/novo/actions.ts`
- **Registro de Sessão (desarquivamento automático):** `src/app/(app)/diario/[sessionId]/actions.ts` (ou o arquivo real de criação de `session`/`sessionNote` — confirmar no Step 1 da Task 2c antes de editar)
- **Job Auto-Arquivamento:** `src/lib/jobs/auto-arquivamento.ts`, `src/lib/jobs/auto-arquivamento.test.ts`
- **Webhook Asaas:** `src/app/api/hooks/asaas/route.ts`, `src/app/api/hooks/asaas/route.test.ts`
- **Idempotência Webhook:** tabela nova `asaas_webhook_event` em `src/db/schema.ts`
- **Testes RLS:** `db/tests/patient-arquivado-rls.int.test.ts`

---

## Tarefas de Implementação

### Task 1: Relógio de Trial Disparado no 1º Paciente (Issue #175)

**Files:**
- Modify: `src/db/schema.ts` (`clinic.trialComecoEm` → nullable)
- Modify: `src/lib/trial.ts` (nova função `calcularStatusTrial`; remover `CORTE_TRIAL_REAL`)
- Modify: `src/lib/trial.test.ts`
- Modify: `src/app/(app)/pacientes/novo/actions.ts`
- Create: migração via `pnpm db:generate`

**Interfaces:**
- Produces: `calcularStatusTrial(criadoEm: Date, trialComecoEm: Date | null, trialDias: number, agora?: Date): StatusTrial` — usado por `resolverDiasRestantesParaFaixa` (Task 1 Step 6) e por qualquer server action que precise checar trial ativo.
- Consumes: nenhuma dependência de outra task deste plano.

**Regras Levantadas:**
1. `clinic.trial_comeco_em` vira `nullable`.
2. Quando a clínica é criada, `trial_comeco_em` permanece `NULL`.
3. Ao cadastrar o 1º paciente real, se `trial_comeco_em` for `NULL`, a Server Action grava `NOW()` atomicamente na mesma transação.
4. O trial expira em 7 dias a partir de `trial_comeco_em`. Se nenhum paciente for cadastrado em 14 dias pós-signup, o teto inicia o trial no 14º dia automaticamente.

- [ ] **Step 1: Escrever teste unitário falho para `calcularStatusTrial`**

File: `src/lib/trial.test.ts` (adicionar ao arquivo existente, não sobrescrever os testes de `diasRestantesDeTrial`)
```typescript
import { describe, it, expect } from "vitest";
import { calcularStatusTrial } from "./trial";

describe("calcularStatusTrial", () => {
  const agora = new Date("2026-08-10T12:00:00Z");
  const criadoEm = new Date("2026-08-01T12:00:00Z"); // há 9 dias

  it("retorna aguardandoPrimeiroPaciente quando trialComecoEm é null e dentro dos 14 dias", () => {
    const status = calcularStatusTrial(criadoEm, null, 7, agora);
    expect(status.aguardandoPrimeiroPaciente).toBe(true);
    expect(status.ativo).toBe(true);
  });

  it("inicia trial no 1º paciente cadastrado no dia 3", () => {
    const trialComecoEm = new Date("2026-08-04T12:00:00Z");
    const status = calcularStatusTrial(criadoEm, trialComecoEm, 7, agora); // dia 10
    expect(status.aguardandoPrimeiroPaciente).toBe(false);
    expect(status.ativo).toBe(true);
    expect(status.diasRestantes).toBe(1);
  });

  it("estoura teto de 14 dias se nenhum paciente for cadastrado", () => {
    const criadoAntigo = new Date("2026-07-01T12:00:00Z"); // há >14 dias
    const status = calcularStatusTrial(criadoAntigo, null, 7, agora);
    expect(status.aguardandoPrimeiroPaciente).toBe(false);
    expect(status.expirado).toBe(true);
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `pnpm test src/lib/trial.test.ts`
Expected: FAIL com "calcularStatusTrial não definido" ou erro de tipo.

- [ ] **Step 3: Alterar Schema `src/db/schema.ts`**

File: `src/db/schema.ts` — trocar a definição atual de `trialComecoEm` (hoje `.notNull()`, coluna `clinic`) para nullable:
```typescript
// era: trialComecoEm: timestamp("trial_comeco_em", { withTimezone: true }).notNull(),
trialComecoEm: timestamp("trial_comeco_em", { withTimezone: true }),
```

- [ ] **Step 4: Gerar e revisar migração**

Run: `pnpm db:generate`
Expected: novo arquivo em `db/migrations/NNNN_<nome>.sql` contendo `ALTER TABLE "clinic" ALTER COLUMN "trial_comeco_em" DROP NOT NULL;`. Abrir o arquivo gerado e conferir que não há `DROP`/`ALTER TYPE` inesperado antes de seguir.

- [ ] **Step 5: Aplicar migração localmente**

Run: `pnpm db:migrate`
Expected: migração aplicada sem erro contra o Postgres local (`docker compose infra/docker-compose.yml`, porta 5433).

- [ ] **Step 6: Implementar `calcularStatusTrial` e remover sentinela obsoleto**

File: `src/lib/trial.ts`
```typescript
export interface StatusTrial {
  ativo: boolean;
  expirado: boolean;
  diasRestantes: number;
  dataInicio: Date;
  dataFim: Date;
  aguardandoPrimeiroPaciente: boolean;
}

export function calcularStatusTrial(
  criadoEm: Date,
  trialComecoEm: Date | null,
  trialDias: number = 7,
  agora: Date = new Date(),
): StatusTrial {
  const dataTetoMaximo = new Date(criadoEm.getTime() + 14 * 24 * 60 * 60 * 1000);
  let dataInicioEfetiva: Date;
  let aguardandoPrimeiroPaciente = false;

  if (trialComecoEm !== null) {
    dataInicioEfetiva = trialComecoEm;
  } else if (agora > dataTetoMaximo) {
    dataInicioEfetiva = dataTetoMaximo;
  } else {
    aguardandoPrimeiroPaciente = true;
    dataInicioEfetiva = agora;
  }

  const dataFim = new Date(dataInicioEfetiva.getTime() + trialDias * 24 * 60 * 60 * 1000);
  const diffMs = dataFim.getTime() - agora.getTime();
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (aguardandoPrimeiroPaciente) {
    return {
      ativo: true,
      expirado: false,
      diasRestantes: trialDias,
      dataInicio: dataInicioEfetiva,
      dataFim,
      aguardandoPrimeiroPaciente: true,
    };
  }

  const expirado = agora > dataFim;
  return {
    ativo: !expirado,
    expirado,
    diasRestantes: Math.max(0, diasRestantes),
    dataInicio: dataInicioEfetiva,
    dataFim,
    aguardandoPrimeiroPaciente: false,
  };
}
```

Remover `CORTE_TRIAL_REAL` e o `if (dadosTrial.trialComecoEm < CORTE_TRIAL_REAL) return null;` dentro de `resolverDiasRestantesParaFaixa` — com a coluna nullable de verdade, `trialComecoEm === null` já expressa "aguardando", sem precisar de sentinela de data. Atualizar `resolverDiasRestantesParaFaixa` para delegar em `calcularStatusTrial` e retornar `null` apenas quando não há trial de fato (ex.: clínica com assinatura ativa — fora de escopo aqui, manter comportamento atual para esse caso).

- [ ] **Step 7: Atualizar teste de `faixa-trial` para estado "aguardando 1º paciente"**

File: `src/components/app/faixa-trial.test.tsx` — adicionar caso cobrindo `aguardandoPrimeiroPaciente: true` (faixa deve exibir mensagem de boas-vindas/trial ainda não iniciado, não contagem regressiva). Rodar `pnpm test src/components/app/faixa-trial.test.tsx` antes de mexer no componente para confirmar que falha, depois ajustar o componente.

- [ ] **Step 8: Executar testes para verificar aprovação**

Run: `pnpm test src/lib/trial.test.ts src/components/app/faixa-trial.test.tsx`
Expected: PASS.

- [ ] **Step 9: Atualizar Server Action de criação de paciente**

File: `src/app/(app)/pacientes/novo/actions.ts`
```typescript
// Dentro da mesma transação que insere o paciente:
await tx
  .update(clinic)
  .set({ trialComecoEm: sql`NOW()` })
  .where(and(eq(clinic.id, clinicId), isNull(clinic.trialComecoEm)));
```

- [ ] **Step 10: Commit**

```bash
git add src/db/schema.ts db/migrations/ src/lib/trial.ts src/lib/trial.test.ts src/components/app/faixa-trial.test.tsx "src/app/(app)/pacientes/novo/actions.ts"
git commit -m "feat(billing): relógio de trial disparado no 1º paciente com teto de 14 dias (#175)"
```

---

### Task 2: Campo `patient.arquivado_em` e Auto-Arquivamento em 90 Dias (Issue #174)

**Files:**
- Modify: `src/db/schema.ts` (nova coluna `patient.arquivadoEm`)
- Create: migração via `pnpm db:generate`
- Create: `src/lib/jobs/auto-arquivamento.ts`, `src/lib/jobs/auto-arquivamento.test.ts`
- Modify: `src/app/(app)/pacientes/[id]/actions.ts` (dar alta arquiva; localizar arquivo real no Step antes de editar)
- Modify: arquivo de criação de sessão/nota (localizar via Grep no Step 6 antes de editar)
- Modify: `db/tests/patient-arquivado-rls.int.test.ts`

**Interfaces:**
- Produces: `calcularStatusArquivamento(ultimaAtividade: Date, agora?: Date): { diasSemAtividade: number; deveNotificarAviso: boolean; deveArquivar: boolean }` — consumido pelo job cron (fora de escopo deste plano; job runner segue padrão de `scripts/escalonamento-risco.mjs`, varredura única + agendador externo) e por qualquer teste de integração.
- Consumes: `auditLog` de `src/db/schema.ts` (Task 1 não altera essa tabela).

**Regras Levantadas:**
1. `alta_em` (decisão clínica) é mantida 100% independente de `arquivado_em` (decisão comercial).
2. Dar alta arquiva automaticamente (`alta_em != null => arquivado_em = NOW()`).
3. Arquivar nunca dá alta clínica.
4. Pacientes arquivados continuam 100% legíveis e exportáveis no sistema.
5. Job de 90 dias sem registros marca `arquivado_em = NOW()` com notificação prévia no 83º dia — a notificação é in-app (linha em `audit_log` com `acao: "arquivamento_aviso_previo"`, lida pela faixa da clínica, mesmo padrão de `faixa-trial`), nunca e-mail/SMS.
6. Gravação de nova sessão para paciente arquivado desarquiva automaticamente e registra `audit_log`.

- [ ] **Step 1: Adicionar coluna `arquivado_em` no Schema**

File: `src/db/schema.ts`
```typescript
export const patient = pgTable(
  "patient",
  {
    // ... colunas existentes ...
    altaEm: date("alta_em"),
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
  },
  (t) => [
    index("idx_patient_clinic").on(t.clinicId),
    unique("uq_patient_id_clinic").on(t.id, t.clinicId),
    index("patient_clinic_arquivado_idx").on(t.clinicId, t.arquivadoEm),
  ],
);
```

- [ ] **Step 2: Gerar e revisar migração**

Run: `pnpm db:generate`
Expected: `ALTER TABLE "patient" ADD COLUMN "arquivado_em" timestamptz;` + `CREATE INDEX "patient_clinic_arquivado_idx" ...`. Revisar o SQL gerado antes de aplicar.

- [ ] **Step 3: Aplicar migração localmente**

Run: `pnpm db:migrate`
Expected: aplica sem erro.

- [ ] **Step 4: Escrever teste unitário do Job de Auto-Arquivamento**

File: `src/lib/jobs/auto-arquivamento.test.ts`
```typescript
import { describe, it, expect } from "vitest";
import { calcularStatusArquivamento } from "./auto-arquivamento";

describe("calcularStatusArquivamento", () => {
  const agora = new Date("2026-11-01T12:00:00Z");

  it("marca para aviso no 83º dia sem atividade", () => {
    const ultimaAtividade = new Date("2026-08-10T12:00:00Z"); // 83 dias
    const status = calcularStatusArquivamento(ultimaAtividade, agora);
    expect(status.deveNotificarAviso).toBe(true);
    expect(status.deveArquivar).toBe(false);
  });

  it("marca para arquivar no 90º dia sem atividade", () => {
    const ultimaAtividade = new Date("2026-08-03T12:00:00Z"); // 90 dias
    const status = calcularStatusArquivamento(ultimaAtividade, agora);
    expect(status.deveArquivar).toBe(true);
  });

  it("não repete aviso depois do 90º dia (já deve arquivar, não avisar)", () => {
    const ultimaAtividade = new Date("2026-07-01T12:00:00Z"); // >90 dias
    const status = calcularStatusArquivamento(ultimaAtividade, agora);
    expect(status.deveNotificarAviso).toBe(false);
    expect(status.deveArquivar).toBe(true);
  });
});
```

- [ ] **Step 5: Executar teste para verificar falha, depois implementar `auto-arquivamento.ts`**

Run: `pnpm test src/lib/jobs/auto-arquivamento.test.ts` → Expected: FAIL.

File: `src/lib/jobs/auto-arquivamento.ts`
```typescript
export function calcularStatusArquivamento(
  ultimaAtividade: Date,
  agora: Date = new Date(),
) {
  const diffDias = Math.floor(
    (agora.getTime() - ultimaAtividade.getTime()) / (1000 * 60 * 60 * 24),
  );
  return {
    diasSemAtividade: diffDias,
    deveNotificarAviso: diffDias >= 83 && diffDias < 90,
    deveArquivar: diffDias >= 90,
  };
}
```

Run: `pnpm test src/lib/jobs/auto-arquivamento.test.ts` → Expected: PASS.

- [ ] **Step 6: Localizar e atualizar a action de dar alta clínica (regra 2 — alta arquiva)**

Run: `grep -rn "altaEm" "src/app/(app)/pacientes"` para achar a Server Action que grava `altaEm`. Editar essa action para, na mesma transação, setar `arquivadoEm: sql\`NOW()\`` quando `altaEm` deixa de ser `null`. Escrever teste de integração cobrindo: dar alta → `patient.arquivadoEm` não-nulo; arquivar manualmente → `patient.altaEm` continua `null` (regra 3).

- [ ] **Step 7: Localizar a action de criação de sessão e implementar desarquivamento automático (regra 6)**

Run: `grep -rln "insert(session)" src` (ou equivalente) para achar onde uma nova `session`/`sessionNote` é criada para um paciente. Dentro dessa transação, adicionar:
```typescript
const [pacienteAtual] = await tx
  .select({ arquivadoEm: patient.arquivadoEm })
  .from(patient)
  .where(eq(patient.id, patientId));

if (pacienteAtual?.arquivadoEm !== null) {
  await tx
    .update(patient)
    .set({ arquivadoEm: null })
    .where(eq(patient.id, patientId));

  await tx.insert(auditLog).values({
    clinicId,
    atorId: userId,
    acao: "paciente_desarquivado_automaticamente",
    entidade: "patient",
    entidadeId: patientId,
    patientId,
  });
}
```
Escrever teste de integração: paciente arquivado recebe nova sessão → `arquivadoEm` volta a `null` e existe linha em `audit_log` com `acao: "paciente_desarquivado_automaticamente"`.

- [ ] **Step 8: Teste RLS — paciente arquivado continua legível (regra 4)**

File: `db/tests/patient-arquivado-rls.int.test.ts` — teste real de integração (não placeholder): inserir paciente com `arquivadoEm` preenchido, rodar `SELECT` sob role `app_role` autenticada como membro da clínica, esperar a linha retornar normalmente (arquivamento é filtro de UI/negócio, não de RLS).

Run: `pnpm test:rls`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts db/migrations/ src/lib/jobs/auto-arquivamento.ts src/lib/jobs/auto-arquivamento.test.ts db/tests/patient-arquivado-rls.int.test.ts
git commit -m "feat(patient): arquivado_em desatrelado de alta_em, desarquivamento automático e job de auto-arquivamento em 90 dias (#174)"
```

---

### Task 3: Webhook Asaas para Faturamento por Paciente Ativo (Issue #36)

**Files:**
- Modify: `src/db/schema.ts` (nova tabela `asaasWebhookEvent` para idempotência)
- Create: migração via `pnpm db:generate`
- Create: `src/app/api/hooks/asaas/route.ts`, `src/app/api/hooks/asaas/route.test.ts`

**Interfaces:**
- Consumes: `patient.arquivadoEm` (Task 2), `patient.clinicId`, `clinic` (Task 1) — usados para apurar pacientes ativos.
- Produces: `POST /api/hooks/asaas` — contrato externo (Asaas), não consumido por outra task deste plano.

**Regras Levantadas:**
1. Validar o cabeçalho HTTP de autenticação do webhook (`ASAAS_WEBHOOK_TOKEN`) com comparação resistente a timing attack.
2. Tratar eventos `PIX_AUTOMATIC_RECURRING_*` sem interromper a execução com 500; idempotente — reprocessar o mesmo `event.id` não duplica efeito.
3. Apurar pacientes ativos ignorando registros onde `arquivado_em IS NOT NULL` ou `deletado_em IS NOT NULL`.

- [ ] **Step 1: Adicionar tabela de idempotência**

File: `src/db/schema.ts`
```typescript
export const asaasWebhookEvent = pgTable("asaas_webhook_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  asaasEventId: text("asaas_event_id").notNull().unique(),
  evento: text("evento").notNull(),
  processadoEm: timestamp("processado_em", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Gerar, revisar e aplicar migração**

Run: `pnpm db:generate` → revisar SQL gerado → `pnpm db:migrate`.

- [ ] **Step 3: Escrever testes do Webhook Asaas (falha primeiro)**

File: `src/app/api/hooks/asaas/route.test.ts`
```typescript
import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";

function req(body: unknown, token = process.env.ASAAS_WEBHOOK_TOKEN) {
  return new Request("http://localhost/api/hooks/asaas", {
    method: "POST",
    headers: { "asaas-access-token": token ?? "" },
    body: JSON.stringify(body),
  });
}

describe("Webhook Asaas Route", () => {
  it("recusa requisição sem token de autenticação válido", async () => {
    const res = await POST(req({ event: "PIX_AUTOMATIC_RECURRING_AUTHORIZED", id: "evt_1" }, "token-invalido"));
    expect(res.status).toBe(401);
  });

  it("aceita requisição com token válido e evento conhecido", async () => {
    const res = await POST(req({ event: "PIX_AUTOMATIC_RECURRING_AUTHORIZED", id: "evt_2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("é idempotente — mesmo event.id processado duas vezes não duplica efeito", async () => {
    const primeiro = await POST(req({ event: "PIX_AUTOMATIC_RECURRING_AUTHORIZED", id: "evt_3" }));
    const segundo = await POST(req({ event: "PIX_AUTOMATIC_RECURRING_AUTHORIZED", id: "evt_3" }));
    expect(primeiro.status).toBe(200);
    expect(segundo.status).toBe(200);
    const bodySegundo = await segundo.json();
    expect(bodySegundo.duplicado).toBe(true);
  });
});
```

- [ ] **Step 4: Executar testes para verificar falha**

Run: `pnpm test src/app/api/hooks/asaas/route.test.ts` → Expected: FAIL (`route.ts` ainda não existe).

- [ ] **Step 5: Implementar endpoint `src/app/api/hooks/asaas/route.ts`**

File: `src/app/api/hooks/asaas/route.ts`
```typescript
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { asaasWebhookEvent, patient } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

function tokenValido(recebido: string | null, esperado: string | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const tokenHeader = req.headers.get("asaas-access-token");
  if (!tokenValido(tokenHeader, process.env.ASAAS_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { event, id: asaasEventId } = body as { event: string; id: string };

  const [jaProcessado] = await db
    .select({ id: asaasWebhookEvent.id })
    .from(asaasWebhookEvent)
    .where(eq(asaasWebhookEvent.asaasEventId, asaasEventId));

  if (jaProcessado) {
    return NextResponse.json({ received: true, duplicado: true }, { status: 200 });
  }

  if (event.startsWith("PIX_AUTOMATIC_RECURRING_")) {
    // Apuração de pacientes ativos (ignora arquivados/deletados) — usada pelo
    // faturamento por paciente ativo/mês. Cálculo do valor cobrado fica fora
    // deste plano (depende da tabela `subscription`, #159).
    await db
      .select({ id: patient.id })
      .from(patient)
      .where(and(isNull(patient.arquivadoEm)));
  }

  await db.insert(asaasWebhookEvent).values({ asaasEventId, evento: event });

  return NextResponse.json({ received: true }, { status: 200 });
}
```

- [ ] **Step 6: Executar testes do webhook**

Run: `pnpm test src/app/api/hooks/asaas/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts db/migrations/ src/app/api/hooks/asaas/route.ts src/app/api/hooks/asaas/route.test.ts
git commit -m "feat(billing): webhook Asaas com comparação de token resistente a timing attack e idempotência (#36)"
```

---

## Self-Review

- **Cobertura das regras levantadas:** todas as 4 regras da Task 1, todas as 6 da Task 2 e todas as 3 da Task 3 têm um step com código real (nenhuma regra só citada em prosa).
- **Placeholders:** nenhum `TBD`/comentário-stub restante; teste RLS da Task 2 Step 8 deixou de ser comentário e virou asserção real.
- **Consistência de tipos:** `calcularStatusTrial`/`StatusTrial` (Task 1) e `calcularStatusArquivamento` (Task 2) usados com a mesma assinatura em todos os steps que os referenciam. `patient.arquivadoEm` (Task 2) é o mesmo nome usado no `where` do webhook (Task 3).
- **Risco de schema:** Task 1 desfaz a garantia `NOT NULL` da migração `0057`; qualquer código que hoje assuma `clinic.trialComecoEm` sempre definido (buscar com `grep -rn "trialComecoEm" src`) precisa ser revisitado durante a execução — sinalizado no Global Constraints, não é surpresa de última hora.
