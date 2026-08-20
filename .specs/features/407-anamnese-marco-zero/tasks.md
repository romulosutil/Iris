# Anamnese como marco 0 — Tasks

**Design**: [`design.md`](./design.md) · **Spec**: [`spec.md`](./spec.md) · **Contexto**: [`context.md`](./context.md)
**Issue**: [#407](https://github.com/romulosutil/Iris/issues/407) · **Status**: Draft

---

## Convenções de Gate (valem para TODAS as tasks)

| Gate       | Comandos                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `quick`    | `pnpm typecheck` && `pnpm lint` && `npx vitest run <arquivo>`                                                                          |
| `unit`     | `pnpm typecheck` && `pnpm lint` && `pnpm test`                                                                                         |
| `int`      | `npx vitest run --config vitest.integration.config.ts <arquivo>` — **conferir a CONTAGEM de arquivos e testes coletados, nunca a cor** |
| `rls`      | `pnpm test:rls` — conferir a contagem de arquivos **executados**; verde com "skipped" é vermelho disfarçado                            |
| `migracao` | `pnpm db:migrate` && `npx vitest run src/db/migrations.test.ts` && medição em `pg_proc`/`pg_policies`/`information_schema`             |
| `full`     | `pnpm typecheck` && `pnpm lint` && `pnpm test` && `pnpm test:rls` && `npx vitest run src/db/migrations.test.ts`                        |
| `format`   | `npx prettier --write <arquivos tocados>` — **nunca** `pnpm format` (reformata o repo inteiro, D-K)                                    |

> ⚠️ **A armadilha que mais custa neste repo:** `*.int.test.ts` está no `exclude` do `vitest.config.ts`. `npx vitest run db/tests/x.int.test.ts` **coleta zero e sai verde**. Sem `--config vitest.integration.config.ts` a task está mentindo. Toda task de int-test abaixo repete isso no Gate de propósito.

**TDD**: em toda task com `Tests`, o teste que **falha** vem antes da implementação — ou em task própria (T02, T04) ou como primeiro item do `Done when`.

**Régua de mutação por comportamento (AGENTS §5.2.5)**: comportamento com dois lados exige **dois** testes. ANAM-09 (validar **faz** o snapshot 0 existir) e ANAM-10 (rascunho **não** faz) são tasks separadas de propósito: T10 e T09.

---

## Execution Plan

### Fase 0 — Banco (sequencial, com um teste-vermelho em paralelo)

```
T01 ──┬──→ T03 ──→ T05
      └──→ T02 ↗        T04 ↗
```

### Fase 1 — Lógica de servidor

```
T05 ──┬──→ T08 ──→ T09 ──→ T10 ──→ T11 → T12 → T13 → T14 → T15 → T16 → T17 → T18 → T19
      ├──→ T06 [P]
      └──→ T07 [P]
```

### Fase 2 — Invariantes e regressão

```
T17 ──┬──→ T20  (billing)
      ├──→ T21  (rematerialização)
      ├──→ T22  (chave órfã)
      ├──→ T23 [P]  (fase4-snapshot-rls)
      └──→ T24 [P]  (fase4-materializar)
T30 ──→ T25  (queries.int)
T31 ──→ T26 [P]  (espectro.test)
```

### Fase 3 — UI

```
T07 ──→ T27 ──→ T28 ──→ T29
T05 ──→ T30 [P]
T27 ──→ T31
T05 ──→ T32 [P]
T17 ──→ T33
tudo ──→ T34
```

---

## Task Breakdown

### T01: Declarar `anamnese` e `anamnese_alvo` em `schema.ts` e gerar a `0115`

**What**: Adicionar os dois enums e as duas tabelas ao schema Drizzle e rodar `pnpm db:generate`, produzindo `db/migrations/0115_anamnese_marco_zero.sql` + `meta/0115_snapshot.json` + entrada de journal.
**Where**: `src/db/schema.ts`; `db/migrations/0115_anamnese_marco_zero.sql` (gerado); `db/migrations/meta/`
**Depends on**: None
**Reuses**: DDL de `instrumento_aplicacao` (`0113:3-26`) como modelo de shape; `patient_protocol` (`schema.ts:656-681`) como modelo de CHECK nomeado
**Requirement**: ANAM-01, ANAM-02, ANAM-19, ANAM-21

**Done when**:

- [ ] Enums `anamnese_estado('rascunho','validada')` e `anamnese_procedencia('relatado_responsavel','observado_avaliador','registro_anterior')`
- [ ] Colunas, tipos, NOT NULL, defaults e os 5 CHECKs nomeados exatamente como no `design.md` §Data Models
- [ ] `patient_id` é `ON DELETE cascade` nas DUAS tabelas (D-K: expurgo LGPD sem editar `app_purgar_paciente`)
- [ ] Constraints no padrão Drizzle (`_fk`/`_pk`/`_unique`), nunca `_fkey`/`_pkey`/`_key`
- [ ] Todo CHECK escrito como `col IS NULL OR <predicado>` — expressão `NULL` **satisfaz** o CHECK
- [ ] `.sql` e `meta/0115_snapshot.json` commitados juntos; `db:generate` rodado de novo responde `No schema changes`
- [ ] Journal: `idx: 115`, tag `0115_anamnese_marco_zero`. Se a entrada precisar ser manual, `when = 1787100343349`

**Tests**: integration (journal/snapshot)
**Gate**: `npx vitest run src/db/migrations.test.ts` && `pnpm typecheck` && `pnpm db:migrate` && `format`
**Commit**: `feat(anamnese): add anamnese and anamnese_alvo tables (0115)`

---

### T02: Teste RLS vermelho da `anamnese` (antes das policies) [P]

**What**: Escrever `db/tests/anamnese-rls.int.test.ts` provando isolamento e append-only — e vê-lo **falhar** (hoje não há RLS nem GRANT).
**Where**: `db/tests/anamnese-rls.int.test.ts`
**Depends on**: T01
**Reuses**: setup de `db/tests/fase4-snapshot-rls.int.test.ts`
**Requirement**: ANAM-01

**Done when**:

- [ ] Casos: clínica A não lê linha da clínica B; terapeuta fora da equipe não lê; terapeuta da equipe lê e insere rascunho; `UPDATE` em linha `validada` afeta 0 linhas / é negado; `UPDATE estado` é negado por falta de GRANT de coluna; `DELETE` de rascunho só por coordenador
- [ ] Roda com role **não-superusuária** (`DATABASE_URL` na role de app, não na dona — BYPASSRLS mascara tudo)
- [ ] O teste **falha** neste momento, pelo motivo certo (registrar qual)

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-rls.int.test.ts` — 1 arquivo coletado, N testes, **falhando**

---

### T03: GRANTs, RLS e as 8 policies escritas à mão na `0115`

**What**: Acrescentar ao `.sql` gerado (sem tocar o snapshot) os GRANTs, `ENABLE`/`FORCE RLS`, as 8 policies e o helper `app_anamnese_em_rascunho`.
**Where**: `db/migrations/0115_anamnese_marco_zero.sql` (parte manual)
**Depends on**: T01, T02
**Reuses**: predicado canônico copiado **literal** de `0113_instrumento_aplicacao.sql:27-69`
**Requirement**: ANAM-01, ANAM-02, ANAM-12

**Done when**:

- [ ] `GRANT SELECT, INSERT, DELETE ON anamnese TO app_role` + `GRANT UPDATE (protocol_id, nivel_entrada_sugerido, sugestao_aceita, observacoes)` — `estado`, `validada_em`, `validada_por` **fora** do GRANT (append-only mecânico, D-F)
- [ ] 8 policies (4 por tabela); `UPDATE`/`DELETE` exigem `estado = 'rascunho'`
- [ ] Tenant resolvido **só** por `app_clinic_id_exigido()`. Zero `current_setting('app.clinic_id')::uuid`. Zero `app_clinic_id_atual()` em predicado de isolamento
- [ ] Comentário cita a migração-fonte do predicado copiado e explica GRANT-vs-definer (D-J, modelo `0113:27-35`)
- [ ] `meta/0115_snapshot.json` **não** foi alterado por esta task (`git diff` limpo nele)
- [ ] T02 passa
- [ ] Medido em banco: `pg_policies` lista as 8; `information_schema.role_column_grants` mostra os 4 UPDATEs de coluna e **nenhum** em `estado`

**Tests**: integration
**Gate**: `pnpm db:migrate` && `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-rls.int.test.ts db/tests/clinic-id-helper-rls.int.test.ts` — 2 arquivos coletados, todos verdes && `pnpm test:rls` && `format`
**Commit**: `feat(anamnese): add RLS policies and column grants to 0115`

---

### T04: Teste vermelho do definer `app_validar_anamnese`

**What**: Escrever `db/tests/anamnese-validar-definer.int.test.ts` cobrindo os 7 comportamentos do definer — e vê-lo falhar (a função não existe).
**Where**: `db/tests/anamnese-validar-definer.int.test.ts`
**Depends on**: T03
**Reuses**: setup de `db/tests/fase4-snapshot-rls.int.test.ts`; asserções sobre `session_snapshot`
**Requirement**: ANAM-04, ANAM-07, ANAM-12

**Done when**:

- [ ] Caso 1: coordenador valida → `session_snapshot` com `session_numero = 0` **passa a existir** onde não existia
- [ ] Caso 2: terapeuta chama o definer direto → `RAISE`, nenhum snapshot
- [ ] Caso 3: paciente de outra clínica → `RAISE` (isolamento)
- [ ] Caso 4: consentimento revogado → `RAISE` com a mensagem de somente-leitura
- [ ] Caso 5: **segunda validação da mesma anamnese** → `RAISE ANAMNESE_JA_VALIDADA`; snapshot 0 **byte-idêntico** ao de antes (comparar `repertorio_state` e `gerado_em`)
- [ ] Caso 6: anamnese complementar com **eixo novo** → chave nova entra; chaves antigas **inalteradas**; `gerado_em` **inalterado**
- [ ] Caso 7: anamnese complementar com **eixo já existente** → valor antigo **vence** (D-E, marco 0 imutável)
- [ ] Sem protocolo ativo com `jsonb_array_length(taxonomia_ajuda) >= 2` → `RAISE ANAMNESE_SEM_PROTOCOLO_ATIVO`
- [ ] Todos falhando agora, por "function does not exist"

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar-definer.int.test.ts` — 1 arquivo, 8 testes coletados, **falhando**

---

### T05: Implementar `app_validar_anamnese` na `0115`

**What**: Escrever a função `SECURITY DEFINER` com os 8 passos do `design.md`.
**Where**: `db/migrations/0115_anamnese_marco_zero.sql` (parte manual)
**Depends on**: T04
**Reuses**: shape de `app_aplicar_snapshot` (`0094:41-71`) — lock, `SET search_path TO 'public'`, ordem dos guards
**Requirement**: ANAM-04, ANAM-06, ANAM-07, ANAM-12

**Done when**:

- [ ] `pg_advisory_xact_lock(hashtextextended(patient::text, 0))` — mesmo lock de `0094:48`
- [ ] Guard de tenant por `app_clinic_id_exigido()`; guard de papel **estritamente coordenador** com comentário dizendo que é restrição deliberada sobre o predicado de `anamnese_select`, não omissão (CLAUDE.md ponto 5)
- [ ] Guard `app_prontuario_somente_leitura` (D-H)
- [ ] Guard de protocolo ativo com `jsonb_array_length(...) >= 2`
- [ ] `UPDATE anamnese ... WHERE estado = 'rascunho'` + `GET DIAGNOSTICS ROW_COUNT` **antes** do INSERT no snapshot; 0 linhas → `RAISE ANAMNESE_JA_VALIDADA`
- [ ] `ON CONFLICT DO UPDATE SET repertorio_state = EXCLUDED.repertorio_state || session_snapshot.repertorio_state` (merge aditivo — o operando da direita vence); `gerado_em = session_snapshot.gerado_em` (**não** `now()`)
- [ ] `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO app_role`
- [ ] Snapshot Drizzle intacto
- [ ] Medido: `SELECT prosecdef FROM pg_proc WHERE proname = 'app_validar_anamnese'` → `t`. `git log` não prova execução
- [ ] T04 passa: 8/8

**Tests**: integration
**Gate**: `pnpm db:migrate` && `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar-definer.int.test.ts db/tests/clinic-id-helper-rls.int.test.ts` — 2 arquivos, 0 skipped && `pnpm test:rls` && `format`
**Commit**: `feat(anamnese): add app_validar_anamnese definer writing snapshot 0`

---

### T06: `OrigemDesarquivamento` ganha `"validacao_anamnese"` [P]

**What**: Acrescentar o membro à união e cobrir com teste.
**Where**: `src/lib/patient/desarquivamento.ts:6-15`; teste co-locado
**Depends on**: T05
**Reuses**: `desarquivarPacienteSeArquivado`
**Requirement**: ANAM-11

**Done when**:

- [ ] Teste primeiro: origem `"validacao_anamnese"` é aceita pelo tipo e chega ao `audit_log`
- [ ] Membro acrescentado; nenhum call-site existente muda de origem

**Tests**: unit
**Gate**: `quick` (`npx vitest run src/lib/patient/`) && `format`

---

### T07: Helper único de rótulo `rotulos.ts` [P]

**What**: Criar o módulo com `ROTULO_MARCO_ZERO`, `rotuloPonto`, `rotuloPontoCurto`, `rotuloDesde`, `rotuloAte` e seu teste de tabela.
**Where**: `src/app/(app)/pacientes/[id]/timeline/rotulos.ts` + `rotulos.test.ts`
**Depends on**: T05
**Reuses**: nada — é módulo puro
**Requirement**: ANAM-14

**Done when**:

- [ ] Teste primeiro, tabela cobrindo `n = 0` e `n > 0` nas 4 funções
- [ ] `n = 0` → nunca contém a string `"Sessão"`; `n > 0` → texto idêntico ao de hoje (nenhuma regressão de copy)
- [ ] ⚠️ **Sem `"use client"` no arquivo.** A diretiva é do MÓDULO: helper exportado de módulo cliente vira referência de cliente e derruba `page.tsx` com 500 em runtime, com typecheck/lint/testes verdes

**Tests**: unit
**Gate**: `quick` (`npx vitest run "src/app/(app)/pacientes/[id]/timeline/rotulos.test.ts"`) && `format`

---

### T08: Schemas Zod da anamnese

**What**: Criar `schemas.ts` com `PROCEDENCIAS`, `EIXOS_ANAMNESE`, `alvoSchema`, `salvarRascunhoSchema`, `validarAnamneseSchema`, e o teste unitário.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/schemas.ts` + `schemas.test.ts`
**Depends on**: T05
**Reuses**: `metas/schemas.ts` (padrão de Zod fora de `"use server"`; `criterioDominioSchema`; `DISCIPLINAS`)
**Requirement**: ANAM-08, ANAM-19

**Done when**:

- [ ] Teste primeiro: 24 alvos passa; 25 alvos falha com a mensagem nomeada; `nivelAjudaInicial: null` é aceito e `undefined` **não** vira `0`; `procedencia` é obrigatória
- [ ] `EIXOS_ANAMNESE` idêntico a `ORDEM_EIXOS` de `espectro.ts` — teste que compara as duas listas (senão o CHECK do banco e o Zod divergem em silêncio)
- [ ] Docblock explica **por quê** o arquivo existe (módulo `"use server"` só exporta funções async), no estilo de `metas/schemas.ts`

**Tests**: unit
**Gate**: `quick` && `format`

---

### T09: `salvarRascunhoAnamnese` — e o teste de que ele NÃO cria nada (lado B de ANAM-09/10)

**What**: Implementar o core de rascunho e o teste de integração que prova a **ausência** de efeito na linha do tempo.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`; `db/tests/anamnese-rascunho.int.test.ts`
**Depends on**: T08
**Reuses**: `withTenant`, `requireRole`, `comEscrita`, padrão de `metas/logic.ts`
**Requirement**: ANAM-02, ANAM-10

**Done when**:

- [ ] Teste primeiro, e ele mede **dois** contadores antes e depois: `SELECT count(*) FROM goal WHERE patient_id = …` e `SELECT count(*) FROM session_snapshot WHERE patient_id = … AND session_numero = 0`. Ambos inalterados
- [ ] Linha gravada com `estado = 'rascunho'`; alvos gravados
- [ ] `import "server-only"` no topo; **nenhum** `"use server"` neste arquivo
- [ ] Terapeuta e coordenador conseguem salvar (`requireRole(ctx, "coordenador", "terapeuta")`)
- [ ] Nenhuma chamada a definer, a `criarMeta` ou a `desarquivarPacienteSeArquivado`

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-rascunho.int.test.ts` — conferir 1 arquivo coletado && `format`
**Commit**: `feat(anamnese): add draft persistence without timeline side effects`

---

### T10: `validarAnamnese` — e o teste de que ele FAZ o snapshot 0 existir (lado A de ANAM-09/10)

**What**: Implementar o core de validação: insere as `goal`, monta o jsonb, chama o definer.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`; `db/tests/anamnese-validar.int.test.ts`
**Depends on**: T09
**Reuses**: **shape** de `criarMetaCore` (`metas/logic.ts:36-78`) — sem chamar `criarMeta`
**Requirement**: ANAM-04, ANAM-09

**Done when**:

- [ ] Teste primeiro: os mesmos dois contadores de T09, agora **mudando** — `goal` +N e snapshot 0 passa de 0 para 1
- [ ] `repertorio_state` gravado exatamente no shape do `design.md`: `nivel_ajuda_recente` (ou `null`), `contagem: 0`, `is_candidata: false`, `origem: "anamnese"`, `procedencia: <enum>`
- [ ] `segmentacao` no shape `{ goal_id: { protocol_id: { tipo_estrutura, metrica, rotulo } } }` com `metrica: "nivel_ajuda"`
- [ ] `anamnese_alvo.goal_id` preenchido para cada alvo
- [ ] Tudo num único `withTenant`: `RAISE` do definer derruba as `goal` junto (teste de rollback explícito)
- [ ] Erro do Postgres lido de `err.cause`, não de `DrizzleQueryError.message` (que é o statement que nós emitimos)

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` — conferir contagem && `pnpm typecheck` && `format`
**Commit**: `feat(anamnese): create goals and snapshot 0 on validation`

---

### T11: Gate de modalidade `protocol_driven` por igualdade explícita

**What**: Barrar a anamnese para qualquer modalidade que não seja exatamente `protocol_driven`.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`
**Depends on**: T10
**Reuses**: `src/app/(app)/pacientes/[id]/modalidade.ts`
**Requirement**: ANAM-05

**Done when**:

- [ ] Teste primeiro, com os **três** valores do enum: `protocol_driven` passa; `cognitive_behavioral` e `conventional` recusam com `ANAMNESE_MODALIDADE_INCOMPATIVEL`
- [ ] Código usa `=== "protocol_driven"`. `grep` por `!== "conventional"` no caminho da anamnese devolve zero
- [ ] Comentário nomeia a razão medida: default NOT NULL `'protocol_driven'` (`schema.ts:408-410`) e `modalidade.ts:58-63` tratam desconhecido como protocolo — negar `conventional` deixaria modalidade nova passar

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` && `format`

---

### T12: Gate de protocolo ativo com taxonomia utilizável

**What**: Recusar validação sem `patient_protocol` ativo cujo `protocol.taxonomia_ajuda` tenha ao menos 2 níveis.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`
**Depends on**: T11
**Reuses**: guard equivalente já implementado no definer (T05) — a action é a camada de mensagem, o definer é a fronteira
**Requirement**: ANAM-06

**Done when**:

- [ ] Teste primeiro, três casos: sem protocolo ativo → recusa; protocolo com taxonomia de **1** nível → recusa (`Math.max(0, 1-1) = 0`, e `espectro.ts:203-204` exige `> 0`); taxonomia de 2+ → passa
- [ ] Nenhum snapshot 0 gravado nos dois casos de recusa (assertar contagem, não só o erro)
- [ ] Erro nomeado `ANAMNESE_SEM_PROTOCOLO_ATIVO` com copy pt-BR acionável

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` && `format`

---

### T13: Gate de consentimento revogado

**What**: Provar, pela action, que prontuário em somente-leitura impede a validação.
**Where**: `db/tests/anamnese-validar.int.test.ts` (caso novo); ajuste de mensagem em `logic.ts` se necessário
**Depends on**: T12
**Reuses**: `app_prontuario_somente_leitura` (guard já no definer, T05)
**Requirement**: ANAM-07

**Done when**:

- [ ] Teste primeiro: revogar consentimento → validar → erro `ANAMNESE_PRONTUARIO_SOMENTE_LEITURA`; snapshot 0 e `goal` com contagem inalterada
- [ ] Mensagem pt-BR ao usuário não vaza a string crua do Postgres

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` && `format`

---

### T14: Validação é exclusiva de coordenador

**What**: `requireRole(ctx, "coordenador")` na validação, com teste dos dois papéis.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`
**Depends on**: T13
**Reuses**: `requireRole` / `RoleError`
**Requirement**: ANAM-03

**Done when**:

- [ ] Teste primeiro, dois lados: coordenador valida (snapshot 0 passa a existir); terapeuta é recusado e **nada** é criado — `goal` e snapshot 0 com contagem inalterada
- [ ] Comentário registra que isto é decisão **nova** (D-B), não herança: `metas/logic.ts:41` deixa terapeuta criar meta

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` && `format`

---

### T15: Teto de 24 alvos na action

**What**: Segunda barreira do teto, além do Zod, medida contra as linhas realmente gravadas.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`
**Depends on**: T14
**Reuses**: `salvarRascunhoSchema.max(24)` (T08)
**Requirement**: ANAM-08

**Done when**:

- [ ] Teste primeiro: rascunho com 25 `anamnese_alvo` inseridos por outro caminho → validação recusa com `ANAMNESE_TETO_ALVOS`; 24 passa
- [ ] Comentário registra que o número é arbitrário e deliberado (4 por eixo × 6 eixos, D-C) e que `criarMeta` hoje não tem limite algum

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` && `format`

---

### T16: Desarquivamento com origem `"validacao_anamnese"`

**What**: Chamar `desarquivarPacienteSeArquivado` uma vez na validação, com a origem nova.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`
**Depends on**: T06, T15
**Reuses**: `desarquivarPacienteSeArquivado`
**Requirement**: ANAM-11

**Done when**:

- [ ] Teste primeiro: paciente arquivado + validação → `arquivado_em` vira `NULL` e o `audit_log` registra **exatamente 1** linha com origem `"validacao_anamnese"`
- [ ] `grep` prova que `"criacao_meta"` **não** aparece no `audit_log` deste fluxo (seria o motivo errado — o efeito colateral que D-C nomeia)
- [ ] Chamada **uma** vez por validação, não uma por meta

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` && `format`

---

### T17: Server Actions `salvarRascunhoAnamneseAction` e `validarAnamneseAction`

**What**: Criar o módulo `"use server"` com os dois wrappers que resolvem o tenant.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/actions.ts`
**Depends on**: T16
**Reuses**: `metas/actions.ts` como modelo literal de estrutura
**Requirement**: ANAM-03

**Done when**:

- [ ] ⚠️ **Nenhum export deste arquivo aceita `ctx`.** Core ctx-accepting exportado de módulo `"use server"` = endpoint client-invocável = `ctx` forjável = bypass de RLS (#55). Os cores ficam em `logic.ts`
- [ ] Guard repo-wide roda e passa: `pnpm test` inclui o teste que varre `"use server"` procurando exports que aceitam `ctx`
- [ ] `getTenantContext()` dentro de cada action; `catch (RoleError)` com copy pt-BR
- [ ] `revalidatePath` de `/pacientes/[id]` **e** `/pacientes/[id]/timeline` no sucesso da validação — navegação client-side não revalida layout sozinha (#285)

**Tests**: unit
**Gate**: `unit` && `format`
**Commit**: `feat(anamnese): add server actions for draft and validation`

---

### T18: Anamnese complementar e resolução da vigente

**What**: Suportar `complementaAnamneseId`, e resolver a vigente por `validada_em DESC, id DESC`.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts` + `queries.ts` da anamnese; `db/tests/anamnese-complementar.int.test.ts`
**Depends on**: T17
**Reuses**: índice parcial `idx_anamnese_vigente` (T01); merge aditivo do definer (T05)
**Requirement**: ANAM-20, ANAM-12

**Done when**:

- [ ] Teste primeiro: validar → complementar com eixo novo → a original continua **legível e inalterada**, e o `repertorio_state` do snapshot 0 ganhou a chave nova
- [ ] Teste do desempate: duas validadas com o **mesmo** `validada_em` → vence o maior `id`. `criado_em` nunca entra na ordenação (teste com `criado_em` invertido em relação a `validada_em`)
- [ ] Teste: revalidar a **mesma** anamnese → `ANAMNESE_JA_VALIDADA`, snapshot byte-idêntico
- [ ] Teste: complementar com eixo **já existente** → valor original vence, sem erro; a UI informa

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-complementar.int.test.ts` — conferir contagem && `format`
**Commit**: `feat(anamnese): support complementary anamnese with additive merge`

---

### T19: Sugestão de protocolo e nível de entrada

**What**: Preencher a sugestão no rascunho, mantê-la editável, e registrar que o valor aceito veio de sugestão.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/logic.ts`, `schemas.ts`, componente do formulário
**Depends on**: T18
**Reuses**: colunas `protocol_id`, `nivel_entrada_sugerido`, `sugestao_aceita` (T01)
**Requirement**: ANAM-21

**Done when**:

- [ ] Teste: sugestão sempre editável antes da validação (alterar o valor sugerido persiste o valor novo)
- [ ] Teste: aceitar a sugestão grava `sugestao_aceita = true`; escolher outro valor grava `false`
- [ ] Nenhuma sugestão é aplicada automaticamente na validação sem passar pelo rascunho

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-validar.int.test.ts` && `format`

---

### T20: Guarda — validar a anamnese NÃO muda `billing_apurar_ciclo`

**What**: Teste de integração explícito de que o paciente não passa a ser cobrado no ciclo corrente por causa da anamnese.
**Where**: `db/tests/anamnese-billing-invariante.int.test.ts`
**Depends on**: T17
**Reuses**: `billing_apurar_ciclo` (`0075:99-133`); fixtures de `src/lib/billing/`
**Requirement**: guarda de ANAM-09 (motivo do descarte do desenho alternativo em D-A)

**Done when**:

- [ ] Executar `billing_apurar_ciclo` para o ciclo corrente **antes** da validação e guardar o resultado (paciente ativo? valor?)
- [ ] Validar a anamnese, executar de novo, e assertar **igualdade do resultado**, não só "não deu erro"
- [ ] Caso complementar: paciente que **já** era ativo por sessão continua ativo (o teste tem que discriminar "não mudou" de "sempre foi zero")
- [ ] Assertar `SELECT count(*) FROM session WHERE patient_id = …` inalterado — nenhuma sessão fantasma na agenda
- [ ] Comentário registra que este teste **é** a razão de D-A: sem ele, um refactor futuro reintroduz o desenho de `session` com `numero_sequencial_paciente = 0` e a regressão é silenciosa e cobra o cliente

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-billing-invariante.int.test.ts` — 1 arquivo, 0 skipped
**Commit**: `test(anamnese): guard that validation does not affect billing cycle`

---

### T21: Guarda — snapshot 0 sobrevive à rematerialização

**What**: Provar a invariante medida em D-A.
**Where**: `db/tests/anamnese-rematerializacao.int.test.ts`
**Depends on**: T17
**Reuses**: `materializarSnapshot` (`src/lib/evidence/materializar.ts:493-498`)
**Requirement**: ANAM-13

**Done when**:

- [ ] Validar anamnese → registrar `repertorio_state` e `gerado_em` do snapshot 0 → rodar `materializarSnapshot` pelos **dois** callers reais (`revisao/[sessionId]/logic.ts:196-200` e `validacao/logic.ts:310-314`) → snapshot 0 **byte-idêntico**
- [ ] Caso com sessões 1 e 2 já materializadas: rematerializar não toca o 0 e toca os outros (o teste tem que provar que a rematerialização **rodou**, senão a igualdade é vácuo)
- [ ] Comentário registra que a proteção vem de `numerosAMaterializar` sair só de `evidence` — não é sorte, é invariante

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-rematerializacao.int.test.ts` — conferir contagem

---

### T22: Guarda — chave órfã no `repertorio_state` é ignorada

**What**: Meta gerada pela anamnese é excluída; o hexágono continua carregando sem erro.
**Where**: `db/tests/anamnese-rematerializacao.int.test.ts` (caso novo) ou arquivo próprio
**Depends on**: T17
**Reuses**: `computarDadosEspectro`; `goal_milestone_mapping` cascade (`schema.ts:1173`)
**Requirement**: ANAM-18

**Done when**:

- [ ] Validar → excluir uma `goal` → carregar a timeline → nenhum erro, o alvo some de `alvos`, e o eixo recalcula sem a chave órfã
- [ ] `anamnese_alvo.goal_id` vira `NULL` (FK `set null`), e a linha da anamnese continua legível
- [ ] Nenhum código novo — a task existe para provar que o comportamento já é o exigido (D-I)

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/anamnese-rematerializacao.int.test.ts`

---

### T23: Regressão — `db/tests/fase4-snapshot-rls.int.test.ts` [P]

**What**: Rodar e ajustar o teste existente de RLS do `session_snapshot` diante do produtor novo.
**Where**: `db/tests/fase4-snapshot-rls.int.test.ts`
**Depends on**: T17
**Reuses**: o próprio teste
**Requirement**: regressão de ANAM-04

**Done when**:

- [ ] Roda com a **contagem de testes igual ou maior** que antes da feature (registrar o número de antes e o de depois — teste sumido é regressão silenciosa)
- [ ] Se algum caso quebrar, corrigir a **causa**, não o teste; se o teste é que estava desatualizado, provar com `git log -S` no predicado antes de mudá-lo
- [ ] Acrescentar um caso: `session_numero = 0` respeita a mesma RLS de qualquer outro número

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/fase4-snapshot-rls.int.test.ts` — comparar contagem com a baseline

---

### T24: Regressão — `db/tests/fase4-materializar.int.test.ts` [P]

**What**: Rodar e ajustar o teste existente de materialização.
**Where**: `db/tests/fase4-materializar.int.test.ts`
**Depends on**: T17
**Reuses**: o próprio teste
**Requirement**: regressão de ANAM-13

**Done when**:

- [ ] Contagem de antes registrada e comparada com a de depois
- [ ] Nenhum caso passa a depender da ausência do snapshot 0
- [ ] Caso novo: paciente com marco 0 materializa a sessão 1 normalmente

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts db/tests/fase4-materializar.int.test.ts`

---

### T25: Regressão — `src/app/(app)/pacientes/[id]/timeline/queries.int.test.ts`

**What**: Ajustar o teste do delta ao novo limiar `sessionNumero > 0`.
**Where**: `src/app/(app)/pacientes/[id]/timeline/queries.int.test.ts`
**Depends on**: T30
**Reuses**: o próprio teste
**Requirement**: regressão de ANAM-17

**Done when**:

- [ ] Caso existente "Sessão 1 não tem anterior" continua verde **quando não há marco 0** (o comportamento antigo é preservado por `obterSnapshotAsOf` devolver `null`)
- [ ] Caso novo: com marco 0, o delta da Sessão 1 **deixa de ser `null`**
- [ ] Caso novo: `carregarDeltaSessao(patient, 0)` devolve `snapA = null` sem erro
- [ ] Contagem comparada com a baseline

**Tests**: integration
**Gate**: `npx vitest run --config vitest.integration.config.ts "src/app/(app)/pacientes/[id]/timeline/queries.int.test.ts"`

---

### T26: Regressão — `src/lib/evidence/espectro.test.ts` [P]

**What**: Cobrir as chaves novas do jsonb sem mudar o cálculo.
**Where**: `src/lib/evidence/espectro.test.ts`; tipagem em `src/lib/evidence/espectro.ts`
**Depends on**: T31
**Reuses**: `EstadoRepertorio`
**Requirement**: ANAM-18, regressão de ANAM-19

**Done when**:

- [ ] `EstadoRepertorio` ganha `origem?` e `procedencia?` (só tipagem)
- [ ] Teste: estado com `origem`/`procedencia` produz **exatamente** o mesmo resultado que sem elas (as chaves são descartadas pelo cálculo)
- [ ] Teste: `nivel_ajuda_recente: null` → eixo com `valor: null`, `alvos: 1`, `medidos: 0`. Nunca `0`
- [ ] Contagem comparada com a baseline

**Tests**: unit
**Gate**: `quick` (`npx vitest run src/lib/evidence/espectro.test.ts`) && `format`

---

### T27: Aplicar o helper de rótulo nas 13 ocorrências

**What**: Trocar todo `Sessão {n}` hardcoded por chamada de `rotulos.ts`.
**Where**: `scrubber.tsx:110,130,173,174`; `timeline-client.tsx:505,507,543,717,734,769,771,783,853`; `grafico-espectro.tsx:152,277,284,299,355`
**Depends on**: T07
**Reuses**: `rotuloPonto`, `rotuloPontoCurto`, `rotuloDesde`, `rotuloAte`
**Requirement**: ANAM-14

**Done when**:

- [ ] `grep -rn "Sessão {" ` e `grep -rn 'Sessão \${'` no diretório `timeline/` devolvem **zero** (fora de `rotulos.ts`)
- [ ] Nenhuma condicional de `n === 0` fora de `rotulos.ts`
- [ ] A tabela `sr-only` do gráfico acessível continua dentro do wrapper `<div className="sr-only">` — `sr-only` numa `<table>` não limita largura e volta a criar rolagem horizontal invisível
- [ ] Teste de componente: com `sessoesDisponiveis = [0]`, nenhuma string `"Sessão 0"` no DOM renderizado

**Tests**: unit
**Gate**: `unit` && `format`
**Commit**: `fix(timeline): label point zero as Anamnese via single helper`

---

### T28: `sessaoAtiva === 0` carrega o painel de delta

**What**: Corrigir o falsy-zero.
**Where**: `src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx:323`
**Depends on**: T27
**Reuses**: nada
**Requirement**: ANAM-15

**Done when**:

- [ ] Teste primeiro: com `sessaoAtiva = 0`, `carregarDeltaSessaoAction` **é** chamada (dublê espionado). Hoje não é
- [ ] `if (!sessaoAtiva) return;` → `if (sessaoAtiva === null) return;`, com o estado tipado `number | null`
- [ ] Teste do outro lado: com o estado `null`, a action **não** é chamada (dois comportamentos, dois testes)
- [ ] Falha de rede continua caindo em `setErroDelta(true)`, não em empty state — erro renderizado como empty state vira afirmação clínica falsa

**Tests**: unit
**Gate**: `unit` && `format`

---

### T29: Scrubber abre no marco 0 quando ele é o único ponto

**What**: Trocar o `?? 1` por `?? null` e tratar o estado vazio.
**Where**: `src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx:91-92`
**Depends on**: T28
**Reuses**: empty state existente da aba
**Requirement**: ANAM-16

**Done when**:

- [ ] Teste primeiro: `sessoesDisponiveis = [0]` → `sessaoAtiva === 0` e o scrubber renderiza "Anamnese"
- [ ] Teste do outro lado: `sessoesDisponiveis = []` → estado `null`, empty state, nenhuma chamada de delta
- [ ] Teste de não-regressão: `[1,2,3]` → abre em 3

**Tests**: unit
**Gate**: `unit` && `format`
**Commit**: `fix(timeline): open scrubber at milestone zero and load its delta`

---

### T30: Delta da Sessão 1 compara contra o marco 0 [P]

**What**: `sessionNumero > 1` → `sessionNumero > 0` em `carregarDeltaSessao`.
**Where**: `src/app/(app)/pacientes/[id]/timeline/queries.ts:313`
**Depends on**: T05
**Reuses**: `obterSnapshotAsOf` (já aceita qualquer número)
**Requirement**: ANAM-17

**Done when**:

- [ ] Comentário explica por que `> 0` e não `>= 0`: com `n = 0` o anterior seria `-1`, e o marco 0 não tem anterior
- [ ] Sem marco 0, o comportamento é idêntico ao de hoje (`obterSnapshotAsOf` devolve `null`)

**Tests**: integration (em T25)
**Gate**: `pnpm typecheck` && `format`

---

### T31: Eixo não coberto permanece `null` na tela

**What**: Garantir que nenhum ponto do caminho do marco 0 converte `null` em `0`, e que a tela diz "sem medida".
**Where**: `grafico-espectro.tsx`; `timeline-client.tsx`
**Depends on**: T27
**Reuses**: `espectro.ts:264` (já devolve `null`)
**Requirement**: ANAM-18

**Done when**:

- [ ] `grep` por `?? 0`, `|| 0` e `Number(` no caminho de render do espectro devolve zero ocorrências que toquem `valor` do eixo
- [ ] Teste de componente: eixo com `valor: null` renderiza texto de "sem medida", nunca `0` nem `0%`
- [ ] A cópia de "sem medida" usa `role="status"`, nunca `role="alert"` (D-J: `alert` é reservado a risco clínico)

**Tests**: unit
**Gate**: `unit` && `format`

---

### T32: Painel de procedência do nível de partida [P]

**What**: Componente que mostra quem afirmou o nível de partida de cada alvo do marco 0.
**Where**: `src/app/(app)/pacientes/[id]/timeline/procedencia-marco-zero.tsx` + `.stories.tsx` + teste
**Depends on**: T05
**Reuses**: `repertorio_state[goalId].procedencia` (já no snapshot carregado — **sem consulta nova**, é a razão de D-D)
**Requirement**: ANAM-19

**Done when**:

- [ ] Três valores renderizam copy pt-BR distinta: "Relatado pelo responsável", "Observado pelo avaliador", "Registro anterior"
- [ ] Alvo sem `origem: "anamnese"` não mostra o painel
- [ ] **Nenhum `fetch` novo**: teste prova que o componente só recebe props
- [ ] `role="status"`. Componente do design system reusado, nada hardcodado
- [ ] Estória no Storybook cobrindo os três valores e o caso ausente
- [ ] Contraste conferido na rampa escura (Menta/Terracota: cor do doc é fill, borda e texto na rampa escura). `axe` sob jsdom **não** checa contraste — verificar à mão

**Tests**: unit
**Gate**: `unit` && `pnpm storybook` (render manual) && `format`
**Commit**: `feat(timeline): show provenance of milestone-zero levels`

---

### T33: Formulário de anamnese (UI)

**What**: Tela de preenchimento e validação, com os alvos por eixo.
**Where**: `src/app/(app)/pacientes/[id]/anamnese/page.tsx` + `anamnese-form.tsx` + `.stories.tsx`
**Depends on**: T17, T19, T32
**Reuses**: componentes do design system; padrão de `useActionState` de `metas/`
**Requirement**: ANAM-01, ANAM-02, ANAM-08, ANAM-21

**Done when**:

- [ ] Botão "Validar" só aparece para coordenador; forja de POST continua barrada no servidor (T14)
- [ ] Contador de alvos visível; o 25º é bloqueado na UI com a mesma mensagem do Zod
- [ ] "Não avaliado" é uma opção **explícita** por eixo, distinta de "nível 0" (D-E). Nunca um campo vazio que o form converte em `0`
- [ ] Rota inacessível para paciente que não é `protocol_driven`
- [ ] Erros de validação com `role="status"`; nada com `role="alert"`
- [ ] Estórias no Storybook: vazio, preenchido, no teto, validada (somente leitura)
- [ ] Viewport de breakpoint declarado como **global** do Storybook — `parameters.defaultViewport` é ignorado em silêncio no Storybook 10

**Tests**: unit
**Gate**: `unit` && `pnpm storybook` && `format`
**Commit**: `feat(anamnese): add anamnese form and validation screen`

---

### T34: Definição de Pronto — verificação final

**What**: Fechar a DoD da issue medindo, não lendo.
**Where**: repositório inteiro
**Depends on**: T20..T33
**Reuses**: AGENTS §7
**Requirement**: todos

**Done when**:

- [ ] `pnpm typecheck` — 0 erros
- [ ] `pnpm lint` — 0 erros
- [ ] `pnpm test` — verde, contagem **registrada** e comparada com a baseline anterior à feature
- [ ] `pnpm test:rls` — verde, com a **contagem de arquivos executados** conferida (verde com muitos "skipped" é vermelho disfarçado; a suíte já rodou como superusuário e pulou 64 de 68 arquivos em silêncio)
- [ ] `npx vitest run src/db/migrations.test.ts` — journal e snapshot íntegros
- [ ] `npx vitest run --config vitest.integration.config.ts` — **contagem total de arquivos int** conferida, incluindo os 7 novos
- [ ] Medição em banco: `pg_proc` (2 funções, `prosecdef = t`), `pg_policies` (8 policies), `information_schema.role_column_grants` (4 UPDATEs de coluna, nenhum em `estado`)
- [ ] `npx prettier --check` nos arquivos tocados (CI não valida Prettier — AGENTS §5.2.7)
- [ ] Comentário de `schema.ts:1367-1370` atualizado para nomear `origem`/`procedencia` e a #407 (objeção 2 do `design.md`)
- [ ] Objeções 1 e 3 do `design.md` abertas como issues próprias; achado colateral de `app_proximo_numero_sequencial` medido em `pg_proc` antes de virar bug
- [ ] ⚠️ **Gate D-H fechado com o Rômulo** antes de qualquer dado real

**Tests**: integration
**Gate**: `full`
**Commit**: `chore(anamnese): close DoD for issue #407`

---

## Parallel Execution Map

```
Fase 0 (banco):
  T01 ──┬──→ T02 [P] ──┐
        └──────────────┴──→ T03 ──→ T04 ──→ T05

Fase 1 (lógica):
  T05 ──┬──→ T06 [P] ─┐
        ├──→ T07 [P] ─┤
        └──→ T08 ─────┴──→ T09 → T10 → T11 → T12 → T13 → T14 → T15 → T16 → T17 → T18 → T19
                              (T16 também depende de T06)

Fase 2 (invariantes/regressão):
  T17 ──┬──→ T20
        ├──→ T21 ──→ T22
        ├──→ T23 [P]
        └──→ T24 [P]
  T30 ──→ T25
  T31 ──→ T26 [P]

Fase 3 (UI):
  T07 ──→ T27 ──┬──→ T28 ──→ T29
                └──→ T31
  T05 ──→ T30 [P]
  T05 ──→ T32 [P]
  T17, T19, T32 ──→ T33
  tudo ──→ T34
```

**Restrição de paralelismo aplicada:** T11..T16 tocam o **mesmo arquivo** (`anamnese/logic.ts`) e o **mesmo arquivo de teste**, então são sequenciais mesmo sem dependência lógica entre si. T28 e T29 tocam `timeline-client.tsx` — sequenciais. Int-tests que compartilham fixtures de paciente não recebem `[P]` entre si: acrescentar `patient` a um `TRUNCATE` já causou deadlock e violação de FK em arquivos paralelos; limpeza extra sai por `DELETE` escopado.

---

## Task Granularity Check

| Task          | Escopo                                      | Status                                |
| ------------- | ------------------------------------------- | ------------------------------------- |
| T01           | 2 tabelas coesas numa migração              | ✅                                    |
| T02, T04      | 1 arquivo de teste cada                     | ✅                                    |
| T03, T05      | 1 bloco de migração cada                    | ✅                                    |
| T06, T07, T08 | 1 arquivo cada                              | ✅                                    |
| T09, T10      | 1 função + seu teste cada                   | ✅                                    |
| T11..T16      | 1 gate/comportamento cada                   | ✅                                    |
| T17           | 1 arquivo (2 wrappers coesos)               | ✅                                    |
| T18, T19      | 1 comportamento cada                        | ✅                                    |
| T20..T26      | 1 arquivo de teste cada                     | ✅                                    |
| T27           | 1 refactor mecânico, 3 arquivos, 1 conceito | ⚠️ OK — é a aplicação de um helper só |
| T28..T32      | 1 correção/componente cada                  | ✅                                    |
| T33           | 1 tela                                      | ✅                                    |
| T34           | verificação                                 | ✅                                    |

---

## Diagram-Definition Cross-Check

| Task     | Depends on (corpo)       | Diagrama mostra       | Status |
| -------- | ------------------------ | --------------------- | ------ |
| T01      | None                     | raiz                  | ✅     |
| T02      | T01                      | T01 → T02             | ✅     |
| T03      | T01, T02                 | T01/T02 → T03         | ✅     |
| T04      | T03                      | T03 → T04             | ✅     |
| T05      | T04                      | T04 → T05             | ✅     |
| T06      | T05                      | T05 → T06             | ✅     |
| T07      | T05                      | T05 → T07             | ✅     |
| T08      | T05                      | T05 → T08             | ✅     |
| T09      | T08                      | T08 → T09             | ✅     |
| T10      | T09                      | T09 → T10             | ✅     |
| T11..T15 | encadeadas T10→T11→…→T15 | idem                  | ✅     |
| T16      | T06, T15                 | T15 → T16 e T06 → T16 | ✅     |
| T17      | T16                      | T16 → T17             | ✅     |
| T18      | T17                      | T17 → T18             | ✅     |
| T19      | T18                      | T18 → T19             | ✅     |
| T20      | T17                      | T17 → T20             | ✅     |
| T21      | T17                      | T17 → T21             | ✅     |
| T22      | T17                      | T21 → T22             | ✅     |
| T23      | T17                      | T17 → T23             | ✅     |
| T24      | T17                      | T17 → T24             | ✅     |
| T25      | T30                      | T30 → T25             | ✅     |
| T26      | T31                      | T31 → T26             | ✅     |
| T27      | T07                      | T07 → T27             | ✅     |
| T28      | T27                      | T27 → T28             | ✅     |
| T29      | T28                      | T28 → T29             | ✅     |
| T30      | T05                      | T05 → T30             | ✅     |
| T31      | T27                      | T27 → T31             | ✅     |
| T32      | T05                      | T05 → T32             | ✅     |
| T33      | T17, T19, T32            | idem                  | ✅     |
| T34      | T20..T33                 | tudo → T34            | ✅     |

Nenhuma task marcada `[P]` depende de outra `[P]` da mesma fase.

---

## Test Co-location Validation

| Task          | Camada criada/modificada | Tipo exigido                                                                                                                  | Task diz    | Status |
| ------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| T01           | migração/schema          | integration (journal)                                                                                                         | integration | ✅     |
| T02           | teste RLS                | integration                                                                                                                   | integration | ✅     |
| T03           | policies/GRANT           | integration (RLS)                                                                                                             | integration | ✅     |
| T04           | teste de definer         | integration                                                                                                                   | integration | ✅     |
| T05           | função definer           | integration                                                                                                                   | integration | ✅     |
| T06           | lib de domínio           | unit                                                                                                                          | unit        | ✅     |
| T07           | helper puro              | unit                                                                                                                          | unit        | ✅     |
| T08           | schemas Zod              | unit                                                                                                                          | unit        | ✅     |
| T09, T10      | logic (escrita em banco) | integration                                                                                                                   | integration | ✅     |
| T11..T16      | logic (gates)            | integration                                                                                                                   | integration | ✅     |
| T17           | server action            | unit + guard repo-wide                                                                                                        | unit        | ✅     |
| T18, T19      | logic                    | integration                                                                                                                   | integration | ✅     |
| T20..T25      | testes de integração     | integration                                                                                                                   | integration | ✅     |
| T26           | lib + teste              | unit                                                                                                                          | unit        | ✅     |
| T27..T29, T31 | componentes cliente      | unit                                                                                                                          | unit        | ✅     |
| T30           | query de servidor        | integration (coberta em T25, no mesmo arquivo e na mesma fase — não é diferimento: T25 é a task que torna o teste executável) | integration | ✅     |
| T32, T33      | componentes + Storybook  | unit                                                                                                                          | unit        | ✅     |
| T34           | verificação              | integration                                                                                                                   | integration | ✅     |

Nenhuma `Tests: none`.

---

## Rastreabilidade ANAM-xx → Task

| ID      | Requisito                                                   | Tasks              |
| ------- | ----------------------------------------------------------- | ------------------ |
| ANAM-01 | tabela `anamnese` + RLS padrão `0113`, `patient_id` cascade | T01, T02, T03, T33 |
| ANAM-02 | enum de estado; rascunho não cria nada                      | T01, T03, T09, T33 |
| ANAM-03 | `validarAnamneseAction` exclusiva de coordenador            | T14, T17           |
| ANAM-04 | definer que grava o snapshot nº 0                           | T04, T05, T10      |
| ANAM-05 | gate `protocol_driven` por igualdade explícita              | T11                |
| ANAM-06 | gate de protocolo ativo com taxonomia utilizável            | T05, T12           |
| ANAM-07 | gate de consentimento                                       | T04, T05, T13      |
| ANAM-08 | teto de 24 alvos                                            | T08, T15, T33      |
| ANAM-09 | **mutação**: validar FAZ o snapshot 0 existir               | T10, T14, T20      |
| ANAM-10 | **mutação**: salvar rascunho NÃO faz                        | T09                |
| ANAM-11 | `OrigemDesarquivamento` += `"validacao_anamnese"`           | T06, T16           |
| ANAM-12 | append-only; 2ª validação recusada; sem `ON CONFLICT` cego  | T03, T04, T05, T18 |
| ANAM-13 | snapshot 0 sobrevive à rematerialização                     | T21, T24           |
| ANAM-14 | rótulo "Anamnese" nas 13 ocorrências                        | T07, T27           |
| ANAM-15 | `sessaoAtiva === 0` carrega o delta                         | T28                |
| ANAM-16 | scrubber abre no marco 0                                    | T29                |
| ANAM-17 | delta da Sessão 1 compara com o 0                           | T25, T30           |
| ANAM-18 | eixo não coberto fica `null`, nunca `0`                     | T22, T26, T31      |
| ANAM-19 | procedência visível, dentro do `repertorio_state`           | T01, T08, T26, T32 |
| ANAM-20 | anamnese complementar; vigente por `validada_em` + `id`     | T18                |
| ANAM-21 | sugestão de protocolo e nível, sempre editável              | T01, T19, T33      |

**Cobertura: 21 de 21 requisitos mapeados para pelo menos uma task.** Nenhum requisito sem task.

Guardas sem ID próprio, exigidos pelos Success Criteria da spec: T20 (invariância de `billing_apurar_ciclo`), T23/T24/T25/T26 (os 4 testes existentes que o marco 0 pode quebrar), T34 (contagem conferida em `pnpm test:rls` e nos int-tests).

---

## MCPs e Skills por task

Perguntar ao Rômulo antes da execução (passo 6 do template). Sugestão:

- T01, T03, T05: skill `postgresql-table-design` para revisão da DDL; nenhum MCP de escrita em banco remoto
- T20: nenhum — teste tem que rodar contra o Postgres local (`docker compose infra/docker-compose.yml`, porta 5433)
- T32, T33: skill do design system do repo; **nunca** hardcodar componente
- Todas: `pnpm` via `corepack pnpm`
