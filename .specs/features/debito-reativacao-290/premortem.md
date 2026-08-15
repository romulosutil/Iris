# Pre-mortem — Débito na reativação (#290)

**Tese esteelmanada.** Cobrar o débito pro-rata na porta de entrada da reativação
fecha o loop cancela-usa-cancela sem nunca travar a clínica: o débito é a soma
dos ciclos `devido` (fonte da verdade já existente, sem tabela nova), a cobrança
é uma só (agrupada por âncora), e débito abaixo do piso do gateway **acumula** em
vez de bloquear ou evaporar — então nem existe deadlock nem dia grátis.

**Timeframe da falha:** a primeira reativação real em produção. Hoje esse caminho
**nunca foi exercido por ninguém** — nenhuma clínica cancelou e voltou.

---

## Narrativas de falha

### 1. Beco sem saída depois do pagamento — Probabilidade: ALTA | Impacto: ALTO

É a primeira reativação real. A clínica deve R$ 13,00, vê o copia-e-cola, paga
pelo app do banco. O webhook chega, os ciclos viram `pago`, o débito zera. **E a
tela não muda.** O polling herdado da ativação (#295) observa
`subscription.status`, e a assinatura continua `canceled` de propósito — pagar
débito não reativa. A pessoa fica olhando um QR já pago por 4 minutos, conclui
que falhou, e paga de novo pelo mesmo copia-e-cola (o Asaas aceita segundo Pix
para a mesma cobrança? não medido) ou abre chamado.

**Cadeia:**

- 1ª ordem: tela travada no QR pago; nenhuma confirmação visível.
- 2ª ordem: pagamento duplicado ou chamado de suporte na primeira experiência de
  volta — exatamente o cliente que já estava com um pé fora.
- 3ª ordem: o "modelo Meta Business" (deve, paga, volta) vira, na percepção,
  "paguei e não voltei". A regra anti-exploit fica associada a cobrança que não
  destrava.

**Causa raiz da suposição:** presumir que o polling existente serve, porque "já
tem polling na tela". O sinal que ele observa é o errado para este fluxo.

### 2. Piso alto demais tranca a clínica fora — Probabilidade: MÉDIA | Impacto: ALTO

`PISO_COBRANCA_CENTAVOS = 500` é chute conservador. Se o piso real do Asaas para
Pix for **maior** — ou se a conta tiver regra própria — o `POST /payments` de
R$ 5,00 volta 400. O gate foi desenhado para **falhar fechado**, então ele lança:
a clínica vê "não foi possível abrir o pagamento" e **não consegue reativar
nunca**, por mais que tente. Falhar fechado protege a receita do ciclo passado e
destrói a receita de todos os ciclos futuros.

**Cadeia:**

- 1ª ordem: reativação impossível para toda clínica com débito ≥ piso.
- 2ª ordem: o erro é genérico na tela e o detalhe só existe no log — ninguém
  descobre sem alguém reclamar.
- 3ª ordem: churn definitivo de quem tinha decidido voltar.

**Inversão:** "o que garantiria a falha?" — um número de configuração que nunca
foi medido, num caminho que nunca rodou, com o modo de falha sendo bloqueio
total. As três condições existem hoje.

### 3. O débito acumulado fica invisível — Probabilidade: ALTA | Impacto: MÉDIO

A clínica cancela no dia 2 com 1 ficha: débito R$ 2,60, abaixo do piso. Reativa
livremente (por desenho). Agora a conta está `ativa` — e `FaixaTrial` retorna
`null` para `ativa`. O débito de R$ 2,60 **some da interface** até o próximo
cancelamento, quando reaparece somado e cobrado. A #290 diz "tarja permanente com
o valor devido"; o desenho entrega "tarja enquanto cancelada".

**Cadeia:**

- 1ª ordem: dívida existente e invisível.
- 2ª ordem: na volta seguinte, a cobrança inclui um valor que a clínica não
  lembra de dever — a conversa vira contestação.
- 3ª ordem: a política "débito não caduca" fica indefensável na prática, porque
  nunca foi comunicada no intervalo em que era cobrável.

### 4. Cobrança órfã congela o gate para sempre — Probabilidade: MÉDIA | Impacto: MÉDIO

O gate emite a cobrança de débito e grava `provider_charge_id` na âncora. Semanas
depois a clínica volta. A cobrança venceu (`OVERDUE`) ou foi cancelada no painel.
A idempotência do adapter (`buscarCobrancaPorReferencia`) devolve **a mesma
cobrança morta**, com um copia-e-cola que nenhum banco aceita. A clínica paga
nada, o gate nunca destrava, e nada no sistema acusa: do ponto de vista do banco
de dados está tudo consistente.

**Detecção:** só por reclamação. Não há varredura de `devido` com
`provider_charge_id` antigo.

### 5. Gateway fora do ar vira reativação grátis — Probabilidade: BAIXA | Impacto: ALTO

A mitigação óbvia da falha #2 é "se o gateway recusar, deixa passar e mantém o
débito". Aplicada sem distinguir o tipo de erro, ela transforma **qualquer**
instabilidade do Asaas (5xx, timeout de rede) em porta aberta: quem estiver
tentando reativar naquele minuto entra sem pagar. O débito continua registrado,
então não é receita perdida — mas é o gate desligado exatamente quando ninguém
está olhando, e o loop volta a ser lucrativo para quem souber esperar uma janela.

---

## Sinais de alerta precoces

| Sinal                                                                  | Falha que prevê | Onde olhar                         |
| ---------------------------------------------------------------------- | --------------- | ---------------------------------- |
| Ciclo em `devido` com `provider_charge_id` preenchido há > 7 dias      | #4              | Query de diagnóstico, semanal      |
| `[billing-debito]` no log com `status: 400` na emissão                 | #2              | Log, no primeiro uso real          |
| Cobrança de débito paga (`pago`) e assinatura ainda `canceled` > 1 dia | #1              | Query de diagnóstico               |
| Soma de `devido` > 0 em clínica com assinatura `active`                | #3 (esperado)   | Confirma que a acumulação funciona |

---

## Mitigações adotadas (entram no design)

| Falha | Mitigação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Esforço |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| #1    | O sinal observado passa a ser **o débito**, não o status da assinatura. Quitado o débito, a tela troca o QR por confirmação explícita + botão "Continuar a reativação". Nada de esperar transição que não vai acontecer.                                                                                                                                                                                                                                                                                   | Médio   |
| #2    | O gate **degrada em vez de bloquear** quando o gateway RECUSA o valor (`BillingProviderError` 4xx): deixa reativar e **mantém** os ciclos em `devido`. Nunca perdoa. Erro transitório (rede/5xx) continua sendo erro na tela.                                                                                                                                                                                                                                                                              | Baixo   |
| #3    | O valor devido aparece na tela `/assinatura` **em qualquer estado**, inclusive `ativa`, e a tarja ganha uma linha discreta quando há débito com a conta ativa.                                                                                                                                                                                                                                                                                                                                             | Baixo   |
| #4    | **Uma cobrança por âncora, e falha barulhenta no único estado sem saída.** A mitigação inicialmente escrita aqui — reemitir quando a cobrança morre — foi descartada na implementação: a cobrança antiga continua pagável no gateway, e se a clínica pagar aquela, o webhook chega com um `provider_charge_id` que já não está em ciclo nenhum (dinheiro recebido, dívida viva). Ficou: `OVERDUE` devolve o mesmo copia-e-cola (Pix vencido ainda se paga) e `estornada` lança com log `[billing-debito]`. | Baixo   |
| #5    | A degradação da #2 é **exclusiva de 4xx** (recusa explícita do gateway). Rede, timeout e 5xx mantêm o gate fechado. É a mesma distinção que `reprocessarEventosPendentes` já faz.                                                                                                                                                                                                                                                                                                                          | Baixo   |

## Verificação da suposição mais arriscada

`PISO_COBRANCA_CENTAVOS` é a única entrada do desenho que ninguém mediu.
Experimento barato: emitir no sandbox uma cobrança Pix de R$ 1,00 e uma de
R$ 3,00 contra um `customer` de teste, e registrar a resposta no runbook do
`infra/README.md`. Enquanto não medido, a mitigação #2 é o que impede que o chute
custe uma clínica.

**Confiança pós-mitigação: MÉDIA-ALTA.** O desenho sobrevive às cinco narrativas
com mudanças pequenas, e nenhuma delas exige repensar o modelo de dados. O que
continua sem prova é o número do piso e o comportamento do Asaas numa segunda
tentativa de pagamento sobre a mesma cobrança — ambos verificáveis no sandbox,
nenhum bloqueante para a entrega.
