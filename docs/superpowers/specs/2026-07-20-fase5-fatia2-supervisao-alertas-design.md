# Fase 5 — Fatia 2: Supervisão (fila de alertas do coordenador)

> **Formato desta spec:** contrato executável para **desenvolvimento delegado**.
> A camada de aplicação será implementada pelo **Gemini 3.5**; a camada de
> schema/RLS é entregue pronta pelo Claude (tech). O Claude valida o diff antes
> da PR. Leia a §0 (protocolo) antes de qualquer código.

---

## 0. Protocolo de execução (para o Gemini 3.5) — LER PRIMEIRO

Você (Gemini) implementa a **camada de aplicação** de `/supervisao`. O schema,
a migração, a RLS e a config de clínica **já estão prontos e migrados** — trate
a §3 como dado de entrada fixo. **NÃO crie migração, NÃO altere DDL, NÃO toque
em RLS.**

**Regras inegociáveis:**

1. **Fronteira de arquivos.** Só crie/edite os arquivos listados na §2. Tudo
   fora dessa lista é **NÃO TOCAR** — em especial: `src/db/schema.ts`,
   `db/migrations/**`, qualquer política RLS, `docs/agente/output-schema.json`.
   A única exceção fora de `src/app/(app)/supervisao/` e `src/lib/supervisao/`
   é **uma linha** em `src/app/(app)/layout.tsx` (§8.3, snippet exato dado).
2. **Espelhar, não inventar.** Cada unidade aponta um **arquivo-irmão** da
   Fatia 1 (`src/app/(app)/validacao/*`). Siga o mesmo padrão de estrutura,
   boilerplate de segurança e estilo. Divergiu do irmão → está errado.
3. **Design system apenas.** Zero classe Tailwind inventada para componente que
   já existe no DS. Importe os componentes listados na §8. Copy 100 % pt-BR.
4. **Segurança copiada verbatim.** O boilerplate de cada server action
   (`"use server"` + `requireRole(ctx, "coordenador")` em try/catch +
   `withTenant` + advisory lock `pg_advisory_xact_lock(hashtextextended(...))`
   + re-checagem de precondição + escrita inline no `audit_log`) é **cópia
   fiel** do irmão `validacao/actions.ts`. Não simplifique, não remova o lock,
   não pule a auditoria.
5. **Queries fora de `"use server"`.** Helpers que recebem `ctx` vivem em
   `queries.ts` com `import "server-only"` no topo — **sem** a diretiva
   `"use server"`. Export em módulo `"use server"` é endpoint RPC candidato =
   bypass de RLS. Nunca exporte helper ctx-accepting de um módulo `"use server"`.
6. **Concorrência do repo: NÃO há coluna `versao`/OCC.** O controle é
   `pg_advisory_xact_lock(hashtextextended(patient_id::text, 0))` + re-leitura
   da precondição de status dentro da transação; violação retorna a **string
   literal** `"CONCURRENCY_ERROR"` no campo `error`. Copie esse padrão; não
   invente OCC.
7. **Pronto = verde de verdade.** Antes de dizer "concluído", rode e cole a
   saída de: `pnpm typecheck`, `pnpm lint`, `pnpm test` (suítes novas), e a
   suíte a11y. "Deve passar" não conta — mostre a saída real. Se um teste falha,
   diga qual e cole o erro; nunca afirme conclusão parcial como completa.

**Comandos:** `pnpm typecheck` · `pnpm lint` · `pnpm test` · testes de
integração exigem `DATABASE_URL` + `MIGRATION_DATABASE_URL` (Postgres local via
`docker compose -f infra/docker-compose.yml up -d`, porta 5433).

---

## 1. Contexto & escopo

