# Cadeia de suporte por etapa — tarefas

> Deriva de [`spec.md`](./spec.md) (R1–R5) e das 6 decisões ratificadas em [`context.md`](./context.md).
> Fronteira de atomização: **onde um revisor rejeitaria uma e aprovaria a vizinha**.
>
> **Sem migração.** Medido: `evidence` já tem todas as colunas necessárias — `extraction_id`, `patient_id`, `session_id`, `session_numero`, `alvo_ordinal`, `classificacao_original`, `aprovado_por` são `NOT NULL` e todas disponíveis no ponto de inserção; `protocol_slug`, `dominio_id`, `goal_ref`, `protocol_id`, `goal_id`, `milestone_id` são nulláveis (`src/db/schema.ts:1367-1414`). G-3 (a) escolheu linha em `evidence`, não tabela nova. Logo: nenhum `.sql`, nenhum `_journal.json`, nenhum snapshot. Se alguma task acabar exigindo DDL, **pare** — a premissa quebrou e a decisão precisa ser revisitada.

## Ordem e paralelismo

```
T1 ──> T2 ──> T3 ──> T4        (núcleo, sequencial, uma PR)
                └──> T5        (bloco de rotinas, PR própria)
T6                             (independente, PR própria)
```

`T1..T4` são uma PR só: separá-las produziria PRs que não passam no próprio teste (T2 sem T1 não tem âncora para ler; T3 sem T2 não tem linha para materializar). `T5` e `T6` são PRs próprias.

---

## T1 · Âncora opcional no contrato do agente

- **O quê**: `cadeia` passa a aceitar os campos de alvo que os demais subtipos já usam.
- **Onde**: `docs/agente/output-schema.json:97-112`; `src/lib/extraction/agent-output-schema.ts:83-92`; regra R9 em `docs/agente/system-instructions.md:61-62` e o espelho em `src/lib/extraction/prompt.ts:186-187`; versão em `extraction.prompt_versao`.
- **Reusa**: a forma de alvo já existente nos outros subtipos (`dominio_id`, `goal_ref`, `protocol_slug`).
- **Decisão que governa**: **G-1 (a)** — âncora **única, no nível da cadeia**. Não há âncora por etapa. Rotina que cruze domínios é expressa como duas cadeias.
- **Pronto quando**: os campos são **opcionais** (R1.2 — cadeia sem âncora continua válida e aprovável); o schema versionado valida extração antiga sem âncora; R9 instrui a ancorar **sem** inventar alvo quando o texto não permite inferir.
- **Testes**: payload antigo (sem âncora) valida; payload novo (com âncora) valida; âncora malformada é rejeitada.
- **Gate**: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## T2 · Persistir cada etapa como linha em `evidence`

- **O quê**: remover o descarte de `cadeia` e gravar uma linha por etapa.
- **Onde**: `src/app/(app)/revisao/[sessionId]/logic.ts:217` (o `if (row.subtipo !== "evidencia") return;`) e o corpo de `inserirEvidenciasOnApprove` (`:177-308`).
- **Reusa**: `conteudoDoSubtipo` (`src/lib/extraction/conteudo-subtipo.ts:48-61`) para ler payload FLAT **ou** aninhado — nunca alcançar a chave à mão; `resolverAlvoParaFks` (`src/lib/evidence/resolver.ts`) para a âncora; o `onConflictDoNothing` já usado para `evidencia`.
- **Decisões que governam**: **G-3 (a)** linha em `evidence`; **G-2 (a)** `alvo_ordinal` = índice da etapa no array.
- **Pronto quando**:
  - o early-return discrimina por "subtipo com destino", não por igualdade a `"evidencia"`;
  - cada etapa vira uma linha, `alvo_ordinal` = índice, idempotente sob reaprovação via `uq_evidence_alvo`;
  - a escrita acontece **dentro** da transação e do advisory lock já abertos (`:202-204`), **antes** de `materializarSnapshot` (`:299`);
  - **cadeia sem âncora não é erro** (R2.5): grava com FKs nulas e fica fora da materialização, como hoje;
  - comentário no `src/db/schema.ts` registra a dupla semântica de `alvo_ordinal` (alvo de evidência × etapa de rotina), desambiguada pelo subtipo dentro de `classificacao_original`.
- **Testes**: N etapas → N linhas (hoje: zero); reaprovar não duplica; cadeia sem âncora grava com FK nula sem lançar; payload FLAT e aninhado produzem o mesmo resultado.
- **Gate**: `pnpm test` + os int-tests de `revisao/[sessionId]/`.

## T3 · Provar que a tela muda (a task que decide a feature)

