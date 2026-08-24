# #378 — Tarefas atômicas

Ordem é dependência real, não preferência. `[P]` = paralelizável com a tarefa anterior.
Cada tarefa fecha com: `pnpm typecheck && pnpm lint && pnpm test` e **`pnpm format` só nos arquivos
tocados** (o CI deste repo não valida Prettier — `pnpm format` no repo inteiro reformata `.agents/`,
`CLAUDE.md` e o worktree aninhado).

---

## T0 — SPIKE bloqueante no sandbox (mede, não presume)

**Onde:** script descartável + registro do resultado nesta spec (`.specs/features/378-.../medicao-t0.md`).
**Depende de:** nada. **Bloqueia:** T3, T4, T5.

Medir no sandbox do Asaas (`ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`), com os cartões de
teste da doc, e **registrar request + response crus**:

1. `POST /payments` `{billingType:"CREDIT_CARD", customer, value, dueDate, externalReference}`
   **sem** dados de cartão → confirmar que volta `invoiceUrl`.
2. Pagar essa fatura pela `invoiceUrl` com cartão de teste aprovado. Capturar **o payload do
   webhook** e o `GET /payments/{id}`: **existe `payment.creditCard.creditCardToken`?**
   → Se **não** existir, PARE: o desenho inteiro depende disso. Escale ao Rômulo com o payload.
3. `POST /payments` com `creditCardToken` **e sem `remoteIp`** → 200 ou 400? (regra de parada em D6).
4. `POST /payments` com token e cartão de teste **recusado** → confirmar 400 + `errors[].code`.
5. Confirmar o `status` cru do `payment` num evento `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`.

**Done when:** `medicao-t0.md` commitado com os 5 resultados e os corpos crus. Sem ele, T3-T5 são
chute.

---

## T1 — Schema + migração das colunas de cartão

**Onde:** `src/db/schema.ts`, `src/db/migrations/NNNN_*.sql` + `meta/NNNN_snapshot.json`.
**Reusa:** padrão de grant coluna a coluna da `0057`.

- 4 colunas de D2 + CHECK de D2.
- `pnpm db:generate` (nunca DDL à mão para o que está no `schema.ts`), commitar `.sql` **e** o
  snapshot.
- `GRANT UPDATE (credit_card_token), (credit_card_bandeira), (credit_card_ultimos4),
  (credit_card_atualizado_em) ON subscription TO app_role;` no `.sql`.
- `when` do `_journal.json` = anterior **+1000** se houver entrada manual.

**Done when:** `pnpm db:migrate` local aplica; verificação **medindo** (não lendo o git log):
`information_schema.column_privileges` mostra o UPDATE por coluna para `app_role`.
**Testes:** `src/db/migrations.test.ts` verde. **Gate:** `pnpm test && pnpm test:rls`.

---

## T2 — `G9 — cartão recusado` no catálogo de recusa [P com T1]

**Onde:** `src/lib/billing/classificacao-recusa.ts` (+ `.test.ts`, `.int.test.ts`).

- Grupo `G9` com a tabela exata de D9; código `CARD_DECLINED`, com comentário dizendo que é código
  **do Iris**, não do gateway.
- Não entra em `CODIGOS_RETENTAVEIS_AUTOMATICAMENTE` (`retentavelAutomaticamente: false`) — conferir
  que a lista derivada continua igual à de hoje.

**Régua de mutação:** apagar a linha de `G9` do `CATALOGO` joga `CARD_DECLINED` em G0 e **tem que**
derrubar um teste; trocar `carimbaPastDue` para `false` derruba outro teste (comportamentos
distintos = testes distintos).

---

## T3 — Adapter: ativação por cartão (fatura hospedada)

**Onde:** `src/lib/billing/provider/asaas.ts` (`iniciarVinculoPagamento`), `provider/types.ts`.
**Depende de:** T0.

- `iniciarVinculoPagamento` ramifica em `dados.metodo`. Ramo `"cartao"`: `POST /customers` (igual ao
  de hoje) + `POST /payments` `{billingType:"CREDIT_CARD", value: VALOR_ATIVACAO_PADRAO_CENTAVOS,
  dueDate: hoje, externalReference: PREFIXO_REFERENCIA_CARTAO + subscriptionId}`.
- Devolve `autorizacao: { forma: "redirect", url: invoiceUrl }` (forma que já existe na porta) e
  `providerCustomerId`. **`providerVinculoId` no ramo cartão:** usar o id da cobrança de setup —
  documentar no código que ali ele NÃO é autorização, ou (preferível) devolver `null` e deixar
  `provider_subscription_id` NULL. Escolher **uma** e escrever o porquê no comentário.
- 2xx sem `invoiceUrl` → `BillingProviderError` (falhar alto, igual ao ramo Pix).

**Testes:** `asaas.test.ts` — request enviado (assertar o corpo, incluindo **ausência** de
`creditCard`/`ccv`), forma devolvida, erro em resposta sem `invoiceUrl`.

---

## T4 — Adapter: cobrança de ciclo no cartão + recusa síncrona

**Onde:** `asaas.ts` (`emitirCobrancaDeCiclo`), `provider/types.ts` (`ResultadoCobranca` de D8).
**Depende de:** T0, T3.

- Ramo cartão: `POST /payments` com `creditCardToken`, `billingType:"CREDIT_CARD"`, `dueDate` = hoje
  (D7), `externalReference: cycle:<id>`. **Sem** `pixAutomaticAuthorizationId`, **sem** ler
  `/pix/automatic/authorizations` (não existe autorização aqui: o `customer` vem de
  `subscription.provider_customer_id`, passado pela porta).
