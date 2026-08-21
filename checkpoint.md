# Checkpoint — Feature #407 (Anamnese como marco 0 da linha do tempo)

**Data**: 20/08/2026 · **Branch**: `feat/ajuste-menus-navegacao-e-permissoes` · **Plano**: `.specs/features/407-anamnese-marco-zero/tasks.md` (34 tasks)
**Método**: `superpowers:subagent-driven-development` — um subagente implementador por task, revisão de task (spec + qualidade) por subagente separado após cada uma, adjudicação do controlador entre os dois.
**Ledger vivo** (recuperação após compactação ou `/clear`): `.superpowers/sdd/tasks/progress.md`. Confie nele e no `git log`, não em memória de conversa.
**Modelo desta sessão**: implementadores `haiku` (mecânico, spec fechada no brief), revisores `sonnet`. Correção ao checkpoint anterior: a skill `subagent-driven-development` **proíbe dispatch paralelo de implementadores** ("Never dispatch multiple implementation subagents in parallel — conflicts"), mesmo para tasks `[P]` independentes em arquivos diferentes — só a revisão/fix-loop de tasks distintas pode sobrepor. T06 e T07 rodaram sequenciais, não em paralelo.

---

## O que foi feito

| Task | Commit    | Estado                                                                                                                                                                          |
| ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | `a7e764f` | Resíduo do Task 5 do plano de Evolução: timeline legível a 360px. Commitado à parte para a BASE do #407 ficar limpa.                                                            |
| T01  | `9a3ca90` | Tabelas `anamnese` + `anamnese_alvo`, migração `0115`. Revisão limpa de primeira.                                                                                              |
| T02  | `4da8f56` | Suíte RLS vermelha `anamnese-rls.int.test.ts`, 9 testes. 1 fix round (2 Important + 1 Minor), depois limpa.                                                                     |
| T03  | `230729d` | GRANTs de coluna, RLS, 8 policies, helper `app_anamnese_em_rascunho` na `0115`. **Revisado nesta sessão: clean pass**, 8/8 itens medidos contra banco resetado do zero.         |
| T04  | `9bfd734` | Teste vermelho do definer `app_validar_anamnese`, 8 casos. 1 fix round Critical (assercao de erro batia `DrizzleQueryError.message` em vez de `.cause` — ficaria vermelho para sempre). Depois limpa. |
| T05  | `c38acff` | Implementado `app_validar_anamnese`. **Task mais perigosa do plano — revisada nesta sessão: clean pass**, 13/13 itens medidos, incluindo a direção do merge jsonb (`EXCLUDED.repertorio_state \|\| session_snapshot.repertorio_state`, existente vence) e `gerado_em` preservado. |

| T06  | `da46e49` | `OrigemDesarquivamento` ganha `"validacao_anamnese"`. Review: Spec ✅, 1 Minor (brief tinha gate errado — comando default exclui `.int.test.ts`; controlador rodou com `--config vitest.integration.config.ts`, 7/7 verde real). |
| T07  | `7c93653` | Módulo puro `rotulos.ts` (`ROTULO_MARCO_ZERO`, `rotuloPonto`, `rotuloPontoCurto`, `rotuloDesde`, `rotuloAte`). Review: Spec ✅ (sem `"use client"` confirmado, copy idêntica confirmada por grep contra `timeline-client.tsx`/`grafico-espectro.tsx`), 2 Minor deferidos (teste de regressão redundante; `prettier --write` em vez de `pnpm format` literal). Gate confirmado pelo controlador: 28/28 verde. |

| T08  | `4cc63cc`+`3a619e7`+`51006be` | Schemas Zod (`PROCEDENCIAS`, `EIXOS_ANAMNESE`, `alvoSchema`, `salvarRascunhoSchema`, `validarAnamneseSchema`) + teste. 1 fix round (2 Important: teste vácuo undefined→null sem assert, `disciplina` duplicado em vez de importar `DISCIPLINAS`), depois limpa. **Achado Critical fora do escopo do arquivo, corrigido pelo controlador**: CHECK `anamnese_alvo_eixo_valido` da migração `0115` usava vocabulário de eixo errado (`interacao_social`/`autonomia`/`regulacao`/`cognicao_academico`), divergente de `ORDEM_EIXOS`/hexágono — spec confirma que são os mesmos 6 eixos. Corrigido, verificado com reset completo do banco local + `pnpm test:rls` (1042/1043, única falha é a MFA pré-existente). |

**Progresso: 8 de 34 tasks completas e revisadas** (T01-T08). Fase 0 fechada. Fase 1 em andamento.

### Medido, não presumido (T03/T05, revisado nesta sessão)

- T03: `information_schema.role_column_grants` — exatos 4 UPDATEs de coluna em `anamnese`, zero em `estado`/`validada_em`/`validada_por` (via `has_column_privilege`). `pg_proc` do helper sem cast cru de `clinic_id`. `pg_policies` com 8 rows, UPDATE/DELETE carregando `estado = 'rascunho'` no predicado literal.
- T05: `pg_proc.prosecdef = t`. SQL do `ON CONFLICT DO UPDATE` lido literalmente (não só o relato do implementador) — `EXCLUDED` à esquerda, `session_snapshot` à direita no `||`, `gerado_em = session_snapshot.gerado_em` (nunca `now()`). Testes T04 casos 5/6/7 (reentrância byte-idêntica, eixo novo entra, eixo existente mantém valor antigo) rodaram verdes contra essa implementação.
- Ambas as revisões resetaram o banco local do zero (`DROP SCHEMA public/drizzle CASCADE` + `pnpm db:migrate`) antes de medir — editar migração já aplicada não re-roda (`editar-migracao-aplicada-nao-roda`), então medir sem reset dá falso negativo ou falso positivo.
- `pnpm test:rls`: baseline estável em 112/113 arquivos, 1041-1042/1042 testes, com a única falha sendo `tenant-status-routing.int.test.ts` (redirect de MFA), pré-existente, causada por `BYPASS_MFA_FOR_DEV=true` no `.env` local, confirmada não-relacionada por isolamento de teste e por diff de escopo (T03 e T05 não tocam `src/auth/`).

