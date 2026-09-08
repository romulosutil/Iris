# T0 — Medição no sandbox do Asaas (#378)

> Executado em **08/09/2026**, sandbox (`https://api-sandbox.asaas.com/v3`), conta
> `R SUTIL CORREA LTDA` (29.811.201/0001-50). Cliente de teste `cus_000009040492`, cartões
> **fictícios** (nenhum dado real, nenhum valor movimentado).
>
> **Os 6 itens estão respondidos. Nenhuma regra de parada disparou.** Duas correções de spec saíram
> daqui — ver §7. Nada abaixo é dedução: cada linha tem corpo cru.

## 1. Cobrança `CREDIT_CARD` sem dados de cartão devolve `invoiceUrl`? — **SIM**

Requisição:

```json
POST /payments
{
  "customer": "cus_000009040492",
  "billingType": "CREDIT_CARD",
  "value": 39.0,
  "dueDate": "2026-09-08",
  "externalReference": "card-setup:spike-1788890309778",
  "description": "Spike T0 #378 - setup de cartao"
}
```

Resposta `HTTP 200` (recortada nos campos que importam):

```json
{
  "id": "pay_ptvf81ouhcd8859c",
  "billingType": "CREDIT_CARD",
  "status": "PENDING",
  "creditCard": null,
  "invoiceUrl": "https://sandbox.asaas.com/i/ptvf81ouhcd8859c",
  "externalReference": "card-setup:spike-1788890309778"
}
```

`creditCard: null` na criação — o trilho da fatura hospedada (D1) está confirmado: nada de cartão
sai do Iris.

## 2. A fatura hospedada devolve `creditCardToken`? — **SIM** (este item sustentava o desenho inteiro)

Fatura paga pelo navegador em `https://sandbox.asaas.com/i/ptvf81ouhcd8859c`, cartão de teste
aprovado (Mastercard fictício `5162 3062 1937 8829`, val. 12/2030, CCV 318). A página confirmou
"Pagamento efetuado com sucesso". **Não houve desafio de CAPTCHA** no fluxo de pagamento.

`GET /payments/pay_ptvf81ouhcd8859c` → `HTTP 200`:

```json
{
  "id": "pay_ptvf81ouhcd8859c",
  "status": "CONFIRMED",
  "confirmedDate": "2026-09-08",
  "creditCard": {
    "creditCardNumber": "8829",
    "creditCardBrand": "MASTERCARD",
    "creditCardToken": "da5d7d36-e419-4e8a-8226-6bc2db56ed30"
  },
  "externalReference": "card-setup:spike-1788890309778",
  "transactionReceiptUrl": "https://sandbox.asaas.com/comprovantes/4760496692391283"
}
```

Consequências confirmadas para D2/D4: os três campos que as colunas novas guardam existem e vêm
juntos — `creditCardToken`, `creditCardBrand` (`"MASTERCARD"`, caixa alta) e `creditCardNumber`
(**só os 4 últimos**, `"8829"`). O dono da escrita é o webhook/`GET /payments/{id}`, como D4 previa.

## 3. Cobrança com `creditCardToken` **sem** `remoteIp`: 200 ou 400? — **200. A regra de parada de D6 NÃO dispara.**

```json
POST /payments
{
  "customer": "cus_000009040492",
  "billingType": "CREDIT_CARD",
  "value": 39.0,
  "dueDate": "2026-09-08",
  "externalReference": "cycle:spike-1788890561102:tentativa:1",
  "creditCardToken": "da5d7d36-e419-4e8a-8226-6bc2db56ed30"
}
```

Resposta `HTTP 200`:

```json
{
  "id": "pay_7j5o6xswkf9n8a11",
  "status": "CONFIRMED",
  "confirmedDate": "2026-09-08",
  "creditCard": { "creditCardNumber": "8829", "creditCardBrand": "MASTERCARD",
                  "creditCardToken": "da5d7d36-e419-4e8a-8226-6bc2db56ed30" }
}
```

**Decisão fechada por D6:** não persistir IP nenhum. Não há coluna de IP, não há dado pessoal novo,
não há item novo no checklist LGPD.

