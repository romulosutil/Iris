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

## Estado

- [x] Issues criadas: W1 #529 · W2 #530 · W3 #531 · W4 #532 · W5 #533 · W6 #534 · W7 #535 · W8 #536 · W9 #537 · W10 #538 · W11 #539 · W12 #540
- [ ] Onda 1 despachada (W1, W2, W3, W5, W9, W12); onda 2 = W4, W6, W7, W8; onda 3 = W10, W11
- Isolamento de banco por workstream: `iris_wN` no cluster local (:5433), criado via `docker exec infra-postgres-1 psql -U iris`
- [ ] W1..W12 em PR Draft
- [ ] Int-tests rodados sequencialmente por branch (DB compartilhado em :5433)
- [ ] PRs marcadas Ready
- [ ] Conflitos acompanhados até merge
