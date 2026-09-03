# Cadeia de suporte por etapa na camada `evidence` — Especificação

> Issue [#558](https://github.com/romulosutil/Iris/issues/558) · Achado `PR-04` da auditoria 360 (`docs/produto/auditoria-360-relatorio-2026-09-01.md:290`) · Prioridade `P2 · Esforço M` · Modalidade: `protocol_driven` apenas.
>
> **Áreas cinzentas FECHADAS** (ratificadas pelo Rômulo em 03/09/2026): [`context.md`](./context.md) — G-1 (a), G-2 (a), G-3 (a), G-4 (b), G-5 (a), G-6 (a). Spec liberada para gerar `tasks.md` e a issue para receber a label `jules` (`AGENTS.md` §5.2).
>
> Todas as citações `arquivo:linha` foram medidas em 03/09/2026 sobre `main@07fc7b11`.

## Correção de premissa (ler antes de tudo)

O título da issue, do achado e do prompt da auditoria dizem **"cadeia de suporte por percentual"**. Medido no contrato do agente: **não existe percentual algum**.

`docs/agente/output-schema.json:97-112` define `cadeia` como:

```json
{
  "nome": "string",
  "etapas": [{ "descricao": "string", "nivel_ajuda": "string" }]
}
```

O Zod espelha exatamente isso (`src/lib/extraction/agent-output-schema.ts:83-92`), a regra R9 do agente diz "cadeia com nível de ajuda **POR ETAPA**" (`docs/agente/system-instructions.md:61-62`), e `grep percentual src/` não devolve um único hit ligado a cadeia — os 20 hits são cobertura de equipe e fixtures de `criterio_dominio`.

O "percentual" da auditoria é a **barra empilhada** já existente na tela (`BarraProgressoEpistemica`), não um dado do agente. Portanto esta feature é **cadeia por nível de ajuda por etapa**. Onde a issue diz percentual, leia `nivel_ajuda`.

## Problem Statement

`inserirEvidenciasOnApprove` retorna cedo em `src/app/(app)/revisao/[sessionId]/logic.ts:217`:

```ts
if (row.subtipo !== "evidencia") return;
```

Só o subtipo `evidencia` gera linha em `evidence`. Uma extração `cadeia` **aprovada** vive apenas em `extraction.payload` e é renderizada como texto solto em `revisao/[sessionId]/resumo.ts:103-114` (`Etapa 1: lavar as mãos (ajuda física parcial)`). O mesmo corte está no backfill (`scripts/backfill-evidence.ts:146-148`).

Consequência medida: rotinas de vida diária ABLLS-R/AFLS — o objeto clínico central da modalidade `protocol_driven` — não existem para o hexágono, para a segmentação, nem para o repertório. É a régua "o dado existe, a entrega não": o terapeuta descreve a cadeia, o coordenador aprova, e nenhuma superfície de evolução reflete.

### O bloqueio real, que a recomendação da auditoria não enxergou

A recomendação era "persistir `etapas[]` como evidências por etapa e alimentar `renderGraficoProtocolo`". Medindo o caminho inteiro, isso **não basta**, por dois motivos independentes:

1. **`cadeia` não carrega alvo.** O payload tem `nome` + `etapas`, e nada mais. Não há `dominio_id`, `goal_ref` nem `protocol_slug` — os três campos que `resolverAlvoParaFks` usa para achar `goal_id`/`milestone_id`/`protocol_id` (`logic.ts:238-292`, `src/lib/evidence/resolver.ts`). Uma linha de `evidence` criada a partir de uma etapa nasceria com as três FKs nulas.
2. **Sem `goal_id` a evidência é descartada na materialização.** `src/lib/evidence/materializar.ts:601` — `if (!e.goalId) continue; // sem grão de meta — fora do escopo`. Ou seja: mesmo persistindo as etapas, elas não entrariam em `session_snapshot`, e o hexágono continuaria idêntico. A feature seria escrita de ponta a ponta e **não mudaria um pixel**.

Além disso, `nivel_ajuda` da cadeia é **string livre do agente**, enquanto a pipeline converte nível em ordinal por `taxonomia.indexOf(nivelAjuda)` contra a taxonomia do protocolo (`materializar.ts:576-584`). Nível fora da taxonomia vira `-1`/`null` silenciosamente.

E a barra de marcos **não lê snapshot**: `renderGraficoProtocolo` (`timeline-client.tsx:578-660`) monta `estatisticasDominio` a partir de `estadoDasMetas` (`goal.estado` + `goal_candidacy`), não de `evidence` (`timeline-client.tsx:643-649`). "Alimentar `renderGraficoProtocolo`" significa mexer em estado de meta, não em snapshot.

**Conclusão**: entregar `PR-04` exige mudar o **contrato do agente** (`output-schema.json` + R9), não só a camada de persistência. Isso é decisão de produto, e é a razão de esta spec existir antes de qualquer código.

## Goals

- [ ] Uma extração `cadeia` aprovada deixa rastro estruturado e consultável, não só texto no resumo da revisão.
- [ ] Uma cadeia ancorada em uma meta ABA participa da leitura de evolução da modalidade `protocol_driven` — hexágono, repertório e o bloco de rotinas (G-3 (a) + G-4 (b)).
- [ ] Nível de ajuda de etapa que não pertence à taxonomia do protocolo é **visível como não classificado**, nunca convertido em progresso por dedução.
- [ ] A ordem das etapas é preservada e auditável (hoje é implícita no índice do array).
- [ ] Cadeia sem âncora de meta continua sendo aprovável e legível — a feature **não pode** transformar em erro um fluxo que hoje funciona.
- [ ] Nenhuma alteração no faturamento, na numeração de sessão ou na trilha de auditoria existente.

## Out of Scope

| Item                                                                | Razão                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Os outros subtipos barrados pelo mesmo early-return                 | `registro_abc`, `ausencia_comportamento`, `registro_pensamento`, `aplicacao_escala_relatada`, `tarefa_casa` caem no mesmo `logic.ts:217`. Cada um tem semântica clínica própria — issue própria. |
| `preferencia_reforcador`                                            | Já tem destino: `inserirReforcadoresOnApprove` grava em `reinforcer_profile` (`logic.ts:148-175,215`), antes do early-return.                                                                    |
| Cadeia em `cognitive_behavioral` e `conventional`                   | `capacidadesDaModalidade` (`pacientes/[id]/modalidade.ts:54-116`): `conventional` tem `temEvolucao: false`; `cognitive_behavioral` lê evolução por `tcc`. ABLLS-R/AFLS é `protocol_driven`.      |
| Reescrever `BarraProgressoEpistemica` para percentual real de etapa | A barra hoje conta metas (`total/conquistados/candidatos`), não etapas. Mudar a unidade da barra é decisão de UX separada.                                                                       |
| Backfill de cadeias já aprovadas                                    | **G-5 (a) ratificada**: linha de corte, sem backfill. Pacientes já em atendimento não ganham histórico de rotina — mesmo precedente da anamnese marco-zero.                                      |
| Editar `resumo.ts` para outro formato de texto                      | A lista de etapas atual está correta para o que é. Só muda se `G-4` pedir procedência na tela.                                                                                                   |

---

## User Stories

**US-1 — Terapeuta descreve rotina.** Como terapeuta de paciente `protocol_driven`, quando eu narro "no lanche ele abriu a lancheira sozinho, precisou de ajuda física parcial para abrir o pote e apontou o suco sem ajuda", quero que cada etapa fique registrada com seu nível de ajuda, para que a evolução da rotina apareça sessão a sessão em vez de virar texto perdido no histórico da revisão.

**US-2 — Coordenador aprova com consciência do destino.** Como coordenador, ao aprovar uma extração `cadeia`, quero saber se ela vai alimentar a evolução ou ficar só na trilha, para não supor que aprovei um dado que o gráfico ignora.

**US-3 — Coordenador lê a evolução.** Como coordenador, quero que a cadeia ancorada numa meta apareça na leitura de evolução do paciente com a mesma régua das demais evidências, para comparar rotinas com marcos.

**US-4 — Ninguém é enganado por nível desconhecido.** Como coordenador, se o agente escreveu um nível de ajuda que não existe na taxonomia do protocolo, quero ver "não classificado" explicitamente, e não um progresso inventado nem um silêncio.

---

## Requirements

Todas as decisões de `context.md` estão ratificadas (03/09/2026) e aparecem inline no requisito que elas determinam.

### R1 · Contrato do agente

- **R1.1** `docs/agente/output-schema.json` e o Zod `cadeiaSchema` (`agent-output-schema.ts:83-92`) passam a permitir que a cadeia declare seu alvo, com os mesmos campos crus que os demais subtipos usam (`dominio_id`, `goal_ref`, `protocol_slug`). **G-1 (a) ratificada**: a âncora é **única, no nível da cadeia** (`cadeia.dominio_id` / `goal_ref` / `protocol_slug`), coerente com a regra R8. Rotina que cruze domínios é expressa como duas cadeias — não há âncora por etapa.
- **R1.2** Os campos de âncora são **opcionais**. Cadeia sem âncora continua válida, aprovável e legível (US-1 não pode quebrar).
- **R1.3** A regra R9 de `docs/agente/system-instructions.md` é reescrita para instruir a ancoragem, mantendo a proibição de inventar alvo quando o texto não permite inferir.
- **R1.4** A ordem das etapas continua sendo o **índice do array** — `G-2` resolvida por medição: o diálogo de edição (`revisao-lista.tsx:195-244`, `actions.ts:113-117`) só sobrepõe `funcao`/`nivel_ajuda`/`resultado` na raiz e nunca toca `etapas[]`, então os índices não deslizam. Se a edição de etapa vier a existir, esta decisão é revisitada e o contrato ganha campo `ordem`.
- **R1.5** A versão do prompt (`extraction.prompt_versao`) é incrementada, e o schema versionado — extrações antigas continuam validando.

### R2 · Persistência

- **R2.1** `inserirEvidenciasOnApprove` deixa de descartar `cadeia`. O early-return de `logic.ts:217` passa a discriminar por subtipo com destino, não por igualdade a `"evidencia"`.
- **R2.2** **G-3 (a) ratificada**: cada etapa aprovada vira **uma linha em `evidence`** — sem tabela nova. `alvo_ordinal` = índice da etapa, e a constraint `uq_evidence_alvo (extraction_id, alvo_ordinal)` (`schema.ts:1401-1413`) é o discriminador de idempotência. A dupla semântica de `alvo_ordinal` (alvo de evidência × etapa de rotina) é registrada em comentário no `schema.ts` e desambiguada pelo subtipo dentro de `classificacao_original`.
- **R2.3** A inserção é idempotente sob reaprovação (`onConflictDoNothing` no mesmo par), como a de `evidencia`.
- **R2.4** A escrita acontece **dentro da transação e do advisory lock já abertos** (`logic.ts:202-204`), antes de `materializarSnapshot` (`logic.ts:299`), para que a materialização enxergue as etapas na mesma imagem do banco.
- **R2.5** Cadeia sem âncora resolvível **não é erro**: grava com FKs nulas e fica fora da materialização, exatamente como hoje — o comportamento novo é aditivo. A UI diz isso (R4.2).
- **R2.6** Nenhuma migração pode alterar tabela existente sem `GRANT` explícito por coluna, nem escrever policy que resolva tenant com `current_setting('app.clinic_id')` cru — usar `app_clinic_id_exigido()`. Se a decisão `G-3` criar tabela nova, ela nasce com RLS, `FORCE RLS`, policy `TO app_role` e grants por coluna. Próxima migração: `idx 152`, `when 1788190235804` (último: `0151_session_sob_sigilo_guard_tenant`).

### R3 · Leitura de evolução

- **R3.1** Uma etapa com âncora resolvida a `goal_id` entra na materialização de `session_snapshot` pela mesma porta das demais evidências (`materializar.ts:601`) — consequência direta de G-3 (a): nada na pipeline precisa ser reescrito.
- **R3.2** **G-6 (a) ratificada**: `nivel_ajuda` de etapa é convertido a ordinal pela taxonomia do protocolo (`materializar.ts:576-584`). Valor fora da taxonomia **não** vira `0` nem progresso — a etapa conta como **não classificada** e a contagem é **exibida**, não só registrada. Enum global de nível foi descartado: a taxonomia é por protocolo.
- **R3.3** Etapa sem âncora nunca aparece no hexágono. Ausência de dado é `null` na tela, nunca `0` — regra herdada da spec de anamnese marco-zero.
- **R3.4** **G-4 (b) ratificada**: além do hexágono, a aba Evolução ganha um **bloco próprio de rotinas** (etapa a etapa ao longo das sessões). A barra de marcos (`renderGraficoProtocolo`, `timeline-client.tsx:578-660`) continua contando **metas** — cadeia nunca é somada aos marcos. O bloco de rotinas é entrega **separável**: R2 e R3.1 podem mergear antes dele.

### R4 · Superfície

- **R4.1** O resumo da revisão (`resumo.ts:103-114`) mostra a âncora quando existir, com procedência visível (quem/qual meta), no vocabulário do design system — sem paleta crua, sem cor sozinha carregando significado.
- **R4.2** Quando a cadeia **não** tem âncora, a tela diz em texto que ela ficará na trilha e fora da evolução. Nunca deixar o coordenador supor o contrário (US-2).
- **R4.3** Erro de leitura em qualquer superfície nova renderiza estado de erro, **nunca** estado vazio — `catch { setState(null) }` que vira afirmação clínica falsa é proibido.
- **R4.4** Nenhum `console.*` com `err.message` de driver. Usar o helper PII-safe (`src/lib/observabilidade/logar-erro.ts`), com `name` + código PG + id de correlação.

### R5 · Prova

- **R5.1** Teste que **falha contra o código atual**: aprovar extração `cadeia` com âncora gera N linhas persistidas (hoje gera zero, por `logic.ts:217`).
- **R5.2** Int-test de materialização: paciente com cadeia ancorada tem `session_snapshot` diferente do mesmo paciente sem ela. Este é o teste que prova que a feature **muda um pixel** — sem ele, R2 pode estar inteiro e o produto inalterado.
- **R5.3** Int-test cross-tenant: cadeia de outra clínica não aparece. **Cuidado**: o oráculo não pode codificar "invisível pela policy = inexistente" (memo R-1 da revisão de admissão).
- **R5.4** Teste por papel: `coordenador`, `terapeuta` na equipe, `terapeuta` fora da equipe, `admin_recepcao` — quem vê o quê na superfície nova. Buraco pelo qual a #512 passou.
- **R5.5** Caso negativo explícito: nível de ajuda fora da taxonomia → não classificado, não progresso (R3.2).
- **R5.6** Caso de reaprovação: aprovar duas vezes não duplica etapa (R2.3).
- **R5.7** **Mutação registrada na PR**: reverter a remoção do early-return derruba R5.1; reverter o guard de taxonomia derruba R5.5. Mutar o código de produção, não o helper de teste.
- **R5.8** Se `G-3` criar função `SECURITY DEFINER`, ela entra em `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts`) com caso negativo cross-tenant. O oráculo é allowlist positiva — definer novo fora dele passa despercebido (achado `Q-05`).