Primeira fatia de **supervisão de equipe** da Fase 5 (Issue #8). Superfície
única para o coordenador: uma **fila de alertas** derivada de sinais que já
existem no dado, com ciclo de vida auditável (reconhecer / resolver / descartar).

**Entra (2 tipos de alerta, dado 100 % pronto):**

- **Estagnação** e **Regressão** clínica — lidos do `session_snapshot.segmentacao`
  (Fase 4, cálculo determinístico já materializado). Alerta **por-paciente**,
  localizado em `(goal_id, protocol_id)`.
- **Faltas excessivas** — contagem de `session.estado = 'falta_paciente'` na
  janela configurável da clínica. Alerta **por-paciente**.

**Decisões travadas (sessão 20/07/2026):**

| Decisão | Valor |
| --- | --- |
| Tipos de alerta | estagnação + regressão + faltas_excessivas |
| Eixo | **só por-paciente** (faltas = `falta_paciente`; `falta_terapeuta` fora) |
| Ciclo de vida | workflow com estado + nota + auditoria |
| Limiar de faltas | **configurável por clínica** (`clinic.faltas_limiar`, `clinic.faltas_janela_semanas`; defaults 3 / 4) |
| Janela de estagnação (W) | fixa no código (default 5, herdada da Fase 4) |
| Concorrência | advisory lock + re-check (padrão do repo), sem coluna `versao` |
| Visibilidade | coordenador-only |

**Modelo de ciclo de vida (crucial — leia com atenção):**

- Os **sinais são derivados ao vivo** a cada carregamento da página (query
  read-only). Nunca são materializados por um job nem escritos no render.
- A tabela `alerta` é um **livro-razão de decisão**, escrito **somente pelas
  server actions**. Uma linha registra a decisão humana, não o sinal.
- **`novo`** = existe sinal vivo **sem** linha de `alerta` (não-deletada) para
  a mesma `chave_natural`.
- **`reconhecido`** = existe linha com `status='reconhecido'` ("estou ciente,
  tratando").
- **`resolvido` / `descartado`** = linhas terminais. Uma linha terminal
  **suprime** o re-alerta daquela `chave_natural` (via índice único parcial).
- **Auto-resolve** não é escrita silenciosa: se um sinal some, ele apenas deixa
  de aparecer como `novo`. Se estava `reconhecido` e o sinal cessou, a UI marca
  **"sinal cessou"** e o coordenador resolve num clique (fica na auditoria).

**Adiado deliberadamente (registrar no BACKLOG ao fechar):**

- **Incidente grave** — sem fonte no modelo de dados; exige definição/DDL própria.
- **Auto-close automático / cron** de reconciliação — v1 é derivado ao vivo.
- **Re-alerta de condição que persiste após resolução** — a `chave_natural` v1
  não tem bucket temporal, então uma condição resolvida fica suprimida
  indefinidamente. **Atenção especial a faltas**: paciente que segue faltando
  após um "resolvido" não re-alerta até intervenção manual. Aceito na v1.
- **W de estagnação configurável por clínica** — fica no código.
- **Alertas por-terapeuta** (visão de gestão de equipe).
- **Reabertura de alerta** terminal.

---

## 2. Divisão de trabalho + fronteira de arquivos

### Claude entrega (schema — §3, NÃO TOCAR)

- `src/db/schema.ts` — tabela `alerta`, enums `alerta_tipo`/`alerta_status`,
  colunas `clinic.faltas_limiar`/`faltas_janela_semanas`.
- `db/migrations/00XX_*.sql` (gerada) + `db/migrations/00XX_fase5_supervisao_rls.sql` (mão).
- Aplicada localmente + `test:rls` verde antes do handoff ao Gemini.

### Gemini implementa (camada de app)

| Arquivo | Papel | Arquivo-irmão a espelhar |
| --- | --- | --- |
| `src/lib/supervisao/sinais.ts` | Funções **puras**: derivação de sinais + `chaveNatural` | `src/lib/agenda/*.ts` (lógica pura) |
| `src/lib/supervisao/sinais.test.ts` | Unit dos sinais puros | qualquer `*.test.ts` de lógica pura |
| `src/app/(app)/supervisao/queries.ts` | Query ctx-accepting (`import "server-only"`) | `validacao/queries.ts` |
| `src/app/(app)/supervisao/queries.int.test.ts` | Int da query (derivação + overlay) | `validacao/queries.int.test.ts` |
| `src/app/(app)/supervisao/actions.ts` | 3 server actions + wrappers | `validacao/actions.ts` |
| `src/app/(app)/supervisao/actions.int.test.ts` | Int das actions (role gate, precondição, audit) | `validacao/actions.int.test.ts` |
| `src/app/(app)/supervisao/page.tsx` | Server component (guard + query + render) | `validacao/page.tsx` |
| `src/app/(app)/supervisao/supervisao-fila.tsx` | Client component (fila + ações) | `validacao/validacao-fila.tsx` |
| `src/app/(app)/supervisao/a11y.test.tsx` | axe sobre o client component | `validacao/a11y.test.tsx` |
| `src/app/(app)/layout.tsx` | **1 linha**: link "Supervisão" (§8.3) | o próprio (link "Validação") |

---

## 3. Schema fornecido (Claude entrega — referência, NÃO TOCAR)

### 3.1 Enums

```sql
CREATE TYPE alerta_tipo   AS ENUM ('estagnacao', 'regressao', 'faltas_excessivas');
CREATE TYPE alerta_status AS ENUM ('reconhecido', 'resolvido', 'descartado');
```

`novo` **não** é valor de enum — é a ausência de linha viva.

### 3.2 Tabela `alerta`

```sql
CREATE TABLE alerta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL,
  patient_id     uuid NOT NULL,
  tipo           alerta_tipo   NOT NULL,
  status         alerta_status NOT NULL,
  chave_natural  text NOT NULL,
  goal_id        uuid,
  protocol_id    uuid,
  detalhe        jsonb NOT NULL,
  nota           text,          -- preenchido em resolver
  motivo         text,          -- preenchido em descartar
  criado_por     uuid NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  deletado_em    timestamptz,   -- soft-delete (paridade RLS)
  CONSTRAINT alerta_patient_fk FOREIGN KEY (patient_id, clinic_id)
    REFERENCES patient (id, clinic_id),
  CONSTRAINT alerta_clinic_fk    FOREIGN KEY (clinic_id)   REFERENCES clinic (id),
  CONSTRAINT alerta_goal_fk      FOREIGN KEY (goal_id)     REFERENCES goal (id),
  CONSTRAINT alerta_protocol_fk  FOREIGN KEY (protocol_id) REFERENCES protocol (id),
  CONSTRAINT alerta_criado_fk    FOREIGN KEY (criado_por)     REFERENCES app_user (id),
  CONSTRAINT alerta_atualizado_fk FOREIGN KEY (atualizado_por) REFERENCES app_user (id),
  -- localizador clínico obrigatório p/ estagnação/regressão, ausente p/ faltas:
  CONSTRAINT alerta_locator CHECK (
    (tipo = 'faltas_excessivas' AND goal_id IS NULL AND protocol_id IS NULL)
    OR (tipo IN ('estagnacao','regressao') AND goal_id IS NOT NULL AND protocol_id IS NOT NULL)
  )
);

-- 1 alerta vivo por condição (dedupe + supressão pós-terminal):
CREATE UNIQUE INDEX alerta_chave_uk ON alerta (chave_natural) WHERE deletado_em IS NULL;
-- fila do coordenador:
CREATE INDEX alerta_fila ON alerta (clinic_id, status) WHERE deletado_em IS NULL;
```

### 3.3 Config de clínica

```sql
ALTER TABLE clinic ADD COLUMN faltas_limiar          integer NOT NULL DEFAULT 3;
ALTER TABLE clinic ADD COLUMN faltas_janela_semanas  integer NOT NULL DEFAULT 4;
```

Drizzle (referência de leitura — a coluna já existe em `schema.ts`):
`faltasLimiar: integer("faltas_limiar").notNull().default(3)` ·
`faltasJanelaSemanas: integer("faltas_janela_semanas").notNull().default(4)`.

### 3.4 RLS (referência)

Espelha `report` (F0). Coordenador vê toda a clínica; soft-delete via
`deletado_em`; grants explícitos (tabela nova não herda o grant blanket).

```sql
CREATE OR REPLACE FUNCTION app_alerta_visivel(p_alerta uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM alerta a
    WHERE a.id = p_alerta AND a.deletado_em IS NULL
      AND app_patient_in_clinic(a.patient_id)
      AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(a.patient_id))
  );
$$;
REVOKE ALL ON FUNCTION app_alerta_visivel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_alerta_visivel(uuid) TO app_role;

GRANT SELECT, INSERT, UPDATE ON alerta TO app_role;
ALTER TABLE alerta ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerta FORCE  ROW LEVEL SECURITY;
CREATE POLICY alerta_scope ON alerta FOR ALL TO app_role
  USING (
    deletado_em IS NULL
    AND app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  )
  WITH CHECK (
    app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  );
```

---

## 4. Camada pura — `src/lib/supervisao/sinais.ts`

Funções **sem I/O** (sem DB, sem `now()` interno — o tempo entra por parâmetro).
Testáveis isoladamente.

### 4.1 Tipos

```ts
export type SinalTipo = "estagnacao" | "regressao" | "faltas_excessivas";

export type DetalheEstagnacao = {
  metrica: string;        // segmentacao[goal][protocol].metrica
  tipoEstrutura: string;  // segmentacao[goal][protocol].tipo_estrutura
  sessionNumero: number;  // snapshot que gerou o sinal
};
export type DetalheFaltas = {
  faltas: number;
  janelaSemanas: number;
  limiar: number;
};

// Sinal "cru" antes de enriquecer com nomes (nomes são resolvidos na query layer):
export type SinalCru = {
  tipo: SinalTipo;
  patientId: string;
  goalId: string | null;
  protocolId: string | null;
  detalhe: DetalheEstagnacao | DetalheFaltas;
};
```

### 4.2 `chaveNatural`

Determinística. Identifica uma condição. Terminalizar uma chave suprime
re-alerta dela.

```ts
export function chaveNatural(s: Pick<SinalCru, "tipo" | "patientId" | "goalId" | "protocolId">): string {
  return s.tipo === "faltas_excessivas"
    ? `faltas_excessivas:${s.patientId}`
    : `${s.tipo}:${s.patientId}:${s.goalId}:${s.protocolId}`;
}
```

### 4.3 `sinaisDeSnapshot`

Recebe as linhas de `session_snapshot` (o **último** snapshot por paciente já
selecionado pela query) e emite um sinal por `(goal, protocol)` cujo
`rotulo ∈ {estagnacao, regressao}`.

**Forma do JSONB `segmentacao`** (confirmada no schema): 
`{ [goalId]: { [protocolId]: { tipo_estrutura: string, metrica: string, rotulo: string } } }`
— `rotulo ∈ "evolucao" | "estagnacao" | "regressao" | "aguardando_avaliacao_formal" | "sem_dado"`.

```ts
export type SnapshotRow = {
  patientId: string;
  sessionNumero: number;
  segmentacao: Record<string, Record<string, { tipo_estrutura: string; metrica: string; rotulo: string }>>;
};

export function sinaisDeSnapshot(rows: SnapshotRow[]): SinalCru[]
```

Regra: para cada row, para cada `goalId`, para cada `protocolId`, se
`rotulo === "estagnacao" || rotulo === "regressao"`, emitir:
```ts
{ tipo: rotulo, patientId, goalId, protocolId,
  detalhe: { metrica, tipoEstrutura: tipo_estrutura, sessionNumero } }
```
Ignorar os demais rótulos. Ordem de saída determinística (ordenar por
`patientId`, depois `goalId`, depois `protocolId`).

### 4.4 `sinaisDeFaltas`

Recebe contagens por paciente (a janela de data é aplicada na **query**, não
aqui) + a config, e emite um sinal por paciente cuja contagem `>= limiar`.

```ts
export type FaltaCount = { patientId: string; faltas: number };

export function sinaisDeFaltas(
  counts: FaltaCount[],
  cfg: { limiar: number; janelaSemanas: number },
): SinalCru[]
```

Regra: para cada `{ patientId, faltas }` com `faltas >= cfg.limiar`, emitir:
```ts
{ tipo: "faltas_excessivas", patientId, goalId: null, protocolId: null,
  detalhe: { faltas, janelaSemanas: cfg.janelaSemanas, limiar: cfg.limiar } }
```

---

## 5. Query — `src/app/(app)/supervisao/queries.ts`

`import "server-only";` no topo. **Não** é módulo `"use server"`. Espelha
`validacao/queries.ts` (usa `withTenant(ctx, async (tx) => …)`, SQL cru via
`tx.execute(sql\`…\`)`, mapeia snake→camel).

### 5.1 Tipo de saída

```ts
export type ItemSupervisao = {
  chaveNatural: string;
  tipo: SinalTipo;
  patientId: string;
  patientNome: string;
  goalId: string | null;
  protocolId: string | null;
  goalNome: string | null;      // resolvido p/ estagnação/regressão
  protocolNome: string | null;  // idem
  detalhe: DetalheEstagnacao | DetalheFaltas;
  estado: "novo" | "reconhecido";
  alertaId: string | null;      // linha de livro-razão, se houver
  sinalPresente: boolean;       // false ⇒ reconhecido mas sinal cessou ("sinal cessou")
};

export async function listarSupervisao(
  ctx: TenantContext,
): Promise<{ itens: ItemSupervisao[]; total: number }>;
```

### 5.2 Algoritmo de `listarSupervisao`

Tudo dentro de um `withTenant(ctx, async (tx) => { … })`:

1. **Config da clínica** — `SELECT faltas_limiar, faltas_janela_semanas FROM clinic WHERE id = current_setting('app.clinic_id')::uuid`.
2. **Sinais de snapshot** — selecionar o **último** `session_snapshot` por
   paciente (maior `session_numero`) com seu `segmentacao`, + nome do paciente:
   ```sql
   SELECT DISTINCT ON (ss.patient_id)
          ss.patient_id, ss.session_numero, ss.segmentacao, p.nome AS patient_nome
   FROM session_snapshot ss
   JOIN patient p ON p.id = ss.patient_id
   ORDER BY ss.patient_id, ss.session_numero DESC
   ```
   Passar as linhas por `sinaisDeSnapshot(...)`.
3. **Sinais de faltas** — contar faltas na janela:
   ```sql
   SELECT s.patient_id, COUNT(*)::int AS faltas
   FROM session s
   WHERE s.estado = 'falta_paciente'
     AND s.agendada_para >= now() - make_interval(weeks => ${janelaSemanas})
   GROUP BY s.patient_id
   ```
   Passar por `sinaisDeFaltas(counts, { limiar, janelaSemanas })`.
4. **Enriquecer nomes** — para os sinais clínicos, resolver `goalNome`
   (`goal`) e `protocolNome` (`protocol`); para o `patientNome` dos sinais de
   faltas, resolver via `patient`.
5. **Overlay do livro-razão** — carregar as linhas de `alerta` vivas
   (`deletado_em IS NULL`) da clínica:
   ```sql
   SELECT id, chave_natural, status, patient_id FROM alerta WHERE deletado_em IS NULL
   ```
   Indexar por `chave_natural`. Para cada sinal vivo, calcular `chaveNatural`:
   - linha terminal (`resolvido`/`descartado`) para a chave ⇒ **excluir** o
     sinal da fila (suprimido).
   - linha `reconhecido` ⇒ `estado="reconhecido"`, `alertaId=<id>`, `sinalPresente=true`.
   - sem linha ⇒ `estado="novo"`, `alertaId=null`, `sinalPresente=true`.
6. **Sinal cessou** — para cada linha `alerta` `status='reconhecido'` cuja
   `chave_natural` **não** está entre os sinais vivos: emitir um `ItemSupervisao`
   com `sinalPresente=false`, `estado="reconhecido"`, reconstruindo
   `tipo/patientId/goal/protocol/detalhe` a partir da própria linha (colunas +
   `detalhe` jsonb) e resolvendo nomes.
7. **Ordenar** determinístico: novos primeiro, depois reconhecidos; dentro de
   cada, por `patientNome`. `total = itens.length`.

> **Nota de custo (documentar, não otimizar agora):** varre o último snapshot
> de todos os pacientes da clínica. Aceito na v1 (mesma postura on-demand da
> Agenda 2.0). Índice/materialização fica para depois.

---

## 6. Actions — `src/app/(app)/supervisao/actions.ts`

`"use server";` na linha 1. Espelha `validacao/actions.ts`. **Sem coluna
`versao`.** Concorrência = advisory lock em `patient_id` + re-checagem de
precondição de status.

### 6.1 Tipos

```ts
export type SupervisaoResult = { ok?: boolean; error?: string };
export type SupervisaoState  = { ok?: boolean; error?: string };

// input das actions carrega o snapshot do sinal (a linha é criada a partir dele):
type BaseInput = {
  chaveNatural: string;
  tipo: SinalTipo;
  patientId: string;
  goalId: string | null;
  protocolId: string | null;
  detalhe: Record<string, unknown>;
};
```

Zod (mirror do estilo `invalidarSchema`): `chaveNatural` min 1; `tipo` enum;
`patientId` uuid; `goalId`/`protocolId` `.uuid().nullable()`; `detalhe`
`z.record(z.unknown())`; `nota`/`motivo` `z.string().trim().min(1, "…")`.

### 6.2 Precondições (re-check sob o lock)

| Action | Linha existente (viva) | Efeito |
| --- | --- | --- |
| `reconhecerAlerta` | nenhuma | INSERT status `reconhecido` |
| `reconhecerAlerta` | qualquer | `CONCURRENCY_ERROR` |
| `resolverAlerta` | nenhuma | INSERT status `resolvido` (+ `nota`) |
| `resolverAlerta` | `reconhecido` | UPDATE → `resolvido` (+ `nota`) |
| `resolverAlerta` | terminal | `CONCURRENCY_ERROR` |
| `descartarAlerta` | nenhuma | INSERT status `descartado` (+ `motivo`) |
| `descartarAlerta` | `reconhecido` | UPDATE → `descartado` (+ `motivo`) |
| `descartarAlerta` | terminal | `CONCURRENCY_ERROR` |

### 6.3 Boilerplate (mostrado por inteiro — `reconhecerAlerta`)

```ts
"use server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";

const reconhecerSchema = z.object({
  chaveNatural: z.string().min(1),
  tipo: z.enum(["estagnacao", "regressao", "faltas_excessivas"]),
  patientId: z.string().uuid(),
  goalId: z.string().uuid().nullable(),
  protocolId: z.string().uuid().nullable(),
  detalhe: z.record(z.unknown()),
});

export async function reconhecerAlerta(
  ctx: TenantContext,
  input: BaseInput,
): Promise<SupervisaoResult> {
  const p = reconhecerSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  return withTenant(ctx, async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${p.data.patientId}::text, 0))`,
    );
    const existentes = (await tx.execute(
      sql`SELECT status FROM alerta WHERE chave_natural = ${p.data.chaveNatural} AND deletado_em IS NULL`,
    )) as unknown as { status: string }[];
    if (existentes.length > 0) return { error: "CONCURRENCY_ERROR" };

    const inserida = (await tx.execute(sql`
      INSERT INTO alerta
        (clinic_id, patient_id, tipo, status, chave_natural, goal_id, protocol_id, detalhe, criado_por, atualizado_por)
      VALUES
        (${ctx.clinicId}::uuid, ${p.data.patientId}::uuid, ${p.data.tipo}, 'reconhecido',
         ${p.data.chaveNatural}, ${p.data.goalId}::uuid, ${p.data.protocolId}::uuid,
         ${JSON.stringify(p.data.detalhe)}::jsonb, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      RETURNING id
    `)) as unknown as { id: string }[];

    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, 'reconhecimento_alerta', 'alerta',
              ${inserida[0]!.id}::uuid, ${p.data.patientId}::uuid,
              jsonb_build_object('chave_natural', ${p.data.chaveNatural}::text, 'tipo', ${p.data.tipo}::text))
    `);
    return { ok: true };
  });
}
```

