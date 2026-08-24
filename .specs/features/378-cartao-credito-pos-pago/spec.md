# #378 — Cartão de crédito para assinatura pós-paga (Asaas)

> Spec-driven (`/tlc-spec-driven`), porte **Large**. Fases aplicadas: Specify + Design + Tasks.
> Handoff `AGENTS.md` §5.2: os 7 pontos estão fechados no fim deste documento.

## 0. Correção de premissa da issue (ler antes de tudo)

A issue pede, no item 1 do escopo: _"tokenização de cartão via SDK/API do Asaas (sem transitar
PAN/CVV sensível pelo backend Iris)"_. **As duas metades são incompatíveis com a API do Asaas.**

Medido na spec OpenAPI oficial (`POST /v3/creditCard/tokenizeCreditCard`, via MCP `asaas-docs`,
24/08/2026):

- o endpoint de tokenização exige o header `access_token` (chave de API da conta). Chamá-lo do
  navegador significa publicar a chave de produção do Asaas no bundle. **Não existe SDK público de
  tokenização client-side do Asaas** — não é "não achamos": o único caminho documentado para gerar
  token é server-to-server;
- o "checkout transparente" (`POST /v3/payments` com os objetos `creditCard` +
  `creditCardHolderInfo`) põe PAN e CVV dentro do processo do Iris → escopo **PCI-DSS SAQ-D** para
  o operador (R Sutil Correa Ltda). Vetado.

Sobra **um** trilho que honra a restrição escrita na issue: a **Fatura hospedada do Asaas**
(`invoiceUrl`). Nós criamos uma cobrança `CREDIT_CARD` **sem** dados de cartão, mandamos a clínica
para a `invoiceUrl`, e o cartão é digitado no domínio do Asaas. O token volta para nós **pelo
webhook**, em `payment.creditCard.creditCardToken`.

Consequência boa: a forma `{ forma: "redirect", url }` de `AutorizacaoPendente`
(`src/lib/billing/provider/types.ts`) — hoje código morto, escrita para "um provedor de checkout
futuro" — passa a ter dono. Nenhum tipo novo na porta para o caminho de ativação.

## 1. Requisitos

| ID  | Requisito                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| R1  | A clínica escolhe, na ativação, entre **Pix Automático** e **Cartão de crédito**.                                        |
| R2  | O cartão é digitado **na fatura hospedada do Asaas**; PAN/CVV nunca entram em processo do Iris.                           |
| R3  | O `creditCardToken` do cliente é persistido e vinculado ao `provider_customer_id`.                                        |
| R4  | No fechamento de ciclo, a assinatura de cartão é debitada com o valor apurado (`valorCentavos`).                          |
| R5  | Recusa de cartão (síncrona ou assíncrona) marca o ciclo `falhou` e carimba `past_due` (carência de 10 dias, igual ao Pix). |
| R6  | A clínica vê, na `/assinatura`, aviso de recusa com CTA de **atualizar cartão**, e consegue trocar o cartão.              |
| R7  | Nada de cartão fica visível ou ativo sem a flag `BILLING_CARTAO_HABILITADO`.                                             |
| R8  | Suíte unitária + integração cobrindo emissão, recusa síncrona, recusa assíncrona, conciliação e troca de cartão.          |

**Fora de escopo (v1), explicitamente:** parcelamento (`installmentCount`), cartão de débito,
chargeback/disputa (`PAYMENT_CHARGEBACK_*` segue no tratamento genérico de estorno já existente),
retentativa automática de cartão (ver D11), migração de clínica de Pix → cartão sem passar por nova
ativação.

## 2. Estado atual do código (o que o executor vai encontrar)

