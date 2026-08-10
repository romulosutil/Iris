# Ativação de assinatura via Asaas — tarefas

**Spec**: `.specs/features/billing-ativacao-asaas/spec.md`
**Design**: `.specs/features/billing-ativacao-asaas/design.md`
**Status**: Em execução (Fase A) — T1 ✅ T2 ✅ T3 🟡 (escrito, prod pendente)
T4 ✅ T9 ✅ · próximo: T5 e T6 (paralelos)
**Issue**: #36 · Débitos: D29, D30, D31, D32
**Baseline medida (10/08, antes do T1)**: `pnpm test` → **165 arquivos / 1076 testes**, verde.

---

## Comandos de gate (não existe `.specs/codebase/TESTING.md`; vêm do `CLAUDE.md`)

| Gate       | Comando                                                                         | Quando                                                        |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **quick**  | `pnpm typecheck && pnpm test`                                                   | tarefa que só mexe em TS sem banco                            |
| **full**   | `pnpm typecheck && pnpm test && pnpm test:rls`                                  | tarefa que toca schema, policy, função ou teste de integração |
| **build**  | `rm -rf .next && pnpm build`                                                    | antes de fechar a fase (artefato dev stale dá falso-negativo) |
| **medido** | `psql` contra o banco local — `information_schema`, `pg_proc`, `BEGIN…ROLLBACK` | toda tarefa de migração (regra 3 do `CLAUDE.md`)              |

**Baseline a registrar antes de começar:** rodar `pnpm test` e anotar a contagem
de testes. Toda tarefa seguinte declara a contagem esperada — é o que impede
deleção silenciosa de teste.

---

## Plano de execução

```
FASE A — desbloqueia produção (P1)

  T1 ──→ T2 ──→ T3 [GATE Rômulo] ──→ T4
                                      │
                        ┌─────────────┴─────────────┐
                        ↓                           ↓
                   T5 [P]                      T6 [P]
              (validador doc)            (providerCustomerId)
                        │                           │
                        └─────────────┬─────────────┘
                                      ↓
                                     T7  (logic.ts)
                                      ↓
                                     T8  (formulário)
                                      ↓
                                     T9  (guard anti-default)
                                      ↓
                                    T10  (verificação medida E2E)

FASE B — jornada (P2, depende de T4)

  T11 [P] ──┐
  T12 [P] ──┼──→ (fim da fase)
  T13 [P] ──┘

FASE C — remoção do Mercado Pago (P2, depende de T4)

  T14 ──→ T15 ──→ T16 ──→ T17 [GATE Rômulo] ──→ T18 [GATE Rômulo]
```

---

## FASE A — desbloqueia produção

### T1: Schema — coluna de documento e provedor sem default ✅ FEITO

**Status**: Concluída. Migração gerada: `db/migrations/0090_documento_clinica_e_provedor.sql`
(renomeada do nome aleatório `0090_curved_wallflower` para o padrão do repo; a tag
no `_journal.json` acompanhou). Gate `pnpm typecheck && pnpm test` verde em
**165 arquivos / 1076 testes** = baseline.

**Achado não previsto**: tornar `provider` nullable quebrou o `pnpm typecheck` em
`src/lib/billing/subscription.ts:501` — `getProviderPorId(assinatura.provider)`
no fechamento de ciclo passou a receber `string | null`. Resolvido com guard
explícito que **estoura** quando a linha tem `providerSubscriptionId` e não tem
`provider` (estado que o CHECK do T2 proíbe). Não usar default aqui é
deliberado: emitir cobrança pelo gateway errado é dinheiro.

**What**: Adicionar `clinic.cpfCnpj`; tornar `subscription.provider` nullable e
remover o `.default("mercado_pago")`. Rodar `pnpm db:generate`.
**Where**: `src/db/schema.ts` (~252 clinic, ~1743 subscription) → gera
`db/migrations/00NN_*.sql` + `meta/00NN_snapshot.json`
**Depends on**: None
**Reuses**: padrão de colunas de `clinic`; `db:generate` (reconciliado na 0078)
**Requirement**: ATIV-01, ATIV-05
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [x] `cpfCnpj: text("cpf_cnpj")` em `clinic` (nullable, comentário explicando por quê)
- [x] `provider: text("provider")` — sem `.notNull()`, sem `.default()`
- [x] `pnpm db:generate` gerou `.sql` + snapshot; **ambos commitados juntos**
- [x] `.sql` não contém DDL além do que o Drizzle gerou (o resto vem no T2)
- [x] Entrada no `_journal.json` criada pelo próprio `db:generate`
- [x] Gate: `pnpm typecheck && pnpm test`
- [x] Test count: baseline 1076 (o `migrations.test.ts` valida o journal novo)

