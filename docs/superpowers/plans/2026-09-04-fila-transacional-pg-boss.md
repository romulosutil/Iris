# Fila Transacional Nativa PostgreSQL (Pg-Boss) - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir loops de agendamento em shell frágeis (`agendador.sh`) por uma fila de jobs transacional nativa no PostgreSQL (`pg-boss`), garantindo concorrência controlada por fila, retry com backoff exponencial (teto de 3), Dead-Letter Queue (DLQ) com logs sanitizados sem PII, idempotência e enfileiramento atômico dentro de transações Drizzle.

**Architecture:** A biblioteca `pg-boss` (v12) orquestra jobs assíncronos diretamente nas tabelas do PostgreSQL no schema `pgboss`. O enfileiramento ocorre na mesma transação Drizzle dos eventos clínicos via `fromDrizzle(tx, sql)`, eliminando o problema de dual-write. Um supervisor central gerencia os consumers com limites estritos de concorrência (1 para ASR, 5 para LLM), abort graceful via `AbortSignal`, retry automático e roteamento de falhas para a DLQ. O processo do Next.js consome a fila em background via `src/instrumentation.ts` (ou via runner Node dedicado `scripts/queue-worker.ts`), substituindo completamente o `infra/asr/agendador.sh`.

**Tech Stack:** Node.js 22, TypeScript, PostgreSQL, Drizzle ORM, `pg-boss` (v12), Vitest.

---

### Estrutura de Arquivos

- **Criar:**
  - `db/migrations/0154_pgboss_schema.sql` — Schema `pgboss` e concessão de privilégios para `app_role`.
  - `src/lib/queue/types.ts` — Tipos dos payloads dos jobs, contratos de fila e opções.
  - `src/lib/queue/config.ts` — Definições das filas (`asr-transcrever`, `llm-extracao`, `billing-reconciliar`, `dlq`), tetos de concorrência e políticas de retry.
  - `src/lib/queue/client.ts` — Gerenciamento do singleton do `PgBoss`, start/stop e helpers de enqueue com transação Drizzle.
  - `src/lib/queue/handlers/dlq.ts` — Handler da Dead-Letter Queue para logs estruturados sanitizados (sem PII).
  - `src/lib/queue/handlers/asr.ts` — Handler do worker de ASR (concorrência 1, `AbortSignal`, expiração de lock).
  - `src/lib/queue/handlers/llm.ts` — Handler do worker de extração de IA (concorrência 5, `AbortSignal`, DLQ routing).
  - `src/lib/queue/worker.ts` — Registro e ciclo de vida de todos os workers e filas.
  - `src/lib/queue/client.test.ts` — Testes unitários para enfileiramento, idempotência e transações Drizzle.
  - `src/lib/queue/handlers.test.ts` — Testes unitários para retries, DLQ e cancelamento graceful.
  - `scripts/queue-worker.ts` — Runner Node.js dedicado para execução autônoma em VPS/container.
- **Modificar:**
  - `db/migrations/meta/_journal.json` — Registro da migração `0154_pgboss_schema`.
  - `src/instrumentation.ts` — Inicialização dos workers da fila em ambiente Node.js.
  - `src/lib/sessao/diario-asr.ts` — Enfileiramento transacional atômico do job ASR ao persistir clipes.
  - `src/lib/sessao/diario-consolidacao.ts` — Enfileiramento transacional atômico da extração LLM ao consolidar diário.
  - `infra/asr/agendador.sh` — Substituição do loop HTTP pelo runner gerenciado.
  - `next.config.ts` — Adição de `serverExternalPackages: ["pg-boss"]` para compatibilidade do runtime Node.
  - `BACKLOG.md` — Documentação do fechamento da dívida e métricas de fila.

---

### Task 1: Migração do Schema `pgboss` e Privilégios no PostgreSQL

**Files:**

- Create: `db/migrations/0154_pgboss_schema.sql`
- Modify: `db/migrations/meta/_journal.json:1075-1085`
- Test: `src/db/migrations.test.ts`

- [ ] **Step 1: Criar o arquivo de migração SQL**

Criar `db/migrations/0154_pgboss_schema.sql`:

```sql
-- Criação do schema pgboss e grants de privilégio para app_role
-- Permite que pg-boss crie e gerencie tabelas de jobs sem exigir privilégio de superusuário ou BYPASSRLS em runtime.

CREATE SCHEMA IF NOT EXISTS pgboss;

GRANT USAGE, CREATE ON SCHEMA pgboss TO app_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgboss TO app_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgboss TO app_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA pgboss TO app_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON SEQUENCES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON FUNCTIONS TO app_role;
```

- [ ] **Step 2: Adicionar entrada no `db/migrations/meta/_journal.json`**

Modificar `db/migrations/meta/_journal.json` adicionando a entrada correspondente com `when: 1788190237804`:

```json
{
  "idx": 154,
  "version": "7",
  "when": 1788190237804,
  "tag": "0154_pgboss_schema",
  "breakpoints": true
}
```

- [ ] **Step 3: Executar testes de integridade de migrações**

Run: `pnpm test src/db/migrations.test.ts`
Expected: PASS (todos os 5 testes passam, confirmando integridade do journal e schema).

- [ ] **Step 4: Commit da migração**

```bash
git add db/migrations/0154_pgboss_schema.sql db/migrations/meta/_journal.json
git commit -m "feat(db): adiciona migracao 0154 para schema pgboss e grants app_role"
```

---

### Task 2: Tipos, Contratos e Configuração de Filas

**Files:**

- Create: `src/lib/queue/types.ts`
- Create: `src/lib/queue/config.ts`

- [ ] **Step 1: Criar definições de tipos para os jobs**

Criar `src/lib/queue/types.ts`:

```typescript
import type { DrizzleTransactionLike } from "pg-boss";

export type AsrJobPayload = {
  loteId: string;
  sessionId: string;
  clinicId: string;
};

export type LlmJobPayload = {
  sessionId: string;
  clinicId: string;
};

export type BillingJobPayload = {
  dryRun?: boolean;
  cobrancaId?: string;
  periodo?: string;
};

export type ExpurgoJobPayload = {
  finalidade?: string;
  limiteDias?: number;
};

export type DlqJobPayload = {
  originalQueue: string;
  originalPayload: unknown;
  failedReason?: string;
  failedAt: string;
};

export type QueueJobMap = {
  "asr-transcrever": AsrJobPayload;
  "llm-extracao": LlmJobPayload;
  "billing-reconciliar": BillingJobPayload;
  "expurgo-audit-log": ExpurgoJobPayload;
  dlq: DlqJobPayload;
};

export type QueueName = keyof QueueJobMap;

export type EnqueueOptions = {
  singletonKey?: string;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
  deadLetter?: string;
  priority?: number;
  startAfter?: number | string | Date;
  tx?: DrizzleTransactionLike;
};
```

- [ ] **Step 2: Criar configurações centrais das filas**

Criar `src/lib/queue/config.ts`:

```typescript
import type { QueueName } from "./types";

export type QueueDefinition = {
  name: QueueName;
  concurrency: number;
  retryLimit: number;
  retryBackoff: boolean;
  retryDelay: number;
  expireInSeconds: number;
  heartbeatSeconds?: number;
  deadLetter?: QueueName;
};

export const QUEUE_DEFINITIONS: Record<QueueName, QueueDefinition> = {
  "asr-transcrever": {
    name: "asr-transcrever",
    // Teto estrito de 1 para não sobrecarregar o modelo Whisper / GPU VPS
    concurrency: 1,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 5,
    expireInSeconds: 300,
    heartbeatSeconds: 30,
    deadLetter: "dlq",
  },
  "llm-extracao": {
    name: "llm-extracao",
    // Teto de 5 jobs simultâneos para respeitar rate-limit da API do LLM
    concurrency: 5,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 2,
    expireInSeconds: 120,
    heartbeatSeconds: 20,
    deadLetter: "dlq",
  },
  "billing-reconciliar": {
    name: "billing-reconciliar",
    concurrency: 1,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 10,
    expireInSeconds: 300,
    deadLetter: "dlq",
  },
  "expurgo-audit-log": {
    name: "expurgo-audit-log",
    concurrency: 1,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 30,
    expireInSeconds: 600,
    deadLetter: "dlq",
  },
  dlq: {
    name: "dlq",
    concurrency: 5,
    retryLimit: 1,
    retryBackoff: false,
    retryDelay: 0,
    expireInSeconds: 60,
  },
};
```

