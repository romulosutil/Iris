# Auditoria 360º — plano de resolução (02/09/2026)

> Checkpoint operacional da sessão que resolve `auditoria-360-relatorio-2026-09-01.md`
> e `auditoria-360-revisao-admissao-2026-09-02.md`. Trabalho em worktree isolado
> (`.claude/worktrees/auditoria-360`, base `main@95539d89`) porque a branch
> `feat/prontidao-do-prontuario` está sendo codada em paralelo por outra sessão.
> Cada linha abaixo vira **uma issue + uma PR Draft** (atomização por fronteira de
> revisão — `AGENTS.md` §5.2, memória `sempre-atomizar-tasks`).

## Decisões tomadas nesta sessão (propostas pendentes de validação com o Rômulo)

| Id      | Decisão                                                                                                                                                                                                                    | Achado  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D-AUD-1 | `/validacao` volta a ser rota da fila por evidência (opção **b** do relatório), com item de nav admin do coordenador. Remontar dentro de `/sessoes/[id]` (opção a) fica para depois da decisão de multi-coordenador (D76). | `PR-01` |
| D-AUD-2 | Clarity e GA saem do root layout e ficam **só** nas rotas públicas (landing/institucional/sobre). Nomear operadores em `docs/legal/` exige confirmação — fica pendente.                                                    | `S-01`  |
| D-AUD-3 | Sessão Better-Auth: `expiresIn` 12h, `updateAge` 1h.                                                                                                                                                                       | `S-07`  |
| D-AUD-4 | Expurgo de `audit_log` passa a apagar **só** ações de acesso (allowlist explícita); trilha clínica é preservada.                                                                                                           | `S-05`  |
| D-AUD-5 | `PRODUCT.md` passa a descrever a regra real de lote (só confiança alta e consistente, com trilha própria).                                                                                                                 | `PR-03` |
| D-AUD-6 | `WebMCPProvider` sai do app autenticado e da raiz; se ficar, só na landing e só com `get_iris_overview`.                                                                                                                   | `S-08`  |
| D-AUD-7 | "Profissional responsável pela sessão" = titular **ou** substituto (`atendido_por_id`), numa função única consumida por RLS, `ehDono` e fila.                                                                              | `PR-05` |
| D-AUD-8 | DLQ da revisão grava em coluna própria `erro_validacao_detalhe`; reaprovar a partir de `erro_validacao` usa o `payload` original.                                                                                          | `Q-01`  |
| D-AUD-9 | Memo R-1..R-8 é aplicado **na spec e nos planos** (branch `feat/prontidao-do-prontuario`), não em código — o código dessa feature é da outra sessão.                                                                       | memo    |

## Workstreams (cada um = issue + PR)

| #   | Branch                                                              | Achados                                                                                     | Toca DB/RLS?                           |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| W1  | `fix/aud-definer-guard-oraculo`                                     | `S-02`, `Q-05`                                                                              | sim (migração à mão + teste)           |
| W2  | `fix/aud-superficie-http-terceiros`                                 | `S-01`, `S-06`, `S-07`, `S-08`, `A-05`, `Q-07`                                              | não                                    |
| W3  | `fix/aud-log-sem-pii-copy-erro`                                     | `S-03`, `S-10`, `U-01`                                                                      | não                                    |
| W4  | `fix/aud-q01-dlq-revisao`                                           | `Q-01`, `Q-02`, `Q-03`                                                                      | sim (coluna via `db:generate` + GRANT) |
| W5  | `fix/aud-fila-coordenador-alcance`                                  | `PR-01`, `PR-02`, `Q-04`                                                                    | não                                    |
| W6  | `fix/aud-scripts-guardrail`                                         | `S-04`, `Q-08`                                                                              | não                                    |
| W7  | `feat/aud-rastreio-ia-metricas`                                     | `DA-02`, `DA-01`, `A-03`                                                                    | sim (colunas + view)                   |
| W8  | `fix/aud-expurgo-audit-log-heartbeat`                               | `S-05`, `DA-03`                                                                             | sim (função + tabela heartbeat)        |
| W9  | `docs/aud-documentacao-dx`                                          | docs da auditoria, `PR-03`, `PR-06`, `PR-07`, `PR-08`, `DX-01..04`, `A-04`, `Q-06`, `S-09`  | não                                    |
| W10 | `fix/aud-ds-timeline-a11y`                                          | `U-02`, `U-03`, `U-04`, `AC-01..03`, `DS-02..05`, `A-01`, `A-06`, `PF-01`, `PF-02`, `DS-01` | não                                    |
| W11 | `fix/aud-pr05-profissional-responsavel`                             | `PR-05`                                                                                     | sim (função + policies)                |
| W12 | `docs/aud-memo-spec-admissao` → alvo `feat/prontidao-do-prontuario` | R-1..R-8                                                                                    | não                                    |

