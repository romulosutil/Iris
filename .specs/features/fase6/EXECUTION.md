# Fase 6 — Log de Execução

Checkpoint enxuto por fatia (protege progresso contra reset de contexto).
Main thread orquestra; subagents fazem o trabalho pesado e retornam comprimido.

## Estado
- Fatia 6.1: mergeada em main via PR #66 (branch de trabalho já deletada).
  Docs pós-merge em PR #67. Próxima fatia sai de main atualizado.
- WIP Fase 5: stash `fase5-wip-relatorios-f08a8d2`

## Fatia 6.1 — Hardening RLS (PX1–PX4) · migração `0044`
- [x] Spec endurecido commitado (`fa2da1f`)
- [x] Investigar grants + schema real (subagent) — 5 tabelas mapeadas
- [x] `0044_rls_hardening_px.sql` + journal `when=max+1000` escritos
- [x] Teste `src/db/rls-hardening-px.int.test.ts` (20 casos: 15 has_column_privilege imutáveis=false + 5 mutáveis=true + reassociação)
- [x] Validação de diff pelo main:
      - migração correta; `session` expande set mutável p/ colunas operacionais
        da agenda (app só faz UPDATE em estado/justificada/atendidoPorId/modalidade/
        checkInEm — todas concedidas; identidade patient_id/terapeuta_id/clinic_id/
        criado_em travadas). Teste existente `actions.int.test.ts:150` continua
        verde (rejeição agora no nível de privilégio, mais forte).
      - `observacoes` não existe em session → droppado (discrepância do spec).
      - Removido import `session` não-usado no teste (quebraria lint).
- [x] Docker Desktop subido pelo main; Postgres :5433 healthy
- [x] Aplicar 0044 (psql manual — drizzle desync no 0043 pré-existente) +
      rodar suites: testes DA 6.1 (`rls-hardening-px.int.test.ts`) **20/20**;
      typecheck limpo; lint limpo. Suite RLS completa = 382/383 — a 1 falha
      NÃO é da 6.1 (ver nota abaixo), sem regressão nas suites de agenda/session.
- [x] Fix typecheck: tipar raw-query `postgres` (`owner<{priv:boolean}[]>` +
      extrair `mut` p/ noUncheckedIndexedAccess)
- [x] Commit `0c4bae3` + push → **PR #66 MERGEADA** (merge `d8eff55`).
      ✅ FATIA 6.1 FECHADA (escopo verde; a falha de suite abaixo é pré-existente
      e fora de escopo — não contradiz o fechamento)

### Nota p/ backlog (fora de escopo 6.1 — é a MESMA falha do 382/383 acima)
- `db/tests/agenda2-encerrar-regra.int.test.ts` tem asserção de data
  hardcoded (`2026-07-20`) que expira com o tempo — flaky temporal, **não
  relacionado ao hardening RLS** e não introduzido pela 6.1. Corrigir em fatia
  separada (usar data relativa). NÃO tocado aqui.

### Decisões travadas 6.1
- Numeração `0044`; `when` do journal = `max+1000`.
- PX4: listar explicitamente colunas mutáveis (cadastro) vs travadas.
- Gate A9: teste falha se coluna imutável ainda for UPDATE-ável.

## Fatias seguintes (ordem por risco)
6.3 → 6.2 → 6.6-checklist → 6.4 → 6.5 (áudio, gated por DPA).
