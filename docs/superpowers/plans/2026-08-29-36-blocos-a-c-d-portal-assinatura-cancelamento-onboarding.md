# Issue #36 — Blocos A, C e D: histórico de cobranças, cancelamento pela UI e checklist de onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao coordenador as três coisas que o produto ainda não tem depois da ativação: ver o que foi cobrado (A), cancelar a assinatura sem abrir chamado (C) e descobrir a ordem do onboarding sem tentativa e erro (D).

**Architecture:** Três frentes independentes sobre trilhos que já existem. **A** é leitura pura: `billing_cycle` já guarda tudo (`inicio`, `fim`, `pacientes_contados`, `valor_centavos`, `status`, `vencimento_cobranca`, `cobrado_em`) e já tem `GRANT SELECT` de tabela para `app_role` (`0071:237`) mais a policy `billing_cycle_select` (`0085:140`) — nenhuma migração. **C** expõe pela UI um corte que o servidor já sabe fazer: o privado `revogarECortarAssinatura` (`subscription.ts:886`) já aceita `statusEsperado: "active"`; o que falta é um orquestrador por clínica e a server action. **D** deriva o progresso do estado real do banco (4 `EXISTS` numa transação de tenant), sem coluna de flag.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Drizzle ORM sobre Postgres com RLS, Tailwind v4 + design system do repo (`src/components/ui/**`), Vitest (`pnpm test`) e Vitest integration (`pnpm test:rls`), Testing Library.

