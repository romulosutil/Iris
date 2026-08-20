# #393 Escalas PHQ-9/GAD-7 — Tasks

**Design**: `.specs/features/393-escalas-phq9-gad7/design.md`
**Status**: Draft

---

## Execution Plan

### Phase 1: Fundação (Sequencial)

```
T1
```

### Phase 2: Schema (Paralelo — dependem só de T1)

```
     ┌→ T2 ─┐
T1 ──┤      ├──→ (Phase 3)
     └→ T3 ─┘
```

### Phase 3: Superfície (Paralelo — dependem de T2)

```
     ┌→ T4 ─┐
T2 ──┤      ├──→ T6
     └→ T5 ─┘
T3 ──────────┘
```

### Phase 4: Fechamento (Sequencial)

```
T4, T5, T6, T3 → T7
```

---

## Task Breakdown

### T1: Confirmar prompt R3 + enum severidade real (sem código)

**What**: Ler `TCC_SYSTEM_PROMPT`/`SYSTEM_PROMPT`/`CONVENTIONAL_SYSTEM_PROMPT` completos, confirmar se `aplicacao_escala_relatada` já tem instrução explícita de R3 (nunca somar escore, só registrar número literal). Se ausente, adicionar (mesma classe de gap que #392 teve com R9-TC..R13-TC). Ler `alertaRiscoSeveridade` enum real em `schema.ts` (já confirmado nesta sessão: `ideacao_passiva`, `ideacao_ativa_sem_plano`, `ideacao_ativa_com_plano`, `autolesao_recente`, `tentativa_relatada`, `violencia_sofrida`, `violencia_praticada`, `risco_a_terceiro`) — usar esses valores exatos em T5, não redescobrir.
**Where**: `src/lib/extraction/prompt.ts`, `src/lib/extraction/prompt.test.ts`
**Depends on**: None
**Reuses**: padrão R9-TC..R13-TC de #392 para citar qual regra cada instrução nova reforça
**Requirement**: RQ4

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Se gap real: prompt ganha instrução R3-equivalente para `aplicacao_escala_relatada`, testada em `prompt.test.ts`
- [ ] Se já cobre: teste novo só confirma (sem mudança de prompt)
- [ ] `pnpm typecheck` limpo

**Tests**: unit
**Gate**: quick (`pnpm test src/lib/extraction/prompt.test.ts`)

---

### T2: Migração `0113` — `instrumento_aplicacao` + RLS [P]

**What**: Tabela `instrumento_aplicacao` (colunas per design.md), RLS copiada literal de `0103:37-60` (4 policies, `app_clinic_id_exigido() + app_patient_in_clinic + coordenador OR app_is_on_team`). `CanonicalProtocolo.tipo_coleta` novo campo em `context-assembler.ts`.
**Where**: `db/migrations/0113_instrumento_aplicacao.sql`, `db/migrations/meta/_journal.json`, `src/db/schema.ts`, `src/lib/extraction/context-assembler.ts`
**Depends on**: T1
**Reuses**: `0103_*.sql` RLS pattern literal
**Requirement**: RQ1, escopo item 4 (`tipo_coleta`)

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] `pnpm db:generate` gera só o esperado (tabela via Drizzle; RLS manual, fora do snapshot)
- [ ] Migração aplicada, verificada via `information_schema.columns` + `pg_policies` + `pg_constraint`
- [ ] `GRANT` por coluna verificado com `has_column_privilege` (não `role_table_grants`)
- [ ] `app_role` sem `INSERT` direto se a escrita real for por definer — **decidir em T2**: se o form manual usa `comEscrita`+RLS direta (como `salvarRPD`, sem definer), então `app_role` TEM `INSERT`/`UPDATE` normais sob RLS (padrão `tcc_rpd_entry`, não padrão `alerta_risco_clinico`) — confirmar qual padrão faz sentido aqui (RPD é o análogo certo, não alerta) e documentar a escolha
- [ ] `protocolos_ativos[].tipo_coleta` presente para ABA (`"por_sessao"`) e disponível para instrumento (`"escala_padronizada_intervalar"`)
- [ ] `pnpm typecheck` limpo

**Tests**: integration (RLS — cobertura entra em T7, esta task verifica só apply/schema)
**Gate**: build (`pnpm db:migrate` local + `pnpm typecheck`)

