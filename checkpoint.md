# Checkpoint — Estado Atual do Repositório Iris

**Data**: 23/08/2026
**Status**: `main` verde e estável. Revisão tech lead dos PRs #423 e #425 concluída: **#425 verde em CI real** (suíte e2e passa a rodar no CI); **#423 verde porém `BLOCKED` por configuração de ruleset** (ver **D58**, ação de admin).
**Últimas PRs mergeadas em `main`**: #412 (D52), #413 (D53), #414 (D47), #415 (#328), #416 (D54), #417 (D40 / #330), #418 (#383), #419 (legal/Gemini), #420 (D34), #421 (spec de exportação)

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

| PR       | Branch                                       | Escopo / Débito                                                                                                                                      | Estado                                                                          |
| :------- | :------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| **#419** | `feat/383-resend-webhook-bounces-complaints` | **Governança Legal**: formalização do Google Gemini nos termos e políticas de privacidade.                                                           | ✅ Mergeada em `main` (`fc64478`).                                              |
| **#420** | `feat/d34-auditoria-corte-inadimplencia`     | **D34**: auditoria no corte por inadimplência (`audit_log`) e exit code no job de faturamento.                                                       | ✅ Mergeada em `main` (`737a9c0`).                                              |
| **#425** | `fix/424-e2e-seed-demo-e-ci`                 | **#424**: recria `pnpm seed:demo`/`seed:e2e`, corrige 4 specs com drift de produto e liga a suíte `e2e/` no CI (job `test-e2e` + gate de cobertura). | ✅ **Verde em CI real (23/08)**; revisado, pronto para sair de Draft e mergear. |
| **#423** | `chore/remove-ci-workflows-redundantes`      | Remove `migrations-integrity`, `legal-versions-integrity` e `layout-preview-guardrail` (cobertos pelo job `test`).                                   | ⚠️ Verde, porém `BLOCKED`: **mergear só depois de editar o ruleset** (D58).     |
| **#422** | `feat/374-exportacao-integral-acervo`        | Exportação integral do acervo da conta (#374/#353 unificadas).                                                                                       | Aberta aguardando revisão/merge.                                                |

---

## 2.1 Revisão tech lead de 23/08/2026 — o que foi corrigido nos PRs

**PR #425** chegou com `test` e `test-e2e` vermelhos; ambos eram defeito real:

1. `pnpm seed:e2e` abortava com `node: .env: not found` — o runner passa as variáveis pelo bloco `env:` do job, sem arquivo. Corrigido para `--env-file-if-exists=.env` nos dois seeds novos.
2. `scripts/lib/guardrail-seed-wiring.test.ts` (D52) reprovava com razão: `seed-demo.ts` e `seed-e2e.ts` executam `TRUNCATE` e gravam senha padrão, então precisam entrar na lista coberta pelo teste de fiação do guardrail. Os dois já chamavam `assertSeedAllowed()` no lugar certo — faltava a cobertura estática.
3. Achado da própria revisão: `scripts/ci/verificar-cobertura-e2e.mjs` nascera **sem teste** (o irmão `verificar-cobertura-testes.mjs` tem). Escrito `verificar-cobertura-e2e.test.mjs`, 11 casos, cobrindo os pisos inválidos que desligariam o gate em silêncio.

**Verde medido no CI real** (run `32617527004`, job `test-e2e`): `[cobertura-e2e] arquivos=10 testes=17 pulado=0 inesperado=0 flaky=0`; `17 passed (49.8s)`. `jules/review` com verdict `approve`.

**PR #423**: diff correto — confirmado por `pnpm exec vitest list` que os três arquivos de teste envolvidos são coletados pelo projeto `[unit]`, logo o job `test` já os roda. O bloqueio é de configuração e virou **D58**.

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

| Gate                                               | Resultado                                                                                                                                                                  |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                   | 0 erros                                                                                                                                                                    |
| `pnpm lint`                                        | 0 erros, 0 warnings                                                                                                                                                        |
| `pnpm test`                                        | **1.788/1.788 testes verdes** (0 falhas)                                                                                                                                   |
| `pnpm build`                                       | Sucesso; `ƒ /api/webhooks/resend` e `ƒ /api/hooks/resend` (ambas dinâmicas — prova de que a config de segmento foi aplicada após deixar de reexportar `runtime`/`dynamic`) |
| Mutação em `src/lib/email/webhook.ts` (produção)   | Mutante reintroduzindo `bounceMessage` no log → **morto** (o teste novo usa o diagnóstico SMTP real, que embute o destinatário); código original verde                     |
| Diff de `BACKLOG.md` / `docs/GO_LIVE.md` vs `main` | Aditivo: **0 identificadores `D<n>` / `#<n>` perdidos** (verificado por script comparando os conjuntos de `main`, do PR e do resultado)                                    |

### 4.1 Correções aplicadas na revisão (antes do merge)

1. **`bounce.message` deixou de ser logado** — texto livre do MTA carrega o endereço do destinatário; o guardrail LGPD passava por escolha de fixture, não por construção. Restou `bounce.type`.
2. **`verificarAssinaturaResend` removido** — segundo caminho de verificação de assinatura, sem chamador de produção e já divergente do usado pela rota (`true` vs. 400 em `SyntaxError`).
3. **Alias `/api/hooks/resend`** — `runtime`/`dynamic` declarados literalmente no arquivo de rota.
4. **Nomeação do provedor de IA autorizada** — `docs/legal/` e os testes em `src/lib/legal.test.ts` e `src/components/legal/documento-legal.test.tsx` sincronizados com a nomeação de `Google (Gemini API)`. O gating operacional segue aberto via **D57**.

## 5. Próximos Passos Recomendados

0. 🔴 **D58 — ação de admin, bloqueia o #423**: editar o ruleset `Main Protection` removendo `journal` e `versoes-legais` de `required_status_checks` ANTES de mergear o #423 (senão todo PR futuro fica `BLOCKED` esperando um check que nenhum workflow emite mais). Depois de mergear o #425, acrescentar `test-e2e` à lista, para que a suíte e2e passe a ser obrigatória de fato.
1. ✅ **Concluído (22/08/26)**: Merge da PR **#418** (#383 — webhook Resend) e **#419** (Governança Legal Google Gemini API).
2. ✅ **Concluído (22/08/26)**: merge do **D34** (PR #420, `737a9c0`).
3. **D36**: Faixa de alerta urgente de recusa na UI (`faixa-trial.tsx` / `/assinatura`).
4. **D39**: Persistência do código cru de recusas G6 em `billing_cycle.recusa_codigo`.
5. **D57**: Checagem operacional (billing pago ativo, escopo do DPA para Gemini API standalone, Art. 33 LGPD) antes de comutar `EXTRACTION_LLM_ENABLED=true`.
6. ✅ **Concluído (22/08/26)**: `RESEND_WEBHOOK_SECRET` publicado no Easypanel (iris-app) e endpoint `https://irisclinica.ia.br/api/webhooks/resend` cadastrado no painel do Resend (eventos `email.bounced` e `email.complained`).
7. **Dívida residual aceita (não bloqueia)**: os lookups unitários `taxonomiaDoProtocolo`, `criterioDominioDaMeta` e `lerCandidaturaGoalAtual` seguem no contrato `MaterializarQueries` sem chamador em produção — mantidos de propósito, como o `tipoEstruturaDoMarco` desde a #316, porque os testes asseriam `not.toHaveBeenCalled()` sobre eles (é o oráculo que prova que o N+1 não voltou).