**Tests**: none (a mudança é declarativa; `migrations.test.ts` já cobre o journal)
**Gate**: quick
**Commit**: `tech(billing): coluna de documento na clínica e provedor sem default (D29, D30)`

---

### T2: DDL à mão no mesmo `.sql` — definer, grants e CHECK ✅ FEITO

**Status**: Concluída. Tudo dentro de `0090_documento_clinica_e_provedor.sql`,
snapshot **não** tocado. Gate quick verde em 1076 = baseline.
Decisão registrada: a função **não** chama `app_conta_somente_leitura()` — gravar
o documento é passo da ativação, ou seja, a saída da conta bloqueada; barrar ali
trancaria a conta em deadlock (sem pagar não grava, sem gravar não paga).
O `GRANT SELECT (cpf_cnpj)` foi incluído: a 0079 revogou só INSERT/UPDATE/DELETE
em `clinic`, então o SELECT de tabela já alcançava a coluna nova — o grant é
redundante de propósito (medido no T4: `has_column_privilege` = `t` para SELECT,
`f` para UPDATE, que é o desenhado).

**What**: Acrescentar ao `.sql` do T1: função `app_salvar_cpf_cnpj_clinica`
(SECURITY DEFINER), `GRANT`s de coluna, e o CHECK de provedor.
**Where**: `db/migrations/00NN_*.sql` (editar o gerado — **não** tocar o snapshot)
**Depends on**: T1
**Reuses**: `0081_config_emergencia_definer.sql` (precedente exato do definer com
guard de tenant + papel); `app_clinic_id_exigido()` da `0085`
**Requirement**: ATIV-01, ATIV-05
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [ ] `app_salvar_cpf_cnpj_clinica(p_cpf_cnpj text)` SECURITY DEFINER, com:
      tenant por `app_clinic_id_exigido()` (**nunca** cast cru — D16);
      papel `coordenador`; guard de formato (11 ou 14 dígitos)
- [ ] `GRANT EXECUTE ... TO app_role`
- [ ] `GRANT SELECT (cpf_cnpj) ON clinic TO app_role` **se** o T4 medir
      `has_column_privilege` = false (senão, documentar que herdou)
- [ ] CHECK nomeado no padrão Drizzle:
      `subscription_provider_quando_vinculado_check`
      → `CHECK (status = 'free_tier' OR provider IS NOT NULL)`
- [ ] `--> statement-breakpoint` entre statements; cada bloco com comentário do _porquê_
- [ ] Snapshot **não** modificado (DDL fora do `schema.ts` não dessincroniza)
- [ ] Gate: `pnpm typecheck && pnpm test`

**Tests**: none nesta tarefa (a prova é medida no T4)
**Gate**: quick
**Commit**: `tech(billing): definer de documento da clínica e CHECK de provedor`

---

### T3: Backfill das 2 linhas de produção ⚠️ GATE RÔMULO — 🟡 ESCRITO, NÃO APLICADO

**Status**: SQL escrito e commitado (`fdf8963`), gate quick verde.
**Aplicado em produção: NÃO.** Aguarda confirmação explícita do Rômulo.
Aplicado no Postgres local no T4 (livre por regra).

**What**: Statements de backfill no mesmo `.sql`: zerar o provedor fantasma da
linha `free_tier` e devolver a linha `setup_pending`/`mercado_pago` a `free_tier`.
**Where**: `db/migrations/00NN_*.sql` (mesmo arquivo)
**Depends on**: T2
**Requirement**: ATIV-05
**Tools**: MCP `filesystem` · Skill NONE