---

## Riscos herdados

| Risco                                                                        | Origem                                                                                         | Mitigação nesta spec                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Feature implementada inteira sem mudar nenhuma superfície                    | `materializar.ts:601` descarta evidência sem `goal_id`                                         | R5.2 é o teste que reprova esse desfecho                          |
| Contrato do agente muda e extrações antigas param de validar                 | `extraction.payload` tem duas formas históricas (FLAT desde a D57, aninhada antes — #553/#569) | R1.2 + R1.5; ler sempre pelo helper `conteudo-subtipo.ts:48-61`   |
| Nível de ajuda livre convertido em progresso falso                           | `taxonomia.indexOf()` devolve `-1` em silêncio                                                 | R3.2 + R5.5                                                       |
| Executor implementa o título da issue ("percentual") em vez do contrato real | Divergência medida na "Correção de premissa"                                                   | A correção abre a spec; a issue deve ser corrigida antes da label |
| Definer novo para baratear a leitura, sem guard de tenant                    | Padrão `Q-05` / `S-02`                                                                         | R5.8                                                              |

---

## Definição de pronto

- [x] As 6 decisões de `context.md` fechadas e ratificadas **na própria spec** (03/09/2026).
- [ ] Título e corpo da issue #558 corrigidos: "por etapa / nível de ajuda", não "por percentual".
- [ ] R1–R5 implementados conforme as decisões ratificadas (G-1 a, G-2 a, G-3 a, G-4 b, G-5 a, G-6 a).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` verdes — com a contagem de testes conferida (`vitest run` em `*.int.test.ts` coleta zero sem `--config vitest.integration.config.ts`).
- [ ] Migração (se houver) com entrada manual em `_journal.json`, `when` = anterior + 1000, e verificação **medindo** no Postgres (`information_schema`, `pg_proc`, `pg_policies`) — `git log` não prova execução.
- [ ] Mutação de R5.7 registrada na descrição da PR.
