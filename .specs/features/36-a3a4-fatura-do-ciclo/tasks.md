# #36 A3/A4 — Tasks

Fronteira de atomização: cada task é um ponto em que um revisor aprovaria uma e rejeitaria a vizinha.

**Depende do plano irmão:** T4 e T5 tocam `src/app/(app)/assinatura/queries.ts` e `historico-cobrancas.tsx`, criados na Task 1 e Task 2 de `docs/superpowers/plans/2026-08-29-36-blocos-a-c-d-portal-assinatura-cancelamento-onboarding.md`. **Aquelas duas têm de estar mergeadas antes de T4.** T1–T3 e T6 não dependem de nada e podem correr antes.

---

## T1 — Coluna `invoice_url` no schema e migração

**Requisitos:** R1, R4, R5
**Onde:** `src/db/schema.ts` (dentro de `billingCycle`, ~linha 2035), `db/migrations/0134_billing_cycle_invoice_url.sql`, `db/migrations/meta/`
**Depende de:** nada
**Reusa:** o padrão de comentário + grant redundante das migrações `0100`, `0101` e `0106`

**Passos:**

1. Em `src/db/schema.ts`, dentro do objeto `billingCycle`, logo depois de `providerChargeId` (linha ~2034), acrescentar:

```ts
    /**
     * Fatura hospedada desta cobrança no gateway (#36, A3), como ela SAIU na
     * emissão.
     *
     * É o `invoiceUrl` do Asaas, que o adapter já devolve em
     * `CobrancaEmitida.urlPagamento` e que o fechamento de ciclo descartava.
     * Persistido, e não resolvido sob demanda: `GET /v3/payments/{id}` também
     * devolve a URL, mas isso custaria uma ida ao gateway por LINHA da tabela
     * do histórico, exigiria método novo na porta (`consultarCobranca` devolve
     * só `StatusCobranca`) e faria a fatura de um ciclo antigo desaparecer da
     * tela sempre que o gateway estivesse fora do ar ou tivesse removido a
     * cobrança.
     *
     * NÃO é derivado do `provider_charge_id` por template: o formato da URL é
     * contrato do fornecedor, não nosso, e difere entre sandbox e produção.
     *
     * NULLABLE porque três classes de linha legítima não têm fatura: ciclo
     * fechado antes desta coluna existir; ciclo em `devido` (o cancelamento
     * congela como débito SEM emitir cobrança); e emissão em que o gateway não
     * devolveu a URL — `urlPagamento` é opcional na porta, e a falta dela não
     * pode derrubar um fechamento de ciclo.
     */
    invoiceUrl: text("invoice_url"),
```

2. `pnpm db:generate`. Esperado: cria `db/migrations/0134_billing_cycle_invoice_url.sql` (ou o número que o gerador escolher), `meta/0134_snapshot.json`, e uma entrada nova em `meta/_journal.json`.

   Se responder `No schema changes, nothing to migrate`, o `schema.ts` não foi salvo ou a coluna caiu fora do objeto. **Não** escreva o `.sql` à mão.

3. No `.sql` gerado, acrescentar os `GRANT`s ao fim, com `--> statement-breakpoint` entre statements. **Não tocar no snapshot** — Drizzle não modela privilégio:

```sql
--> statement-breakpoint
-- GRANT redundante, e emitido de propósito.
--
-- `billing_cycle` tem GRANT de TABELA desde a 0071:237 (`app_role`) e
-- 0071:244 + 0075:67 (`iris_auth`), e nenhum REVOKE jamais tocou a tabela —
-- privilégio de tabela cobre coluna criada depois, então esta coluna já
-- nasceria legível sem nada disto. O grant explícito segue a convenção das
-- 0100, 0101 e 0106: a auditoria de privilégio desta tabela é feita lendo os
-- arquivos, e uma coluna sem linha própria parece uma coluna esquecida.
GRANT SELECT ("invoice_url") ON "billing_cycle" TO app_role;--> statement-breakpoint
GRANT SELECT ("invoice_url"), INSERT ("invoice_url"), UPDATE ("invoice_url") ON "billing_cycle" TO iris_auth;
```

4. `pnpm db:migrate`

**Done when:** a migração aplicou sem erro e `src/db/migrations.test.ts` passa.

**Tests:** `pnpm test -- src/db/migrations.test.ts`

**Gate:** `pnpm test -- src/db/migrations.test.ts && pnpm typecheck`

---

## T2 — Medir a coluna e o privilégio no Postgres

**Requisitos:** R1, R4 (verificação)
**Onde:** nenhum arquivo — é medição
**Depende de:** T1

`git log` não prova que uma migração rodou, e uma coluna ausente faria a escrita de T3 falhar **dentro do fechamento de ciclo**, que é o trilho que não pode quebrar.

**Passos:**

1. No psql local:

```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'billing_cycle' AND column_name = 'invoice_url';

SELECT has_column_privilege('app_role',   'billing_cycle', 'invoice_url', 'SELECT') AS app_select,
       has_column_privilege('iris_auth',  'billing_cycle', 'invoice_url', 'SELECT') AS auth_select,
       has_column_privilege('iris_auth',  'billing_cycle', 'invoice_url', 'UPDATE') AS auth_update;
```

