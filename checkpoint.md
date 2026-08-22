# Checkpoint — Estado Atual do Repositório Iris

**Data**: 22/08/2026
**Status**: `main` verde e estável; PR #418 (#383 — webhook Resend) com conflitos resolvidos, revisada e revalidada em sandbox.
**Últimas PRs mergeadas em `main`**: #412 (D52), #413 (D53), #414 (D47), #415 (#328), #416 (D54), #417 (D40 / #330)

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

---

## 2. PRs Abertas Aguardando Revisão e Merge

| PR       | Branch                                       | Escopo / Débito                                                                                     | Estado                                                                     |
| :------- | :------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **#417** | `fix/330-n-plus-1-materializar-snapshot`     | **D40 / #330**: eliminação dos 3 N+1 restantes em `materializarSnapshot` + gravações paralelizadas. | Conflitos com `main` resolvidos, revalidada em sandbox, pronta para merge. |
| **#418** | `feat/383-resend-webhook-bounces-complaints` | **#383**: webhook do Resend para log de bounces/complaints.                                         | Em andamento (branch local).                                               |

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

## 4. Verificação da Base (`feat/383-resend-webhook-bounces-complaints` já com `main` mergeada)

Medido em worktree isolado (`.worktrees/pr418-resend`), após `git merge origin/main` e as correções da revisão tech lead:

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

1. Merge da PR **#418** (#383 — webhook Resend).
2. **D34**: `audit_log` atômico no corte por inadimplência (`scripts/fechamento-ciclo-billing.mjs`).
3. **D57**: checagem operacional (billing pago ativo, escopo do DPA para Gemini API standalone, Art. 33 LGPD) antes de comutar `EXTRACTION_LLM_ENABLED=true`.
4. ✅ **Concluído (22/08/26)**: `RESEND_WEBHOOK_SECRET` publicado no Easypanel (iris-app) e endpoint `https://irisclinica.ia.br/api/webhooks/resend` cadastrado no painel do Resend (eventos `email.bounced` e `email.complained`).
5. **Dívida residual aceita (não bloqueia)**: os lookups unitários `taxonomiaDoProtocolo`, `criterioDominioDaMeta` e `lerCandidaturaGoalAtual` seguem no contrato `MaterializarQueries` sem chamador em produção — mantidos de propósito, como o `tipoEstruturaDoMarco` desde a #316, porque os testes asseriam `not.toHaveBeenCalled()` sobre eles (é o oráculo que prova que o N+1 não voltou).
