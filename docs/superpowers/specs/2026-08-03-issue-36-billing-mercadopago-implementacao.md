# #36 — Billing pay-as-you-grow via Mercado Pago (implementação)

Data: 03/08/2026. Branch: `docs/36-asaas-sandbox-evento-real`.

## Decisão de trilho

O provedor padrão ativo passou a ser **Mercado Pago** (`preapproval`, assinatura recorrente mensal) após o bloqueio inicial da conta Asaas. Com a liberação e aprovação da conta de produção do Asaas em 08/08/2026 (superando o D12 no `BACKLOG.md`), a arquitetura suporta ambos os gateways (**Asaas** e **Mercado Pago**) como opções variadas de pagamento para o sistema. A porta `BillingProvider` resolverá o gateway correspondente baseado na variável de ambiente `BILLING_PROVIDER` (`mercado_pago` ou `asaas`).

`subscription.provider` é **persistido por linha**, não lido de env. Assinatura
criada num gateway não pode ser reinterpretada por outro só porque a variável
de ambiente mudou depois.

## Modelo comercial

Faixas **marginais** — cadastrar mais um paciente nunca reprecifica os
anteriores:

| Faixa | Preço/paciente/mês |
| --- | --- |
| 1–15 | R$ 39,00 |
| 16–40 | R$ 32,00 |
| 41+ | R$ 25,00 |

Onboarding da clínica: R$ 0. A cobrança nasce no cadastro do 1º paciente
(Mês 1 = R$ 39,00). Mês 2+ = **uma** cobrança consolidada a cada 30 dias.

Toda aritmética em **centavos inteiros**. Fonte única: `src/lib/billing/calculator.ts`.
O SQL nunca calcula preço — devolve contagem.

> Correção de enunciado: 100 pacientes = 15 + 25 + **60**, ou seja
> R$ 2.885,00 (o valor R$ 2.860,00 do briefing corresponde a 99 pacientes).

## Definição oficial de "paciente ativo no ciclo"

Implementada em `billing_apurar_ciclo(uuid)` (migração 0071). Conta se
satisfizer **ao menos um**:

1. `patient.criado_em` dentro de `[inicio, fim)` → `criado_no_ciclo`
2. interação no ciclo → `interacao_no_ciclo`. Interação = `session`
   (`agendada_para`, `check_in_em` ou `criado_em`), `evidence.aprovado_em`, ou
   `session_note.criado_em` via `session_id`
3. `patient.arquivado_em IS NULL` → `ativo_nao_arquivado`

Consequência que fecha a regra: **paciente arquivado e sem interação no ciclo
não é faturado**. Intervalo semiaberto — a borda `inicio` conta, a borda `fim`
não. Ambos os lados verificados por teste.

## Arquitetura

### Plano de privilégios
Billing é **plano de identidade**, como `auth_throttle` (0061) e
`asaas_webhook_event` (0066).

- `app_role` (produto, via `withTenant`): **apenas SELECT** da própria clínica
  em `subscription` / `billing_cycle` / `billing_cycle_patient`. Se o app
  pudesse escrever `subscription.status`, o gate de pagamento seria contornável
  de dentro do produto.
- `iris_auth` (via `authDb`): escrita total. O webhook chega do gateway, não de
  uma sessão — não há tenant para `withTenant` estabelecer; e o job varre todas
  as clínicas, que é justamente o que `withTenant` proíbe.
- `iris_auth` **não** tem grant em `patient`. A apuração passa obrigatoriamente
  por `billing_apurar_ciclo` (SECURITY DEFINER), que devolve contagem, nunca
  dado clínico. Verificado: `has_table_privilege('iris_auth','patient','SELECT')`
  = `false`.

`billing_apurar_ciclo` é DEFINER e o `clinic_id` vem da **própria linha** de
`billing_cycle`, nunca de parâmetro — não há caminho para forjar tenant.

### Por que o job é um POST, não um script com lógica
`scripts/fechamento-ciclo-billing.mjs` é um gatilho magro que faz um POST
autenticado em `/api/internal/billing/fechar-ciclos`. A apuração, o cálculo e a
chamada ao gateway ficam no app.