**Done when:** a primeira query devolve uma linha com `text` / `YES`, e a segunda devolve `true, true, true`. Cole o resultado no PR — a Definição de Pronto pede o valor medido, não a afirmação.

**Tests:** n/a (medição)
**Gate:** os dois resultados acima, colados

---

## T3 — Gravar a URL na emissão da cobrança de ciclo

**Requisitos:** R2, R3, R9
**Onde:** `src/lib/billing/subscription.ts:753-772`; teste novo em `src/lib/billing/invoice-url-emissao.int.test.ts`
**Depende de:** T2
**Reusa:** `ProvedorFake` (`db/tests/provedor-fake.ts`), o harness de `vi.mock("./provider", ...)` dos int-tests de billing

**Passos:**

1. **Primeiro o teste, e ele tem de falhar.** Criar `src/lib/billing/invoice-url-emissao.int.test.ts` com dois casos, ambos relendo o banco pela conexão dona:
   - ciclo vencido → `fecharCiclosVencendo` → `billing_cycle.invoice_url` é **exatamente** a URL que o `ProvedorFake` devolveu em `emitirCobrancaDeCiclo`;
   - `ProvedorFake` configurado para devolver `urlPagamento: undefined` → `invoice_url` fica `NULL`, e o ciclo fecha do mesmo jeito: `provider_charge_id` preenchido e `status = 'aguardando_pagamento'`.

   O segundo caso é R3 e é o que mais importa: sem ele, um `?? null` trocado por um `throw` passaria despercebido até quebrar uma cobrança real.

   Confira antes se `ProvedorFake.emitirCobrancaDeCiclo` já permite controlar `urlPagamento`. Se não permitir, estenda o fake — não mude o adapter do Asaas para testar.

2. `pnpm test:rls -- src/lib/billing/invoice-url-emissao.int.test.ts` → **FAIL** esperado.

3. Em `src/lib/billing/subscription.ts`, no `.set({...})` do `UPDATE` de `billingCycle` (logo abaixo de `vencimentoCobranca: vencimento,`), acrescentar:

```ts
              // A URL da fatura como ela SAIU nesta emissão. `?? null` e nunca
              // um `throw`: `urlPagamento` é opcional na porta, e um link de
              // conveniência ausente não pode derrubar uma cobrança que o
              // gateway já aceitou.
              invoiceUrl: cobranca.urlPagamento ?? null,
```

4. `pnpm test:rls -- src/lib/billing/invoice-url-emissao.int.test.ts` → **PASS**, 2 testes.

5. **Régua de mutação (§5.2 ponto 6).** Remover a linha acrescentada com um **patch inverso** — nunca `git checkout`, que apagaria todo o código novo desta branch — e confirmar que o primeiro caso fica vermelho. Reaplicar.

**Done when:** os dois casos passam e a mutação foi verificada.

**Tests:** `src/lib/billing/invoice-url-emissao.int.test.ts`
**Gate:** `pnpm test:rls -- src/lib/billing/invoice-url-emissao.int.test.ts && pnpm typecheck`

---

## T4 — Expor `invoiceUrl` no histórico

**Requisitos:** R6
**Onde:** `src/app/(app)/assinatura/queries.ts`; `db/tests/historico-ciclos-rls.int.test.ts`
**Depende de:** T1; **e da Task 1 do plano irmão estar mergeada**
**Reusa:** `listarCiclosDaClinica`

**Passos:**

1. Em `db/tests/historico-ciclos-rls.int.test.ts`, dar `invoice_url` a um dos ciclos semeados da clínica A e `NULL` ao outro, e acrescentar o caso:

```ts
  test("traz a URL da fatura, e null quando não há", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    const porId = new Map(r.map((c) => [c.id, c.invoiceUrl]));
    expect(porId.get(CICLO_A_FALHOU)).toBe("https://sandbox.asaas.com/i/36a2");
    expect(porId.get(CICLO_A_PAGO)).toBeNull();
  });
```

2. `pnpm test:rls -- db/tests/historico-ciclos-rls.int.test.ts` → **FAIL** (`invoiceUrl` não existe em `CicloDoHistorico`).

3. Em `queries.ts`: `invoiceUrl: string | null;` na interface e `invoiceUrl: billingCycle.invoiceUrl,` no `select`.

4. `pnpm test:rls -- db/tests/historico-ciclos-rls.int.test.ts` → **PASS**, 6 testes.

**Done when:** o caso novo passa e os 5 antigos continuam verdes.

**Tests:** `db/tests/historico-ciclos-rls.int.test.ts`
**Gate:** `pnpm test:rls -- db/tests/historico-ciclos-rls.int.test.ts && pnpm typecheck`

---

## T5 — Coluna "Fatura" na tabela do histórico