**Bônus medido — confirma D7:** `dueDate` = hoje e o `status` já voltou `CONFIRMED` na própria
resposta, com `confirmedDate` no mesmo dia. O cartão processa na hora; `dueDate` não agenda captura.
Usar `vencimentoCobrancaDeCiclo()` (calendário bancário do Pix) neste trilho seria erro.

## 4. Recusa síncrona: HTTP e `errors[].code` — **400, `code: "invalid_action"`** (a spec presumia outro código)

Dois cartões de teste recusados da doc, ambos com o mesmo resultado:

| Bandeira   | Número             | Resposta                                     |
| ---------- | ------------------ | -------------------------------------------- |
| Mastercard | `5184019740373151` | `400` · `invalid_action`                     |
| Visa       | `4916561358240741` | `400` · `invalid_action`                     |

Corpo (idêntico nos dois):

```json
{
  "errors": [
    {
      "code": "invalid_action",
      "description": "Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente."
    }
  ]
}
```

O mesmo `invalid_action` sai também de `POST /creditCard/tokenizeCreditCard` com cartão recusado —
ou seja, **não se consegue token de cartão que o emissor recusa**; a tokenização é ela própria uma
transação autorizada.

**Confirma D8 (cobrança recusada não é persistida):** depois de 3 recusas, `GET /payments?customer=…`
lista **apenas** as 2 cobranças aprovadas. Nenhuma linha `REFUSED` do outro lado — não há
`payment.id`, não há webhook, não há o que conciliar. A máquina de recusa atual (que depende de
`billing_cycle.provider_charge_id`) realmente não é acionada neste caminho.

### 4b. O código discrimina recusa de erro nosso? — medido, e a resposta muda o desenho

Provocando erros 400 de propósito, no mesmo endpoint:

| O que enviei                        | `code` devolvido     | `description`                                              |
| ----------------------------------- | -------------------- | ---------------------------------------------------------- |
| cartão de teste recusado            | `invalid_action`     | "Transação não autorizada. Verifique os dados do cartão…"  |
| `customer: "cus_inexistente_000"`   | `invalid_customer`   | "Customer inválido ou não informado."                      |
| `value: -5`                         | `invalid_value`      | "Informe um valor maior que R$ 0,00." **+** "O valor mínimo para cobranças via Cartão de Crédito é R$ 5,00." |
| `dueDate: "data-invalida"`          | `invalid_dueDate`    | "O parâmetro dueDate deve ser informado"                    |
| `creditCardToken` inexistente       | `invalid_creditCard` | "CreditCardToken token-que-nao-existe-0000 não encontrado." |

**A doc pública do Asaas mostra a recusa com `code: "invalid_creditCard"`. O sandbox devolve
`invalid_action` — e reserva `invalid_creditCard` para _token não encontrado_, que é bug nosso.**
Ver §7.1: implementar a spec como escrita trataria "token que não existe" como recusa do emissor
(marcaria o ciclo `falhou` e carimbaria `past_due` da clínica por um defeito nosso) e deixaria a
recusa de verdade estourar como exceção.

**Achado colateral não previsto na spec: valor mínimo de R$ 5,00 por cobrança de cartão.** Ciclo
apurado abaixo disso (clínica minúscula, pro-rata curto) não é cobrável neste trilho. Não existe
piso equivalente no Pix. Fica registrado para o fechamento de ciclo — ver §7.2.

## 5. `status` cru num evento `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` — **não mensurável no sandbox**

As "Ações em Sandbox" do Asaas só expõem: aprovar a conta, confirmar uma cobrança e forçar o
vencimento. **Não há ação para forçar recusa de captura**, e a captura recusada é assíncrona (chega
dias depois de um `CONFIRMED`), então não dá para provocá-la com cartão de teste.

**Isto não bloqueia nada** porque D10 já decidiu ler o **nome do evento**, não o status: o desenho
foi feito exatamente para não depender deste número. O que a medição reforça é a razão de D10 — como
o status cru é desconhecido, qualquer mapeamento por status seria chute, e `mapearStatusCobranca`
manda desconhecido para `"pendente"` (silêncio).

