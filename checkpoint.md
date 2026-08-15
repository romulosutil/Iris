# Checkpoint — Iris

> **Data:** 15/08/2026
> **Branch:** `feat/317-parametros-autorizacao-pix` (7 commits, **sem push**, sem PR)
> **Status:** 🟡 Passos 1, 2 e 3 da linha de billing executados em código. **#321** (medição), **#317** (parâmetros da autorização) e **#319** (carência que nunca corria) entregues — mas a **#319 não tem uma única linha verificada contra banco**: o Postgres local está fora do ar e o Docker não sobe nesta máquina. O próximo passo é o 4 — **#318**.

---

## 0. Ordem de leitura — comece aqui

> **Você está no passo 3 de 4.** Se abriu este arquivo primeiro, leia os dois anteriores antes de agir: eles dizem **o que** fazer e **em que ordem**; este diz apenas onde a última sessão parou.

| #     | Documento                                                                                                 | O que só existe aqui                                                                                                                                                                                           |
| :---- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | [**Ordem de conclusão**](https://claude.ai/code/artifact/59b6c2d8-ea6c-401a-b62f-9572ed26d243) (artifact) | A sequência dos 9 passos e **por que essa ordem** — irreversibilidade, não gravidade. Grafo de dependência, modelo indicado e prompt pronto de cada passo.                                                     |
| **2** | **A issue do passo corrente** (GitHub)                                                                    | Escopo exato, Definição de Pronto e os comentários com as medições já feitas. ⚠️ `gh issue view --comments` **retorna vazio neste ambiente** — usar `gh api repos/romulosutil/iris/issues/N` e `.../comments`. |
| **3** | `checkpoint.md` (este arquivo)                                                                            | Estado da última sessão: o que foi medido, o que ficou aberto **e por qual motivo**, e o próximo passo concreto.                                                                                               |
| **4** | [`BACKLOG.md`](BACKLOG.md)                                                                                | Débitos vivos (D1–D32) e log de sessões. Consulta, não leitura linear — venha buscar o histórico de uma decisão específica.                                                                                    |

### Instruções para o próximo

1. **Leia na ordem acima.** O artifact é o ponto de entrada — ele decide qual issue é a próxima, com qual modelo e com qual skill. Não escolha o passo por conta própria.
2. **Antes de planejar qualquer coisa, leia os comentários da issue.** Nas issues desta linha, os comentários **corrigem o corpo original** em pontos materiais. Planejar pelo corpo sozinho já produziu retrabalho — e na #319 o próprio corpo tinha uma conta errada (§1).
3. **Não replaneje medição contra o sandbox do Asaas.** Autorização de Pix Automático não ativa lá (§1c). Toda pergunta sobre o trilho headless só se responde no ensaio com clínica de teste **em produção**.
4. **"Não medido" é resultado, não pendência.** Propague com o motivo. Nunca converta em suposição pelo caminho — foi exatamente esse defeito que criou a #289.
5. **Antes de aplicar a label `jules`**, feche o checklist de handoff (`AGENTS.md` §5.2). A #289 está bloqueada nisso hoje: falta decidir o discriminador.
6. **Ao fechar um passo:** atualize este arquivo **e** acrescente a sessão no `BACKLOG.md`, nessa ordem. O artifact só muda quando a ordem dos passos mudar.
7. **Commits em inglês**, documentação e copy em pt-BR. Formate só os arquivos tocados (`pnpm prettier --write <arquivo>`) — nunca `pnpm format`, que reformata o repo inteiro.

---

## 1. Resumo da Sessão (15/08/2026, 3ª) — passo 3: #319

Executado o **passo 3**: issue [#319](https://github.com/romulosutil/Iris/issues/319) — `past_due` era terminal, a carência nunca corria, e a máquina de dívida da #287/#290 era alcançável **só** por revogação voluntária no app do banco. Quem simplesmente parava de pagar escrevia para sempre.

Orquestração em subagents: recon → plano → dois builders em paralelo (migração × varredura) → builder de testes → revisão adversarial → reparo. Plano versionado em `docs/superpowers/plans/2026-08-15-319-carencia-que-nunca-corre.md`.

### O fato medido que derrubou a premissa da própria issue

O corpo da #319 afirma "7 dias de retentativa + 7 de carência = **14 dias** de escrita livre". Falso. `subscription.ts` carimba `pastDueDesde: assinatura.pastDueDesde ?? agora` — preserva o **primeiro** carimbo. A assinatura vira `past_due` na primeira recusa, então as retentativas `ALLOW_THREE_IN_SEVEN_DAYS` do #317 correm **dentro** da carência, não antes dela. As janelas se sobrepõem; não somam. A decisão de dimensionamento mudou por causa disso.

### O que entrou

| Commit    | O quê                                                                                                                        |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `eea42ea` | `carencia_dias` 7 → 10 (migração `0098`, com backfill à mão restrito a `= 7`) + índice `subscription_carencia_idx`           |
| `061a147` | `cancelarAssinaturasComCarenciaVencida` + encaixe na rota interna + guard do ramo `recusada` + `cancelarVinculo` idempotente |
| `2d9e486` | 12 casos de integração em `carencia-vencida.int.test.ts` + plano versionado                                                  |

### As 5 decisões da issue, fechadas com o Rômulo

- **D-1 Onde roda a varredura.** Na rota interna `/api/internal/billing/fechar-ciclos`, como **3ª chamada**, depois de `fecharCiclosVencendo`. A ordem é a regra: fechar ciclos é o que produz as recusas do dia, e varrer antes cortaria uma clínica cuja cobrança ainda ia ser tentada — sendo que o corte revoga a autorização, que não volta sem novo consentimento. O `.mjs` segue gatilho magro.
- **D-2 `cancelarVinculo`: chamar, fail-closed.** Revoga no gateway **antes** de escrever. Falha ⇒ a assinatura **não** transiciona, fica em `past_due` e a passada seguinte tenta de novo. Recusado o best-effort: deixaria autorização viva no Asaas com assinatura morta no Iris.
- **D-3 Carência 7 → 10 dias.** 7 da janela de retentativa + 3 de folga, para a última das três tentativas liquidar antes do corte. Backfill seguro porque nenhuma tela jamais escreveu essa coluna.
- **D-4 Ciclo `falhou` vira `devido`.** É o que fecha o buraco — `congelarCiclosComoDebito` só pegava `aberto`/`apurado`, deixando de fora justamente o ciclo que não foi pago. **Efeito colateral assumido:** a cobrança antiga segue `OVERDUE` e pagável no Asaas, então existe janela de cobrança dupla até a **#310** entrar.
- **D-5 Aviso ao cliente fora de escopo.** Vai para a **#312**, que a ordem de conclusão já prevê escrever depois do #319 para cobrir os dois gatilhos de corte com copy diferente de uma vez.

### A armadilha nova que o desenho encontrou

`pastDueDesde` **precisa** ser zerado no corte. Se sobrevivesse, a assinatura reativada mais tarde voltaria a `past_due` numa recusa futura, o `?? agora` preservaria o carimbo **velho**, a carência nasceria vencida e o corte seria imediato na primeira recusa. Mesma classe do `cancelada_em` não limpo na reativação (que fez o 2º pro-rata saturar no piso de 1 dia). O teste de ida-volta-ida sozinho **não** mata esse mutante — `aplicarStatusProvider` zera o carimbo em toda transição que não seja para `past_due`; quem mata é a asserção intermediária, medindo a coluna logo depois do corte.

### Revisão adversarial: 3 GRAVES, todos corrigidos antes do commit

1. **Ordem de escrita irrecuperável.** O congelamento rodava **depois** do `UPDATE canceled`. Falhando ali, a linha já era `canceled`, a próxima passada não a selecionava (o predicado é `status = 'past_due'`) e **nada mais congelava**: `levantarDebito` = 0, gate da #290 aberto, clínica cortada reativando de graça — exatamente a perda que a D-4 existe para fechar. Agora é revogar → congelar → gravar, com os dois últimos na mesma transação.
2. **Não era fail-closed, era loop preso.** `cancelarVinculo` é um `DELETE` cru e o helper converte qualquer não-2xx em throw. Se o Asaas processasse e a resposta se perdesse — ou se o cliente já tivesse revogado no app do banco — toda passada responderia 404 e a assinatura **nunca** seria cortada, com `past_due` liberando escrita. Agora 404 conta como sucesso (o objetivo já está atingido) e 400 reconsulta o `GET`, aceitando só se o gateway **disser** `CANCELLED/REFUSED/EXPIRED`. Rede, timeout e 5xx seguem barrando.
3. **O corte era reversível por não pagar.** Defeito **pré-existente** que só a #319 torna alcançável: o ramo `recusada` de `conciliarPagamentoDeCiclo` gravava `past_due` **sem guard de status** (o ramo `paga` tem). Clínica cortada → pede o débito da #290 → não paga → cobrança vai a `OVERDUE` → a assinatura **voltava** de `canceled` para `past_due`, recuperando escrita e ganhando 10 dias novos. Guard acrescentado.

Mais quatro achados menores fechados: erro do resultado agora distingue em que etapa falhou (gateway × congelamento × escrita); varredura ganhou ordenação (mais antigo primeiro) e teto por passada, com o truncamento subindo no corpo JSON e não só no `console.warn`; comentário do piso corrigido.

### ⚠️ O que esta entrega **não** tem

**Nenhuma verificação contra banco.** O Postgres local recusa conexão em 5433 e o daemon do Docker não sobe nesta máquina. Portanto:

- a migração `0098` **não foi aplicada** — não há prova em `information_schema` do default 10, nem em `pg_indexes` do índice novo, nem contagem de linhas afetadas pelo backfill;
- os **12 casos de integração nunca rodaram**. Confirmado só que coletam e pulam limpo com `ALLOW_SKIP_INTEGRATION=1` (`12 skipped`). Verde de suíte gated não é prova de nada — os valores (3900, 1300, a borda inclusiva `<=`) seguem por confirmar;
- o predicado `past_due_desde + make_interval(days => carencia_dias) <= agora` foi provado por `toSQL()` (o SQL emitido é válido e o driver não quebra o bind), **não por execução**.

Verde do que roda: `pnpm typecheck` limpo · `pnpm lint` 0 erros (10 warnings pré-existentes em `src/stories/**`) · `pnpm vitest run src/lib/billing` 133 passando · `src/db/migrations.test.ts` 8 passando.

---

## 1b. Sessão anterior (15/08/2026, 2ª) — passo 2: #317

Parâmetros que só existem na criação da autorização: `minLimitValue` (R$ 39,00, derivado de `FAIXAS_PRECIFICACAO[0]`) + `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"`; `PISO_COBRANCA_CENTAVOS` → `PISO_COBRANCA_AVULSA_CENTAVOS`; `vencimentoCobrancaDeCiclo` + `calendario-bancario.ts` com feriados móveis calculados da Páscoa. Commits `a2b3e36`, `792bff1`, `dd9efb7`, `597128c`.

O bug sazonal do caminho: `vencimento: somarDias(agora, 5)` somava **dias corridos** — atravessando Carnaval ou o cluster de fim de ano, cinco corridos deixam menos de dois dias úteis de antecedência (recusa `RECEIVED_TOO_LATE`). Verde o ano inteiro, vermelho em fevereiro e dezembro. A regra nova satisfaz a metade mais restritiva de cada leitura da doc: **piso em dias úteis bancários, teto em dias corridos**.

Revisão adversarial pegou 4 defeitos, todos corrigidos: faltavam 24/12 e 31/12 (os dois dias bancários-e-não-civis, que é exatamente a distinção que o módulo diz fazer — sem eles, 8 fechamentos em 2026-27 caíam para 1 dia útil); a varredura de 730 dias era tautológica (importava as constantes que deveria vigiar); teto da janela e `diasCorridosEntre` sem cobertura; faltava o teste de cluster de fim de ano que o comentário 2 da issue pedia.

Decisões: **D-A** `minLimitValue` deriva de `FAIXAS_PRECIFICACAO[0]`, não de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS` (LEGADO) · **D-B** só a flag, orquestração é a **#322** · **D-C** janela conservadora sem medição · **D-D** `carencia_dias` fica em 7 e redimensionar é pauta da #319 — **resolvido nesta 3ª sessão: virou 10** · **D-E** rename do piso, número e comentário seguem escopo da **#311**.

---

## 1c. Sessão anterior (15/08/2026, 1ª) — passo 1: #321

Sessão de medição no sandbox do Asaas (`api-sandbox.asaas.com/v3`, chave `$aact_hmlg_`).

### Achado estrutural que muda o planejamento

**O sandbox do Asaas não permite ativar uma autorização de Pix Automático.** O simulador `pix/qrCodes/pay` trava em `AWAITING_CRITICAL_ACTION_AUTHORIZATION`; `/transfers/{id}/authorize` devolve 404; o token `000000` não move o estado. Existem 3 endpoints de simulação — `myAccount/approve`, `payment/{id}/confirm`, `payment/{id}/overdue` — e nenhum toca autorização. Consequência: **todo o trilho de débito headless é imensurável fora de produção**.

| #   | Pergunta                                             | Veredito                                                                                                       |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `minLimitValue: 39.00` sem `value` é aceito?         | **Medido — sim.** 200, persiste, `value: null`. Recorrência com dois valores distintos: **não medido**         |
| 2   | Pagador conclui sem preencher teto?                  | **Não medido** — exige app de banco. A API não expõe nem aceita teto, só `minLimitValue`                       |
| 3   | `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` é aceito? | **Medido — sim**, com eco na resposta. `NOT_ALLOWED` no código era escolha, não limitação                      |
| 4   | Janela de 2 dias: úteis ou corridos?                 | **Não medido.** O 400 de autorização inativa dispara antes da checagem de janela                               |
| 5   | `dueDate` em sábado/domingo/feriado é aceito?        | **Medido no trilho avulso — os três aceitos (200)**, sem empurrão para dia útil. Trilho automático: não medido |
| 6   | Menor `value` num PIX avulso?                        | **Medido — piso real R$ 5,00**, sobre `value − discount` (líquido)                                             |
| 7a  | `externalReference` na cobrança de ativação?         | **Medido que não serve.** `immediateQrCode` não tem o campo                                                    |
| 7b  | Onde pousa o código de recusa?                       | **Medido — `paymentInstruction.refusalReason`**. Payload do **webhook**: não medido                            |

### Armadilhas medidas (valem para quem vier depois)

- **Campo desconhecido passa 200 e some.** `maxLimitValue` inventado foi aceito e não voltou na resposta. **Eco na resposta é o único teste de que um campo existe.**
- **Forçar vencimento reescreve `dueDate`** e preserva `originalDueDate`.
- Taxa Pix de R$ 0,99 sobre cobrança no piso → `netValue: 4,01`, ~20% do débito.
- O piso **não** se aplica ao QR de ativação: `originalValue: 0.01` foi aceito.

---

## 2. Estado do Repositório & Branch

- **Branch:** `feat/317-parametros-autorizacao-pix` — **sem push, sem PR**. Nasceu do HEAD da `feat/290-gate-debito-reativacao`, então carrega junto os dois commits de docs que também nunca subiram (`838d5be`, `e229a19`). Acumula agora **#317 e #319** — considerar separar antes do PR, ou abrir um PR só, deixando claro na descrição que são dois passos.
- **Commits desta sessão:** `eea42ea`, `061a147`, `2d9e486` (+ o de docs que fecha a sessão).
- **Arquivos novos:** `db/migrations/0098_subscription_carencia_dez_dias.sql` (+ snapshot), `src/lib/billing/carencia-vencida.int.test.ts`, `docs/superpowers/plans/2026-08-15-319-carencia-que-nunca-corre.md`.
- ⚠️ **`pnpm test` completo não está verde nesta máquina:** 7 falhas em `src/app/(app)/equipe/convidar/logic.test.ts`, todas `ECONNREFUSED :5433`. **Pré-existente e alheio a estes diffs.** Antes de abrir PR, subir o banco e rerodar.
- ⚠️ **`pnpm test:rls` e `pnpm db:migrate` não rodaram** nesta sessão, pelo mesmo motivo. A `0098` está escrita, não aplicada.
- **Não versionado (pendente de decisão do Rômulo):** `.mcp.json` (aponta para o MCP de docs do Asaas) e `docs/daily-summary/2026-08-14.md`.
- **Memória gravada:** `sandbox-asaas-nao-ativa-pix-automatico.md`, `janela-dia-util-24-12-e-31-12.md`, `carencia-nunca-corria-e-ordem-de-escrita.md`.

---

## 3. Próximos Passos Sugeridos

1. **Subir o Postgres e rodar o que não rodou.** É a dívida mais cara desta sessão, não uma formalidade: `pnpm db:migrate` (aplica a `0098`), `pnpm vitest run src/lib/billing/carencia-vencida.int.test.ts` (os 12 casos), `pnpm test:rls`, e as 7 falhas de ambiente do `equipe/convidar`. Depois, medir no banco: `information_schema.columns.column_default` = 10, `pg_indexes` com `subscription_carencia_idx`, e a contagem do backfill.
2. **Push da branch e PR.** Decisão do Rômulo — está tudo local. ⚠️ Keyword de fechamento **em inglês** (`Closes #317`, `Closes #319`) — "Fecha #317" mergeia e deixa a issue aberta em silêncio.
3. **Passo 4 — #318** (classificar as recusas). Destravada pela #319. O trabalho aqui é de produto antes de código: definir o desfecho de cada um dos 6 grupos de código de recusa e escrever a tabela na própria issue (carimba `past_due`? consome carência? é retentável? o que a clínica vê?), fechando o checklist §5.2 — só depois a label `jules`. Duas regras já saem decididas: falha do banco não é inadimplência da clínica, e recusa de janela é defeito nosso.
4. **Agendar o ensaio com clínica de teste em produção.** Único caminho para as perguntas remanescentes: unidade da janela, recorrência com dois valores diferentes, pagador concluir sem teto, identificador da cobrança de ativação, payload do webhook de recusa e — novo desta sessão — **o que o Asaas responde a um `DELETE` de autorização já cancelada**. Contexto na memória `ensaio-fechamento-ciclo-clinica-teste`.

---

## 4. Achados abertos (não são pendência de issue nenhuma)

Registrados aqui porque nasceram no caminho e não têm dono. Detalhe no `BACKLOG.md`.

| Achado                                                                                                                             | Onde                                                          | Estado                                                                                                                                        |
| :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nada da #319 foi verificado contra banco** — `0098` não aplicada, 12 casos de integração nunca executados                        | Postgres local em 5433 recusa; Docker não sobe                | **O achado mais grave desta sessão.** Está no topo dos próximos passos. Não fechar a issue antes disso.                                       |
| **A varredura de corte não escreve `audit_log`** — é a 1ª ação **irreversível** dirigida por job no repo                           | `src/lib/billing/subscription.ts`                             | Coerente com o módulo (nenhum `billing/*.ts` audita), mas revogar autorização sem trilha não tem precedente. Decisão de produto pendente.     |
| **O job sai `exit 0` mesmo com `carenciaFalhas` cheio** — clínica que falha o corte todo dia não alerta ninguém                    | `scripts/fechamento-ciclo-billing.mjs`                        | O `.mjs` só loga o corpo. Vale um limiar que derrube o exit code, ou o corte silencioso vira permanente.                                      |
| **`billing_apurar_ciclo` reescreve `pacientes_contados`** ao congelar ciclo `falhou` já faturado                                   | `db/migrations/0075` + `congelarCiclosComoDebito`             | O piso `Math.max` protege o **valor**; o memorial de quem foi contado, não. Nenhum teste mede `pacientes_contados`.                           |
| **`past_due` com `past_due_desde` NULL nunca é cortado e não aparece em `carenciaAvaliadas`**                                      | `src/lib/billing/subscription.ts`                             | Silêncio, não erro. Estado não deveria existir (os dois produtores carimbam juntos), mas nada o impede.                                       |
| **O predicado corta por instante, não por dia civil** — quem entra em `past_due` às 23h é cortado às 23h do 10º dia                | `src/lib/billing/subscription.ts`                             | Diverge de `calendario-bancario.ts`, que normaliza para horário civil de SP. Inerte hoje (SP sem DST, container UTC); quebra em fuso com DST. |
| **Status real do `DELETE` de autorização já cancelada no Asaas não medido** — a tolerância a 404 é desenho defensivo, não medição  | `src/lib/billing/provider/asaas.ts`                           | Entra no ensaio em produção. Se o Asaas responder 200 idempotente, o cuidado sobra; se responder outra coisa, o loop preso volta.             |
| **A ordem da rota (varrer carência depois de fechar ciclos) é decisão declarada e sem teste**                                      | `src/app/api/internal/billing/fechar-ciclos/route.ts`         | Nenhum arquivo de teste cobre a rota; o mutante que inverte a ordem sobrevive a tudo.                                                         |
| **`billing_apurar_ciclo` carimba `apurado` antes do `UPDATE` do TS** — crash entre as duas escritas converte `falhou` em `apurado` | `db/migrations/0075`                                          | E `apurado` está na lista padrão do congelamento, então a revogação voluntária passaria a pegá-lo. Sem cobertura.                             |
| **Qual calendário de feriados o Asaas usa** — o nosso é o nacional; bancário estadual/municipal não entra                          | `src/lib/billing/calendario-bancario.ts`                      | Suposição não medida, mesma classe do `INSTRUCTION_REFUSED → OVERDUE` da #286. Entra no ensaio em produção.                                   |
| **O teto de 10 dias corridos só é vigiado por um teste** — nenhum fechamento real passa de 9                                       | `src/lib/billing/vencimento.test.ts`                          | Aceito e documentado. Apagar aquele caso solta a constante sem nada ficar vermelho.                                                           |
| **`consultarCobranca` lê `pixTransaction.failureReason`, campo que não existe** no recurso `payment`                               | `src/lib/billing/provider/asaas.ts:799` (fallback em 818-821) | Achado da #321. É escopo da **#318**, já comentado lá.                                                                                        |
| **Discriminador do `erro_aplicacao` continua indefinido** — `externalReference` não serve                                          | #289                                                          | Decisão de produto em aberto entre `immediateQrCode.conciliationIdentifier` e `endToEndIdentifier`. **Trava a label `jules`.**                |
| **`.specs/features/debito-reativacao-290/design.md:56` cita `PISO_COBRANCA_CENTAVOS`**, nome que não existe mais                   | spec histórica                                                | Registro de época, não corrigido de propósito. O nome vivo é `PISO_COBRANCA_AVULSA_CENTAVOS`.                                                 |
| **`moveisPorAno` é cache global sem limite** no calendário bancário                                                                | `src/lib/billing/calendario-bancario.ts`                      | Irrelevante no uso atual (o job toca 2-3 anos); é estado global não limpável entre testes.                                                    |
| **`carencia_dias` pode precisar de `GRANT UPDATE` de coluna** se a app um dia escrever nela                                        | `subscription`                                                | Não medido. O backfill roda na role de migração, então a `0098` passa; nada na app escreve essa coluna hoje.                                  |