**Requisitos:** R7, R8
**Onde:** `src/app/(app)/assinatura/historico-cobrancas.tsx`, `historico-cobrancas.test.tsx`
**Depende de:** T4; **e da Task 2 do plano irmão estar mergeada**
**Reusa:** `Table*` do DS

**Passos:**

1. Acrescentar ao teste de componente três casos:

```tsx
  it("linka a fatura com nome acessível que identifica o ciclo", () => {
    render(
      <HistoricoCobrancas
        ciclos={[{ ...CICLO_PAGO, invoiceUrl: "https://asaas.test/i/1" }]}
      />,
    );
    const link = screen.getByRole("link", {
      name: /ver fatura do ciclo de 01\/06\/2026 a 01\/07\/2026/i,
    });
    expect(link).toHaveAttribute("href", "https://asaas.test/i/1");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("mostra travessão quando o ciclo não tem fatura", () => {
    render(<HistoricoCobrancas ciclos={[{ ...CICLO_PAGO, invoiceUrl: null }]} />);
    expect(screen.queryByRole("link", { name: /fatura/i })).toBeNull();
  });

  it("não linka URL que não seja https", () => {
    render(
      <HistoricoCobrancas
        ciclos={[{ ...CICLO_PAGO, invoiceUrl: "javascript:alert(1)" }]}
      />,
    );
    expect(screen.queryByRole("link", { name: /fatura/i })).toBeNull();
  });
```

   E acrescentar `invoiceUrl` às fixtures `CICLO_PAGO` / `CICLO_RECUSADO`, senão o typecheck do teste quebra.

2. `pnpm test -- "src/app/(app)/assinatura/historico-cobrancas.test.tsx"` → **FAIL**.

3. No componente, um helper e uma coluna:

```tsx
/**
 * Só HTTPS vira link. O valor vem de resposta HTTP de terceiro e vai parar num
 * `href` que a clínica clica; a checagem existe para que uma mudança do lado do
 * gateway — ou uma linha corrompida — não vire destino inesperado a partir de
 * dentro do produto.
 */
function faturaSegura(url: string | null): string | null {
  return url?.startsWith("https://") ? url : null;
}
```

   Cabeçalho `<TableHead scope="col">Fatura</TableHead>` ao fim da linha de cabeçalho, e a célula:

```tsx
              <TableCell>
                {faturaSegura(ciclo.invoiceUrl) ? (
                  <a
                    href={faturaSegura(ciclo.invoiceUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:no-underline"
                  >
                    Ver fatura
                    {/* Quatro links "Ver fatura" numa tabela são quatro
                        destinos indistinguíveis na lista de links do leitor de
                        tela. O período completa o nome acessível sem poluir o
                        visual. */}
                    <span className="sr-only">
                      {" "}do ciclo de {formatador.format(ciclo.inicio)} a{" "}
                      {formatador.format(ciclo.fim)}
                    </span>
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
```

   Atenção ao caso "mantém a rolagem horizontal DENTRO da tabela" que já existe: a coluna nova aumenta a largura, e é exatamente o cenário que aquele caso protege.

4. `pnpm test -- "src/app/(app)/assinatura/historico-cobrancas.test.tsx"` → **PASS**, 8 testes.

**Done when:** os três casos novos passam e os 5 antigos continuam verdes.

**Tests:** `src/app/(app)/assinatura/historico-cobrancas.test.tsx`
**Gate:** `pnpm test -- "src/app/(app)/assinatura" && pnpm typecheck && pnpm lint`

---

## T6 — Confirmar que não há backfill, e fechar A3 na issue

**Requisitos:** F4 da spec; Definição de Pronto
**Onde:** nenhum arquivo de código
**Depende de:** T2

**Passos:**

1. No psql de **produção** (console Bash do serviço `iris-postgres` no Easypanel, `-U iris`):

```sql
SELECT count(*) AS com_cobranca
  FROM billing_cycle
 WHERE provider_charge_id IS NOT NULL;
```

   Esperado: `0` (F4 — nenhuma cobrança de ciclo jamais foi emitida em produção; o primeiro fechamento real é o E1, 12/09/2026).

   Se vier `> 0`, **pare**: existe fatura emitida cuja URL não temos. Abra task própria de backfill (`GET /v3/payments/{id}` por linha) e **não** a faça de carona nesta.

2. Comentar na issue #36, em pt-BR, com `--body-file` (nunca `--body` inline — escape do PowerShell já truncou corpo de issue neste repo), colando a seção 0 da spec: os quatro fatos medidos e a decisão. É isso que fecha A3, que a issue define como "fecha com decisão registrada, não com código".

3. Marcar A3 e A4 na issue.

**Done when:** a contagem foi medida e colada, e o comentário está publicado.

**Tests:** n/a
**Gate:** contagem colada + link do comentário

---

## Ordem sugerida

```
T1 → T2 → T3 ──┐
               ├→ (merge do plano irmão A1+A2) → T4 → T5
T6 ────────────┘
```

T6 é independente e pode correr em paralelo com T3 — e vale correr cedo: se a contagem não for `0`, o escopo muda.
