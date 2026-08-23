# D36 — Faixa de alerta de cobrança recusada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que uma cobrança recusada apareça na interface da clínica — causa, o que fazer e quanto tempo resta até o corte — em vez de correr a carência inteira em silêncio.

**Architecture:** Uma consulta nova lê o **ciclo mais recente** da clínica; se ele estiver em `falhou`, a política já classificada pela #318 (`classificarRecusa`) vira um aviso montado por uma função **pura** (copy + CTA + relógio de carência), renderizado por um componente novo acima da `FaixaTrial` no layout do app. Nenhuma migração: `billing_cycle.recusa_codigo` (0100) e `subscription.past_due_desde`/`carencia_dias` (0071) já têm `SELECT` para `app_role`, e as policies `billing_cycle_select`/`subscription_select` (0085) já resolvem o tenant pelo helper.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, TypeScript, Drizzle (`sql` template dentro de `withTenant`), Vitest + Testing Library, Postgres com RLS.

**Spec:** `BACKLOG.md`, linha **D36** (tabela de débitos) — mais as decisões desta sessão registradas em "Decisões fechadas" abaixo. Contexto de origem: #318 (classificação em 9 grupos), #319 (`past_due` + corte por carência), #312 (aviso por e-mail), #322 (retentativa automática).

---

## Global Constraints

- **Escopo: Opção B (decidida pelo Rômulo em 17/08/2026).** D36 é **exclusivamente** a faixa de alerta de recusa na UI. O mostrador detalhado de retentativas (histórico de cobranças, tentativas gastas, próximas datas) é **issue separada** — não entra aqui.
- **Nunca expor o código cru do gateway na tela.** Regra do cabeçalho de `classificacao-recusa.ts`: "dizer o que fazer e onde, nunca o código". O código cru fica em `billing_cycle.recusa_codigo` e no log.
- **Nunca citar valor de mensalidade nem de teto na copy da recusa.** O teto do Pix Automático é ilegível por regulação (memória `pix-automatico-teto-bacen-obrigatorio`).
- **`variant="alerta"` é proibido aqui.** `alerta` carrega `role="alert"`, reservado ao risco clínico (`faixa-trial.tsx`, `pacientes/[id]/layout.tsx`). A faixa de recusa usa `variant="info"` + `formato="padrao"` + `titulo` — urgência visual sem interromper leitor de tela por cobrança.
- **A faixa de recusa NÃO é dismissible.** É o único aviso antes de um corte irreversível (a revogação da autorização de Pix Automático não volta sem novo consentimento no app do banco).
- **Copy e documentação em pt-BR. Mensagens de commit em inglês** (`docs/arquitetura/convencoes-de-codigo.md`).
- **`src/lib/billing/recusa-ui.ts` NÃO pode importar `server-only`** — ele é consumido por componente e por teste de componente. `classificacao-recusa.ts` já é livre de `server-only`; manter assim.
- **Testes `*.int.test.ts` só rodam com config própria:** `pnpm vitest run --config vitest.integration.config.ts <arquivo>`. `vitest run` sozinho coleta **zero** e sai verde (memória `vitest-int-test-coleta-zero`) — conferir a contagem, não o verde.
- **Nenhuma migração nova.** Se o executor achar que precisa de DDL, parar e reportar: os grants já existem (0071 `GRANT SELECT ON subscription/billing_cycle TO app_role`; 0100 `GRANT SELECT ("recusa_codigo")`).
- **Formatação:** rodar Prettier **só nos arquivos tocados** (`pnpm prettier --write <arquivos>`), nunca `pnpm format` (reformata o repo inteiro — memória `pnpm-format-reformata-repo-inteiro`).
- **Gate final:** `pnpm typecheck && pnpm lint && pnpm test` verdes, e o `.int.test.ts` novo rodado com a config de integração, com contagem de testes executados conferida.

## Decisões fechadas (§5.2 — antes de qualquer label `jules`)

| # | Ponto | Decisão |
|---|---|---|
| 1 | Tratamento visual/semântico | `Banner variant="info" formato="padrao" titulo="Cobrança recusada"`, **sem** `dismissible`. `role="status"`, não `alert`. |
| 2 | Relógio até o corte | **Sim** — dias restantes + data, derivados de `past_due_desde + carencia_dias`, em dias civis no timezone da clínica. |
| 3 | Grupos com `copy: null` (G0/G6/G7) | **Copy genérica de fallback.** Sem ela, o caminho do backstop de D+7 — que grava `status='falhou'` com `recusa_codigo = NULL` (`subscription.ts`, `carimbarPorPrazo`) → G0 → `copy: null` — continuaria mudo, que é exatamente o D36. |
| 4 | Dono da leitura | Server Component: `AppLayout` → `obterAvisoRecusa(ctx)` → `withTenant` → `obterRecusaAtiva(tx, clinicId)`. Mesma disciplina de `obterSituacaoConta`. |
| 5 | Régua de existência da faixa | Aparece quando o **ciclo mais recente** (`ORDER BY fim DESC LIMIT 1`) está em `falhou`. Não filtra por status da assinatura: G3 (`corteImediato`) não carimba `past_due` e precisa aparecer mesmo assim. Ciclo liquidado vira `pago` e a faixa some sozinha. |
| 6 | CTA por grupo | G3/G5 → "Ver assinatura" (`/assinatura`); G4 → "Corrigir dados da clínica" (`/clinica/dados`); G1/G2 → **sem CTA** (a ação é fora do Iris: limite/saldo no app do banco); fallback → "Ver assinatura". |
| 7 | Régua de mutação | Apagar o ramo de fallback de copy derruba **só** o caso G0; apagar a frase de prazo derruba **só** os testes de relógio; trocar `variant="info"` por `"alerta"` derruba o teste de `role`. |