Fica como verificação de produção depois da virada da flag: registrar o primeiro
`PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` real que chegar e conferir que o normalizador o pegou pelo nome.

## 6. O Asaas retenta cobrança avulsa de cartão sozinho? — **NÃO. O motor de 5x (3+2) é NOSSO.** (D11 / T5b)

Três evidências convergentes, nenhuma delas "a doc não fala":

1. **Medido (§4):** a cobrança recusada **não é persistida**. Não existe objeto `payment` do outro
   lado. Não há o que o Asaas retentar — não é política, é ausência de recurso.
2. **Doc de cobranças com cartão:** descreve a recusa como resposta síncrona `400` e recomenda,
   textualmente, consultar antes de repetir a requisição para não duplicar cobrança. Nenhuma menção
   a reprocessamento automático.
3. **Doc de Assinaturas (o trilho nativo, que a regra de parada do T0.6 vigiava):** a tabela de
   formas de pagamento diz que, no cartão, "o Asaas gera a cobrança e realiza **a** tentativa de
   pagamento no vencimento" — uma tentativa, no vencimento. Nem o FAQ de Assinaturas nem a página de
   recorrência documentam cadência de retentativa.

**A regra de parada de T0.6 NÃO dispara:** ela mandava escalar se a resposta apontasse para
`Assinatura` nativa. Não aponta — a `Assinatura` também não entrega 3+2. Migrar para `POST
/v3/subscriptions` custaria a mudança de arquitetura **e não traria** a cadência que o Rômulo pediu.

**Consequência para T5b:** segue como desenhado — cada tentativa é um `POST /payments` novo com o
mesmo `creditCardToken`, `externalReference` própria por tentativa (`cycle:<id>:tentativa:<n>`),
contagem e agendamento nossos, `falhou` só depois da 5ª. Reforço vindo da medição: como a tentativa
recusada não deixa rastro no gateway, **a contagem só existe se nós a gravarmos** — não há como
reconstruí-la consultando o Asaas depois.

## 7. Correções que esta medição impõe à spec

### 7.1 D8/T4 — o discriminador da recusa síncrona está invertido na spec

A spec manda: `400` com `errors[].code === "invalid_creditCard"` → `recusada_na_origem`; qualquer
outro 400 sobe. Medido, isso faz **exatamente o oposto** do pretendido nos dois sentidos.

Regra corrigida, para T4:

- é recusa do emissor (`{desfecho: "recusada_na_origem", codigo: "CARD_DECLINED"}`) quando o `400`
  traz `code: "invalid_action"`;
- `invalid_creditCard` **sobe** como erro de aplicação: no fluxo por token ele significa token
  inexistente/inválido, que é defeito nosso (token não gravado, apagado, ou de outro cliente — a doc
  lembra que o token pertence ao `customer` para o qual nasceu);
- qualquer outro `code` sobe, como já estava;
- o `code` e a `description` crus vão para o log estruturado em **todos** os ramos: é o único jeito
  de enxergar a deriva se o Asaas mudar o código (a doc pública **já** diverge do sandbox hoje).