`resolverAlerta` / `descartarAlerta`: mesma abertura; sob o lock, `SELECT
id, status FROM alerta WHERE chave_natural = … AND deletado_em IS NULL`:

- 0 linhas → INSERT com o status alvo (`resolvido`/`descartado`) preenchendo
  `nota`/`motivo`; `audit_log` com `entidade_id` = id inserido.
- 1 linha `reconhecido` → `UPDATE alerta SET status='resolvido', nota=${nota},
  atualizado_por=${ctx.userId}::uuid, atualizado_em=now() WHERE id=…`; audit com
  esse id.
- 1 linha terminal → `{ error: "CONCURRENCY_ERROR" }`.

`acao` do audit: `'reconhecimento_alerta'` | `'resolucao_alerta'` |
`'descarte_alerta'`. `entidade='alerta'`.

### 6.4 Camada wrapper (`useActionState`) — mirror de `validacao/actions.ts:245-304`

```ts
async function comCtx(fn: (ctx: TenantContext) => Promise<SupervisaoResult>): Promise<SupervisaoState> {
  try {
    const ctx = await getTenantContext();
    const r = await fn(ctx);
    if (r.ok) revalidatePath("/supervisao");
    return r;
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }
}

export async function reconhecerAlertaAction(_prev: SupervisaoState, fd: FormData): Promise<SupervisaoState> {
  return comCtx((ctx) => reconhecerAlerta(ctx, {
    chaveNatural: String(fd.get("chaveNatural") ?? ""),
    tipo: String(fd.get("tipo") ?? "") as SinalTipo,
    patientId: String(fd.get("patientId") ?? ""),
    goalId: (fd.get("goalId") ? String(fd.get("goalId")) : null),
    protocolId: (fd.get("protocolId") ? String(fd.get("protocolId")) : null),
    detalhe: JSON.parse(String(fd.get("detalhe") ?? "{}")),
  }));
}
// resolverAlertaAction: idem + nota = String(fd.get("nota") ?? "")
// descartarAlertaAction: idem + motivo = String(fd.get("motivo") ?? "")
```