**Spec:** [GitHub issue #36](https://github.com/rsutil/iris/issues/36) — "Fase 7 — Self-Service & Growth", blocos A, C e D. As decisões que a issue deixou em aberto foram ratificadas com o Rômulo em 29/08/2026 e estão em "Decisões ratificadas" abaixo.

---

## Escopo deste plano — e o que ele NÃO cobre

Cobre: **A1, A2, C1, C2, C3, D1 (já decidido, vira código sem task de spec), D2, D3, D4**.

**Não cobre, de propósito:**

- **A3 e A4.** A3 é a decisão sobre o link da fatura, e ela caiu em migração (`invoice_url` + `GRANT` de coluna). Sai por `/tlc-spec-driven`, em plano próprio. A4 depende de A3.
- **Bloco B** (cartão "Sua assinatura", `past_due` explicado) e **Bloco E** (verificação de campo em produção). Não foram pedidos nesta rodada.

## Achados de medição que mudam a issue

Medidos no repo em 29/08/2026, antes de escrever este plano. Quem for executar precisa deles porque contradizem o texto da issue:

1. **Bloco C: a porta que a issue diz existir NÃO existe.** A issue afirma "A porta `cancelarAssinatura` existe (`src/lib/billing/subscription.ts`) e é chamada por rota interna e pelos testes". Não existe função com esse nome em lugar nenhum de `src/`. O que existe:
   - `cancelarAssinaturasComCarenciaVencida()` (`subscription.ts:925`) — varredura de LOTE, sem clínica alvo, disparada pelo job;
   - `revogarECortarAssinatura()` (`subscription.ts:886`) — **privada**, é o corte inteiro (gateway → congelar → UPDATE), e já recebe `statusEsperado: "active" | "past_due"`;
   - `BillingProvider.cancelarVinculo()` (`provider/types.ts:536`) — só o lado do gateway.

   Consequência: **C1 não é "server action fina sobre porta existente"**. C1 tem de expor um orquestrador por clínica em `subscription.ts` reusando `revogarECortarAssinatura`, e só então a action. O escopo de C1 cresce, e a Definição de Pronto de C1 muda (Task 3 abaixo).

2. **`billing_cycle` já é legível por `app_role`.** `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role` (`0001:21`) não alcança tabelas criadas depois, mas a `0071:237` concede `GRANT SELECT ON billing_cycle TO app_role` explicitamente, e nenhum `REVOKE` jamais tocou a tabela (documentado em `0100:24`, `0101:38`, `0106:38`). **A1 não precisa de migração nenhuma.**

3. **Não existe `src/app/(app)/page.tsx`.** Usuário autenticado em `/` é redirecionado para `/agenda` (`src/app/page.tsx:26`). A "home da app" do D3 é **`/agenda`**.

4. **A tabela do DS já rola sozinha.** `Table` (`src/components/ui/table.tsx:9`) envolve o `<table>` num `div` com `overflow-auto`. O requisito de A2 ("tabela larga rola dentro do próprio `overflow-x`, nunca no `<body>`") é atendido por usar o componente — e o teste de A2 fixa isso para que ninguém troque por um `<table>` cru depois.

## Decisões ratificadas (Rômulo, 29/08/2026)

- **D1 — régua de "concluído" e comportamento:** o checklist é **dispensável, sem persistência em banco**. Nenhuma coluna de flag. Quatro passos, todos derivados do banco:

  | Passo | Prova (consulta) | Rota |
  | --- | --- | --- |
  | Dados da clínica | `clinic.razao_social IS NOT NULL AND clinic.endereco_cep IS NOT NULL` | `/clinica/dados` |
  | 2º usuário na equipe | existe `user_role` da clínica com `user_id <> ctx.userId` | `/equipe` |
  | Agenda configurada | existe `janela_trabalho` da clínica | `/agenda` |
  | 1º paciente | existe `patient` da clínica | `/pacientes` |

- **D4 — "agora não" por item.** O Rômulo pediu que o usuário possa pular **qualquer item** com um "agora não". Como a decisão de D1 foi *sem persistência em banco*, o "agora não" mora no **`localStorage` do navegador** (por viewer, por clínica), nunca em coluna. É conveniência de leitura, não estado de negócio: se o `localStorage` for limpo, o item volta — e voltar é o comportamento correto, porque o passo continua realmente pendente. Todo acesso ao `localStorage` vai dentro de `try/catch`, porque em navegador com dados de site bloqueados o próprio acessor lança.

- **A1 — o histórico exclui o ciclo `aberto`.** Ciclo `aberto` é o ciclo corrente, que é assunto do cartão do **Bloco B**, não do histórico. Mostrá-lo aqui renderizaria `valor_centavos = 0` e `pacientes_contados = 0` na mesma tabela das cobranças reais, como se fossem uma fatura de R$ 0,00. **Consequência esperada em produção hoje:** a única clínica ativa tem exatamente um ciclo, `aberto` (13/08→12/09). O histórico dela vai renderizar o **empty state** — isso é o comportamento correto, não um bug de predicado. Só deixa de ser vazio no primeiro fechamento (E1, 12/09/2026).

## Global Constraints

Copiadas verbatim das fontes; valem para **toda** task deste plano.

- **Idioma:** documentação, copy de UI e mensagens ao usuário em **pt-BR**. Mensagens de commit em **inglês** (`docs/arquitetura/convencoes-de-codigo.md`), no formato Conventional Commits, com `, issue #36` no fim do subject — é o padrão dos commits recentes do repo (`fix(css): remove padrão Tailwind inválido de comentário, issue #185`).
- **Nunca `ctx` em módulo `"use server"`.** Nenhuma função exportada de um arquivo `actions.ts` pode aceitar `TenantContext` como parâmetro — vira endpoint client-invocável com tenant forjável (#55). O `ctx` é sempre derivado dentro da action via `await getTenantContext()`.
- **Nenhuma query de produto fora de `withTenant`.** Leitura de dado de tenant passa por `withTenant(ctx, (tx) => ...)` (`src/db/rls.ts:27`), que roda sob `app_role` com RLS ativa.
- **`"use client"` é do MÓDULO.** Não exportar helper de servidor do mesmo arquivo que tem a diretiva.
- **Design system, nunca CSS solto.** Componentes de `src/components/ui/**`. Tokens CSS (`var(--text-primary)`, `var(--surface-card)`, …), nunca cor literal.
- **Acessibilidade é requisito de 1ª classe**, não polimento: par ícone+rótulo textual nos selos, `scope="col"` nos cabeçalhos, foco visível, alvo de toque ≥ 44px.
- **Tailwind varre comentário.** Nunca escrever um utilitário Tailwind arbitrário (`pb-[env(...)]`) dentro de comentário de CSS ou de `.md` do projeto — o scanner o transforma em CSS inválido e o erro aponta uma linha que não existe.
- **Verde de `vitest run` não prova int-test.** Arquivo `*.int.test.ts` só roda com `pnpm test:rls` (`--config vitest.integration.config.ts`). Sempre conferir a **contagem** de testes executados, não a cor.
- **Fixtures de int-test não podem colidir.** E-mail de `app_user` é `UNIQUE` global; usar sufixo próprio do arquivo (ex.: `coord.a.histciclos@t.com`). Limpeza por `DELETE` escopado às linhas do próprio arquivo, **nunca `TRUNCATE`** de tabela compartilhada — `TRUNCATE` colide com os outros int-tests que rodam em paralelo.
- **Comandos de verificação:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:rls`. Formatação: rodar `pnpm exec prettier --write` **só nos arquivos tocados** — `pnpm format` reformata o repositório inteiro.

## File Structure

**Bloco A**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/app/(app)/assinatura/queries.ts` *(novo)* | `listarCiclosDaClinica` — leitura tenant-scoped do histórico. Só query. |
| `src/app/(app)/assinatura/historico-cobrancas.tsx` *(novo)* | Componente **puro** de apresentação: recebe `ciclos`, renderiza tabela ou empty state. Sem acesso a banco — é o que o torna testável sem Postgres. |
| `src/app/(app)/assinatura/historico-cobrancas.test.tsx` *(novo)* | Teste de componente (RTL). |
| `src/lib/billing/rotulos-ciclo.ts` *(novo)* | Mapa exaustivo `billing_cycle_status` → rótulo pt-BR + variante de selo. Módulo próprio, sem `server-only`, para ser importável do componente cliente e do servidor. |
| `src/lib/billing/rotulos-ciclo.test.ts` *(novo)* | Fixa a exaustividade do mapa. |
| `db/tests/historico-ciclos-rls.int.test.ts` *(novo)* | Isolamento cross-tenant de `listarCiclosDaClinica`. |
| `src/app/(app)/assinatura/page.tsx` *(modificar)* | Passa a buscar o histórico e renderizar a seção. |

**Bloco C**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/billing/subscription.ts` *(modificar)* | Novo export `cancelarAssinaturaDaClinica` — o orquestrador por clínica, sobre o `revogarECortarAssinatura` já existente. |
| `src/app/(app)/assinatura/actions.ts` *(modificar)* | `cancelarAssinaturaAction` — deriva `ctx`, exige `coordenador`, delega. Zero regra de negócio. |
| `src/app/(app)/assinatura/cancelar-assinatura.tsx` *(novo)* | Componente cliente: botão + `Dialog` de confirmação com a copy do corte imediato. |
| `src/app/(app)/assinatura/cancelar-assinatura.test.tsx` *(novo)* | Teste de componente. |
| `src/lib/billing/cancelamento-voluntario.int.test.ts` *(novo)* | Caminho completo com ida-volta-ida. |

**Bloco D**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/onboarding/passos.ts` *(novo)* | Definição pura dos 4 passos (id, título, descrição, rota) + tipos. Sem banco, sem React. |
| `src/app/(app)/onboarding-queries.ts` *(novo)* | `obterProgressoOnboarding(ctx)` — os 4 `EXISTS` numa única transação de tenant. |
| `src/app/(app)/checklist-onboarding.tsx` *(novo)* | Componente cliente: renderiza os passos, "agora não" por item, some quando tudo concluído/pulado. |
| `src/app/(app)/checklist-onboarding.test.tsx` *(novo)* | Teste de componente, incluindo o `localStorage` indisponível. |
| `db/tests/onboarding-progresso-rls.int.test.ts` *(novo)* | Progresso real contra o banco + isolamento cross-tenant. |
| `src/app/(app)/agenda/page.tsx` *(modificar)* | Monta o checklist para `coordenador`. |

---

## Task 1: A1 — `listarCiclosDaClinica`

**Files:**
- Create: `src/app/(app)/assinatura/queries.ts`
- Create: `db/tests/historico-ciclos-rls.int.test.ts`
- Test: `db/tests/historico-ciclos-rls.int.test.ts`

**Interfaces:**
- Consumes: `withTenant`, `TenantContext` (`@/db/rls`); `billingCycle` (`@/db/schema`).
- Produces:
  - `interface CicloDoHistorico { id: string; inicio: Date; fim: Date; status: CicloStatus; pacientesContados: number; valorCentavos: number; vencimentoCobranca: Date | null; cobradoEm: Date | null; }`
  - `type CicloStatus = (typeof billingCycleStatus.enumValues)[number]`
  - `async function listarCiclosDaClinica(ctx: TenantContext, opcoes?: { limite?: number; offset?: number }): Promise<CicloDoHistorico[]>`
  - `const LIMITE_PADRAO_HISTORICO = 12`

- [ ] **Step 1: Escrever o teste de integração que falha**

Cria `db/tests/historico-ciclos-rls.int.test.ts`. Repare em três coisas que não são estilo: a limpeza é por `DELETE` escopado (nunca `TRUNCATE`, que derruba os int-tests paralelos), os e-mails têm sufixo exclusivo deste arquivo (`app_user.email` é `UNIQUE` global) e o oráculo é sempre relido pela conexão dona.

```ts
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-00000036a101";
const CLINIC_B = "00000000-0000-0000-0000-00000036b101";
const U_COORD_A = "00000000-0000-0000-0000-00000036c101";
const SUB_A = "00000000-0000-0000-0000-00000036501a";
const SUB_B = "00000000-0000-0000-0000-00000036501b";
// Ciclos de A: um pago (mais antigo), um recusado, um aberto (não deve aparecer).
const CICLO_A_PAGO = "00000000-0000-0000-0000-0000003600a1";
const CICLO_A_FALHOU = "00000000-0000-0000-0000-0000003600a2";
const CICLO_A_ABERTO = "00000000-0000-0000-0000-0000003600a3";
const CICLO_B_PAGO = "00000000-0000-0000-0000-0000003600b1";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let listarCiclosDaClinica: typeof import("@/app/(app)/assinatura/queries").listarCiclosDaClinica;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("listarCiclosDaClinica (RLS/histórico)", () => {
  beforeAll(async () => {
    ({ listarCiclosDaClinica } = await import(
      "@/app/(app)/assinatura/queries"
    ));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // DELETE escopado, na ordem das FKs. TRUNCATE aqui derrubaria os outros
    // int-tests de billing que rodam em paralelo.
    await owner`DELETE FROM billing_cycle WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM subscription WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM app_user WHERE id = ${U_COORD_A}`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (histórico ciclos)', false),
      (${CLINIC_B}, 'Clínica B (histórico ciclos)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.histciclos@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner`INSERT INTO subscription (id, clinic_id, status, provider) VALUES
      (${SUB_A}, ${CLINIC_A}, 'active', 'asaas'),
      (${SUB_B}, ${CLINIC_B}, 'active', 'asaas')`;
    await owner`INSERT INTO billing_cycle
      (id, clinic_id, subscription_id, inicio, fim, status,
       pacientes_contados, valor_centavos, vencimento_cobranca, cobrado_em) VALUES
      (${CICLO_A_PAGO}, ${CLINIC_A}, ${SUB_A},
       '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', 'pago',
       4, 15600, '2026-07-08T00:00:00Z', '2026-07-05T00:00:00Z'),
      (${CICLO_A_FALHOU}, ${CLINIC_A}, ${SUB_A},
       '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', 'falhou',
       6, 23400, '2026-08-08T00:00:00Z', NULL),
      (${CICLO_A_ABERTO}, ${CLINIC_A}, ${SUB_A},
       '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', 'aberto',
       0, 0, NULL, NULL),
      (${CICLO_B_PAGO}, ${CLINIC_B}, ${SUB_B},
       '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', 'pago',
       99, 999900, '2026-08-08T00:00:00Z', '2026-08-02T00:00:00Z')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("não vaza ciclo de outra clínica", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    // O ciclo da B tem valor 999900 — inconfundível se vazar.
    expect(r.map((c) => c.id)).not.toContain(CICLO_B_PAGO);
    expect(r.map((c) => c.valorCentavos)).not.toContain(999900);
  });

  test("exclui o ciclo aberto (é assunto do cartão do ciclo corrente)", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    expect(r.map((c) => c.id)).not.toContain(CICLO_A_ABERTO);
  });

  test("ordena por fim DESC — o mais recente primeiro", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    expect(r.map((c) => c.id)).toEqual([CICLO_A_FALHOU, CICLO_A_PAGO]);
  });

  test("devolve Date de verdade, não string do driver", async () => {
    const [primeiro] = await listarCiclosDaClinica(ctxA);
    expect(primeiro?.fim).toBeInstanceOf(Date);
    expect(primeiro?.cobradoEm).toBeNull();
  });

  test("pagina sem repetir nem pular linha", async () => {
    const pagina1 = await listarCiclosDaClinica(ctxA, { limite: 1 });
    const pagina2 = await listarCiclosDaClinica(ctxA, { limite: 1, offset: 1 });
    expect(pagina1.map((c) => c.id)).toEqual([CICLO_A_FALHOU]);
    expect(pagina2.map((c) => c.id)).toEqual([CICLO_A_PAGO]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls -- db/tests/historico-ciclos-rls.int.test.ts`

Expected: FAIL na resolução do módulo — `Cannot find module '@/app/(app)/assinatura/queries'`.

Se o resultado for **`0 tests`** ou "skipped", **pare**: significa que `hasDb` é falso (Postgres local fora do ar ou `MIGRATION_DATABASE_URL` ausente). Verde com tudo pulado é vermelho disfarçado. Suba o banco (`docker compose -f infra/docker-compose.yml up -d`, porta 5433) e confira o `.env` antes de continuar.

- [ ] **Step 3: Escrever a query**

Cria `src/app/(app)/assinatura/queries.ts`:

```ts
import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { billingCycle, billingCycleStatus } from "@/db/schema";

export type CicloStatus = (typeof billingCycleStatus.enumValues)[number];

/**
 * Uma linha do histórico de cobranças, do jeito que a tela precisa.
 *
 * Todas as colunas saem do `select` tipado do Drizzle, e não de `sql` cru: em
 * template `sql<Date>` o driver devolve **string** e o `Date` só existe no tipo
 * — o formatador da tela quebraria em runtime com o typecheck verde.
 */
export interface CicloDoHistorico {
  id: string;
  inicio: Date;
  fim: Date;
  status: CicloStatus;
  pacientesContados: number;
  valorCentavos: number;
  vencimentoCobranca: Date | null;
  cobradoEm: Date | null;
}

/**
 * 12 ≈ um ano de ciclos mensais: cabe numa tela sem paginar para a esmagadora
 * maioria, e o `offset` existe para quem passar disso.
 */
export const LIMITE_PADRAO_HISTORICO = 12;

/**
 * Histórico de cobranças da clínica corrente (#36, bloco A1).
 *
 * ## Por que `status <> 'aberto'`
 *
 * Ciclo `aberto` é o ciclo CORRENTE — ainda não apurado, com
 * `pacientes_contados = 0` e `valor_centavos = 0` por construção. Listá-lo aqui
 * o renderizaria ao lado das cobranças reais como se fosse uma fatura de
 * R$ 0,00. O ciclo corrente é assunto do cartão do bloco B, que mostra
 * projeção, não fatura.
 *
 * ## Ordenação e paginação
 *
 * `fim DESC` serve o índice `billing_cycle_clinic_fim_idx` (clinic_id, fim
 * DESC). O desempate por `id DESC` não é cosmético: sem ele, dois ciclos com o
 * mesmo `fim` sairiam em ordem arbitrária e uma linha poderia aparecer nas duas
 * páginas — ou em nenhuma.
 *
 * A leitura sai por `withTenant` (`app_role`, RLS ativa). `billing_cycle` tem
 * `GRANT SELECT` de tabela desde a `0071:237` e a policy `billing_cycle_select`
 * resolve o tenant por `app_clinic_id_exigido()` (`0085:140`) — o filtro por
 * clínica é do BANCO, e o predicado abaixo não o repete de propósito: duplicá-lo
 * criaria uma segunda fonte de verdade sobre isolamento que poderia divergir da
 * policy sem ninguém notar.
 */
export async function listarCiclosDaClinica(
  ctx: TenantContext,
  opcoes?: { limite?: number; offset?: number },
): Promise<CicloDoHistorico[]> {
  const limite = opcoes?.limite ?? LIMITE_PADRAO_HISTORICO;
  const offset = opcoes?.offset ?? 0;

  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: billingCycle.id,
        inicio: billingCycle.inicio,
        fim: billingCycle.fim,
        status: billingCycle.status,
        pacientesContados: billingCycle.pacientesContados,
        valorCentavos: billingCycle.valorCentavos,
        vencimentoCobranca: billingCycle.vencimentoCobranca,
        cobradoEm: billingCycle.cobradoEm,
      })
      .from(billingCycle)
      .where(and(ne(billingCycle.status, "aberto")))
      .orderBy(desc(billingCycle.fim), desc(billingCycle.id))
      .limit(limite)
      .offset(offset),
  );
}
```

Nota para quem implementa: o `and(...)` com um argumento só está ali porque o predicado ganha vizinhos com facilidade; se o lint reclamar de `and` unário, troque por `.where(ne(billingCycle.status, "aberto"))` — o `eq` importado some junto.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls -- db/tests/historico-ciclos-rls.int.test.ts`

