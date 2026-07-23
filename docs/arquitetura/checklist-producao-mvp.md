# Checklist de Produção — Aceite do MVP (Fase 6)

**Objetivo:** critério único e verificável de "MVP pronto para piloto com dado
real". É o artefato de aceite da fatia 6.6 e o predecessor de fechar a Issue #9.
Não recopia conteúdo de outros docs — **linka** e rastreia estado.

> **Definição de escopo do fechamento (decisão travada, spec A7/A8):** o MVP
> fecha por **6.1–6.3 + 6.6** (hardening RLS + MFA/isolamento + retenção/expurgo
> + polimento família). O **ditado de voz (6.4/6.5) NÃO gatilha o aceite do
> MVP** — é fast-follow com ASR real desabilitado até DPA assinado
> (`docs/legal/dpa-asr-audio.md`).

---

## 1. Hardening de segurança / multi-tenancy — ✅ shipado

| Item | Estado | Onde |
| --- | --- | --- |
| RLS hardening PX1–PX4 (colunas imutáveis por grant) | ✅ | migração `0044`, PR #66 |
| Teste `has_column_privilege` prova imutabilidade real | ✅ | `src/db/rls-hardening-px.int.test.ts` |
| MFA TOTP + backup codes (Better-Auth) | ✅ | migração `0047`, PR #71 |
| Enforcement MFA central p/ papel clínico | ✅ | `getTenantContext` (`tenant.ts`) |
| `BYPASS_MFA_FOR_DEV` hard-fail em produção | ✅ | `src/auth/mfa-gate.ts`, PR #70 |
| Isolamento recepção (0 leitura clínica; auditoria mascarada) | ✅ | migração `0046`, view `audit_log_mascarado` |

**Pendência de verificação manual (não bloqueia código, bloqueia piloto):**
- [ ] Smoke manual do fluxo MFA `enable → verify → login-challenge` num app
      rodando com app autenticador real (o schema casa com o contrato do plugin;
      typecheck/build validam o wiring, mas o round-trip real é manual).

## 2. Retenção & Expurgo (LGPD) — ✅ shipado

| Item | Estado | Onde |
| --- | --- | --- |
| `app_purgar_paciente(uuid,text)` (erasure físico auditado) | ✅ | migração `0045`, PR #68 |
| Pseudonimização da trilha `audit_log` do sujeito no expurgo | ✅ | mesma migração; `[[audit-log-mutacao-via-definer-bypassrls]]` |
| `clinic.politica_retencao_meses` + regra `MAX(18a, alta+10a)` | ✅ | `app_paciente_expurgavel(uuid)` |
| Verificação síncrona de audit no export | ✅ (já existia) | `export.ts:82-85` |
| Política de retenção redigida | ✅ rascunho | `docs/legal/politica-retencao-dados.md` |

**Diferido (dívida registrada, não bloqueia MVP):**
- [ ] Server action / UI de purga de paciente (hoje SQL-only; mesma dívida de
      `app_purgar_report`).
- [ ] Job automático de expurgo — **não construir**; expurgo é gatilho manual
      do coordenador (risco de deleção automática).

## 3. Polimento família — ✅ (fatia 6.6)

| Item | Estado | Onde |
| --- | --- | --- |
| `data-mode="familia"` ativado no cartão de relatório da família | ✅ | `src/app/(app)/relatorios/familia-report.tsx` |
| Tokens de temperatura família (design-system §2) | ✅ | `src/styles/globals.css` |
| a11y sem regressão (axe WCAG 2.1 AA) | ✅ | `src/app/(app)/relatorios/a11y.test.tsx` |

**Follow-up (fora de escopo 6.6):**
- [ ] Alinhar o PDF exportado (`src/lib/report/familia/build-html.ts`, CSS
      inline próprio) à paleta de temperatura família.

## 4. Gates legais — predecessores do piloto com dado real

Estes **não** bloqueiam o merge/fechamento técnico do MVP, mas bloqueiam o
**piloto com paciente real**:

- [ ] Validação legal formal da **Política de Retenção** antes do piloto
      (`politica-retencao-dados.md` está em rascunho).
- [ ] Respostas do advogado ao `briefing-para-advogado.md` (§4 transferência
      internacional do LLM de texto).
- [ ] **DPA de ASR/áudio assinado** — predecessor de habilitar 6.4/6.5
      (`docs/legal/dpa-asr-audio.md`). Enquanto não assinado, ASR real fica
      desabilitado por feature flag.
- [ ] Termo de consentimento cita transferência internacional (LLM de texto +,
      quando habilitado, áudio/ASR).

## 5. Infra / deploy — predecessores do go-live

Ver `docs/arquitetura/plano-bootstrap-e-stack-vps.md` (pivô VPS Hostinger BR +
Easypanel + Postgres puro + MinIO). Itens de infra são "confirmar antes / via
única" (CLAUDE.md):

- [ ] Provisionar VPS + Easypanel (decisão de infra pendente de OK do Rômulo).
- [ ] Gate de migração no deploy (stage `migrate`, role dona, `exit!=0` aborta —
      lição `[[deploy-schema-gate]]`).
- [ ] Backup/retenção passa a ser responsabilidade da operação (some Supabase
      gerenciado).
- [ ] Variáveis de ambiente de produção conferidas (`.env.example`).

## 6. Qualidade — gate técnico

- [ ] `pnpm typecheck` limpo.
- [ ] `pnpm lint` sem erro novo.
- [ ] `pnpm test` / `pnpm test:rls` verdes (nota: flaky temporal pré-existente
      em `agenda2-encerrar-regra.int.test.ts` — data hardcoded, fora de escopo;
      corrigir em fatia separada).
- [ ] `pnpm build` limpo (atenção ao falso-negativo de `.next/dev/types` stale —
      lição `[[next-dev-types-stale-build-fail]]`: `rm -rf .next && build`).

---

**Fechamento da Issue #9:** cumpridos §1–§3 + gate técnico §6, o MVP está
tecnicamente aceito. §4 (legais) e §5 (infra) são predecessores do **piloto**,
rastreados aqui e no `BACKLOG.md`, não do merge. Áudio (6.4/6.5) sai como issue
fast-follow gated por DPA.
