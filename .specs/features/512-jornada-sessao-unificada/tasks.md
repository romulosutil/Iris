# Jornada unificada da sessão — Tasks

**Design**: [`docs/ux/jornada-sessao-unificada.md`](../../../docs/ux/jornada-sessao-unificada.md) · **Spec**: [`spec.md`](./spec.md)
**Issue**: [#512](https://github.com/romulosutil/Iris/issues/512) · **Status**: Implementado (T01–T15) — commit `9d5d5095`, aguardando revisão do Rômulo / abertura de PR

---

## Convenções de Gate (valem para TODAS as tasks)

| Gate     | Comandos                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `quick`  | `pnpm typecheck` && `pnpm lint` && `npx vitest run <arquivo>`                                                                          |
| `unit`   | `pnpm typecheck` && `pnpm lint` && `pnpm test`                                                                                         |
| `int`    | `npx vitest run --config vitest.integration.config.ts <arquivo>` — **conferir a CONTAGEM de arquivos e testes coletados, nunca a cor** |
| `rls`    | `pnpm test:rls` — conferir a contagem de arquivos **executados**; verde com "skipped" é vermelho disfarçado                            |
| `e2e`    | `pnpm test:e2e` — gate que soma só `expected` acusa "cobertura caiu" onde há flake (memória `playwright-flaky-sai-de-expected`)        |
| `full`   | `pnpm typecheck` && `pnpm lint` && `pnpm test` && `pnpm test:rls`                                                                      |
| `format` | `npx prettier --write <arquivos tocados>` — **nunca** `pnpm format` (reformata o repo inteiro)                                         |

> ⚠️ **A armadilha que mais custa neste repo:** `*.int.test.ts` está no `exclude` do `vitest.config.ts`. `npx vitest run db/tests/x.int.test.ts` **coleta zero e sai verde**. Sem `--config vitest.integration.config.ts` a task está mentindo.

> 🚫 **Régua inegociável desta feature (R-08):** nenhum helper `ehClinicaSolo()` / `contarCoordenadores()` / predicado de colapso que leia mais de uma sessão. Aparecendo em revisão, é **rejeição, não sugestão**. O gate final roda `grep -rn "ehClinicaSolo\|clinicaSolo\|contarCoordenadores" src/` e exige zero.

> 🚫 **Zero migração (G2):** `git diff --stat db/migrations/` tem que sair vazio ao fim da feature. Task que precisar de DDL está fora do escopo — escalar como decisão, não implementar.

**TDD**: em toda task com `Tests`, o teste que **falha** vem antes da implementação.

**Régua de mutação por comportamento (`AGENTS.md` §5.2.5)**: comportamento com dois lados exige **dois** testes. "Remover o fix derruba 1 teste" não basta se o fix tem 2 comportamentos.

---

## Escolha de agente — critério

| Executor                    | Quando é o melhor custo/benefício                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Jules** (label `jules`)   | I/O fechável, sem RLS, sem decisão de produto aberta, contrato de teste escrito. Custo externo ao orçamento da sessão. Exige §5.2 fechado. |
| **Subagente Claude/Sonnet** | Task de 1-2 arquivos com oráculo objetivo (função pura, refactor mecânico, remoção com pontos de montagem listados).                       |
| **Subagente Claude/Opus**   | Task que decide predicado de escopo, toca fila/contagem, ou é revisão de diff contra Definição de Pronto.                                  |
| **Sessão Claude (esta)**    | Atomização, decisão de fronteira, revisão pós-PR. Nunca implementação mecânica.                                                            |
| **`accessibility-expert`**  | Tasks com requisito a11y explícito (R-26, R-27, R-30) — a11y aqui é compromisso de 1ª classe, não AA de legibilidade.                      |

> `axe` sob `jsdom` **não checa contraste** (memória `doc-ds-conflita-com-a11y-menta-terracota`) — task de a11y que só roda axe não provou contraste.

---

## Execution Plan

```
Fase 0 — Fundação (nada bloqueia)
  T01 ──┬──→ T02 ──→ T03 ──→ T04
        └──→ T05 ──→ T06
                     T07  (parte "reabrir" bloqueada por P2)

Fase 1 — Navegação          Fase 2 — Calendário         Fase 3 — Fechamento
  T02 ──→ T08 ──→ T09 ──→ T10       T12 ──→ T13              T14
  (T09, T13 bloqueadas por P1)      T11 [P]                  T15
```

`[P]` = paralelizável, sem dependência de estado compartilhado.

---

## Fase 0 — Fundação

### T01 · Máquina de estados derivada (`src/lib/sessao/estado.ts`)

- **Requisitos**: R-01, R-02, R-03, R-04, R-05, R-06
- **Agente**: **Subagente Claude/Sonnet** — função pura, oráculo totalmente objetivo (tabela do brief §3.1 é o contrato), zero I/O, zero RLS. Não vale Jules: é a fundação de que todas as outras tasks dependem, e o ciclo de ida-e-volta do executor externo custa mais que o ganho.
- **Where**: `src/lib/sessao/estado.ts` (novo) + `src/lib/sessao/estado.test.ts` (novo)
- **Depends on**: —
- **Reuses**: tipos de `src/db/schema.ts` (**só tipos**, R-06); enums `sessionEstado` (`schema.ts:77-83`), `sessionNoteTipo` (`:98-101`), `extractionEstado` (`:123-132`)
- **Done when**:
  1. Teste vermelho antes da implementação.
  2. `deriveEstadoSessao(input, agora)` devolve `{ estado, motivo?, gesto }`.
  3. `precisa_atencao` vence todos os outros (R-02) — inclusive `no_acervo`.
  4. `motivo` é união discriminada de 3 literais (R-03), nunca boolean.
  5. `agora: Date` é parâmetro obrigatório (R-04).
  6. `grep -n "from \"@/db\"\|drizzle\|new Date()" src/lib/sessao/estado.ts` → zero.
- **Tests**: 1 caso por linha da tabela §3.1 (7 estados) + precedência de `precisa_atencao` sobre cada um dos outros + os 3 motivos + fronteira exata de 24h (23h59 não, 24h01 sim).
- **Mutação**: remover a precedência de `precisa_atencao` derruba ≥1 teste; trocar `>` por `>=` na janela de 24h derruba o teste de fronteira.
- **Gate**: `quick` + `format`
- **Nota (P3)**: a implementação divergiu da leitura **literal** do §3.1 para manter `Revisada` alcançável — pela tabela como está escrita, ela é matematicamente inalcançável. Decisão documentada no código e na spec §4 P3; confirmar com o Rômulo.

### T02 · Predicado e contagem únicos da fila (`contarTravadas`)

- **Requisitos**: R-12, R-13, R-09, R-19
- **Agente**: **Subagente Claude/Opus** — decide o predicado de escopo por papel (R-09), que é exatamente onde o atalho `ehClinicaSolo()` nasceria. Toca `evidence_current` (view `security_barrier`) e a leitura do `AppLayout`, que já quebrou uma vez (#511/#516).
- **Where**: `src/lib/sessao/fila.ts` (novo), `src/app/(app)/layout.tsx`
- **Depends on**: T01
- **Reuses**: predicado exato de `src/app/(app)/validacao/queries.ts:17-19` (spec A5); `avaliarFriccao` (`src/lib/extraction/review-policy.ts:5-19`)
- **Done when**:
  1. Contagem e lista saem do **mesmo** módulo e do **mesmo** predicado (R-12) — não duas SQL parecidas.
  2. Escopo do coordenador é `terapeuta ≠ eu` ∪ `minhas travadas` (R-09), derivado de `session.terapeutaId`, nunca de contagem de membros.
  3. `layout.tsx` faz **uma** leitura de contagem, não três (R-13, spec A6).
  4. Plano de paginação **medido** com `EXPLAIN` através da view — `security_barrier` não deixa o `LIMIT` descer (spec A5). Registrar o plano medido no PR.
  5. Falha transitória de contagem não derruba o `AppLayout` (o `.catch` de `a0e7563` sobrevive).
- **Tests**: int-test com 2 clínicas e 2 terapeutas provando o escopo; teste que a contagem e a lista devolvem o **mesmo** número para o mesmo estado de banco.
- **Mutação**: divergir o predicado da contagem do da lista derruba o teste de igualdade (é literalmente o defeito da #511).
- **Gate**: `int` + `rls` + `format`

### T05 · `podeAutoValidar` — colapso da aprovação por sessão

- **Requisitos**: R-07, R-08, R-10, R-11
- **Agente**: **Subagente Claude/Opus** — é a decisão que o brief §7.5 diz custar caro se tomada uma vez no lugar errado. Revisão desta task é obrigatória por esta sessão.
- **Where**: `src/lib/sessao/aprovacao.ts` (novo) + teste
- **Depends on**: T01
- **Reuses**: `avaliarFriccao`; `TenantContext`
- **Done when**:
  1. `podeAutoValidar(ctx, session)` = `ctx.role === "coordenador" && ctx.userId === session.terapeutaId`. Nada mais.
  2. Assinatura recebe **uma** sessão. Não recebe lista, não recebe clínica, não recebe contagem (R-08).
  3. Fricção alta continua exigindo justificativa escrita e nunca vai a lote (R-10).
- **Tests**: E1 (coordenador que atende a própria sessão → colapsa) · E2 (coordenador que atende **algumas**: colapsa nas dele, **não** colapsa nas do terapeuta — é o caso que a régua de clínica erraria) · terapeuta puro → nunca colapsa · coordenador que não atende → nunca colapsa.
- **Mutação**: trocar o predicado por qualquer coisa derivada da clínica derruba o teste E2. **Esse teste é o guarda do R-08.**
- **Gate**: `unit` + `format`

---

## Fase 1 — Fila e tela da sessão

### T03 · Rota `/sessoes` — queries e escopo

- **Requisitos**: R-09, R-14, R-15, R-16, R-19, R-33
- **Agente**: **Subagente Claude/Opus** (escopo + paginação) — depois **Jules** para a listagem, se T02/T03 já tiverem fixado o contrato.
- **Depends on**: T02
- **Done when**: escopo dito por extenso (R-14); ordenação default por papel mas controle visível (R-15); filtro por terapeuta persistente (R-16); zero elegíveis é empty-state com as palavras "Nada travado" (R-33).
- **Gate**: `int` + `rls`

### T04 · Rota `/sessoes` — UI da fila

- **Requisitos**: R-14, R-17, R-18, R-31, R-32, R-33
- **Agente**: **Jules** (label `jules`) — I/O fechável assim que T03 fixa o contrato de dados; sem RLS, sem decisão aberta. §5.2 fecha com o contrato de T03 + os 7 estados de tela nomeados. **Revisão pós-PR obrigatória** por esta sessão (`AGENTS.md` §5.6).
- **Depends on**: T03
- **Done when**: custo declarado no item (R-17); estado nunca sozinho (R-18); os 7 estados de tela existem (R-31); falha de extração **não** vira vazio (R-32).
- **Gate**: `unit` + `format`

### T06 · `/sessoes/[id]` — timeline + passo em foco

- **Requisitos**: R-05, R-31, R-36, R-37, R-38
- **Agente**: **Subagente Claude/Sonnet** + revisão `accessibility-expert`. Absorve `/diario/[sessionId]` e `/revisao/[sessionId]` — refactor de montagem, não lógica nova.
- **Depends on**: T01, T05
- **Done when**: "Documentar" é **um** passo com dois momentos (§3.4); captura é `UPDATE` acumulando na linha `captura_rapida`, nunca `INSERT` (R-36, spec A7); "salvo localmente" é componente fixo, não toast (R-37); `Consolidar` desabilitado **explica o que falta** (R-38).
- **Gate**: `int` + `format`

### T07 · Aprovação em um gesto + reabertura

- **Requisitos**: R-07, R-10, R-11 · reabertura **bloqueada por P2**
- **Agente**: **Subagente Claude/Opus**
- **Depends on**: T05, T06
- **Bloqueio**: a parte "Reabrir revisão" **não sai** antes de P2 fechada (spec §4). O colapso da aprovação segue sem ela.
- **Gate**: `int` + `rls`

---

## Fase 2 — Navegação

### T08 · Menu lateral colapsável + papel ativo visível

- **Requisitos**: R-24, R-25, R-26, R-27
- **Agente**: **`accessibility-expert`** — R-26/R-27 são requisitos a11y de 1ª classe (alvo ≥44px, `aria-label`+tooltip, badge visível colapsado, barra inferior no mobile). a11y é compromisso de 1ª classe neste produto.
- **Depends on**: — (independente da fila; pode correr em paralelo com Fase 1)
- **Done when**: `localStorage` lido **dentro de `try/catch`** e a UI renderiza certo com valor ausente (R-25 — janela anônima estoura a leitura); papel ativo visível e trocável na faixa superior (R-24, resolve E6); badge continua visível colapsado (R-26).
- **Tests**: render com `localStorage` que **lança** na leitura → não quebra, cai no default expandido. Esse é o teste que a maioria esquece.
- **Gate**: `unit` + `format`

### T09 · Nav por papel — 4 itens diários, admin no rodapé

- **Requisitos**: R-21, R-22, R-23 · **P1 resolvida (#521, opção a) — desbloqueada**
- **Agente**: **Jules** — `requireAgendar` não muda; só a tela de criação em `/agenda` fica gateada por papel (R-23, ver spec §4 P1).
- **Depends on**: T02, T08
- **Gate**: `unit` + `e2e`

### T10 · Remover `GovernancaNav`

- **Requisitos**: R-20
- **Agente**: **Subagente Claude/Sonnet** — remoção mecânica com os 5 pontos de montagem já listados (spec A9). Oráculo objetivo: `grep` tem que zerar.
- **Depends on**: T09
- **Done when**: `grep -rn "governanca-nav\|GovernancaNav" src/` → zero fora de `.stories`/histórico; `src/design-system.ts` atualizado; nenhum dos 5 arquivos de página quebra.
- **Gate**: `unit` + `format`

### T11 · Bloco de estagnação no topo de `/pacientes` (C2) `[P]`

- **Requisitos**: — (C2 do brief; predicado de "estagnou" é **issue separada**, brief §7.3)
- **Agente**: **Sessão Claude** para especificar, depois **Jules**. Entra aqui só o ponto de montagem; o predicado não.
- **Depends on**: T10
- **Nota**: a primeira versão do brief mandava Supervisão para dentro de `/pacientes/[id]`, o que a transformaria em busca ativa ficha a ficha. **Essa versão foi descartada** — não reintroduzir.

---

## Fase 3 — Calendário

### T12 · Escala "Dia" no motor único; remover `agenda-calendar-grid`

- **Requisitos**: R-28, R-30
- **Agente**: **Subagente Claude/Sonnet** — um único ponto de montagem (`agenda-view-cliente.tsx`, spec A2), motor já existe (1.112 linhas, 7 arquivos).
- **Depends on**: —
- **Done when**: `src/components/ui/agenda-calendar-grid.tsx` deletado (307 linhas) e `.stories.tsx` junto; mobile na escala Dia é **lista cronológica**, não grade (R-30).
- **Gate**: `unit` + `e2e` + `format`

### T13 · `/agenda/semana` vira toggle `Dia | Semana`

- **Requisitos**: R-29 · **P1 resolvida (#521, opção a) — desbloqueada**
- **Agente**: **Jules**. Gesto de criar sessão em `/agenda` fica visível só para `coordenador` (spec §4 P1) — a semana entra sem reabrir a decisão da #517.
- **Depends on**: T12
- **Gate**: `e2e`

---

## Fase 4 — Fechamento

### T14 · Redirects permanentes das rotas antigas

- **Requisitos**: R-34, R-35
- **Agente**: **Subagente Claude/Sonnet** — lista de rotas fechada.
- **Depends on**: T04, T06, T13
- **Done when**: as 6 rotas antigas redirecionam; teste E2E que navega por URL continua passando; dica na primeira visita para quem procurava "Central de Validação" (R-35).
- **Gate**: `e2e`

### T15 · Revisão da feature contra a Definição de Pronto

- **Agente**: **Sessão Claude/Opus** — `AGENTS.md` §5.6: leitura de diff completa contra a DoD original, não conferência de status de check. CI verde não é evidência suficiente.
- **Done when**: os 4 gates da DoD (§6 da spec) medidos, incluindo `git diff --stat db/migrations/` vazio e o `grep` do R-08 zerado.

---

## Rastreabilidade

| Requisito   | Task     | Requisito   | Task     |
| ----------- | -------- | ----------- | -------- |
| R-01 … R-06 | T01      | R-20        | T10      |
| R-07, R-08  | T05      | R-21 … R-23 | T09      |
| R-09        | T02, T03 | R-24 … R-27 | T08      |
| R-10, R-11  | T05, T07 | R-28, R-30  | T12      |
| R-12, R-13  | T02      | R-29        | T13      |
| R-14 … R-16 | T03, T04 | R-31        | T04, T06 |
| R-17, R-18  | T04      | R-32, R-33  | T04      |
| R-19        | T02, T03 | R-34, R-35  | T14      |
| R-36 … R-38 | T06      |             |          |

## Estado das tasks

| Task | Estado                        | Executor                |
| ---- | ----------------------------- | ----------------------- |
| T01  | **Feito**                     | Subagente Claude/Sonnet |
| T02  | **Feito** — 3 itens p/ ratificar, ver PR | Subagente Claude/Opus   |
| T03  | **Feito**                     | Claude/Opus → Jules     |
| T04  | **Feito**                     | Jules                   |
| T05  | **Feito**                     | Subagente Claude/Opus   |
| T06  | **Feito** — a11y self-check feito, revisão dedicada de `accessibility-expert` ainda pendente | Claude/Sonnet + a11y    |
| T07  | **Feito** — reabertura CORTADA (P2, #522, opção a), não implementada | Subagente Claude/Opus   |
| T08  | **Feito**                     | `accessibility-expert`  |
| T09  | **Feito** — achou e fechou brecha real do P1 (recepção via `/agenda`) | Jules |
| T10  | **Feito**                     | Subagente Claude/Sonnet |
| T11  | Aberta                        | Claude → Jules          |
| T12  | **Feito**                     | Subagente Claude/Sonnet |
| T13  | **Feito** — achou e fechou 2 brechas P1 extras em `agenda-view-cliente.tsx` | Jules |
| T14  | **Feito** — sessão fechou gap de prefill "Repor" que o redirect quebrou | Subagente Claude/Sonnet |
| T15  | **Feito** — 4 gates da DoD medidos, 1 regressão real achada e fechada (prefill "Repor") | Sessão Claude/Opus |