Expected: PASS, **5 testes executados** (conferir a contagem, não a cor).

Se aparecer `permission denied for table billing_cycle`, a leitura não é problema de policy: é `GRANT`. Confirme medindo, no psql local:

```sql
SELECT has_table_privilege('app_role', 'billing_cycle', 'SELECT');
```

- [ ] **Step 5: Typecheck e lint**

Run: `pnpm typecheck && pnpm lint`
Expected: ambos sem erro.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/assinatura/queries.ts" db/tests/historico-ciclos-rls.int.test.ts
git commit -m "feat(billing): add tenant-scoped billing cycle history query, issue #36"
```

---

## Task 2: A2 — seção "Histórico de cobranças" em `/assinatura`

**Files:**
- Create: `src/lib/billing/rotulos-ciclo.ts`
- Create: `src/lib/billing/rotulos-ciclo.test.ts`
- Create: `src/app/(app)/assinatura/historico-cobrancas.tsx`
- Create: `src/app/(app)/assinatura/historico-cobrancas.test.tsx`
- Modify: `src/app/(app)/assinatura/page.tsx:48-171`
- Test: `src/lib/billing/rotulos-ciclo.test.ts`, `src/app/(app)/assinatura/historico-cobrancas.test.tsx`

**Interfaces:**
- Consumes: `CicloDoHistorico`, `CicloStatus`, `listarCiclosDaClinica`, `LIMITE_PADRAO_HISTORICO` (Task 1); `formatarBRL` (`@/lib/billing/calculator`); `Table`/`TableBody`/`TableCaption`/`TableCell`/`TableHead`/`TableHeader`/`TableRow` (`@/components/ui/table`); `StatusBadge` (`@/components/ui/patterns/status-badge`); `EmptyState` (`@/components/ui/empty-state`).
- Produces:
  - `const ROTULOS_CICLO: Record<CicloStatus, { rotulo: string; variante: BadgesVariantes }>`
  - `function HistoricoCobrancas(props: { ciclos: CicloDoHistorico[] }): JSX.Element`

- [ ] **Step 1: Escrever o teste do mapa de rótulos**

Cria `src/lib/billing/rotulos-ciclo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { billingCycleStatus } from "@/db/schema";
import { ROTULOS_CICLO } from "./rotulos-ciclo";

describe("ROTULOS_CICLO", () => {
  it("cobre TODO valor do enum billing_cycle_status", () => {
    // Enum novo sem rótulo renderiza o status cru do banco na tela da clínica.
    // Este caso é o que impede isso — e ele lê o enum do schema, não uma cópia.
    expect(Object.keys(ROTULOS_CICLO).sort()).toEqual(
      [...billingCycleStatus.enumValues].sort(),
    );
  });

  it("não usa a variante de sucesso para estado de falha", () => {
    expect(ROTULOS_CICLO.falhou.variante).toBe("error");
    expect(ROTULOS_CICLO.devido.variante).toBe("warning");
    expect(ROTULOS_CICLO.pago.variante).toBe("success");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- src/lib/billing/rotulos-ciclo.test.ts`
Expected: FAIL — `Cannot find module './rotulos-ciclo'`.

- [ ] **Step 3: Escrever o mapa**

Cria `src/lib/billing/rotulos-ciclo.ts`. **Sem `import "server-only"`**: este módulo é importado por componente cliente.

```ts
import type { BadgesVariantes } from "@/components/ui/patterns/status-badge";
import type { CicloStatus } from "@/app/(app)/assinatura/queries";

/**
 * Vocabulário do banco → vocabulário da clínica (#36, bloco A2).
 *
 * `Record<CicloStatus, …>` e não um objeto solto: o tipo é exaustivo, então um
 * valor novo em `billing_cycle_status` quebra o `pnpm typecheck` em vez de
 * renderizar o identificador cru do Postgres na tela de quem paga.
 *
 * `cobrado` é LEGADO (ver `schema.ts`): ficou de quando o job carimbava o ciclo
 * sem emitir cobrança nenhuma. O rótulo diz isso em vez de fingir que houve
 * fatura.
 */
export const ROTULOS_CICLO: Record<
  CicloStatus,
  { rotulo: string; variante: BadgesVariantes }
> = {
  aberto: { rotulo: "Em aberto", variante: "info" },
  apurado: { rotulo: "Apurado", variante: "info" },
  cobrado: { rotulo: "Fechado (registro antigo)", variante: "neutral" },
  aguardando_pagamento: { rotulo: "Aguardando pagamento", variante: "warning" },
  pago: { rotulo: "Pago", variante: "success" },
  falhou: { rotulo: "Cobrança recusada", variante: "error" },
  devido: { rotulo: "Em débito", variante: "warning" },
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- src/lib/billing/rotulos-ciclo.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 5: Escrever o teste do componente**

Cria `src/app/(app)/assinatura/historico-cobrancas.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoricoCobrancas } from "./historico-cobrancas";
import type { CicloDoHistorico } from "./queries";

const CICLO_PAGO: CicloDoHistorico = {
  id: "c1",
  inicio: new Date("2026-06-01T00:00:00Z"),
  fim: new Date("2026-07-01T00:00:00Z"),
  status: "pago",
  pacientesContados: 4,
  valorCentavos: 15600,
  vencimentoCobranca: new Date("2026-07-08T00:00:00Z"),
  cobradoEm: new Date("2026-07-05T00:00:00Z"),
};

const CICLO_RECUSADO: CicloDoHistorico = {
  ...CICLO_PAGO,
  id: "c2",
  inicio: new Date("2026-07-01T00:00:00Z"),
  fim: new Date("2026-08-01T00:00:00Z"),
  status: "falhou",
  pacientesContados: 6,
  valorCentavos: 23400,
  vencimentoCobranca: new Date("2026-08-08T00:00:00Z"),
  cobradoEm: null,
};

describe("HistoricoCobrancas", () => {
  it("mostra empty state quando nenhum ciclo fechou ainda", () => {
    render(<HistoricoCobrancas ciclos={[]} />);
    expect(
      screen.getByText(/nenhuma cobrança fechada ainda/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renderiza período, fichas, valor e situação de cada ciclo", () => {
    render(<HistoricoCobrancas ciclos={[CICLO_RECUSADO, CICLO_PAGO]} />);
    const linhas = screen.getAllByRole("row");
    // 1 cabeçalho + 2 ciclos
    expect(linhas).toHaveLength(3);
    const primeira = within(linhas[1]!);
    expect(primeira.getByText("6")).toBeInTheDocument();
    expect(primeira.getByText("R$ 234,00")).toBeInTheDocument();
    expect(primeira.getByText(/cobrança recusada/i)).toBeInTheDocument();
  });

  it("mostra travessão no vencimento ausente em vez de data inventada", () => {
    render(
      <HistoricoCobrancas
        ciclos={[{ ...CICLO_PAGO, vencimentoCobranca: null }]}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("mantém a rolagem horizontal DENTRO da tabela, nunca no body", () => {
    // O `Table` do DS já envolve o <table> num container com overflow-auto.
    // Este caso existe para que trocar por um <table> cru quebre o build.
    render(<HistoricoCobrancas ciclos={[CICLO_PAGO]} />);
    const tabela = screen.getByRole("table");
    const container = tabela.parentElement;
    expect(container?.className).toContain("overflow-auto");
  });

  it("cabeçalhos têm scope=col", () => {
    render(<HistoricoCobrancas ciclos={[CICLO_PAGO]} />);
    for (const th of screen.getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `pnpm test -- "src/app/(app)/assinatura/historico-cobrancas.test.tsx"`
Expected: FAIL — `Cannot find module './historico-cobrancas'`.

- [ ] **Step 7: Escrever o componente**

Cria `src/app/(app)/assinatura/historico-cobrancas.tsx`. Componente **puro**, sem `"use client"` e sem acesso a banco — é isso que permite testá-lo sem servidor.

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import { formatarBRL } from "@/lib/billing/calculator";
import { ROTULOS_CICLO } from "@/lib/billing/rotulos-ciclo";
import type { CicloDoHistorico } from "./queries";

/**
 * Datas em UTC de propósito: o ciclo é gravado em `timestamptz` e a fronteira
 * dele é o instante, não o dia local de quem olha. Renderizar no fuso do
 * navegador faria o mesmo ciclo aparecer com data diferente em duas máquinas da
 * mesma clínica.
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

export interface HistoricoCobrancasProps {
  ciclos: CicloDoHistorico[];
}

export function HistoricoCobrancas({ ciclos }: HistoricoCobrancasProps) {
  if (ciclos.length === 0) {
    return (
      <EmptyState
        title="Nenhuma cobrança fechada ainda"
        description="A primeira fatura nasce quando o ciclo corrente fechar. Até lá não há nada a pagar — e nada some daqui depois."
      />
    );
  }

  return (
    <Table>
      <TableCaption>
        Cada linha é um ciclo já encerrado. O valor é o das fichas que tiveram
        movimento naquele período.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Período</TableHead>
          <TableHead scope="col">Fichas ativas</TableHead>
          <TableHead scope="col">Valor</TableHead>
          <TableHead scope="col">Situação</TableHead>
          <TableHead scope="col">Vencimento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ciclos.map((ciclo) => {
          const { rotulo, variante } = ROTULOS_CICLO[ciclo.status];
          return (
            <TableRow key={ciclo.id}>
              <TableCell className="whitespace-nowrap">
                {formatador.format(ciclo.inicio)} a{" "}
                {formatador.format(ciclo.fim)}
              </TableCell>
              <TableCell className="font-mono">
                {ciclo.pacientesContados}
              </TableCell>
              <TableCell className="font-mono font-semibold">
                {formatarBRL(ciclo.valorCentavos)}
              </TableCell>
              <TableCell>
                <StatusBadge variante={variante}>{rotulo}</StatusBadge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {dataOuTravessao(ciclo.vencimentoCobranca)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `pnpm test -- "src/app/(app)/assinatura/historico-cobrancas.test.tsx"`
Expected: PASS, 5 testes.

- [ ] **Step 9: Montar a seção na página**

Em `src/app/(app)/assinatura/page.tsx`, adicionar os imports:

```tsx
import { HistoricoCobrancas } from "./historico-cobrancas";
import { listarCiclosDaClinica } from "./queries";
```

Dentro de `AssinaturaPage`, logo depois de `const documentoAtual = ...` (linha 71), buscar o histórico. **Só para quem contrata**: terapeuta e recepção não têm o que fazer com a fatura, e a ida ao banco não se justifica na renderização deles.

```tsx
  const ciclos = podeContratar ? await listarCiclosDaClinica(ctx) : [];
```

E, **antes** da seção "Ativar a assinatura" (linha 145), inserir:

```tsx
      {podeContratar ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
            Histórico de cobranças
          </h2>
          <HistoricoCobrancas ciclos={ciclos} />
        </section>
      ) : null}
```

- [ ] **Step 10: Verificar a página inteira**

Run: `pnpm test -- "src/app/(app)/assinatura" && pnpm typecheck && pnpm lint`
Expected: tudo verde, sem teste novo quebrado em `formulario-ativacao.test.tsx`.

- [ ] **Step 11: Commit**

```bash
git add src/lib/billing/rotulos-ciclo.ts src/lib/billing/rotulos-ciclo.test.ts \
  "src/app/(app)/assinatura/historico-cobrancas.tsx" \
  "src/app/(app)/assinatura/historico-cobrancas.test.tsx" \
  "src/app/(app)/assinatura/page.tsx"
git commit -m "feat(billing): render billing history section on subscription page, issue #36"
```

---

## Task 3: C1 — orquestrador de cancelamento por clínica + server action

**Files:**
- Modify: `src/lib/billing/subscription.ts` (novo export perto de `cancelarAssinaturasComCarenciaVencida`, linha ~1020)
- Modify: `src/app/(app)/assinatura/actions.ts:1-17`
- Test: `src/lib/billing/cancelamento-voluntario.int.test.ts` (criado aqui com o caso mínimo; ampliado na Task 5)

**Interfaces:**
- Consumes: `revogarECortarAssinatura` (privada, mesmo módulo, `subscription.ts:886`); `notificarCancelamentoAssinatura` (`./notificacao-cancelamento`); `authDb`; `subscription` (schema); `getTenantContext` (`@/auth/tenant`); `requireRole` e `RoleError` (`@/auth/require-role`).
- Produces:
  - `type ResultadoCancelamentoVoluntario = { cancelada: true } | { cancelada: false; motivo: "sem_assinatura" | "estado_nao_cancelavel"; statusAtual: string | null }`
  - `async function cancelarAssinaturaDaClinica(clinicId: string, opcoes?: { agora?: Date }): Promise<ResultadoCancelamentoVoluntario>`
  - `type CancelamentoState = { erro?: string; sucesso?: boolean }`
  - `async function cancelarAssinaturaAction(prev: CancelamentoState, formData: FormData): Promise<CancelamentoState>`

> **Nota de escopo — leia antes de começar.** A issue diz que a porta `cancelarAssinatura` já existe. **Não existe.** Ver "Achados de medição" no topo. O que existe é `revogarECortarAssinatura`, privada, que já aceita `statusEsperado: "active"`. Esta task cria o orquestrador; ela é maior do que a issue sugere e isso é esperado.

- [ ] **Step 1: Escrever o teste de integração do caminho feliz**

Cria `src/lib/billing/cancelamento-voluntario.int.test.ts`. O provedor é o fake do repo, pelo mesmo motivo dos outros int-tests de billing: "o gateway foi chamado" precisa ser observável.

```ts
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDb } from "@tests/integration-env";
import { ID_PROVEDOR_FAKE, ProvedorFake } from "@tests/provedor-fake";

vi.mock("server-only", () => ({}));

vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE ? new ProvedorFake() : real.getProviderPorId(id),
  };
});