| Ponto                | Arquivo:linha                                                | Situação hoje                                                                                                                            |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Método de pagamento  | `src/app/(app)/assinatura/logic.ts:122`                      | `const metodo: MetodoPagamento = "pix"` — constante, com comentário explicando que a escolha saiu da tela porque nenhum adapter honrava o campo. |
| Radio Pix/Cartão     | `src/app/(app)/assinatura/formulario-ativacao.tsx:210-217`   | Removido em 10/08/2026, com comentário explicando que era ficção.                                                                        |
| Vínculo              | `src/lib/billing/provider/asaas.ts:665` `iniciarVinculoPagamento` | Sempre `POST /pix/automatic/authorizations`. Ignora `dados.metodo`.                                                                       |
| Cobrança de ciclo    | `asaas.ts:898` `emitirCobrancaDeCiclo`                       | Sempre `billingType: "PIX"` + `pixAutomaticAuthorizationId`; lê o `customerId` **da autorização Pix**.                                    |
| Fechamento           | `src/lib/billing/subscription.ts:743`                        | Só emite se `assinatura.providerSubscriptionId` existir; senão `throw "assinatura ativa sem vínculo de pagamento no gateway"`.            |
| Normalizador webhook | `asaas.ts:536` `normalizarEventoAsaas`                       | Decide o tipo por `payment.status` / `paymentInstruction`. Nunca olha o **nome** do evento.                                               |
| Mapa de status       | `asaas.ts:261` `mapearStatusCobranca`                        | `default → "pendente"`. Logo `AWAITING_RISK_ANALYSIS` e captura recusada caem em "pendente" — silêncio.                                   |
| Catálogo de recusa   | `src/lib/billing/classificacao-recusa.ts`                    | 25 códigos, 9 grupos (G0..G8), **todos do trilho Pix Automático** (`refusalReason` da `paymentInstruction`).                              |
| Aviso na tela        | `src/lib/billing/recusa-ui.ts:150` `montarAvisoRecusa`       | Já existe (D36) e já renderiza no layout. Falta o caso cartão.                                                                            |
| Colunas              | `src/db/schema.ts:1861-1884`                                 | `provider_subscription_id` (UNIQUE, = id da autorização Pix), `provider_customer_id`, `metodo_pagamento`, `valor_ativacao_centavos`, `checkout_url`, `pix_copia_e_cola`. Nenhuma coluna de cartão. |

## 3. Decisões de Design — TODAS fechadas

### D1 — Trilho de captura: fatura hospedada, nunca checkout transparente

Ver §0. Ativação e troca de cartão passam por `invoiceUrl`. **Proibido** enviar `creditCard`,
`creditCardHolderInfo` ou `ccv` em qualquer request do Iris. Teste de guarda (T9) varre `src/` por
esses literais.

### D2 — O "vínculo" do cartão é (customer, token), e ganha colunas próprias

Cartão **não tem autorização**. `provider_subscription_id` é UNIQUE e significa "id da autorização
Pix" — reaproveitá-lo para guardar token repetiria a mentira do D21 (BR Code em `checkout_url`).

Colunas novas em `subscription`:

- `credit_card_token text` — token do Asaas;
- `credit_card_bandeira text` — `creditCardBrand` (para a UI dizer "Visa •••• 8829");
- `credit_card_ultimos4 text` — `creditCardNumber` (o Asaas devolve só os 4 últimos);
- `credit_card_atualizado_em timestamptz`.

