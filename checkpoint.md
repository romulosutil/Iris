# Checkpoint — Feature #407 (Anamnese como marco 0 da linha do tempo)

**Data**: 20/08/2026 · **Branch**: `feat/ajuste-menus-navegacao-e-permissoes` · **Plano**: `.specs/features/407-anamnese-marco-zero/tasks.md` (34 tasks)
**Método**: `superpowers:subagent-driven-development` — um subagente implementador por task, revisão de task (spec + qualidade) após cada uma, revisão ampla no fim.
**Ledger vivo** (recuperação após compactação ou `/clear`): `.superpowers/sdd/tasks/progress.md`. Confie nele e no `git log`, não em memória de conversa.

---

## O que foi feito

| Task | Commit              | Estado                                                                                                                                                                                              |
| ---- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | `a7e764f`           | Resíduo do Task 5 do plano de Evolução: timeline legível a 360px. Commitado à parte para a BASE do #407 ficar limpa.                                                                                |
| T01  | `9a3ca90`           | Tabelas `anamnese` + `anamnese_alvo` em `schema.ts`, migração `0115_anamnese_marco_zero.sql` gerada. **Revisão limpa de primeira** (Spec ✅, qualidade aprovada).                                   |
| T02  | `ad9bd9b`→`4da8f56` | Suíte RLS vermelha `db/tests/anamnese-rls.int.test.ts`. 9 testes, 8 vermelhos por `42501 permission denied` — motivo certo. 1 fix round (2 Important + 1 Minor), re-review escopada: 3/3 addressed. |
| T03  | `230729d`           | GRANTs de coluna, `ENABLE`/`FORCE RLS`, 8 policies e helper `app_anamnese_em_rascunho` na `0115`. **COMMITADO MAS NÃO REVISADO** — ver "O que o próximo agente faz".                                |

**Progresso: 2 de 34 tasks completas** (T01, T02). T03 implementado, revisão pendente.

### Medido, não presumido

- T01: 28 colunas com nullability e defaults conferidos em `information_schema`; 6 CHECKs nomeados em `pg_constraint`; ambos os `patient_id` com `confdeltype='c'` (cascade — cobre o expurgo LGPD sem editar `app_purgar_paciente`); journal `idx 115`, `when 1787100343349` (anterior + 1000); `db:generate` numa 2ª rodada responde `No schema changes`.
- T02: contagem coletada conferida (`1 arquivo, 9 testes`), nunca a cor — `*.int.test.ts` está no `exclude` do `vitest.config.ts` e, sem `--config vitest.integration.config.ts`, a rodada coleta ZERO e sai verde.

---

## Decisões tomadas nesta sessão (rulings do controlador)

Todas no ledger com o custo de estar errado. As quatro que mudam código:

1. **Gate de taxonomia é `array_length(taxonomia_ajuda,1) >= 2`, não "não vazia".** `spec.md:47` (AC4) diz "não vazia", mas a medição que a própria spec cita — `queries.ts:172` com `Math.max(0, len-1)` combinado a `espectro.ts:203-204` que exige `> 0` — implica `>= 2`. `design.md`, T05 e T12 já estavam em `>= 2`. Vence a medição. Custo se errado: paciente com taxonomia de 1 nível recebe erro nomeado em vez de hexágono vazio — conservador e reversível numa linha.
2. **A contagem "13 ocorrências de `Sessão {n}`" é falsa — são 18 sites.** As listas de linha nos docs estão completas e corretas, então T27 não fica curta; o número em prosa é que está errado. Proibido escrever contagem numérica em docblock novo. Custo se errado: nenhum.
3. **O grep de verificação do T27 é defeituoso.** `grep -rn 'Sessão {'` não casa o padrão JSX de duas linhas usado em `timeline-client.tsx:769` e `:783`. Se não for trocado, T27 sai verde com dois sites ainda renderizando "Sessão 0" — falso verde exatamente da classe registrada na memória do repo. A substituição já está escrita no ledger.
4. **T03 e T05 emendam a `0115`, que o T01 já aplicou no banco local.** Editar tag já aplicada **não re-roda** (Drizzle aplica por tag). A `0115` não foi para produção, então emendar o arquivo é correto para a branch; o que precisa acontecer é resetar o banco local, re-rodar tudo do zero e medir em `pg_policies` e `pg_proc`.

---

## Gate aberto — decisão do Rômulo, não do agente

**Consentimento (D-H), bloqueante antes de dado real.** A `spec.md` exige verificar se o termo vigente em `docs/legal/` cobre o responsável **relatando dado sobre si próprio e sobre terceiros da família** durante a entrevista de anamnese — dado pessoal de quem não assinou nada. `docs/legal/` está na lista do `CLAUDE.md` que exige confirmação do Rômulo antes de qualquer leitura, e por isso não foi aberto. **Não bloqueia implementar; bloqueia colocar paciente real na anamnese.** Se o termo não cobrir, é tipo de consentimento novo — mesma classe do gap das issues #98 e #99.

---

## Aviso: outra sessão escreveu na mesma branch

`e5c6d4d` e `4f38394` (assinados `Claude Sonnet 5`, 19:00 e 19:05) entraram na branch **entre** o T02 e o T03 desta sessão. Esvaziaram `BACKLOG.md` (3998 linhas) e o `checkpoint.md` anterior (527 linhas) para `docs/archive/historico-backlog.md`, e ajustaram cinco arquivos `*ignore`. Não conflitam com o #407, mas duas sessões escrevendo a mesma branch é a situação exata da memória `merge-sem-conflito-apaga-feature-mergeada`. Antes de qualquer merge, conferir o diff contra a merge-base e exigir que o resultado seja só adição.