const { cancelarAssinaturaDaClinica } = await import("./subscription");

const CLINICA = "00000000-0000-0000-0000-00000036c201";
const USUARIO = "00000000-0000-0000-0000-00000036c202";
const SUB = "00000000-0000-0000-0000-00000036c203";
const CICLO = "00000000-0000-0000-0000-00000036c204";
const VINCULO = "vinc_fake_cancel_voluntario";

let owner: ReturnType<typeof postgres>;

async function limpar() {
  await owner`DELETE FROM billing_cycle WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM subscription WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM user_role WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM app_user WHERE id = ${USUARIO}`;
  await owner`DELETE FROM clinic WHERE id = ${CLINICA}`;
}

async function semear(status: "active" | "past_due" | "canceled") {
  await owner`INSERT INTO clinic (id, nome, is_demo)
    VALUES (${CLINICA}, 'Clínica cancelamento voluntário', false)`;
  await owner`INSERT INTO app_user (id, name, email)
    VALUES (${USUARIO}, 'Coord', 'coord.cancelvoluntario@t.com')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel)
    VALUES (${USUARIO}, ${CLINICA}, 'coordenador')`;
  await owner`INSERT INTO subscription
    (id, clinic_id, status, provider, provider_subscription_id,
     ciclo_atual_inicio, ciclo_atual_fim, ativada_em)
    VALUES (${SUB}, ${CLINICA}, ${status}, ${ID_PROVEDOR_FAKE}, ${VINCULO},
     '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z', '2026-08-01T00:00:00Z')`;
  await owner`INSERT INTO billing_cycle
    (id, clinic_id, subscription_id, inicio, fim, status,
     pacientes_contados, valor_centavos)
    VALUES (${CICLO}, ${CLINICA}, ${SUB},
     '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z', 'aberto', 5, 0)`;
}