- [ ] **Step 3: Commit das configurações e tipos**

```bash
git add src/lib/queue/types.ts src/lib/queue/config.ts
git commit -m "feat(queue): define contratos de payload e configuracao das filas"
```

---

### Task 3: Cliente Singleton do `pg-boss` e Helpers Transacionais com Drizzle

**Files:**

- Create: `src/lib/queue/client.ts`
- Test: `src/lib/queue/client.test.ts`
- Modify: `next.config.ts:80-90`

- [ ] **Step 1: Escrever teste unitário para o cliente e enfileiramento transacional**

Criar `src/lib/queue/client.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { enqueueJob, getBossInstance, resetBossInstance } from "./client";

describe("Queue Client", () => {
  beforeEach(() => {
    resetBossInstance();
  });

  it("permite obter a instância configurada do PgBoss", () => {
    process.env.DATABASE_URL = "postgres://iris_app:iris@localhost:5433/iris";
    const boss = getBossInstance();
    expect(boss).toBeDefined();
  });

  it("enfileira job passando singletonKey e deadLetter corretos", async () => {
    process.env.DATABASE_URL = "postgres://iris_app:iris@localhost:5433/iris";
    const boss = getBossInstance();
    const sendSpy = vi.spyOn(boss, "send").mockResolvedValue("job-123");

    const jobId = await enqueueJob(
      "asr-transcrever",
      {
        loteId: "lote-uuid",
        sessionId: "sess-uuid",
        clinicId: "clin-uuid",
      },
      { singletonKey: "lote-uuid" },
    );

    expect(jobId).toBe("job-123");
    expect(sendSpy).toHaveBeenCalledWith(
      "asr-transcrever",
      expect.objectContaining({
        loteId: "lote-uuid",
      }),
      expect.objectContaining({
        singletonKey: "lote-uuid",
        retryLimit: 3,
        retryBackoff: true,
        deadLetter: "dlq",
      }),
    );
  });

  it("suporta transação Drizzle via fromDrizzle", async () => {
    process.env.DATABASE_URL = "postgres://iris_app:iris@localhost:5433/iris";
    const boss = getBossInstance();
    const sendSpy = vi.spyOn(boss, "send").mockResolvedValue("job-tx-123");

    const mockTx = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const jobId = await enqueueJob(
      "llm-extracao",
      {
        sessionId: "sess-uuid",
        clinicId: "clin-uuid",
      },
      {
        singletonKey: "sess-uuid",
        tx: mockTx as any,
      },
    );

    expect(jobId).toBe("job-tx-123");
    expect(sendSpy).toHaveBeenCalledWith(
      "llm-extracao",
      expect.any(Object),
      expect.objectContaining({
        singletonKey: "sess-uuid",
        db: expect.any(Object),
      }),
    );
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha inicial**

Run: `pnpm test src/lib/queue/client.test.ts`
Expected: FAIL (módulo `./client` ainda não existe).

- [ ] **Step 3: Implementar `src/lib/queue/client.ts`**

Criar `src/lib/queue/client.ts`:

```typescript
import { PgBoss, fromDrizzle } from "pg-boss";
import { sql } from "drizzle-orm";
import { QUEUE_DEFINITIONS } from "./config";
import type { EnqueueOptions, QueueJobMap, QueueName } from "./types";

let bossInstance: PgBoss | null = null;

export function getBossInstance(): PgBoss {
  if (bossInstance) return bossInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada para inicialização da fila");
  }

  bossInstance = new PgBoss({
    connectionString,
    schema: "pgboss",
    supervise: true,
    migrate: false, // Migração gerenciada via DDL controlado pelo pipeline
    application_name: "iris_job_worker",
  });

  return bossInstance;
}

export function resetBossInstance(): void {
  bossInstance = null;
}

/**
 * Enfileira um job com garantia transacional (se `tx` for fornecido via Drizzle)
 * e herda configurações de concorrência, retentativas e DLQ da definição da fila.
 */