- **O quê**: int-test de materialização.
- **Onde**: `src/lib/evidence/materializar.ts:601` é o ponto que descarta evidência sem `goal_id` — nada ali deve precisar mudar; a etapa ancorada entra pela porta existente.
- **Pronto quando**: existe um int-test em que o **mesmo** paciente, com e sem uma cadeia ancorada, produz `session_snapshot` **diferente**.
- **Por que esta task é separada e obrigatória**: sem ela, T1+T2 podem estar inteiras e o produto inalterado — foi exatamente o desfecho que a análise da spec previu ("feature escrita de ponta a ponta e não muda um pixel"). Se este teste não ficar verde, **T2 não está pronta**, por mais que suas próprias asserções passem.
- **Testes**: o descrito; mais cross-tenant (cadeia de outra clínica não aparece) — **cuidado**: o oráculo não pode codificar "invisível pela policy = inexistente" (memo R-1).
- **Gate**: `pnpm test` com a config de integração (`--config vitest.integration.config.ts`; sem ela `vitest run` em `*.int.test.ts` coleta **zero** — confira a contagem).

## T4 · Nível de ajuda fora da taxonomia

- **O quê**: etapa cujo `nivel_ajuda` não pertence à taxonomia do protocolo conta como **não classificada** e a contagem é **exibida**.
- **Onde**: conversão em `materializar.ts:576-584` (`taxonomia.indexOf()` devolve `-1`); contagem `naoClassificados` já existe em `computarDadosEspectro` (`src/lib/evidence/espectro.ts:220-283`).
- **Decisão que governa**: **G-6 (a)**. Enum global foi descartado — a taxonomia é **por protocolo**.
- **Pronto quando**: `-1` nunca vira `0` nem progresso; a contagem aparece em tela (registrar sem exibir devolve o silêncio por outra porta).
- **Testes**: caso negativo explícito — nível desconhecido não produz progresso e **aparece** na contagem.
- **Gate**: `pnpm test`.

## T5 · Bloco de rotinas na aba Evolução — PR PRÓPRIA

- **O quê**: superfície que mostra a rotina **como rotina**, etapa a etapa ao longo das sessões.
- **Onde**: aba Evolução. `renderGraficoProtocolo` (`src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx:578-660`) **continua contando metas** — cadeia nunca é somada aos marcos.
- **Decisão que governa**: **G-4 (b)**.
- **Depende de**: T3 verde.
- **Pronto quando**: bloco no design system, com rótulo textual (nunca cor sozinha carregando significado); erro de leitura renderiza **estado de erro**, nunca estado vazio (`catch { setState(null) }` vira afirmação clínica falsa e é proibido); story no Storybook.
- **Testes**: teste de componente por papel (`coordenador`, `terapeuta` na equipe, `terapeuta` fora, `admin_recepcao`) afirmando **qual** gesto/conteúdo aparece — o buraco pelo qual a #512 passou.
- **Gate**: `pnpm typecheck`, `pnpm lint`, `pnpm test`, Storybook sem erro.

## T6 · Procedência da âncora na revisão — PR PRÓPRIA

- **O quê**: o resumo da revisão mostra a âncora quando existir; quando **não** existir, diz em texto que a cadeia ficará na trilha e **fora** da evolução.
- **Onde**: `src/app/(app)/revisao/[sessionId]/resumo.ts:103-114`.
- **Decisão que governa**: R4.1/R4.2 — o coordenador nunca deve supor que aprovou dado que o gráfico ignora.
- **Conflito conhecido**: a issue **#582** trabalha em `revisao/[sessionId]/actions.ts` e `revisao-lista.tsx`. `resumo.ts` é território desta task. Rebasear antes de abrir.
- **Testes**: com âncora mostra procedência; sem âncora mostra o aviso.
- **Gate**: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

---

## Fora de escopo (registrado, não feito)

| Item                                                                   | Razão                                                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backfill de cadeias já aprovadas                                       | **G-5 (a)**: linha de corte. Precedente da anamnese marco-zero.                                                                                      |
| Edição etapa a etapa da cadeia                                         | Feature própria. O que #582 entrega é **parar de mentir**, não passar a editar tudo.                                                                 |
| Os demais subtipos barrados pelo mesmo early-return                    | `registro_abc`, `ausencia_comportamento`, `registro_pensamento`, `aplicacao_escala_relatada`, `tarefa_casa` — cada um com semântica clínica própria. |
| Mudar a unidade da `BarraProgressoEpistemica` para percentual de etapa | Decisão de UX separada; a barra conta metas.                                                                                                         |

## Riscos a vigiar durante a execução

- **`SECURITY DEFINER` novo**: se alguém criar um para baratear leitura, ele **precisa** entrar em `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts`) com caso negativo cross-tenant — o oráculo é allowlist positiva e não acusa o que fica de fora (achado `Q-05`).
- **Log com PII**: nada de `console.*` com `err.message` de driver. Usar `src/lib/observabilidade/logar-erro.ts`.
- **Contagem de int-test**: `vitest run` em `*.int.test.ts` sem `--config vitest.integration.config.ts` coleta zero e passa verde.
