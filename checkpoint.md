# Checkpoint — Iris

> **Data:** 15/08/2026
> **Branch:** `feat/317-parametros-autorizacao-pix` (4 commits, **sem push**, sem PR)
> **Status:** 🟢 Passos 1 e 2 da linha de billing executados. **#321** (medição no sandbox) e **#317** (parâmetros da autorização) entregues. O próximo é o passo 3 — **#319**, que destrava metade da lista.

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
2. **Antes de planejar qualquer coisa, leia os comentários da issue.** Nas issues desta linha, os comentários **corrigem o corpo original** em pontos materiais. Planejar pelo corpo sozinho já produziu retrabalho.
3. **Não replaneje medição contra o sandbox do Asaas.** Autorização de Pix Automático não ativa lá (§1). Toda pergunta sobre o trilho headless só se responde no ensaio com clínica de teste **em produção**.
4. **"Não medido" é resultado, não pendência.** Propague com o motivo. Nunca converta em suposição pelo caminho — foi exatamente esse defeito que criou a #289.
5. **Antes de aplicar a label `jules`**, feche o checklist de handoff (`AGENTS.md` §5.2). A #289 está bloqueada nisso hoje: falta decidir o discriminador.
6. **Ao fechar um passo:** atualize este arquivo **e** acrescente a sessão no `BACKLOG.md`, nessa ordem. O artifact só muda quando a ordem dos passos mudar.
7. **Commits em inglês**, documentação e copy em pt-BR. Formate só os arquivos tocados (`pnpm prettier --write <arquivo>`) — nunca `pnpm format`, que reformata o repo inteiro.

---

## 1. Resumo da Sessão (15/08/2026, 2ª) — passo 2: #317