- 400 com `errors[].code === "invalid_creditCard"` → `{desfecho:"recusada_na_origem", codigo:"CARD_DECLINED"}`.
  Qualquer outro 400 **sobe**.
- `buscarCobrancaPorReferencia` continua sendo a guarda de idempotência antes de emitir.

**Régua de mutação:** remover o `catch` do 400 faz um teste falhar por exceção vazando; trocar
`dueDate` para `vencimentoCobrancaDeCiclo()` faz outro falhar (D7).

---

## T5 — Fechamento de ciclo: ramificar por método

**Onde:** `src/lib/billing/subscription.ts` (`fecharCiclosVencendo`, ~linhas 723-775).
**Depende de:** T1, T4.

- Hoje o `else if (assinatura.providerSubscriptionId)` é a porta de entrada da emissão; no cartão
  esse campo pode ser NULL. Ramificar por `metodo_pagamento` e exigir, no ramo cartão,
  `credit_card_token` **e** `provider_customer_id` — faltando, `throw` nomeado.
- Ramo `recusada_na_origem`: escrita única com ciclo `falhou`, `recusa_codigo`, `erro`,
  `past_due_desde` só se NULL, `provider_charge_id` NULL, `vencimento_cobranca` = hoje.
- Conferir e **testar** que ciclo `falhou` sai do conjunto elegível da próxima passada.

**Testes (int):** ciclo cartão pago; ciclo cartão recusado (estado + carência); reexecução do job
após recusa **não** emite segunda cobrança; assinatura Pix segue idêntica (teste de não-regressão).

---

## T6 — Webhook: token de setup + recusa assíncrona

**Onde:** `asaas.ts` (`normalizarEventoAsaas`), `src/app/api/hooks/asaas/route.ts`,
`subscription.ts` (`registrarTokenDeCartao`).
**Depende de:** T1, T3.

- Normalizador: `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` e `PAYMENT_REPROVED_BY_RISK_ANALYSIS` →
  `tipo: "cobranca.recusada"`, motivo `CARD_DECLINED`, **por nome de evento** (D10).
  `PAYMENT_AWAITING_RISK_ANALYSIS` → no-op explícito e comentado.
- Route: `externalReference` com prefixo `card-setup:` → `registrarTokenDeCartao` (D4), **antes** de
  cair no caminho de ciclo. Pago sem token → `erro_aplicacao = 'cartao_pago_sem_token'`, sem ativar.
- Não mexer em `STATUS_PAGOS` nem em `STATUS_PAGAVEIS`.

**Régua de mutação:** remover o ramo de `card-setup` faz o teste de ativação por cartão falhar;
remover o `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` do normalizador faz o teste de recusa assíncrona
falhar (dois comportamentos, dois testes).

---

## T7 — UI: seletor de método + estado do cartão + CTA de recusa

**Onde:** `src/app/(app)/assinatura/{logic.ts,formulario-ativacao.tsx,page.tsx}`,
`src/lib/billing/recusa-ui.ts`. **Depende de:** T2, T3, T6.

- D13 (radio atrás de `BILLING_CARTAO_HABILITADO`, validação no servidor, comentários **reescritos**,
  não apagados).
- Estado do cartão salvo: "Visa •••• 8829, atualizado em dd/mm/aaaa" + botão **Atualizar cartão**,
  com a copy de D12 dizendo **antes** do clique que a troca cobra o valor mínimo de novo.
- `montarAvisoRecusa`: caso `CARD_DECLINED` com CTA para `/assinatura` (nunca expor código cru, nunca
  citar valor).
- Botão **Tentar novamente agora** com os limites de D11 (1 tentativa, desabilitado enquanto houver
  cobrança viva).
- **Dono único da leitura** (§5.2.2): a `page.tsx` busca a situação da conta **uma vez** e passa por
  prop; nenhum componente filho refaz a leitura.
- Componentes só do design system (`docs/ux/design-system-espectro-brutal.md`), nada hardcodado.
  Acessibilidade: o radio é `fieldset`/`legend` com rótulo real, não `div` com `onClick`.

---

## T8 — `.env.example` + BACKLOG

`BILLING_CARTAO_HABILITADO` documentada junto do bloco `ASAAS_*` (default `false`, e o motivo: a
tokenização em produção depende de liberação pelo gerente de contas). `BACKLOG.md`: registrar o gate
externo e as duas ratificações da §4 da spec.

---

## T9 — Guarda anti-PAN

**Onde:** `src/security/` (ao lado do guard de `ctx` forjável).

Teste que varre `src/**` e falha se aparecer `creditCardHolderInfo`, `"ccv"` ou
`creditCard:` **como corpo de request** (o adapter só pode ler `payment.creditCard.*` de uma
resposta — a asserção precisa distinguir leitura de escrita, senão vira teste que não testa nada).

**Régua de mutação:** introduzir de propósito um `ccv` num corpo de request derruba o guard.

---

## Checklist de saída do PR

- [ ] `pnpm typecheck` `pnpm lint` `pnpm test` `pnpm test:rls` — 100% verde, **conferindo a contagem
      de testes executados**, não só a cor (`*.int.test.ts` exige
      `--config vitest.integration.config.ts`, senão coleta zero e sai verde).
- [ ] `pnpm format` **nos arquivos tocados**.
- [ ] PR em **Draft** até tudo verde; descrição, commits e comentários em **PT-BR**.
- [ ] Medição do T0 commitada.
