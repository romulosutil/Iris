# Expurgo de prontuário expirado — Contexto e decisões fechadas

> Issue [#352](https://github.com/romulosutil/Iris/issues/352) · Fatia 6.3 (wiring diferido) · Prioridade `P1 · antes de dado real`
>
> **Ler antes de projetar ou implementar.** Este arquivo existe porque o corpo da issue #352 foi truncado na criação e porque o desenho toca uma operação irreversível. Nenhum ponto abaixo pode ser reaberto pelo executor: onde está escrito "travado", a decisão já foi tomada e o motivo está registrado.

---

## 0. Por que este arquivo existe

O corpo da issue #352 no GitHub está **truncado**. O conteúdo real é, literalmente:

```
## Contexto
Na migração \
```

O `\` final engoliu o resto na criação (escape de PowerShell). Medido em `gh api repos/romulosutil/Iris/issues/352 --jq '.body'`.

Consequência prática: **não existe requisito escrito na issue**. Tudo abaixo foi reconstruído medindo o repositório, não lendo a issue. A issue deve ser reescrita apontando para esta spec (Task 0).

---

## 1. Estado de partida — medido, não presumido

A Fatia 6.3 da Fase 6 **já shippou o lado SQL** (PR #68, migração `0045`, endurecida depois pela `0049` e `0094`). O que a `EXECUTION.md` da fase registra como "wiring diferido" é exatamente o escopo de #352.

| Artefato                                                      | Estado                                                    | Onde                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `app_purgar_paciente(uuid, text)`                             | Existe. Versão vigente é a da `0094`, **não** a da `0045` | `db/migrations/0094_fechar_guard_papel_identidade.sql:138`   |
| `app_paciente_expurgavel(uuid) → boolean`                     | Existe. Versão vigente é a da `0087`                      | `db/migrations/0087_tenant_helper_em_funcoes_e_view.sql:176` |
| `patient.alta_em date`                                        | Coluna existe                                             | `src/db/schema.ts:406`                                       |
| `clinic.politica_retencao_meses integer`                      | Coluna existe desde a `0000`, **nullable, sem default**   | `src/db/schema.ts:287`                                       |
| `GRANT UPDATE (alta_em, arquivado_em) ON patient TO app_role` | **Já concedido** (posterior ao `REVOKE` da `0044`)        | `db/migrations/0065_patient_arquivado_em.sql:23`             |
| Ledger de tombstones                                          | Existe, é **CSV extraído do `audit_log`**, não tabela     | `infra/backup/backup.sh:470`                                 |
| Reaplicação pós-restore                                       | Existe, chama `app_purgar_paciente`, `ON_ERROR_STOP=1`    | `infra/backup/reaplicar-tombstones.sql:92`                   |
| Rótulos de auditoria `paciente_purgado`                       | Já renderizam na trilha                                   | `src/app/(app)/clinica/auditoria/logic.ts:31`                |

**Zero código TypeScript chama qualquer uma das duas funções.** Medido: `grep -rn "app_purgar_paciente\|app_paciente_expurgavel" src/` devolve só dois comentários em `schema.ts`. Os únicos chamadores reais são `infra/backup/restore.sh` e SQL manual.

---

## 2. Os três defeitos que a issue não menciona (e que mudam o escopo)

### C1 — A regra de retenção é consultiva, não é gate

`app_purgar_paciente` **não chama** `app_paciente_expurgavel`. Medido no corpo vigente (`0094:138-211`): os únicos guards são papel `coordenador` e pertencimento à clínica.

Efeito: um coordenador — ou qualquer caminho de código que rode como `app_role` — apaga fisicamente o prontuário de um paciente **em atendimento, dentro do prazo legal de guarda**. Irreversível, e sem nenhum rastro de que a retenção foi violada além do texto livre de `motivo`.

Construir rota e UI em cima disso sem fechar o gate é entregar o botão antes da trava.

### C2 — `patient.alta_em` não tem caminho de escrita no app

Medido: `grep -rn "altaEm|alta_em" src/` só encontra **comentários** (`src/app/(app)/pacientes/[id]/logic.ts:19,54`) afirmando que arquivar não toca `alta_em`. Nenhuma action, nenhuma tela, nenhum core grava a coluna. Os únicos writers são testes de integração usando a role dona.

Efeito: `app_paciente_expurgavel` exige `alta_em IS NOT NULL`. Logo, em produção, a fila de elegíveis é **vazia por construção**. Rota, job e UI subiriam 100% verdes, com empty-state honesto, e ninguém descobriria por meses.

Este é o padrão já pago no repo em [[feature-sem-caminho-de-escrita-do-campo]]: o enum que ligava a feature nunca foi renderizado, e o teste que mockava o campo provava gating, não feature.

> Nota histórica: `docs/superpowers/plans/2026-08-02-fase-7-billing-trial-arquivamento-plan.md:330` instrui _"Run: `grep -rn "altaEm" "src/app/(app)/pacientes"` para achar a Server Action que grava `altaEm`"_. Ela nunca existiu. O plano presumiu.

### C3 — O aviso prévio de 90 dias é promessa da política e não existe

`docs/legal/politica-retencao-dados.md:159-162` promete: _"Nenhuma eliminação automática silenciosa de prontuário: a clínica recebe aviso com antecedência de 90 dias antes do prazo decenal de expurgo vencer, podendo estender a retenção daquele paciente específico"_.

Não existe mecanismo. O único aviso prévio implementado é o **comercial** de arquivamento por inatividade (#174, 7 dias antes, dia 83) — que o próprio documento (`:164`) faz questão de dizer que **não se confunde** com este.

---

## 3. O achado de maior consequência: o gate quebra a restauração de backup

Este ponto não estava em nenhum documento e não foi levantado por nenhuma das personas consultadas. Foi encontrado medindo o call site.

**A cadeia:**

1. `infra/backup/backup.sh:470` gera o ledger filtrando **literalmente** `WHERE acao = 'paciente_purgado'`.
2. `infra/backup/restore.sh:299` roda `reaplicar-tombstones.sql` com `-v ON_ERROR_STOP=1`.
3. `infra/backup/reaplicar-tombstones.sql:87-95` monta GUCs de coordenador e chama `app_purgar_paciente(...)` para **re-expurgar**, no banco restaurado, quem já havia sido expurgado antes do dump.
4. `restore.sh:302-304` é fail-closed: se o replay falhar, aborta e manda **não liberar o banco para uso**.

**O que quebra se o gate entrar ingenuamente:** um paciente expurgado pela via excepcional (ordem judicial, Art. 18) é, por definição, **não elegível**. No replay, o gate recusa → `ON_ERROR_STOP` aborta → restauração inteira trava, e se alguém contornar, o titular expurgado **ressuscita em definitivo**.

É [[restaurar-backup-desfaz-expurgo-lgpd]] de novo, por outro caminho.

**Duas travas que saem daqui, e ambas são requisito com teste:**

- **T1** — O replay tem que entrar por um caminho **sem gate**. `reaplicar-tombstones.sql` passa a chamar a via excepcional.
- **T2** — A via excepcional tem que gravar **a mesma** `acao = 'paciente_purgado'`. Se gravar `paciente_purgado_excepcional`, o `backup.sh` não a captura no próximo ciclo e o expurgo excepcional é desfeito no restore seguinte. A `acao` é interface, não rótulo.

---

## 4. Decisões de produto — fechadas pelo Rômulo em 25/08/2026

Perguntadas explicitamente nesta sessão, com o custo de cada opção na mesa. Não reabrir.

| #   | Decisão                                                                                           | Consequência de escopo                                                        |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| P1  | **O caminho de escrita de `alta_em` entra em #352.** Ação "Registrar alta clínica" no prontuário. | Sem ela a feature nasce morta (C2). #352 fica maior; é o preço de estar viva. |
| P2  | **Via excepcional entra agora, como função irmã nomeada**, sem UI no V1 (só SQL controlado).      | Necessária de qualquer forma para T1. Nomeada, nunca parâmetro booleano.      |
| P3  | **Aviso prévio de 90 dias entra em #352.**                                                        | É o que torna o expurgo não-silencioso — a promessa central da política.      |
| P4  | **Extensão de retenção por paciente fica FORA.**                                                  | Vira dívida no `BACKLOG.md`. Ver §5 abaixo para o que isso deixa aberto.      |

### Sobre P2 — por que função irmã e não parâmetro

Parâmetro opcional (`p_forcar boolean DEFAULT false`) vira o caminho padrão por preguiça de UI. Nome explícito força decisão consciente em cada chamador, e faz `grep` encontrar todos eles. Mesma disciplina que o repo já aplica em [[ctx-forjavel-use-server]].

### Sobre P4 — o que fica aberto, escrito de propósito

Como o expurgo nunca é automático (§5, D2), "estender a retenção" já existe **de fato**: a clínica simplesmente não confirma o expurgo quando avisada. O requisito funcional está coberto.

O que **não** está coberto é a prestação de contas: sem coluna, um auditor ou o DPO não distingue _"a clínica ainda não decidiu"_ de _"a clínica decidiu estender por processo judicial em curso"_. Ambos aparecem como ausência de evento. Isso é fraco para o Art. 37 da LGPD (registro das operações de tratamento).

Desenho mínimo, se um dia entrar: `patient.retencao_estendida_ate timestamptz` + `retencao_estendida_motivo text`, e o predicado de elegibilidade passa a exigir `(retencao_estendida_ate IS NULL OR <referência> >= retencao_estendida_ate)`. Registrar como dívida com este desenho já escrito — não como "avaliar depois".

---

## 5. Decisões técnicas travadas

Vindas da revisão de segurança/LGPD e da revisão de arquitetura desta sessão, **filtradas contra medição** (onde a persona divergiu do repo medido, o repo venceu — ver §6).

### D1 — Gate obrigatório, fail-closed no NULL

`app_purgar_paciente` passa a exigir `COALESCE(app_paciente_expurgavel(p_patient), false)`.

O `COALESCE` é defesa em profundidade, não o caso principal: em lógica de três valores, `alta_em IS NULL` produz `false AND NULL` = **`false`**, não NULL. O NULL só aparece quando a função não encontra linha (paciente inexistente ou de outra clínica) — e isso já foi barrado pelo guard de tenant que roda antes. Ainda assim o `COALESCE` fica: interpretar NULL como "elegível por falta de dado" é o modo de falha que apaga prontuário.

### D2 — O job nunca purga

Dois motivos independentes, e cada um sozinho já basta:

1. A política proíbe eliminação automática silenciosa. A decisão é da clínica (controladora); a Iris é operadora. Automatizar o disparo colapsa essa distinção — a Iris passaria a decidir eliminação por conta própria.
2. `app_purgar_paciente` exige `app.user_role = 'coordenador'` **e** `app.user_id`. O job só satisfaria isso **forjando GUC**, o que gravaria um ator falso em `audit_log` numa operação irreversível.

A role do job **não recebe** `EXECUTE` em `app_purgar_paciente`. E isso é afirmado por teste negativo explícito (`42501`), nunca presumido — [[grant-sem-policy-nega-tudo-em-silencio]].

### D3 — Nenhuma rota interna com Bearer tem poder de expurgo

O job fala **direto com o Postgres** por role dedicada de menor privilégio (padrão `iris_arquivamento`, `0080`).

Comparação que fecha a decisão: o job de billing usa rota interna porque cobrança é **reversível** (estorno, retry, cancelamento) e porque a imagem do job não herda as deps do app, precisando do SDK do gateway que só existe lá dentro. Aqui não há dependência externa nenhuma — é SQL puro — e a operação é irreversível.

Um `INTERNAL_JOB_TOKEN` vazado com alcance sobre expurgo apagaria prontuário de **qualquer paciente de qualquer clínica**, sem undo. E vazamento não é hipótese remota: [[easypanel-ambiente-expoe-segredos]] registra que o painel expõe segredo em texto claro — um screenshot despeja todo segredo de produção.

### D4 — Divergência `dado_eliminado` × `paciente_purgado`: corrige o **documento**

`docs/legal/politica-retencao-dados.md:145-149` diz que o log usa `acao='dado_eliminado'`. O código grava `'paciente_purgado'`.

Corrigir o **código** quebraria a reaplicação de tombstones em silêncio (§3, T2), exigiria migração de dado histórico em `audit_log`, alteração do `backup.sh` e revalidação ponta a ponta do restore. Custo alto para uma divergência puramente nominal, com risco de ressuscitar titular expurgado.

O documento está em rascunho não homologado. É o lado barato e correto.

> ⚠️ `docs/legal/` exige confirmação do Rômulo antes de alterar (`CLAUDE.md` § Permissões). A task correspondente é **bloqueante-por-confirmação**, não auto-executável.

### D5 — Confirmação por digitação, não só motivo

Motivo obrigatório em textarea é o atrito que o repo usa hoje para ações **reversíveis** (arquivar). Usar a mesma barra para um `DELETE` físico definitivo é inconsistência de risco perceptível — texto livre é fácil de preencher no automatismo ("teste", "solicitado").

O confirmador é o **nome do paciente exibido na tela**, não uma palavra fixa como "EXPURGAR": palavra fixa protege contra clique acidental, mas não contra purgar o **paciente errado**, que é o modo de falha mais provável numa fila de vários elegíveis.

Não existe no design system nem variante destrutiva de botão nem componente de confirmação por digitação (medido em `src/components/ui/button.tsx` e no comentário `arquivamento-dialog.tsx:49`). Construir dentro de #352 — é pequeno, e adiar deixa o `DELETE` físico com a fricção de um arquivamento.

### D6 — Sem `comEscrita()` na ação de expurgo

Esta é a **única** exceção ao guard de conta em somente-leitura no repo, e por isso precisa de comentário justificando na linha **e** de um teste que fixe o comportamento — senão alguém "conserta" adicionando o wrapper em três meses.

Razão: eliminar dado pessoal cujo prazo de retenção venceu é obrigação legal da clínica **como controladora** (LGPD Art. 16), e ela continua controladora enquanto está inadimplente. Bloquear a purga por dívida converteria cobrança em **retenção ilegal de dado pessoal** — o produto passaria a impedir o cumprimento da lei para pressionar pagamento.

Contraste travado: a ação de **registrar alta** (P1) **usa** `comEscrita()`. É escrita clínica ordinária, não obrigação legal.

### D7 — Elegibilidade é derivada, nunca materializada

Não criar coluna `retencao_vence_em`. O prazo depende de `clinic.politica_retencao_meses`, que a clínica **altera** — coluna materializada por trigger envelheceria em silêncio no dia em que a política mudasse, e o erro apareceria como paciente elegível cedo demais. Numa operação irreversível, "cedo demais" é perda de prontuário.

Fonte única do predicado: helper `IMMUTABLE` puro dos argumentos (`app_retencao_vence_em`), consumido por **todos** os três chamadores (predicado por UUID, fila da UI, varredura do job). Dois predicados que "deveriam" ser iguais divergem — é o que já aconteceu em [[create-or-replace-torna-diff-enganoso]].

### D8 — Fronteira de dia no fuso da clínica

O predicado vigente compara `now() >= (data + interval)`: `now()` é `timestamptz` no fuso do servidor, os operandos são `date`. Na fronteira do dia isso desloca o vencimento.

Aqui **existe data prometida** — a clínica lê "vence em tal dia" na tela e recebe aviso de 90 dias. É o caso do `src/lib/trial.ts` (fuso da clínica), não o do `auto-arquivamento` (UTC, cujo comentário diz explicitamente _"aqui não existe data prometida a ninguém"_).

Comparação passa a ser em **data civil no fuso da clínica** (`clinic.timezone`, `schema.ts:291`, default `America/Sao_Paulo`).

> Achado colateral: `FUSO_CLINICA` em `src/app/(app)/agenda/fuso.ts:4` é constante **chumbada**, enquanto `clinic.timezone` é coluna por clínica. Divergência real, fora do escopo de #352 — registrar no `BACKLOG.md`, não corrigir de carona.

### D9 — Aviso é in-app, nunca e-mail ou SMS

Uma linha em `audit_log` (`acao='expurgo_aviso_previo'`, `ator_id = NULL`) que a fila da clínica lê. Mesma regra do job de arquivamento, cujo cabeçalho diz o porquê e proíbe o contrário de forma explícita:

> _"O QUE ELE NÃO FAZ — E NÃO PODE PASSAR A FAZER: nenhuma saída de rede além do Postgres. (…) o Iris não fala com o mundo externo sobre paciente. Se um dia parecer natural adicionar um `fetch()` aqui, a resposta é não — e por isso esta imagem sequer instala um cliente HTTP."_

Aqui o argumento é mais forte que lá: arquivamento é ato administrativo sobre cobrança; expurgo é evento clínico. E arrastar `resend` para a imagem do job reabriria [[carga-nao-cobre-import-dinamico]] e [[imagem-escalonamento-nao-herda-app]].

Se um dia o aviso tiver de sair por e-mail, ele vira **segundo trilho** lendo a fila já materializada — não este job.

---

## 6. Onde as personas erraram (registrado para não ser reintroduzido)

Duas personas foram consultadas com dossiê fechado. Ambas contribuíram, e ambas inventaram fatos. Registrado porque o executor pode encontrar os mesmos raciocínios e achá-los plausíveis.

| Afirmação da persona                                          | O que a medição diz                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Retenção é `alta_em + 5 anos` (CFP)"                         | A regra real, já mergeada e revisada, é `MAX(nascimento+18a, alta_em + GREATEST(10a, politica_retencao_meses))`. Não se reescreve regra que já passou por revisão de PR. |
| "Materializar `retencao_vence_em` por trigger"                | Envelhece quando a clínica muda a política (D7).                                                                                                                         |
| "Tela em `src/app/(app)/configuracoes/retencao/`"             | Esse grupo de rotas **não existe**. O de coordenador é `src/app/(app)/clinica/` (`layout.tsx:8-14`).                                                                     |
| "Escrever o ledger de tombstone na mesma transação da action" | Ledger é CSV gerado pelo `backup.sh` a partir do `audit_log`. A action não escreve ledger nenhum.                                                                        |
| "Predecessora precisa de `GRANT UPDATE (alta_em)`"            | Já concedido na `0065:23`, posterior ao `REVOKE` da `0044:64`.                                                                                                           |
| "`alta_em IS NULL` faz a função retornar NULL"                | `false AND NULL` = `false` em SQL. NULL só vem de linha ausente (D1).                                                                                                    |
| Conflito gate × replay de tombstones                          | **Nenhuma das duas levantou.** É o achado de maior consequência (§3).                                                                                                    |

---

## 7. Premissas que continuam abertas — e que #352 não fecha

Escritas aqui para que ninguém as leia como fechadas dentro da spec.

- **Homologação jurídica da fórmula de retenção.** `politica-retencao-dados.md` §11 registra como pendente. #352 implementa a fórmula **já mergeada**, não a homologa.
- **Art. 16, I vs. Art. 18.** A leitura de que retenção por obrigação legal sobrepõe pedido de eliminação do titular antes do prazo é leitura de revisor técnico, não parecer. É exatamente por isso que a via excepcional exige `base_legal` escrita — o campo existe para que a decisão jurídica fique registrada por caso, não presumida em código.
- **Governança da via excepcional.** Quem autoriza além do coordenador (DPO? dono da conta?) é política interna, ainda não definida. No V1 não há UI, então a governança é processual (SQL controlado), não técnica.
- **Viabilidade operacional do aviso de 90 dias como compromisso público.** §11 do documento marca como não confirmado. #352 constrói o mecanismo; publicar a promessa é decisão separada.
- **`politica_retencao_meses` é nullable e sem default, e nenhuma UI a lê ou escreve.** `COALESCE(..., 0)` no predicado faz NULL significar "sem extensão", que é o comportamento conservador correto. Expor na UI é escopo próprio.

---

## 8. Convenções do repo que o executor não pode descobrir sozinho

Cada uma já custou caro. Estão aqui porque são invisíveis no diff.

- **`*.int.test.ts` está no `exclude` do `vitest.config.ts`.** `npx vitest run db/tests/x.int.test.ts` **coleta zero e sai verde**. Exige `--config vitest.integration.config.ts`, e a conferência é pela **contagem de arquivos e testes coletados**, nunca pela cor — [[vitest-int-test-coleta-zero]].
- **Migração à mão exige entrada manual no `_journal.json` com `when` = anterior **+ 1000**.** `when` menor ou igual ao máximo aplicado faz o Drizzle **pular o arquivo em silêncio** — [[drizzle-hand-migration-when-ordering]], [[migracao-commitada-nao-e-aplicada]].
- **`CREATE OR REPLACE` torna o diff enganoso.** Ler o `.sql` não prova o corpo vigente; medir em `pg_proc.prosrc` — [[create-or-replace-torna-diff-enganoso]]. É por isso que a versão vigente de `app_purgar_paciente` está na `0094` e não na `0045`.
- **Nunca `pnpm format`** — reformata o repo inteiro, incluindo `.agents/` e worktrees aninhados. Só `npx prettier --write <arquivos tocados>` — [[pnpm-format-reformata-repo-inteiro]]. E o CI **não** valida Prettier, então isso precisa estar no checklist de saída de cada task (`AGENTS.md` §5.2, ponto 7).
- **Policy e função nunca resolvem tenant com `current_setting` cru.** Usar `app_clinic_id_exigido()` (levanta `P0001` diagnosticável). **Nunca** `app_clinic_id_atual()` em predicado de isolamento — devolve `NULL` e some com a linha em silêncio.
- **Em módulo `"use server"` só se exporta função async.** Schema Zod exportado quebra o build; por isso os schemas moram em `schemas.ts` irmão. E o core que aceita `ctx` **nunca** é exportado de módulo `"use server"` — guard de CI em `src/security/ctx-forjavel-guard.test.ts` quebra ([[ctx-forjavel-use-server]]).
- **Nenhum campo trafega no payload RSC que a tela não desenhe.** Achado do PR #448: `detalhe` (jsonb, campo livre com PII) e `entidade_id` viajaram até o navegador. Vale direto para a fila de elegíveis.
- **E-mail de fixture colide entre int-tests.** `coord@a.test` aparece em 13+ arquivos e `UNIQUE(email)` derruba o `setup`, e a cascata se lê como defeito de RLS — [[email-de-fixture-colide-entre-int-tests]]. Usar sufixo único por arquivo.
- **Imagem de job não herda `node_modules` do app.** Deps listadas à mão no Dockerfile — [[imagem-escalonamento-nao-herda-app]], [[carga-nao-cobre-import-dinamico]].
- **Issue fechada não prova serviço provisionado.** [[job-provisionado-nao-e-job-que-fecha-ciclo]]. O job de exportação integral (#374) tem script e rota e **nunca foi provisionado**: não há `infra/exportacao/`, Dockerfile, agendador nem serviço no compose. #352 não pode repetir.
