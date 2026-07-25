# Checklist de Produção — Aceite do MVP (Fase 6)

> ## ✅ MVP VALIDADO — 25/07/2026
>
> Etapas 0–5 da issue **#75** (trilha de go-live) verdes; **#75 fechada**. O MVP
> está pronto para piloto com dado real. O que sobrou aqui como `[ ]` é dívida
> conhecida com issue própria, **não** predecessor do piloto:
>
> - **DR em cluster novo com dump de produção** — mecanismo já comprovado em
>   cluster vazio (ver §5); falta repetir com dump de prod.
> - **UI de purga de paciente** e **alinhamento do PDF da família** — dívida de
>   produto, não de conformidade.
>
> Riscos aceitos e pendências de segurança que **sobrevivem** ao aceite:
> **#86** (backup no mesmo VPS — `risco-aceito`, reavaliar se o piloto passar da
> primeira clínica), **#93** (segredos em log de build do Easypanel + PAT
> classic), **#89** (retenção de 30d do backup vs. expurgo).

**Objetivo:** critério único e verificável de "MVP pronto para piloto com dado
real". É o artefato de aceite da fatia 6.6 e o predecessor de fechar a Issue #9.
Não recopia conteúdo de outros docs — **linka** e rastreia estado.

> **Definição de escopo do fechamento (decisão travada, spec A7/A8):** o MVP
> fecha por **6.1–6.3 + 6.6** (hardening RLS + MFA/isolamento + retenção/expurgo
>
> - polimento família). O **ditado de voz (6.4/6.5) NÃO gatilha o aceite do
>   MVP** — é fast-follow com ASR real desabilitado até DPA assinado
>   (`docs/legal/dpa-asr-audio.md`).

---

## 1. Hardening de segurança / multi-tenancy — ✅ shipado

| Item                                                         | Estado | Onde                                        |
| ------------------------------------------------------------ | ------ | ------------------------------------------- |
| RLS hardening PX1–PX4 (colunas imutáveis por grant)          | ✅     | migração `0044`, PR #66                     |
| Teste `has_column_privilege` prova imutabilidade real        | ✅     | `src/db/rls-hardening-px.int.test.ts`       |
| MFA TOTP + backup codes (Better-Auth)                        | ✅     | migração `0047`, PR #71                     |
| Enforcement MFA central p/ papel clínico                     | ✅     | `getTenantContext` (`tenant.ts`)            |
| `BYPASS_MFA_FOR_DEV` hard-fail em produção                   | ✅     | `src/auth/mfa-gate.ts`, PR #70              |
| Isolamento recepção (0 leitura clínica; auditoria mascarada) | ✅     | migração `0046`, view `audit_log_mascarado` |

**Pendência de verificação manual (não bloqueia código, bloqueia piloto):**

- [x] Smoke manual do fluxo MFA `enable → verify → login-challenge` num app
      rodando com app autenticador real (o schema casa com o contrato do plugin;
      typecheck/build validam o wiring, mas o round-trip real é manual).

## 2. Retenção & Expurgo (LGPD) — ✅ shipado

| Item                                                          | Estado          | Onde                                                          |
| ------------------------------------------------------------- | --------------- | ------------------------------------------------------------- |
| `app_purgar_paciente(uuid,text)` (erasure físico auditado)    | ✅              | migração `0045`, PR #68                                       |
| Pseudonimização da trilha `audit_log` do sujeito no expurgo   | ✅              | mesma migração; `[[audit-log-mutacao-via-definer-bypassrls]]` |
| `clinic.politica_retencao_meses` + regra `MAX(18a, alta+10a)` | ✅              | `app_paciente_expurgavel(uuid)`                               |
| Verificação síncrona de audit no export                       | ✅ (já existia) | `export.ts:82-85`                                             |
| Política de retenção redigida                                 | ✅ rascunho     | `docs/legal/politica-retencao-dados.md`                       |

**Diferido (dívida registrada, não bloqueia MVP):**

- [ ] Server action / UI de purga de paciente (hoje SQL-only; mesma dívida de
      `app_purgar_report`).
- [ ] Job automático de expurgo — **não construir**; expurgo é gatilho manual
      do coordenador (risco de deleção automática).

## 3. Polimento família — ✅ (fatia 6.6)

| Item                                                            | Estado | Onde                                          |
| --------------------------------------------------------------- | ------ | --------------------------------------------- |
| `data-mode="familia"` ativado no cartão de relatório da família | ✅     | `src/app/(app)/relatorios/familia-report.tsx` |
| Tokens de temperatura família (design-system §2)                | ✅     | `src/styles/globals.css`                      |
| a11y sem regressão (axe WCAG 2.1 AA)                            | ✅     | `src/app/(app)/relatorios/a11y.test.tsx`      |

**Follow-up (fora de escopo 6.6):**

- [ ] Alinhar o PDF exportado (`src/lib/report/familia/build-html.ts`, CSS
      inline próprio) à paleta de temperatura família.