Deixar de logar o código, ou casar por texto da `description`, refaz a cicatriz de discriminador
cego (#289): a `description` é copy em PT-BR e muda sem aviso.

### 7.2 Piso de R$ 5,00 por cobrança de cartão — e ele está no CAMINHO CRÍTICO (D3)

`value` abaixo de R$ 5,00 é rejeitado com `invalid_value` **antes** de qualquer autorização.

A primeira leitura desta medição a tratou como fora do caminho crítico ("a mensalidade cheia está
muito acima do piso"). **Errado, e a correção veio de medir a constante em vez de lembrar dela:**
`VALOR_ATIVACAO_PADRAO_CENTAVOS` em `asaas.ts:111` vale **1** — um centavo. A ativação por Pix cobra
R$ 0,01 por decisão de produto explícita (D22, 09/08/2026), porque a Jornada 3 do Bacen exige um QR
liquidado para a autorização existir e um centavo é o menor débito representável.

D3 manda a ativação por cartão cobrar **o mesmo** `VALOR_ATIVACAO_PADRAO_CENTAVOS`. Isso é
impossível: um centavo no cartão é rejeitado. Como o token só nasce de uma transação aprovada, o
mínimo que a clínica paga para ativar cartão é **R$ 5,00 — 500x o trilho Pix** — e D12 manda
**recobrar** esse valor a cada troca de cartão.

**T3 está bloqueado nisto**, e é decisão de dinheiro, não de código: nenhum executor deve escolher o
valor sozinho. Registrado para o Rômulo em 08/09/2026, junto da pergunta ao gerente de contas do
Asaas sobre baixar o mínimo da conta (pergunta NOVA — o gate de tokenização aprovado no mesmo dia
não cobre isto).

### 7.3 Não existe tokenização sem cobrança sob a restrição de PCI (medido, não deduzido)

Hipótese testada em 08/09/2026, a pedido do Rômulo: o FAQ de Assinaturas diz que criar assinatura
com cartão "normalmente não cobra — o cartão é validado e utilizado nas cobranças futuras". Se valesse
pela fatura hospedada, a ativação por cartão custaria R$ 0,00 e o problema de §7.2 sumiria.

Medição: `POST /subscriptions` com `billingType: CREDIT_CARD`, `value: 39.00`,
`nextDueDate` daqui a 30 dias, **sem** dados de cartão → `HTTP 200`, assinatura `ACTIVE`
(`sub_m3mldxj8s7hjino6`), e `GET /subscriptions/{id}/payments` já trouxe **uma** cobrança
`PENDING` com `dueDate: "2026-10-08"` e `invoiceUrl`.

Cartão de teste digitado nessa fatura hospedada. Resultado:

```json
{
  "id": "pay_ukg5fca1bemjja47",
  "status": "CONFIRMED",
  "dueDate": "2026-10-08",
  "confirmedDate": "2026-09-08",
  "clientPaymentDate": "2026-09-08",
  "creditCard": { "creditCardNumber": "8829", "creditCardBrand": "MASTERCARD",
                  "creditCardToken": "da5d7d36-e419-4e8a-8226-6bc2db56ed30" }
}
```

**Cobrou hoje, R$ 39,00, com vencimento um mês à frente.** A fatura hospedada não agenda: ela captura
no ato, exatamente como D7 já dizia para cobrança avulsa. O "normalmente não cobra" do FAQ vale para
o caminho em que o cartão vai **pela API** na criação da assinatura — que é o checkout transparente
vetado por PCI-DSS SAQ-D em D1.

**Conclusão: sob a restrição de nunca tocar em PAN/CVV, não existe caminho de tokenização gratuita.**
A escolha real é entre cobrar ≥ R$ 5,00 ou não ter trilho de cartão.

Observação colateral útil: o token devolvido foi **o mesmo** (`da5d7d36-…`) da cobrança avulsa do §2.
O token é do par (cliente, cartão) — reentrada com o mesmo cartão não gera token novo, o que é
coerente com a doc dizendo que o token pertence ao `customer` para o qual nasceu.

### 7.4 A taxa do Asaas por transação de cartão (medida de passagem)

`value: 39.00` → `netValue: 37.74`. **R$ 1,26 retidos**, ~3,2%. Não é escolha nossa e não muda com o
valor de ativação; fica registrado porque a conversa sobre "taxa" com o Asaas mistura três coisas
diferentes — esta retenção, o piso de R$ 5,00 (regra de plataforma) e a cobrança de ativação (nossa
decisão de produto).

## 8. Como reproduzir

Scripts descartáveis (não versionados, rodaram do diretório de scratch da sessão) fizeram
`POST /customers`, `POST /payments`, `GET /payments/{id}` e as variações de erro acima, com
`access_token` de sandbox em variável de ambiente. O único passo manual é o item 2: pagar a
`invoiceUrl` no navegador com cartão de teste, porque é justamente o passo que o Iris nunca executa.
