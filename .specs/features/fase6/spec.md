# Fase 6 — Ditado de Voz & Hardening LGPD (spec endurecido)

> Origem: GitHub Issue #9. Este spec é a **revisão adversarial de Tech Lead**
> do plano da issue — corrige colisões, remove retrabalho, resolve
> contradições LGPD internas e reordena por risco. Onde diverge da issue, o
> spec vence (registrar a divergência no comentário de fechamento da #9).
> Branch: `feat/fase6-ditado-voz-hardening-lgpd` (de `main` limpo).

## Estado de partida verificado (não do plano — do repo)

- Última migração em `main`: **`0043_report_narrativo_com_ia.sql`** → próximo
  número livre é **`0044`**.
- `audit_log` **já existe e já é imutável** (`REVOKE UPDATE, DELETE`, RLS
  FORCE) — migração `0039_fase5_report_audit_rls.sql`.
- Padrão de expurgo auditado **já existe**: `app_purgar_report(uuid,text)`
  loga em `audit_log` ANTES do delete, com `pdf_hash`, só `coordenador`,
  `SECURITY DEFINER` — `0040_fase5_purga_rls.sql`.
- `audit_select` policy **já concede SELECT em `audit_log` a
  `admin_recepcao`** (e `audit_log` carrega `patient_id`).

---

## Achados adversariais → ajustes de escopo

### A1 — Colisão de numeração de migração (bloqueante mecânico)

Plano chama 6.1 de `0043`/`0044` e 6.3 de `0044`; `0043` já está tomado.
**Ajuste:** 6.1 → `0044_rls_hardening_px.sql`; 6.3 → `0045_expurgo_retencao.sql`.
Antes de gerar, confirmar `when` no journal drizzle (ver lição
`drizzle-hand-migration-when-ordering`): setar `when = max_aplicado + 1000`,
nunca placeholder.

### A2 — 6.3 reinventa infra existente (remover retrabalho)

`audit_log` imutável e o padrão log-antes-delete-com-hash **já shipparam**
(0039/0040). 6.3 NÃO é greenfield. Reescopo de 6.3:

- **(a)** `app_purgar_paciente(uuid,text)` = espelho de `app_purgar_report`
  (mesma assinatura, mesmo guard `coordenador`, mesmo `SECURITY DEFINER`,
  mesmo log-antes-delete). Reusar, não inventar.
- **(b)** coluna `clinic.politica_retencao_meses` + job/consulta de
  elegibilidade de expurgo (a regra de retenção).
- **(c)** "verificação síncrona de AuditLog no export" — **confirmar o que a
  action de export já faz** antes de escrever código; `audit_select` já existe.
  Provavelmente é patch, não feature.

### A3 — Contradição LGPD interna: erasure × trilha de auditoria (o mais caro)

`app_purgar_paciente` cascateia. `audit_log.patient_id` **não tem FK**
(sobrevive ao delete — por design da 0040). Logo, purgar o paciente e manter
linhas de `audit_log` com `patient_id` = paciente "apagado" mas trilha ainda
identificável → **erasure incompleto**. Deletar a trilha = perder compliance.
**Regra obrigatória (decidir antes de codar):** no expurgo do paciente,
**pseudonimizar** `patient_id`/`detalhe` nas linhas de `audit_log` do sujeito
(manter hash + fato "purgado", remover PII), preservando a trilha sem o dado
pessoal. Plano é silencioso nisto — não pode ficar TBD numa fatia de segurança.

### A4 — 6.2 (recepção zero-clínico) contradiz `audit_select` existente

Policy vigente dá `SELECT` em `audit_log` (com `patient_id`) a
`admin_recepcao`; 6.2 exige "0 leituras clínicas". Contradição direta.
**Decisão a travar:** metadado de auditoria é "clínico"? Recomendo: recepção
enxerga auditoria **sem `patient_id`/`detalhe`** (view mascarada por coluna)
OU reclassificar leitura-de-auditoria como admin-não-clínico explícito. A
suíte `recepcao-isolation` deve **codificar a decisão**, não assumir zero cego
que quebraria a policy atual.

### A5 — Flag `BYPASS_MFA_FOR_DEV` é risco de segurança silencioso

Flag que, vazando pra prod, desliga MFA sem alarme.
**Guardrail:** flag deve **hard-fail no boot** se `NODE_ENV=production`
(throw, não default-false). Teste obrigatório: `prod + bypass=true` ⇒ crash.

### A6 — Áudio = dado sensível de saúde cruzando fronteira de confiança NOVA

IndexedDB não-criptografado em device possivelmente compartilhado da clínica;
storage MinIO; **API ASR externa (OpenAI/Azure) = transferência internacional
de dado de saúde sensível** → LGPD Art. 33 + DPA com subprocessador.
**Ajustes:**

- IndexedDB `audio_drafts`: purgar em **logout** e **após confirmação de
  upload**, não só flush-on-online. Rascunho de voz não pode sobreviver troca
  de usuário no mesmo device.
- Escolha de provider ASR real é **decisão legal**, não só técnica. `StubAsr`
  destrava CI, mas **habilitar provider real fica BLOQUEADO por DPA assinado**
  (predecessor, ver A8). Documentar retenção 7 dias do áudio bruto no DPA.

### A7 — Escopo de áudio infla um "fechamento de MVP" (reordenar por risco)

6.4+6.5 (fila IndexedDB, dual-codec webm/mp4, background sync, abstração ASR,
fallback player) é o maior/mais novo/mais arriscado bloco — enxertado numa
fase de "hardening + fechar MVP". **Recomendação:** as fatias de
segurança/LGPD (6.1–6.3 + checklist 6.6) SÃO o fechamento real do MVP e podem
shippar independente. Áudio (6.4–6.5) é épico de feature **fast-follow** que
**não deve gatilhar o aceite do MVP**. Sequenciar: segurança primeiro, áudio
depois — issue #9 pode fechar o MVP sem ASR real em prod.

### A8 — Dependência de fechamento escondida

6.6 ("aceite final + fecha #9") depende de 6.5, que depende de DPA externo
(A6). Tornar **DPA/retenção sign-off predecessor explícito** — não checkbox no
fim. Se DPA não chega, MVP fecha por 6.1–6.3+6.6, com 6.4–6.5 marcadas
"feature-flagged, ASR real desabilitado".

### A9 — Faltam gates de migração/rollback (silent under-protection)

Grant-por-coluna com ordem errada **sub-protege sem erro** (lições
`drizzle-hand-migration-when-ordering`, `deploy-schema-gate`, e
`postgres-column-grant-denies-table` — grant de coluna faltando nega no nível
de tabela). **Adicionar em 6.1:** teste RLS que **FALHA se uma coluna dita
imutável ainda for UPDATE-ável** (prova que a migração pegou), via
`has_column_privilege`, não só teste de reassociação.

### A10 — PX4 é "avaliar se precisa" (TBD proibido em fatia de segurança)

Decidir agora: auditar colunas admin de `patient`, listar explicitamente
mutáveis (cadastro) vs travadas (`clinic_id` já travado). Sem TBD.

---

## Requisitos (IDs rastreáveis)

### Fatia 6.1 — Hardening RLS (PX1–PX4) · migração `0044`

- **R6.1.1** PX1 `session`: `REVOKE UPDATE` global + `GRANT UPDATE
(estado, check_in_em, numero_sequencial_paciente, agendada_para,
observacoes)`. Imutáveis: `patient_id, terapeuta_id, criado_em`.
- **R6.1.2** PX2 `patient_clinical_profile`: `patient_id` imutável por grant.
- **R6.1.3** PX3 `patient_protocol` + `care_team_membership`: PK/FK imutáveis
  por grant-por-coluna.
- **R6.1.4** PX4 `patient`: lista explícita mutável/travada (A10). Sem TBD.
- **R6.1.5** Teste RLS de reassociação intra-clínica (deve falhar UPDATE de FK).
- **R6.1.6** Teste `has_column_privilege` provando imutabilidade real (A9).
- **R6.1.7** `when` do journal drizzle = `max+1000` (A1).

### Fatia 6.2 — MFA & Isolamento Recepção

- **R6.2.1** `requireMfaIfClinicalRole(ctx)` (Better Auth) p/ `terapeuta` +
  `coordenador`.
- **R6.2.2** `BYPASS_MFA_FOR_DEV` hard-fail em `NODE_ENV=production` (A5) + teste.
- **R6.2.3** Banner/redirect onboarding MFA.
- **R6.2.4** `recepcao-isolation.int.test.ts` codificando a decisão A4 sobre
  `audit_log` (não assumir zero cego).

### Fatia 6.3 — Retenção & Expurgo · migração `0045`

- **R6.3.1** `app_purgar_paciente(uuid,text)` espelhando `app_purgar_report`
  (reuso de padrão, A2).
- **R6.3.2** Pseudonimização de `audit_log` do sujeito no expurgo (A3) — regra
  travada, com teste.
- **R6.3.3** `clinic.politica_retencao_meses` + regra `MAX(idade 18, alta+10a)`.
- **R6.3.4** Confirmar/patch (não recriar) verificação de audit no export (A2c).

### Fatia 6.4 — Captura de Áudio & Persistência Local _(fast-follow, não gatilha aceite MVP — A7)_

- **R6.4.1** `AudioCapture` (Design System Espectro Brutal): gravação, timer,
  indicador. Dual-codec (`webm;opus` / `mp4;aac`).
- **R6.4.2** IndexedDB `audio_drafts` por sessão ANTES do upload.
- **R6.4.3** Purga de `audio_drafts` em logout **e** pós-confirmação de upload
  (A6), além de flush-on-`window.online`.
- **R6.4.4** `salvarRascunhoAudio` server action → storage sob RLS.

### Fatia 6.5 — Pipeline ASR pt-BR & Fallback _(bloqueado por DPA — A6/A8)_

- **R6.5.1** Abstração `AsrProvider`: `StubAsrProvider` (CI) +
  `OpenAiAsrProvider`/`AzureAsrProvider`.
- **R6.5.2** Provider real **desabilitado até DPA assinado** (feature flag).
- **R6.5.3** Fluxo Áudio→Transcrição→`SessionNote`→Agente Extração (Fase 3).
- **R6.5.4** Fallback: áudio preservado + player + edição manual.

### Fatia 6.6 — Polimento Família & Aceite · predecessor: DPA sign-off (A8)

- **R6.6.1** Tokens `data-mode="familia"` em relatórios/cartões.
- **R6.6.2** Checklist produção + DPA (predecessor explícito de fechar #9).
- **R6.6.3** Atualizar `CLAUDE.md`, `BACKLOG.md`, fechar #9 documentando
  divergências deste spec.

---

## Ordem de execução recomendada (por risco/valor)

`6.1 → 6.3 → 6.2` (trilha segurança/LGPD = fechamento MVP real) → `6.6-checklist`
→ **então** `6.4 → 6.5` (áudio fast-follow, gated por DPA).
