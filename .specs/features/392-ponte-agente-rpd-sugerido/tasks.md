# #392 Ponte agente → RPD sugerido — Tasks

**Design**: `.specs/features/392-ponte-agente-rpd-sugerido/design.md`
**Status**: Draft

---

## Execution Plan

### Phase 1: Fundação (Sequencial)

```
T1
```

### Phase 2: Core (Paralelo — ambos dependem só de T1)

```
     ┌→ T2 ─┐
T1 ──┤      ├──→ (Phase 3)
     └→ T3 ─┘
```

### Phase 3: Superfície (Paralelo — ambos dependem de T2)

```
     ┌→ T4 ─┐
T2 ──┤      ├──→ T6
     └→ T5 ─┘
T3 ──────────┘
```

### Phase 4: Fechamento (Sequencial)

```
T4, T5, T3 → T6
```

---

## Task Breakdown

### T1: Confirmar/ajustar instrução de `registro_pensamento` no `TCC_SYSTEM_PROMPT`

**What**: Ler `prompt.ts` completo; se `TCC_SYSTEM_PROMPT` já instrui o agente a emitir `tipo: "registro_pensamento"` quando aplicável, não mexer — só adicionar teste que prova isso em `prompt.test.ts`. Se NÃO instruir, é gap real: adicionar a instrução (reforçando R1/R2/R4-TCC/R11/R6 já citadas na spec).
**Where**: `src/lib/extraction/prompt.ts`, `src/lib/extraction/prompt.test.ts`
**Depends on**: None
**Reuses**: `CONVENTIONAL_SYSTEM_PROMPT` estrutura de regras existente (#388/#391)
**Requirement**: RQ1

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] `prompt.test.ts` cobre explicitamente que `TCC_SYSTEM_PROMPT` menciona `registro_pensamento`
- [ ] `pnpm typecheck` limpo
- [ ] `pnpm test src/lib/extraction/prompt.test.ts` verde

**Tests**: unit
**Gate**: quick (`pnpm test src/lib/extraction/prompt.test.ts`)

---

### T2: Migração `0112` + `registrarAlertaRiscoRPDSugerido` [P]

**What**: Migração `0112_rpd_sugerido_provenencia.sql` (colunas de proveniência em `tcc_rpd_entry`, CHECK relaxado em `alerta_risco_clinico`) + função `registrarAlertaRiscoRPDSugerido` em `registrar.ts` + wrapper/parâmetro em `app_criar_alerta_risco` para aceitar `origem_extraction_id` na origem `registro_pensamento`.
**Where**: `db/migrations/0112_rpd_sugerido_provenencia.sql`, `db/migrations/meta/_journal.json`, `src/db/schema.ts`, `src/lib/risco/registrar.ts`
**Depends on**: T1 (não bloqueia tecnicamente, mas roda depois pra manter uma frente por vez no prompt antes de mexer em schema — pode soltar o `[P]` se preferir paralelizar com T1 também; mantido sequencial-leve por segurança de schema)
**Reuses**: `registrarAlertaRiscoInstrumento` (mesma forma), CHECK de `0111` como base (DROP+ADD, não editar in-place — memória `editar-migracao-aplicada-nao-roda`)
**Requirement**: RQ2 (parte schema), design §Migração 0112

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] `pnpm db:generate` não gera diff extra além do esperado (colunas de `tcc_rpd_entry` via Drizzle; CHECK via SQL manual, fora do `db:generate`)
- [ ] Migração aplicada localmente, verificada via `information_schema.columns` (`tcc_rpd_entry.origem_extraction_id`, `origem_agente`) e `pg_constraint` (novo texto do CHECK `alerta_risco_vinculo`)
- [ ] `registrarAlertaRiscoRPDSugerido` nunca lança (try/catch interno, retorno tipado igual `registrarAlertaRiscoInstrumento`)
- [ ] FK composta anti-IDOR de `alerta_risco_clinico` inalterada (conferir `pg_constraint` antes/depois)
- [ ] `app_role` continua sem `INSERT` direto em `alerta_risco_clinico` (só `GRANT EXECUTE` na função, igual `0111`)
- [ ] `pnpm typecheck` limpo

**Tests**: integration (RLS/definer — cobertura entra em T6, esta task só precisa compilar e a migração aplicar limpo)
**Gate**: build (`pnpm db:migrate` local + `pnpm typecheck`)

---

### T3: Fase de risco em `diario/[sessionId]/logic.ts` [P]

