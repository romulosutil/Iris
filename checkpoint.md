# Checkpoint — Estado Atual do Repositório Iris

**Data**: 22/08/2026
**Status**: `main` verde e estável; PR #416 (D54) com conflitos resolvidos e revalidada.
**Últimas PRs mergeadas em `main`**: #412 (D52), #413 (D53), #414 (D47), #415 (#328)

---

## 1. Estado de Entrega & Merge em `main`

- ✅ **Feature #407 (PR #408 — `96044e1`)**: Anamnese estruturada como marco 0 da linha do tempo (34/34 tasks por SDD).
- ✅ **Feature #409 (PR #410 — `498d335`)**: Ponto de entrada da aba "Anamnese" no prontuário, condicionada a `protocol_driven`.
- ✅ **Navegação & Dashboards (PR #411 — `44de0fa`)**: Sub-navegação de `/clinica` com `TabsNav` e atalhos para PEI/protocolos (fecha **D31**).
- ✅ **D52 (PR #412 — `2fdd318`)**: Guardrail de ambiente fail-closed em todos os scripts de seed (`scripts/lib/guardrail-seed.ts`, `ALLOW_SEED_REMOTE`).
- ✅ **D53 (PR #413 — `48643c9`)**: Guardrail estático + workflow de CI contra injeção de script de preview em `src/app/layout.tsx`.
- ✅ **D47 (PR #414 — `b50f432`)**: Sincronização de fixtures e contrato documental do modo convencional, com guard executável contra re-drift.
- ✅ **#328 (PR #415 — `e676834`)**: Perímetro comportamental do `config.matcher` do proxy, avaliado com o `getPathMatch` do próprio Next.js.

---

## 2. PRs Abertas Aguardando Revisão e Merge

| PR       | Branch                        | Escopo / Débito                                                                        | Estado                                                                     |
| :------- | :---------------------------- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **#416** | `fix/d54-alert-side-stripe`   | **D54**: remoção da side-stripe `border-l-[4px]` e das bordas assimétricas do `Alert`. | Conflitos com `main` resolvidos, revalidada em sandbox, pronta para merge. |
| **#417** | `fix/330-n-plus-1-...`        | **D40 / #330**: eliminação de 3 N+1 em `materializarSnapshot`.                         | Em andamento (worktree local).                                             |
| **#418** | `feat/383-resend-webhook-...` | **#383**: webhook do Resend para log de bounces/complaints.                            | Em andamento (branch local `feat/383-resend-webhook-bounces-complaints`).  |

---

## 3. Arcabouço Jurídico & Governança LGPD (`docs/legal/`)

Revisão jurídica consolidada em `docs/legal/revisao-juridica-2026-08-21.md`.

- ✅ **Remoção de Risco RAG/Treinamento**: menção a RAG/treinamento removida de `pesquisa-planos-de-saude-prontuario.md` §4.
- ✅ **Teste de Proporcionalidade**: `docs/legal/teste-proporcionalidade-legitimo-interesse-antifraude.md` produzido (Art. 10 LGPD, `cpf_hash`).
- ✅ **Gate D-H (Consentimento / Anamnese)**: finalizado (Tutela da Saúde Art. 11, II, "f" + Consentimento do Menor Art. 14, §1º).
- ⚠️ **Provedor de IA (Gemini) — decidido, NÃO commitado.** A decisão de 21/08 é nomear **Google (Gemini API)** na Política de Privacidade §4 e nos termos de consentimento, mas `docs/legal/politica-privacidade.md` segue na versão `2026-08-07`, **sem nenhuma menção a Gemini** (medido: `grep -c Gemini` = 0 em `main`). A edição existe apenas na árvore de trabalho local, não commitada. Alterar `docs/legal/` exige autorização explícita do Rômulo (`CLAUDE.md` § Permissões).
- ⚠️ **Débitos legais mapeados**: **D55** (`visibility_level`, sigilo multidisciplinar), **D56** (`e_psi_verified`/`e_psi_number`, Res. CFP 009/2024) e **D57** (gating operacional do Gemini: billing pago ativo + escopo do DPA + Art. 33 LGPD antes de ligar `EXTRACTION_LLM_ENABLED`).

---

## 4. Verificação da Base (`fix/d54-alert-side-stripe` já com `main` mergeada)

| Gate                                | Resultado                                                                                   |
| :---------------------------------- | :------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                    | 0 erros                                                                                     |
| `pnpm lint`                         | 0 erros (9 warnings pré-existentes: Storybook `no-redundant-story-name` e `<a>` na landing) |
| `pnpm test`                         | **245/245 arquivos · 1.773/1.773 testes verdes**                                            |
| `pnpm build`                        | Build Next.js concluído com sucesso                                                         |
| Mutação em `alert.tsx`              | 2 mutantes mortos (reintroduzir `border-l-[4px]` → 9 testes caem; borda uniforme → 7 caem)  |
| Diff de `docs/GO_LIVE.md` vs `main` | Aditivo: **0 linhas removidas**                                                             |

---

## 5. Próximos Passos Recomendados

1. Merge da PR **#416** (D54).
2. Concluir **#417** (D40 / #330 — N+1 em `materializar.ts`) e **#418** (#383 — webhook Resend).
3. **D34**: `audit_log` atômico no corte por inadimplência (`scripts/fechamento-ciclo-billing.mjs`).
4. **D57**: com autorização do Rômulo, commitar a nomeação do provedor de IA em `docs/legal/` e só então reativar os testes que exigem `Google (Gemini API)` / `EXTRACTION_LLM_ENABLED` (revertidos na revisão da PR #416 por afirmarem conteúdo inexistente no repositório).
5. Cadastrar o endpoint `https://irisclinica.ia.br/api/webhooks/resend` no painel do Resend (eventos `email.bounced` e `email.complained`) quando a #383 for mergeada.