## Limitação conhecida (documentar, não resolver aqui)

O layout não revalida em navegação client-side (memória `layout-nao-revalida-em-nav-client-side`, #285). O pagamento da recusa acontece **fora do Iris** (app do banco), então a faixa some no próximo carregamento de servidor, não no instante do pagamento. Não introduzir polling: é escopo da issue separada de retentativas. Registrar isso em comentário no componente.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/billing/recusa-ui.ts` **(criar)** | **Puro.** `montarAvisoRecusa(entrada) → AvisoRecusa`: escolhe copy (política ou fallback), CTA por grupo e a frase do relógio de carência. Sem I/O, sem `server-only`. |
| `src/lib/billing/recusa-ui.test.ts` **(criar)** | Unitários da regra: um caso por grupo com copy, fallback, CTA e as 4 formas da frase de prazo. |
| `src/lib/billing/recusa-ativa.ts` **(criar)** | `server-only`. `obterRecusaAtiva(tx, clinicId)`: uma consulta, ciclo mais recente + assinatura + timezone. Devolve `null` quando o ciclo mais recente não está em `falhou`. |
| `src/lib/billing/recusa-ativa.int.test.ts` **(criar)** | Integração com RLS: enxerga a própria clínica, não enxerga a de outro tenant, e devolve `null` quando o ciclo mais recente foi pago. |
| `src/components/app/faixa-recusa.tsx` **(criar)** | Renderiza o `AvisoRecusa`. Sem estado, sem `"use client"`. |
| `src/components/app/faixa-recusa.test.tsx` **(criar)** | Contrato de tela: `role="status"`, sem botão de dispensar, texto, prazo e CTA. |
| `src/app/(app)/queries.ts` **(modificar)** | `obterAvisoRecusa(ctx)`: abre a transação de tenant e compõe consulta + regra. |
| `src/app/(app)/layout.tsx` **(modificar)** | Adiciona a leitura ao `Promise.all` e renderiza a faixa **acima** da `FaixaTrial`. |
| `BACKLOG.md` **(modificar)** | Fecha D36 com o que passou a existir e o que ficou de fora. |

---

### Task 1: Regra pura do aviso (`recusa-ui.ts`)

**Files:**
- Create: `src/lib/billing/recusa-ui.ts`
- Test: `src/lib/billing/recusa-ui.test.ts`
- Ler antes (não modificar): `src/lib/billing/classificacao-recusa.ts` (tipos `GrupoRecusa`, `PoliticaRecusa`, função `classificarRecusa`), `src/lib/trial.ts:22-60` (padrão de dias civis com `Intl.DateTimeFormat("en-CA")`).

**Interfaces:**
- Consumes: `classificarRecusa(codigo: string | null): PoliticaRecusa` e `type GrupoRecusa` de `./classificacao-recusa`.
- Produces:
  ```ts
  export interface EntradaAvisoRecusa {
    recusaCodigo: string | null;
    statusAssinatura: string;
    pastDueDesde: Date | null;
    carenciaDias: number;
    timezone: string;
    agora?: Date;
  }
  export interface AvisoRecusa {
    grupo: GrupoRecusa;
    titulo: string;
    texto: string;
    prazo: string | null;
    ctaHref: string | null;
    ctaLabel: string | null;
  }
  export function montarAvisoRecusa(entrada: EntradaAvisoRecusa): AvisoRecusa;
  ```

- [ ] **Step 1: Write the failing test**

Criar `src/lib/billing/recusa-ui.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarAvisoRecusa } from "./recusa-ui";

/**
 * D36 — a metade "o que a clínica vê" da tabela da #318.
 *
 * A régua de mutação está no §5.2 do plano: apagar o ramo de fallback derruba
 * SÓ o caso G0; apagar a frase de prazo derruba SÓ os testes de relógio.
 */
const BASE = {
  statusAssinatura: "past_due",
  pastDueDesde: new Date("2026-08-01T12:00:00Z"),
  carenciaDias: 10,
  timezone: "America/Sao_Paulo",
  agora: new Date("2026-08-05T12:00:00Z"),
};

describe("montarAvisoRecusa", () => {
  it("usa a copy da política em G1 e não cita o código do gateway", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "MAXIMUM_AMOUNT_EXCEEDED",
    });

    expect(aviso.grupo).toBe("G1");
    expect(aviso.texto).toContain("limite que você definiu no app do seu banco");
    expect(aviso.texto).not.toContain("MAXIMUM_AMOUNT_EXCEEDED");
    // G1 não tem CTA: a ação é fora do Iris.
    expect(aviso.ctaHref).toBeNull();
  });

  it("manda para os dados da clínica em G4 (documento divergente)", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYER_CPF_CNPJ_MISMATCH",
    });

    expect(aviso.grupo).toBe("G4");
    expect(aviso.ctaHref).toBe("/clinica/dados");
    expect(aviso.ctaLabel).toBe("Corrigir dados da clínica");
  });

  it("manda para a assinatura em G3 (autorização morta)", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "RECURRING_PAYMENT_NOT_CONFIRMED",
      // G3 não carimba past_due: o desfecho dele é corte, não carência.
      statusAssinatura: "active",
      pastDueDesde: null,
    });

    expect(aviso.grupo).toBe("G3");
    expect(aviso.ctaHref).toBe("/assinatura");
    // Sem carência correndo, não há relógio para mostrar.
    expect(aviso.prazo).toBeNull();
  });

  it("usa copy genérica quando a política não tem copy (G0 do backstop)", () => {
    // `carimbarPorPrazo` grava `status='falhou'` com `recusa_codigo = NULL`.
    // Sem este ramo, o caminho MAIS silencioso do produto continua mudo.
    const aviso = montarAvisoRecusa({ ...BASE, recusaCodigo: null });

    expect(aviso.grupo).toBe("G0");
    expect(aviso.texto).toContain("Não conseguimos concluir a cobrança");
    expect(aviso.ctaHref).toBe("/assinatura");
  });

  it("conta os dias restantes de carência em dias civis, com a data", () => {
    // 01/08 + 10 dias = 11/08; em 05/08 restam 6 dias.
    const aviso = montarAvisoRecusa({ ...BASE, recusaCodigo: "PAYMENT_OVERDUE" });

    expect(aviso.prazo).toBe(
      "Sua assinatura será cancelada em 6 dias (11/08/2026) se o pagamento não for concluído.",
    );
  });

  it("usa singular no penúltimo dia", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      agora: new Date("2026-08-10T12:00:00Z"),
    });

    expect(aviso.prazo).toBe(
      "Sua assinatura será cancelada em 1 dia (11/08/2026) se o pagamento não for concluído.",
    );
  });

  it("diz 'hoje' no último dia", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      agora: new Date("2026-08-11T12:00:00Z"),
    });

    expect(aviso.prazo).toBe(
      "Sua assinatura será cancelada hoje (11/08/2026) se o pagamento não for concluído.",
    );
  });

  it("com o prazo vencido, diz que o cancelamento é iminente", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      agora: new Date("2026-08-14T12:00:00Z"),
    });

    expect(aviso.prazo).toBe(
      "O prazo para regularizar venceu em 11/08/2026: sua assinatura será cancelada na próxima verificação de cobrança.",
    );
  });

  it("não mostra relógio quando a assinatura não está em carência", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      statusAssinatura: "active",
      pastDueDesde: null,
    });

    expect(aviso.prazo).toBeNull();
  });

  it("nunca fala em valor de mensalidade ou de teto", () => {
    for (const codigo of [
      "MAXIMUM_AMOUNT_EXCEEDED",
      "PAYMENT_OVERDUE",
      "RECURRING_PAYMENT_NOT_CONFIRMED",
      "PAYER_CPF_CNPJ_MISMATCH",
      "ACCOUNT_CLOSED",
      null,
    ]) {
      const aviso = montarAvisoRecusa({ ...BASE, recusaCodigo: codigo });
      expect(aviso.texto).not.toMatch(/R\$|reais/i);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/billing/recusa-ui.test.ts`
Expected: FAIL — `Failed to resolve import "./recusa-ui"`.

> Se algum código do teste (`PAYER_CPF_CNPJ_MISMATCH`, `RECURRING_PAYMENT_NOT_CONFIRMED`, `ACCOUNT_CLOSED`) não estiver no `CATALOGO` de `classificacao-recusa.ts` com o grupo esperado, **corrigir o teste para o código real do catálogo**, nunca o catálogo. Conferir com `grep -n 'G[0-9]:' -A 3 src/lib/billing/classificacao-recusa.ts`.

- [ ] **Step 3: Write minimal implementation**

Criar `src/lib/billing/recusa-ui.ts`:

```ts
import {
  classificarRecusa,
  type GrupoRecusa,
} from "./classificacao-recusa";

/**
 * D36 — transforma a política já classificada pela #318 no que a clínica vê.
 *
 * **Puro de propósito, e sem `server-only`:** é consumido por componente e por
 * teste de componente. A #318 parou de propósito antes da tela ("não renderiza
 * nada; `copy` é o texto que a clínica deve ver quando a #312/D36 existir") —
 * este módulo é esse fechamento, e nada mais: nenhuma decisão de cobrança mora
 * aqui, só a redação.
 *
 * Duas regras herdadas do cabeçalho de `classificacao-recusa.ts` valem para
 * todo texto produzido aqui: **nunca o código cru do gateway** e **nunca
 * valor** (o teto do Pix Automático é ilegível por regulação).
 */

export interface EntradaAvisoRecusa {
  /** `billing_cycle.recusa_codigo` do ciclo mais recente, cru. */
  recusaCodigo: string | null;
  /** `subscription.status`. Só `past_due` faz o relógio de carência existir. */
  statusAssinatura: string;
  pastDueDesde: Date | null;
  carenciaDias: number;
  /** IANA da clínica: o prazo é contado em dias CIVIS, não em 24h. */
  timezone: string;
  /** Injetável para teste. */
  agora?: Date;
}

export interface AvisoRecusa {
  grupo: GrupoRecusa;
  titulo: string;
  texto: string;
  /** Frase do relógio de carência, ou `null` quando não há carência correndo. */
  prazo: string | null;
  ctaHref: string | null;
  ctaLabel: string | null;
}

const TITULO = "Cobrança recusada";

/**
 * G0, G6 e G7 têm `copy: null` no catálogo — e G0 é justamente onde cai o ciclo
 * que o backstop de D+7 levou a `falhou` sem `recusa_codigo`. Sem este texto, o
 * caminho MAIS silencioso do produto continuaria carimbando `past_due`,
 * deixando a carência correr e cortando a assinatura sem uma linha na tela: o
 * D36 inteiro.
 *
 * Ele não afirma causa que não conhecemos, e não pede à clínica nada que ela
 * não possa fazer.
 */
const COPY_FALLBACK =
  "Não conseguimos concluir a cobrança desta mensalidade e ainda não identificamos o motivo junto ao seu banco. Verifique a autorização de Pix Automático do Iris no app do seu banco.";

/**
 * CTA por grupo. `null` não é omissão: em G1 (teto) e G2 (saldo) a ação mora no
 * app do banco, e um botão para dentro do Iris mandaria a clínica para uma tela
 * onde não há nada a fazer.
 */
const CTA_POR_GRUPO: Readonly<
  Record<GrupoRecusa, { href: string; label: string } | null>
> = {
  G0: { href: "/assinatura", label: "Ver assinatura" },
  G1: null,
  G2: null,
  G3: { href: "/assinatura", label: "Ver assinatura" },
  G4: { href: "/clinica/dados", label: "Corrigir dados da clínica" },
  G5: { href: "/assinatura", label: "Ver assinatura" },
  G6: { href: "/assinatura", label: "Ver assinatura" },
  G7: { href: "/assinatura", label: "Ver assinatura" },
  G8: { href: "/assinatura", label: "Ver assinatura" },
};

/** `YYYY-MM-DD` no fuso da clínica — mesmo padrão de `src/lib/trial.ts`. */
function dataCivil(momento: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(momento);
}

function paraBR(civil: string): string {
  const [ano, mes, dia] = civil.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Diferença em dias CIVIS no fuso da clínica. Comparar instantes daria "0 dias"
 * às 23h da véspera do corte — a mesma classe de erro de sinal que
 * `calendario-bancario.ts` existe para evitar.
 */
function diasCivisAte(prazo: Date, agora: Date, timezone: string): number {
  const meiaNoite = (civil: string) => new Date(`${civil}T00:00:00Z`).getTime();
  const dif =
    meiaNoite(dataCivil(prazo, timezone)) -
    meiaNoite(dataCivil(agora, timezone));
  return Math.round(dif / 86_400_000);
}

function frasePrazo(entrada: EntradaAvisoRecusa): string | null {
  // Fora de `past_due` não há relógio: G3 corta por decisão do gateway, não por
  // carência, e assinatura ativa não tem prazo correndo contra ela.
  if (entrada.statusAssinatura !== "past_due") return null;
  if (!entrada.pastDueDesde) return null;

  const prazo = new Date(
    entrada.pastDueDesde.getTime() + entrada.carenciaDias * 86_400_000,
  );
  const agora = entrada.agora ?? new Date();
  const data = paraBR(dataCivil(prazo, entrada.timezone));
  const dias = diasCivisAte(prazo, agora, entrada.timezone);

  if (dias < 0) {
    return `O prazo para regularizar venceu em ${data}: sua assinatura será cancelada na próxima verificação de cobrança.`;
  }
  if (dias === 0) {
    return `Sua assinatura será cancelada hoje (${data}) se o pagamento não for concluído.`;
  }
  if (dias === 1) {
    return `Sua assinatura será cancelada em 1 dia (${data}) se o pagamento não for concluído.`;
  }
  return `Sua assinatura será cancelada em ${dias} dias (${data}) se o pagamento não for concluído.`;
}

export function montarAvisoRecusa(entrada: EntradaAvisoRecusa): AvisoRecusa {
  const politica = classificarRecusa(entrada.recusaCodigo);
  const cta = CTA_POR_GRUPO[politica.grupo];

  return {
    grupo: politica.grupo,
    titulo: TITULO,
    texto: politica.copy ?? COPY_FALLBACK,
    prazo: frasePrazo(entrada),
    ctaHref: cta?.href ?? null,
    ctaLabel: cta?.label ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/billing/recusa-ui.test.ts`
Expected: PASS — 9 testes.

- [ ] **Step 5: Verify the mutation**

Trocar `politica.copy ?? COPY_FALLBACK` por `politica.copy ?? ""` e rodar de novo: **só** o teste "usa copy genérica quando a política não tem copy (G0 do backstop)" deve falhar. Reverter com o patch inverso (nunca `git checkout` — memória `mutacao-reverter-sem-git-checkout`) e rodar mais uma vez para confirmar verde.

- [ ] **Step 6: Commit**

```bash
pnpm prettier --write src/lib/billing/recusa-ui.ts src/lib/billing/recusa-ui.test.ts
git add src/lib/billing/recusa-ui.ts src/lib/billing/recusa-ui.test.ts
git commit -m "feat(billing): build clinic-facing notice from refusal policy (D36)"
```

---

### Task 2: Leitura do ciclo mais recente (`recusa-ativa.ts` + wrapper)

**Files:**
- Create: `src/lib/billing/recusa-ativa.ts`
- Create: `src/lib/billing/recusa-ativa.int.test.ts`
- Modify: `src/app/(app)/queries.ts` (acrescentar `obterAvisoRecusa`, ao lado de `obterSituacaoConta`)
- Ler antes: `src/lib/billing/estado-conta.ts` (função `avaliarSituacaoConta` — padrão do `sql` template dentro de `tx`), `src/lib/billing/classificacao-recusa.int.test.ts:1-40` (arranjo de int test do repo).

**Interfaces:**
- Consumes: `montarAvisoRecusa` / `AvisoRecusa` da Task 1; `type Tx` de `@/db/rls`; `withTenant`, `TenantContext` de `@/db/rls`.
- Produces:
  ```ts
  // recusa-ativa.ts
  export interface RecusaAtiva {
    recusaCodigo: string | null;
    statusAssinatura: string;
    pastDueDesde: Date | null;
    carenciaDias: number;
    timezone: string;
  }
  export async function obterRecusaAtiva(
    tx: Tx,
    clinicId: string,
  ): Promise<RecusaAtiva | null>;

  // app/(app)/queries.ts
  export async function obterAvisoRecusa(
    ctx: TenantContext,
  ): Promise<AvisoRecusa | null>;
  ```

- [ ] **Step 1: Write the failing test**

Criar `src/lib/billing/recusa-ativa.int.test.ts`:

```ts
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor puxam
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

const { obterRecusaAtiva } = await import("./recusa-ativa");
const { withTenant } = await import("@/db/rls");

const describeSeDb = hasDb() ? describe : describe.skip;

/**
 * A faixa do D36 é lida sob `app_role`, com RLS ligada. O que precisa ficar
 * travado aqui não é a redação (isso é `recusa-ui.test.ts`) e sim três fatos de
 * banco:
 *
 * 1. a clínica enxerga a própria recusa (grants da 0071 + coluna da 0100);
 * 2. não enxerga a de outro tenant;
 * 3. ciclo mais recente PAGO devolve `null` — a faixa some sozinha quando a
 *    cobrança é liquidada, sem ninguém apagar estado.
 */
describeSeDb("obterRecusaAtiva (RLS)", () => {
  const sqlAdmin = postgres(process.env.MIGRATION_DATABASE_URL!);
  let clinicaA: string;
  let clinicaB: string;

  afterAll(async () => {
    await sqlAdmin.end();
  });

  beforeEach(async () => {
    // Arranjo mínimo: 2 clínicas, 1 assinatura cada, ciclos plantados abaixo.
    // Preencher com os helpers de fixture usados pelos outros int tests de
    // billing (ver `carencia-vencida.int.test.ts`) — reusar, não reinventar.
    // clinicaA = ...; clinicaB = ...;
  });

  it("devolve a recusa do ciclo mais recente da própria clínica", async () => {
    const recusa = await withTenant(
      { clinicId: clinicaA, userId: "…", role: "coordenador" } as never,
      (tx) => obterRecusaAtiva(tx, clinicaA),
    );

    expect(recusa).not.toBeNull();
    expect(recusa!.recusaCodigo).toBe("PAYMENT_OVERDUE");
    expect(recusa!.statusAssinatura).toBe("past_due");
    expect(recusa!.pastDueDesde).toBeInstanceOf(Date);
    expect(recusa!.carenciaDias).toBe(10);
  });

  it("não enxerga a recusa de outro tenant", async () => {
    const recusa = await withTenant(
      { clinicId: clinicaB, userId: "…", role: "coordenador" } as never,
      (tx) => obterRecusaAtiva(tx, clinicaA),
    );

    expect(recusa).toBeNull();
  });

  it("devolve null quando o ciclo mais recente foi pago", async () => {
    // Planta um ciclo `pago` com `fim` posterior ao ciclo `falhou`.
    // ...
    const recusa = await withTenant(
      { clinicId: clinicaA, userId: "…", role: "coordenador" } as never,
      (tx) => obterRecusaAtiva(tx, clinicaA),
    );

    expect(recusa).toBeNull();
  });
});
```

> **Antes de escrever o arranjo, ler `src/lib/billing/carencia-vencida.int.test.ts`** e copiar dali os helpers de criação de clínica/assinatura/ciclo e o `TenantContext` real (o `as never` acima é marcador — substituir pelo contexto que o repo já monta). Limpeza entre testes por `DELETE` escopado, **nunca** `TRUNCATE` extra (memória `truncate-extra-colide-com-int-test-paralelo`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.integration.config.ts src/lib/billing/recusa-ativa.int.test.ts`
Expected: FAIL — módulo `./recusa-ativa` não existe. Conferir na saída que **3 testes foram coletados** (não `0 passed`).

- [ ] **Step 3: Write minimal implementation**

Criar `src/lib/billing/recusa-ativa.ts`:

```ts
import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";

/**
 * D36 — a leitura que faltava. `billing_cycle.erro` é escrito desde a #318 e
 * nunca foi lido por tela nenhuma; `recusa_codigo` (0100) guarda o código cru.
 * Aqui ele finalmente sai do banco para a interface.
 *
 * **Uma consulta só, e sempre o ciclo MAIS RECENTE.** Duas idas (ciclo de um
 * lado, assinatura do outro) leriam instantes diferentes, e um webhook de
 * liquidação concorrente produziria "cobrança recusada" numa clínica que acabou
 * de pagar. O `JOIN` com `clinic` traz o `timezone` na mesma imagem, porque o
 * prazo de carência é contado em dias civis do fuso da clínica.
 *
 * **Por que não filtrar por `subscription.status`:** G3 (`corteImediato`) não
 * carimba `past_due` — filtrar por carência esconderia justamente a recusa cuja
 * consequência é o corte. A régua é o ciclo, não a assinatura.
 *
 * Sob RLS (`app_role`), coberto pelas policies `billing_cycle_select` e
 * `subscription_select` (0071, reescritas na 0085 para resolver o tenant pelo
 * helper) e pelos grants de `SELECT` de 0071 + 0100. Crase é proibida aqui:
 * este SQL mora num template literal de JS.
 */
export interface RecusaAtiva {
  recusaCodigo: string | null;
  statusAssinatura: string;
  pastDueDesde: Date | null;
  carenciaDias: number;
  timezone: string;
}

type Linha = {
  ciclo_status: string;
  recusa_codigo: string | null;
  status_assinatura: string;
  past_due_desde: Date | string | null;
  carencia_dias: number | string;
  timezone: string;
};

export async function obterRecusaAtiva(
  tx: Tx,
  clinicId: string,
): Promise<RecusaAtiva | null> {
  const resultado = await tx.execute<Linha>(sql`
    SELECT
      bc.status::text AS ciclo_status,
      bc.recusa_codigo,
      s.status::text AS status_assinatura,
      s.past_due_desde,
      s.carencia_dias,
      c.timezone
    FROM billing_cycle bc
    JOIN subscription s ON s.id = bc.subscription_id
    JOIN clinic c ON c.id = bc.clinic_id
    WHERE bc.clinic_id = ${clinicId}
    ORDER BY bc.fim DESC
    LIMIT 1
  `);

  const linha = (resultado as unknown as Linha[])[0];
  if (!linha) return null;

  // O filtro fica AQUI, e não no WHERE, de propósito: no WHERE, um ciclo pago
  // mais recente deixaria a consulta cair no ciclo `falhou` ANTERIOR e a faixa
  // voltaria a acusar uma recusa já resolvida.
  if (linha.ciclo_status !== "falhou") return null;

  return {
    recusaCodigo: linha.recusa_codigo,
    statusAssinatura: linha.status_assinatura,
    // O driver devolve timestamptz como string em consulta crua; `Number` no
    // numeric pelo mesmo motivo de `estado-conta.ts`.
    pastDueDesde:
      linha.past_due_desde == null
        ? null
        : linha.past_due_desde instanceof Date
          ? linha.past_due_desde
          : new Date(linha.past_due_desde),
    carenciaDias: Number(linha.carencia_dias),
    timezone: linha.timezone,
  };
}
```

Acrescentar em `src/app/(app)/queries.ts` (logo depois de `obterSituacaoConta`):

```ts
import { obterRecusaAtiva } from "@/lib/billing/recusa-ativa";
import {
  montarAvisoRecusa,
  type AvisoRecusa,
} from "@/lib/billing/recusa-ui";

/**
 * D36 — o aviso de cobrança recusada da faixa do layout. `null` quando o ciclo
 * mais recente não está em `falhou`, que é o caso da esmagadora maioria.
 *
 * Mesma disciplina de `obterSituacaoConta`: quem lê para RENDERIZAR abre a
 * própria transação de tenant.
 */
export async function obterAvisoRecusa(
  ctx: TenantContext,
): Promise<AvisoRecusa | null> {
  const recusa = await withTenant(ctx, (tx) =>
    obterRecusaAtiva(tx, ctx.clinicId),
  );
  return recusa ? montarAvisoRecusa(recusa) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --config vitest.integration.config.ts src/lib/billing/recusa-ativa.int.test.ts`
Expected: PASS — **3 testes executados**. Se a saída disser `0 passed` ou "no test files", o arquivo não foi coletado: não é verde, é vácuo.

Run também: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
pnpm prettier --write src/lib/billing/recusa-ativa.ts src/lib/billing/recusa-ativa.int.test.ts "src/app/(app)/queries.ts"
git add src/lib/billing/recusa-ativa.ts src/lib/billing/recusa-ativa.int.test.ts "src/app/(app)/queries.ts"
git commit -m "feat(billing): read latest failed cycle for the refusal banner (D36)"
```

---

### Task 3: Componente `FaixaRecusa`

**Files:**
- Create: `src/components/app/faixa-recusa.tsx`
- Test: `src/components/app/faixa-recusa.test.tsx`
- Ler antes: `src/components/app/faixa-trial.tsx` (padrão de `Container` + `Banner`), `src/components/ui/banner.tsx:120-190` (`role` por variante, `titulo`, `dismissible`).

**Interfaces:**
- Consumes: `AvisoRecusa` de `@/lib/billing/recusa-ui`; `Banner` de `@/components/ui/banner`; `Container` de `@/components/ui/layout`.
- Produces: `export function FaixaRecusa({ aviso }: { aviso: AvisoRecusa | null }): React.ReactElement | null`.

- [ ] **Step 1: Write the failing test**

Criar `src/components/app/faixa-recusa.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FaixaRecusa } from "./faixa-recusa";
import type { AvisoRecusa } from "@/lib/billing/recusa-ui";

const AVISO: AvisoRecusa = {
  grupo: "G2",
  titulo: "Cobrança recusada",
  texto: "O débito automático não passou por falta de saldo na conta.",
  prazo:
    "Sua assinatura será cancelada em 6 dias (11/08/2026) se o pagamento não for concluído.",
  ctaHref: null,
  ctaLabel: null,
};

describe("FaixaRecusa", () => {
  it("não renderiza nada sem aviso", () => {
    const { container } = render(<FaixaRecusa aviso={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("mostra título, causa e prazo", () => {
    render(<FaixaRecusa aviso={AVISO} />);
    const texto = screen.getByRole("status").textContent ?? "";

    expect(texto).toContain("Cobrança recusada");
    expect(texto).toContain("falta de saldo");
    expect(texto).toContain("cancelada em 6 dias (11/08/2026)");
  });

  it("usa role=status, nunca role=alert", () => {
    // `alerta` (role="alert") é reservado ao risco clínico: cobrança não
    // interrompe leitor de tela. Discrimina a troca de variante.
    render(<FaixaRecusa aviso={AVISO} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("não pode ser dispensada", () => {
    // É o único aviso antes de um corte irreversível: dispensável, o débito
    // volta a ser invisível — que é o D36.
    render(<FaixaRecusa aviso={AVISO} />);

    expect(screen.queryByRole("button", { name: /dispensar|fechar/i })).toBeNull();
  });

  it("renderiza o CTA quando o grupo tem um", () => {
    render(
      <FaixaRecusa
        aviso={{
          ...AVISO,
          grupo: "G4",
          ctaHref: "/clinica/dados",
          ctaLabel: "Corrigir dados da clínica",
        }}
      />,
    );

    const link = screen.getByRole("link", { name: /corrigir dados da clínica/i });
    expect(link.getAttribute("href")).toBe("/clinica/dados");
  });

  it("omite o CTA quando a ação é fora do Iris", () => {
    render(<FaixaRecusa aviso={AVISO} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("omite o prazo quando não há carência correndo", () => {
    render(<FaixaRecusa aviso={{ ...AVISO, prazo: null }} />);
    const texto = screen.getByRole("status").textContent ?? "";
    expect(texto).not.toContain("cancelada em");
  });
});
```

> Conferir o `aria-label`/texto real do botão de dispensar em `src/components/ui/banner.tsx` e ajustar o regex do teste 4 para casar com ele — o objetivo é provar a ausência do botão real, não a de um botão imaginário.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/app/faixa-recusa.test.tsx`
Expected: FAIL — `Failed to resolve import "./faixa-recusa"`.

- [ ] **Step 3: Write minimal implementation**

Criar `src/components/app/faixa-recusa.tsx`:

```tsx
import Link from "next/link";
import { Banner } from "@/components/ui/banner";
import { Container } from "@/components/ui/layout";
import type { AvisoRecusa } from "@/lib/billing/recusa-ui";

/**
 * Faixa de cobrança recusada (D36).
 *
 * Antes dela, uma recusa não produzia **nada** na interface: `billing_cycle.erro`
 * era escrito e nunca lido, a carência de 10 dias corria e a assinatura era
 * cortada — com revogação irreversível da autorização de Pix Automático — sem
 * que a clínica visse uma linha em lugar nenhum.
 *
 * Três decisões de tela, todas testadas:
 *
 * - **`variant="info"`, nunca `alerta`.** `alerta` carrega `role="alert"`,
 *   reservado ao risco clínico. Cobrança não interrompe leitor de tela. A
 *   urgência vem do `formato="padrao"` com título — o degrau acima da faixa de
 *   trial, que é `compacto`.
 * - **Não é dispensável.** É o único aviso antes de um corte irreversível.
 * - **CTA só onde há o que fazer aqui dentro.** Em recusa por teto ou saldo a
 *   ação mora no app do banco; um botão para dentro do Iris levaria a clínica a
 *   uma tela onde não há nada a fazer.
 *
 * ⚠️ **Limitação conhecida:** o layout não revalida em navegação client-side
 * (#285). O pagamento acontece FORA do Iris, então a faixa some no próximo
 * carregamento de servidor, não no instante do pagamento. Polling é escopo da
 * issue separada do mostrador de retentativas.
 */
export function FaixaRecusa({ aviso }: { aviso: AvisoRecusa | null }) {
  if (!aviso) return null;

  return (
    <Container largura="md" className="pt-3 pb-0">
      <Banner variant="info" formato="padrao" titulo={aviso.titulo}>
        <p>{aviso.texto}</p>
        {aviso.prazo ? <p className="mt-2 font-semibold">{aviso.prazo}</p> : null}
        {aviso.ctaHref && aviso.ctaLabel ? (
          <p className="mt-3">
            <Link
              href={aviso.ctaHref}
              className="font-semibold whitespace-nowrap underline underline-offset-4"
            >
              {aviso.ctaLabel}
            </Link>
          </p>
        ) : null}
      </Banner>
    </Container>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/app/faixa-recusa.test.tsx`
Expected: PASS — 7 testes.

- [ ] **Step 5: Verify the mutation**

Trocar `variant="info"` por `variant="alerta"`: **só** o teste "usa role=status, nunca role=alert" deve falhar. Acrescentar `dismissible`: **só** o teste "não pode ser dispensada" deve falhar. Reverter os dois com patch inverso e reconfirmar verde.

- [ ] **Step 6: Commit**

```bash
pnpm prettier --write src/components/app/faixa-recusa.tsx src/components/app/faixa-recusa.test.tsx
git add src/components/app/faixa-recusa.tsx src/components/app/faixa-recusa.test.tsx
git commit -m "feat(ui): add refusal banner component (D36)"
```

---

### Task 4: Ligar no layout e fechar o débito

**Files:**
- Modify: `src/app/(app)/layout.tsx:16-36` (o `Promise.all`) e `:124-128` (o ponto de render)
- Modify: `BACKLOG.md` (linha D36)
- Ler antes: `src/app/(app)/layout.tsx` inteiro.

**Interfaces:**
- Consumes: `obterAvisoRecusa(ctx)` (Task 2), `FaixaRecusa` (Task 3).
- Produces: nada — é o fechamento.

- [ ] **Step 1: Acrescentar a leitura ao `Promise.all`**

Em `src/app/(app)/layout.tsx`, no import block:

```ts
import { FaixaRecusa } from "@/components/app/faixa-recusa";
import { obterSituacaoConta, obterAvisoRecusa } from "./queries";
```

E no destructuring do `Promise.all`:

```ts
  const [
    clinicas,
    pendencias,
    { quantidade: riscoEstagio2, protocoloInterno },
    situacaoConta,
    avisoRecusa,
  ] = await Promise.all([
    listarClinicasDoUsuario(ctx.userId),
    ehClinico ? listarPendencias(ctx) : Promise.resolve({ total: 0 }),
    estadoEstagio2(ctx),
    obterSituacaoConta(ctx),
    // D36 — a recusa deixa de morrer no log. Em paralelo com as demais: é uma
    // consulta a mais no mesmo request, não uma ida em série.
    obterAvisoRecusa(ctx),
  ]);
```

> Manter os comentários já existentes das outras entradas do array intactos — a lista acima é elidida por brevidade, **não** apagar comentário nenhum.

- [ ] **Step 2: Renderizar acima da `FaixaTrial`**

```tsx
      <FaixaRecusa aviso={avisoRecusa} />
      <FaixaTrial
        estado={situacaoConta.estado}
        diasRestantes={situacaoConta.diasRestantesTrial}
        debitoCentavos={situacaoConta.debitoCentavos}
      />
```

Ordem deliberada: a recusa é o fato mais novo e o de maior consequência; a faixa de trial/débito fica abaixo. Ambas coexistem — em `cancelada` por carência vencida, a `FaixaTrial` explica o estado e a `FaixaRecusa` explica a causa.

- [ ] **Step 3: Rodar o gate inteiro**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm vitest run --config vitest.integration.config.ts src/lib/billing/recusa-ativa.int.test.ts
```
Expected: tudo verde, e o int test com **3 testes executados** (contagem, não só o verde).

> Se o build reclamar de tipo gerado em `.next`, é falso-negativo de cache: `rm -rf .next && pnpm build` (memória `next-dev-types-stale-build-fail`).

- [ ] **Step 4: Commit**

```bash
pnpm prettier --write "src/app/(app)/layout.tsx"
git add "src/app/(app)/layout.tsx"
git commit -m "feat(app): surface refusal banner in the app layout (D36)"
```

- [ ] **Step 5: Fechar D36 no BACKLOG**

Editar a linha **D36** de `BACKLOG.md` marcando o fechamento com data (23/08/2026) e registrando, em pt-BR:

- O que passou a existir: `recusa-ativa.ts` (leitura do ciclo mais recente), `recusa-ui.ts` (copy + CTA + relógio de carência), `FaixaRecusa` no layout do app.
- **O achado que o débito não previa:** o caminho do backstop de D+7 grava `status='falhou'` com `recusa_codigo = NULL` → G0 → `copy: null`. Era o caminho **mais** silencioso, e é o que a copy genérica de fallback cobre.
- O que ficou **de fora**, por decisão de escopo (Opção B, 17/08/2026): mostrador detalhado de retentativas — tentativas gastas, próximas datas, histórico de cobranças. Vira issue separada.
- A limitação conhecida: sem polling, a faixa some no próximo carregamento de servidor, não no instante do pagamento (#285).

- [ ] **Step 6: Commit final**

```bash
pnpm prettier --write BACKLOG.md
git add BACKLOG.md
git commit -m "docs(backlog): close D36 - refused charge now visible in the UI"
```

---

## Self-Review

**Cobertura da spec (D36):**

| Requisito da linha D36 | Onde é atendido |
|---|---|
| `billing_cycle.erro`/`recusa_codigo` nunca lido por tela nenhuma | Task 2 — `obterRecusaAtiva` |
| Tarja devolve `null` em `pagamento_atrasado` sem débito | Task 4 — `FaixaRecusa` é independente da `FaixaTrial` e aparece em `past_due` |
| Copy que aparece fala de cancelamento anterior, não da recusa | Task 1 — copy por grupo da #318, com título próprio |
| Os 9 grupos diferem só em log | Tasks 1 e 3 — 5 copies distintas + fallback, CTA divergente por grupo |
| Carência corre e corta sem a clínica ver | Task 1 — frase de prazo com dias civis e data |
| Foco exclusivo na faixa (Opção B) | Global Constraints + Task 4 Step 5 |

**Placeholders:** o único bloco deliberadamente incompleto é o arranjo do `.int.test.ts` (Task 2, Step 1), com instrução explícita de copiar os helpers de `carencia-vencida.int.test.ts` em vez de inventar fixture — reescrever fixture de billing à mão é como o `42501` da memória `fixture-com-authdb-esconde-defeito-real` nasceu.

**Consistência de tipos:** `AvisoRecusa` (Task 1) é o mesmo tipo em `obterAvisoRecusa` (Task 2) e na prop `aviso` (Task 3). `RecusaAtiva` (Task 2) tem exatamente os 5 campos de `EntradaAvisoRecusa` menos `agora` (opcional) — `montarAvisoRecusa(recusa)` compila sem adaptação.