---

## 7. Página — `src/app/(app)/supervisao/page.tsx`

Server component. Mirror de `validacao/page.tsx`:

```ts
export default async function SupervisaoPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();
  const { itens } = await listarSupervisao(ctx);
  return (
    <Stack gap="lg">
      <h1 className="font-display text-ink-anchor text-3xl font-bold">Supervisão</h1>
      <SupervisaoFila itens={itens} />
    </Stack>
  );
}
```

---

## 8. UI — `src/app/(app)/supervisao/supervisao-fila.tsx`

`"use client"`. Mirror estrutural de `validacao-fila.tsx`.

### 8.1 Componentes do DS (imports exatos)

- `{ Stack, Cluster }` — `@/components/ui/layout`
- `{ Button }` — `@/components/ui/button` (`variante`: `"primaria"|"secundaria"|"terciaria"`)
- `{ Alert }` — `@/components/ui/alert` (`severidade` **confirmadas**: `"erro"|"sucesso"`; `titulo`. Se o DS tiver mais severidades, use conforme o irmão — não invente)
- `{ Chip, ChipGroup }` — `@/components/ui/chip`
- `{ Field }` — `@/components/ui/field` (`label`, `htmlFor`)
- `{ Input }` — `@/components/ui/input`
- `{ Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose }` — `@/components/ui/dialog`
- `{ surface }` — `@/components/ui/primitives/surface`
- `{ cn }` — `@/lib/cn`