**What**: Nova fase pós-persistência (após Fase E) — para cada draft `subtipo === "registro_pensamento"`, roda `detectarSinaisDeRiscoRPD` (ou adaptador fino, sem duplicar termos) sobre o `payload` e chama `registrarAlertaRiscoRPDSugerido` (de T2) se houver sinal.
**Where**: `src/app/(app)/diario/[sessionId]/logic.ts`
**Depends on**: T1
**Reuses**: `detectarSinaisDeRiscoRPD` de `pacientes/[id]/tcc/deteccao-risco.ts`; padrão try/catch isolado por item já usado na Fase E (#391, instrumento formal)
**Requirement**: RQ2 (parte fase de risco)

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Sugestão sem sinal de risco: nenhuma linha nova em `alerta_risco_clinico`
- [ ] Sugestão com ideação/autolesão: linha criada com `origem='registro_pensamento'`, `origem_extraction_id` preenchido, `rpd_entry_id` NULL
- [ ] Falha na detecção/registro não derruba a persistência da extração (try/catch por item)
- [ ] Teste de integração em `actions.int.test.ts` cobrindo os dois casos acima
- [ ] `pnpm typecheck && pnpm lint` limpos

**Tests**: integration
**Gate**: full (`pnpm test src/app/\(app\)/diario/\[sessionId\]/actions.int.test.ts --config vitest.integration.config.ts`)

**⚠️ Nota de merge**: T3 depende do CHECK relaxado de T2 (senão o INSERT do alerta sem `rpd_entry_id` viola constraint) — embora marcada `[P]` na Phase 2 (paraleliza a ESCRITA de código com T2), a suíte de integração de T3 só passa DEPOIS que a migração de T2 estiver aplicada no banco local. Rodar T2 e T3 em paralelo na implementação, mas serializar a aplicação da migração antes de rodar os testes de T3.

---

### T4: `sugestoes.ts` (queries + actions) [P]

**What**: `obterRPDSugestoes`, `aprovarRPDSugestao`, `descartarRPDSugestao` — novo arquivo, padrão `comEscrita` + `requireRole` + advisory lock (aprovação) igual `validacao/logic.ts`.
**Where**: `src/app/(app)/pacientes/[id]/tcc/sugestoes.ts` (novo), `src/app/(app)/pacientes/[id]/tcc/sugestoes.int.test.ts` (novo)
**Depends on**: T2
**Reuses**: `salvarRPD`/`salvarRpdSchema` (`tcc/logic.ts`), padrão de lock/transação de `validacao/logic.ts`
**Requirement**: RQ3, RQ4, RQ5

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] `obterRPDSugestoes` retorna só `subtipo='registro_pensamento' AND estado='sugerida'` do paciente, isolado por clínica (herda `extraction_select`, confirmado por teste RLS cross-tenant)
- [ ] `aprovarRPDSugestao` grava `tcc_rpd_entry` com `origem_extraction_id` + `origem_agente=true`, transiciona `extraction.estado→'aprovada'` na mesma transação, roda detecção de risco normal sobre os campos finais (pode gerar 2º alerta distinto, sem dedupe)
- [ ] Aprovação concorrente da mesma sugestão: segunda tentativa recebe erro de concorrência, sem duplicar linha
- [ ] `descartarRPDSugestao` transiciona `extraction.estado→'descartada'`, não apaga a extração nem alerta pré-existente
- [ ] `pnpm typecheck && pnpm lint` limpos

**Tests**: integration
**Gate**: full (`pnpm test src/app/\(app\)/pacientes/\[id\]/tcc/sugestoes.int.test.ts --config vitest.integration.config.ts`)

---

### T5: UI — fila de sugestões na aba TCC [P]

**What**: Componente `rpd-sugestoes.tsx` (lista + ação aprovar/descartar) montado em `page.tsx`; "Aprovar" abre `rpd-form.tsx` pré-preenchido com `valoresIniciais` do payload da extração.
**Where**: `src/app/(app)/pacientes/[id]/tcc/rpd-sugestoes.tsx` (novo), `rpd-sugestoes.test.tsx` (novo), `page.tsx` (modificado), possivelmente `rpd-form.tsx` (aceitar prop `valoresIniciais` opcional)
**Depends on**: T2 (precisa do shape final de `RPDSugestao`/colunas de proveniência para tipar props corretamente — pode começar com mock e integrar depois se preferir paralelizar mais agressivamente)
**Reuses**: `rpd-form.tsx` existente (extensão de prop, não reescrita)

