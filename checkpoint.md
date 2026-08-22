# Checkpoint — Estado Atual do Repositório Iris

**Data**: 22/08/2026
**Status**: `main` verde e estável; D34 (Auditoria no Corte por Inadimplência & Alarme no Job) implementado e testado; PR #418 (#383 — webhook Resend) mergeada em `main`.
**Últimas PRs mergeadas em `main`**: #412 (D52), #413 (D53), #414 (D47), #415 (#328), #416 (D54), #417 (D40 / #330), #418 (#383)

---

## 1. Estado de Entrega & Merge em `main`

- ✅ **Feature #407 (PR #408 — `96044e1`)**: Anamnese estruturada como marco 0 da linha do tempo (34/34 tasks por SDD).
- ✅ **Feature #409 (PR #410 — `498d335`)**: Ponto de entrada da aba "Anamnese" no prontuário, condicionada a `protocol_driven`.
- ✅ **Navegação & Dashboards (PR #411 — `44de0fa`)**: Sub-navegação de `/clinica` com `TabsNav` e atalhos para PEI/protocolos (fecha **D31**).
- ✅ **D52 (PR #412 — `2fdd318`)**: Guardrail de ambiente fail-closed em todos os scripts de seed (`scripts/lib/guardrail-seed.ts`, `ALLOW_SEED_REMOTE`).
- ✅ **D53 (PR #413 — `48643c9`)**: Guardrail estático + workflow de CI contra injeção de script de preview em `src/app/layout.tsx`.
- ✅ **D47 (PR #414 — `b50f432`)**: Sincronização de fixtures e contrato documental do modo convencional, com guard executável contra re-drift.
- ✅ **#328 (PR #415 — `e676834`)**: Perímetro comportamental do `config.matcher` do proxy, avaliado com o `getPathMatch` do próprio Next.js.
- ✅ **D54 (PR #416 — `11a1f5c`)**: Remoção da side-stripe `border-l-[4px]` e das bordas assimétricas do componente `Alert`, alinhando ao Espectro Brutal.
- ✅ **D40 / #330 (PR #417 — `cb9aef0`)**: Eliminação de N+1 em `materializarSnapshot` e paralelização de gravações.
- ✅ **#383 (PR #418 — `824bcf6`)**: Webhook do Resend para log de bounces e complaints sem PII (LGPD).
- ✅ **D34 (Branch `feat/d34-auditoria-corte-inadimplencia`)**: Trilha atômica em `audit_log` no corte de assinatura por carência/backstop, grant/policies RLS para `iris_auth` (`0116_audit_log_iris_auth_grant.sql`), limiar de alarme (`carenciaFalhas > 0` -> `process.exit(1)`) no job `scripts/fechamento-ciclo-billing.mjs` e testes automatizados completos.

---

## 2. PRs Abertas Aguardando Revisão e Merge

| PR       | Branch                                       | Escopo / Débito                                                                                | Estado                      |
| :------- | :------------------------------------------- | :--------------------------------------------------------------------------------------------- | :-------------------------- |
| **#419** | `feat/383-resend-webhook-bounces-complaints` | **Governança Legal**: formalização do Google Gemini nos termos e políticas de privacidade.     | Aberta aguardando merge. |
| **#420** | `feat/d34-auditoria-corte-inadimplencia`     | **D34**: auditoria no corte por inadimplência (`audit_log`) e exit code no job de faturamento. | Aberta aguardando merge. |

---

## 3. Arcabouço Jurídico & Governança LGPD (`docs/legal/`)

Revisão jurídica consolidada em `docs/legal/revisao-juridica-2026-08-21.md`.

- ✅ **Remoção de Risco RAG/Treinamento**: menção a RAG/treinamento removida de `pesquisa-planos-de-saude-prontuario.md` §4.
- ✅ **Teste de Proporcionalidade**: `docs/legal/teste-proporcionalidade-legitimo-interesse-antifraude.md` produzido (Art. 10 LGPD, `cpf_hash`).
- ✅ **Gate D-H (Consentimento / Anamnese)**: finalizado (Tutela da Saúde Art. 11, II, "f" + Consentimento do Menor Art. 14, §1º).
- ✅ **Provedor de IA (Gemini) — autorizado pelo Rômulo em 22/08/2026 e integrado documentalmente.** A nomeação de **Google (Gemini API)** foi formalizada nos documentos de `docs/legal/` (`politica-privacidade.md` §4, `termo-consentimento-titular-adulto.md`, `termo-consentimento-curatela.md`, etc.).
- ✅ **Testes de Integridade Legal Reativados**: `src/lib/legal.test.ts` e `src/components/legal/documento-legal.test.tsx` agora validam a nomeação de `Google (Gemini API)` e as pendências operacionais para ativação (`EXTRACTION_LLM_ENABLED`).
- ⚠️ **Débitos legais mapeados**: **D55** (`visibility_level`, sigilo multidisciplinar), **D56** (`e_psi_verified`/`e_psi_number`, Res. CFP 009/2024) e **D57** (gating operacional do Gemini: billing pago ativo + escopo do DPA + Art. 33 LGPD antes de ligar `EXTRACTION_LLM_ENABLED`).

---

## 4. Verificação da Base (`feat/d34-auditoria-corte-inadimplencia`)

| Gate                                               | Resultado                                                                                 |
| :------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                   | 0 erros                                                                                   |
| `pnpm lint`                                        | 0 erros, 9 warnings aceitos (stories/link Next)                                           |
| `pnpm test`                                        | **1.789/1.789 testes verdes** (248 arquivos, 0 falhas)                                    |
| `src/db/migrations.test.ts`                        | **8/8 testes verdes** (journal snapshot integro com `0116_audit_log_iris_auth_grant.sql`) |
| `scripts/fechamento-ciclo-billing.test.mjs`        | **15/15 testes verdes** (cobertura de `carenciaFalhas` no `resumoDoCorpo`)                |
| `pnpm format`                                      | Base formatada                                                                            |
| Diff de `BACKLOG.md` / `docs/GO_LIVE.md` vs `main` | Aditivo: **0 identificadores `D<n>` / `#<n>` perdidos**                                   |

---

## 5. Próximos Passos Recomendados

1. Merge da PR **#419** (Governança Legal Google Gemini API).
2. Abertura e merge da PR do **D34** (`feat/d34-auditoria-corte-inadimplencia`).
3. **D36**: Faixa de alerta urgente de recusa na UI (`faixa-trial.tsx` / `/assinatura`).
4. **D39**: Persistência do código cru de recusas G6 em `billing_cycle.recusa_codigo`.
5. **D57**: Checagem operacional (billing pago ativo, escopo do DPA para Gemini API standalone, Art. 33 LGPD) antes de comutar `EXTRACTION_LLM_ENABLED=true`.
6. **Dívida residual aceita (não bloqueia)**: os lookups unitários `taxonomiaDoProtocolo`, `criterioDominioDaMeta` e `lerCandidaturaGoalAtual` seguem no contrato `MaterializarQueries` sem chamador em produção — mantidos de propósito, como o `tipoEstruturaDoMarco` desde a #316, porque os testes asseriam `not.toHaveBeenCalled()` sobre eles (é o oráculo que prova que o N+1 não voltou).