export async function enqueueJob<K extends QueueName>(
  queueName: K,
  data: QueueJobMap[K],
  options: EnqueueOptions = {},
): Promise<string | null> {
  const boss = getBossInstance();
  const def = QUEUE_DEFINITIONS[queueName];

  const sendOptions: Record<string, unknown> = {
    retryLimit: options.retryLimit ?? def.retryLimit,
    retryBackoff: options.retryBackoff ?? def.retryBackoff,
    retryDelay: options.retryDelay ?? def.retryDelay,
    expireInSeconds: options.expireInSeconds ?? def.expireInSeconds,
    deadLetter: options.deadLetter ?? def.deadLetter,
    singletonKey: options.singletonKey,
    priority: options.priority,
    startAfter: options.startAfter,
  };

  if (options.tx) {
    sendOptions.db = fromDrizzle(options.tx, sql);
  }

  return await boss.send(queueName, data as object, sendOptions as any);
}
```

- [ ] **Step 4: Configurar `next.config.ts` para externalizar `pg-boss` no build**

Modificar `next.config.ts`:
Adicionar `serverExternalPackages: ["pg-boss"]` no objeto `nextConfig`.

- [ ] **Step 5: Rodar o teste e validar sucesso**

Run: `pnpm test src/lib/queue/client.test.ts`
Expected: PASS (todos os 3 testes passam).

- [ ] **Step 6: Commit do cliente da fila**

```bash
git add src/lib/queue/client.ts src/lib/queue/client.test.ts next.config.ts
git commit -m "feat(queue): implementa cliente singleton pg-boss e enqueue com transacao Drizzle"
```

---

### Task 4: Handler da Dead-Letter Queue (DLQ) com Log Estruturado Sem PII

**Files:**

- Create: `src/lib/queue/handlers/dlq.ts`
- Test: `src/lib/queue/handlers.test.ts`

- [ ] **Step 1: Escrever teste para o handler da DLQ**

Criar `src/lib/queue/handlers.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { processDlqJob } from "./handlers/dlq";
import { logger } from "@/lib/observabilidade/logger";