Fora de escopo desta rodada (registrado, não feito): `PR-04` (cadeia por etapa — spec própria via `/tlc-spec-driven`), `A-02` (estrutural, L), `DA-04` (logger estruturado, M — `S-03` entrega o helper que vira a semente).

## Resultado (03/09/2026)

| W   | PR   | Estado                                                     | Migrações (numeração provisória a partir de `main`) |
| --- | ---- | ---------------------------------------------------------- | --------------------------------------------------- |
| W1  | #544 | Ready, CI verde, revisada e corrigida                      | `0142` guard (à mão)                                |
| W2  | #545 | Ready, CI verde, revisada e corrigida                      | —                                                   |
| W3  | #546 | Ready, CI verde, revisada e corrigida                      | —                                                   |
| W4  | #550 | Ready, CI verde, revisada e corrigida                      | `0142` coluna (`db:generate`)                       |
| W5  | #548 | Ready, CI verde, revisada e corrigida                      | —                                                   |
| W6  | #547 | Ready, CI verde, revisada e corrigida                      | —                                                   |
| W7  | #555 | Ready (empilhada em #550), revisada e corrigida            | `0143` colunas + `0144` view                        |
| W8  | #551 | Ready, revisada e corrigida (CI rerodando após `1882a3bb`) | `0142` expurgo + `0143` `job_heartbeat`             |
| W9  | #543 | Ready, CI verde, revisada e corrigida                      | —                                                   |
| W10 | #556 | Draft, revisada e corrigida (CI rerodando após `3c0a6793`) | —                                                   |
| W11 | #549 | Ready, CI verde, revisada e corrigida                      | `0142` função + policies                            |
| W12 | #541 | Ready (empilhada em `feat/prontidao-do-prontuario`)        | —                                                   |

Issues abertas de sequela: #542 (flake e2e), #552 (guard de `app_session_sob_sigilo`), #553 (backfill/forma canônica do payload), #554 (régua nova nos alertas de risco).