---

### T3: Migração `0113` (mesmo arquivo) — `instrumento_item_texto` vazio [P]

**What**: Tabela `instrumento_item_texto` (colunas per design.md), sem seed com conteúdo PT-BR, `clinic_id` nullable, policy de leitura simples (SELECT para `app_role` autenticado, sem INSERT/UPDATE/DELETE via `app_role`).
**Where**: mesma migração `0113` de T2 (ou `0113b`/sequência se o `db:generate` de T2 já rodou e conflita — decidir na hora, manter na MESMA transação se possível: memória `enum-novo-e-check-numa-migracao` avisa que drizzle agrupa migração por arquivo, então múltiplos `ALTER`/`CREATE TABLE` no mesmo `.sql` são uma transação só, o que é desejável aqui)
**Depends on**: T1
**Reuses**: nenhum padrão existente igual (spec já registrou que não há precedente de "config vazia por padrão" no repo — este é o primeiro)
**Requirement**: RQ2, RQ7 (gate de fonte primária)

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Tabela criada, zero linhas após migração (nenhum seed)
- [ ] Policy de leitura verificada via `pg_policies`
- [ ] `pnpm typecheck` limpo
- [ ] `git diff` do PR grepado manualmente (não automatizado) por strings candidatas a item PHQ-9/GAD-7 antes do merge — nota no PR, não teste

**Tests**: none (tabela vazia, sem lógica própria ainda — comportamento entra em T4/T6)
**Gate**: build

---

### T4: `instrumento-form.tsx` + `salvarInstrumentoAplicacao` [P]

**What**: Server action `salvarInstrumentoAplicacao` (calcula `escoreTotal`/`item9Valor`/`itemRiscoPositivo` no servidor a partir de `respostasPorItem`, nunca confia em total do cliente), formulário manual que só renderiza itens com texto carregado em `instrumento_item_texto`.
**Where**: `src/app/(app)/pacientes/[id]/tcc/instrumento-logic.ts` (novo), `instrumento-form.tsx` (novo), testes correspondentes
**Depends on**: T2, T3
**Reuses**: `salvarRPD`/`comEscrita`/`requireRole` pattern (`tcc/logic.ts`)
**Requirement**: RQ3, RQ8 (parte form)

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Cliente nunca envia `escoreTotal`/`item9Valor` pré-calculados usados como fonte de verdade — servidor recalcula de `respostasPorItem`
- [ ] Form não renderiza item sem texto carregado (estado vazio explícito)
- [ ] `null` em `item_risco_positivo` distinto de `false`, testado (RQ7)
- [ ] Correção de escore (UPDATE) não apaga alerta pré-existente (RQ9, teste)
- [ ] `pnpm typecheck && pnpm lint` limpos

**Tests**: integration
**Gate**: full (`pnpm test .../instrumento-logic.int.test.ts --config vitest.integration.config.ts`)

---

### T5: Refinar severidade por valor do item 9 [P]