> Confirme os nomes/severidades reais no arquivo-irmão antes de usar; se uma
> `severidade` (ex. `"aviso"`) não existir, use a que existir. Não invente prop.

### 8.2 Estrutura & a11y

- `SupervisaoFila({ itens })`: `useState<Set<string>>` de chaves resolvidas
  localmente (some da lista após ação com `r.ok`). Vazio → `<Alert
  severidade="sucesso" titulo="Nada a supervisionar">`. Senão `<Stack gap="md"
  como="ul">` de `<ItemCard>`.
- `ItemCard({ item })`: um `<Stack como="li">` (`surface("solida")`). Mostra:
  - **nome do paciente** (link `/pacientes/${patientId}/timeline`).
  - **badge do tipo** via `Chip`: "Estagnação" | "Regressão" | "Faltas".
  - **detalhe legível**:
    - estagnação/regressão: `"{goalNome} — {protocolNome}: {rotulo} (métrica {metrica}, sessão {sessionNumero})"`.
    - faltas: `"{faltas} faltas do paciente nas últimas {janelaSemanas} semanas (limiar {limiar})"`.
  - se `sinalPresente === false`: `Chip` "sinal cessou" + oferecer só a
    ação **Resolver**.
  - ações contextuais por `estado`:
    - `novo`: **Reconhecer** · **Resolver** (Dialog c/ `Field`+`Input` nota) · **Descartar** (Dialog c/ motivo).
    - `reconhecido`: **Resolver** · **Descartar**.
  - cada ação = um `useActionState(<action>Action, { })`; um `<form>` com hidden
    inputs `chaveNatural`, `tipo`, `patientId`, `goalId`, `protocolId`,
    `detalhe` (`JSON.stringify(item.detalhe)`), + `nota`/`motivo` quando aplicável.
    Em `r.ok` → remove o item da lista local.
  - a11y: `ul`/`li` via `como`; ids únicos por item
    (`htmlFor={\`nota-${item.chaveNatural}\`}`); labels via `Field`; aria dos
    Dialogs herdado dos primitivos. Sem checkbox/bulk.