Achados **novos** que as PRs expuseram (além do relatório): aprovação real gerava zero `evidence` desde a D57 (payload flat × leitor aninhado — #548/#550/#553); grade de marcos da timeline lia chave errada do snapshot e mostrava tudo "não atingido" (#556); nenhuma ação de acesso é gravada em `audit_log`, então o expurgo é no-op (#551); `EXPORT_JOB_TOKEN` precisa existir no Easypanel antes do merge de #545.

## Estado

- [x] Issues criadas: W1 #529 · W2 #530 · W3 #531 · W4 #532 · W5 #533 · W6 #534 · W7 #535 · W8 #536 · W9 #537 · W10 #538 · W11 #539 · W12 #540
- [x] Onda 1 despachada (W1, W2, W3, W5, W9, W12). Fechados: W12 → PR #541; W9 → PR #543 (+ issue #542 flake Q-06); W1 → PR #544 (migração `0142` — vai colidir em número com W4/W8/W11; renumerar ao mergear); W2 → PR #545 (grupo `(publico)`; operacional: `EXPORT_JOB_TOKEN` no Easypanel antes do merge)
- [x] W3 → PR #546 (85 sites de log; tocou DLQ de `revisao` — conflito previsto com W4)
- [x] W5 → PR #548. **Achado novo (P0 na prática)**: desde a D57 o provider grava `alvos` na raiz do payload e `inserirEvidenciasOnApprove` só lia `payload.evidencia.alvos` → aprovar extração real gerava zero `evidence`. Fix aceita as duas formas; pendente: backfill em produção + forma canônica do jsonb (decisão do Rômulo)
- [x] W6 → PR #547 (`check-patient.ts` untracked deve ser apagado na árvore principal)
- [x] Onda 3 despachada: W11 e W10. Falta despachar só W7 (empilha sobre W4 quando a branch dele estiver no ar)
- [x] Revisão pós-PR de #543/#544/#545 feita; #543 corrigida (segredos `cus_…` recolocados no relatório — zerados). #544 corrigida (`bef31d1f`; issue #552 para guard de `app_session_sob_sigilo`). Pendente aplicar em #545 (HSTS sem `includeSubDomains`, `identify` do Clarity removido, script de exportação lê corpo antes do status). Issue #553: backfill/forma canônica do payload
- [x] W11 → PR #549 (`0142_profissional_responsavel_da_sessao.sql`, INVOKER; `alerta_risco_scope` unificar após W1)
- [x] W4 → PR #550 (`0142` gerada: `erro_validacao_detalhe`); W8 → PR #551 (`0142` expurgo + `0143` `job_heartbeat`; role `iris_expurgo_audit_log` + `EXPURGO_DATABASE_URL` a provisionar)
- Conflito previsto: #548 (W5) e #550 (W4) corrigem o payload flat/aninhado em `inserirEvidenciasOnApprove` de formas diferentes; ao mergear manter `conteudoDoSubtipo()` do W4 e o teste do W5. `backfill-evidence.ts` tem a mesma deriva → issue própria
- Revisões 2 e 3 aplicadas: #546 (`37c228c4`), #547 (`21a5a595`), #548 (`29f7b3eb`); #549 (`a5d7df3d`, issue #554 follow-up dos alertas), #550 (`e9149c77`), #551 (`60e3d49c`; no merge com #544 acrescentar `app_job_heartbeat_gravar` em `DEFINERS_GLOBAIS_JUSTIFICADOS` — texto na PR)
- **Ordem de merge das PRs com migração**: #544 (W1) → #549 (W11) → #550 (W4) → #551 (W8) → #535/W7 (empilhada em W4). A cada merge o seguinte rebaseia, renumera `NNNN`, recalcula `when` = anterior + 1000 e, se tocou `schema.ts`, regenera o snapshot (`db:generate`) — os snapshots `0142`/`0143` de #550/#551 apontam ambos `prevId` para `0139`
- CI (self-hosted) roda nas Drafts; todas MERGEABLE contra `main` em 03/09. `base-must-be-main` reprova as empilhadas (#541 sobre `feat/prontidao-do-prontuario`; W7 sobre W4) por desenho — retarget para `main` após a base mergear
- [x] W7 → PR #555 (base `fix/aud-q01-dlq-revisao`; `0143` colunas + `0144` view). W10 → PR #556 (achado novo: `timeline-client` lia `repertorioState[milestone_id].nivelAjudaRecente`; o snapshot é `{goal_id: {nivel_ajuda_recente}}` → grade de marcos sempre "não atingido"; régua adotada "marco herda o melhor estado das metas mapeadas" — validar). **12/12 workstreams com PR.**
- CI em 03/09 (heads atuais): verde em #543–#550; #551 `test` vermelho (`escalonamento-risco.test.mjs` heartbeat, só no CI) e #556 `test-rls` (5 int-tests de supervisão/anamnese) + CodeQL (`js/incomplete-sanitization` no lint DS) — ambos devolvidos aos agentes; #555 revisão devolvida ao W7 (DLQ fora da view, semana em TZ da clínica)
- 03/09 ~14h30Z: Rômulo marcou #541, #543–#551 e #555 como Ready (só #556 segue Draft). `main` ainda em `95539d89`; nenhuma mergeada. #555 corrigida (`eea12376`: DLQ na view, semana no fuso da clínica via `clinic.timezone`)
- 03/09: limite de sessão derrubou 8 agentes às ~00h; retomados em ondas de 4 (A: W4, W8, W11, W9-fix; B: W10; C: W2-fix, W1-fix, revisor de #546/#547/#548, W7)
- [x] Onda 2 despachada (W4, W6, W8); W7 empilha sobre W4 (mesma tabela `extraction`); onda 3 = W10, W11
- Isolamento de banco por workstream: `iris_wN` no cluster local (:5433), criado via `docker exec infra-postgres-1 psql -U iris`
- [x] W1..W12 em PR Draft
- [x] Int-tests rodados sequencialmente por branch (DB compartilhado em :5433)
- [x] PRs marcadas Ready
- [x] Conflitos acompanhados até merge

## Encerramento das 12 ondas (03/09/2026)

**12/12 mergeadas.** `main` em `07fc7b11`. PRs: #541, #543, #544, #545, #546, #547,
#548, #549, #550, #551, #555, #556. As sequelas de merge também fecharam: #561
(guard de `app_session_sob_sigilo`, #552), #562 (backfill pelo helper compartilhado,
#553 parte 1), #563 (régua do profissional responsável nos alertas, #554), #564
(flake de latência que avermelhava PR alheia), #565 (guard do `.env.example`),
#569 (forma canônica FLAT do `extraction.payload`, fecha #553).

## Cauda aberta e ordem de execução (revisada em 03/09/2026)

Sete issues sobraram. Duas nasceram do próprio W10 depois do merge de #556.

| Onda | Issue | Item                                                                                                     | Estado                 |
| ---- | ----- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| A    | #553  | Forma canônica do payload + backfill                                                                     | **fechada** (#569)     |
| A    | #567  | `metrica` objeto × string — `[object Object]` no briefing, linha "Métrica" sumindo do card de supervisão | em andamento           |
| B    | #542  | Flake e2e `represcricao-mv4` (`Q-06`)                                                                    | despachada             |
| B    | #566  | Painel admin no DS + fechar `ESCOPO_DS` do lint (`DS-01`, sequela do W10)                                | despachada             |
| B    | #558  | `PR-04` cadeia de suporte por percentual                                                                 | **spec**, não execução |
| C    | #560  | `DA-04` logger estruturado + id de correlação                                                            | fila                   |
| C    | #559  | `A-02` regra em `logic.ts`, rota importando rota                                                         | fila                   |

### Por que esta ordem

- **#553 e #567 são a mesma família**: um formato de jsonb lido de N jeitos. #553
  canonizou a escrita do `extraction.payload`; #567 faz o mesmo pelo `metrica` do
  `session_snapshot` — um formatador único ao lado do schema, nunca `String(objeto)`.
- **#560 antes de #559** (invertido em relação ao registro original): medido em
  03/09, `logar-erro.ts` tem 49 consumidores, dos quais 11 são `logic.ts` — os
  mesmos arquivos que #559 vai mover. Fazer #559 primeiro obriga a reescrever a
  chamada de log duas vezes. Nenhum dos dois cabe num subagente único; ambos
  precisam de atomização prévia.
- **#542 e #566 paralelizam** entre si e com #567: interseção de arquivo zero
  (`e2e/represcricao-mv4.spec.ts` × `(admin)`/`components/admin` ×
  `sinais.ts`/`briefing`/`supervisao-card`). Teto de 2 subagentes por vez — o
  runner é self-hosted e agentes paralelos produzem falhas disjuntas na suíte RLS
  que parecem regressão e são contenção.
- **Armadilha entre #567 e #566**: `supervisao-card.tsx` está dentro de
  `ESCOPO_DS` e contado no baseline do lint, que #566 regenera. #566 só pode
  regenerar o baseline no último commit, depois de rebasear em `main` com #567 já
  mergeada — senão o baseline conflita e `ds-paleta-crua.test.ts` fica ambíguo
  sobre quem mudou a contagem.
- **#558 não é execução**: toca a camada `evidence` (modelo de dados e contrato do
  agente), então exige `/tlc-spec-driven` antes de qualquer código, e os 7 pontos
  do checklist de handoff (`AGENTS.md` §5.2) fechados antes da label `jules`.

### Pendências operacionais (não são issue)

- `EXPORT_JOB_TOKEN` no Easypanel — pré-requisito de #545, já mergeada. **Verificar
  medindo** se foi provisionado; issue fechada não prova serviço no painel.
- Role `iris_expurgo_audit_log` + `EXPURGO_DATABASE_URL` — mesma situação (#551).
- Worktrees de `.claude/worktrees/` das 12 ondas seguem no disco; limpar com
  `git worktree prune` após confirmar que nada pendente vive neles.
