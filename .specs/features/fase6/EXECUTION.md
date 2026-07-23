# Fase 6 — Log de Execução

Checkpoint enxuto por fatia (protege progresso contra reset de contexto).
Main thread orquestra; subagents fazem o trabalho pesado e retornam comprimido.

## Estado
- Fatia 6.1: mergeada em main via PR #66. Docs pós-merge em PR #67.
- Fatia 6.3: mergeada em main via PR #68. Follow-up de docs em PR #69.
- Fatia 6.2: SPLIT. **6.2a** (não-MFA: gate de bypass + guard puro + auditoria
  mascarada/recepção) na branch `feat/fase6-2-mfa-isolamento-recepcao`, PR aberta.
  **6.2b** (MFA real: plugin Better-Auth + tabela/coluna auth + UI enrollment +
  wiring) BLOQUEADA por confirmação do Rômulo no DDL de `app_user` (auth c/ dado).
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

## Fatia 6.3 — Retenção & Expurgo · migração `0045`
- [x] Investigação de infra (2 subagents): padrão `app_purgar_report`/`audit_log`
      (0039/0040) + grafo FK completo dos descendentes de `patient` (ordem de
      delete leaf-first) + estado do journal.
- [x] **Achados que corrigem o spec:**
      - `clinic.politica_retencao_meses` **já existe** (0000) — consumida, não criada.
      - **não havia coluna de alta** em `patient` → adicionada `alta_em date` (nullable).
      - `app_purgar_report` **não tem server action** → 6.3 espelha SQL-only (wiring diferido).
      - export **já grava audit síncrono inline** (`export.ts:82-85`) → R6.3.4 confirm-only.
      - `DELETE patient` é **bloqueado** por 7 filhos restrict/no-action → função
        deleta descendentes leaf-first (lista derivada do grafo FK, inclui subárvores
        session/goal/evidence/report).
- [x] **Pseudonimização (A3/R6.3.2) viável:** owner `iris` = superuser + BYPASSRLS,
      dono das funções `SECURITY DEFINER` → `UPDATE audit_log` só pela função;
      `app_role`/`iris_app` (REVOKE UPDATE, sem BYPASSRLS) seguem sem UPDATE. Verificado
      no Postgres local antes de codar.
- [x] `0045_expurgo_retencao.sql`: `patient.alta_em`; `app_paciente_expurgavel(uuid)`
      (regra `MAX(18a, alta+10a)`, clínica só estende via política); `app_purgar_paciente(uuid,text)`
      (guard coordenador+tenant → audit-antes → pseudonimiza trilha → erasure leaf-first → paciente).
- [x] Journal idx 45, `when=1784521556778` (=max+1000). schema.ts sincronizado.
- [x] Teste `db/tests/fase6-expurgo-paciente.int.test.ts` (6 casos): erasure físico +
      trilha pseudonimizada (não deletada) + imutabilidade audit p/ app_role + guards
      (terapeuta/cross-clínica/inexistente) + elegibilidade. **6/6 verde.**
- [x] Aplicado 0045 via psql manual (drizzle desync pré-existente no 0043) —
      toda a lista de DELETE compila contra o schema real.
- [x] typecheck limpo; lint 0 erros (8 warnings pré-existentes de stories, não tocados).
      Suite RLS completa **388/389** — a 1 falha é o flaky temporal do agenda2
      (data hardcoded `2026-07-20`), pré-existente e fora de escopo (ver nota 6.1).

### Review PR #68 — endereçado
- [x] WARN cross-tenant: `app_paciente_expurgavel` (SECURITY DEFINER) ganhou guard
      `p.clinic_id = app.clinic_id` + teste de vazamento cross-clínica (7/7 verde).
- [x] NIT oráculo: erros de `app_purgar_paciente` unificados em mensagem opaca
      ("inexistente ou sem permissão"). `app_purgar_report` tem o mesmo → backlog.
- [~] WARN sobrescrita de `detalhe`: **mantida de propósito** (erasure = whitelist,
      não blacklist; PII em chave imprevista sobreviveria). Racional documentado no SQL.

### Decisões travadas 6.3
- Erasure = **físico** (espelha `app_purgar_report`), não soft-delete.
- Trilha do sujeito **pseudonimizada** (patient_id→NULL, detalhe sem PII), nunca deletada.
  Linha-fato `paciente_purgado` já entra pseudônima (âncora = `entidade_id`).
- Retenção: `alta_em` nullable = em acompanhamento nunca expurga; sem nascimento tb não expurga.
- **Diferido p/ backlog:** server action/UI de purga (mesma dívida do `app_purgar_report`);
  job automático de expurgo (não construir — risco; expurgo é gatilho manual do coordenador).

## Fatia 6.2a — Bypass-gate + guard MFA + auditoria mascarada · migração `0046`
- [x] Investigação (2 subagents): Better-Auth/MFA + env-flag; audit masking + isolamento recepção.
- [x] **Achado que força SPLIT:** MFA é greenfield total — sem plugin twoFactor,
      sem tabela `two_factor`, sem coluna `twoFactorEnabled` em `app_user`.
      Implementar MFA real = DDL em `app_user` (auth c/ dado) = "confirmar antes"
      + UI de enrollment. Vira fatia 6.2b (gated pelo Rômulo). 6.2a leva o resto.
- [x] **R6.2.2** `assertMfaBypassSafe` (`src/auth/mfa-gate.ts`): hard-fail no boot
      se `BYPASS_MFA_FOR_DEV=true` + `NODE_ENV=production` (A5, fail-closed).
      Chamado no topo de `auth.ts`. `.env.example` + teste (prod+true lança).
- [x] **R6.2.1** `requireMfaIfClinicalRole(ctx)` + `MfaRequiredError`
      (`require-role.ts`): guard puro, papéis clínicos exigem MFA, recepção não.
      `TenantContext.mfaEnrolled?` adicionado. **Não** cablado em produção ainda
      (fonte de enrollment só existe em 6.2b — evita travar todos). Teste unit.
- [x] **R6.2.4/A4** `0046`: `audit_select` → coordenador-only; view
      `audit_log_mascarado` (`security_barrier`, SEM `security_invoker` — a base
      exclui recepção, então invoker a bloquearia; owner-rights + `WHERE
      clinic_id = app.clinic_id` reimpõe tenant) projetando só colunas
      não-clínicas. Recepção perde base, lê view mascarada.
- [x] Journal idx 46, `when=1784521557778`. Aplicado via psql manual.
- [x] Testes: unit 10/10 (`require-role` + `mfa-gate`); RLS
      `fase6-recepcao-isolation` (6 casos: base bloqueada, view mascarada sem
      patient_id/detalhe, tenant-scoped, coordenador regressão, report bloqueado)
      + `fase5-report-purga` atualizado (recepção agora 0 no base). typecheck/lint limpos.

### Decisões travadas 6.2a
- Auditoria p/ recepção = **view mascarada owner-rights** (não invoker); sem
  consumidor de UI hoje (greenfield), só 1 teste dependia do path antigo.
- MFA dividido: guard + gate agora; plugin/tabela/UI em 6.2b (confirmar `app_user`).

## Fatias seguintes (ordem por risco)
6.2b (MFA real — confirmar DDL `app_user`) → 6.6-checklist → 6.4 → 6.5 (áudio, gated por DPA).
