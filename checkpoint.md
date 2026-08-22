# Checkpoint — Estado Atual do Repositório Iris

**Data**: 21/08/2026  
**Status**: `main` verde, estável e equalizada  
**Últimas PRs entregues em `main`**: #408 (#407), #410 (#409), #411 (D31)

---

## 1. Estado de Entrega & Merge em `main`

- ✅ **Feature #407 (PR #408 — `96044e1`)**: Anamnese estruturada como marco 0 da linha do tempo. 34/34 tasks concluídas por SDD (`.specs/features/407-anamnese-marco-zero/`). Tabelas `anamnese` e `anamnese_alvo` (migração `0115`), procedure `app_validar_anamnese` (snapshot 0 em `session_snapshot` com merge jsonb), gates de coordenador/protocolo/teto/consentimento, scrubber/timeline lendo marco 0 e formulário no design system.
- ✅ **Feature #409 (PR #410 — `498d335`)**: Ponto de entrada da aba "Anamnese" no prontuário (`src/app/(app)/pacientes/[id]/layout.tsx`), condicionada a `protocol_driven` via `modalidade.ts`.
- ✅ **Navegação & Dashboards (PR #411 — `5adfe6f`)**: Sub-navegação de `/clinica` com `TabsNav` (`/clinica/dados`, `/clinica/feriados`, `/clinica/emergencia`), fechando **D31**. Atalhos diretos em PEI e Ficha Clínica para dashboards de progresso dos protocolos.

---

## 2. PRs Abertas Aguardando Revisão e Merge

| PR       | Branch                                        | Escopo / Débito                                                                                                                                                                             | Status                    |
| :------- | :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------ |
| **#412** | `feat/d52-guardrail-seed-ambiente`            | **Débito D52**: Guardrail em `scripts/seed.ts` e `scripts/seed-demo-account.ts` exigindo `localhost`/`127.0.0.1` ou `ALLOW_SEED_REMOTE=true`.                                               | Aberta (Ready for Review) |
| **#413** | `feat/d53-guardrail-preview-layout`           | **Débito D53**: Guardrail de teste unitário/CI (`src/app/layout.guard.test.ts`) contra injeção de `localhost:8400/live.js` em `layout.tsx`.                                                 | Aberta (Ready for Review) |
| **#414** | `fix/d47-sincronizacao-fixtures-alerta-risco` | **Débito D47**: Sincronização documental e de fixtures do modo convencional com a estrutura unificada de `alerta_risco` e `temas: string[]`.                                                | Aberta (Ready for Review) |
| **#415** | `test/328-cobertura-proxy-matcher`            | **Issue #328**: Cobertura comportamental do `config.matcher` do proxy/middleware (`src/middleware.test.ts`).                                                                                | Aberta (Ready for Review) |
| **#416** | `fix/d54-alert-side-stripe`                   | **Débito D54**: Remoção da side-stripe `border-l-[4px]` e `bordaEsquerda` no componente `Alert`, alinhando ao Espectro Brutal.                                                              | Aberta (Ready for Review) |
| **#417** | `fix/330-n-plus-1-materializar-snapshot`      | **Issue #330 / D40**: Eliminação dos 3 N+1 em `materializarSnapshot` (`taxonomiasDosProtocolos`, `criteriosDominioDasMetas`, `lerCandidaturasGoalsAtuais` em lote, gravações concorrentes). | Aberta (Ready for Review) |
| **#418** | `feat/383-resend-webhook-bounces-complaints`  | **Issue #383**: Webhook Resend de Bounce/Complaint (`/api/webhooks/resend` e alias `/api/hooks/resend`) com validação Svix e log estruturado.                                               | Aberta (Ready for Review) |

---

## 3. Arcabouço Jurídico & Governança LGPD (`docs/legal/`)

Revisão jurídica completa realizada e consolidada em `docs/legal/revisao-juridica-2026-08-21.md`.

- ✅ **Remoção de Risco RAG/Treinamento**: Removida a menção de RAG/treinamento de modelo próprio de `pesquisa-planos-de-saude-prontuario.md` §4, harmonizando o texto com `politica-privacidade.md` §6 e Art. 11 LGPD.
- ✅ **Teste de Proporcionalidade**: Produzido `docs/legal/teste-proporcionalidade-legitimo-interesse-antifraude.md` para fundamentar o legítimo interesse (Art. 10 LGPD) do hash antifraude `cpf_hash`.
- ✅ **Provedor de IA Definido**: **Google Gemini (Gemini API)** nomeado formalmente em `politica-privacidade.md` §4 e nos termos de consentimento adulto e curatela, referenciando o Cloud Data Processing Addendum (DPA) do Google Cloud.
- ✅ **Gate D-H (Consentimento / Anamnese)**: 100% finalizado. Respaldo legal validado (Tutela da Saúde Art. 11, II, "f" + Consentimento do Menor Art. 14, §1º cobrindo relato da dinâmica familiar) e gate técnico ativo via `app_prontuario_somente_leitura(patient_id)`.
- ✅ **Termos de Uso & Privacidade Atualizados**: Foro de eleição estabelecido em Guarapari/ES (§9), prazo de aviso prévio de alterações de 30 dias (§8.4), canal de contato `notificacoes@irisclinica.ia.br` e DPO informal Rômulo Sutil Corrêa (§10).
- ⚠️ **Débitos Legais Mapeados**:
  - **D55**: `visibility_level` (sigilo multidisciplinar) especificado no aditivo legal (§2.1), pendente de implementação no schema/RLS (Art. 9º CEPP).
  - **D56**: `e_psi` (declaração de registro ativo para telepsicologia, Res. CFP 009/2024) pendente no schema.
  - **D57**: Verificação do Gemini pago (billing ativo no Google Cloud, escopo do DPA para Gemini API standalone, validação do Art. 33 LGPD) antes de ativar `EXTRACTION_LLM_ENABLED=true` com pacientes reais.

---

## 4. Verificação Atual da Base (`feat/383-resend-webhook-bounces-complaints`)

| Gate                                        | Resultado                                                           |
| :------------------------------------------ | :------------------------------------------------------------------ |
| `pnpm typecheck`                            | 0 erros                                                             |
| `pnpm lint`                                 | 0 erros                                                             |
| `pnpm test`                                 | 243/243 arquivos · 1.731/1.731 testes verdes                        |
| `src/lib/email/webhook.test.ts`             | 9/9 testes unitários de verificação Svix e log verdes               |
| `src/app/api/webhooks/resend/route.test.ts` | 5/5 testes de rotas /api/webhooks/resend e /api/hooks/resend verdes |
| `pnpm format`                               | 100% formatado via Prettier                                         |

---

## 5. Próximos Passos Recomendados

1. Merge das PRs **#412**, **#413**, **#414**, **#415**, **#416**, **#417** (#330 / D40) e **#418** (#383).
2. **D34**: Adicionar `audit_log` atômico no corte por inadimplência (`scripts/fechamento-ciclo-billing.mjs`).
3. Cadastrar o endpoint `https://irisclinica.ia.br/api/webhooks/resend` no painel do Resend com eventos `email.bounced` e `email.complained`.