---

## Decisões tomadas nesta sessão (rulings do controlador)

Herdadas da sessão anterior (não mudam código nesta sessão, só reafirmadas):

1. Gate de taxonomia é `array_length(taxonomia_ajuda,1) >= 2` — aplicado literalmente no guard do T05.
2. Contagem de `Sessão {n}` em prosa é 18 sites, não 13 — ainda não chegou a T27.
3. Grep de verificação do T27 é defeituoso — ainda não chegou a T27.
4. T03/T05 emendam a `0115` já aplicada localmente — correto para a branch, exige reset do banco local a cada revisão. **Confirmado funcionando duas vezes nesta sessão.**

Novas desta sessão (T08):

7. **`EIXOS_ANAMNESE = ORDEM_EIXOS` (T08) era o certo; o CHECK da migração `0115` estava errado, não o Zod.** O brief presumiu (corretamente, confirmado pela spec) que os 6 eixos da anamnese são os mesmos do hexágono do espectro. A migração `0115` (T01, já revisada e "clean" em sessão anterior) tinha vocabulário próprio (`interacao_social`/`autonomia`/`regulacao`/`cognicao_academico`) que nenhuma outra parte do repo referenciava (grep confirmou ponto único). Corrigido em commit separado `51006be`, fora do diff do implementador de T08 — controlador não deve consertar o próprio diff da task, mas isso era um defeito de task ANTERIOR (T01) que só a revisão de T08 revelou. Verificado por reset completo do banco local (`DROP SCHEMA ... CASCADE` com role `iris`, não `postgres` — `MIGRATION_DATABASE_URL` usa `iris`) + `pnpm test:rls`. Custo se errado: `INSERT` de alvo com eixo do hexágono estoura `23514` em prod.

Herdadas (não mudam nesta sessão):

5. **Oráculo do `clinic-id-helper-rls.int.test.ts` pode ser estendido por task, task após task, desde que nominal.** T03 subiu 56→64/16→17; T05 subiu de novo (17→18 funções, mais dois oráculos derivados `12→13`/`6→7`). Cada extensão foi adjudicada separadamente: arrays nomeados derivados de query viva contra `pg_proc`/`pg_policies`, `.length` calculado do array — não números hand-typed. Continuar tratando cada extensão como suspeita por padrão (é assim que um guard de CI é neutralizado em silêncio) e adjudicar nome a nome, não só a contagem.
6. **Revisão roda depois do commit, não antes.** T03/T04/T05 todos commitados pelo implementador, revisão em cima do commit via `review-package`. Isso é aceitável nesta branch (não mergeada, não em produção) — mas qualquer achado Critical/Important vira um commit de fix novo, nunca um `--amend`.

---

## Gate aberto — decisão do Rômulo, não do agente

**Consentimento (D-H), bloqueante antes de dado real.** Ainda aberto, sem mudança nesta sessão. `docs/legal/` continua sem ser lido — exige autorização explícita do Rômulo antes. Não bloqueia implementar T06-T34; bloqueia colocar paciente real na anamnese.

---

## Aviso: outra sessão pode escrever na mesma branch

Confirmado na sessão anterior que `e5c6d4d`/`4f38394` (outra sessão Claude) escreveram nesta branch entre T02 e T03. Nenhuma nova ocorrência detectada nesta sessão, mas o risco continua: **antes de qualquer merge, conferir o diff contra a merge-base e exigir que o resultado seja só adição** (memória `merge-sem-conflito-apaga-feature-mergeada`).

---

## O que o próximo agente faz — em ordem, uma coisa de cada vez

Fase 0 (T01-T05), o par `[P]` T06/T07 e T08 estão **fechados e revisados**. Continuar em T09.

### Passo 1 — T09 em diante

Sequencial a partir daqui salvo indicação `[P]` no brief (e mesmo `[P]`: despachar implementadores **sempre em sequência**, nunca em paralelo — regra da skill `subagent-driven-development`, não relaxar de novo). Consultar `.specs/features/407-anamnese-marco-zero/tasks.md` para ordem completa e dependências; briefs extraídos em `.superpowers/sdd/tasks/task-NN-brief.md` até T19 pelo menos — se T08 não tiver brief extraído, extrair do `tasks.md` antes de despachar.

### Os dois guardrails que nenhuma task pode relaxar (repetido da sessão anterior, ainda vale)

1. A anamnese **nunca** insere em `session`. `billing_apurar_ciclo` conta paciente ativo por `EXISTS` em `session` sem filtrar tipo/estado — uma linha em `session` cobra o cliente em silêncio. T20 é a guarda dedicada a esse invariante (ainda não chegamos lá).
2. A validação cria `goal` em estado **`ativa`**. `contaComoAlvo` exclui `rascunho`; meta em rascunho deixa o hexágono 100% nulo.

### Disciplina de sessão curta (pedido do Rômulo nesta sessão)

Sessões devem ser curtas — parar em pontos atômicos (fim de task ou par de tasks `[P]`), não acumular. Ao parar: atualizar este checkpoint + `.superpowers/sdd/tasks/progress.md`, commitar, e deixar passo a passo explícito para quem retomar (mesma estrutura deste arquivo). Não é preciso esperar a Fase 1 inteira para fazer o próximo checkpoint — parar de novo depois de T06/T07 ou depois de um punhado de tasks, o que vier primeiro.