Executado o **passo 2 da ordem de conclusão**: issue [#317](https://github.com/romulosutil/Iris/issues/317) — os parâmetros que só existem na criação da autorização de Pix Automático. Orquestração em subagents (recon → dois builders em paralelo → builder da janela → revisão adversarial → correção), com a DoD consolidada postada num comentário da própria issue.

### O que entrou

| Commit    | O quê                                                                                                            |
| :-------- | :--------------------------------------------------------------------------------------------------------------- |
| `a2b3e36` | `minLimitValue` (R$ 39,00, derivado da tabela de preços) + `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` no payload |
| `792bff1` | `PISO_COBRANCA_CENTAVOS` → `PISO_COBRANCA_AVULSA_CENTAVOS`                                                       |
| `dd9efb7` | `vencimentoCobrancaDeCiclo` + `calendario-bancario.ts` (feriados móveis calculados da Páscoa)                    |
| `597128c` | Correção dos 4 achados da revisão adversarial + o plano versionado                                               |

### O bug sazonal que apareceu no caminho

`vencimento: somarDias(agora, 5)` somava **dias corridos**. Atravessando Carnaval, feriado prolongado ou o cluster de fim de ano, cinco corridos podem deixar **menos de dois dias úteis** de antecedência — recusa `RECEIVED_TOO_LATE`. Verde o ano inteiro, vermelho em fevereiro e dezembro; teste que usa a data de hoje nunca o veria. A regra nova satisfaz a metade mais restritiva de cada leitura da doc: **piso em dias úteis bancários, teto em dias corridos**.

### Revisão adversarial: 4 defeitos, todos corrigidos antes do fechamento

1. **Faltavam 24/12 e 31/12** no calendário — os dois dias bancários-e-não-civis, que é exatamente a distinção que o módulo diz fazer. Sem eles, 8 fechamentos em 2026-27 caíam para 1 dia útil (fechar em 22/12/2026 → vencer em 28/12).
2. **A varredura de 730 dias era tautológica** — importava as constantes que deveria vigiar; mutar o piso de 2 para 0 a deixava verde. Limites agora são literais.
3. **Teto da janela e `diasCorridosEntre` sem cobertura** — a checagem do teto virou `verificarTetoDaJanela`, exportada e testada direto.
4. **Faltava o teste de cluster de fim de ano** que o comentário 2 da issue pedia — é o que teria pego o defeito 1.

Toda asserção nova foi provada por mutação, com a mutação revertida por patch inverso à mão.

### Decisões registradas (detalhe no comentário da #317 e no plano)

- **D-A** `minLimitValue` deriva de `FAIXAS_PRECIFICACAO[0]`, não de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS` (marcada LEGADO, fora de produção).
- **D-B** Só a flag; orquestração extradia é a **#322**.
- **D-C** Janela conservadora sem medição — a unidade continua indeterminada e só o ensaio em produção decide.
- **D-D** `carencia_dias` **fica em 7**; redimensionar é pauta da **#319**.
- **D-E** Rename do piso; o valor e o comentário "escolha conservadora → medido" seguem sendo escopo da **#311**.

---

## 1b. Sessão anterior (15/08/2026, 1ª) — passo 1: #321

Executado o **passo 1**: issue [#321](https://github.com/romulosutil/Iris/issues/321) — sessão de medição no sandbox do Asaas (`api-sandbox.asaas.com/v3`, chave de homologação `$aact_hmlg_`).

### Achado estrutural que muda o planejamento

**O sandbox do Asaas não permite ativar uma autorização de Pix Automático.** O único simulador de pagamento (`pix/qrCodes/pay`) trava em `AWAITING_CRITICAL_ACTION_AUTHORIZATION`; `/transfers/{id}/authorize` devolve 404; o token `000000` não move o estado nem em header nem em corpo. Só existem 3 endpoints de simulação — `myAccount/approve`, `payment/{id}/confirm`, `payment/{id}/overdue` — e nenhum toca autorização.

Consequência: **todo o trilho de débito headless é imensurável fora de produção**. Vale o que é criação de autorização (aceitação de campo/enum) e o trilho de cobrança **avulsa**.

### O que foi medido

| #   | Pergunta                                             | Veredito                                                                                                                                                                                       |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `minLimitValue: 39.00` sem `value` é aceito?         | **Medido — sim.** 200, persiste, `value: null`, `status: CREATED`. Recorrência com dois valores distintos: **não medido** (autorização nunca ativa)                                            |
| 2   | Pagador conclui sem preencher teto?                  | **Não medido** — exige app de banco. De lambuja: a API não expõe nem aceita teto, só `minLimitValue`                                                                                           |
| 3   | `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` é aceito? | **Medido — sim**, com eco na resposta. `NOT_ALLOWED` no código é escolha, não limitação da API                                                                                                 |
| 4   | Janela de 2 dias: úteis ou corridos?                 | **Não medido.** O 400 de autorização inativa dispara antes da checagem de janela — o controle _dentro_ da janela recebeu o mesmo 400, provando que a resposta não carrega informação de janela |
| 5   | `dueDate` em sábado/domingo/feriado é aceito?        | **Medido no trilho avulso — os três aceitos (200)**, data devolvida igual, sem empurrão para dia útil. Trilho automático: não medido                                                           |
| 6   | Menor `value` num PIX avulso?                        | **Medido — piso real R$ 5,00.** 0,01 / 0,50 / 1,00 / 3,00 → 400 nomeado; 5,00 → 200                                                                                                            |
| 7a  | `externalReference` na cobrança de ativação?         | **Medido que não serve.** `immediateQrCode` não tem o campo, e a cobrança de ativação não existe até o QR ser pago                                                                             |
| 7b  | Onde pousa o código de recusa?                       | **Medido — `paymentInstruction.refusalReason`**, via `GET /pix/automatic/paymentInstructions/{id}`. Payload do **webhook**: não medido                                                         |

### Armadilhas medidas (valem para quem vier depois)

- **Campo desconhecido passa 200 e some.** `maxLimitValue` inventado foi aceito e não voltou na resposta. **Eco na resposta é o único teste de que um campo existe** — status 200 não prova nada.
- **Forçar vencimento reescreve `dueDate`** e preserva `originalDueDate`. Comparar `dueDate` com a data planejada depois do vencimento lê a data errada.
- O piso de R$ 5,00 é sobre **`value − discount`** (líquido), não sobre `value`.
- Taxa Pix de R$ 0,99 sobre cobrança no piso → `netValue: 4,01`, ~20% do débito.
- O piso **não** se aplica ao QR de ativação: `originalValue: 0.01` foi aceito. `VALOR_ATIVACAO_PADRAO_CENTAVOS = 1` segue viável.

### Efeitos nas issues dependentes

- **#317** — `retryPolicy` é aceito na criação (destravou o escopo). **Entregue na 2ª sessão de 15/08** — ver §1. A contradição úteis × corridos continua aberta; a regra conservadora está de pé esperando o ensaio.
- **#311** — o valor `500` está **correto, mantém-se**. A entrega vira trocar o comentário de "escolha conservadora, NÃO medição" (`src/lib/billing/debito.ts`) por "medido em 15/08/2026", acrescentando a precisão do líquido de desconto. Não é mais candidata a remoção. ⚠️ A constante **mudou de nome** para `PISO_COBRANCA_AVULSA_CENTAVOS` (#317, D-E) — o rename já está feito, sobra o número e o comentário.
- **#289** — o discriminador **não pode ser `externalReference`**. Candidatos disponíveis antes do pagamento: `immediateQrCode.conciliationIdentifier` e `endToEndIdentifier` da autorização. **A escolha entre os dois segue decisão de produto em aberto** — a issue ainda não pode ir para o Jules.
- **#318** — o campo é `paymentInstruction.refusalReason`. Achado colateral: `consultarCobranca` (`src/lib/billing/provider/asaas.ts:799`, fallback em 818-821) procura em `pixTransaction.failureReason`, que **não existe** no recurso `payment` (medido num payment OVERDUE forçado: `pixTransaction: null`).

---

## 2. Estado do Repositório & Branch

- **Branch:** `feat/317-parametros-autorizacao-pix` — **sem push, sem PR**. Nasceu do HEAD da `feat/290-gate-debito-reativacao`, então carrega junto os dois commits de docs que também nunca subiram (`838d5be`, `e229a19`).
- **Commits desta sessão:** `a2b3e36`, `792bff1`, `dd9efb7`, `597128c` (ver tabela na §1).
- **Arquivos novos:** `src/lib/billing/calendario-bancario.ts` (+ teste), `src/lib/billing/vencimento.ts` (+ teste), `docs/superpowers/plans/2026-08-15-317-parametros-autorizacao-pix.md`.
- **Verde:** `pnpm typecheck` limpo · `pnpm lint` 0 erros (10 warnings pré-existentes em `src/stories/**`) · `src/lib/billing` 133 testes passando.
- ⚠️ **`pnpm test` completo não está verde nesta máquina:** 7 falhas em `src/app/(app)/equipe/convidar/logic.test.ts`, todas `ECONNREFUSED :5433` — Postgres local fora do ar e o daemon do Docker não sobe aqui. **Pré-existente e alheio a este diff** (verificado: o diff não toca `equipe/`). Antes de abrir PR, subir o banco e rerodar aquele arquivo.
- **Não versionado (pendente de decisão do Rômulo):** `.mcp.json` (aponta para o MCP de docs do Asaas) e `docs/daily-summary/2026-08-14.md`.
- **Comentários postados:** DoD consolidada na #317 (esta sessão); #317, #311, #289, #318 e o de fechamento na #321 (sessão anterior).
- **Memória gravada:** `sandbox-asaas-nao-ativa-pix-automatico.md` + entrada no `MEMORY.md`.

---

## 3. Próximos Passos Sugeridos

1. **Push da branch e PR da #317.** Decisão do Rômulo — está tudo local. Antes: subir o Postgres e fechar as 7 falhas de ambiente (§2).
2. **Fechar #321 e #317.** As duas DoD estão cumpridas; na #317 vale a lista consolidada do comentário de 15/08, não o corpo original. ⚠️ Keyword de fechamento **em inglês** no PR (`Closes #317`) — "Fecha #317" mergeia e deixa a issue aberta em silêncio.
3. **Passo 3 — #319** (`past_due` é terminal, a carência nunca corre): `/superpowers:brainstorming` **antes** de planejar — 5 decisões abertas, e uma delas é o dimensionamento da carência que a D-D desta sessão deixou explicitamente para lá. Destrava #318 e #310.
4. **Agendar o ensaio com clínica de teste em produção.** Único caminho para as 5 perguntas remanescentes: unidade da janela (agora com a regra conservadora esperando confirmação), recorrência com dois valores diferentes, pagador concluir sem teto, identificador da cobrança de ativação e payload do webhook de recusa. Contexto na memória `ensaio-fechamento-ciclo-clinica-teste`.

---

## 4. Achados abertos (não são pendência de issue nenhuma)

Registrados aqui porque nasceram no caminho e não têm dono. Detalhe no `BACKLOG.md`.

| Achado                                                                                                                     | Onde                                                          | Estado                                                                                                                         |
| :------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------- |
| **Qual calendário de feriados o Asaas usa** — o nosso é o nacional; bancário estadual/municipal não entra                  | `src/lib/billing/calendario-bancario.ts`                      | Suposição não medida, mesma classe do `INSTRUCTION_REFUSED → OVERDUE` da #286. Entra no ensaio em produção.                    |
| **O teto de 10 dias corridos só é vigiado por um teste** — nenhum fechamento real passa de 9, então a varredura não o mata | `src/lib/billing/vencimento.test.ts`                          | Aceito e documentado. Apagar aquele caso solta a constante sem nada ficar vermelho.                                            |
| **`consultarCobranca` lê `pixTransaction.failureReason`, campo que não existe** no recurso `payment`                       | `src/lib/billing/provider/asaas.ts:799` (fallback em 818-821) | Achado da #321. É escopo da **#318**, já comentado lá.                                                                         |
| **Discriminador do `erro_aplicacao` continua indefinido** — `externalReference` não serve                                  | #289                                                          | Decisão de produto em aberto entre `immediateQrCode.conciliationIdentifier` e `endToEndIdentifier`. **Trava a label `jules`.** |
| **`.specs/features/debito-reativacao-290/design.md:56` cita `PISO_COBRANCA_CENTAVOS`**, nome que não existe mais           | spec histórica                                                | Registro de época, não corrigido de propósito. O nome vivo é `PISO_COBRANCA_AVULSA_CENTAVOS`.                                  |
| **`moveisPorAno` é cache global sem limite** no calendário bancário                                                        | `src/lib/billing/calendario-bancario.ts`                      | Irrelevante no uso atual (o job toca 2-3 anos); é estado global não limpável entre testes.                                     |