**What**: `registrarAlertaRiscoInstrumento` ganha parâmetro opcional `item9Valor`, mapeia para severidade real (`0`→não dispara, `1`→`ideacao_passiva`, `2|3`→`ideacao_ativa_sem_plano`, nunca `ideacao_ativa_com_plano` só pelo número, `null`→mantém comportamento atual). Chamadores existentes (Fase E de #391) continuam funcionando sem quebrar (fallback = comportamento atual quando `item9Valor` ausente).
**Where**: `src/lib/risco/registrar.ts`
**Depends on**: T2 (precisa da tabela existir para os testes de integração rodarem, embora a lógica em si seja TS puro)
**Reuses**: `app_criar_alerta_risco` (definer existente desde `0049`, aceita severidade explícita — sem mudança de assinatura SQL)
**Requirement**: RQ5

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Mapeamento testado para os 5 casos (0, 1, 2, 3, null) + fallback sem `item9Valor`
- [ ] Empate/dúvida entre item 9 e outro sinal resolve pelo mais grave — confirmar comportamento existente cobre isso ou precisa de ajuste
- [ ] `pnpm typecheck` limpo

**Tests**: unit + integration (o mapeamento em si é unit-testável; o caminho completo via `app_criar_alerta_risco` precisa integration)
**Gate**: full

---

### T6: UI — lista texto de aplicações [P via T4]

**What**: Lista (data + escore + faixa de corte) na aba TCC do paciente, sem gráfico (decisão de UX fechada).
**Where**: componente novo em `pacientes/[id]/tcc/`, montado em `page.tsx`
**Depends on**: T4 (precisa do shape final de `InstrumentoAplicacao` retornado pela query)
**Reuses**: padrões de lista/empty-state já usados em `rpd-sugestoes.tsx` (#392)
**Requirement**: RQ8

**Tools**: MCP: NONE. Skill: `frontend-design` opcional.

**Done when**:

- [ ] Lista renderiza data + escore + faixa de corte (cortes hardcoded, estrutura não é conteúdo licenciado)
- [ ] Zero aplicações: empty-state, não erro
- [ ] `pnpm typecheck && pnpm lint` limpos

**Tests**: unit (componente)
**Gate**: quick

---

### T7: Testes de integração/RLS finais + gate de conteúdo

**What**: Cobrir os itens do checklist de invariantes da spec não fechados inline: RLS cross-tenant de `instrumento_aplicacao`, os dois testes RQ6 (escore literal vs. ausência), grep manual de conteúdo PT-BR no diff completo.
**Where**: novos/existentes arquivos `.int.test.ts` relevantes
**Depends on**: T4, T5, T6, T3
**Reuses**: fixtures/helpers de #391/#392 onde aplicável

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Todos os itens do checklist "Invariantes" de `spec.md` verificados
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` verdes
- [ ] Grep manual do diff completo por strings candidatas a item PHQ-9/GAD-7 — documentado no relatório final, zero resultado
- [ ] Contagem de testes reportada

**Tests**: integration
**Gate**: full

**Commit**: `feat(tcc): escalas PHQ-9/GAD-7 - schema, escore relatado e gate de fonte primaria (#393)`

---

## Parallel Execution Map

```
Phase 1 (Sequencial): T1

Phase 2 (Paralelo, dependem de T1):
    ├── T2 [P]
    └── T3 [P]

Phase 3 (Paralelo, dependem de T2/T3):
    ├── T4 [P] (dep: T2, T3)
    ├── T5 [P] (dep: T2)
    └── T6 (dep: T4, roda logo após T4 fechar)

Phase 4 (Sequencial, fecha tudo):
  T4, T5, T6, T3 → T7
```

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows                          | Status   |
| ---- | ---------------------- | -------------------------------------- | -------- |
| T1   | None                   | —                                      | ✅ Match |
| T2   | T1                     | T1 → T2                                | ✅ Match |
| T3   | T1                     | T1 → T3                                | ✅ Match |
| T4   | T2, T3                 | T2 → T4, T3 → T4 (via Phase 3→T7 note) | ✅ Match |
| T5   | T2                     | T2 → T5                                | ✅ Match |
| T6   | T4                     | T4 → T6                                | ✅ Match |
| T7   | T4, T5, T6, T3         | T4, T5, T6, T3 → T7                    | ✅ Match |

---

## Test Co-location Validation

| Task                | Code Layer           | Requer teste                   | Task diz                                     | Status                            |
| ------------------- | -------------------- | ------------------------------ | -------------------------------------------- | --------------------------------- |
| T1: prompt          | prompt.ts            | unit                           | unit                                         | ✅ OK                             |
| T2: migração+schema | schema/RLS (banco)   | integration (adiado p/ T7)     | build (apply verificado) + integration em T7 | ✅ OK — mesmo racional de #392/T2 |
| T3: migração texto  | schema (banco)       | none (tabela vazia sem lógica) | none                                         | ✅ OK                             |
| T4: form+action     | server actions       | integration                    | integration                                  | ✅ OK                             |
| T5: severidade      | lib puro + definer   | unit+integration               | unit+integration                             | ✅ OK                             |
| T6: UI              | componente React     | unit                           | unit                                         | ✅ OK                             |
| T7: fechamento      | testes cross-cutting | integration                    | integration                                  | ✅ OK                             |

Nenhuma violação.

---

## MCPs e Skills por task

Nenhuma exige MCP externo. `frontend-design` opcional em T6 só se o layout exigir decisão visual não coberta pelos componentes já existentes.