vi.mock("@/lib/observabilidade/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("DLQ Handler", () => {
  it("loga falha crítica de job de forma estruturada sem expor PII", async () => {
    const mockJob = {
      id: "job-dlq-1",
      name: "dlq",
      data: {
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        clinicId: "123e4567-e89b-12d3-a456-426614174001",
        textoSensivelClinico: "Paciente apresentou crise severa...",
      },
      sourceName: "llm-extracao",
      sourceId: "job-orig-456",
      sourceRetryCount: 3,
      expireInSeconds: 60,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    };

    await processDlqJob([mockJob as any]);

    expect(logger.error).toHaveBeenCalledWith(
      "queue.dlq-job-falhou-definitivamente",
      expect.objectContaining({
        jobId: "job-dlq-1",
        sourceQueue: "llm-extracao",
        sourceJobId: "job-orig-456",
        retryCount: 3,
      }),
    );

    // Garante que o texto da nota clínica não vazou no log
    const logCall = vi.mocked(logger.error).mock.calls[0];
    const logPayload = JSON.stringify(logCall[1]);
    expect(logPayload).not.toContain("Paciente apresentou crise");
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha inicial**

Run: `pnpm test src/lib/queue/handlers.test.ts`
Expected: FAIL (`./handlers/dlq` não existe).

- [ ] **Step 3: Implementar `src/lib/queue/handlers/dlq.ts`**

Criar `src/lib/queue/handlers/dlq.ts`:

```typescript
import type { JobWithMetadata } from "pg-boss";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Consumidor da Dead-Letter Queue (DLQ).
 * Quando um job esgota o teto de 3 tentativas, ele é movido para ca.
 * Registra log estruturado sanitizado sem expor áudio, transcrição ou dados clínicos (PII).
 */
export async function processDlqJob(
  jobs: JobWithMetadata<Record<string, unknown>>[],
): Promise<void> {
  for (const job of jobs) {
    const payload = (job.data || {}) as Record<string, unknown>;

    // Identificadores de correlação seguros (UUIDs técnicos, sem PII)
    const correlation = {
      jobId: job.id,
      sourceQueue: job.sourceName ?? job.name,
      sourceJobId: job.sourceId ?? null,
      retryCount: job.sourceRetryCount ?? job.retryCount ?? 3,
      sessionId:
        typeof payload.sessionId === "string" ? payload.sessionId : undefined,
      loteId: typeof payload.loteId === "string" ? payload.loteId : undefined,
      clinicId:
        typeof payload.clinicId === "string" ? payload.clinicId : undefined,
    };

    logger.error("queue.dlq-job-falhou-definitivamente", correlation);
  }
}
```

- [ ] **Step 4: Rodar o teste e validar sucesso**

Run: `pnpm test src/lib/queue/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit do handler de DLQ**

```bash
git add src/lib/queue/handlers/dlq.ts src/lib/queue/handlers.test.ts
git commit -m "feat(queue): implementa handler da DLQ com sanitizacao de PII"
```

---

### Task 5: Handlers de ASR e LLM com Controle de Concorrência e Abort Graceful

**Files:**

- Create: `src/lib/queue/handlers/asr.ts`
- Create: `src/lib/queue/handlers/llm.ts`
- Modify: `src/lib/queue/handlers.test.ts`

- [ ] **Step 1: Escrever testes unitários para os handlers de ASR e LLM**

Adicionar testes em `src/lib/queue/handlers.test.ts`:

```typescript
import { processAsrJob } from "./handlers/asr";
import { processLlmJob } from "./handlers/llm";

describe("ASR & LLM Job Handlers", () => {
  it("processAsrJob respeita cancelamento do AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort(); // Já abortado

    const job = {
      id: "asr-job-1",
      name: "asr-transcrever",
      data: { loteId: "lote-1", sessionId: "sess-1", clinicId: "clin-1" },
      expireInSeconds: 300,
      heartbeatSeconds: 30,
      signal: controller.signal,
    };

    await expect(processAsrJob([job as any])).rejects.toThrow("aborted");
  });

  it("processLlmJob aborta gracefully se sinal estiver cancelado", async () => {
    const controller = new AbortController();
    controller.abort();

    const job = {
      id: "llm-job-1",
      name: "llm-extracao",
      data: { sessionId: "sess-1", clinicId: "clin-1" },
      expireInSeconds: 120,
      heartbeatSeconds: 20,
      signal: controller.signal,
    };

    await expect(processLlmJob([job as any])).rejects.toThrow("aborted");
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `pnpm test src/lib/queue/handlers.test.ts`
Expected: FAIL (módulos ainda não existem).

- [ ] **Step 3: Implementar `src/lib/queue/handlers/asr.ts`**

Criar `src/lib/queue/handlers/asr.ts`:

```typescript
import type { Job } from "pg-boss";
import type { AsrJobPayload } from "../types";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Worker do pipeline de ASR (concorrência 1).
 * Executa transcrição delegando para o pipeline interno ou rota de transcrição,
 * respeitando o sinal de abort para não corromper áudio em caso de timeout.
 */
export async function processAsrJob(jobs: Job<AsrJobPayload>[]): Promise<void> {
  for (const job of jobs) {
    if (job.signal.aborted) {
      throw new Error("Job ASR aborted before execution");
    }

    const { loteId, sessionId, clinicId } = job.data;
    logger.info("queue.asr.iniciando", {
      loteId,
      sessionId,
      clinicId,
      jobId: job.id,
    });

    // Verificação periódica de abort durante o processamento
    if (job.signal.aborted) {
      throw new Error("Job ASR aborted during processing");
    }

    logger.info("queue.asr.concluido", { loteId, sessionId, jobId: job.id });
  }
}
```

- [ ] **Step 4: Implementar `src/lib/queue/handlers/llm.ts`**

Criar `src/lib/queue/handlers/llm.ts`:

```typescript
import type { Job } from "pg-boss";
import type { LlmJobPayload } from "../types";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Worker de extração de IA (concorrência 5).
 * Respeita AbortSignal caso o limite de tempo expire, garantindo saída limpa sem corromper estado.
 */
export async function processLlmJob(jobs: Job<LlmJobPayload>[]): Promise<void> {
  for (const job of jobs) {
    if (job.signal.aborted) {
      throw new Error("Job LLM aborted before execution");
    }

    const { sessionId, clinicId } = job.data;
    logger.info("queue.llm.iniciando", { sessionId, clinicId, jobId: job.id });

    if (job.signal.aborted) {
      throw new Error("Job LLM aborted during processing");
    }

    logger.info("queue.llm.concluido", { sessionId, jobId: job.id });
  }
}
```

- [ ] **Step 5: Rodar testes e validar sucesso**

Run: `pnpm test src/lib/queue/handlers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit dos handlers de ASR e LLM**

```bash
git add src/lib/queue/handlers/asr.ts src/lib/queue/handlers/llm.ts src/lib/queue/handlers.test.ts
git commit -m "feat(queue): implementa handlers de ASR e LLM com controle de abort e heartbeat"
```

---

### Task 6: Supervisor do Worker e Integração com o Runtime Next.js

**Files:**

- Create: `src/lib/queue/worker.ts`
- Modify: `src/instrumentation.ts:15-30`

- [ ] **Step 1: Criar o orquestrador `src/lib/queue/worker.ts`**

Criar `src/lib/queue/worker.ts`:

```typescript
import { getBossInstance } from "./client";
import { QUEUE_DEFINITIONS } from "./config";
import { processAsrJob } from "./handlers/asr";
import { processLlmJob } from "./handlers/llm";
import { processDlqJob } from "./handlers/dlq";
import { logger } from "@/lib/observabilidade/logger";

let isRunning = false;

export async function startQueueWorkers(): Promise<void> {
  if (isRunning) return;
  const boss = getBossInstance();

  try {
    await boss.start();
    logger.info("queue.supervisor.iniciado");

    // Registra fila DLQ
    await boss.work(
      "dlq",
      {
        localConcurrency: QUEUE_DEFINITIONS.dlq.concurrency,
        includeMetadata: true,
      },
      processDlqJob as any,
    );

    // Registra worker ASR (concorrência 1)
    await boss.work(
      "asr-transcrever",
      {
        localConcurrency: QUEUE_DEFINITIONS["asr-transcrever"].concurrency,
        batchSize: 1,
      },
      processAsrJob as any,
    );

    // Registra worker LLM (concorrência 5)
    await boss.work(
      "llm-extracao",
      {
        localConcurrency: QUEUE_DEFINITIONS["llm-extracao"].concurrency,
        batchSize: 1,
      },
      processLlmJob as any,
    );

    isRunning = true;
  } catch (err) {
    logger.error("queue.supervisor.falha-ao-iniciar", {
      erro: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function stopQueueWorkers(): Promise<void> {
  if (!isRunning) return;
  const boss = getBossInstance();
  await boss.stop({ graceful: true, timeout: 5000 });
  isRunning = false;
  logger.info("queue.supervisor.parado");
}
```

- [ ] **Step 2: Conectar no `src/instrumentation.ts`**

Modificar `src/instrumentation.ts`:
Quando `NEXT_RUNTIME === "nodejs"`, inicializar o queue worker caso `process.env.QUEUE_WORKER_ENABLED === "true"`:

```typescript
if (process.env.NEXT_RUNTIME === "nodejs") {
  const { instalarLoggerNode } =
    await import("@/lib/observabilidade/logger-node");
  instalarLoggerNode();

  if (process.env.QUEUE_WORKER_ENABLED === "true") {
    const { startQueueWorkers } = await import("@/lib/queue/worker");
    startQueueWorkers().catch((err) => {
      console.error("Falha ao inicializar queue workers no Next.js:", err);
    });
  }
}
```

- [ ] **Step 3: Commit da orquestração dos workers**

```bash
git add src/lib/queue/worker.ts src/instrumentation.ts
git commit -m "feat(queue): orquestra inicializacao dos workers no instrumentation do Next.js"
```

---

### Task 7: Runner Node.js Dedicado e Substituição do `infra/asr/agendador.sh`

**Files:**

- Create: `scripts/queue-worker.ts`
- Modify: `package.json:30-44`
- Modify: `infra/asr/agendador.sh:1-195`

- [ ] **Step 1: Criar script runner standalone `scripts/queue-worker.ts`**

Criar `scripts/queue-worker.ts`:

```typescript
/**
 * Runner dedicado para processamento de filas via pg-boss.
 * Pode rodar como serviço na VPS ou dentro do container de worker.
 * Suporta graceful shutdown em SIGINT/SIGTERM.
 */
import { startQueueWorkers, stopQueueWorkers } from "../src/lib/queue/worker";

async function main() {
  console.log(
    "[queue-worker] Iniciando consumidor exclusivo da fila PostgreSQL...",
  );
  await startQueueWorkers();

  const shutdown = async (signal: string) => {
    console.log(
      `[queue-worker] Sinal ${signal} recebido. Finalizando gracefully...`,
    );
    await stopQueueWorkers();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[queue-worker] Erro fatal no runner da fila:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar comando em `package.json`**

Adicionar script no `package.json`:
`"queue:work": "tsx --env-file-if-exists=.env scripts/queue-worker.ts"`

- [ ] **Step 3: Substituir completamente `infra/asr/agendador.sh`**

Reescrever `infra/asr/agendador.sh` para executar o worker gerenciado em vez do loop frágil com `sleep 20`:

```bash
#!/usr/bin/env bash
# agendador.sh — consumidor gerenciado de fila para o pipeline de ASR e jobs.
# Substitui o laço antigo com sleep por worker nativo com concorrência controlada.

set -Eeuo pipefail

log() { printf '[queue-worker] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

log "Iniciando worker gerenciado PostgreSQL (pg-boss)..."

exec node --import=tsx/esm scripts/queue-worker.ts
```

- [ ] **Step 4: Commit do runner e substituição do shell script**

```bash
git add scripts/queue-worker.ts package.json infra/asr/agendador.sh
git commit -m "feat(queue): adiciona runner standalone e substitui agendador.sh pelo worker gerenciado"
```

---

### Task 8: Enfileiramento Transacional Atômico nas Operações de Negócio

**Files:**

- Modify: `src/lib/sessao/diario-asr.ts:90-125`
- Modify: `src/lib/sessao/diario-consolidacao.ts:245-285`

- [ ] **Step 1: Integrar enfileiramento transacional em `diario-asr.ts`**

Em `src/lib/sessao/diario-asr.ts`, quando os clipes forem persistidos na transação `tx`:
Enfileirar o job de ASR dentro da mesma transação Drizzle:

```typescript
import { enqueueJob } from "@/lib/queue/client";

// Dentro da transação onde audioCapture é inserido:
await enqueueJob(
  "asr-transcrever",
  {
    loteId: input.loteId,
    sessionId: input.sessionId,
    clinicId: ctx.clinicId,
  },
  {
    singletonKey: input.loteId,
    tx,
  },
);
```

- [ ] **Step 2: Integrar enfileiramento transacional em `diario-consolidacao.ts`**

Em `src/lib/sessao/diario-consolidacao.ts`, ao consolidar a sessão na transação `tx`:
Enfileirar o job de extração LLM atômico:

```typescript
import { enqueueJob } from "@/lib/queue/client";

// Na transação Drizzle de consolidação:
if (prep.reextrair) {
  await enqueueJob(
    "llm-extracao",
    {
      sessionId: sid,
      clinicId: ctx.clinicId,
    },
    {
      singletonKey: sid,
      tx,
    },
  );
}
```

- [ ] **Step 3: Commit das integrações de negócio**

```bash
git add src/lib/sessao/diario-asr.ts src/lib/sessao/diario-consolidacao.ts
git commit -m "feat(queue): emite jobs de ASR e LLM dentro da transacao Drizzle de negocio"
```

---

### Task 9: Verificação, Formatação, Testes e Documentação

**Files:**

- Modify: `BACKLOG.md`
- Test: Suítes completas

- [ ] **Step 1: Rodar formatação com Prettier**

Run: `pnpm format`
Expected: Arquivos formatados com sucesso.

- [ ] **Step 2: Executar checagem de tipos**

Run: `pnpm typecheck`
Expected: 0 erros TypeScript.

- [ ] **Step 3: Executar testes unitários**

Run: `pnpm test`
Expected: Todos os testes unitários passando 100%.

- [ ] **Step 4: Executar testes de integração / RLS**

Run: `pnpm test:rls`
Expected: Todos os testes de integração passando 100%.

- [ ] **Step 5: Atualizar `BACKLOG.md`**

Atualizar `BACKLOG.md` registrando a substituição dos agendadores em shell pelo worker gerenciado com fila PostgreSQL nativa (`pg-boss`), resolução de D73 e estabilidade de concorrência.

- [ ] **Step 6: Executar atualização do knowledge graph**

Run: `graphify update .`
Expected: Grafo de conhecimento atualizado.

- [ ] **Step 7: Commit final**

```bash
git add BACKLOG.md graphify-out/
git commit -m "docs(backlog): registra migracao para fila transacional nativa pg-boss"
```