describe.skipIf(!hasDb)("cancelarAssinaturaDaClinica", () => {
  beforeEach(async () => {
    owner ??= postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await limpar();
  });
  afterAll(async () => {
    await limpar();
    await owner?.end();
  });

  it("corta assinatura ativa: status canceled, cancelada_em gravada", async () => {
    await semear("active");
    const r = await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    expect(r).toEqual({ cancelada: true });

    // Oráculo é o banco RELIDO pela conexão dona — o retorno diria `true`
    // mesmo que o UPDATE tivesse sido um no-op.
    const [linha] = await owner`
      SELECT status, cancelada_em FROM subscription WHERE id = ${SUB}`;
    expect(linha?.status).toBe("canceled");
    expect(linha?.cancelada_em).toBeInstanceOf(Date);
  });

  it("congela o ciclo aberto como débito pro-rata", async () => {
    await semear("active");
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    const [ciclo] = await owner`
      SELECT status, valor_centavos FROM billing_cycle WHERE id = ${CICLO}`;
    expect(ciclo?.status).toBe("devido");
  });

  it("recusa cancelar quem já está cancelada, sem tocar o gateway", async () => {
    await semear("canceled");
    const r = await cancelarAssinaturaDaClinica(CLINICA);
    expect(r).toEqual({
      cancelada: false,
      motivo: "estado_nao_cancelavel",
      statusAtual: "canceled",
    });
  });

  it("recusa clínica sem assinatura", async () => {
    await owner`INSERT INTO clinic (id, nome, is_demo)
      VALUES (${CLINICA}, 'Clínica sem assinatura', false)`;
    const r = await cancelarAssinaturaDaClinica(CLINICA);
    expect(r).toEqual({
      cancelada: false,
      motivo: "sem_assinatura",
      statusAtual: null,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls -- src/lib/billing/cancelamento-voluntario.int.test.ts`
Expected: FAIL — `cancelarAssinaturaDaClinica is not a function`.

- [ ] **Step 3: Escrever o orquestrador**

Em `src/lib/billing/subscription.ts`, logo **depois** de `cancelarAssinaturasComCarenciaVencida` (que termina na linha ~1019) e **antes** da classe `ErroDeCorte`, inserir:

```ts
export type MotivoNaoCancelavel = "sem_assinatura" | "estado_nao_cancelavel";

export type ResultadoCancelamentoVoluntario =
  | { cancelada: true }
  | {
      cancelada: false;
      motivo: MotivoNaoCancelavel;
      /** O que a linha tinha quando recusamos. `null` quando não há linha. */
      statusAtual: string | null;
    };

/**
 * Cancelamento VOLUNTÁRIO, pedido pelo coordenador na tela (#36, bloco C1).
 *
 * ## Por que reusa `revogarECortarAssinatura`
 *
 * O corte é o mesmo ato do corte por carência: revogar no gateway, congelar o
 * ciclo aberto como débito e só então matar a linha — nessa ordem, que é o
 * desenho (ver o cabeçalho de `cancelarAssinaturasComCarenciaVencida`).
 * Reescrever as três escritas aqui divergiria exatamente onde a divergência é
 * irrecuperável: congelar depois do UPDATE deixaria a clínica cortada sem
 * débito, e o gate da #290 abriria a reativação de graça.
 *
 * ## Aceita `active` E `past_due`
 *
 * `past_due` é terminal por inadimplência (#319), mas a clínica inadimplente é
 * justamente quem mais quer sair. O `statusEsperado` do compare-and-set sai da
 * linha LIDA, e não de um literal: passar `'active'` para uma linha `past_due`
 * faria o UPDATE afetar 0 linhas em silêncio — depois de a autorização de Pix
 * Automático já ter sido revogada.
 *
 * ## Fail-closed, igual à varredura
 *
 * Falha no gateway ABORTA e propaga: nada é escrito e a assinatura continua
 * viva dos dois lados. Transicionar assim mesmo deixaria uma autorização de
 * débito automático viva no Asaas contra uma assinatura morta no Iris.
 *
 * O aviso por e-mail (#312) sai DEPOIS do corte confirmado e num `catch`
 * próprio: e-mail que não sai não pode desfazer um cancelamento que já
 * aconteceu no gateway.
 */
export async function cancelarAssinaturaDaClinica(
  clinicId: string,
  opcoes?: { agora?: Date },
): Promise<ResultadoCancelamentoVoluntario> {
  const agora = opcoes?.agora ?? new Date();

  const [linha] = await authDb
    .select({
      subscriptionId: subscription.id,
      clinicId: subscription.clinicId,
      status: subscription.status,
      provider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
    })
    .from(subscription)
    .where(eq(subscription.clinicId, clinicId))
    .limit(1);

  if (!linha) {
    return { cancelada: false, motivo: "sem_assinatura", statusAtual: null };
  }

  if (linha.status !== "active" && linha.status !== "past_due") {
    return {
      cancelada: false,
      motivo: "estado_nao_cancelavel",
      statusAtual: linha.status,
    };
  }

  await revogarECortarAssinatura(linha, agora, {
    motivo: "cancelamento pedido pela clínica",
    statusEsperado: linha.status,
  });

  try {
    await notificarCancelamentoAssinatura(linha.clinicId, linha.subscriptionId);
  } catch (e) {
    // Tag fixa e greppável. O cancelamento JÁ aconteceu no gateway e no banco;
    // relançar aqui faria a tela dizer "falhou" sobre um ato irreversível que
    // deu certo.
    console.warn("[billing-cancelamento-aviso] e-mail não enviado", {
      clinicId: linha.clinicId,
      erro: e instanceof Error ? e.message : String(e),
    });
  }

  return { cancelada: true };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test:rls -- src/lib/billing/cancelamento-voluntario.int.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Escrever a server action**

Em `src/app/(app)/assinatura/actions.ts`, acrescentar (mantendo `ativarAssinatura` intocada):

```ts
import { requireRole, RoleError } from "@/auth/require-role";
import { cancelarAssinaturaDaClinica } from "@/lib/billing/subscription";
import { revalidatePath } from "next/cache";

export type CancelamentoState = { erro?: string; sucesso?: boolean };

/**
 * Cancelamento pela tela (#36, C1). Sem regra de negócio: deriva o tenant,
 * exige coordenador e delega. A assinatura de `formData` existe só porque
 * `useActionState` a exige — nenhum campo dela é lido, e isso é de propósito:
 * o alvo do cancelamento é sempre a clínica do `ctx`, nunca um id que chegue
 * do cliente.
 */
export async function cancelarAssinaturaAction(
  _prev: CancelamentoState,
  _formData: FormData,
): Promise<CancelamentoState> {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch (e) {
    if (e instanceof RoleError) {
      return { erro: "Só a coordenação pode cancelar a assinatura." };
    }
    throw e;
  }

  const r = await cancelarAssinaturaDaClinica(ctx.clinicId);
  if (!r.cancelada) {
    return {
      erro:
        r.motivo === "sem_assinatura"
          ? "Esta clínica não tem assinatura ativa para cancelar."
          : "A assinatura não está em um estado que possa ser cancelado agora.",
    };
  }

  // A tarja de estado da conta mora no layout, e navegação client-side não
  // revalida layout sozinha (#285): sem isto a tela continuaria dizendo
  // "ativa" depois do corte.
  revalidatePath("/", "layout");
  return { sucesso: true };
}
```

- [ ] **Step 6: Verificar typecheck e lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erro. Em especial, nenhum aviso do guard de `"use server"` — a action não aceita `ctx`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/subscription.ts src/lib/billing/cancelamento-voluntario.int.test.ts \
  "src/app/(app)/assinatura/actions.ts"
git commit -m "feat(billing): add per-clinic subscription cancellation port and server action, issue #36"
```

---

## Task 4: C2 — UI de cancelamento com confirmação explícita

**Files:**
- Create: `src/app/(app)/assinatura/cancelar-assinatura.tsx`
- Create: `src/app/(app)/assinatura/cancelar-assinatura.test.tsx`
- Modify: `src/app/(app)/assinatura/page.tsx`
- Test: `src/app/(app)/assinatura/cancelar-assinatura.test.tsx`

**Interfaces:**
- Consumes: `cancelarAssinaturaAction`, `CancelamentoState` (Task 3); `SituacaoConta` (`@/lib/billing/estado-conta`); `Dialog`/`DialogContent`/`DialogTitle`/`DialogDescription`/`DialogTrigger`/`DialogClose` (`@/components/ui/dialog`); `Button`, `Alert`.
- Produces: `function CancelarAssinatura(props: { situacaoConta: SituacaoConta; acao?: AcaoCancelamento }): JSX.Element | null`

A copy tem de dizer exatamente o que a #290/#310 implementam, e não o que soa mais gentil: **o corte é imediato** (não há carência de cortesia), **o ciclo aberto vira débito pro-rata** e **pagar o débito não reativa a assinatura**.

- [ ] **Step 1: Escrever o teste**

Cria `src/app/(app)/assinatura/cancelar-assinatura.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CancelarAssinatura } from "./cancelar-assinatura";
import type { SituacaoConta } from "@/lib/billing/estado-conta";

const ATIVA: SituacaoConta = {
  estado: "ativa",
  podeEscrever: true,
  podeCadastrarPaciente: true,
  diasRestantesTrial: null,
  statusAssinatura: "active",
  debitoCentavos: 0,
};

const TRIAL: SituacaoConta = {
  ...ATIVA,
  estado: "trial_ativo",
  statusAssinatura: "free_tier",
  diasRestantesTrial: 3,
};

const CANCELADA: SituacaoConta = {
  ...ATIVA,
  estado: "cancelada",
  statusAssinatura: "canceled",
  podeEscrever: false,
  podeCadastrarPaciente: false,
};

describe("CancelarAssinatura", () => {
  it("não renderiza nada para quem não tem assinatura viva", () => {
    const { container } = render(<CancelarAssinatura situacaoConta={TRIAL} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza nada para assinatura já cancelada", () => {
    const { container } = render(
      <CancelarAssinatura situacaoConta={CANCELADA} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("exige confirmação: o clique no botão não cancela sozinho", async () => {
    const acao = vi.fn();
    render(<CancelarAssinatura situacaoConta={ATIVA} acao={acao} />);
    await userEvent.click(
      screen.getByRole("button", { name: /cancelar assinatura/i }),
    );
    expect(acao).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a confirmação diz corte imediato, débito do ciclo e que pagar não reativa", async () => {
    render(<CancelarAssinatura situacaoConta={ATIVA} />);
    await userEvent.click(
      screen.getByRole("button", { name: /cancelar assinatura/i }),
    );
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent(/imediat/i);
    expect(dialogo).toHaveTextContent(/débito/i);
    expect(dialogo).toHaveTextContent(/não reativa/i);
  });

  it("dispara a ação só depois de confirmar", async () => {
    const acao = vi.fn().mockResolvedValue({ sucesso: true });
    render(<CancelarAssinatura situacaoConta={ATIVA} acao={acao} />);
    await userEvent.click(
      screen.getByRole("button", { name: /cancelar assinatura/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /sim, cancelar/i }),
    );
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro devolvido pela ação", async () => {
    const acao = vi
      .fn()
      .mockResolvedValue({ erro: "Só a coordenação pode cancelar a assinatura." });
    render(<CancelarAssinatura situacaoConta={ATIVA} acao={acao} />);
    await userEvent.click(
      screen.getByRole("button", { name: /cancelar assinatura/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /sim, cancelar/i }),
    );
    expect(
      await screen.findByText(/só a coordenação pode cancelar/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- "src/app/(app)/assinatura/cancelar-assinatura.test.tsx"`
Expected: FAIL — `Cannot find module './cancelar-assinatura'`.

- [ ] **Step 3: Escrever o componente**

Cria `src/app/(app)/assinatura/cancelar-assinatura.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cancelarAssinaturaAction, type CancelamentoState } from "./actions";
import type { SituacaoConta } from "@/lib/billing/estado-conta";

type AcaoCancelamento = (
  prev: CancelamentoState,
  formData: FormData,
) => Promise<CancelamentoState> | CancelamentoState;

export interface CancelarAssinaturaProps {
  situacaoConta: SituacaoConta;
  /**
   * Costura de teste: em produção é sempre a server action real. Injetar a
   * ação evita que o teste de componente precise de servidor, banco e sessão.
   */
  acao?: AcaoCancelamento;
}

/**
 * Cancelamento pela tela (#36, bloco C2).
 *
 * Só aparece para assinatura VIVA (`active` / `past_due`). A inadimplente vê o
 * botão de propósito: `past_due` é terminal (#319) e é justamente quem mais
 * precisa de saída.
 */
export function CancelarAssinatura({
  situacaoConta,
  acao = cancelarAssinaturaAction,
}: CancelarAssinaturaProps) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState<
    CancelamentoState,
    FormData
  >(acao, {});

  const viva =
    situacaoConta.statusAssinatura === "active" ||
    situacaoConta.statusAssinatura === "past_due";
  if (!viva) return null;

  if (state.sucesso) {
    return (
      <Alert severidade="info" titulo="Assinatura cancelada">
        A cobrança recorrente foi encerrada. O ciclo que estava aberto virou
        débito proporcional aos dias já usados, e você continua com acesso de
        leitura e exportação a toda a base de pacientes.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variante="terciaria"
        onClick={() => setAberto(true)}
        disabled={isPending}
      >
        Cancelar assinatura
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogTitle>Cancelar a assinatura?</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-3 text-sm text-[var(--text-primary)]">
              <p>
                O corte é <strong>imediato</strong>: a autorização de débito no
                seu banco é revogada agora, sem período de cortesia.
              </p>
              <p>
                O ciclo que está aberto é encerrado e vira{" "}
                <strong>débito</strong> proporcional aos dias já usados. Ele
                continua devido depois do cancelamento.
              </p>
              <p>
                Pagar esse débito <strong>não reativa</strong> a assinatura —
                para voltar, é preciso contratar de novo por esta tela.
              </p>
              <p>
                A base de pacientes continua inteira e legível, e a exportação
                continua liberada.
              </p>
            </div>
          </DialogDescription>

          {state.erro ? (
            <Alert severidade="erro" titulo="Não foi possível cancelar">
              {state.erro}
            </Alert>
          ) : null}

          <form action={formAction} className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" variante="primaria" disabled={isPending}>
              {isPending ? "Cancelando…" : "Sim, cancelar assinatura"}
            </Button>
            <DialogClose asChild>
              <Button type="button" variante="terciaria" disabled={isPending}>
                Voltar
              </Button>
            </DialogClose>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Verificar antes de rodar:** `Button` aceita `"primaria" | "secundaria" | "terciaria" | "neutra"` (+ aliases em inglês) — conferido em `.design-sync/dts/components/ui/button.d.ts`. **Não existe variante `"perigo"`**, e a prop `risco` é deprecated e sem efeito visual: não usar. A prop `severidade` do `Alert` ainda precisa de conferência (`grep -n "severidade" src/components/ui/alert.tsx`) — use o nome real, não invente valor.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- "src/app/(app)/assinatura/cancelar-assinatura.test.tsx"`
Expected: PASS, 6 testes.

- [ ] **Step 5: Montar na página**

Em `src/app/(app)/assinatura/page.tsx`, importar e renderizar dentro da seção "Ativar a assinatura", logo abaixo de `<FormularioAtivacao ... />`:

```tsx
import { CancelarAssinatura } from "./cancelar-assinatura";
```

```tsx
            <FormularioAtivacao
              documentoAtual={documentoAtual}
              situacaoConta={situacaoConta}
            />
            <CancelarAssinatura situacaoConta={situacaoConta} />
```

- [ ] **Step 6: Verificar a a11y e a página**

Run: `pnpm test -- "src/app/(app)/assinatura" && pnpm typecheck && pnpm lint`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/assinatura/cancelar-assinatura.tsx" \
  "src/app/(app)/assinatura/cancelar-assinatura.test.tsx" \
  "src/app/(app)/assinatura/page.tsx"
git commit -m "feat(billing): add subscription cancellation UI with explicit confirmation, issue #36"
```

---

## Task 5: C3 — teste de integração do caminho completo (ida-volta-ida)

**Files:**
- Modify: `src/lib/billing/cancelamento-voluntario.int.test.ts` (criado na Task 3)
- Test: `src/lib/billing/cancelamento-voluntario.int.test.ts`

**Interfaces:**
- Consumes: `cancelarAssinaturaDaClinica` (Task 3); `aplicarStatusProvider` (`./subscription`); `levantarDebito` (`./debito`).
- Produces: nada — é task de teste.

O caso que importa aqui não é "cancelar funciona" (Task 3 já fixa isso). É a **ida-volta-ida**: cancelar → reativar → cancelar. Um `cancelada_em` que não é zerado na reativação faz o segundo pro-rata medir a partir de uma data antiga e **saturar no piso**, cobrando o mês inteiro de quem usou três dias. O oráculo tem de ser o **VALOR**, não o status: um teste que só confere `status = 'canceled'` passa verde com o valor errado.

- [ ] **Step 1: Acrescentar o caso de ida-volta-ida**

No fim do `describe` de `cancelamento-voluntario.int.test.ts`, acrescentar:

```ts
  it("ida-volta-ida: o segundo pro-rata mede do ciclo NOVO, não do carimbo antigo", async () => {
    await semear("active");

    // IDA — cancela no dia 15 de um ciclo de 01 a 31.
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    const [depoisDaIda] = await owner`
      SELECT valor_centavos FROM billing_cycle WHERE id = ${CICLO}`;
    const valorPrimeiroCorte = Number(depoisDaIda?.valor_centavos ?? 0);

    // VOLTA — reativação: o gateway confirma a nova autorização.
    // Assinatura posicional (`subscription.ts:346`):
    // `aplicarStatusProvider(providerSubscriptionId, statusProvider)`.
    // `"autorizada"` é do enum `StatusAssinaturaProvider`
    // (`provider/types.ts:56`: pendente | autorizada | pausada | cancelada).
    // O adapter da linha é resolvido pela COLUNA `subscription.provider`, que
    // a semeadura já gravou como `ID_PROVEDOR_FAKE` — não é parâmetro daqui.
    await aplicarStatusProvider(VINCULO, "autorizada");
    const [reativada] = await owner`
      SELECT status, cancelada_em FROM subscription WHERE id = ${SUB}`;
    expect(reativada?.status).toBe("active");
    // O carimbo TEM de sair. Deixado para trás, ele é a data de onde o segundo
    // pro-rata mediria — e o cálculo satura no piso.
    expect(reativada?.cancelada_em).toBeNull();

    // Ciclo novo, curto: 01/09 a 30/09, cancelado no dia 03.
    const CICLO_2 = "00000000-0000-0000-0000-00000036c205";
    await owner`UPDATE subscription
      SET ciclo_atual_inicio = '2026-09-01T00:00:00Z',
          ciclo_atual_fim = '2026-09-30T00:00:00Z'
      WHERE id = ${SUB}`;
    await owner`INSERT INTO billing_cycle
      (id, clinic_id, subscription_id, inicio, fim, status,
       pacientes_contados, valor_centavos)
      VALUES (${CICLO_2}, ${CLINICA}, ${SUB},
       '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z', 'aberto', 5, 0)`;

    // IDA de novo — 3 dias usados de 29.
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-09-03T12:00:00Z"),
    });
    const [depoisDaSegundaIda] = await owner`
      SELECT status, valor_centavos FROM billing_cycle WHERE id = ${CICLO_2}`;
    expect(depoisDaSegundaIda?.status).toBe("devido");

    // O ORÁCULO É O VALOR. 3 dias custam menos que 15 — se o carimbo antigo
    // tivesse sobrevivido, este valor bateria no ciclo inteiro e ficaria >=.
    const valorSegundoCorte = Number(depoisDaSegundaIda?.valor_centavos ?? 0);
    expect(valorSegundoCorte).toBeLessThan(valorPrimeiroCorte);
  });

  it("o débito do ciclo interrompido aparece para a tela", async () => {
    await semear("active");
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    // `levantarDebito` recebe o subscriptionId (`debito.ts:254`), não o
    // clinicId — o débito é da assinatura, e uma clínica pode ter tido mais de
    // uma linha ao longo do tempo.
    const debito = await levantarDebito(SUB);
    expect(debito.totalCentavos).toBeGreaterThan(0);
  });
```

Acrescentar aos imports do arquivo:

```ts
const { aplicarStatusProvider, cancelarAssinaturaDaClinica } = await import(
  "./subscription"
);
const { levantarDebito } = await import("./debito");
```

As duas assinaturas acima foram conferidas contra o código em 29/08/2026: `aplicarStatusProvider(providerSubscriptionId: string, statusProvider: StatusAssinaturaProvider): Promise<boolean>` (`subscription.ts:346`) e `levantarDebito(subscriptionId: string): Promise<DebitoLevantado>` (`debito.ts:254`, campo `totalCentavos`). Não precisam ser remedidas.

- [ ] **Step 2: Rodar**

Run: `pnpm test:rls -- src/lib/billing/cancelamento-voluntario.int.test.ts`
Expected: PASS, 6 testes.

Se o caso da ida-volta-ida **falhar** com `cancelada_em` não nulo, você achou um defeito real de produção, não um problema do teste: a reativação não está limpando o carimbo. Conserte na reativação (`aplicarStatusProvider`), zerando `canceladaEm` no `set(...)` da transição para `active`, e rode de novo.

- [ ] **Step 3: Provar que o teste morde (mutação)**

Reverta temporariamente a limpeza de `cancelada_em` na reativação com um **patch inverso** (nunca `git checkout`, que apagaria o código novo desta branch), rode o arquivo e confirme que o caso da ida-volta-ida fica **vermelho**. Depois reaplique.

Run: `pnpm test:rls -- src/lib/billing/cancelamento-voluntario.int.test.ts`
Expected na mutação: FAIL no caso "ida-volta-ida".

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/cancelamento-voluntario.int.test.ts
git commit -m "test(billing): cover cancel-reactivate-cancel round trip by value, issue #36"
```

---

## Task 6: D2 — query de progresso do onboarding

**Files:**
- Create: `src/lib/onboarding/passos.ts`
- Create: `src/app/(app)/onboarding-queries.ts`
- Create: `db/tests/onboarding-progresso-rls.int.test.ts`
- Test: `db/tests/onboarding-progresso-rls.int.test.ts`

**Interfaces:**
- Consumes: `withTenant`, `TenantContext`; `clinic`, `userRole`, `janelaTrabalho`, `patient` (`@/db/schema`).
- Produces:
  - `type PassoId = "clinica" | "equipe" | "agenda" | "paciente"`
  - `interface DefinicaoPasso { id: PassoId; titulo: string; descricao: string; rota: string }`
  - `const PASSOS_ONBOARDING: readonly DefinicaoPasso[]`
  - `type ProgressoOnboarding = Record<PassoId, boolean>`
  - `async function obterProgressoOnboarding(ctx: TenantContext): Promise<ProgressoOnboarding>`

- [ ] **Step 1: Escrever o teste de integração**

Cria `db/tests/onboarding-progresso-rls.int.test.ts`:

```ts
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-00000036d101";
const CLINIC_B = "00000000-0000-0000-0000-00000036d102";
const U_COORD_A = "00000000-0000-0000-0000-00000036d103";
const U_TERA_A = "00000000-0000-0000-0000-00000036d104";
const U_COORD_B = "00000000-0000-0000-0000-00000036d105";
const PAC_B = "00000000-0000-0000-0000-00000036d106";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let obterProgressoOnboarding: typeof import("@/app/(app)/onboarding-queries").obterProgressoOnboarding;
let appSql: typeof import("@/db/client").sql;

async function limpar() {
  await owner`DELETE FROM janela_trabalho WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM patient WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_TERA_A}, ${U_COORD_B})`;
  await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;
}

describe.skipIf(!hasDb)("obterProgressoOnboarding", () => {
  beforeEach(async () => {
    owner ??= postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    ({ obterProgressoOnboarding } = await import(
      "@/app/(app)/onboarding-queries"
    ));
    ({ sql: appSql } = await import("@/db/client"));
    await limpar();
    // Estado zero: clínica recém-criada, só o coordenador.
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (onboarding)', false),
      (${CLINIC_B}, 'Clínica B (onboarding)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.onboarding36@t.com'),
      (${U_TERA_A}, 'Tera A', 'tera.a.onboarding36@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.onboarding36@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  });

  afterAll(async () => {
    await limpar();
    await owner?.end();
    await appSql?.end();
  });

  test("clínica recém-criada tem os quatro passos pendentes", async () => {
    expect(await obterProgressoOnboarding(ctxA)).toEqual({
      clinica: false,
      equipe: false,
      agenda: false,
      paciente: false,
    });
  });

  test("dados da clínica só contam com razão social E cep", async () => {
    await owner`UPDATE clinic SET razao_social = 'Clínica A LTDA'
      WHERE id = ${CLINIC_A}`;
    expect((await obterProgressoOnboarding(ctxA)).clinica).toBe(false);
    await owner`UPDATE clinic SET endereco_cep = '01310100'
      WHERE id = ${CLINIC_A}`;
    expect((await obterProgressoOnboarding(ctxA)).clinica).toBe(true);
  });

  test("equipe conta um SEGUNDO usuário, não o próprio coordenador", async () => {
    expect((await obterProgressoOnboarding(ctxA)).equipe).toBe(false);
    await owner`INSERT INTO user_role (user_id, clinic_id, papel)
      VALUES (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    expect((await obterProgressoOnboarding(ctxA)).equipe).toBe(true);
  });

  test("agenda conta janela de trabalho da clínica", async () => {
    await owner`INSERT INTO user_role (user_id, clinic_id, papel)
      VALUES (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO janela_trabalho
      (clinic_id, terapeuta_id, dia_semana, hora_inicio, hora_fim)
      VALUES (${CLINIC_A}, ${U_TERA_A}, 1, '09:00', '17:00')`;
    expect((await obterProgressoOnboarding(ctxA)).agenda).toBe(true);
  });

  test("não enxerga o progresso da outra clínica", async () => {
    // B tem paciente; A não. Se o isolamento vazar, A marcaria concluído.
    await owner`INSERT INTO patient (id, clinic_id, nome)
      VALUES (${PAC_B}, ${CLINIC_B}, 'Paciente da B')`;
    expect((await obterProgressoOnboarding(ctxA)).paciente).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls -- db/tests/onboarding-progresso-rls.int.test.ts`
Expected: FAIL — `Cannot find module '@/app/(app)/onboarding-queries'`.

- [ ] **Step 3: Escrever a definição dos passos**

Cria `src/lib/onboarding/passos.ts`. Sem `server-only` e sem React: é importado pelo componente cliente e pela query.

```ts
export type PassoId = "clinica" | "equipe" | "agenda" | "paciente";

export interface DefinicaoPasso {
  id: PassoId;
  titulo: string;
  descricao: string;
  rota: string;
}

/**
 * Os quatro passos do onboarding (#36, bloco D1 — decidido em 29/08/2026).
 *
 * A ordem é a do roteiro que o coordenador descobria por tentativa e erro:
 * clínica → equipe → agenda → paciente. Cada passo tem uma consulta que o
 * PROVA (ver `obterProgressoOnboarding`); nenhum tem flag manual, porque flag
 * que ninguém escreve mente.
 */
export const PASSOS_ONBOARDING: readonly DefinicaoPasso[] = [
  {
    id: "clinica",
    titulo: "Complete os dados da clínica",
    descricao:
      "Razão social e endereço. São exigidos na hora de emitir a cobrança — preencher agora evita travar depois.",
    rota: "/clinica/dados",
  },
  {
    id: "equipe",
    titulo: "Convide a equipe",
    descricao:
      "Cadastre pelo menos um terapeuta ou recepção. Cada pessoa entra com o próprio acesso.",
    rota: "/equipe",
  },
  {
    id: "agenda",
    titulo: "Configure a agenda",
    descricao:
      "Defina as janelas de trabalho da equipe. Sem elas, a agenda não tem onde encaixar sessão.",
    rota: "/agenda",
  },
  {
    id: "paciente",
    titulo: "Cadastre o primeiro paciente",
    descricao:
      "É o cadastro que dá início ao período de teste. Configurar tudo antes disso é gratuito.",
    rota: "/pacientes",
  },
] as const;
```

- [ ] **Step 4: Escrever a query de progresso**

Cria `src/app/(app)/onboarding-queries.ts`:

```ts
import "server-only";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { clinic, janelaTrabalho, patient, userRole } from "@/db/schema";
import type { PassoId } from "@/lib/onboarding/passos";

export type ProgressoOnboarding = Record<PassoId, boolean>;

/**
 * Progresso do onboarding derivado do ESTADO REAL do banco (#36, bloco D2).
 *
 * Sem coluna de flag, de propósito: flag manual só é verdadeira enquanto
 * alguém lembra de escrevê-la, e um passo desfeito (o único terapeuta removido
 * da equipe) continuaria marcado como concluído para sempre.
 *
 * Uma transação só, com quatro `EXISTS`: os quatro precisam enxergar a mesma
 * imagem do banco. Em quatro idas, um cadastro concorrente apareceria para
 * metade da resposta e a lista piscaria entre dois estados.
 *
 * Toda leitura sai por `withTenant` (`app_role`, RLS ativa) — o isolamento é do
 * BANCO, e o teste de integração cobre o vazamento cross-tenant.
 */
export async function obterProgressoOnboarding(
  ctx: TenantContext,
): Promise<ProgressoOnboarding> {
  return withTenant(ctx, async (tx) => {
    const [linha] = await tx
      .select({
        // Os dois campos do formulário de `/clinica/dados` que o faturamento
        // exige. Só um deles preenchido é cadastro pela metade, não passo
        // concluído.
        clinica: sql<boolean>`EXISTS (
          SELECT 1 FROM ${clinic}
          WHERE ${clinic.id} = ${ctx.clinicId}
            AND ${clinic.razaoSocial} IS NOT NULL
            AND ${clinic.enderecoCep} IS NOT NULL
        )`,
        // `<>` o próprio usuário: a clínica nasce com o coordenador dentro, e
        // contá-lo faria o passo nascer concluído para todo mundo.
        equipe: sql<boolean>`EXISTS (
          SELECT 1 FROM ${userRole}
          WHERE ${userRole.userId} <> ${ctx.userId}
        )`,
        agenda: sql<boolean>`EXISTS (SELECT 1 FROM ${janelaTrabalho})`,
        paciente: sql<boolean>`EXISTS (SELECT 1 FROM ${patient})`,
      })
      .from(sql`(SELECT 1) AS uma_linha`);

    return {
      clinica: Boolean(linha?.clinica),
      equipe: Boolean(linha?.equipe),
      agenda: Boolean(linha?.agenda),
      paciente: Boolean(linha?.paciente),
    };
  });
}
```

**Nota importante para quem implementa:** os subselects acima **não repetem o filtro por clínica** nos `EXISTS` de `user_role`, `janela_trabalho` e `patient` — quem filtra é a RLS (`user_role_read`, `janela_trabalho_select`, `patient_select`). Se o teste de isolamento cross-tenant falhar, **não** conserte acrescentando `clinic_id = ...` no subselect: isso mascararia uma policy quebrada. Investigue a policy primeiro. O `EXISTS` de `clinic` é a exceção porque ali o `id` É o predicado do próprio passo, não isolamento.

Se o Drizzle reclamar do `.from(sql\`(SELECT 1) AS uma_linha\`)`, use quatro `tx.execute(sql\`SELECT EXISTS(...) AS ok\`)` dentro da mesma `withTenant` — continuam sendo a mesma transação, que é o que importa.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm test:rls -- db/tests/onboarding-progresso-rls.int.test.ts`
Expected: PASS, 5 testes.

Se aparecer `permission denied` em `razao_social` ou `endereco_cep`, o problema é `GRANT` de coluna e não policy. Meça:

```sql
SELECT has_column_privilege('app_role', 'clinic', 'razao_social', 'SELECT');
```

Se der `false`, o `GRANT SELECT` de coluna faltou na `0095` e precisa entrar por migração própria — abra o achado antes de contornar.

- [ ] **Step 6: Typecheck e lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/onboarding/passos.ts "src/app/(app)/onboarding-queries.ts" \
  db/tests/onboarding-progresso-rls.int.test.ts
git commit -m "feat(onboarding): derive onboarding progress from database state, issue #36"
```

---

## Task 7: D3 + D4 — checklist na home, com "agora não" e sumiço ao concluir

**Files:**
- Create: `src/app/(app)/checklist-onboarding.tsx`
- Create: `src/app/(app)/checklist-onboarding.test.tsx`
- Modify: `src/app/(app)/agenda/page.tsx`
- Test: `src/app/(app)/checklist-onboarding.test.tsx`

**Interfaces:**
- Consumes: `PASSOS_ONBOARDING`, `PassoId`, `DefinicaoPasso` (`@/lib/onboarding/passos`); `ProgressoOnboarding`, `obterProgressoOnboarding` (Task 6); `Card`, `Button` (DS); `Link` (`next/link`).
- Produces: `function ChecklistOnboarding(props: { progresso: ProgressoOnboarding; clinicId: string }): JSX.Element | null`

D3 e D4 vão na mesma task de propósito: "renderizar a lista" e "sumir quando não há o que fazer" não são separáveis por um revisor — uma lista que nunca some é um defeito da própria lista, não uma feature seguinte.

**Onde o "agora não" mora:** `localStorage`, chave `iris:onboarding-pulados:${clinicId}`, valor JSON com os `PassoId` pulados. Por clínica porque o mesmo navegador atende coordenador de mais de uma. **Todo acesso vai em `try/catch`**: em janela privada ou com dados de site bloqueados o próprio acessor lança, e uma exceção aqui derrubaria a `/agenda` inteira.

- [ ] **Step 1: Escrever o teste**

Cria `src/app/(app)/checklist-onboarding.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistOnboarding } from "./checklist-onboarding";
import type { ProgressoOnboarding } from "./onboarding-queries";

const CLINIC = "clinica-1";
const ZERADO: ProgressoOnboarding = {
  clinica: false,
  equipe: false,
  agenda: false,
  paciente: false,
};
const TUDO: ProgressoOnboarding = {
  clinica: true,
  equipe: true,
  agenda: true,
  paciente: true,
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("ChecklistOnboarding", () => {
  it("lista os quatro passos pendentes com link para a rota de cada um", () => {
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    expect(
      screen.getByRole("link", { name: /complete os dados da clínica/i }),
    ).toHaveAttribute("href", "/clinica/dados");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("marca o passo concluído e não oferece 'agora não' para ele", () => {
    render(
      <ChecklistOnboarding
        progresso={{ ...ZERADO, clinica: true }}
        clinicId={CLINIC}
      />,
    );
    const item = screen
      .getByText(/complete os dados da clínica/i)
      .closest("li")!;
    expect(item).toHaveAttribute("data-concluido", "true");
    expect(
      screen.getAllByRole("button", { name: /agora não/i }),
    ).toHaveLength(3);
  });

  it("some inteiro quando os quatro passos estão concluídos", () => {
    const { container } = render(
      <ChecklistOnboarding progresso={TUDO} clinicId={CLINIC} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("'agora não' remove o item e persiste no localStorage", async () => {
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: /agora não/i })[0]!,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(localStorage.getItem(`iris:onboarding-pulados:${CLINIC}`)).toContain(
      "clinica",
    );
  });

  it("some quando tudo que sobrou foi pulado", async () => {
    localStorage.setItem(
      `iris:onboarding-pulados:${CLINIC}`,
      JSON.stringify(["clinica", "equipe", "agenda", "paciente"]),
    );
    const { container } = render(
      <ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("não pula item de outra clínica", () => {
    localStorage.setItem(
      "iris:onboarding-pulados:outra-clinica",
      JSON.stringify(["clinica", "equipe", "agenda", "paciente"]),
    );
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("renderiza normalmente quando o localStorage lança", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("acesso a dados de site bloqueado");
    });
    render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test -- "src/app/(app)/checklist-onboarding.test.tsx"`
Expected: FAIL — `Cannot find module './checklist-onboarding'`.

- [ ] **Step 3: Escrever o componente**

Cria `src/app/(app)/checklist-onboarding.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PASSOS_ONBOARDING, type PassoId } from "@/lib/onboarding/passos";
import type { ProgressoOnboarding } from "./onboarding-queries";

function chave(clinicId: string): string {
  return `iris:onboarding-pulados:${clinicId}`;
}

/**
 * Leitura do "agora não". Em `try/catch` porque em janela privada ou com dados
 * de site bloqueados o próprio acessor LANÇA — e uma exceção aqui derrubaria a
 * `/agenda` inteira por causa de uma conveniência de leitura.
 */
function lerPulados(clinicId: string): PassoId[] {
  try {
    const cru = localStorage.getItem(chave(clinicId));
    if (!cru) return [];
    const lista: unknown = JSON.parse(cru);
    if (!Array.isArray(lista)) return [];
    return lista.filter((x): x is PassoId =>
      PASSOS_ONBOARDING.some((p) => p.id === x),
    );
  } catch {
    return [];
  }
}

function gravarPulados(clinicId: string, pulados: PassoId[]): void {
  try {
    localStorage.setItem(chave(clinicId), JSON.stringify(pulados));
  } catch {
    // Sem persistir, o item volta no próximo carregamento. Voltar é o
    // comportamento correto: o passo continua realmente pendente.
  }
}

export interface ChecklistOnboardingProps {
  progresso: ProgressoOnboarding;
  /** Escopo do "agora não": o mesmo navegador atende mais de uma clínica. */
  clinicId: string;
}

/**
 * Checklist de onboarding (#36, blocos D3 e D4).
 *
 * Some quando não há nada pendente — seja porque tudo foi concluído de verdade,
 * seja porque o que sobrou foi pulado. Não é bloqueante: o guardrail 1 da #36
 * proíbe travar a app antes do fim do trial.
 */
export function ChecklistOnboarding({
  progresso,
  clinicId,
}: ChecklistOnboardingProps) {
  // Estado inicial vazio e leitura no efeito: o servidor não tem
  // `localStorage`, e ler na primeira renderização faria o HTML do servidor
  // divergir do cliente (hydration mismatch).
  const [pulados, setPulados] = useState<PassoId[]>([]);
  useEffect(() => setPulados(lerPulados(clinicId)), [clinicId]);

  // Pulado some da lista; concluído FICA, marcado — é o que dá ao coordenador
  // a sensação de progresso em vez de uma lista que só encurta.
  const visiveis = PASSOS_ONBOARDING.filter((p) => !pulados.includes(p.id));

  const restaAlgo = visiveis.some((p) => !progresso[p.id]);
  if (!restaAlgo) return null;

  function pular(id: PassoId) {
    const novos = [...pulados, id];
    setPulados(novos);
    gravarPulados(clinicId, novos);
  }

  const concluidos = visiveis.filter((p) => progresso[p.id]).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          Primeiros passos
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {concluidos} de {visiveis.length} concluídos. Configurar a clínica, a
          equipe e a agenda é gratuito.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {visiveis.map((passo) => {
          const concluido = progresso[passo.id];
          return (
            <li
              key={passo.id}
              data-concluido={concluido ? "true" : "false"}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-brutal)]/40 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={passo.rota}
                  className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
                >
                  {passo.titulo}
                </Link>
                <span className="text-sm text-[var(--text-secondary)]">
                  {passo.descricao}
                </span>
              </div>
              {concluido ? (
                <span className="font-mono text-xs font-semibold tracking-wide text-[var(--status-success-fg)] uppercase">
                  Concluído
                </span>
              ) : (
                <Button
                  variante="terciaria"
                  onClick={() => pular(passo.id)}
                  aria-label={`Agora não: ${passo.titulo}`}
                >
                  Agora não
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
```

**Verificar:** `Card` aceita `className` e `children`? (`grep -n "export function Card\|CardProps" -A 10 src/components/ui/card.tsx`). Se a API for `<Card><CardContent>…`, use a real. Idem para a variante do `Button` e para o token `--text-secondary` — confira em `src/app/globals.css` e use o nome que existe.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test -- "src/app/(app)/checklist-onboarding.test.tsx"`
Expected: PASS, 7 testes.

- [ ] **Step 5: Montar na `/agenda`**

Em `src/app/(app)/agenda/page.tsx`, no Server Component da página, buscar o progresso **só para coordenador** (o roteiro é dele; terapeuta e recepção não abrem `/clinica/dados` nem `/equipe`) e renderizar acima do conteúdo existente:

```tsx
import { ChecklistOnboarding } from "../checklist-onboarding";
import { obterProgressoOnboarding } from "../onboarding-queries";
```

```tsx
  const progressoOnboarding =
    ctx.role === "coordenador" ? await obterProgressoOnboarding(ctx) : null;
```

```tsx
      {progressoOnboarding ? (
        <ChecklistOnboarding
          progresso={progressoOnboarding}
          clinicId={ctx.clinicId}
        />
      ) : null}
```

Abra `src/app/(app)/agenda/page.tsx` antes de editar: o nome da variável de contexto e o elemento raiz podem diferir do esqueleto acima. Encaixe no que estiver lá.

- [ ] **Step 6: Verificar a agenda inteira**

Run: `pnpm test -- "src/app/(app)/agenda" && pnpm typecheck && pnpm lint`
Expected: verde, sem teste de agenda quebrado.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/checklist-onboarding.tsx" \
  "src/app/(app)/checklist-onboarding.test.tsx" \
  "src/app/(app)/agenda/page.tsx"
git commit -m "feat(onboarding): add dismissible onboarding checklist to app home, issue #36"
```

---

## Task 8: Verificação final e fechamento

**Files:** nenhum novo.

- [ ] **Step 1: Suíte inteira**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: tudo verde.

- [ ] **Step 2: Suíte de integração inteira**

Run: `pnpm test:rls`
Expected: verde **e** com contagem de arquivos coerente. Muitos "skipped" aqui é vermelho disfarçado: se dezenas de arquivos pularem, falta `MIGRATION_DATABASE_URL` ou a role está errada — não é sucesso.

- [ ] **Step 3: Formatação só do que foi tocado**

```bash
git diff --name-only main...HEAD | grep -E '\.(ts|tsx|md)$' | xargs pnpm exec prettier --write
```

Nunca `pnpm format`: ele reformata o repositório inteiro, incluindo `.agents/`, `CLAUDE.md` e o worktree aninhado, e enterra o diff real.

- [ ] **Step 4: Conferir o diff contra a Definição de Pronto**

Reler o diff inteiro (`git diff main...HEAD`) perguntando, item a item:

- A2: coordenador vê o histórico? Empty state aparece quando não há ciclo fechado?
- C2: coordenador cancela pela UI, com confirmação que diz corte imediato, débito e "pagar não reativa"?
- C3: o caso da ida-volta-ida assere **VALOR**, não só status?
- D3: o checklist aparece na `/agenda` do coordenador e some quando não há pendência?
- Nenhuma função exportada de `actions.ts` aceita `ctx`?
- Nenhum `TRUNCATE` de tabela compartilhada nos int-tests novos?

- [ ] **Step 5: Commit de fechamento (se a formatação mudou algo)**

```bash
git add -A
git commit -m "style: format touched files, issue #36"
```

- [ ] **Step 6: Registrar o achado do Bloco C na issue**

Comentar na #36, em pt-BR, que a descrição do bloco C parte de uma premissa falsa (a porta `cancelarAssinatura` não existia; C1 criou `cancelarAssinaturaDaClinica` sobre o `revogarECortarAssinatura` já existente). Usar `--body-file`, nunca `--body` inline: escape do PowerShell já truncou corpo de issue neste repo.

```bash
gh issue comment 36 --body-file caminho/do/comentario.md
```

---

## Self-Review

**Cobertura da spec (blocos A/C/D da #36):**

| Item da issue | Task |
| --- | --- |
| A1 — query `listarCiclosDaClinica` com teste cross-tenant | Task 1 |
| A2 — seção "Histórico de cobranças", empty state, overflow na tabela | Task 2 |
| A3 — decisão sobre link da fatura | **fora deste plano** (vai por `/tlc-spec-driven`) |
| A4 — link "ver fatura" por linha | **fora deste plano** (depende de A3) |
| C1 — server action restrita a `coordenador` | Task 3 (+ orquestrador, ver achado 1) |
| C2 — UI com confirmação e copy do corte imediato | Task 4 |
| C3 — int test cancelar → `canceled` + `cancelada_em` + débito, com ida-volta-ida | Task 5 |
| D1 — passos e régua de concluído | decidido em 29/08/2026, materializado na Task 6 |
| D2 — query de progresso derivada do banco | Task 6 |
| D3 — componente de checklist na home | Task 7 |
| D4 — ocultar quando concluído, com dispensa | Task 7 |

**Riscos conhecidos que o executor vai encontrar:**

1. Nomes de variante do DS (`Button variante`, `Alert severidade`, API do `Card`) estão escritos de memória do padrão do repo. Cada task que os usa manda conferir antes de rodar. Se divergirem, use o nome real — não crie variante nova.
2. ~~As assinaturas de `aplicarStatusProvider` e `levantarDebito` (Task 5) precisam ser conferidas no arquivo.~~ Conferidas e corrigidas em 29/08/2026 — ambas são posicionais e a Task 5 já as usa assim.
3. `has_column_privilege('app_role','clinic','razao_social','SELECT')` pode ser `false` — a `0095` documenta que não há `GRANT UPDATE` de coluna, mas não afirma nada sobre `SELECT`. Task 6 Step 5 tem o diagnóstico e manda abrir achado em vez de contornar.
4. O `.where()` de `listarCiclosDaClinica` não repete o filtro por clínica de propósito. Se alguém "consertar" acrescentando `eq(billingCycle.clinicId, ctx.clinicId)`, o teste continua verde e o isolamento passa a ter duas fontes de verdade — a policy pode quebrar sem ninguém notar.
