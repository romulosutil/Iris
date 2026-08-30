# Issue #36 — Bloco B: estado corrente da assinatura na tela

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem já assinou passa a ver, em `/assinatura`, em que estado a assinatura está, qual é o ciclo corrente e quando ele fecha — e, quando a cobrança atrasou, o que aconteceu, até quando dá para regularizar e o que exatamente destrava.

**Architecture:** Leitura pura sobre trilhos que já existem. `subscription` e `billing_cycle` já têm `GRANT SELECT` de tabela para `app_role` (`0071:235`) e policy tenant-scoped por `app_clinic_id_exigido()` (`0085:289`) — **nenhuma migração neste plano**. Uma consulta nova (`obterCicloCorrente`) devolve o estado do vínculo e as datas do ciclo corrente; dois componentes puros renderizam isso. A frase de prazo da carência não é escrita de novo: ela é **extraída** de `recusa-ui.ts`, onde já existe, e passa a ter dois consumidores.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, TypeScript, Drizzle ORM sobre Postgres com RLS, Tailwind v4 + design system do repo (`src/components/ui/**`), Vitest (`pnpm test`) e Vitest integration (`pnpm test:rls`), Testing Library.

**Spec:** [GitHub issue #36](https://github.com/rsutil/iris/issues/36) — "Fase 7 — Self-Service & Growth", bloco B (B1 e B2). O plano irmão dos blocos A, C e D é `docs/superpowers/plans/2026-08-29-36-blocos-a-c-d-portal-assinatura-cancelamento-onboarding.md`; leia a seção "Decisões ratificadas" dele antes desta, porque a decisão A1 ("o histórico exclui o ciclo `aberto`") é o que abre espaço para este bloco.

---

## Escopo deste plano — e o que ele NÃO cobre

Cobre: **B1 sem o valor projetado** e **B2 inteiro**.

**Não cobre, de propósito: o "valor projetado" e as "fichas ativas acumuladas até agora" do B1.**

Motivo medido, não estimado:

- `billing_apurar_ciclo` (`0075:82-142`) **escreve**: faz `DELETE FROM billing_cycle_patient`, `INSERT` do memorial e `UPDATE billing_cycle SET pacientes_contados = …, apurado_em = now(), status = 'apurado'`. Chamá-la para "só ver quanto daria" fecharia o ciclo corrente. Além disso, o `GRANT EXECUTE` dela é **só para `iris_auth`** (`0075:145-147`) — a partir da página, sob `app_role`, ela é inexecutável.
- Replicar o predicado dela em TS sob RLS **subconta**. `session_note_select` passa por `app_session_conteudo_visivel(session_id)` (`0123:4`), que exige `app_session_disciplina_liberada` para nota `discipline_only` (`0122:20`). O coordenador **não enxerga** nota sob sigilo de disciplina em que ele não é o terapeuta nem membro do care team daquela disciplina. Uma ficha cuja única movimentação no ciclo tenha sido uma nota sigilosa some da contagem feita sob `app_role` — e some justamente para a clínica que usa sigilo. O número na tela divergiria da fatura por construção.
- Replicar o predicado também contraria decisão já registrada no repo: o docblock de `src/app/(admin)/benjamin/queries.ts:15-45` diz que reimplementar o critério `(a)+(b)` em Drizzle "criaria a QUARTA definição", e que unificá-las foi justamente o que a `0075` veio consertar.
- A saída correta é uma função **read-only `SECURITY DEFINER`** que resolva o tenant internamente por `app_clinic_id_exigido()` e devolva só agregado (contagem + centavos), nunca a lista de pacientes. Isso é objeto de banco no perímetro de RLS: por `CLAUDE.md` ("Gestão de tokens: atomização", item 1) ele entra por **`/tlc-spec-driven`**, em spec própria — o mesmo caminho que A3/A4 tomaram.

Consequência para o cartão do B1: ele mostra o **período e a data de fechamento**, e diz explicitamente que o valor do ciclo corrente só é conhecido no fechamento. Não estampa um número aproximado.

Também não cobre o **Bloco E** (verificação de campo em produção), que não é código.

## Achados de medição que mudam a issue

Medidos no repo em 29/08/2026, antes de escrever este plano. Quem executar precisa deles porque **três contradizem o texto da issue**.

### 1. `past_due` NÃO é terminal do jeito que a issue diz

A issue afirma, em B2: *"`past_due` é terminal (#319): a carência não leva a `canceled` por inadimplência."* Isso é falso no código de hoje:

- `cancelarAssinaturasComCarenciaVencida` (`src/lib/billing/subscription.ts:934`) seleciona `subscription.status = 'past_due'` com `past_due_desde + make_interval(days => carencia_dias) <= agora` (`subscription.ts:959`) e corta com `statusEsperado: "past_due"` (`subscription.ts:1012`). **A carência vencida leva a `canceled`, sim.**
- O próprio docblock de `estado-conta.ts` diz o contrário da issue: *"desde a #319 por `cancelarAssinaturasComCarenciaVencida`, que é quem transiciona para `canceled` quando ela vence. Até ela existir, este ramo liberava escrita indefinidamente."*

### 2. Pagar em `past_due` reativa, sim — e automaticamente

A issue pede a copy *"sem prometer reativação automática"*. Medido em `liquidarCiclo` (`src/lib/billing/subscription.ts:2445-2454`):

```ts
await authDb
  .update(subscription)
  .set({ status: "active", pastDueDesde: null, atualizadoEm: agora })
  .where(and(eq(subscription.id, subscriptionId), eq(subscription.status, "past_due")));
```

Ou seja: **em `past_due`, o pagamento confirmado devolve a assinatura para `active` sozinho**, pelo webhook. O que *não* reativa é pagar quando a assinatura já está `canceled` — esse é o `eq(status,'past_due')` do `WHERE`, e é a regra da #290 ("quitar destrava o gate; voltar continua sendo um ato explícito").

**A copy de B2 tem de dizer as duas coisas, e a issue mistura uma com a outra.** É a classe de defeito da memória `comentario-de-issue-envelhece-e-desfaz-decisao`: o texto da issue envelheceu depois da #310/#319/#290. Vale o código medido, não a issue.

### 3. Existe um caminho de `past_due` que hoje não aparece em lugar nenhum

Duas coisas, somadas, produzem silêncio total:

- A faixa global de recusa (`FaixaRecusa`, `src/components/app/faixa-recusa.tsx:30`, alimentada por `obterAvisoRecusa`) só existe quando o ciclo mais recente está em `falhou`: `obterRecusaAtiva` devolve `null` para qualquer outro `ciclo_status` (`src/lib/billing/recusa-ativa.ts:88`).
- A faixa de trial (`FaixaTrial`, `src/components/app/faixa-trial.tsx:57`) **retorna `null` para `pagamento_atrasado`** salvo se houver débito > 0.
- E `mensagemDeEstado` devolve **string vazia** para `pagamento_atrasado` (`estado-conta.ts:307`).

Mas `past_due` também é carimbado por `aplicarStatusProvider` quando o gateway reporta o vínculo como `pausada` (`subscription.ts:136`), **sem nenhum ciclo em `falhou`**. Nesse caminho a carência corre, a assinatura será cancelada — e hoje a clínica não vê uma linha sobre isso, em lugar nenhum do produto. É exatamente o buraco que B2 fecha.

### 4. "Próximo fechamento" é `subscription.ciclo_atual_fim`, não o `fim` do `billing_cycle` aberto

`fecharCiclosVencendo` varre por `lte(subscription.cicloAtualFim, agora)` (`subscription.ts:658`), servido pelo índice `subscription_renovacao_idx`. É esse o campo que decide quando a fatura nasce. As duas datas devem coincidir, mas quem manda é a da `subscription` — renderizar a outra seria mostrar uma data que o job não consulta.

### 5. Nada aqui precisa de migração

- `GRANT SELECT ON subscription TO app_role` (`0071:235`) e `GRANT SELECT ON billing_cycle TO app_role` (`0071:236`) são **de tabela**, então alcançam coluna adicionada depois.
- `subscription_select` foi migrada para `clinic_id = app_clinic_id_exigido()` na `0085:289`; `billing_cycle_select`, na `0085:140`.
- `clinic.timezone` já é lido sob `app_role` por `obterRecusaAtiva` (`recusa-ativa.ts:62`), que faz `JOIN clinic`.

## Decisões deste plano

Tomadas na ausência de contra-ordem, e registradas para serem rejeitadas de propósito se estiverem erradas:

- **`SituacaoConta` não é estendida; a consulta é nova.** `avaliarSituacaoConta` (`estado-conta.ts:234`) é o caminho quente de **toda escrita** do produto — ela decide se um INSERT pode acontecer. Pendurar `ciclo_atual_fim`, `past_due_desde` e `carencia_dias` nela para servir uma tela colocaria peso de renderização no caminho de decisão de escrita. A consulta nova mora em `assinatura/queries.ts`, junto do histórico.
- **O cartão e o aviso renderizam só para `coordenador`.** É o mesmo recorte de `HistoricoCobrancas` na página (`page.tsx:57`, `podeContratar`): quem não contrata já recebe o `Alert` "Só a coordenação contrata", e estado de cobrança para quem não pode agir é ruído — além da ida ao banco que o comentário de `page.tsx:76-77` evita de propósito. **Gap conhecido, registrado e não fechado aqui:** no caminho do achado 3, terapeuta e recepção não veem aviso nenhum, porque as duas faixas globais também não disparam. Fechar isso é mexer na faixa do layout, fora do escopo do B2 — vai para a issue como item novo, não entra de carona.
- **A frase de prazo aparece uma vez só na tela.** Quando a faixa global já está exibindo o prazo (há ciclo em `falhou`), o aviso da página recebe `prazo: null` e cobre só o que a faixa não cobre. A página decide isso relendo `obterAvisoRecusa`, que é uma consulta de uma linha e já existe.
- **Datas de ciclo em UTC; prazo de carência no fuso da clínica.** Não é inconsistência: a fronteira do ciclo é um instante (`timestamptz`) e tem de ser igual em duas máquinas da mesma clínica — é o mesmo argumento escrito em `historico-cobrancas.tsx:19`. Já o corte da carência é um **dia civil** no fuso da clínica, e é assim que `frasePrazo` sempre calculou (`recusa-ui.ts:117`).

## Global Constraints

Copiadas verbatim das fontes; valem para **toda** task deste plano.

- **Idioma:** documentação, copy de UI e mensagens ao usuário em **pt-BR**. Mensagens de commit em **inglês**, Conventional Commits, com `, issue #36` no fim do subject (padrão dos commits recentes: `feat(billing): persist and surface the cycle invoice URL, issue #36`).
- **Sem migração.** Se alguma task deste plano parecer precisar de `db/migrations/**`, **pare e escale** — significa que o escopo saiu do que foi medido, e o caminho passa a ser `/tlc-spec-driven`.
- **Toda leitura de tenant sai por `withTenant(ctx, …)`** (`src/db/rls.ts:27`), com `app_role` e RLS ativa. Nunca `authDb` em código de tela.
- **Não repetir o predicado de tenant no `WHERE`.** O filtro por clínica é do banco (policy). Duplicá-lo cria uma segunda fonte de verdade sobre isolamento que pode divergir da policy sem ninguém notar — é o argumento já escrito em `queries.ts:56-60`.
- **Nunca `sql<Date>` cru para data.** Em template `sql` o driver devolve **string** e o `Date` só existe no tipo; a tela quebra em runtime com o `pnpm typecheck` verde (memória `drizzle-sql-nao-codifica-date`). Use `select` tipado do Drizzle.
- **`formatarBRL` usa espaço não-quebrável (U+00A0)** entre `R$` e o número (`calculator.ts:267`). Asserção de teste com um espaço comum **falha**. Compare só o trecho numérico (`/156,00/`) ou use regex com `\s`, que casa NBSP em JS.
- **Matchers nativos do Vitest.** O repo **não tem `jest-dom`** (`vitest.setup.ts` só traz o polyfill de `ResizeObserver`): `toBeInTheDocument` estoura `Invalid Chai property`. Use `expect(screen.queryByText(...)).not.toBeNull()` / `.toBeNull()`, `toHaveLength`, `toEqual` (memória `repo-nao-tem-jest-dom`).
- **Componente do DS, nunca markup cru.** As props são em pt-BR. Valores válidos, medidos: `Alert` aceita `severidade` em `"erro" | "info" | "sucesso" | "error" | "warning" | "success"` — **`"alerta"` não existe** e cairia no default `"erro"`. `StatusBadge` aceita `variante` em `"success" | "warning" | "error" | "ai" | "info" | "brand" | "neutral"`. `Card` aceita `titulo`. `Button`, `variante`.
- **Nunca escrever utilitário Tailwind arbitrário dentro de comentário JSX ou `.md`** — o scanner varre comentário e gera CSS inválido, com erro apontando linha inexistente (memória `tailwind-varre-comentario-e-md`).
- **`pnpm format` só nos arquivos tocados**, nunca no repo inteiro (memória `pnpm-format-reformata-repo-inteiro`).
- **Testes de integração exigem `--config vitest.integration.config.ts`** — `vitest run` num `*.int.test.ts` coleta **zero** e sai verde sem rodar nada. Use `pnpm test:rls` e **confira a contagem**, não o verde (memória `vitest-int-test-coleta-zero`).
- **`.int.test.ts` limpa por `DELETE` escopado, nunca `TRUNCATE`** — `TRUNCATE` derruba os outros int-tests de billing que rodam em paralelo (memória `truncate-extra-colide-com-int-test-paralelo`). O `db/tests/historico-ciclos-rls.int.test.ts` é o modelo a copiar; `billing-apuracao.int.test.ts` usa `TRUNCATE` e **não** é o modelo.
- **E-mail de fixture tem de ser único no repo** — `app_user.email` é `UNIQUE`, e um `coord@a.test` repetido derruba o `setup` de outro arquivo, com a cascata se lendo como defeito de RLS (memória `email-de-fixture-colide-entre-int-tests`).

---

## File Structure

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `src/app/(app)/assinatura/queries.ts` (modificar) | Ganha `CicloCorrente` + `obterCicloCorrente`. Já é o módulo de leitura da tela; o histórico mora aqui. | 1 |
| `db/tests/ciclo-corrente-rls.int.test.ts` (criar) | Prova isolamento cross-tenant e tipos reais da consulta nova. | 1 |
| `src/lib/billing/rotulos-assinatura.ts` (criar) | `subscription_status` → vocabulário da clínica + variante de badge. Espelha `rotulos-ciclo.ts`, que faz o mesmo para `billing_cycle_status`. | 2 |
| `src/app/(app)/assinatura/cartao-assinatura.tsx` (criar) | B1: o cartão "Sua assinatura". Puro, recebe props. | 2 |
| `src/app/(app)/assinatura/cartao-assinatura.test.tsx` (criar) | Teste de componente do B1. | 2 |
| `src/lib/billing/carencia-ui.ts` (criar) | `frasePrazoCarencia` extraída de `recusa-ui.ts`, com os helpers de dia civil. Módulo puro, sem `server-only` — é consumido por componente. | 3 |
| `src/lib/billing/recusa-ui.ts` (modificar) | Passa a importar a frase em vez de tê-la privada. Comportamento inalterado. | 3 |
| `src/app/(app)/assinatura/aviso-past-due.tsx` (criar) | B2: o que aconteceu, o que destrava, até quando. Puro. | 4 |
| `src/app/(app)/assinatura/aviso-past-due.test.tsx` (criar) | Teste de componente do B2. | 4 |
| `src/app/(app)/assinatura/page.tsx` (modificar) | Costura: chama as leituras e posiciona as duas seções. | 2 e 4 |

---

### Task 1: Consulta do ciclo corrente

**Files:**
- Modify: `src/app/(app)/assinatura/queries.ts` (acrescentar ao fim; não tocar em `listarCiclosDaClinica`)
- Test: `db/tests/ciclo-corrente-rls.int.test.ts` (criar)

**Interfaces:**
- Consumes: `withTenant`, `TenantContext` (`@/db/rls`); `subscription`, `clinic`, `subscriptionStatus` (`@/db/schema`); `eq` (`drizzle-orm`).
- Produces:
  ```ts
  export type AssinaturaStatus = (typeof subscriptionStatus.enumValues)[number];
  export interface CicloCorrente {
    statusAssinatura: AssinaturaStatus;
    cicloAtualInicio: Date | null;
    cicloAtualFim: Date | null;
    ativadaEm: Date | null;
    canceladaEm: Date | null;
    pastDueDesde: Date | null;
    carenciaDias: number;
    timezone: string;
  }
  export function obterCicloCorrente(ctx: TenantContext): Promise<CicloCorrente | null>;
  ```
  `null` = a clínica ainda não tem linha de `subscription` (nunca clicou em ativar). É estado legítimo, não falha.

- [ ] **Step 1: Escrever o teste de integração que falha**

Criar `db/tests/ciclo-corrente-rls.int.test.ts`:

```ts
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000003b6a01";
const CLINIC_B = "00000000-0000-0000-0000-0000003b6b01";
const CLINIC_C = "00000000-0000-0000-0000-0000003b6c01";
const U_COORD_A = "00000000-0000-0000-0000-0000003b6a02";
const U_COORD_C = "00000000-0000-0000-0000-0000003b6c02";
const SUB_A = "00000000-0000-0000-0000-0000003b65a1";
const SUB_B = "00000000-0000-0000-0000-0000003b65b1";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxB = {
  clinicId: CLINIC_B,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxC = {
  clinicId: CLINIC_C,
  userId: U_COORD_C,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let obterCicloCorrente: typeof import("@/app/(app)/assinatura/queries").obterCicloCorrente;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("obterCicloCorrente (RLS/ciclo corrente)", () => {
  beforeAll(async () => {
    ({ obterCicloCorrente } = await import("@/app/(app)/assinatura/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // DELETE escopado, na ordem das FKs. TRUNCATE aqui derrubaria os outros
    // int-tests de billing que rodam em paralelo.
    await owner`DELETE FROM billing_cycle WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;
    await owner`DELETE FROM subscription WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_COORD_C})`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;

    await owner`INSERT INTO clinic (id, nome, is_demo, timezone) VALUES
      (${CLINIC_A}, 'Clinica A (ciclo corrente)', false, 'America/Sao_Paulo'),
      (${CLINIC_B}, 'Clinica B (ciclo corrente)', false, 'America/Manaus'),
      (${CLINIC_C}, 'Clinica C (sem assinatura)', false, 'America/Sao_Paulo')`;
    // Sufixo do arquivo no e-mail: `app_user.email` e UNIQUE no repo inteiro, e
    // um endereco repetido derruba o setup de outro int-test.
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.ciclocorrente@t.com'),
      (${U_COORD_C}, 'Coord C', 'coord.c.ciclocorrente@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_C}, ${CLINIC_C}, 'coordenador')`;
    await owner`INSERT INTO subscription
      (id, clinic_id, status, provider, ciclo_atual_inicio, ciclo_atual_fim,
       ativada_em, past_due_desde, carencia_dias) VALUES
      (${SUB_A}, ${CLINIC_A}, 'active', 'asaas',
       '2026-08-13T00:00:00Z', '2026-09-12T00:00:00Z',
       '2026-08-13T14:00:00Z', NULL, 10),
      (${SUB_B}, ${CLINIC_B}, 'past_due', 'asaas',
       '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z',
       '2026-06-01T09:00:00Z', '2026-08-02T12:00:00Z', 7)`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("devolve o vinculo da propria clinica", async () => {
    const r = await obterCicloCorrente(ctxA);
    expect(r?.statusAssinatura).toBe("active");
    expect(r?.carenciaDias).toBe(10);
    expect(r?.timezone).toBe("America/Sao_Paulo");
  });

  test("nao vaza o vinculo de outra clinica", async () => {
    // A clinica B tem carencia 7 e fuso de Manaus — inconfundiveis se vazarem.
    const r = await obterCicloCorrente(ctxA);
    expect(r?.carenciaDias).not.toBe(7);
    expect(r?.timezone).not.toBe("America/Manaus");
    // E o contrario tambem: lida como B, sai B.
    const rb = await obterCicloCorrente(ctxB);
    expect(rb?.statusAssinatura).toBe("past_due");
    expect(rb?.timezone).toBe("America/Manaus");
  });

  test("devolve null quando a clinica nunca ativou", async () => {
    expect(await obterCicloCorrente(ctxC)).toBeNull();
  });

  test("devolve Date de verdade, nao string do driver", async () => {
    const r = await obterCicloCorrente(ctxA);
    expect(r?.cicloAtualFim).toBeInstanceOf(Date);
    expect(r?.ativadaEm).toBeInstanceOf(Date);
    expect(r?.pastDueDesde).toBeNull();
  });

  test("traz past_due_desde quando ele existe", async () => {
    const r = await obterCicloCorrente(ctxB);
    expect(r?.pastDueDesde).toBeInstanceOf(Date);
    expect(r?.pastDueDesde?.toISOString()).toBe("2026-08-02T12:00:00.000Z");
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
pnpm vitest run db/tests/ciclo-corrente-rls.int.test.ts --config vitest.integration.config.ts
```

Esperado: FAIL na importação — `obterCicloCorrente` não é uma função.

**Se sair "no tests found" ou 0 testes, o gate de banco pulou tudo** — confira `DATABASE_URL`, `AUTH_DATABASE_URL` e `MIGRATION_DATABASE_URL` no `.env` e releia `db/tests/integration-env.ts`. Verde com "skipped" aqui é vermelho disfarçado.

- [ ] **Step 3: Implementar a consulta**

No fim de `src/app/(app)/assinatura/queries.ts`, acrescentando `eq` ao import de `drizzle-orm` e `clinic`, `subscription`, `subscriptionStatus` ao de `@/db/schema`:

```ts
export type AssinaturaStatus = (typeof subscriptionStatus.enumValues)[number];

/**
 * Estado corrente do vínculo de cobrança (#36, bloco B).
 *
 * `null` quando a clínica ainda não tem linha de `subscription` — quem nunca
 * clicou em "ativar". É estado legítimo do produto, não falha de leitura, e por
 * isso não lança: a tela renderiza o caminho de quem ainda vai contratar.
 *
 * Por que uma consulta nova em vez de estender `SituacaoConta`:
 * `avaliarSituacaoConta` é o caminho quente de TODA escrita do produto — ela
 * decide se um INSERT pode acontecer. Pendurar campos de renderização nela
 * colocaria peso de tela no caminho de decisão de escrita.
 */
export interface CicloCorrente {
  statusAssinatura: AssinaturaStatus;
  /**
   * Fronteiras do ciclo corrente. `null` até a primeira ativação abrir ciclo.
   *
   * `cicloAtualFim` é a data do PRÓXIMO FECHAMENTO, e é ela — não o `fim` do
   * `billing_cycle` aberto — que decide quando a fatura nasce:
   * `fecharCiclosVencendo` varre por `subscription.ciclo_atual_fim <= agora`
   * (`subscription.ts:658`), servido pelo índice `subscription_renovacao_idx`.
   * As duas datas devem coincidir; renderizar a outra seria mostrar na tela uma
   * data que o job não consulta.
   */
  cicloAtualInicio: Date | null;
  cicloAtualFim: Date | null;
  ativadaEm: Date | null;
  canceladaEm: Date | null;
  /** Instante do carimbo de inadimplência: é dele que a carência corre. */
  pastDueDesde: Date | null;
  carenciaDias: number;
  /** IANA da clínica: o prazo da carência é contado em dias CIVIS. */
  timezone: string;
}

/**
 * Leitura do vínculo corrente por `withTenant` (`app_role`, RLS ativa).
 *
 * `subscription` tem `GRANT SELECT` de tabela desde a `0071:235` — de tabela, e
 * não de coluna, então alcança coluna adicionada depois — e a policy
 * `subscription_select` resolve o tenant por `app_clinic_id_exigido()`
 * (`0085:289`). O `JOIN clinic` sai pelo mesmo caminho que `obterRecusaAtiva`
 * já usa (`recusa-ativa.ts:62`).
 *
 * Sem `where` de clínica de propósito: o filtro é do BANCO. Repeti-lo aqui
 * criaria uma segunda fonte de verdade sobre isolamento, que poderia divergir
 * da policy sem ninguém notar — mesmo argumento de `listarCiclosDaClinica`.
 * `subscription.clinic_id` é `UNIQUE`, então sob a policy sobra no máximo uma
 * linha e o `limit(1)` é redundância barata, não desempate.
 */
export async function obterCicloCorrente(
  ctx: TenantContext,
): Promise<CicloCorrente | null> {
  const linhas = await withTenant(ctx, (tx) =>
    tx
      .select({
        statusAssinatura: subscription.status,
        cicloAtualInicio: subscription.cicloAtualInicio,
        cicloAtualFim: subscription.cicloAtualFim,
        ativadaEm: subscription.ativadaEm,
        canceladaEm: subscription.canceladaEm,
        pastDueDesde: subscription.pastDueDesde,
        carenciaDias: subscription.carenciaDias,
        timezone: clinic.timezone,
      })
      .from(subscription)
      .innerJoin(clinic, eq(clinic.id, subscription.clinicId))
      .limit(1),
  );

  return linhas[0] ?? null;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
pnpm vitest run db/tests/ciclo-corrente-rls.int.test.ts --config vitest.integration.config.ts
pnpm typecheck
```

Esperado: **5 testes passando** (confira o número, não só a cor), typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/assinatura/queries.ts" db/tests/ciclo-corrente-rls.int.test.ts
git commit -m "feat(billing): read the current subscription cycle under RLS, issue #36"
```

---

### Task 2: Cartão "Sua assinatura" (B1)

**Files:**
- Create: `src/lib/billing/rotulos-assinatura.ts`
- Create: `src/app/(app)/assinatura/cartao-assinatura.tsx`
- Create: `src/app/(app)/assinatura/cartao-assinatura.test.tsx`
- Modify: `src/app/(app)/assinatura/page.tsx`

**Interfaces:**
- Consumes: `CicloCorrente`, `AssinaturaStatus`, `obterCicloCorrente` (Task 1); `SituacaoConta.debitoCentavos` (já lido na página); `formatarBRL` (`@/lib/billing/calculator`); `BadgesVariantes` (`@/components/ui/patterns/status-badge`); `Card`, `DataRow`, `StatusBadge` do DS.
- Produces:
  ```ts
  export const ROTULOS_ASSINATURA: Record<AssinaturaStatus, { rotulo: string; variante: BadgesVariantes }>;
  export interface CartaoAssinaturaProps { ciclo: CicloCorrente | null; debitoCentavos: number }
  export function CartaoAssinatura(props: CartaoAssinaturaProps): React.JSX.Element | null;
  ```

- [ ] **Step 1: Escrever o teste de componente que falha**

Criar `src/app/(app)/assinatura/cartao-assinatura.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartaoAssinatura } from "./cartao-assinatura";
import type { CicloCorrente } from "./queries";

const ATIVA: CicloCorrente = {
  statusAssinatura: "active",
  cicloAtualInicio: new Date("2026-08-13T00:00:00Z"),
  cicloAtualFim: new Date("2026-09-12T00:00:00Z"),
  ativadaEm: new Date("2026-08-13T14:00:00Z"),
  canceladaEm: null,
  pastDueDesde: null,
  carenciaDias: 10,
  timezone: "America/Sao_Paulo",
};

describe("CartaoAssinatura", () => {
  it("nao renderiza nada para quem nunca ativou", () => {
    const { container } = render(
      <CartaoAssinatura ciclo={null} debitoCentavos={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("nao renderiza nada em free_tier — quem nunca assinou ve a tabela de precos", () => {
    const { container } = render(
      <CartaoAssinatura
        ciclo={{
          ...ATIVA,
          statusAssinatura: "free_tier",
          cicloAtualInicio: null,
          cicloAtualFim: null,
          ativadaEm: null,
        }}
        debitoCentavos={0}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("mostra estado, periodo do ciclo e proximo fechamento", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={0} />);
    expect(screen.queryByText(/assinatura ativa/i)).not.toBeNull();
    expect(screen.queryByText("13/08/2026 a 12/09/2026")).not.toBeNull();
    expect(screen.queryByText("12/09/2026")).not.toBeNull();
  });

  it("diferencia quem acabou de ativar mostrando desde quando", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={0} />);
    expect(screen.queryByText(/ativa desde/i)).not.toBeNull();
    expect(screen.queryByText("13/08/2026")).not.toBeNull();
  });

  it("nao estampa valor do ciclo corrente — ele so existe no fechamento", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={0} />);
    // Nenhum valor em reais no cartao de uma assinatura sem debito. Se um
    // "valor projetado" for adicionado depois sem a apuracao real por tras,
    // este teste e quem acusa.
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(
      screen.queryByText(/so e fechado quando o ciclo fecha/i),
    ).not.toBeNull();
  });

  it("mostra o debito em aberto quando existe", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={15600} />);
    // `formatarBRL` usa NBSP entre "R$" e o numero: comparar so o trecho
    // numerico evita um falso vermelho por causa do espaco.
    expect(screen.queryByText(/156,00/)).not.toBeNull();
  });

  it("mostra travessao quando o ciclo ainda nao abriu", () => {
    render(
      <CartaoAssinatura
        ciclo={{ ...ATIVA, cicloAtualInicio: null, cicloAtualFim: null }}
        debitoCentavos={0}
      />,
    );
    expect(screen.queryAllByText("—").length).toBeGreaterThan(0);
  });

  it("rotula past_due sem usar o identificador cru do Postgres", () => {
    render(
      <CartaoAssinatura
        ciclo={{
          ...ATIVA,
          statusAssinatura: "past_due",
          pastDueDesde: new Date("2026-08-02T12:00:00Z"),
        }}
        debitoCentavos={0}
      />,
    );
    expect(screen.queryByText("past_due")).toBeNull();
    expect(screen.queryByText(/pagamento em atraso/i)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
pnpm vitest run "src/app/(app)/assinatura/cartao-assinatura.test.tsx"
```

Esperado: FAIL — `Failed to resolve import "./cartao-assinatura"`.

- [ ] **Step 3: Escrever os rótulos**

Criar `src/lib/billing/rotulos-assinatura.ts`:

```ts
import type { BadgesVariantes } from "@/components/ui/patterns/status-badge";
import type { AssinaturaStatus } from "@/app/(app)/assinatura/queries";

/**
 * Vocabulário do banco → vocabulário da clínica (#36, bloco B1). Espelha
 * `rotulos-ciclo.ts`, que faz o mesmo para `billing_cycle_status`.
 *
 * `Record<AssinaturaStatus, …>` e não um objeto solto: o tipo é exaustivo,
 * então um valor novo em `subscription_status` quebra o `pnpm typecheck` em vez
 * de renderizar o identificador cru do Postgres na tela de quem paga.
 *
 * `past_due` NÃO é rotulado como "suspensa" nem "bloqueada": em `past_due` a
 * clínica continua escrevendo (`estado-conta.ts`, ramo `permitir`), e chamar
 * isso de suspensão descreveria um bloqueio que não existe.
 */
export const ROTULOS_ASSINATURA: Record<
  AssinaturaStatus,
  { rotulo: string; variante: BadgesVariantes }
> = {
  free_tier: { rotulo: "Sem assinatura", variante: "neutral" },
  setup_pending: { rotulo: "Ativação em andamento", variante: "info" },
  active: { rotulo: "Assinatura ativa", variante: "success" },
  past_due: { rotulo: "Pagamento em atraso", variante: "warning" },
  canceled: { rotulo: "Assinatura cancelada", variante: "neutral" },
};
```

- [ ] **Step 4: Escrever o componente**

Criar `src/app/(app)/assinatura/cartao-assinatura.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { DataRow } from "@/components/ui/data-row";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import { formatarBRL } from "@/lib/billing/calculator";
import { ROTULOS_ASSINATURA } from "@/lib/billing/rotulos-assinatura";
import type { CicloCorrente } from "./queries";

/**
 * Datas em UTC de propósito: a fronteira do ciclo é gravada em `timestamptz` e
 * é um INSTANTE, não o dia local de quem olha. Renderizar no fuso do navegador
 * faria o mesmo ciclo aparecer com data diferente em duas máquinas da mesma
 * clínica. Mesmo argumento de `historico-cobrancas.tsx`.
 *
 * O prazo da carência, no bloco B2, é o contrário: dia CIVIL no fuso da
 * clínica. São medidas diferentes, não uma inconsistência.
 */
const formatador = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function dataOuTravessao(d: Date | null): string {
  return d ? formatador.format(d) : "—";
}

export interface CartaoAssinaturaProps {
  ciclo: CicloCorrente | null;
  /** `SituacaoConta.debitoCentavos`: soma dos ciclos em `devido`. */
  debitoCentavos: number;
}

/**
 * O cartão "Sua assinatura" (#36, bloco B1).
 *
 * Some inteiro para quem nunca contratou (`null` ou `free_tier`): a tela desses
 * é a tabela de preços mais o formulário, e um cartão dizendo "sem assinatura"
 * só empurraria a ação para baixo.
 *
 * ## O que este cartão NÃO mostra, e por quê
 *
 * Fichas ativas acumuladas e valor projetado do ciclo corrente ficaram de fora
 * de propósito. `billing_apurar_ciclo` (0075) ESCREVE — apaga e reinsere
 * `billing_cycle_patient`, carimba `apurado_em` e move o status para `apurado`
 * — e o `GRANT EXECUTE` dela é só de `iris_auth`, então nem executável daqui
 * ela é. Replicar o predicado dela sob `app_role` subconta, porque
 * `session_note_select` passa por `app_session_conteudo_visivel` (0123) e
 * esconde do coordenador a nota sob sigilo de disciplina: o número na tela
 * divergiria da fatura justamente para quem usa sigilo. A projeção sai por uma
 * função read-only SECURITY DEFINER, em spec própria — não daqui.
 */
export function CartaoAssinatura({
  ciclo,
  debitoCentavos,
}: CartaoAssinaturaProps) {
  if (!ciclo || ciclo.statusAssinatura === "free_tier") return null;

  const { rotulo, variante } = ROTULOS_ASSINATURA[ciclo.statusAssinatura];
  const periodo =
    ciclo.cicloAtualInicio && ciclo.cicloAtualFim
      ? `${formatador.format(ciclo.cicloAtualInicio)} a ${formatador.format(ciclo.cicloAtualFim)}`
      : "—";

  return (
    <Card titulo="Sua assinatura">
      <div className="flex flex-col gap-1">
        <DataRow
          title="Situação"
          trailing={<StatusBadge variante={variante}>{rotulo}</StatusBadge>}
        />
        <DataRow
          title="Ciclo corrente"
          subtitle="Período que está sendo medido agora."
          trailing={<span className="font-mono">{periodo}</span>}
        />
        <DataRow
          title="Próximo fechamento"
          subtitle="Dia em que a fatura deste ciclo nasce."
          trailing={
            <span className="font-mono">
              {dataOuTravessao(ciclo.cicloAtualFim)}
            </span>
          }
        />
        <DataRow
          title="Ativa desde"
          trailing={
            <span className="font-mono">{dataOuTravessao(ciclo.ativadaEm)}</span>
          }
        />
        {debitoCentavos > 0 ? (
          <DataRow
            title="Débito em aberto"
            subtitle="De ciclo já encerrado e ainda não pago."
            trailing={
              <span className="font-mono font-semibold">
                {formatarBRL(debitoCentavos)}
              </span>
            }
          />
        ) : null}
      </div>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        O valor deste ciclo só é fechado quando o ciclo fecha: ele depende de
        quantas fichas tiveram movimento até o último dia. Cada fatura já
        emitida está no histórico de cobranças, abaixo.
      </p>
    </Card>
  );
}
```

- [ ] **Step 5: Rodar e verificar que passa**

```bash
pnpm vitest run "src/app/(app)/assinatura/cartao-assinatura.test.tsx"
```

Esperado: 8 testes passando.

- [ ] **Step 6: Costurar na página**

Em `src/app/(app)/assinatura/page.tsx`:

1. Trocar `import { listarCiclosDaClinica } from "./queries";` por:

```tsx
import { CartaoAssinatura } from "./cartao-assinatura";
import { listarCiclosDaClinica, obterCicloCorrente } from "./queries";
```

2. Logo abaixo da linha que já lê os ciclos (`const ciclos = podeContratar ? await listarCiclosDaClinica(ctx) : [];`), acrescentar:

```tsx
  // Mesmo recorte de papel do histórico: quem não contrata já recebe o Alert
  // "Só a coordenação contrata", e estado de cobrança para quem não pode agir
  // é ruído — além de uma ida ao banco na renderização de quem não usa o dado.
  const cicloCorrente = podeContratar ? await obterCicloCorrente(ctx) : null;
```

3. Inserir a renderização **logo depois do `<PageHeader …/>`**, antes da seção "Como funciona a cobrança". O estado atual vem antes da explicação estática; o histórico e a ativação continuam onde estão:

```tsx
      {podeContratar ? (
        <CartaoAssinatura
          ciclo={cicloCorrente}
          debitoCentavos={situacaoConta.debitoCentavos}
        />
      ) : null}
```

- [ ] **Step 7: Rodar a bateria e verificar**

```bash
pnpm vitest run "src/app/(app)/assinatura"
pnpm typecheck
pnpm lint
pnpm exec prettier --write "src/app/(app)/assinatura/cartao-assinatura.tsx" "src/app/(app)/assinatura/cartao-assinatura.test.tsx" "src/app/(app)/assinatura/page.tsx" src/lib/billing/rotulos-assinatura.ts
```

Esperado: tudo verde. **Não rode `pnpm format`** — ele reformata o repo inteiro.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/assinatura/cartao-assinatura.tsx" "src/app/(app)/assinatura/cartao-assinatura.test.tsx" "src/app/(app)/assinatura/page.tsx" src/lib/billing/rotulos-assinatura.ts
git commit -m "feat(billing): show the current subscription cycle on the subscription page, issue #36"
```

---

### Task 3: Extrair a frase de prazo da carência

Refatoração pura, sem mudança de comportamento. Existe porque o B2 precisa da mesma frase que a faixa global já produz, e duas cópias divergiriam no primeiro ajuste de copy — com a clínica lendo dois prazos diferentes para o mesmo corte.

**Files:**
- Create: `src/lib/billing/carencia-ui.ts`
- Modify: `src/lib/billing/recusa-ui.ts` (remover `dataCivil`, `paraBR`, `diasCivisAte` e `frasePrazo`; importar a versão extraída)
- Test: `src/lib/billing/recusa-ui.test.ts` (**não alterar** — é o oráculo de paridade)

**Interfaces:**
- Produces:
  ```ts
  export interface EntradaPrazoCarencia {
    statusAssinatura: string;
    pastDueDesde: Date | null;
    carenciaDias: number;
    timezone: string;
    agora?: Date;
  }
  export function frasePrazoCarencia(entrada: EntradaPrazoCarencia): string | null;
  ```
  Tanto `EntradaAvisoRecusa` quanto `CicloCorrente` satisfazem `EntradaPrazoCarencia` estruturalmente — os dois têm `statusAssinatura`, `pastDueDesde`, `carenciaDias` e `timezone`. Nenhum adaptador é necessário em nenhum dos dois call sites.

- [ ] **Step 1: Fixar o comportamento atual antes de mover**

```bash
pnpm vitest run src/lib/billing/recusa-ui.test.ts
```

Anote o número de testes que passam. Esse número tem de ser **idêntico** no Step 4 — é o que prova que a extração não mudou nada.

- [ ] **Step 2: Criar o módulo extraído**

Criar `src/lib/billing/carencia-ui.ts` movendo o código de `recusa-ui.ts:95-148` **sem edição de lógica**:

```ts
/**
 * A frase do relógio de carência, isolada para ter mais de um consumidor
 * (#36, bloco B2).
 *
 * Estava privada em `recusa-ui.ts`, onde só a faixa global de recusa a
 * enxergava. O aviso de `past_due` da tela de assinatura precisa da MESMA
 * frase: duas cópias divergiriam no primeiro ajuste de copy, e a clínica veria
 * dois prazos diferentes para o mesmo corte, na mesma tela.
 *
 * **Puro e sem `server-only`**, pelo mesmo motivo de `recusa-ui.ts`: é
 * consumido por componente e por teste de componente. Importar um módulo
 * `server-only` de um client component derruba o `pnpm build` — e o `pnpm test`
 * não pega, porque no jsdom o `server-only` resolve normalmente.
 */

export interface EntradaPrazoCarencia {
  /** `subscription.status`. Só `past_due` faz o relógio existir. */
  statusAssinatura: string;
  pastDueDesde: Date | null;
  carenciaDias: number;
  /** IANA da clínica: o prazo é contado em dias CIVIS, não em 24h. */
  timezone: string;
  /** Injetável para teste. */
  agora?: Date;
}

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

export function frasePrazoCarencia(
  entrada: EntradaPrazoCarencia,
): string | null {
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
```

- [ ] **Step 3: Apontar `recusa-ui.ts` para o módulo novo**

Em `src/lib/billing/recusa-ui.ts`:

1. Acrescentar ao topo, junto do import de `classificacao-recusa`:

```ts
import { frasePrazoCarencia } from "./carencia-ui";
```

2. **Deletar** as funções `dataCivil`, `paraBR`, `diasCivisAte` e `frasePrazo` (o bloco de `recusa-ui.ts:95-148`).

3. Em `montarAvisoRecusa`, trocar `prazo: frasePrazo(entrada),` por:

```ts
    prazo: frasePrazoCarencia(entrada),
```

- [ ] **Step 4: Rodar e verificar paridade**

```bash
pnpm vitest run src/lib/billing/recusa-ui.test.ts
pnpm typecheck
```

Esperado: **o mesmo número de testes do Step 1**, todos passando, sem uma linha alterada em `recusa-ui.test.ts`. Se algum falhar, a extração mudou comportamento — desfaça e refaça movendo o código literalmente.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/carencia-ui.ts src/lib/billing/recusa-ui.ts
git commit -m "refactor(billing): extract the grace-period deadline sentence for reuse, issue #36"
```

---

### Task 4: Aviso de `past_due` explicado na tela (B2)

**Files:**
- Create: `src/app/(app)/assinatura/aviso-past-due.tsx`
- Create: `src/app/(app)/assinatura/aviso-past-due.test.tsx`
- Modify: `src/app/(app)/assinatura/page.tsx`

**Interfaces:**
- Consumes: `CicloCorrente` (Task 1), `frasePrazoCarencia` (Task 3), `obterAvisoRecusa` (`@/app/(app)/queries`), `Alert` do DS.
- Produces:
  ```ts
  export interface AvisoPastDueProps { ciclo: CicloCorrente | null; prazo: string | null }
  export function AvisoPastDue(props: AvisoPastDueProps): React.JSX.Element | null;
  ```

**A copy é o entregável desta task, e ela contradiz a issue em dois pontos.** Releia "Achados de medição" 1 e 2 antes de escrever uma palavra: a carência vencida **leva** a `canceled` (`subscription.ts:934-1012`), e pagar em `past_due` **reativa automaticamente** (`subscription.ts:2445-2454`). O que não reativa é pagar depois de já estar `canceled` (#290). O texto da issue precede essas mudanças.

- [ ] **Step 1: Escrever o teste de componente que falha**

Criar `src/app/(app)/assinatura/aviso-past-due.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvisoPastDue } from "./aviso-past-due";
import type { CicloCorrente } from "./queries";

const ATRASADA: CicloCorrente = {
  statusAssinatura: "past_due",
  cicloAtualInicio: new Date("2026-07-01T00:00:00Z"),
  cicloAtualFim: new Date("2026-08-01T00:00:00Z"),
  ativadaEm: new Date("2026-06-01T09:00:00Z"),
  canceladaEm: null,
  pastDueDesde: new Date("2026-08-02T12:00:00Z"),
  carenciaDias: 10,
  timezone: "America/Sao_Paulo",
};

const PRAZO =
  "Sua assinatura será cancelada em 5 dias (12/08/2026) se o pagamento não for concluído.";

describe("AvisoPastDue", () => {
  it("nao renderiza fora de past_due", () => {
    const { container } = render(
      <AvisoPastDue
        ciclo={{ ...ATRASADA, statusAssinatura: "active", pastDueDesde: null }}
        prazo={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("nao renderiza quando nao ha vinculo", () => {
    const { container } = render(<AvisoPastDue ciclo={null} prazo={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("diz que o acesso continua — past_due nao bloqueia escrita", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    expect(screen.queryByText(/continua liberado/i)).not.toBeNull();
  });

  it("diz que pagar a fatura em aberto reativa sozinho", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    // Medido em subscription.ts:2445-2454 — em past_due, o pagamento
    // confirmado devolve a assinatura para `active` pelo webhook.
    expect(screen.queryByText(/volta a ficar ativa sozinha/i)).not.toBeNull();
  });

  it("diz que depois do cancelamento pagar nao basta", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    // #290: quitar destrava o gate, mas voltar exige autorizacao nova.
    expect(screen.queryByText(/autorização nova/i)).not.toBeNull();
  });

  it("mostra o prazo quando ele lhe e passado", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    expect(screen.queryByText(/12\/08\/2026/)).not.toBeNull();
  });

  it("omite o prazo quando a faixa do topo ja o mostra", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={null} />);
    // Duas frases de prazo na mesma tela e ruido; a faixa global tem
    // precedencia porque ela tambem explica a CAUSA da recusa.
    expect(screen.queryByText(/12\/08\/2026/)).toBeNull();
    // Mas o resto do aviso continua — e ele que diz o que destrava.
    expect(screen.queryByText(/volta a ficar ativa sozinha/i)).not.toBeNull();
  });

  it("nao promete retentativa nem afirma causa que nao conhecemos", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    expect(screen.queryByText(/tentaremos novamente/i)).toBeNull();
    expect(screen.queryByText(/seu banco recusou/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
pnpm vitest run "src/app/(app)/assinatura/aviso-past-due.test.tsx"
```

Esperado: FAIL — `Failed to resolve import "./aviso-past-due"`.

- [ ] **Step 3: Escrever o componente**

Criar `src/app/(app)/assinatura/aviso-past-due.tsx`:

```tsx
import { Alert } from "@/components/ui/alert";
import type { CicloCorrente } from "./queries";

export interface AvisoPastDueProps {
  ciclo: CicloCorrente | null;
  /**
   * A frase do relógio de carência, ou `null` para omiti-la.
   *
   * `null` quando a faixa global do layout já está mostrando o mesmo prazo
   * (há ciclo em `falhou`): a faixa tem precedência porque ela também explica
   * a CAUSA da recusa, e duas frases de prazo na mesma tela são ruído. Quem
   * decide é a página, que já sabe se `obterAvisoRecusa` devolveu algo.
   */
  prazo: string | null;
}

/**
 * `past_due` explicado na tela (#36, bloco B2).
 *
 * ## O que esta copy afirma, e onde isso foi medido
 *
 * A issue #36 descreve `past_due` de um jeito que o código de hoje contradiz
 * em dois pontos. Vale o código:
 *
 * 1. **A carência VENCE e cancela.** A issue diz que "a carência não leva a
 *    `canceled` por inadimplência". `cancelarAssinaturasComCarenciaVencida`
 *    (`subscription.ts:934`) varre `status = 'past_due'` com
 *    `past_due_desde + carencia_dias <= agora` e corta com
 *    `statusEsperado: "past_due"` (`subscription.ts:1012`).
 * 2. **Pagar em `past_due` reativa sozinho.** A issue pede copy "sem prometer
 *    reativação automática". `liquidarCiclo` (`subscription.ts:2445`) faz
 *    `UPDATE subscription SET status='active', past_due_desde=NULL WHERE
 *    status='past_due'` quando o pagamento é confirmado. O que NÃO reativa é
 *    pagar depois de a assinatura já estar `canceled` — é o `WHERE` daquele
 *    update, e é a regra da #290.
 *
 * ## Por que existe, se já há a faixa global de recusa
 *
 * Porque hoje existe um `past_due` que não aparece em lugar nenhum:
 * `FaixaRecusa` só monta quando o ciclo mais recente está em `falhou`
 * (`recusa-ativa.ts:88`), `FaixaTrial` devolve `null` em `pagamento_atrasado`
 * sem débito (`faixa-trial.tsx`), e `mensagemDeEstado` devolve string vazia
 * para esse estado (`estado-conta.ts:307`). Mas `past_due` também é carimbado
 * quando o gateway reporta o vínculo como `pausada` (`subscription.ts:136`),
 * sem ciclo em `falhou` nenhum — e nesse caminho a carência corre, a
 * assinatura será cancelada, e a clínica não lê uma linha sobre isso.
 *
 * ## O que a copy NÃO faz
 *
 * Não afirma causa (o caminho do backstop de D+7 não pergunta nada a banco
 * nenhum — o prazo só venceu) e não promete retentativa. São as duas regras já
 * escritas no cabeçalho de `recusa-ui.ts`, e valem aqui igual.
 */
export function AvisoPastDue({ ciclo, prazo }: AvisoPastDueProps) {
  if (!ciclo || ciclo.statusAssinatura !== "past_due") return null;

  return (
    <Alert severidade="warning" titulo="Pagamento em atraso">
      <p>
        A cobrança do último ciclo não foi confirmada, então sua assinatura está
        marcada como em atraso. O acesso ao Iris{" "}
        <strong>continua liberado</strong> — atendimento, prontuário e cadastro
        seguem funcionando normalmente.
      </p>
      <p className="mt-2">
        Para regularizar, pague a fatura em aberto no histórico de cobranças
        abaixo. Assim que o pagamento é confirmado, a assinatura{" "}
        <strong>volta a ficar ativa sozinha</strong>: não é preciso refazer nada
        aqui.
      </p>
      {prazo ? <p className="mt-2 font-semibold">{prazo}</p> : null}
      <p className="mt-2">
        Se o prazo passar, a assinatura é cancelada. A partir daí, pagar o que
        está em aberto deixa de bastar: voltar exige uma{" "}
        <strong>autorização nova</strong> de Pix Automático, feita por você
        nesta tela.
      </p>
    </Alert>
  );
}
```

Nota sobre `severidade="warning"`: é uma das chaves válidas do mapa `estilo` de `src/components/ui/alert.tsx` (`erro`, `info`, `sucesso`, `error`, `warning`, `success`). **Não use `"alerta"`** — não existe lá, cairia no default `"erro"` em silêncio e pintaria de vermelho um estado que não é falha. E não adicione severidade nova ao DS nesta task.

- [ ] **Step 4: Rodar e verificar que passa**

```bash
pnpm vitest run "src/app/(app)/assinatura/aviso-past-due.test.tsx"
```

Esperado: 8 testes passando.

- [ ] **Step 5: Costurar na página**

Em `src/app/(app)/assinatura/page.tsx`:

1. Acrescentar aos imports:

```tsx
import { AvisoPastDue } from "./aviso-past-due";
import { frasePrazoCarencia } from "@/lib/billing/carencia-ui";
```

e trocar `import { obterSituacaoConta } from "../queries";` por:

```tsx
import { obterAvisoRecusa, obterSituacaoConta } from "../queries";
```

2. Depois da linha `const cicloCorrente = …` da Task 2:

```tsx
  // A faixa global do layout já mostra o prazo quando existe ciclo em
  // `falhou`. Nesse caso o aviso da página o omite: duas frases de prazo na
  // mesma tela são ruído, e a faixa tem precedência porque ela também explica
  // a causa da recusa. Consulta de uma linha, a mesma que o layout já faz.
  const prazoCarencia =
    cicloCorrente && (await obterAvisoRecusa(ctx)) === null
      ? frasePrazoCarencia(cicloCorrente)
      : null;
```

3. Inserir o aviso **logo depois do `<PageHeader …/>` e antes do `<CartaoAssinatura …/>`**. Conta em atraso é a primeira coisa que a pessoa precisa ler nesta tela, não algo a descobrir depois da tabela de preços:

```tsx
      {podeContratar ? (
        <AvisoPastDue ciclo={cicloCorrente} prazo={prazoCarencia} />
      ) : null}
```

- [ ] **Step 6: Rodar a bateria completa**

```bash
pnpm vitest run "src/app/(app)/assinatura" src/lib/billing/recusa-ui.test.ts
pnpm typecheck
pnpm lint
pnpm exec prettier --write "src/app/(app)/assinatura/aviso-past-due.tsx" "src/app/(app)/assinatura/aviso-past-due.test.tsx" "src/app/(app)/assinatura/page.tsx"
```

Esperado: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/assinatura/aviso-past-due.tsx" "src/app/(app)/assinatura/aviso-past-due.test.tsx" "src/app/(app)/assinatura/page.tsx"
git commit -m "feat(billing): explain the past_due state on the subscription page, issue #36"
```

---

### Task 5: Verificação final e fechamento

Nenhum código novo. Existe porque **CI verde sozinho não basta** (`AGENTS.md` §5.6) e porque `vitest run` num `.int.test.ts` sem a config de integração sai verde sem rodar nada.

- [ ] **Step 1: Rodar a bateria inteira do repo**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rls
```

- [ ] **Step 2: Conferir a CONTAGEM, não a cor**

Na saída de `pnpm test:rls`, confirme que `db/tests/ciclo-corrente-rls.int.test.ts` aparece com **5 testes executados** e **zero skipped**. Um arquivo inteiro "skipped" significa gate de banco desarmado — e é verde disfarçado de vermelho.

- [ ] **Step 3: Provar que o build enxerga o que o teste não enxerga**

```bash
rm -rf .next && pnpm build
```

Existe por dois motivos medidos neste repo: (a) `.next` velho produz falso-negativo em arquivo gerado (memória `next-dev-types-stale-build-fail`); (b) importar módulo `server-only` de componente cliente **só quebra no build** — no jsdom o `server-only` resolve normalmente e o `pnpm test` passa. `carencia-ui.ts` e `rotulos-assinatura.ts` foram escritos sem `server-only` justamente por isso, e este passo é quem verifica.

- [ ] **Step 4: Abrir o PR em Draft, em pt-BR**

Descrição com contexto e decisões — o revisor lê o diff contra a Definição de Pronto original, e o Jules só vê o diff. Incluir obrigatoriamente:

- que **não há migração** neste plano, e por quê (grants e policies medidos: `0071:235`, `0085:289`);
- que o **valor projetado do B1 ficou fora de propósito**, com o motivo medido (`billing_apurar_ciclo` escreve e só `iris_auth` executa; a contagem sob `app_role` subconta por causa do sigilo de `0122`/`0123`) e o encaminhamento (`/tlc-spec-driven`);
- que a **copy do B2 contradiz o texto da issue em dois pontos**, com os ponteiros de linha (`subscription.ts:934`, `:1012`, `:2445-2454`).

O PR só sai de Draft com `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm test:rls` **todos** verdes.

- [ ] **Step 5: Atualizar a issue #36**

Marcar B1 e B2, com nota explícita de que o "valor projetado" de B1 **não foi entregue** e virou item próprio. Não marcar B1 como fechado sem essa ressalva: item marcado esconde escopo aberto, e é assim que um bloco some do radar.

Registrar na issue os três itens que este plano levantou e **não** fechou:

1. **Projeção do ciclo aberto** (o valor projetado do B1) — precisa de função read-only `SECURITY DEFINER` com tenant por `app_clinic_id_exigido()`, devolvendo só agregado, extraindo o predicado de `billing_apurar_ciclo` para não criar uma quarta definição de "ficha ativa". Sai por `/tlc-spec-driven`.
2. **`past_due` sem ciclo `falhou` não avisa terapeuta nem recepção** — `FaixaRecusa` exige `ciclo_status = 'falhou'`, `FaixaTrial` devolve `null` nesse estado sem débito, e o aviso desta task é coordenador-only. O caminho do vínculo `pausada` fica sem aviso para quem não contrata.
3. **O texto do bloco B da issue está desatualizado** sobre `past_due` (achados 1 e 2 deste plano). Corrigir o corpo da issue, para que a próxima pessoa não implemente a versão velha.

- [ ] **Step 6: Atualizar o grafo**

```bash
graphify update .
```

---

## Self-Review

**1. Cobertura da spec (bloco B da issue #36)**

| Requisito | Task | Situação |
| --- | --- | --- |
| B1 — cartão para conta `active` | 2 | Coberto |
| B1 — estado da assinatura | 2 | Coberto (`ROTULOS_ASSINATURA` + `StatusBadge`) |
| B1 — início/fim do ciclo corrente | 1, 2 | Coberto |
| B1 — data do próximo fechamento | 1, 2 | Coberto (`subscription.ciclo_atual_fim`, achado 4) |
| B1 — diferenciar recém-ativado de 5º ciclo | 2 | Coberto ("Ativa desde" + histórico logo abaixo) |
| B1 — fichas ativas acumuladas | — | **Fora de escopo, declarado.** Sai por `/tlc-spec-driven` |
| B1 — valor projetado | — | **Fora de escopo, declarado.** Idem |
| B2 — dizer o que aconteceu | 4 | Coberto |
| B2 — dizer o que destrava | 3, 4 | Coberto, e **corrigindo a issue** (achados 1 e 2) |
| B2 — não prometer reativação automática | 4 | **Deliberadamente não seguido:** a reativação em `past_due` É automática (`subscription.ts:2445`). A copy diz a verdade medida e separa o caso pós-cancelamento, que é o que a issue queria proteger |

**2. Varredura de placeholder:** nenhum "TBD", "similar à Task N", "adicionar tratamento de erro" ou passo sem código. Todo teste está escrito por extenso; todo componente e consulta, também.

**3. Consistência de tipos:**

- `CicloCorrente` é definido na Task 1 e consumido, com os mesmos nomes de campo, nas Tasks 2 e 4.
- `AssinaturaStatus` é definido na Task 1 e usado como chave de `ROTULOS_ASSINATURA` na Task 2; as cinco chaves batem com `subscriptionStatus.enumValues` (`schema.ts:1892-1898`).
- `frasePrazoCarencia` é definido na Task 3 e chamado na página na Task 4; `EntradaPrazoCarencia` é satisfeito estruturalmente tanto por `EntradaAvisoRecusa` quanto por `CicloCorrente`.
- `debitoCentavos` vem de `SituacaoConta`, que a página já lê em `obterSituacaoConta(ctx)`.
- Props do DS conferidas contra o código: `Alert` (`severidade`, `titulo`), `Card` (`titulo`), `StatusBadge` (`variante`), `DataRow` (`title`, `subtitle`, `trailing`).
- Nomes de coluna conferidos contra `src/db/schema.ts:1932-2011` (`subscription`) e contra `clinic.timezone`, já lido por `recusa-ativa.ts:62`.