> ⚠️ **Toca dado de produção. Não aplicar em produção sem confirmação explícita
> do Rômulo** (`CLAUDE.md` §Permissões: "qualquer DDL que altere tabela que já
> tenha dado"). Rodar local/CI é livre.

**Por que a 2ª linha não pode ficar como está**: com o trial vencido,
`derivarSituacao` lê `setup_pending` como `pagamento_em_processamento` →
somente-leitura **e** sem link de saída na UI (`novo-paciente-form.tsx:92`
esconde o link justamente nesse estado). É deadlock de conta. O `preapproval` do
MP nunca será autorizado — a rota de webhook dele sai no T16.

**Done when**:

- [ ] `UPDATE ... SET provider = NULL WHERE status='free_tier' AND provider_subscription_id IS NULL`
- [ ] `UPDATE ... SET status='free_tier', provider=NULL, provider_subscription_id=NULL,
checkout_url=NULL, pix_copia_e_cola=NULL, valor_ativacao_centavos=NULL,
metodo_pagamento=NULL WHERE provider='mercado_pago' AND status='setup_pending'`
- [ ] Comentário no `.sql` citando a medição de 10/08 que justifica cada UPDATE
- [ ] Ordem: backfill **antes** do `ADD CONSTRAINT` (senão o CHECK rejeita)
- [ ] Gate: `pnpm typecheck && pnpm test`

**Tests**: none
**Gate**: quick
**Commit**: `tech(billing): backfill do provedor fantasma nas assinaturas existentes`

---

### T4: Aplicar migração local e **provar medindo** ✅ FEITO

**Status**: Concluída. `pnpm db:migrate` aplicou a 0090 no Postgres local sem
erro. Evidência medida colada abaixo (regra 3 do `CLAUDE.md` — "está no git log"
não é prova).

**Defeito do plano, corrigido na execução**: o T4 declara gate `full`, mas o
CHECK novo derruba os seeds de teste que só o **T9** conserta. Ou seja, o gate
do T4 era inalcançável na ordem escrita. T9 foi antecipado (ele depende só do
T4, nunca do T5-T8) e o gate fechou. Ordem real: T1 → T2 → T3 → T4 → **T9** →
T5/T6.

**Segundo achado**: o plano listava 5 INSERTs quebrados. São **6 caminhos** — os
INSERTs mais os **UPDATEs que flipam** `free_tier` → `active`/`past_due`/
`canceled` (`conta-somente-leitura-rls`, `billing-apuracao`). O CHECK morde no
UPDATE igual morde no INSERT. E o guard de conjunto exato de funções
(`clinic-id-helper-rls`) precisou da linha nova, o que é o guard funcionando.

#### Evidência medida (Postgres local, 10/08)

```
 column_name | data_type | is_nullable | column_default
-------------+-----------+-------------+----------------
 cpf_cnpj    | text      | YES         |

 le | escreve            -- has_column_privilege(app_role, clinic, cpf_cnpj, …)
----+---------
 t  | f                  -- lê sim, escreve não (escrita só pela definer)

           proname           | prosecdef |      args
-----------------------------+-----------+-----------------
 app_salvar_cpf_cnpj_clinica | t         | p_cpf_cnpj text

 column_name | is_nullable | column_default     -- subscription.provider
-------------+-------------+----------------
 provider    | YES         |                    -- default REMOVIDO

 conname                                      | pg_get_constraintdef
----------------------------------------------+----------------------------------
 subscription_provider_quando_vinculado_check | CHECK (((status = 'free_tier'::subscription_status) OR (provider IS NOT NULL)))
```

O CHECK morde (`BEGIN … ROLLBACK`):

```
A) INSERT status='active'    SEM provider -> ERROR: violates check constraint
                                             "subscription_provider_quando_vinculado_check"
B) INSERT status='free_tier' SEM provider -> OK, provider_nulo = t
C) INSERT status='active'    COM 'asaas'  -> OK
```

Os guards da função definer mordem (`BEGIN … ROLLBACK`, como `app_role`):

```
A) UPDATE direto de cpf_cnpj por app_role -> ERROR: permission denied for table clinic
                                             (a 0079 revogou UPDATE; a escrita é só pela definer)
B) definer + coordenador + '111.444.777-35'    -> grava 11144477735   (só dígitos)
   definer + coordenador + '29.811.201/0001-50'-> grava 29811201000150 (14 dígitos)
C) definer + papel 'terapeuta'  -> ERROR: exige papel coordenador (papel do chamador: terapeuta)
D) definer + documento '123'    -> ERROR: documento deve ter 11 dígitos (CPF) ou 14 (CNPJ);
                                          recebeu 3 dígito(s)
E) definer SEM GUC app.clinic_id-> ERROR: tenant não resolvido: GUC app.clinic_id ausente ou
                                          fora do formato uuid          (P0001, não 42704/22P02)
```

**Gate full**: `pnpm test` 166 arquivos / **1078** testes · `pnpm test:rls`
94 arquivos / **803** testes — ambos verdes.

**What**: `pnpm db:migrate` no Postgres local e verificar cada objeto no banco.
**Where**: nenhum arquivo — é execução e evidência
**Depends on**: T3
**Reuses**: `docker compose infra/docker-compose.yml` (:5433)
**Requirement**: ATIV-01, ATIV-05
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [ ] `pnpm db:migrate` aplica sem erro
- [ ] `SELECT ... FROM information_schema.columns WHERE table_name='clinic' AND column_name='cpf_cnpj'` → 1 linha
- [ ] `SELECT has_column_privilege('app_role','clinic','cpf_cnpj','SELECT')` → `true`
      (se `false`, voltar ao T2 e acrescentar o GRANT)
- [ ] `SELECT prosecdef FROM pg_proc WHERE proname='app_salvar_cpf_cnpj_clinica'` → `true`
- [ ] `BEGIN; INSERT INTO subscription (clinic_id,status) VALUES (…,'active'); ROLLBACK;`
      → **viola** o CHECK (prova que o guard morde)
- [ ] `BEGIN; INSERT INTO subscription (clinic_id,status) VALUES (…,'free_tier'); ROLLBACK;`
      → passa com `provider IS NULL`
- [ ] `SELECT column_default FROM information_schema.columns WHERE table_name='subscription' AND column_name='provider'` → `NULL`
- [ ] Gate: `pnpm typecheck && pnpm test && pnpm test:rls`

**Tests**: integration (via `test:rls`)
**Gate**: full
**Verify**: colar a saída dos SELECTs no PR — "está no git log" não é prova

---

### T5: Validador de documento (CPF ou CNPJ) `[P]` ✅ FEITO

**What**: `validarEMaterializarCnpj` + `validarEMaterializarCpfCnpj` que decide a
interpretação pelo comprimento.
**Where**: `src/lib/cnpj.ts` (novo) + `src/lib/documento.ts` (novo)
**Depends on**: T4
**Reuses**: `src/lib/cpf.ts` — mesma forma de retorno
(`{valido:true, cpfLimpo}` | `{valido:false, erro}`)
**Requirement**: ATIV-02
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [x] CNPJ: mod-11, pesos 5..2 / 6..2; rejeita 14 dígitos repetidos
- [x] `validarEMaterializarCpfCnpj`: 11 → CPF, 14 → CNPJ, outro → erro citando os dois formatos
- [x] Aceita com e sem máscara; devolve **só dígitos**
- [x] Erro em pt-BR nomeia a interpretação que falhou (DV ≠ comprimento)
- [x] **Cheque de mutação**: trocar um peso do mod-11 derruba ao menos 1 teste
- [x] Comentário registrando a limitação: CNPJ **alfanumérico** (jul/2026) não
      é aceito nesta fase — não verificado se o Asaas o aceita
- [x] Gate: `pnpm typecheck && pnpm test`
- [x] Test count: baseline + N (declarar N)

**Status**: Concluída. Criados `src/lib/cnpj.ts`, `src/lib/documento.ts` e os
testes `src/lib/cnpj.test.ts` (9) + `src/lib/documento.test.ts` (6).

- Contagem: **166 arquivos / 1078 testes → 168 arquivos / 1093 testes**
  (**N = +15**), com `pnpm typecheck` limpo.
- Cheque de mutação (medido): trocando os dois últimos pesos do 1º DV
  (`[…, 5, 4, 3, 2]` → `[…, 5, 4, 2, 3]` em `PESOS_PRIMEIRO`), a suíte dos dois
  arquivos foi de `15 passed` para `5 failed | 10 passed` — falharam os 3 casos
  de CNPJ válido em `cnpj.test.ts` e os 2 de composição em `documento.test.ts`.
  Peso revertido; verde restaurado.
- Nota de implementação: sob `noUncheckedIndexedAccess` o laço `for` indexando o
  array de pesos quebra o typecheck (`TS2532`); os somatórios iteram sobre o
  próprio array de pesos via `reduce`, o que mantém os pesos explícitos (e
  portanto mutáveis para o cheque acima).

**Tests**: unit
**Gate**: quick
**Commit**: `feat(billing): validador de CPF ou CNPJ para o documento da clínica`

---

### T6: `providerCustomerId` na porta e no adapter Asaas `[P]` ✅ FEITO

**What**: `VinculoCriado.providerCustomerId?` na porta; `AsaasProvider` passa a
devolver o `customerId` que hoje descarta; `iniciarAtivacao` persiste na coluna.
**Where**: `src/lib/billing/provider/types.ts` (~147) ·
`src/lib/billing/provider/asaas.ts` (~502) · `src/lib/billing/subscription.ts` (~260)
**Depends on**: T4
**Reuses**: disciplina do D21 — escrever a coluna sempre, junto com `provider`,
no INSERT **e** no `onConflictDoUpdate`
**Requirement**: ATIV-04 (D32)
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [x] Campo opcional na porta, com docblock explicando por que é opcional
      (nem todo trilho tem "cliente" separado do vínculo) — sem jargão de provedor
- [x] `asaas.ts` devolve `providerCustomerId: customerId`
- [x] `subscription.ts` grava `provider_customer_id` no INSERT e no conflict
- [x] Teste de integração afirma a coluna preenchida após ativação (dublê de fetch)
- [x] Gate: `pnpm typecheck && pnpm test && pnpm test:rls`
- [x] Test count: baseline + N

**Tests**: integration
**Gate**: full
**Commit**: `feat(billing): persiste o id do cliente do gateway (D32)`

**Status**: coluna `provider_customer_id` já existia (0071) e foi verificada
medindo — `information_schema.columns` + `has_column_privilege('iris_auth', …)`
com INSERT/UPDATE `true`. Nenhuma migração tocada.

Arquivo novo: `src/lib/billing/ativacao-provider-customer-id.int.test.ts`
(2 testes — INSERT e `onConflictDoUpdate`). Como `vitest.config.ts` exclui
`**/*.int.test.ts`, ele conta em `test:rls`, não em `test`.

- `pnpm test:rls`: 94 arquivos/803 testes → **95 arquivos/805 testes**, verde.
- `pnpm test`: 168 arquivos/1093 testes, verde (baseline 166/1078; o delta é de
  outra tarefa em paralelo, nenhum teste novo meu cai aqui).
- `pnpm typecheck`: sem erro nos arquivos desta tarefa.

Mutação como prova: removendo as duas linhas `providerCustomerId` de
`subscription.ts`, os 2 testes falham pelos motivos certos — `expected null`
no INSERT e `expected 'cus_000000000001'` (resíduo da tentativa anterior) no
conflito. Restaurado em seguida.

---

### T7: `logic.ts` — validar, gravar, enviar

**What**: `iniciarAtivacaoAssinatura` passa a ler o documento do formulário,
validar, gravar via definer **antes** do gateway, e enviar em `PedidoAtivacao`.
**Where**: `src/app/(app)/assinatura/logic.ts` (~53-127)
**Depends on**: T5, T6
**Reuses**: `withTenant` já aberto no arquivo; padrão de erro pt-BR do próprio módulo
**Requirement**: ATIV-03, ATIV-04
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [ ] Documento inválido → `{ error }` em pt-BR e **zero** chamada ao gateway
- [ ] Documento válido → `SELECT app_salvar_cpf_cnpj_clinica($1)` dentro do
      `withTenant` existente, **antes** de `iniciarAtivacao`
- [ ] `iniciarAtivacao({ ..., cpfCnpj: documento })`
- [ ] `AtivacaoState` ganha o documento corrente para repopular o formulário no erro
- [ ] Teste de integração: (a) inválido não chama gateway; (b) válido grava a
      coluna e chega ao adapter com o documento; (c) falha do gateway **não**
      perde o documento gravado
- [ ] Gate: `pnpm typecheck && pnpm test && pnpm test:rls`
- [ ] Test count: baseline + N

**Tests**: integration
**Gate**: full
**Commit**: `feat(billing): ativação envia o CPF/CNPJ da clínica ao gateway (D30)`

---

### T8: Campo de documento na tela de ativação

**What**: Campo obrigatório de CPF/CNPJ no formulário, pré-preenchido quando já gravado.
**Where**: `src/app/(app)/assinatura/formulario-ativacao.tsx` ·
`src/app/(app)/assinatura/page.tsx` (ler `clinic.cpf_cnpj` e passar como prop)
**Depends on**: T7
**Reuses**: `Field` + `Input` do design system (**nunca** hardcodar componente);
costura de teste `acao`/`navegar` que o arquivo já tem
**Requirement**: ATIV-03
**Tools**: MCP `filesystem` · Skill `ui-ux-pro-max` (opcional, só se a copy pedir revisão)
**Aceite (a11y)**: `htmlFor`/`id` ligados, erro com `aria-describedby`,
`inputMode="numeric"` — mas **sem** `required` em campo escondido (padrão do repo)

**Done when**:

- [ ] Campo com rótulo "CPF ou CNPJ do titular da conta" e copy dizendo que o
      banco exige para registrar o Pix Automático
- [ ] `defaultValue` com o documento gravado; permanece editável
- [ ] Erro de validação renderizado junto do campo, não só no topo
- [ ] Teste de componente: vazio → erro; pré-preenchido → valor no input
- [ ] Gate: `pnpm typecheck && pnpm test`
- [ ] Test count: baseline + N

**Tests**: unit (componente)
**Gate**: quick
**Commit**: `feat(assinatura): campo de CPF/CNPJ na ativação`

---

### T9: Corrigir os 5 INSERTs de teste + guard anti-regressão ✅ FEITO (antecipado)

**Status**: Concluída, **executada antes do T5-T8** — o gate `full` do T4 não
fecha sem ela. Commit `6501e42`. Contagem 1076 → **1078** (baseline + 2 do
guard novo), nenhum teste deletado; RLS 803 verdes.

**Correção do escopo previsto**: eram **6 caminhos**, não 5 —
os INSERTs mais os UPDATEs que flipam `free_tier` → `active`/`past_due`/
`canceled`. Mais a linha no oráculo de `clinic-id-helper-rls` (13 → 14 funções).
Guard escrito em `src/db/schema-billing.test.ts` (arquivo novo, em vez de anexo
ao `migrations.test.ts`, que é sobre journal e não sobre schema).

**What**: Ajustar os INSERTs que o CHECK quebra e travar o retorno do default.
**Where**: `src/app/(app)/pacientes/novo/actions.int.test.ts:78,738` ·
`src/app/(admin)/benjamin/queries.int.test.ts:34` ·
`db/tests/billing-apuracao.int.test.ts:388` ·
`src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo.int.test.ts:195` ·
guard novo em `src/db/schema.test.ts` (ou anexo a `migrations.test.ts`)
**Depends on**: T4
**Requirement**: ATIV-06
**Tools**: MCP `filesystem` · Skill NONE

**Já verificado — não precisa procurar**: os 5 acima usam status `active`/`canceled`
sem `provider`. Os INSERTs `free_tier` (`clinic-id-helper-rls:531,588`,
`conta-somente-leitura-rls:124`, `billing-apuracao:387`, `benjamin:35`) **passam**
sem mudança. Os testes multi-provedor (`ativacao-troca-de-provedor:83`,
`fechamento-provedor-por-linha:82`, `reprocessamento-provedor:110`,
`asaas/route.int.test:97`) **já declaram `provider`**.

**Done when**:

- [ ] Os 5 INSERTs declaram `provider` explicitamente (`'asaas'`)
- [ ] Guard falha o CI se `schema.ts` reganhar `.default(` em `subscription.provider`
- [ ] **Cheque de mutação**: reintroduzir o default derruba o guard
- [ ] Gate: `pnpm typecheck && pnpm test && pnpm test:rls`
- [ ] Test count: baseline + 1 (nenhum teste deletado)

**Tests**: integration
**Gate**: full
**Commit**: `test(billing): provedor explícito nas assinaturas de teste e trava do default`

---

### T10: Prova ponta a ponta contra o Asaas

**What**: Ativação real (sandbox) e evidência de cada elo da cadeia.
**Where**: nenhum arquivo — é execução e evidência
**Depends on**: T8, T9
**Requirement**: ATIV-01..06 (fechamento)
**Tools**: NONE

**Done when**:

- [ ] `rm -rf .next && pnpm build` verde (armadilha do `.next/dev/types` stale)
- [ ] Ativação numa clínica de teste devolve BR Code + valor
- [ ] Linha em `subscription`: `status='setup_pending'`, `provider='asaas'`,
      `pix_copia_e_cola` e `valor_ativacao_centavos` preenchidos,
      `provider_customer_id` **preenchido** (nunca esteve, D32)
- [ ] Saída dos SELECTs colada no PR

**Tests**: none (verificação manual medida)
**Gate**: build

---

## FASE B — jornada sem beco

### T11: CTA depois do QR Code `[P]`

**What**: Botão "Cadastrar paciente" no ramo `pix_copia_e_cola`, depois do aviso
de que a confirmação chega sozinha.
**Where**: `src/app/(app)/assinatura/formulario-ativacao.tsx` (~150)
**Depends on**: T4
**Reuses**: `Button variante="primaria" asChild` + `Link` (padrão de `pacientes/page.tsx:21`)
**Requirement**: ATIV-08
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [ ] CTA renderizado **só** no ramo `pix_copia_e_cola`
- [ ] Sem polling de status (a página de destino já reavalia no request)
- [ ] Teste de componente afirma o link presente com autorização Pix e ausente sem autorização
- [ ] Gate: `pnpm typecheck && pnpm test` · Test count: baseline + N

**Tests**: unit
**Gate**: quick
**Commit**: `feat(assinatura): caminho de volta ao cadastro depois do Pix`

---

### T12: Aviso antecipado em `/pacientes/novo` `[P]`

**What**: Alert de conta em somente-leitura **antes** do formulário, com link só
onde ativar é a saída.
**Where**: `src/app/(app)/pacientes/novo/page.tsx` (~35-41)
**Depends on**: T4
**Reuses**: `obterSituacaoConta` já chamado na página; `mensagemDeEstado`;
**critério idêntico** ao de `novo-paciente-form.tsx:92` (link só em
`trial_expirado`/`cancelada` — nunca em `pagamento_em_processamento`, que geraria
2ª cobrança)
**Requirement**: ATIV-09
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [ ] `!podeCadastrarPaciente` → Alert destacado antes do formulário
- [ ] Link de ativação segue o mesmo critério do formulário (não duplicar regra divergente)
- [ ] Formulário continua renderizado; a defesa no submit permanece intacta
- [ ] Teste: conta `trial_expirado` mostra aviso + link; `pagamento_em_processamento` mostra aviso **sem** link
- [ ] Gate: `pnpm typecheck && pnpm test` · Test count: baseline + N

**Tests**: unit
**Gate**: quick
**Commit**: `feat(pacientes): avisa conta bloqueada antes do formulário`

---

### T13: Remover a página de retorno órfã `[P]`

**What**: Deletar `/assinatura/retorno`; `urlRetorno` passa a apontar para `/assinatura`.
**Where**: `src/app/(app)/assinatura/retorno/page.tsx` (deletar) ·
`src/app/(app)/assinatura/logic.ts:103`
**Depends on**: T4
**Requirement**: ATIV-08
**Tools**: MCP `filesystem` · Skill NONE

**Não remover**: `NovoVinculo.urlRetorno` (contrato neutro para provedor de
checkout futuro) nem o ramo `redirect` da UI / o `useEffect` — são o render da
união discriminada `AutorizacaoPendente`, que continua tendo as duas formas.

**Done when**:

- [ ] Diretório `retorno/` deletado
- [ ] `urlRetorno` → `${base}/assinatura`
- [ ] `grep -r "assinatura/retorno" src/` → zero
- [ ] Gate: `pnpm typecheck && pnpm test`

**Tests**: none
**Gate**: quick
**Commit**: `tech(assinatura): remove a página de retorno inalcançável`

---

## FASE C — remoção do Mercado Pago

> **Pré-requisito duro**: T4 aplicado. Sem o default removido, linha nova nasce
> apontando para adapter deletado.

### T14: Reescrever a cobertura multi-provedor com dublê

**What**: Os testes que provam "a linha decide o adapter" (D25/D26) passam a usar
um provedor fake registrado no teste, em vez do MP real.
**Where**: `src/lib/billing/ativacao-troca-de-provedor.int.test.ts` ·
`src/lib/billing/fechamento-provedor-por-linha.int.test.ts` ·
`src/lib/billing/reprocessamento-provedor.int.test.ts`
**Depends on**: T4
**Requirement**: ATIV-07
**Tools**: MCP `filesystem` · Skill NONE

⚠️ **Não deletar esta cobertura.** Ela prova invariantes que custaram 3 defeitos
seguidos (D25/D26/D27). O que sai é o _nome_ do provedor, não o invariante.
Dublê com classe: **nunca** `vi.fn().mockImplementation(() => ({}))` — `new X()`
estoura, cai no catch e o teste passa pelo caminho errado.

**Done when**:

- [ ] Provedor fake implementa `BillingProvider` inteira
- [ ] Os 3 testes seguem provando: reaproveitamento só do mesmo provedor;
      fechamento resolve por linha; reprocessamento casa tabela × adapter
- [ ] Gate: `pnpm typecheck && pnpm test && pnpm test:rls`
- [ ] Test count: **igual ou maior** que o baseline (nenhuma asserção perdida)

**Tests**: integration
**Gate**: full
**Commit**: `test(billing): cobertura multi-provedor sem depender do Mercado Pago`

---

### T15: `ProviderId` e resolução de adapter sem MP

**What**: `ProviderId` vira `"asaas"`; ramos do MP saem de `getBillingProvider`
e `getProviderPorId`.
**Where**: `src/lib/billing/provider/types.ts:42` · `src/lib/billing/provider/index.ts`
**Depends on**: T14
**Requirement**: ATIV-07
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [ ] `pnpm typecheck` aponta (e são corrigidos) todos os call sites
- [ ] `getProviderPorId('mercado_pago')` → erro "Provedor de pagamento desconhecido"
- [ ] Gate: `pnpm typecheck && pnpm test` · Test count: baseline

**Tests**: unit
**Gate**: quick
**Commit**: `tech(billing): Asaas passa a ser o único provedor conhecido`

---

### T16: Deletar adapter e rota de webhook do MP

**What**: Remover os arquivos do Mercado Pago.
**Where**: `src/lib/billing/provider/mercado-pago.ts` + `.test.ts` ·
`src/app/api/hooks/mercadopago/` (rota + `route.int.test.ts`)
**Depends on**: T15
**Requirement**: ATIV-07
**Tools**: MCP `filesystem` · Skill NONE

**Done when**:

- [ ] Arquivos deletados
- [ ] `grep -ri "mercado.pago\|mercadopago" src/` → só comentário de registro histórico
- [ ] Gate: `pnpm typecheck && pnpm test && pnpm test:rls` · `rm -rf .next && pnpm build`
- [ ] Test count: baseline − (testes do MP), com a queda **declarada no PR**

**Tests**: integration
**Gate**: build
**Commit**: `tech(billing): remove o adapter e o webhook do Mercado Pago (D24)`

---

### T17: Limpar envs ⚠️ GATE RÔMULO

**What**: Remover `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`,
`MERCADOPAGO_WEBHOOK_SECRET` do `.env.example` e do Easypanel (`iris-app`).
**Where**: `.env.example` §Cobrança · painel Easypanel
**Depends on**: T16
**Requirement**: ATIV-07
**Tools**: NONE

⚠️ Mexer em env de produção é ação de via única. **Confirmar antes.**
Lembretes: salvar no Easypanel **não** aplica — exige "Implantar", que rebuilda o
HEAD de `main`. E a aba Ambiente expõe segredo em claro: não tirar screenshot.
Desativar o webhook no painel do Mercado Pago é passo manual, fora do código.

**Done when**:

- [ ] 3 envs fora do `.env.example`
- [ ] 3 envs removidas do `iris-app` no Easypanel + "Implantar"
- [ ] Webhook desativado no painel do MP
- [ ] Aplicação sobe sem erro

**Tests**: none
**Gate**: build

---

### T18: DROP da tabela de webhook do MP ⚠️ GATE RÔMULO

**What**: Migração que remove a tabela de eventos de webhook do Mercado Pago.
**Where**: `db/migrations/00NN_*.sql`
**Depends on**: T17
**Requirement**: ATIV-07
**Tools**: NONE

⚠️ DDL destrutivo em tabela de produção. **Medir antes**: `SELECT count(*)` na
tabela. Se houver evento gravado, a alternativa barata é **manter a tabela como
histórico** e só remover o código — decidir com o Rômulo, não por conta.

**Done when**:

- [ ] `count(*)` medido e registrado
- [ ] Decisão registrada no `BACKLOG.md` (dropar × manter como histórico)
- [ ] Se dropar: migração com journal correto + `pnpm test` verde

**Tests**: none
**Gate**: full

---

## Cross-check diagrama × definição

| Tarefa    | `Depends on` (corpo) | Diagrama                   | Status |
| --------- | -------------------- | -------------------------- | ------ |
| T1        | None                 | raiz                       | ✅     |
| T2        | T1                   | T1→T2                      | ✅     |
| T3        | T2                   | T2→T3                      | ✅     |
| T4        | T3                   | T3→T4                      | ✅     |
| T5 `[P]`  | T4                   | T4→T5                      | ✅     |
| T6 `[P]`  | T4                   | T4→T6                      | ✅     |
| T7        | T5, T6               | T5→T7, T6→T7               | ✅     |
| T8        | T7                   | T7→T8                      | ✅     |
| T9        | T4                   | T8→T9 (sequencial na fase) | ✅     |
| T10       | T8, T9               | T9→T10                     | ✅     |
| T11 `[P]` | T4                   | fase B                     | ✅     |
| T12 `[P]` | T4                   | fase B                     | ✅     |
| T13 `[P]` | T4                   | fase B                     | ✅     |
| T14       | T4                   | fase C raiz                | ✅     |
| T15       | T14                  | T14→T15                    | ✅     |
| T16       | T15                  | T15→T16                    | ✅     |
| T17       | T16                  | T16→T17                    | ✅     |
| T18       | T17                  | T17→T18                    | ✅     |

T5/T6 são `[P]` e não dependem um do outro. T11/T12/T13 são `[P]` e tocam
arquivos disjuntos. Nenhum par `[P]` compartilha estado mutável.

## Granularidade

| Tarefa        | Escopo                                             | Status                                           |
| ------------- | -------------------------------------------------- | ------------------------------------------------ |
| T1, T2, T3    | 1 arquivo cada (schema / sql / sql)                | ✅                                               |
| T4, T10       | execução + evidência, 0 arquivo                    | ✅                                               |
| T5            | 2 arquivos coesos (validador + composição)         | ✅                                               |
| T6            | 3 arquivos, 1 conceito (o campo atravessa a porta) | ⚠️ aceitável — dividir criaria tipo sem produtor |
| T7, T8, T9    | 1 conceito cada                                    | ✅                                               |
| T11, T12, T13 | 1 arquivo cada                                     | ✅                                               |
| T14..T18      | 1 passo de remoção cada                            | ✅                                               |

## Rastreabilidade

| ID      | Tarefas                 | Status  |
| ------- | ----------------------- | ------- |
| ATIV-01 | T1, T2, T4              | Pending |
| ATIV-02 | T5                      | Done    |
| ATIV-03 | T7, T8                  | Pending |
| ATIV-04 | T6, T7                  | Pending |
| ATIV-05 | T1, T2, T3, T4          | Pending |
| ATIV-06 | T9                      | Pending |
| ATIV-07 | T14, T15, T16, T17, T18 | Pending |
| ATIV-08 | T11, T13                | Pending |
| ATIV-09 | T12                     | Pending |

**Cobertura**: 9 requisitos, 9 mapeados, 0 órfãos.