- `error` de uma ação → `<Alert severidade="erro">` com a mensagem (incl. o
  literal `CONCURRENCY_ERROR` → renderizar copy amigável: "Este alerta mudou.
  Recarregue a página.").

### 8.3 Link no shell — `src/app/(app)/layout.tsx` (única edição fora da pasta)

Inserir **logo após** o bloco do link "Validação" (coordenador-only),
espelhando-o:

```tsx
{ctx.role === "coordenador" ? (
  <Link
    href="/supervisao"
    className="inline-block font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline transition-transform duration-100 ease-out hover:-translate-y-0.5"
  >
    Supervisão
  </Link>
) : null}
```

---

## 9. Testes

### 9.1 `src/lib/supervisao/sinais.test.ts` (unit, puro — sem DB)

Casos obrigatórios:

1. `sinaisDeSnapshot` emite um sinal `estagnacao` para leaf com `rotulo="estagnacao"`.
2. `sinaisDeSnapshot` emite `regressao` para `rotulo="regressao"`.
3. `sinaisDeSnapshot` **ignora** `evolucao`/`sem_dado`/`aguardando_avaliacao_formal`.
4. `sinaisDeSnapshot` com múltiplos goals/protocols → um sinal por par sinalizado, ordem determinística.
5. `sinaisDeFaltas` emite quando `faltas >= limiar`; **não** emite quando `< limiar`.
6. `sinaisDeFaltas` no limite exato (`faltas === limiar`) → emite.
7. `chaveNatural` estável e distinta: estagnação vs regressão do mesmo par → chaves diferentes; faltas depende só do paciente.

### 9.2 `src/app/(app)/supervisao/queries.int.test.ts` (integração)

Setup mirror de `validacao/*.int.test.ts`: `vi.mock("server-only", () => ({}))`;
`describe.skipIf(!hasDb)`; conexão `owner` (bypassa RLS) p/ seed; `TRUNCATE …
RESTART IDENTITY CASCADE`; insert em ordem de dependência (`clinic` → `app_user`
→ `user_role` → `patient` → `session` → … → `session_snapshot` com
`segmentacao` fabricado; `protocol_familia_catalogo` → `protocol` → `goal`).
`ctxCoord = { clinicId, userId, role: "coordenador" } as const`.

Casos obrigatórios:

1. Snapshot com `estagnacao` + sem linha `alerta` → item `estado="novo"`.
2. Faltas `>= limiar` na janela → item de faltas `novo`; faltas `< limiar` → nenhum item.
3. Faltas fora da janela (mais velhas que `janela_semanas`) não contam.
4. Linha `alerta` `reconhecido` p/ a chave → item `estado="reconhecido"`, `alertaId` preenchido.
5. Linha `alerta` `resolvido` p/ a chave → sinal **suprimido** (não aparece).
6. Linha `reconhecido` cuja condição não é mais sinal vivo → item `sinalPresente=false`.
7. Isolamento: sinal de paciente de **outra** clínica não aparece p/ `ctxCoord`.

### 9.3 `src/app/(app)/supervisao/actions.int.test.ts` (integração)

Casos obrigatórios (assertar via `owner` o estado da linha + `audit_log`):

1. `reconhecerAlerta` (coordenador) → linha `reconhecido` + `audit_log('reconhecimento_alerta','alerta')`.
2. `reconhecerAlerta` com terapeuta (`ctxTerapeuta`) → `{ error }` (RoleError), nenhuma linha.
3. `reconhecerAlerta` 2× mesma chave → 2ª retorna `CONCURRENCY_ERROR`, sem 2ª linha.
4. `resolverAlerta` sem linha prévia → INSERT `resolvido` + `nota` gravada + audit `resolucao_alerta`.
5. `resolverAlerta` sobre `reconhecido` → UPDATE `resolvido`, `atualizado_por` = coordenador.
6. `resolverAlerta` sobre linha terminal → `CONCURRENCY_ERROR`.
7. `descartarAlerta` sem linha → INSERT `descartado` + `motivo` + audit `descarte_alerta`.
8. Após `resolver`, a mesma chave fica suprimida em `listarSupervisao` (integração cruzada opcional).

### 9.4 `src/app/(app)/supervisao/a11y.test.tsx`

Mirror de `validacao/a11y.test.tsx`: mockar `./actions` (todos os `*Action`
como `vi.fn(async () => ({}))`), renderizar `SupervisaoFila` com fixtures
`VAZIA` e `CHEIA` (uma de cada tipo, incl. um `sinalPresente=false`), rodar
`axe.run` com `runOnly` wcag2a/2aa/21a/21aa e `rules` desabilitando
`region`/`landmark-one-main`/`page-has-heading-one`/`color-contrast`; assertar
`violations` `toEqual([])`.

---

## 10. Checklist de aceite (o tech-validador Claude roda antes da PR)

- [ ] `pnpm typecheck` limpo
- [ ] `pnpm lint` limpo
- [ ] `src/lib/supervisao/sinais.test.ts` verde (7 casos §9.1)
- [ ] `supervisao/queries.int.test.ts` verde (7 casos §9.2)
- [ ] `supervisao/actions.int.test.ts` verde (8 casos §9.3)
- [ ] `supervisao/a11y.test.tsx` verde
- [ ] `git diff --stat` = **só** os arquivos da §2 (schema/migração/RLS intactos)
- [ ] Nenhum export ctx-accepting em módulo `"use server"`
- [ ] `CONCURRENCY_ERROR` retornado nas precondições da §6.2
- [ ] Auditoria escrita em toda ação (3 `acao` distintas)
- [ ] Copy 100 % pt-BR; zero classe inventada fora do DS

---

## 11. Adiado / dívidas (registrar no BACKLOG ao fechar a fatia)

- Incidente grave (sem fonte no modelo).
- Auto-close automático / cron de reconciliação.
- Re-alerta de condição persistente pós-resolução (chave com bucket temporal) —
  **atenção a faltas** (paciente que segue faltando não re-alerta).
- W de estagnação configurável por clínica.
- Alertas por-terapeuta.
- Reabertura de alerta terminal.
- Custo de varredura do último snapshot de todos os pacientes (índice/materialização).
```