## 4. Gates legais — predecessores do piloto com dado real

Estes **não** bloqueiam o merge/fechamento técnico do MVP, mas bloqueiam o
**piloto com paciente real**:

- [x] Validação legal formal da **Política de Retenção** antes do piloto
      (`politica-retencao-dados.md` está em rascunho).
- [x] Respostas do advogado ao `briefing-para-advogado.md` (§4 transferência
      internacional do LLM de texto).
- [x] **DPA de ASR/áudio assinado** — predecessor de habilitar 6.4/6.5
      (`docs/legal/dpa-asr-audio.md`). Enquanto não assinado, ASR real fica
      desabilitado por feature flag.
- [x] Termo de consentimento cita transferência internacional (LLM de texto +,
      quando habilitado, áudio/ASR).

## 5. Infra / deploy — predecessores do go-live

Ver `docs/arquitetura/plano-bootstrap-e-stack-vps.md` (pivô VPS Hostinger BR +
Easypanel + Postgres puro + MinIO). Itens de infra são "confirmar antes / via
única" (CLAUDE.md):

- [x] Provisionar VPS + Easypanel (decisão de infra pendente de OK do Rômulo).
- [x] Gate de migração no deploy (stage `migrate`, role dona, `exit!=0` aborta —
      lição `[[deploy-schema-gate]]`).
- [x] Backup/retenção passa a ser responsabilidade da operação (some Supabase
      gerenciado). Scripts e runbook entregues em `infra/backup/` +
      `infra/README.md` §Backup e restore (LGPD); falta a ação humana no VPS
      (abaixo).
- [x] Serviço de backup provisionado no Easypanel (Dockerfile `infra/backup/`,
      volume em `/backups`, bucket `iris-backups` no MinIO, schedule `0 6 * * *`
      = 03:00 de Brasília) rodando com a **role dona** (`iris`), nunca
      `iris_app` — NOBYPASSRLS faria o dump sair incompleto em silêncio.
- [x] Primeira execução conferida: cada ciclo gera **um par** de arquivos com o
      mesmo timestamp — `iris-<ts>.dump` **e** `iris-<ts>.globals.sql`
      (`pg_dumpall --globals-only`) — em `/backups` **e** no bucket. Só um dos
      dois = backup quebrado: `pg_dump` não carrega roles de cluster
      (`app_role`/`iris_auth`), e restaurar sem globals dá 37 tabelas com **0
      policies de RLS**, sem erro fatal.
- [x] Teste de restore executado e verde (`verify-restore.sh` exit 0: tabelas,
      RLS ativo + contagem de policies, row counts, roles/grants, e presença do
      `.globals.sql` com as roles). É o que fecha o item LGPD; reexecutar
      mensalmente e após toda migração que mexa em RLS/roles, com registro no
      `BACKLOG.md`.
- [ ] **DR em cluster novo, com dump DE PRODUÇÃO** (runbook em `infra/README.md`):
      restaurar globals + dump num Postgres vazio, re-setar as senhas das roles
      de login (os globals vêm com `--no-role-passwords`), rodar `pnpm test:rls`
      contra o restaurado, só então religar o app. `verify-restore.sh` **não
      cobre** este cenário — ele restaura no mesmo cluster, onde as roles já
      existem. Exige um segundo cluster Postgres.
      **Parcialmente comprovado (25/07/2026):** o mecanismo foi validado num
      cluster PG17 **vazio** com dump de dev — `0/0` → **37 tabelas, 85 policies,
      33 tabelas com RLS, 2 roles**, e `pnpm test:rls` **404/404** contra o banco
      restaurado (as policies aplicam, não só existem). O que falta é repetir com
      um dump **de produção**, para fechar o item sem extrapolação.
- [x] Risco aceito e registrado: backup no mesmo VPS não cobre perda total do
      host; réplica off-site em outro provedor BR é fast-follow pós-piloto.
- [x] Variáveis de ambiente de produção conferidas (`.env.example`).

## 6. Qualidade — gate técnico

- [x] `pnpm typecheck` limpo.
- [x] `pnpm lint` sem erro novo.
- [x] `pnpm test` / `pnpm test:rls` verdes (nota: flaky temporal pré-existente
      em `agenda2-encerrar-regra.int.test.ts` — data hardcoded, fora de escopo;
      corrigir em fatia separada).
- [x] `pnpm build` limpo (atenção ao falso-negativo de `.next/dev/types` stale —
      lição `[[next-dev-types-stale-build-fail]]`: `rm -rf .next && build`).

---

**Fechamento da Issue #9:** cumpridos §1–§3 + gate técnico §6, o MVP está
tecnicamente aceito. §4 (legais) e §5 (infra) são predecessores do **piloto**,
rastreados aqui e no `BACKLOG.md`, não do merge. Áudio (6.4/6.5) sai como issue
fast-follow gated por DPA.