Razão: a imagem Docker do job **não herda** as dependências do app (o Dockerfile
lista `COPY` e instala pacotes à mão), e um import que não chegou lá já derrubou
o motor de escalonamento em produção com test/typecheck/lint verdes (#156).
Uma tabela de preços duplicada num `.mjs` seria a mesma classe de bug, com a
agravante de cobrar valor errado em silêncio.

### Webhook: gravar antes de aplicar
O Mercado Pago desabilita endpoint lento, então a rota grava a entrega, responde
200, e só então aplica o efeito. Falha ao aplicar **não** vira 5xx: deixa
`aplicado_em` NULL e `reprocessarEventosPendentes` recupera. Devolver 5xx
trocaria um efeito atrasado por um webhook desligado.

O payload do MP costuma ser só `{type, action, data:{id}}` — **sem estado**. Por
isso a transição é decidida a partir de uma **consulta** à assinatura
(`consultarAssinatura`), não do tipo do evento. Decidir pelo tipo seria inventar
dado que o gateway não mandou.

Dedup: chave composta `type:data.id:action`, decidida pelo UNIQUE do Postgres em
uma instrução atômica (`ON CONFLICT DO NOTHING ... RETURNING`).

### Gate do 1º paciente
Avaliado **dentro da mesma transação** do cadastro
(`avaliarGateCadastroPaciente`), antes do primeiro INSERT. Fora dela, dois
cadastros simultâneos numa clínica virgem leriam ambos "sem paciente" e
criariam dois pacientes sob uma cobrança só.

Bloqueio é sinalizado por `throw` (não `return`) para garantir o ROLLBACK — um
cadastro bloqueado não pode deixar rastro parcial.

Decisões de política:
- `past_due` **não** bloqueia. Falha de Pix/cartão costuma ser do banco do
  cliente; travar cadastro de paciente por isso pune o paciente, não o
  inadimplente. A carência (`subscription.carencia_dias`) é aplicada pelo job.
- `setup_pending` bloqueia **sem** oferecer link de checkout: já há cobrança em
  voo, e mandar de volta ao checkout gera cobrança duplicada.
- Clínica `isento_trial` (legado pré-cobrança, 0064) nunca é bloqueada. Cobrar
  retroativamente quem entrou antes do modelo comercial existir seria mudar o
  contrato unilateralmente.

Segunda barreira no banco: `app_assinatura_bloqueia_cadastro()`, para que um
caminho de escrita novo (import em lote, seed, action futura) não nasça furando
a regra em silêncio.

## Verificação executada

Medida, não lida:

- `information_schema` / `pg_proc` / `pg_policies` após `db:migrate`:
  4 tabelas, 7 policies, RLS `ENABLE`+`FORCE` nas 4,
  `billing_apurar_ciclo.prosecdef = true`.
- `has_table_privilege('app_role','subscription','UPDATE')` = `false`;
  `SELECT` = `true`.
- `db/tests/billing-apuracao.int.test.ts`: **21 passaram, 0 skipped** — inclui
  isolamento cross-tenant, bordas do intervalo, idempotência da dupla apuração,
  unicidade sob 3 sessões, e `UPDATE subscription` sob `app_role` rejeitando de
  verdade (não 0-linhas mudo).
- `src/app/(app)/pacientes/novo/actions.int.test.ts`: 17 passaram — 4 casos
  novos cobrem o gate (free_tier bloqueia e não grava nada; setup_pending;
  past_due passa; isenta passa).
- Suíte unitária: 692 passaram (94 arquivos).
- `ctx-forjavel-guard`: verde — a action nova de assinatura respeita a
  separação `logic.ts` (core) / `actions.ts` (wrapper).

## Defeitos encontrados e corrigidos durante a implementação

Achados por revisão adversarial dos próprios testes, todos com prova de mutação
(a linha corrigida foi revertida e o teste-alvo confirmado vermelho):

1. **`normalizarEvento` devolvia o id do PAGAMENTO como id de assinatura.**
   Numa notificação `type: "payment"`, `data.id` é o id do pagamento — o
   consumidor pedia `GET /preapproval/<payment_id>`, tomava 404 e o evento ficava
   pendente **para sempre** na varredura de reprocessamento, queimando uma
   chamada ao MP por evento por execução. Agora `preapproval_id` é a única fonte
   para eventos de pagamento.

2. **Recusa definitiva do gateway realimentava a fila infinitamente.**
   `reprocessarEventosPendentes` gravava só `erroAplicacao` no catch, nunca
   `aplicadoEm`. Agora 4xx (recusa que não melhora com retry) carimba
   `aplicadoEm` — **exceto 401, 408 e 429**, que são transitórios na prática: um
   pico de rate limit carimbaria um lote de eventos legítimos e eles nunca mais
   entrariam na fila, que é perda de faturamento silenciosa.

3. **Corpo do webhook não era autenticado.** O HMAC do Mercado Pago assina
   `id;request-id;ts` e **não cobre o corpo**. Uma assinatura capturada valia,
   dentro da janela de 5 minutos, para qualquer corpo — bastava trocar `data.id`
   no JSON para apontar o efeito a outra assinatura, de outra clínica. Agora a
   rota exige `body.data.id === query data.id` antes de aplicar qualquer efeito.

   Limite honesto: o corpo continua **não autenticado**. O que passou a ser
   amarrado é o *alvo* do efeito. O dano residual é baixo porque o efeito vem da
   consulta ao gateway, não do payload — o corpo só influencia a chave de dedup
   e o campo `evento`.

4. **O wrapper `actions.ts` do cadastro descartava `bloqueioBilling`** e devolvia
   só `{ error }`, então o campo novo nunca chegava ao formulário e o bloqueio
   aparecia como erro genérico, sem o caminho para `/assinatura`.

## Pendências conhecidas

- ~~Credenciais do Mercado Pago não foram provisionadas~~ — **feito 04/08/2026.**
  `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`
  e `BILLING_PROVIDER=mercado_pago` provisionados no Easypanel (`iris-app`).
  Webhook registrado via painel MP (produção + sandbox,
  `https://irisclinica.ia.br/api/hooks/mercadopago`, eventos "Planos e
  assinaturas" + "Pagamentos (legacy)").
- **Defeito achado e corrigido nesta virada:** branch só foi mergeada em main
  via PR #192 em 04/08/2026 — antes disso a rota nem existia na imagem de
  produção (404). Depois do merge, um segundo defeito: `BILLING_PROVIDER=mercadopago`
  foi colado sem underscore; `getBillingProvider()` (`provider/index.ts`) só
  reconhece `mercado_pago` e lançava `Error: BILLING_PROVIDER desconhecido`
  antes de qualquer guard da própria rota — 500 em qualquer POST. Corrigido
  trocando para `mercado_pago`. Rota agora responde 401 a payload não assinado
  (`curl` medido), que é o comportamento correto.
- **Nenhum evento real do Mercado Pago foi exercitado — ainda em aberto.** O
  "Simular notificação" do painel MP foi testado contra a URL de produção:
  segredo comparado campo a campo (idêntico ao do Easypanel), mas o simulador
  manda uma fixture fixa (payload com `date: 2021-11-01`) cujo `ts` provavelmente
  não é fresco — a checagem anti-replay (`JANELA_REPLAY_MS`,
  `mercado-pago.ts:205`) rejeita por design, não por bug. "Lista de eventos no
  painel ≠ produto habilitado" — mesmo precedente do Asaas: simulador não
  reproduz o dialeto real (timestamp vivo) do gateway. Só uma assinatura real
  criada/atualizada prova a última milha.
- **Serviço `billing` do Easypanel não foi criado.** O compose tem o serviço sob
  `profiles: ["billing"]`; o provisionamento em produção é ação de infra e não
  foi feito.
- Cancelamento de assinatura pela UI não foi implementado (a porta tem
  `cancelarAssinatura`, mas não há tela).
