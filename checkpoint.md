# Checkpoint — Iris

> **Data:** 16/08/2026
> **Branch:** `feat/310-reaproveitar-cobranca-gate` (8 commits nesta sessão, nascida de `main`, **sem push**, sem PR)
> **Status:** 🟢 **Passo 5 (#310) executado em código e verificado.** O gate de reativação deixou de emitir cobrança por cima de cobrança viva: ciclo cuja cobrança o Asaas ainda mantém pagável é reapresentado, o resto vira uma consolidada. A revisão adversarial derrubou a 1ª versão em **3 GRAVES** — um deles **regressão desta branch** — e todos foram corrigidos e cobertos (§1). Verde medido: `pnpm test` **197 arquivos / 1316 testes** · `pnpm test:rls` **106 / 934, 0 pulados** · `typecheck` limpo · `lint` **0 erros / 10 warnings**. Também nesta sessão: **`main` mudou embaixo de nós** — a **#312 fechou isolada** (PR #334) e a **#329** entrou (PR #335); as duas já foram mergeadas para cá e validadas por medição, não pela ausência de conflito. Próximo passo concreto: §3.
>
> **Histórico anterior (15/08/2026):** passos 1, 2, 3 e 4 executados **em código**. O Postgres local voltou: a **D33 fechou na parte mensurável** (`0098` aplicada e medida, 12/12 casos de integração, `test:rls` 102/102 sem pular) — **resta não exercitado só o backfill**, porque `subscription` tem 0 linhas neste banco. A **D35 fechou**: o motivo da recusa passou a ser lido do recurso que o tem. A #318 entrou inteira (classificação por código + coluna `recusa_codigo` + backstop de D+7). **D34 e D36 seguem abertos**, e o D36 ficou **mais** urgente. Achado novo e grave, de produção: **`alerta_risco_auth_select` não existe** — o painel Super Admin reporta zero em silêncio (§1, "A deriva de hash"). Próximo passo concreto: §3.

---

## 0. Ordem de leitura — comece aqui

> **Você está no passo 3 de 4.** Se abriu este arquivo primeiro, leia os dois anteriores antes de agir: eles dizem **o que** fazer e **em que ordem**; este diz apenas onde a última sessão parou.

| #     | Documento                                                                                                 | O que só existe aqui                                                                                                                                                                                           |
| :---- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | [**Ordem de conclusão**](https://claude.ai/code/artifact/59b6c2d8-ea6c-401a-b62f-9572ed26d243) (artifact) | A sequência dos 9 passos e **por que essa ordem** — irreversibilidade, não gravidade. Grafo de dependência, modelo indicado e prompt pronto de cada passo.                                                     |
| **2** | **A issue do passo corrente** (GitHub)                                                                    | Escopo exato, Definição de Pronto e os comentários com as medições já feitas. ⚠️ `gh issue view --comments` **retorna vazio neste ambiente** — usar `gh api repos/romulosutil/iris/issues/N` e `.../comments`. |
| **3** | `checkpoint.md` (este arquivo)                                                                            | Estado da última sessão: o que foi medido, o que ficou aberto **e por qual motivo**, e o próximo passo concreto.                                                                                               |
| **4** | [`BACKLOG.md`](BACKLOG.md)                                                                                | Débitos vivos (D1–D39) e log de sessões. Consulta, não leitura linear — venha buscar o histórico de uma decisão específica.                                                                                    |

### Instruções para o próximo

1. **Leia na ordem acima.** O artifact é o ponto de entrada — ele decide qual issue é a próxima, com qual modelo e com qual skill. Não escolha o passo por conta própria.
2. **Leia os comentários da issue — e desconfie deles também.** Nas issues desta linha os comentários **corrigem o corpo original** em pontos materiais, e planejar pelo corpo sozinho já produziu retrabalho (na #319 o próprio corpo tinha uma conta errada, §1c). Mas na #318 um **comentário** afirmava que o pipe de captura já funcionava, e isso caiu na medição (§1). Comentário é a melhor fonte disponível, não é prova.
3. **Não replaneje medição contra o sandbox do Asaas.** Autorização de Pix Automático não ativa lá (§1e). Toda pergunta sobre o trilho headless só se responde no ensaio com clínica de teste **em produção**.
4. **"Não medido" é resultado, não pendência.** Propague com o motivo. Nunca converta em suposição pelo caminho — foi exatamente esse defeito que criou a #289.
5. **Antes de aplicar a label `jules`**, feche o checklist de handoff (`AGENTS.md` §5.2). A #289 está bloqueada nisso hoje: falta decidir o discriminador.
6. **Ao fechar um passo:** atualize este arquivo **e** acrescente a sessão no `BACKLOG.md`, nessa ordem. O artifact só muda quando a ordem dos passos mudar.
7. **Commits em inglês**, documentação e copy em pt-BR. Formate só os arquivos tocados (`pnpm prettier --write <arquivo>`) — nunca `pnpm format`, que reformata o repo inteiro.

---

## 1. Resumo da Sessão (16/08/2026) — passo 5: #310, a cobrança que já existia

Orquestração em **11 subagentes**. 8 commits, **sem push, sem PR**. O passo 5 da ordem de conclusão: o gate de reativação da #290 emitia cobrança nova sempre, inclusive para o ciclo cuja cobrança o Asaas **ainda mantém pagável** — as duas ficavam vivas, e a clínica podia pagar o mesmo ciclo duas vezes.

| Commit    | O quê                                                                        |
| :-------- | :--------------------------------------------------------------------------- |
| `3b11e26` | `chore(lint): stop linting the .next build nested in a worktree`             |
| `8be7cd9` | `refactor(billing): let the debt carry its cycles, not a dead charge id`     |
| `f2dc0ec` | `feat(billing): ask the gateway whether an existing charge is reusable`      |
| `a6e0666` | `feat(billing): let the gate answer with N charges, or with none`            |
| `7e20735` | `feat(billing): reuse the charge the payer can still pay`                    |
| `21e421b` | `fix(billing): cover the gate edges, and stop a 404 from locking the clinic` |
| `d1602b9` | `feat(assinatura): show every open charge, and say when one is in flight`    |
| `9eb6c0b` | `fix(billing): close the double charges the review found`                    |

### O que fixou o desenho foi a medição do contrato, não a preferência

A issue já trazia a decisão (a) — reaproveitar. O que **não** estava decidido era o que fazer quando o débito total é **maior** que a cobrança antiga, e esse é o caso **comum**, não a borda: no corte por carência congelam-se o ciclo `falhou` (que tem cobrança) e os `aberto`/`apurado` (que não têm).

Medido no MCP de docs do Asaas, e foi o que eliminou a alternativa mais óbvia:

- **Não existe rota para cancelar uma instrução pendente.** Literal: "O cancelamento ocorre apenas de forma indireta, por meio do cancelamento da autorização".
- **`DELETE /v3/payments/{id}` existe, mas a doc não lista quais status ele aceita**, e nada diz que aceita cobrança `OVERDUE` de Pix Automático.
- Confirmado o que sustenta a opção (a): "O Asaas mantém o link ativo com boleto e Pix Copia e Cola após o encerramento da retentativa", com `Payment` em `OVERDUE` e autorização **Ativa**.
- Janela crítica, literal: "O recebimento por outro meio fica bloqueado somente dentro da janela crítica: A partir das 22h de D-1 até o dia do vencimento D."

Consolidar tudo numa cobrança só exigiria cancelar a antiga — ou seja, desenhar contra um endpoint **não medido** para evitar cobrança dupla, que é como se produz cobrança dupla. Daí a decisão **D-2**: cada ciclo com cobrança viva vira uma forma de pagamento própria; o resto vira uma consolidada. O modelo de dados já suportava (âncora + `debito_agrupado_em`); o que mudou foi o gate devolver uma **lista**.

**A janela das 22h não é calculada por relógio (D-6).** O sinal é a existência de instrução `AWAITING_REQUEST`/`SCHEDULED` para aquela cobrança: se o banco já está com o débito a caminho, a tela não mostra código nenhum e diz para aguardar. Dispensa fuso, horário de verão e a suposição de que o relógio do container bate com o do Banco Central.

### As 7 decisões fechadas antes de planejar

`D-1` pagável = `PENDING`/`OVERDUE` **e** `deleted !== true` (não existe status "cancelada" no Asaas; `deleted` é o único marcador) · `D-2` acima · `D-3` 404 segue e emite, rede/5xx **não emite e não reativa** · `D-4` cobrança já paga liquida o ciclo ali mesmo, sem esperar o webhook · `D-5` `provider_charge_id` da âncora só é sobrescrito quando emitimos para ela · `D-6` acima · `D-7` estados terminais com ramo próprio, sem herdar o `throw` de `estornada`.

### A revisão adversarial derrubou a 1ª versão: 3 GRAVES, um deles regressão nossa

Todos corrigidos em `9eb6c0b`, cada um com teste que os reproduz.

1. **Reentrada no gate cobrava duas vezes — e fomos nós que introduzimos.** Com dois ciclos sem cobrança (A=R$13, B=R$7), a 1ª chamada emitia R$20 e agrupava B em A. Na 2ª, A era reaproveitado e **B parecia virgem** (ciclo agrupado nunca recebe `provider_charge_id`), virava âncora e ganhava um 2º POST de R$7. Duas cobranças vivas somando R$27 para dívida de R$20, e pagar a de R$20 quitava só R$13. Antes da #310 a âncora era sempre `ciclos[0]` e a idempotência por `externalReference` matava a 2ª emissão — **a divisão do débito é que abriu o buraco**. `levantarDebito` passou a carregar `debito_agrupado_em`, e ciclo agrupado segue a âncora em vez de virar uma.
2. **Ciclo liquidado pela cascata dentro do próprio laço era cobrado de novo.** Cobrança da âncora `RECEIVED` ⇒ `conciliarPagamentoDeCiclo` liquida a âncora **e** os agrupados; mas o laço iterava um **snapshot**, então o agrupado seguia para o conjunto (b) e ganhava POST por um ciclo já `pago`. O D-4 do plano mandava "recomputar o débito antes de decidir" e isso não tinha sido implementado. Agora o débito é relido do banco depois de qualquer liquidação — o snapshot é obsoleto por construção naquele ponto.
3. **A listagem de instruções trancava a clínica no caminho mais comum.** A cobrança que o próprio gate emite é Pix **comum**, sem instrução nenhuma; um 404 da listagem virava `bloqueado/gateway_indisponivel` e a clínica lia "tente novamente em alguns instantes" — que nunca resolve. 404/400 passaram a significar "não tem instrução"; 5xx, rede e timeout seguem fail-closed, porque aí o gateway não respondeu à pergunta.

**Regra que saiu da revisão e vale além desta issue: "não reaproveitável" ≠ "não pagável pelo cliente".** `DUNNING_REQUESTED`/`DUNNING_RECEIVED` são cobrança terceirizada e **seguem pagáveis pelo pagador**; a allow-list os classificava como não-reaproveitáveis e o gate emitia por cima de uma cobrança viva — fail-closed para o reuso, fail-**open** para a cobrança dupla. Agora **só o 404 libera o id**; todo outro desfecho bloqueia sem emitir.

### O que a mutação provou, e o que ela derrubou

Três testes **passavam em vácuo** e só apareceram porque a mutação foi medida, não presumida:

- O oráculo "não houve consulta de reuso" do plano casaria também o `GET /payments/{id}/pixQrCode` que **toda** emissão faz — o caso passaria contando o QR da cobrança que ele mesmo acabara de emitir.
- Os testes de D-5 e do negativo do DoD passavam com o gate **bloqueado**: nada acontecendo também deixa o `provider_charge_id` intacto. Ganharam asserção de que o reuso de fato ocorreu.
- O primeiro par de testes escrito para o achado 4+5 **sobreviveu ao mutante** ("manda para (b) mantendo o id") porque sem um ciclo virgem ao lado os dois comportamentos são indistinguíveis. Reescritos.

E o teste antigo de P-6 **codificava exatamente o bug do achado 1** — ele afirmava como correto o agrupamento que produzia a segunda cobrança.

### Baselines medidas, e uma que estava errada

`pnpm test` **197 arquivos / 1316 testes** · `pnpm test:rls` **106 arquivos / 934 testes, 0 pulados** · integração `src/lib/billing` **8 arquivos / 56** · `gate-debito.int.test.ts` **27/27** · `asaas.test.ts` **67** · `formulario-ativacao.test.tsx` **32/32** · `typecheck` limpo · `lint` **0 erros / 10 warnings**.

Duas correções de baseline entraram como higiene, e as duas eram vermelho herdado que teria sido confundido com regressão desta entrega:

- **`pnpm lint` acusava 39 erros**, todos vindos de `.worktrees/issue-312/.next/`: o padrão `.next/**` do flat config é **ancorado na raiz** e não pega `.next` aninhado. Zero erros em código-fonte. Ignorados `**/.next/**` (como o `.gitignore` já fazia) e `.worktrees/**`.
- **`vencimento.test.ts` estourava o teto de 5s** do vitest (roda em ~5,4s). Encolher a varredura de 730 dias para caber no default é o que **não** se pode fazer — ela é o único teste que pega o bug sazonal. O teto do caso subiu.

### `main` mudou embaixo da sessão

A branch nasceu de `main` às 11:28. Depois disso, **duas coisas entraram em `main`**:

- **#312 — aviso por e-mail no cancelamento — foi concluída de forma isolada**, fora desta linha de trabalho: PR **#334** (`feat/312-aviso-email-cancelamento`) mergeado em **16/08/2026 às 14:20**, issue **#312 fechada** no mesmo minuto. Leva junto o commit `2adad86`, que reforçou a suíte por teste de mutação depois da revisão. Ou seja: o passo 8 da ordem de conclusão **já está entregue**, e não precisa ser replanejado — o que a ordem previa (escrever a #312 depois da #319 para cobrir os dois gatilhos de corte) foi feito.
- **#329** (guard de tenant do escalonamento) via PR **#335**.

As duas foram mergeadas para esta branch e **validadas por medição** — typecheck, unit e integração — e não pela ausência de conflito. O merge veio limpo, e merge limpo não é prova: é exatamente o modo de falha do #305/#306, em que uma branch antiga reverteu trabalho de `main` sem conflitar.

---

## 1b. Sessão anterior (15/08/2026, 5ª) — #318 em código, D33 e D35 fechados

Orquestração em **6 subagentes**. 13 commits, **sem push, sem PR**. Três frentes: fechar a dívida de medição da #319 (**D33**), consertar o pipe do motivo de recusa (**D35**) e implementar a #318 inteira — classificação por código, coluna nova e o backstop de D+7 da Decisão 2.

| Commit    | O quê                                                                                |
| :-------- | :----------------------------------------------------------------------------------- |
| `30a2b11` | `test(billing): cover the fechar-ciclos route, ordering first (#319)`                |
| `448b404` | `fix(billing): read the Pix refusal reason from the payment instruction`             |
| `adc39c4` | `fix(billing): bind grace-period deadline as timestamptz (#319)`                     |
| `d2424e4` | `fix(billing): report the root cause of a failed cutoff, not the wrapped SQL (#319)` |
| `633623f` | `test(billing): assert the refusal reason before the resource it came from`          |
| `8f497ff` | `docs(migrations): diagnose the 37-migration hash drift on the local DB`             |
| `6a6bc27` | `docs(migrations): correct the hash guard docstring with measured numbers`           |
| `92aadb2` | `feat(billing): persist the raw refusal code on the billing cycle (#318)`            |
| `1c83ec1` | `feat(billing): route the refusal outcome by its gateway code (#318)`                |
| `c5480ee` | `test(billing): make the refusal log the oracle for the silent groups (#318)`        |
| `89bb61c` | `fix(test): type the console.warn spy by inference (#318)`                           |
| `dbd7cae` | `feat(db): store the due date we send to the gateway (0100, #318)`                   |
| `f0c1773` | `feat(billing): close the refusal hole with a D+7 backstop (#318)`                   |

### D33 — fechado na parte mensurável, e o que continua não medido

O Postgres local voltou. A `0098` **já estava aplicada** (pela sessão anterior, não por esta). Medido em `information_schema`/`pg_indexes`, não lido no diff: `column_default = '10'`, `is_nullable = NO`, e `subscription_carencia_idx` = `btree (status, past_due_desde)`.

- **12 casos de integração: 12/12, 0 pulados.** Armadilha que vale registrar porque custou uma passada: `pnpm vitest run <arquivo>.int.test.ts` **coleta zero testes e sai verde** — `vitest.config.ts` tem `exclude: ["**/*.int.test.ts"]`. O caminho é `--config vitest.integration.config.ts`. Suíte que não coleta nada é indistinguível de suíte que passa.
- **`pnpm test:rls`: 102 arquivos, 102 executados, 0 pulados**, 869 testes. O medo registrado em [[suite-rls-rodando-como-superusuario]] ("verde com 64/68 pulados") **não se materializou**.
- As 7 falhas de `src/app/(app)/equipe/convidar/logic.test.ts` eram só `ECONNREFUSED :5433` e **sumiram**: 7/7.

**Continua não medido, e o motivo importa: o backfill.** `subscription` tem **0 linhas** neste banco, então o `UPDATE … WHERE carencia_dias = 7` da `0098` tocou 0 linhas. Em base **com** dados — produção — o backfill segue não exercitado. Não converter isso em "funcionou": o que se mediu foi o DDL, não a migração de dado.

**Duas correções de código saíram da execução real, e nenhuma das duas era alcançável sem banco:**

- **`adc39c4` — o template `sql` do Drizzle não codifica `Date`** (`ERR_INVALID_ARG_TYPE` em runtime). O predicado de carência precisa de `${iso}::timestamptz`. **`toSQL()` nunca poderia ter pego isso**: ele renderiza o statement sem codificar parâmetro nenhum. É literalmente o buraco que o D33 nomeava — "provado por `toSQL()`, não por execução" era a descrição exata do defeito que estava lá.
- **`d2424e4` — a cadeia `??` herdada sobre `(e as any).detail ?? .hint ?? .originalError` era placebo.** `DrizzleQueryError` não tem nenhum dos três, então caía em `.message`, **que é o SQL que nós mesmos emitimos** — o job reportava a própria query como causa. Virou `detalharErro()`, que anda a cadeia `cause` até a raiz (teto de 8 níveis) e **anexa** `code`/`detail`/`hint` em vez de substituir `message`. Princípio que fica: `detail`/`hint` do Postgres **complementam** a mensagem, nunca a substituem.

**Correção metodológica:** `created_at` em `drizzle.__drizzle_migrations` **é o `when` do journal**, não o instante em que a migração rodou. Não serve para datar aplicação — nem para ordenar por tempo real.

### D35 — fechado: o motivo passou a ser lido do recurso que o tem

Confirmado no MCP de docs do Asaas: `GET /v3/pix/automatic/paymentInstructions/{id}` devolve `refusalReason` com `type: "string"` e **sem `enum`** — catálogo aberto **por contrato**, não por precaução nossa. O DTO tem `id`, `authorization{id,…}`, `paymentId`, `retryAttempt`, `purpose` e um `status` com enum **fechado** (`AWAITING_REQUEST|SCHEDULED|DONE|CANCELLED|REFUSED`).

Saíram as três leituras vazias de `asaas.ts:898-901`. Entraram:

- `EventoWebhookNormalizado.providerInstructionId` — o normalizador **já enxergava** `paymentInstruction.id` e o descartava;
- `consultarCobranca(id, { providerInstructionId })`, que consulta a instrução quando o id veio junto;
- fallback por `GET /pix/automatic/paymentInstructions?paymentId=…&status=REFUSED`. **O filtro `status=REFUSED` é load-bearing:** sob `ALLOW_THREE_IN_SEVEN_DAYS` uma cobrança tem **várias** instruções, e uma `SCHEDULED` não tem motivo nenhum para devolver.

**Degradação documentada, e é escolha:** falha ao buscar ⇒ `motivoRecusa: null` + `console.warn("[billing-recusa] …")`. O motivo é **enriquecimento**; quem decide o destino do ciclo é o `status`, que já veio no evento. Deixar o 404 subir faria a conciliação inteira falhar por um campo acessório — trocar dinheiro conciliado por diagnóstico.

**Fixtures inventadas migradas** para os códigos reais (`LIMITE_AUTORIZADO_EXCEDIDO` → `MAXIMUM_AMOUNT_EXCEEDED`, `SALDO_INSUFICIENTE` → `PAYMENT_OVERDUE`): `asaas.test.ts` (2), `route.int.test.ts` (2), `reprocessamento-provedor.int.test.ts` (2), `docs/superpowers/plans/2026-08-13-286-teto-pix-automatico.md` (4). E os dublês de **cobrança** passaram a **não ter campo de motivo nenhum**, como a produção — o dublê que devolvia o literal esperado era metade do defeito.

### #318, núcleo: a coluna e a classificação

**Migração `0099_billing_cycle_recusa_codigo`**, idx 99, `when` 1786819013377. Medido no banco: `text`, nullable, sem default; `column_privileges` = `app_role SELECT` · `iris_auth SELECT,INSERT,UPDATE`.

`src/lib/billing/classificacao-recusa.ts` separa **de propósito** duas coisas que a tabela da sessão anterior misturava:

- **`CATALOGO`** — fato do gateway: 9 grupos, 25 códigos.
- **`POLITICAS`** — decisão nossa: `marcaCicloFalhou`, `carimbaPastDue`, `conciliaComoPago`, `valeGastarRetentativa`, `corteImediato`, `diagnostico`, `copy`.

O catálogo muda quando o Asaas publica código novo; a política muda quando **nós** mudamos de ideia. Misturados, toda revisão de produto viraria edição de fato de gateway.

Assinatura: `classificarRecusa(codigo: string | null): PoliticaRecusa`. **G0 é o `?? "G0"` do lookup**, então código desconhecido **e** `null` caem no mesmo lugar sem ramo especial. Comparação **exata** (`trim` + caixa alta), sem `includes`/`LIKE` — casar por substring é o defeito que a issue existe para matar, um nível abaixo.

**G8 é correção de dinheiro, não classificação.** `liquidarCiclo` foi extraído e é o **mesmo** caminho do pagamento confirmado: ciclo → `pago` + `cobrado_em`, cascata de `debito_agrupado_em`, saída de `past_due` com `past_due_desde` zerado. Antes, `PAYMENT_ALREADY_DONE` virava `falhou` → `past_due` → **dívida congelada contra clínica adimplente**, com o gate da #290 barrando exatamente quem já tinha pago.

`reprocessarEventosPendentes` passou a informar `{ providerInstructionId }`, então a varredura de reprocessamento deixou de cair no fallback por índice.

**O achado que mudou o desenho dos testes:** no banco, **G6, G7 e G0 são indistinguíveis** — os três não escrevem nada. Medir só tabelas deixaria passar um mapa que jogasse G6 em G0. O **log virou o oráculo** desses três, com as asserções de pertinência ao grupo **no fim** de cada caso, para o oráculo comportamental morrer primeiro. 4 mutantes provados, entre eles `POLITICAS.G6.marcaCicloFalhou: false→true`, que mostra literalmente o dano que G6 evita.

### O backstop de D+7 (Decisão 2 implementada)

**Migração `0100`**: `billing_cycle.vencimento_cobranca timestamptz`, nullable **sem backfill**, `when` 1786820981475. Índice `billing_cycle_backstop_idx = btree (status, vencimento_cobranca)`. Escrita na **mesma instrução** que `provider_charge_id`/`cobranca_emitida_em`, com o **exato `Date`** passado a `emitirCobrancaDeCiclo` — não uma recomputação.

**Por que coluna nova, e não um marco existente — é erro de sinal, não gosto.** A emissão acontece de 2 a 10 dias úteis **antes** do vencimento (regra da #317), então D+7 contado de `cobranca_emitida_em` ou `apurado_em` cairia **antes** da data em que a clínica tinha de pagar — com folga no cluster de fim de ano, **a mesma sazonalidade do bug que a #317 fechou**. `cobrado_em` só existe depois de pago, e ciclo pago não precisa de backstop. Recalcular `vencimentoCobrancaDeCiclo(cobranca_emitida_em)` foi recusado por outro motivo: mexer no calendário bancário **reescreveria retroativamente** o vencimento de cobranças já emitidas.

**Ordem na rota interna: quarta e última** — reprocessar → fechar ciclos → carência → backstop. O argumento não é cosmético:

> O backstop carimba `past_due_desde = agora`; a carência é `past_due_desde + carencia_dias`; o CHECK só exige `>= 0`. Com o backstop **antes** da carência, uma clínica de carência **zero** seria carimbada e cortada **no mesmo tick**, sem um único dia de prazo — por um ato irreversível.

**O `falhou` é o elo que faltava.** `congelarCiclosComoDebito` não congela `aguardando_pagamento`; carimbar `past_due` sem levar o ciclo a `falhou` produziria corte com `levantarDebito = 0` e o gate da #290 aberto — exatamente a perda que a D-4 da #319 fechou no outro ramo.

**Fail-closed do G3:** corta só se `consultarVinculo` responder `cancelada` (mapeamento de `CANCELLED`/`REFUSED`/`EXPIRED`, `asaas.ts:225`). Barram o corte: `autorizada` (o código mentiu ⇒ vira G7), qualquer outro status incluindo o default `pendente`, rede/timeout/5xx, e ausência de `provider`/`provider_subscription_id`. **Toda degradação leva ao mesmo lugar seguro:** carimba (reversível por pagamento) e deixa o corte para a carência, 10 dias depois.

`route.test.ts` foi de **16 para 22** casos. Além da ordem, passou a provar **cada etapa chamada exatamente 1×** — o que mata a "correção" que duplica a chamada em vez de movê-la.

**Baselines finais, medidas:** unit `src/lib/billing` **138/138** · unit total **1251/1251** · integração **104 arquivos / 896 testes / 0 pulados** · `pnpm typecheck` limpo · `pnpm lint` 0 erros / 10 warnings pré-existentes.

### A deriva de hash: a premissa da sessão anterior estava invertida

Das **37 divergências** de hash no Postgres local: **35 são só fim de linha** (não 3, como se supunha), **2 são de conteúdo** (`0072`, `0073`), **0 sem arquivo em disco**.

**Causa medida:** `core.autocrlf=true` vindo do `gitconfig` do instalador do Git for Windows contra `* text=auto` — índice 100% LF, worktree misto (117 crlf / 14 lf), e `__drizzle_migrations` congelou o EOL vivo **no momento de cada aplicação**. A divergência corre **nos dois sentidos**. Falsificadas com evidência, não descartadas por plausibilidade: o algoritmo do drizzle-orm 0.45.2 é idêntico ao nosso; Prettier está fora (conteúdo byte-idêntico módulo `\r`); dump-restore está fora.

Medido de passagem: `0055_fix_purga_report_oracle` está no journal e **nunca foi aplicado aqui** — é o sintoma da #165, remediado pela `0063`, que **está** aplicada.

`0073` é **não-problema**: o hash local é byte-idêntico ao `hashAplicado` **de produção**; a edição do `b53b294` não rodou em lugar nenhum e a `0082` remediou.

**`0072_super_admin_role` é defeito real, e é de produção.** O hash local não corresponde a **nenhum blob do repositório** — varredura exaustiva de `git cat-file --batch-all-objects`, 919 candidatos, testados em LF **e** CRLF. Ou seja: rodou de working tree não commitado. O commit `f6e0884` acrescenta exatamente uma coisa: `CREATE POLICY alerta_risco_auth_select ON alerta_risco_clinico … TO iris_auth`.

Medido no banco local:

- policy **ausente** (`pg_policies` só tem `alerta_risco_scope`, para `{app_role}`);
- `relrowsecurity` e `relforcerowsecurity` ambos `true`;
- `has_column_privilege('iris_auth', …)` **`true`**.

**Grant presente + policy ausente = zero linhas, sem erro de permissão.** `src/app/(admin)/benjamin/queries.ts` lê por `authDb` (role `iris_auth`), então o painel Super Admin reporta `totalAlertas: 0` **em silêncio**. Não é provável por `count(*)`: a tabela está vazia e `0` é a resposta dos dois jeitos — a prova é `pg_policies` + `has_column_privilege`, não a contagem.

**Produção corre o mesmo risco, por inferência forte — e isso NÃO é medição.** O `hashAplicado` pinado de produção é exatamente o sha256 LF do blob **pré-fix**, e `alerta_risco_auth_select` é criada num único lugar em todo o repo. **Não medido** (sem acesso a produção nesta sessão): se a policy existe lá. Fecha com uma consulta read-only, via console Bash do `iris-postgres`, `psql -U iris -d iris`:

```sql
SELECT policyname, roles, cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'alerta_risco_clinico';
```

**Varredura de schema:** os 170 objetos declarados pelas 37 migrações divergentes foram conferidos em `information_schema`/`pg_policies`/`pg_proc`/`pg_indexes`/`pg_type` — **1 ausência genuína**, a de cima. Billing limpo. Diagnóstico completo em `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`. **Nada foi pinado em `DERIVAS_CONHECIDAS`** — silenciar 35 rótulos de EOL esconderia o 36º que for real.

---

## 1c. Sessão anterior (15/08/2026, 4ª) — passo 4: #318, a decisão de produto

Executado o **passo 4**: issue [#318](https://github.com/romulosutil/Iris/issues/318) — `REFUSED` colapsa causas distintas num único desfecho. O passo era **decisão de produto antes de código**: fechar a tabela código → desfecho e o checklist §5.2, depois aplicar a label `jules`.

A tabela está fechada e publicada na issue ([comentário](https://github.com/romulosutil/Iris/issues/318#issuecomment-5303443178)), e as três decisões que sobraram foram fechadas pelo tech lead num [segundo comentário](https://github.com/romulosutil/Iris/issues/318#issuecomment-5303503322), a pedido do Rômulo. **A label não foi aplicada, e não será** — o recon derrubou premissas que mudam o roteamento da issue para `/tlc-spec-driven`.

Orquestração em 3 subagentes paralelos: recon da issue e comentários (via `gh api`) × mapeamento do caminho da recusa no código × levantamento do catálogo oficial contra o MCP de docs do Asaas. Nenhum código alterado nesta sessão.

### As 3 correções materiais que o recon produziu

1. **O motivo nunca chega — o pipe está quebrado na origem.** O comentário de 14/08 na issue concluía "o motivo já é capturado e gravado, só é ignorado", e por isso estimava a issue como barata. Medido como falso: `consultarCobranca` (`asaas.ts:898-901`) lê `refusalReason` / `failureReason` / `pixTransaction.failureReason` do corpo de `GET /payments/{id}`, e o `PaymentGetResponseDTO` **não tem nenhum dos três** — `pixTransaction` é `string` (o id), não objeto, então o terceiro fallback não tem onde procurar nem no tipo. Do outro lado, `normalizarEventoAsaas` (`asaas.ts:378-473`) lê `paymentInstruction` só para ids e status, e descarta `refusalReason`. Em produção, `motivoRecusa` é `null` **por construção**. Uma tabela de classificação plugada hoje classificaria `null` para sempre — e passaria em todos os testes, porque os dublês devolvem o literal que o próprio teste espera.
2. **O catálogo é aberto, não enum fechado.** São 25 códigos publicados, mas o OpenAPI declara `refusalReason` como `string` **sem `enum`** e a doc avisa que valores entram sem aviso prévio. Ramo default deixa de ser zelo e vira requisito.
3. **A retentativa extradia é comandada por nós.** `ALLOW_THREE_IN_SEVEN_DAYS` (#317) só **habilita**; executar é `POST /pix/automatic/paymentInstructions/{id}/retries`, e as validações do endpoint são de contagem, data e política — **nenhuma de motivo**. Isso muda o sentido da coluna "é retentável" da tabela: ela não descreve o que o gateway faz sozinho, e sim **se vale gastar uma das 3 tentativas**. Orçamento finito é o que torna a classificação necessária. (O que é automático e não consome o orçamento é a retentativa **intradia** do banco do pagador, entre 18h e 21h.)

### A tabela: 25 códigos, 9 grupos

Grupos definidos por **desfecho**, não por origem: dois códigos ficam juntos se e somente se o sistema deve fazer a mesma coisa com eles.

| Grupo                                               | Carimba `past_due`?                       | Consome carência?  | Vale gastar retentativa?       | Clínica vê                                                          |
| :-------------------------------------------------- | :---------------------------------------- | :----------------- | :----------------------------- | :------------------------------------------------------------------ |
| **G1** Teto (`MAXIMUM_AMOUNT_EXCEEDED`)             | Sim                                       | Sim (10 d)         | Sim, só depois que ela agir    | Estado próprio (subir limite no banco), **não** a tarja de devedora |
| **G2** Saldo (`PAYMENT_OVERDUE`)                    | Sim                                       | Sim                | Sim — caso canônico do `3R_7D` | Mensalidade não paga + prazo                                        |
| **G3** Autorização morta (3 códigos)                | Não — **corte imediato**, com confirmação | Não (carência = 0) | Não                            | Autorização inválida + reativar                                     |
| **G4** Cadastral da clínica (3 códigos)             | Sim                                       | Sim                | Depois da correção             | CPF/CNPJ não confere + corrigir                                     |
| **G5** Conta terminal (`ACCOUNT_CLOSED`/`_BLOCKED`) | Sim                                       | Sim                | **Não**                        | Conta encerrada + outra conta                                       |
| **G6** Defeito nosso (9 códigos)                    | Não                                       | Não                | Só depois do conserto          | **Nada**                                                            |
| **G7** Operacional (5 códigos)                      | Não — só o backstop de D+7                | Só a partir de D+7 | Sim                            | Nada até D+7; depois igual a G2                                     |
| **G8** Já resolvido (`PAYMENT_ALREADY_DONE`)        | Não                                       | Não                | Não                            | Ciclo concilia como **pago**                                        |
| **G0** Desconhecido (default)                       | Não — só o backstop de D+7                | Só a partir de D+7 | Sim                            | Igual a G7                                                          |

**A regra que gera a 1ª coluna** (vale para a tabela inteira, e é o que a torna ensinável):

> Carimba `past_due` no ato quando a recusa é, **por si só, prova de um fato sobre a clínica sobre o qual ela pode agir**. Não carimba quando a recusa não prova nada sobre ela.

G1 (o limite é dela), G2 (a conta dela não tinha saldo), G4 (o documento é dela) e G5 (a conta é dela) provam. G6 prova algo sobre **nós**; G7 prova algo sobre o **banco**; G0 não se sabe.

Quatro decisões que sustentam a tabela e não são óbvias:

- **G1 carimba `past_due` de propósito.** O instinto é poupar quem "tem saldo e quer pagar", mas sem carimbo a assinatura nunca é cortada e um teto baixo demais vira assinatura gratuita vitalícia, sem erro em lugar nenhum. Os 10 dias **são** o prazo para subir o limite. O que muda em relação a G2 não é o relógio — é a copy e o estado de UI.
- **G3 corta na hora, mas nunca só pelo código.** Antes de cancelar, reconsultar `GET /pix/automatic/authorizations/{id}` e só cortar se o gateway **disser** `CANCELLED`/`EXPIRED`/`REFUSED`; se responder `ACTIVE`, o código mente e o caso vira G7. É o mesmo fail-closed que a #319 construiu em `cancelarVinculo`. Sem o guard, código espúrio revoga autorização — e revogação não volta sem novo consentimento no app do banco.
- **G6 não move estado nenhum**, e não é só "não carimba `past_due`": o ciclo **não vai para `falhou`**. Motivo concreto: `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` (retentativa nossa mal emitida) chega **depois** da recusa de saldo que já carimbou `past_due` corretamente. Deixar G6 escrever apagaria o estado certo com erro nosso.
- **G7/G0 não escalam por contador, escalam por prazo** — ver a Decisão 2 abaixo, que substituiu o desenho original.

E uma correção de dinheiro que a classificação encontrou de brinde: **`PAYMENT_ALREADY_DONE` significa cobrança liquidada.** Hoje viraria `falhou` → `past_due` → dívida contra clínica adimplente.

### Os 5 pontos abertos do §5.2, fechados

- **Metade cara (reemissão) não entra na #318** — vira issue própria, junto da #322. Mas as decisões abaixo ficam fechadas agora porque determinam o estado de UI que a #318 já precisa desenhar.
- **Quem dispara: a clínica, por botão** ("Já ajustei o limite"), nunca varredura. O guia **proíbe** o banco de notificar que o cliente ajustou o teto — não existe sinal para varredura observar, e varredura cega queimaria as 3 tentativas sem informação. A clínica é o único sensor que existe.
- **Limites da reemissão: 3 por ciclo, no máx. 1 por dia, nenhuma depois de D+7 do vencimento.** Não é escolha nossa — é o teto do `3R_7D`, e o gateway devolve 400 em cada borda. Botão **desabilitado com motivo escrito** ao atingir qualquer uma, em vez de deixar a clínica tocar para receber erro de gateway.
- **Idempotência:** não comandar se já houver instrução pendente (`AWAITING_REQUEST`/`SCHEDULED`) — o gateway recusaria com `PAYMENT_ALREADY_SCHEDULED`, que é G6, defeito nosso.
- **Copy sem citar valor** (o teto é ilegível por regulação). Regra que vale para os 9 grupos: **dizer o que fazer e onde, nunca o código** — a própria doc do Asaas orienta não expor o código bruto.

### As 3 decisões que ficaram pendentes, fechadas pelo tech lead

Rômulo pediu a decisão em vez da consulta. Nenhuma volta como "a validar" — o §5.2 existe para que o executor não escolha por nós. **Duas das três mudaram ao serem decididas de verdade**, e a razão da mudança é a parte que importa.

**Decisão 1 — G5 RATIFICADA, por outro motivo.** `ACCOUNT_CLOSED`/`ACCOUNT_BLOCKED` seguem carimbando, consumindo carência e nunca gastando retentativa. Mas a justificativa "implemento a intenção da DoD, não a letra" era **fraca** — vira licença para reinterpretar qualquer DoD. Substituída pela regra geral da 1ª coluna (acima): conta encerrada é fato sobre a clínica tanto quanto saldo zerado, e por isso carimba. **Restrição inegociável que sai junto:** `ACCOUNT_BLOCKED` **não** pode disparar o corte imediato do G3 — bloqueio é frequentemente temporário (judicial, antifraude, revisão cadastral), e o corte revoga a autorização, que não volta sem novo consentimento. Cortar na hora por um bloqueio que se resolve em 3 dias troca problema reversível por irreversível.

**Decisão 2 — o contador de 3 CAI. Entra prazo: um ciclo não pago em D+7 do vencimento carimba `past_due`, qualquer que tenha sido o motivo — exceto G6.** O contador tinha três defeitos que só apareceram ao tentar defendê-lo:

1. **Não conta nada enquanto a #322 não existir.** Sem orquestração de retentativa, cada ciclo produz **uma** recusa; o contador nunca chegaria a 3 e o banco que erra sempre viraria assinatura gratuita vitalícia — exatamente o buraco que ele foi inventado para tapar. Guard que só funciona depois de outra issue entrar não é guard.
2. **Depende de quantos webhooks o gateway resolve mandar**, fato não medido (#321) e fora do nosso controle. Régua que se move sozinha.
3. **Precisaria de persistência** — uma coluna de contador, mais schema para medir a coisa errada.

O prazo não tem nenhum dos três, e **o número não é escolha**: em D+7 o `POST .../retries` passa a devolver 400 pelo limite `7D`, então o trilho automático está **provadamente** esgotado, seja qual for o motivo original. O que a recusa operacional compra é **tempo, não imunidade** — o banco ter falhado não faz a mensalidade deixar de ser devida. `past_due_desde` recebe o instante do carimbo (D+7), não a data da recusa: o relógio começa quando concluímos que a clínica deve, então ela fica com 7 + 10 = 17 dias, e isso é intencional. **G6 não tem backstop, deliberadamente:** defeito nosso é custo nosso, e cobrar a clínica por um `dueDate` que **nós** calculamos seria carimbá-la de inadimplente pelo nosso bug. Roda como varredura na rota interna, **depois** de `fecharCiclosVencendo` (mesma regra de ordem da #319). Régua de mutação: um teste em D+6 que não carimba, um em D+7 que carimba, medindo a coluna.

**Decisão 3 — coluna `billing_cycle.recusa_codigo text` APROVADA, e a razão não é relatório.** A justificativa pela consulta da DoD também era fraca (DoD se afrouxa). A razão real é que a coluna é **estrutural para a 4ª coluna da tabela**: a classificação acontece na escrita, a tela lê depois, noutro request — sem o código persistido o app não sabe por que o ciclo falhou, o G1 nunca renderiza "suba o limite no seu banco", e os 9 grupos passam a diferir só em log. A consulta da DoD é sintoma; o requisito é a UI. `LIKE` sobre `erro` está descartado sem discussão: texto livre cobrindo situações distintas **é o defeito que a issue existe para matar**. Guarda o **código cru**, grupo derivado em código — do cru sempre se re-deriva o grupo, do grupo não se recupera o cru.

SQL medido nas migrações (não em `information_schema` — sem Postgres nesta máquina): `billing_cycle` tem privilégio **de tabela** (`0071:237` para `app_role`, `0071:244` + `0075:67` para `iris_auth`) e **nenhum `REVOKE` jamais tocou esta tabela**, então a coluna nova já entra coberta. Emitir os `GRANT` explícitos mesmo assim, seguindo o idioma de `subscription` (`0088:28-29`, `0089:33-34`) e não o da própria `billing_cycle` (`0097` não emitiu nenhum): custo de uma linha, e sobrevive ao dia em que alguém converter a tabela para granular. Nullable sem default, igual a `erro` (`0071:106`). Nenhuma policy muda (são por linha, só citam `clinic_id`); não há view sobre a tabela; `billing_apurar_ciclo` faz `SELECT` com lista explícita, sem `CREATE OR REPLACE`. Caminho canônico é `pnpm db:generate` e depois editar o `.sql` para os `GRANT`, **sem tocar no snapshot**. Próxima tag `0099`, idx 99.

**Consequência de processo:** a #318 sai da rota `jules` e vai para **`/tlc-spec-driven`**. Não é perda — a tarefa 0 também não era entregável por executor autônomo, por não ser verificável em sandbox.

### O que falta, em ordem

1. Migrar as fixtures inventadas para os códigos reais (não depende de nada, pode ir primeiro).
2. Tarefa 0: ler `paymentInstruction.refusalReason` pelo recurso certo, com o `paymentInstruction.id` que o webhook já entrega e o normalizador descarta. Remover a leitura sobre `GET /payments/{id}` — não é defensiva, é vazia.
3. Migração `0099_billing_cycle_recusa_codigo` + gravação de `recusa_codigo` no ramo `recusada`.
4. `classificarRecusa(codigo) → grupo` em `subscription.ts:1236`, governando as três decisões que hoje são incondicionais: texto do `erro`, se o ciclo vai a `falhou`, se o bloco de carimbo roda.
5. Varredura do backstop de D+7 na rota interna, depois de `fecharCiclosVencendo`.
6. UI por grupo — sem ela os 9 grupos diferem só em log. Cruza com a #312 e com o **D36**.

Um teste por grupo, com régua de comportamento: apagar a linha daquele grupo no mapa derruba **aquele** teste e nenhum outro.

---

## 1d. Sessão anterior (15/08/2026, 3ª) — passo 3: #319

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

## 1e. Sessão anterior (15/08/2026, 2ª) — passo 2: #317

Parâmetros que só existem na criação da autorização: `minLimitValue` (R$ 39,00, derivado de `FAIXAS_PRECIFICACAO[0]`) + `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"`; `PISO_COBRANCA_CENTAVOS` → `PISO_COBRANCA_AVULSA_CENTAVOS`; `vencimentoCobrancaDeCiclo` + `calendario-bancario.ts` com feriados móveis calculados da Páscoa. Commits `a2b3e36`, `792bff1`, `dd9efb7`, `597128c`.

O bug sazonal do caminho: `vencimento: somarDias(agora, 5)` somava **dias corridos** — atravessando Carnaval ou o cluster de fim de ano, cinco corridos deixam menos de dois dias úteis de antecedência (recusa `RECEIVED_TOO_LATE`). Verde o ano inteiro, vermelho em fevereiro e dezembro. A regra nova satisfaz a metade mais restritiva de cada leitura da doc: **piso em dias úteis bancários, teto em dias corridos**.

Revisão adversarial pegou 4 defeitos, todos corrigidos: faltavam 24/12 e 31/12 (os dois dias bancários-e-não-civis, que é exatamente a distinção que o módulo diz fazer — sem eles, 8 fechamentos em 2026-27 caíam para 1 dia útil); a varredura de 730 dias era tautológica (importava as constantes que deveria vigiar); teto da janela e `diasCorridosEntre` sem cobertura; faltava o teste de cluster de fim de ano que o comentário 2 da issue pedia.

Decisões: **D-A** `minLimitValue` deriva de `FAIXAS_PRECIFICACAO[0]`, não de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS` (LEGADO) · **D-B** só a flag, orquestração é a **#322** · **D-C** janela conservadora sem medição · **D-D** `carencia_dias` fica em 7 e redimensionar é pauta da #319 — **resolvido nesta 3ª sessão: virou 10** · **D-E** rename do piso, número e comentário seguem escopo da **#311**.

---

## 1f. Sessão anterior (15/08/2026, 1ª) — passo 1: #321

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

- **Branch:** `feat/310-reaproveitar-cobranca-gate` — **sem push, sem PR**, 8 commits próprios, nascida de `main` e com `origin/main` já mergeada (traz #312 e #329). Só a #310; não acumula passos.
  - ⚠️ **Keyword de fechamento em inglês** no PR: `Closes #310`. "Fecha #310" mergeia e deixa a issue **aberta em silêncio**.
- **O passo 5 anterior (`feat/317-parametros-autorizacao-pix`) já foi mergeado:** está 0 commits à frente de `main` e 24 atrás. #317, #319 e #318 estão em `main`, com as migrações renumeradas para `0099`/`0100`/`0101`. O checkpoint anterior dizia "28 commits sem push" — **desatualizado, não confiar**.
- **`fix/329-escalonamento-guard-tenant` também já entrou** (PR #335), e a **#312 fechou isolada** (PR #334, 16/08 14:20).
- **Commits da sessão de 15/08 (5ª), 13:** `30a2b11`, `448b404`, `adc39c4`, `d2424e4`, `633623f`, `8f497ff`, `6a6bc27`, `92aadb2`, `1c83ec1`, `c5480ee`, `89bb61c`, `dbd7cae`, `f0c1773` (+ o de docs que fecha a sessão). Tabela com os subjects em §1.
- **Sessão de 15/08 (4ª, passo 4 / #318): nenhum código alterado** — a entrega foi decisão de produto, publicada como comentário na issue.
- **Commits da sessão de 15/08 (3ª):** `eea42ea`, `061a147`, `2d9e486` (+ o de docs que fecha a sessão).
- **Arquivos novos da 5ª sessão:** `db/migrations/0099_billing_cycle_recusa_codigo.sql` e `0100_billing_cycle_vencimento_cobranca.sql` (+ snapshots e journal), `src/lib/billing/classificacao-recusa.ts`, `src/lib/billing/classificacao-recusa.int.test.ts`, `src/lib/billing/backstop-prazo.int.test.ts`, `src/app/api/internal/billing/fechar-ciclos/route.test.ts`, `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`.
- **Arquivos novos das sessões anteriores:** `db/migrations/0098_subscription_carencia_dez_dias.sql` (+ snapshot), `src/lib/billing/carencia-vencida.int.test.ts`, `docs/superpowers/plans/2026-08-15-319-carencia-que-nunca-corre.md`.
- ✅ **O Postgres local está no ar e as migrações estão aplicadas** — `0098`, `0099` e `0100` verificadas em `information_schema`/`pg_indexes`/`column_privileges`. As 7 falhas de `src/app/(app)/equipe/convidar/logic.test.ts` eram `ECONNREFUSED :5433` e **sumiram** (7/7).
- **Baselines medidas nesta sessão:** unit `src/lib/billing` **138/138** · unit total **1251/1251** · integração **104 arquivos / 896 testes / 0 pulados** · `pnpm test:rls` **102 arquivos / 102 executados / 0 pulados**, 869 testes · `typecheck` limpo · `lint` 0 erros / 10 warnings pré-existentes em `src/stories/**`.
- ⚠️ **`pnpm vitest run <arquivo>.int.test.ts` coleta ZERO testes e sai verde** — `vitest.config.ts` tem `exclude: ["**/*.int.test.ts"]`. Integração só roda com `--config vitest.integration.config.ts`. Conferir o número de testes coletados, não a cor.
- ⚠️ **`git status` mostra 5 arquivos modificados com `git diff` vazio** — é o `core.autocrlf` da deriva de hash (§1), não mudança pendente.
- **Não versionado (pendente de decisão do Rômulo):** `.mcp.json` (aponta para o MCP de docs do Asaas) e `docs/daily-summary/2026-08-14.md`.
- **Memória gravada:** `sandbox-asaas-nao-ativa-pix-automatico.md`, `janela-dia-util-24-12-e-31-12.md`, `carencia-nunca-corria-e-ordem-de-escrita.md`.

---

## 3. Próximos Passos Sugeridos

1. **Medir `alerta_risco_auth_select` em produção.** É o item mais barato e o de maior dano por token gasto: uma consulta read-only (§1, "A deriva de hash") separa "o painel Super Admin está mentindo zero há semanas" de "só o banco local está torto". Enquanto não se mede, o estado correto é **não medido**, não "provavelmente afetado".
2. **Push da branch `feat/310-...` e PR.** Decisão do Rômulo — está tudo local. ⚠️ `Closes #310`, **em inglês**.
3. **Passo 6 da linha: #311** (piso de cobrança). O rename já foi feito no passo 2; sobra ajustar a constante com a medição do passo 1 na mão — piso real do Pix avulso é **R$ 5,00**, sobre `value − discount`. Se o Asaas não tiver mínimo próprio, a entrega vira **remover** a constante, não ajustá-la. É item de label `jules`, depois de colar a medição num comentário da issue.
4. **Passo 7: #289** (`erro_aplicacao` ambíguo) — **continua travado** no mesmo ponto: falta decidir o discriminador, e `externalReference` foi **medido como imprestável**. Não aplicar a label antes disso.
5. **D36 — a clínica continua sem ver nada.** A #310 acrescentou tela para as cobranças em aberto, mas a recusa em si (`recusa_codigo`, os 9 grupos da #318) segue sem leitor: `faixa-trial.tsx` devolve `null` para `pagamento_atrasado`. É o maior buraco de produto vivo hoje.
6. **Exercitar o backfill da `0098` em base com dados.** Não é reabrir o D33: é a parte dele que ficou fora do alcance da medição, e o ensaio com clínica de teste em produção é a primeira oportunidade real.
7. **Agendar o ensaio com clínica de teste em produção.** Único caminho para as perguntas remanescentes: unidade da janela, recorrência com dois valores diferentes, pagador concluir sem teto, identificador da cobrança de ativação, `DELETE` de autorização já cancelada, **em que campo do payload de webhook o código de recusa pousa** e **se o envelope que `normalizarEventoAsaas` assume é o real**.

---

## 3b. Decisões que ficam com o Rômulo

As três primeiras nasceram nesta sessão de 16/08; as demais vêm da anterior e **seguem abertas**. Nenhuma tem recomendação embutida — a escolha é dele.

1. **Cobrança apagada no painel tranca a clínica, de propósito.** Hoje, `deleted: true` bloqueia com "fale com o suporte" e não libera o id, porque libertá-lo arriscaria a idempotência de `debito:<ancora>` **ressuscitar** a cobrança deletada — e isso não está medido. Aceitar a revisão manual, ou medir se `GET /payments?externalReference=` devolve cobrança deletada e então liberar?
2. **A clínica pode ver duas formas de pagamento na mesma tela.** É a consequência direta da D-2, e foi a escolha certa contra cobrança dupla — mas é uma tela mais confusa do que a de hoje. Aceita, ou prefere que a reativação exija quitar a cobrança antiga **primeiro**, uma de cada vez?
3. **Fase 7 do plano da #310 não foi executada** (comentário de módulo consolidando o desenho + abertura do PR). Fecho numa próxima sessão, ou o PR sai como está?
4. **`alerta_risco_auth_select`:** escrever a migração agora, ou aceitar o zero silencioso do painel Super Admin até o reset pré-go-live (o `.sql` em disco já tem o fix, então o banco zerado cura sozinho)?
5. **D34:** o corte por inadimplência passa a escrever trilha em `audit_log`, e o job ganha um limiar de `carenciaFalhas` que derruba o `exit code`?
6. ~~**Perda do relatório da rota sob falha parcial**~~ — **fechada**: virou o **D38** e já foi resolvida no PR #323 (a rota mantém o 500 com o corpo completo, e ganhou `carenciaAbortada`/`backstopAbortado`).
7. **Resíduo do G6:** reabrir a decisão de que G6 não escreve `recusa_codigo`, para que o backstop consiga distinguir "primeira recusa foi defeito nosso" de "silêncio total"?

---

## 4. Achados abertos (não são pendência de issue nenhuma)

Registrados aqui porque nasceram no caminho e não têm dono. Detalhe no `BACKLOG.md`.

**Saíram em 16/08, por terem fechado:** o ruído de 39 erros de lint (era `.next` aninhado em worktree, não código), o timeout de `vencimento.test.ts`, a janela de cobrança dupla que a #319 abriu (é o que a #310 fecha) e a perda do relatório da rota sob falha parcial (D38, PR #323).

### Novos em 16/08 (sessão da #310)

| Achado                                                                                                                                                        | Onde                                                 | Estado                                                                                                                                                                                                                                                        |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cobrança `removida` (apagada no painel) tranca a clínica** — só o 404 libera o id; `deleted: true` bloqueia com "fale com o suporte" e não tem saída no app | `src/lib/billing/debito.ts` · `provider/asaas.ts`    | **Escolha deliberada, não descuido:** liberar o id arriscaria a idempotência de `debito:<ancora>` ressuscitar a cobrança deletada. **Não medido** se `GET /payments?externalReference=` devolve cobrança deletada. Virou **D41**, e é a decisão 1 da §3b.     |
| **`DUNNING_RECEIVED` — "recuperada" ou "em recuperação"?** A doc do Asaas não distingue                                                                       | `provider/asaas.ts` (`STATUS_COBRANCA_TERCEIRIZADA`) | **Não medido.** Inerte hoje: os dois desfechos possíveis proíbem emitir outra cobrança, então o bloqueio está certo nos dois casos. Vira problema se algum dia quisermos reaproveitar esse estado. Parte do **D41**.                                          |
| **Em que `status` fica o `Payment` quando a instrução é recusada no AGENDAMENTO por teto**                                                                    | doc do Asaas · `classificacao-recusa.ts`             | **Não medido, e o sandbox não alcança** (não ativa Pix Automático). O desenho da #310 **não depende disso** — a classificação é allow-list sobre o status, não sobre o motivo. Entra no ensaio com clínica de teste em produção.                              |
| **Instrução `SCHEDULED` sobrevive à revogação da autorização?**                                                                                               | `provider/asaas.ts` (`temInstrucaoPendente`)         | **Não medido.** O D-6 fica correto nos dois casos (instrução pendente ⇒ não apresentar código), mas se sobreviver há um estado "em processamento" que nunca se resolve sozinho. Ensaio em produção.                                                           |
| **O guard `!c.agrupadoEm` na escolha de âncora não é morto por nenhuma mutação**                                                                              | `src/lib/billing/debito.ts`                          | Defensivo: a âncora liberada por 404 é sempre a primeira do array, então o guard nunca é o que decide hoje. Mantido porque é a regra literal ("ciclo agrupado nunca vira âncora"), mas é código sem oráculo — irmão de [[teste-verde-que-nao-testa-nada]].    |
| **O dublê `provedor-fake.ts` não fala o dialeto completo do reuso**                                                                                           | `db/tests/provedor-fake.ts`                          | Melhorado nesta sessão (expressa `removida`, `em_processamento`, `status_nao_pagavel` pelo corpo do wire), mas segue mais pobre que o Asaas real. Os testes que valem são os de `gate-debito.int.test.ts` e `asaas.test.ts`, com stub HTTP no dialeto medido. |
| **`.mcp.json` e `docs/daily-summary/*` seguem não versionados**                                                                                               | raiz do repo                                         | Pendente de decisão do Rômulo desde 15/08. O `.mcp.json` aponta para o MCP de docs do Asaas, que foi **a ferramenta que fixou o desenho desta sessão** — sem ele, a próxima sessão mede menos.                                                                |

### Abertos de antes, que continuam valendo

**Saíram na 5ª sessão de 15/08, por terem fechado:** a #319 sem verificação contra banco (D33, resíduo do backfill abaixo), o motivo de recusa que nunca chegava (D35), a ordem da rota sem teste (`route.test.ts`, 22 casos), as fixtures inventadas (migradas), o catálogo aberto (virou o G0 implementado) e a premissa do artifact sobre modelo de dados (consumada nas `0099`/`0100`).

| Achado                                                                                                                             | Onde                                              | Estado                                                                                                                                                                                                                                                                                                                |
| :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A varredura de corte não escreve `audit_log`** — é a 1ª ação **irreversível** dirigida por job no repo                           | `src/lib/billing/subscription.ts`                 | Coerente com o módulo (nenhum `billing/*.ts` audita), mas revogar autorização sem trilha não tem precedente. **Continua aberto (D34)**, e o backstop da #318 acrescentou um segundo caminho automático até o corte. Decisão de produto pendente (§3b).                                                                |
| **O job sai `exit 0` mesmo com `carenciaFalhas` cheio** — clínica que falha o corte todo dia não alerta ninguém                    | `scripts/fechamento-ciclo-billing.mjs`            | O `.mjs` só loga o corpo. **Continua aberto (D34).** Vale um limiar que derrube o exit code, ou o corte silencioso vira permanente.                                                                                                                                                                                   |
| **`billing_apurar_ciclo` reescreve `pacientes_contados`** ao congelar ciclo `falhou` já faturado                                   | `db/migrations/0075` + `congelarCiclosComoDebito` | O piso `Math.max` protege o **valor**; o memorial de quem foi contado, não. Nenhum teste mede `pacientes_contados`.                                                                                                                                                                                                   |
| **`past_due` com `past_due_desde` NULL nunca é cortado e não aparece em `carenciaAvaliadas`**                                      | `src/lib/billing/subscription.ts`                 | Silêncio, não erro. Estado não deveria existir (os dois produtores carimbam juntos), mas nada o impede.                                                                                                                                                                                                               |
| **O predicado corta por instante, não por dia civil** — quem entra em `past_due` às 23h é cortado às 23h do 10º dia                | `src/lib/billing/subscription.ts`                 | Diverge de `calendario-bancario.ts`, que normaliza para horário civil de SP. Inerte hoje (SP sem DST, container UTC); quebra em fuso com DST.                                                                                                                                                                         |
| **Status real do `DELETE` de autorização já cancelada no Asaas não medido** — a tolerância a 404 é desenho defensivo, não medição  | `src/lib/billing/provider/asaas.ts`               | Entra no ensaio em produção. Se o Asaas responder 200 idempotente, o cuidado sobra; se responder outra coisa, o loop preso volta.                                                                                                                                                                                     |
| **`billing_apurar_ciclo` carimba `apurado` antes do `UPDATE` do TS** — crash entre as duas escritas converte `falhou` em `apurado` | `db/migrations/0075`                              | E `apurado` está na lista padrão do congelamento, então a revogação voluntária passaria a pegá-lo. Sem cobertura.                                                                                                                                                                                                     |
| **Qual calendário de feriados o Asaas usa** — o nosso é o nacional; bancário estadual/municipal não entra                          | `src/lib/billing/calendario-bancario.ts`          | Suposição não medida, mesma classe do `INSTRUCTION_REFUSED → OVERDUE` da #286. Entra no ensaio em produção.                                                                                                                                                                                                           |
| **O teto de 10 dias corridos só é vigiado por um teste** — nenhum fechamento real passa de 9                                       | `src/lib/billing/vencimento.test.ts`              | Aceito e documentado. Apagar aquele caso solta a constante sem nada ficar vermelho.                                                                                                                                                                                                                                   |
| **Uma recusa não produz nada na interface** — `faixa-trial.tsx:68-73` devolve `null` para `pagamento_atrasado`                     | `faixa-trial.tsx` · `estado-conta.ts:40,197`      | Piorou com a #319 e **de novo com a #318**: os 9 grupos agora diferem de verdade no banco (`recusa_codigo` persistido, políticas distintas) e **nenhuma tela lê**. A clínica é carimbada `past_due` e cortada em 10 dias sem ver uma linha; a tarja só aparece se já houver débito. **D36**, mais urgente, não menos. |
| **O docstring de `fecharCiclosVencendo` afirma que o erro é persistido em `billing_cycle.erro`** — o `catch` real não faz `UPDATE` | `subscription.ts:576-579` × `:756-766`            | `subscription.ts:1250` é o **único** ponto do repo que grava `erro` não-nulo. Corrigir o comentário ou fazer o `catch` gravar — decisão à parte.                                                                                                                                                                      |
| **`refusalReason` no payload de webhook não é documentado** — a página de motivos diz que vem "no evento"; o exemplo não o mostra  | doc do Asaas, "Eventos para Pix Automático"       | O caminho garantido é `GET /pix/automatic/paymentInstructions/{id}` disparado pelo evento. Não desenhar contando com o campo no envelope.                                                                                                                                                                             |
| **O envelope que `normalizarEventoAsaas` assume não aparece na doc e não foi medido**                                              | `asaas.ts:385-453`                                | Assume `paymentInstruction.status`, `.paymentId` e `.authorization.id`. Entra no ensaio em produção antes de empilhar mais desenho em cima.                                                                                                                                                                           |
| **O FAQ do Asaas contradiz a página de retentativas** — nega a existência de tentativas em dias posteriores                        | doc do Asaas, FAQ item 5                          | O FAQ é anterior à Jornada 3. Registrado para não virar "descoberta" numa próxima sessão. Não usar como fonte para `3R_7D`.                                                                                                                                                                                           |
| **Discriminador do `erro_aplicacao` continua indefinido** — `externalReference` não serve                                          | #289                                              | Decisão de produto em aberto entre `immediateQrCode.conciliationIdentifier` e `endToEndIdentifier`. **Trava a label `jules`.**                                                                                                                                                                                        |
| **`.specs/features/debito-reativacao-290/design.md:56` cita `PISO_COBRANCA_CENTAVOS`**, nome que não existe mais                   | spec histórica                                    | Registro de época, não corrigido de propósito. O nome vivo é `PISO_COBRANCA_AVULSA_CENTAVOS`.                                                                                                                                                                                                                         |
| **`moveisPorAno` é cache global sem limite** no calendário bancário                                                                | `src/lib/billing/calendario-bancario.ts`          | Irrelevante no uso atual (o job toca 2-3 anos); é estado global não limpável entre testes.                                                                                                                                                                                                                            |
| **`carencia_dias` pode precisar de `GRANT UPDATE` de coluna** se a app um dia escrever nela                                        | `subscription`                                    | Não medido. O backfill roda na role de migração, então a `0098` passa; nada na app escreve essa coluna hoje.                                                                                                                                                                                                          |

**Novos nesta sessão (15/08, 5ª):**

| Achado                                                                                                                                                                                              | Onde                                                                                           | Estado                                                                                                                                                                                                                                                                                                                        |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A policy `alerta_risco_auth_select` não existe** — grant de coluna presente, policy ausente ⇒ `iris_auth` lê **zero linhas sem erro**; o painel Super Admin reporta `totalAlertas: 0` em silêncio | `0072_super_admin_role` × `f6e0884` · `src/app/(admin)/benjamin/queries.ts`                    | **Medido no banco local** (`pg_policies` + `has_column_privilege`, não por `count(*)` — a tabela está vazia). **Produção: não medido**, afetada por inferência forte (o `hashAplicado` pinado é o sha256 LF do blob pré-fix). Consulta de fechamento em §1. Virou **D37**.                                                    |
| **A rota descarta `resultados` sob falha parcial** — se `cancelarAssinaturasComCarenciaVencida` lançar, o 500 leva junto o corpo com o `providerChargeId` de cada cobrança já emitida no gateway    | `src/app/api/internal/billing/fechar-ciclos/route.ts` · `scripts/fechamento-ciclo-billing.mjs` | Mesma classe que o `carenciaTruncado` existe para evitar: **perder o registro de um ato irreversível é pior que cortar devagar**. O job só grava esse JSON. Correção natural (`try` próprio na última etapa + `carenciaAbortada` no 200) **muda o contrato da rota e o log do job** ⇒ decisão do Rômulo (§3b). Virou **D38**. |
| **Resíduo do G6 no backstop** — ciclo cuja **primeira** recusa foi G6 chega a D+7 indistinguível do silêncio total, e **é carimbado**                                                               | `src/lib/billing/classificacao-recusa.ts` · `subscription.ts`                                  | Consequência direta da decisão fechada da #318 (G6 não persiste `recusa_codigo`, senão apagaria o diagnóstico correto de uma recusa anterior). Fechar exige **reabrir** aquela decisão. A **#322** passa a produzir exatamente esse caso: `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` é G6. Virou **D39**.                              |
| **O backfill da `0098` nunca foi exercitado** — `subscription` tem 0 linhas neste banco, então o `UPDATE … WHERE carencia_dias = 7` tocou 0 linhas                                                  | `db/migrations/0098_subscription_carencia_dez_dias.sql`                                        | **Não medido**, e é o resíduo declarado do D33. O DDL está provado; a migração de dado não. Só se fecha em base com linhas.                                                                                                                                                                                                   |
| **`pnpm vitest run <arquivo>.int.test.ts` coleta zero e sai verde**                                                                                                                                 | `vitest.config.ts` (`exclude: ["**/*.int.test.ts"]`)                                           | Nota de processo, não débito de produto. Integração exige `--config vitest.integration.config.ts`. Conferir o **número coletado**, nunca a cor — irmão de [[teste-verde-que-nao-testa-nada]].                                                                                                                                 |
| **`created_at` em `drizzle.__drizzle_migrations` é o `when` do journal**, não o instante da aplicação                                                                                               | `drizzle.__drizzle_migrations`                                                                 | Nota de processo. Não serve para datar nem para ordenar por tempo real — foi tentado nesta sessão e produziu conclusão errada antes de ser falsificado.                                                                                                                                                                       |
| **O guard de hash acusa 37 divergências nesta máquina, 35 delas só de fim de linha**                                                                                                                | `scripts/verificar-hash-migracoes.mjs` · `core.autocrlf=true` × `* text=auto`                  | **Nada foi pinado em `DERIVAS_CONHECIDAS` de propósito:** silenciar 35 rótulos de EOL esconderia o 36º que for real — foi exatamente assim que a `0072` apareceu. Diagnóstico em `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`.                                                                                     |