---

## O que o próximo agente faz — em ordem, uma coisa de cada vez

### Passo 1 — revisar o T03. É atômico e precede tudo.

O T03 commitou `230729d` e entregou o relatório em `.superpowers/sdd/tasks/task-03-report.md` com status **DONE_WITH_CONCERNS**. **Nenhuma revisão de task rodou sobre ele.** Não trate como pronto.

O que o implementador reporta ter medido: `anamnese-rls` 9/9; `pnpm test:rls` com **112 arquivos executados, 0 pulados**, 1033 de 1034 testes passando; `meta/0115_snapshot.json` com diff vazio. A única falha restante (`tenant-status-routing.int.test.ts`, redirect de MFA) ele atribui a `BYPASS_MFA_FOR_DEV=true` no `.env` local, pré-existente e não tocada — **confirme isso em vez de aceitar**, com `git stash` do `.env` ou rodando o arquivo isolado antes e depois do `230729d`.

**O concern que a revisão tem que adjudicar antes de qualquer outra coisa:** para o guard passar, o implementador editou `db/tests/clinic-id-helper-rls.int.test.ts` — fora do escopo declarado do T03 — subindo os oráculos mantidos à mão de 56 para 64 policies e de 16 para 17 funções. Editar o oráculo de um guard de CI é precisamente como um guard é neutralizado em silêncio. A revisão precisa provar que as 8 entradas novas são exatamente as 8 policies da anamnese, e que a função nova é `app_anamnese_em_rascunho` — e não números ajustados até o teste ficar verde. Se as listas forem nominais e não apenas contagens, conferir nome a nome; se forem só contagens, isso já é um achado por si.

```
bash "C:/Users/sutil/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development/scripts/review-package" \
  ".specs/features/407-anamnese-marco-zero/tasks.md" 4da8f56 230729d
```

Despache um revisor com esse diff mais `.superpowers/sdd/tasks/task-03-brief.md` e `.superpowers/sdd/tasks/CONSTRAINTS.md`. O revisor tem que **medir**, não ler:

- `db/tests/anamnese-rls.int.test.ts` passa **9/9** — com `--config vitest.integration.config.ts`, conferindo a contagem coletada, nunca a cor.
- `db/tests/clinic-id-helper-rls.int.test.ts` verde. Ele varre `pg_policies`, `pg_proc` e `pg_views`: zero `current_setting('app.clinic_id')::uuid` cru, zero `app_clinic_id_atual()` em predicado de isolamento — **inclusive dentro do corpo do helper `app_anamnese_em_rascunho`**.
- `information_schema.role_column_grants`: os 4 UPDATEs de coluna existem e **não há** grant em `estado`, `validada_em` nem `validada_por`. É esse privilégio ausente que torna o append-only mecânico; disciplina de código não é o mecanismo.
- `pg_policies` lista as 8 policies, e as de `UPDATE` e `DELETE` carregam `estado = 'rascunho'` no predicado.
- `git diff db/migrations/meta/0115_snapshot.json` vazio.
- `pnpm test:rls` com a contagem de arquivos **executados** conferida — verde com "skipped" é vermelho disfarçado (o repo já rodou com 64 de 68 arquivos pulados em silêncio).
- O implementador realmente **resetou o banco local**? Se ele apenas rodou `pnpm db:migrate` sobre a `0115` já aplicada, as policies não existem — e todas as medições acima vão denunciar isso.

Achado Critical ou Important → fix loop retomando o implementador. Limpo → gravar `Task 03: complete (...)` no ledger.

### Passo 2 — T04

Teste vermelho do definer `app_validar_anamnese` (`.superpowers/sdd/tasks/task-04-brief.md`). Par TDD do T05, mesma mecânica de T02 e T03.

### Passo 3 — T05

Implementar `app_validar_anamnese`. É a task mais perigosa do plano: ela **não pode** reusar cegamente o `ON CONFLICT (patient_id, session_numero) DO UPDATE` de `app_aplicar_snapshot` (`0094:66-71`). Se reusar, reescrever o marco 0 vira trivial e silencioso, e todo gráfico histórico se desloca sem rastro.

Depois disso, a Fase 1 (T06 a T19) é sequencial, com T06 e T07 em paralelo. Os 34 briefs já estão extraídos em `.superpowers/sdd/tasks/`.

### Os dois guardrails que nenhuma task pode relaxar

1. A anamnese **nunca** insere em `session`. `billing_apurar_ciclo` (`0075:99-133`) marca paciente ativo por `EXISTS (SELECT 1 FROM session …)` sem filtrar `tipo`, `estado` nem `numero_sequencial_paciente`, e `session.criado_em` é `defaultNow()` — uma linha em `session` cobra o cliente em silêncio. Foi exatamente por isso que o desenho alternativo foi descartado em D-A. T20 é a guarda dedicada a esse invariante.
2. A validação cria `goal` em estado **`ativa`**. `contaComoAlvo` (`espectro.ts:208`) exclui `rascunho`; meta em rascunho deixa o hexágono 100% nulo, ou seja, feature não entregue.