**Tools**: MCP: NONE. Skill: `frontend-design` (se precisar de ajuste visual não trivial) — opcional.

**Done when**:

- [ ] Lista renderiza sugestões pendentes com trecho/preview
- [ ] "Aprovar" abre form pré-preenchido, campos obrigatórios ausentes ficam em branco (não inventa valor)
- [ ] "Descartar" é ação de um clique, sem modal bloqueante
- [ ] Testes de componente (`rpd-sugestoes.test.tsx`) cobrindo os 3 pontos acima
- [ ] `pnpm typecheck && pnpm lint` limpos

**Tests**: unit (componente)
**Gate**: quick (`pnpm test src/app/\(app\)/pacientes/\[id\]/tcc/rpd-sugestoes.test.tsx`)

---

### T6: Testes de integração/RLS finais + invariantes da spec

**What**: Cobrir os itens do checklist de invariantes da spec que não foram fechados inline em T3/T4: RLS cross-tenant para o novo caminho de ancoragem (`origem_extraction_id` em `alerta_risco_clinico`), "sugestão não aparece como registro oficial em nenhuma consulta", "aprovar não recria/migra alerta".
**Where**: `db/tests/alerta-risco-rls.int.test.ts` (extensão), `src/app/(app)/pacientes/[id]/tcc/sugestoes.int.test.ts` (extensão se necessário)
**Depends on**: T4, T5, T3
**Reuses**: fixtures/helpers já adicionados em #391 (`criarComOrigem`)

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Todos os itens do checklist "Invariantes" de `spec.md` marcados/verificados
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` verdes, sem nenhuma string "SLA" nova
- [ ] Contagem de testes reportada (sem deleção silenciosa)

**Tests**: integration
**Gate**: full (`pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls`)

**Commit**: `feat(tcc): extracao gera RPD sugerido com fila de validacao na aba TCC (#392)`

---

## Parallel Execution Map

```
Phase 1 (Sequencial):
  T1

Phase 2 (Paralelo, dependem de T1):
    ├── T2 [P]
    └── T3 [P]  (testes de integração de T3 só rodam após migração de T2 aplicada)

Phase 3 (Paralelo, dependem de T2):
    ├── T4 [P]
    └── T5 [P]

Phase 4 (Sequencial, fecha tudo):
  T3, T4, T5 → T6
```

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows   | Status   |
| ---- | ---------------------- | --------------- | -------- |
| T1   | None                   | —               | ✅ Match |
| T2   | T1                     | T1 → T2         | ✅ Match |
| T3   | T1                     | T1 → T3         | ✅ Match |
| T4   | T2                     | T2 → T4         | ✅ Match |
| T5   | T2                     | T2 → T5         | ✅ Match |
| T6   | T4, T5, T3             | T3, T4, T5 → T6 | ✅ Match |

---

## Test Co-location Validation

| Task                        | Code Layer Created/Modified | Requer teste                                                | Task diz                                     | Status                                                                                          |
| --------------------------- | --------------------------- | ----------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| T1: prompt                  | prompt.ts (agente)          | unit                                                        | unit                                         | ✅ OK                                                                                           |
| T2: migração + registrar.ts | schema/definer (banco)      | integration (adiado p/ T6, mas build/apply verificado aqui) | build (apply verificado) + integration em T6 | ✅ OK — schema não é testável isoladamente sem os caminhos de escrita de T3/T4, que os consomem |
| T3: fase de risco           | logic.ts (server action)    | integration                                                 | integration                                  | ✅ OK                                                                                           |
| T4: sugestoes.ts            | server actions              | integration                                                 | integration                                  | ✅ OK                                                                                           |
| T5: UI                      | componente React            | unit                                                        | unit                                         | ✅ OK                                                                                           |
| T6: fechamento              | testes cross-cutting        | integration                                                 | integration                                  | ✅ OK                                                                                           |

Nenhuma violação — T2 não é "testado em outra task" por deferral preguiçoso: schema puro não tem comportamento próprio pra testar até que T3/T4 escrevam através dele, e T6 fecha a cobertura de invariantes que dependem de todas as peças montadas (RLS cross-tenant do caminho novo).

---

## MCPs e Skills por task

Nenhuma task exige MCP externo (tudo é código/DB local via ferramentas padrão do harness). `frontend-design` é opcional em T5 só se o layout exigir decisão visual não coberta pelos componentes já existentes na aba TCC.