Regras obrigatórias da migração (CLAUDE.md, seção Migrações): mudar `schema.ts` e gerar com
`pnpm db:generate`; commitar `.sql` **e** `meta/NNNN_snapshot.json`; `when` = anterior **+1000** se
houver entrada manual; **`GRANT UPDATE (coluna)` explícito para `app_role`** em cada coluna nova (a
tabela tem UPDATE revogado por tabela desde a `0057` — sem grant, "permission denied for table
subscription"). CHECK novo:
`metodo_pagamento <> 'cartao' OR status IN ('free_tier','setup_pending') OR credit_card_token IS NOT NULL`.

### D3 — A ativação por cartão cobra o valor mínimo de ativação

Não porque o cartão exija (não exige), mas porque o token só nasce de **uma transação aprovada**.
Valor = `VALOR_ATIVACAO_PADRAO_CENTAVOS` (o mesmo do Pix), persistido em `valor_ativacao_centavos`
como já é hoje. `externalReference` = `card-setup:<subscriptionId>`, com **prefixo em constante
única** (`PREFIXO_REFERENCIA_CARTAO`), ao lado de `PREFIXO_REFERENCIA_CICLO` — duas cópias do mesmo
literal derivam (#289).

### D4 — Dono único da escrita do token: o webhook, e só ele

A clínica paga fora do nosso request; não há resposta síncrona com token. Fluxo:

`route.ts` → `normalizarEvento` → cobrança com `externalReference` começando por `card-setup:` →
nova função `registrarTokenDeCartao(providerChargeId, referenciaExterna)` em `subscription.ts`, que
consulta `GET /payments/{id}`, lê
`payment.creditCard.{creditCardToken,creditCardBrand,creditCardNumber}` e grava as 4 colunas +
`status = 'active'` + `ativada_em`.

**Fail-closed:** cobrança de setup **paga sem token no corpo** → nada é gravado, `status` continua
`setup_pending`, e o evento é carimbado com `erro_aplicacao = 'cartao_pago_sem_token'` (motivo
classificado, no mesmo estilo de `classificarFalhaDeConciliacao`). Nunca ativar assinatura de cartão
sem token: ativa-sem-token produz um ciclo que fecha e não consegue cobrar.

**Não** reaproveitar `conciliarPagamentoDeCiclo` — a cobrança de setup não tem ciclo, e passar por
lá faria a falta de ciclo virar alarme falso (#289).

### D5 — Máquina de estados do trilho cartão

`free_tier` → (clínica ativa) `setup_pending` + cobrança de setup emitida + `checkout_url` gravada →
(webhook pago **com** token) `active` + ciclo aberto → (fechamento) cobrança do ciclo → …

`checkout_url` é a coluna certa para a `invoiceUrl` (é URL de verdade); `pix_copia_e_cola` fica NULL
no trilho cartão. `colunasDaAutorizacao` (`subscription.ts:154`) já cobre isso.

### D6 — `remoteIp` é um SPIKE bloqueante, com regra de parada escrita

A doc de cobrança com token mostra `remoteIp` no corpo e diz explicitamente: informe o IP do
dispositivo do pagador, **não** o do servidor. Na cobrança de ciclo não existe pagador na frente da
tela.

**T0 mede** (sandbox): `POST /v3/payments` com `creditCardToken` **sem** `remoteIp`.

- Se passar (200) → **não persistir IP nenhum**. Minimização: IP é dado pessoal sob a LGPD, e
  guardá-lo "por via das dúvidas" cria base legal para justificar depois.
- Se falhar (400 exigindo `remoteIp`) → **PARAR e escalar ao Rômulo**. Não criar coluna de IP por
  conta própria: é dado pessoal novo, com finalidade e retenção a declarar no checklist LGPD.

### D7 — No cartão, `dueDate` NÃO agenda nada

A doc é explícita: com token/dados de cartão na criação, **o processamento é imediato**; `dueDate`
não agenda a captura. Logo:

- **não** usar `vencimentoCobrancaDeCiclo()` no trilho cartão — essa função existe para o calendário
  bancário do Pix (2 a 10 dias, cluster de fim de ano, #317);
- enviar `dueDate` = **hoje** e gravar `vencimento_cobranca` = hoje. O backstop D+7
  (`aplicarBackstopDePrazo`) continua correto porque ele mede a partir da coluna, não recalcula.

### D8 — Recusa síncrona: HTTP 400 e **nenhuma cobrança existe**

A doc: transação recusada → a cobrança **não é persistida** e a API devolve `400`. Não há
`payment.id`, não há webhook, não há o que conciliar. Toda a máquina de recusa atual depende de
`billing_cycle.provider_charge_id` — ela **não é acionada** neste caminho.

Decisão: `emitirCobrancaDeCiclo`, no trilho cartão, captura o `BillingProviderError` de status 400
cujo corpo traga `errors[].code === "invalid_creditCard"` e devolve resultado de recusa explícito.
Extensão mínima da porta:

```ts
export type ResultadoCobranca =
  | ({ desfecho: "emitida" } & CobrancaEmitida)
  | { desfecho: "recusada_na_origem"; codigo: string };
```

No ramo `recusada_na_origem`, `fecharCiclosVencendo` grava na MESMA escrita: ciclo `falhou`,
`recusa_codigo = 'CARD_DECLINED'`, `erro` = diagnóstico do grupo, `past_due_desde` (só se ainda for
NULL — preserva o carimbo anterior, regra de G6), `provider_charge_id` **continua NULL** (nada
existe do outro lado). Erro 400 com qualquer outro `code` **sobe**: é bug nosso, não recusa do
emissor.

Idempotência: ciclo em `falhou` não pode voltar ao conjunto elegível da varredura sem ação humana
(cicatriz `varredura-escreve-o-proprio-predicado`). Conferir o `WHERE` de `fecharCiclosVencendo` e
cobrir com teste — reexecutar o job **não** pode disparar uma segunda tentativa de débito.

### D9 — O motivo real da recusa é INDISPONÍVEL. Um grupo só, e nomeado como tal

A doc do Asaas diz, com todas as letras, que a recusa volta com mensagem **genérica** por segurança
(`invalid_creditCard` / "Transação não autorizada"). "Saldo insuficiente", "cartão expirado" e
"suspeita de fraude" **não são obteníveis** — implementá-los seria inventar dado (cicatrizes
`pipe-que-le-o-recurso-errado`, `feature-sem-caminho-de-escrita-do-campo`).

Decisão: **um** grupo novo no catálogo, `G9 — cartão recusado`, com código nosso `CARD_DECLINED`
(comentar no catálogo que é código **do Iris**, não do gateway — os 25 atuais são do Asaas/BACEN):

| campo                       | valor                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `marcaCicloFalhou`          | `true`                                                                                             |
| `carimbaPastDue`            | `true`                                                                                             |
| `conciliaComoPago`          | `false`                                                                                            |
| `valeGastarRetentativa`     | `false`                                                                                            |
| `retentavelAutomaticamente` | `false` (não entra em `CODIGOS_RETENTAVEIS_AUTOMATICAMENTE`)                                       |
| `corteImediato`             | `false` (o corte fica com a carência/backstop)                                                     |
| `diagnostico`               | `"cartão recusado pelo emissor; motivo não informado pelo gateway"`                                |
| `copy`                      | `"Não conseguimos cobrar no cartão cadastrado. Atualize o cartão em Assinatura."` — sem código cru, sem valor. |

### D10 — Recusa assíncrona: decidir por **nome de evento**, não por status

`PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` e `PAYMENT_REPROVED_BY_RISK_ANALYSIS` chegam com o `payment`
num status que `mapearStatusCobranca` hoje devolve como `"pendente"` (`default`) — o evento seria
descartado como `desconhecido` e o ciclo ficaria eternamente em `aguardando_pagamento`.

`normalizarEventoAsaas` passa a olhar o **nome** do evento nestes dois casos e a produzir
`tipo: "cobranca.recusada"` com motivo `CARD_DECLINED`. `PAYMENT_AWAITING_RISK_ANALYSIS` é
explicitamente **no-op**: não é recusa nem pagamento; o ciclo segue `aguardando_pagamento` e o
backstop D+7 cobre o caso de nunca resolver.

Ciclo de vida do cartão: `PAYMENT_CONFIRMED` → `PAYMENT_RECEIVED` **32 dias depois**. O ciclo
concilia como pago em `CONFIRMED` — `STATUS_PAGOS` (`asaas.ts:1094`) já inclui `CONFIRMED`, então
nada muda ali; **não** mexer nesse set.

### D11 — Retentativa automática no cartão: NENHUMA na v1

O motor do #322 (`POST /pix/automatic/paymentInstructions/{id}/retries`) não existe no cartão;
"retentar" no cartão é emitir **outra** cobrança — risco de cobrança dupla. Recuperação é humana: a
clínica atualiza o cartão e clica **"Tentar novamente agora"**, que reemite **uma** cobrança para o
ciclo `falhou` mais recente, dentro da carência.

Limites explícitos (§5.2.1): **no máximo 1** tentativa manual por atualização de cartão; **zero**
retentativas automáticas; **sem** backoff; o botão fica desabilitado enquanto houver cobrança do
ciclo em `PENDING`/`CONFIRMED`; fora da carência (`past_due` vencido) o caminho é reativação (#290),
não retentativa.

### D12 — Trocar cartão = repetir a ativação, e a tela diz isso ANTES do clique

Não existe endpoint de "trocar cartão" sem PAN. Trocar = nova cobrança de setup + `invoiceUrl` +
webhook + token novo sobrescreve o antigo (`credit_card_atualizado_em` novo). **Isso cobra de novo o
valor mínimo de ativação**, e a copy tem que dizer isso antes do botão — descobrir depois é o mesmo
defeito que o #290 fechou. Sucesso é estado **permanente** (o cartão mascarado novo passa a aparecer
na tela), não um toast transiente.

### D13 — Volta do seletor de método, atrás de flag

- `logic.ts:122` deixa de ser constante: lê `formData.get("metodo")`, valida contra
  `["pix","cartao"]`, **default `pix`** para valor ausente ou inválido (fail-safe: o trilho vivo e
  medido é o Pix).
- `formulario-ativacao.tsx:210-217`: o radio volta, **e o comentário que explica por que ele saiu não
  é apagado** — é reescrito dizendo que a condição ("volta quando algum adapter honrar o campo") foi
  satisfeita por esta issue. O bloco fixo "Pagamento por Pix Automático" vira o texto da opção Pix.
- `BILLING_CARTAO_HABILITADO` (env, **default `false`**): sem ela o radio não renderiza e `logic.ts`
  rejeita `metodo=cartao` mesmo que venha forjado no corpo (a validação é do servidor). Documentar em
  `.env.example` junto do bloco `ASAAS_*`.

### 🔒 Gate externo (fora do código, pré-requisito da virada de chave)

Doc do Asaas: _"A tokenização está disponível no Sandbox. Para utilizá-la em Produção, solicite a
habilitação ao seu gerente de contas."_ Igual ao gate de MIT/CoF já registrado em `types.ts`: **não
bloqueia a implementação**, bloqueia ligar a flag em produção. Registrar no `BACKLOG.md` como
pendência do Rômulo. Cicatriz relacionada: no sandbox do Asaas o Pix Automático nunca chegou a
ACTIVE (`sandbox-asaas-nao-ativa-pix-automatico`) — para **cartão** o sandbox funciona e tem cartões
de teste documentados, então T0 é mensurável de verdade.

## 4. Ratificar com o Rômulo ANTES de aplicar a label `jules`

Duas decisões acima são de produto/dinheiro, estão fechadas por padrão, mas o Rômulo pode reverter:

1. **D3/D12** — trocar de cartão cobra de novo o valor mínimo de ativação.
2. **D11** — zero retentativa automática no cartão (recuperação 100% manual, dentro da carência).

E uma pendência operacional: **solicitar ao gerente de contas Asaas a habilitação de tokenização em
produção**.

## 5. Casos de borda, por nome (§5.2.4)

1. Clínica abandona a fatura hospedada e nunca paga → `setup_pending` para sempre, sem token. A tela
   mostra o link de volta (`checkout_url`) e um botão de recomeçar; a reentrada é **idempotente**
   (mesma `externalReference` `card-setup:<id>` → `buscarCobrancaPorReferencia` devolve a existente,
   como já faz hoje).
2. Setup pago, webhook chega **sem** token → D4 fail-closed.
3. Webhook duplicado do mesmo evento → já coberto pelo `UNIQUE (asaas_event_id)`.
4. Recusa síncrona no fechamento (D8) + reexecução do job → não pode emitir segunda cobrança.
5. Recusa assíncrona **depois** de `CONFIRMED` (captura recusada tardia) → ciclo já pago volta a
   `falhou`? **Não**: `conciliarPagamentoDeCiclo` não rebaixa ciclo `pago`. Confirmar o guard e
   cobrir com teste — evento tardio não desfaz pagamento conciliado.
6. Clínica troca o cartão **durante** a carência com ciclo `falhou` aberto → botão de retentativa
   manual (D11), 1 tentativa.
7. Cancelamento com token gravado → `cancelarVinculo` no trilho cartão **não** chama
   `/pix/automatic/...`; apaga o token (`credit_card_token = NULL`) e segue o fluxo `devido` pro-rata
   do #287/#290 inalterado. O débito de reativação continua em `emitirCobrancaAvulsa` (Pix comum) —
   **não** cobrar no cartão salvo de quem cancelou.
8. Assinatura de cartão sem `provider_customer_id` (linha antiga) → falhar alto e nomeado, como
   `iniciarVinculoPagamento` já faz com `cpfCnpj` ausente.
