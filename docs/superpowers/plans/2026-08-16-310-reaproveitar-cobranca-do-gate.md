# #310 — Reaproveitar a cobrança existente no gate de reativação

> **Para executores autônomos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Objetivo:** Fazer o gate de reativação (#290) **reapresentar** uma cobrança que já existe e ainda é pagável, em vez de emitir uma segunda cobrança da mesma dívida.

**Arquitetura:** O gate passa a consultar, para cada ciclo `devido` que já carrega `provider_charge_id`, o estado daquela cobrança no gateway através de um método NOVO da porta (`consultarCobrancaParaReuso`). O débito é então partido em dois conjuntos: **(a)** ciclos com cobrança viva e pagável — cada um reapresenta a SUA cobrança; **(b)** todo o resto — uma única cobrança nova consolidada, exatamente como hoje. O retorno do gate deixa de ser uma forma de pagamento e passa a ser uma LISTA de cobranças, e a tela renderiza N.

**Stack:** TypeScript, Next.js 16 (App Router, Server Actions), Drizzle ORM + Postgres, Vitest (unit + integração), React 19 + Testing Library.

**Spec:** issue GitHub **#310**; contexto da linha em `.specs/features/debito-reativacao-290/spec.md` e `.specs/features/debito-reativacao-290/design.md`. As sete decisões de desenho estão transcritas na íntegra em "Decisões travadas" abaixo — **elas são a spec desta issue e não se reabrem**.

---

## Restrições globais

- **Idioma:** todo comentário de código, copy de tela, mensagem de commit, descrição de PR e comentário de issue em **PT-BR** (`CLAUDE.md`, `AGENTS.md`).
- **Nenhuma migração de banco.** Não há coluna nova. `provider_charge_id`, `debito_agrupado_em` e `cobranca_emitida_em` já existem (`0075`, `0097`, `0098`).
- **Nenhum link/BR Code é persistido.** Não há coluna para eles e este plano não cria uma. Reapresentar o link exige reconsultar o gateway a cada gate.
- **`pnpm format` NUNCA no repositório inteiro.** Só nos arquivos tocados: `pnpm prettier --write <arquivo> <arquivo> …`. (`pnpm format` reformata `.agents/`, `CLAUDE.md` e o worktree aninhado — memória `pnpm format reformata o repo inteiro`.)
- **Baseline conhecida, para não confundir vermelho herdado com regressão:**
  - `pnpm test` tem **1 falha pré-existente**: `src/lib/billing/vencimento.test.ts` → "garante a janela em todo dia de dois anos" (timeout de 5000ms, roda em ~5405ms). Qualquer OUTRA falha é sua.
  - `pnpm lint` tem **39 erros pré-existentes**, quase todos em artefatos de build lintados por engano. Qualquer erro NOVO em arquivo de `src/` ou `db/` é seu.
  - `pnpm test` **não** roda `*.int.test.ts` (excluídos no `vitest.config.ts`). Os testes de integração só rodam em `pnpm test:rls`. Verde no `pnpm test` não é evidência nenhuma sobre eles (memória `vitest run em *.int.test.ts coleta zero`).
- **`pnpm test:rls` é obrigatório e explícito no checklist** (`AGENTS.md` §5.2).
- **Shell:** PowerShell. Caminhos com parênteses (`src/app/(app)/…`) precisam de aspas duplas em todo comando.

---

## Decisões travadas (a spec desta issue — implementar, não reabrir)

**D-1 — Pagável é o critério, e ele é do gateway.** Cobrança antiga é reaproveitável quando `status ∈ {PENDING, OVERDUE}` **e** `deleted !== true`. Qualquer outro status ⇒ não reaproveita.

**D-2 — Débito com mais de uma origem vira mais de uma forma de pagamento.** O débito é partido em dois conjuntos: (a) cada ciclo que já tem cobrança viva e pagável ⇒ reaproveita AQUELA cobrança, uma forma de pagamento por cobrança; (b) todos os demais ciclos ⇒ UMA cobrança nova consolidada, como hoje. Motivo: consolidar exigiria cancelar a antiga, e `DELETE /payments/{id}` não tem status aceitos medidos — emitir por cima da antiga viva É a cobrança dupla que a issue existe para evitar.

**D-3 — Falha ao consultar a cobrança antiga é fail-closed, e distingue morto de indisponível.** 404 ⇒ ninguém pode pagar aquilo: trata como não-pagável e segue para o conjunto (b), com `console.warn` de tag própria. Rede/timeout/5xx/401/408/429 ⇒ **não emite nada e não reativa**; os ciclos permanecem `devido`. Nunca degradar em silêncio (precedente #157). Reativação adiada é reversível por nova tentativa; cobrança dupla não é.

**D-4 — Cobrança antiga já paga no momento do gate liquida o ciclo ali mesmo.** `RECEIVED`/`CONFIRMED`/`RECEIVED_IN_CASH` ⇒ chamar o MESMO caminho de `liquidarCiclo` e recomputar o débito antes de decidir.

**D-5 — O `provider_charge_id` da âncora só é sobrescrito quando emitimos cobrança nova para aquela âncora.** Ciclo reaproveitado mantém o id. Sem isso, o webhook do pagamento antigo não acha ciclo (`subscription.ts:1745-1755`) e vira `erroAplicacao: "cobrança sem ciclo correspondente"`.

**D-6 — Instrução pendente é o sinal da janela crítica; não calcular hora.** Antes de apresentar link reaproveitado, consultar as instruções daquela cobrança. Havendo `AWAITING_REQUEST` ou `SCHEDULED`, **não apresentar como pagável**, copy própria em pt-BR.

**D-7 — Estados terminais têm ramo explícito, nada de herdar o `throw`.** `REFUNDED`/`REFUND_*`/`CHARGEBACK_*`/`deleted: true` ⇒ não-pagável, vai para o conjunto (b). O `throw` de `estornada` (`debito.ts:286`) não pode ser herdado pelo caminho novo.

---

## Fatos medidos na doc do Asaas (não reabrir, não remedir)

- `Payment.status`: `PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, RECEIVED_IN_CASH, REFUND_REQUESTED, REFUND_IN_PROGRESS, CHARGEBACK_*, DUNNING_*, AWAITING_RISK_ANALYSIS`. **Não existe status "cancelada"** — o marcador de remoção é o boolean `deleted`.
- `GET /payments/{id}` devolve `invoiceUrl`, `value`, `netValue`, `dueDate`, `originalDueDate`, `deleted`, `pixTransaction`. DTO único para todos os status; nada diz que `invoiceUrl` some em `OVERDUE`.
- Esgotadas as retentativas, o `Payment` vai a `OVERDUE`, a autorização segue **Ativa**, e "O Asaas mantém o link ativo com boleto e Pix Copia e Cola após o encerramento da retentativa". **É este fato que torna a issue possível.**
- `GET /pix/automatic/paymentInstructions?paymentId=..&status=..` existe. Enum de status: `AWAITING_REQUEST, SCHEDULED, DONE, CANCELLED, REFUSED`. `purpose`: `SCHEDULE | RETRY_AFTER_DUE_DATE`.
- **Não existe rota para cancelar instrução pendente.** Literal: "O cancelamento ocorre apenas de forma indireta, por meio do cancelamento da autorização".
- Janela crítica, literal: "O recebimento por outro meio fica bloqueado somente dentro da janela crítica: A partir das 22h de D-1 até o dia do vencimento D."
- `DELETE /v3/payments/{id}` existe, mas **quais status ele aceita NÃO está documentado**. Nada neste plano depende dele.

## Não medido — assunções registradas

1. **Em que `status` fica o `Payment` quando a instrução é recusada no AGENDAMENTO por teto (`MAXIMUM_AMOUNT_EXCEEDED`).** Só se mede em produção (o sandbox não ativa Pix Automático — memória `sandbox-asaas-nao-ativa-pix-automatico`). O desenho **não depende disso**: a classificação é por allow-list de status (`PENDING`/`OVERDUE`), então qualquer status inesperado cai em "não-pagável" e vira cobrança nova consolidada — nunca cobrança dupla.
2. **Se instruções `SCHEDULED`/`AWAITING_REQUEST` sobrevivem à revogação da autorização.** A doc diz que cancelar a autorização é o único cancelamento indireto de instrução, mas não diz o que acontece com as pendentes. D-6 continua correto nos dois casos: se sobrevivem, o gate não apresenta o código (certo); se viram `CANCELLED`, o gate apresenta (certo).
3. **Se `GET /pix/automatic/paymentInstructions` responde 200 com `data: []` para uma cobrança que nunca foi de Pix Automático** (a cobrança avulsa de débito é Pix comum). Este plano **não assume isso**: qualquer erro na listagem é fail-closed (bloqueia), e o primeiro deploy vai mostrar no log `[billing-reuso]` se a listagem falhar para cobranças avulsas. Se falhar, o ajuste é uma linha (tratar 404 da listagem como "sem instruções") — registre em issue nova, não improvise.
4. **Valor mínimo real de cobrança Pix no Asaas** (`PISO_COBRANCA_AVULSA_CENTAVOS = 500` é escolha conservadora, não medição). Inalterado por esta issue.

---

## Decisões de desenho tomadas NESTE plano (além das sete)

Estão aqui explícitas porque um executor não deve descobri-las lendo o código.

**P-1 — A porta ganha um MÉTODO NOVO em vez de alargar `consultarCobranca`.** Ver a seção "Alargar a porta" abaixo, com os dois caminhos pesados e os três chamadores afetados.

**P-2 — `adiado` não serve para o fail-closed do D-3; entra uma variante `bloqueado`.** No contrato de hoje, `adiado` **prossegue para a ativação** (`logic.ts:186` só barra em `tipo === "cobranca"`). D-3 exige "não emite nada e **não reativa**". Implementar D-3 como `adiado` reativaria a clínica sem cobrar — o oposto do pedido. Entra `{ tipo: "bloqueado"; motivo: "gateway_indisponivel" | "cobranca_irrecuperavel" }`, que `logic.ts` traduz em `error` com copy própria. "Adiada" no texto do D-3 se refere à REATIVAÇÃO ser adiada, não ao `tipo: "adiado"` (que é sobre a DÍVIDA ser adiada).

**P-3 — Duas copies para `bloqueado`, porque as orientações são opostas.** Gateway fora do ar pede "tente de novo em alguns instantes"; cobrança estornada pede "fale com o suporte". Mandar quem caiu num 500 falar com o suporte é ruído; mandar quem tem estorno insistir é um beco. Mesmo raciocínio do `try` próprio de `logic.ts:178-183`.

**P-4 — A âncora do conjunto (b) é o ciclo mais antigo de (b) que NÃO carrega `provider_charge_id`.** Sem esta regra, D-7 vaza um salto adiante: um ciclo cuja cobrança foi estornada é classificado "morto" e vai para (b); se ele virar âncora, a `referenciaExterna` da emissão é `debito:<mesma âncora>`, a idempotência do adapter (`asaas.ts:1052`, busca por `externalReference`) devolve **a mesma cobrança estornada**, e o gate trava para sempre — exatamente o que D-7 proíbe, uma etapa depois. Escolher uma âncora sem cobrança prévia garante uma referência externa virgem.

**P-5 — O `throw` de `estornada` pós-emissão (`debito.ts:280-289`) vira `bloqueado/cobranca_irrecuperavel`.** Mesma semântica (barulhento, exige decisão humana, não reativa), sem exceção que atravessa camadas e sem a copy errada de "Fale com o suporte" servindo também para queda de rede. É o resíduo de P-4: se todo ciclo de (b) carrega cobrança, não há âncora com referência virgem.

**P-6 — A âncora de (b) tem `debito_agrupado_em` zerado ao receber a cobrança nova.** Bug que a divisão em (a)/(b) introduz: um ciclo hoje agrupado sob a âncora X pode virar âncora de (b) quando a cobrança de X morre. Se o ponteiro velho ficar, o ciclo aponta para X **e** carrega a cobrança nova; a cascata de `liquidarCiclo` (`subscription.ts:1714-1717`) liquidaria esse ciclo de graça quando alguém pagasse a cobrança de X. `registrarCobrancaDeDebito` passa a gravar `debitoAgrupadoEm: null` na âncora.

**P-7 — O curto-circuito do piso continua ANTES de qualquer round-trip.** `decidirGate(totalGeral)` roda primeiro, como hoje: débito total abaixo do piso vira `adiado` sem consultar o gateway. Preserva os dois testes existentes que contam round-trips ("sem débito nenhum" e "débito abaixo do piso"), e não paga HTTP por dívida que ninguém vai cobrar.

**P-8 — O piso governa apenas a EMISSÃO de (b), nunca a apresentação de (a).** Cobrança que já existe é apresentada mesmo que o total do conjunto seja pequeno: ela já foi emitida, já tem valor mínimo aceito, e esconder um código de pagamento vivo seria pedir que a clínica pague por um canal que a tela não mostra.

**P-9 — A emissão de (b) mantém o comportamento de erro de hoje** (`recusaDefinitivaDoGateway` ⇒ conjunto (b) adiado; demais erros ⇒ `throw`). D-3 fala da **consulta**, que é caminho novo. Não mexer na emissão mantém os dois testes de integração existentes válidos e limita o diff. A assimetria é deliberada e está comentada no código.

---

## Alargar a porta: os dois caminhos, pesados, e a escolha

**Caminho A — alargar `consultarCobranca`** para devolver `urlPagamento`, `pixCopiaECola` e `deleted`.

- `urlPagamento` (`invoiceUrl`) e `deleted` saem **de graça** do mesmo `GET /payments/{id}` que já é feito.
- `pixCopiaECola` **não**: exige `GET /payments/{id}/pixQrCode` (`asaas.ts:872`). A verificação do D-6 exige mais duas chamadas ao índice de instruções. Isso são **três chamadas HTTP extras por evento de webhook**, pagas por quem não precisa delas.
- O caller teria que decidir "é pagável?" a partir de `StatusCobranca`, cujo `default` é `pendente` (`asaas.ts:272-273`). `DUNNING_REQUESTED`, `AWAITING_RISK_ANALYSIS` e **todo status futuro que o Asaas inventar** chegariam como `pendente` e seriam reaproveitados. É fail-**open** por construção, contra o D-1 que pede allow-list.
- Chamadores afetados (os três, todos obrigados a mudar): `src/app/api/hooks/asaas/route.ts:166`, `src/lib/billing/subscription.ts:1984`, `db/tests/provedor-fake.ts:211`.

**Caminho B — compor `consultarCobranca` + `brCodeDe` no chamador.** Impossível como escrito: `brCodeDe` é `private` (`asaas.ts:872`) e não está na porta. Torná-lo público publicaria vocabulário do Asaas na porta agnóstica, e ainda deixaria o `StatusCobranca` fail-open do caminho A no colo do `debito.ts`.

**Escolhido: método novo na porta, `consultarCobrancaParaReuso(providerChargeId)`.** É o caminho B com a composição do lado certo da fronteira — o adapter compõe `GET /payments/{id}` + índice de instruções + `brCodeDe`, e devolve a resposta à pergunta que o gate faz. Três razões:

1. **A allow-list de status crus fica dentro do adapter**, único lugar que vê `"PENDING"`/`"OVERDUE"`. Status desconhecido cai em não-pagável — fail-closed, como o D-1 pede.
2. **Custo zero para os três chamadores de `consultarCobranca`**: `route.ts:166` e `subscription.ts:1984` ficam **byte-a-byte iguais**, sem HTTP extra no caminho quente do webhook. `provedor-fake.ts` só GANHA um método — e o TypeScript derruba o build se ele não acompanhar, que é a proteção que aquele arquivo documenta na própria docstring (linhas 34-40).
3. As chamadas caras (QR + instruções) são pagas só pelo gate, que roda uma vez por clique em "Ativar".

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
| --- | --- | --- |
| `src/lib/billing/provider/types.ts` | Tipos `FormaPagamentoCobranca`, `CobrancaParaReuso`, `MotivoNaoReuso`; método na interface `BillingProvider` | Modificar (~+70 linhas) |
| `src/lib/billing/provider/index.ts` | Reexportar os tipos novos | Modificar (~+3 linhas) |
| `src/lib/billing/provider/asaas.ts` | Implementar `consultarCobrancaParaReuso` (allow-list, `deleted`, instruções, QR) | Modificar (~+130 linhas) |
| `src/lib/billing/provider/asaas.test.ts` | 11 casos unitários do método novo | Modificar |
| `db/tests/provedor-fake.ts` | Implementar o método no dublê | Modificar (~+40 linhas) |
| `src/lib/billing/debito.ts` | `levantarDebito` devolve ciclos; classificação (a)/(b); contrato novo do gate | Modificar (o grosso do diff) |
| `src/lib/billing/debito.test.ts` | Testes unitários da divisão (a)/(b) | Modificar |
| `src/app/(app)/assinatura/logic.ts` | `AtivacaoState.debito` vira lista; ramo `bloqueado` | Modificar |
| `src/app/(app)/assinatura/formulario-ativacao.tsx` | Renderizar N cobranças + estado "em processamento" | Modificar |
| `src/app/(app)/assinatura/formulario-ativacao.test.tsx` | Casos de N cobranças e de "em processamento" | Modificar |
| `src/app/(app)/assinatura/gate-debito.int.test.ts` | Casos de integração do reaproveitamento | Modificar |

Nenhum arquivo novo. Nenhuma migração.

---

## Contrato final (o que cada tarefa constrói)

```ts
// src/lib/billing/provider/types.ts

/** Como uma cobrança se paga, do jeito que a tela precisa renderizar. */
export type FormaPagamentoCobranca =
  | { forma: "pix_copia_e_cola"; brCode: string; urlPagamento?: string }
  | { forma: "link"; urlPagamento: string };

/** Por que uma cobrança já emitida NÃO pode ser reapresentada. */
export type MotivoNaoReuso =
  | "nao_encontrada"
  | "removida"
  | "estornada"
  | "status_nao_pagavel"
  | "sem_forma_de_pagamento";

export type CobrancaParaReuso =
  | { reuso: "pagavel"; pagamento: FormaPagamentoCobranca }
  | { reuso: "em_processamento" }
  | { reuso: "paga" }
  | { reuso: "morta"; motivo: MotivoNaoReuso };
```

```ts
// src/lib/billing/debito.ts
export type FormaPagamentoDebito = FormaPagamentoCobranca; // alias, mantém o import de logic.ts

export interface CicloDevido {
  id: string;
  valorCentavos: number;
  providerChargeId: string | null;
}

export interface DebitoLevantado {
  totalCentavos: number;
  /** Ordenados por `inicio`, depois `id`. O primeiro é o mais antigo. */
  ciclos: CicloDevido[];
}

export interface CobrancaDoDebito {
  cicloId: string;
  providerChargeId: string;
  valorCentavos: number;
  /** `true` = reapresentada; `false` = emitida agora. */
  reaproveitada: boolean;
  situacao:
    | { estado: "pagavel"; pagamento: FormaPagamentoDebito }
    | { estado: "em_processamento" };
}

export type ResultadoGateDebito =
  | { tipo: "sem_debito" }
  | { tipo: "adiado"; totalCentavos: number; motivo: "abaixo_do_piso" | "recusa_do_gateway" }
  | { tipo: "bloqueado"; totalCentavos: number; motivo: "gateway_indisponivel" | "cobranca_irrecuperavel" }
  | { tipo: "cobranca"; totalCentavos: number; cobrancas: CobrancaDoDebito[] };
```

```ts
// src/app/(app)/assinatura/logic.ts — AtivacaoState
debito?: { valorCentavos: number; cobrancas: CobrancaDoDebito[] };
```

---

## Copy pt-BR dos estados novos

| Estado | Título | Texto |
| --- | --- | --- |
| `bloqueado / gateway_indisponivel` (em `state.error`) | — | "Não conseguimos confirmar agora as cobranças em aberto da sua conta. Nada foi cobrado, e nenhuma cobrança nova foi criada. Tente novamente em alguns instantes." |
| `bloqueado / cobranca_irrecuperavel` (em `state.error`) | — | "A cobrança em aberto da sua conta precisa de revisão manual antes de a assinatura ser reaberta. Fale com o suporte informando o CNPJ da clínica." |
| `situacao.estado === "em_processamento"` | "Cobrança em processamento no seu banco" | "Esta cobrança já foi enviada ao seu banco e está sendo processada. Não pague por outro meio agora — você pode acabar pagando duas vezes. Assim que o banco responder, esta tela avisa sozinha." |
| `cobrancas.length > 1` (intro) | "Pague o valor em aberto para reativar" | "Há mais de uma cobrança em aberto e cada uma se paga separadamente. Uma delas já tinha sido enviada antes e continua válida — pagar as duas quita o total de {total}." |

O título do bloco de débito quando `cobrancas.length === 1` continua "Pague o valor em aberto para reativar", com o texto de hoje.

---

## Régua de mutação por comportamento

Obrigatória (`AGENTS.md` §5.2, ponto 5). Cada teste do plano traz, embaixo, **qual mutação ele mata**. A tabela abaixo é o índice; o enunciado repetido está em cada tarefa.

| # | Teste | Mutação que mata |
| --- | --- | --- |
| 1 | `OVERDUE` não-deleted → `pagavel` | Restringir o reuso a `PENDING`. `OVERDUE` é o estado real depois das retentativas — é o caso central da issue |
| 2 | `deleted: true` com status `PENDING` → `morta/removida` | Decidir só pelo `status`. Não existe status "cancelada" no Asaas; `deleted` é o único marcador de remoção |
| 3 | `RECEIVED` → `paga` | Classificar cobrança paga como pagável e reapresentar QR de dívida já quitada |
| 4 | `AWAITING_RISK_ANALYSIS` → `morta/status_nao_pagavel` | Trocar a allow-list `{PENDING,OVERDUE}` por deny-list (`status !== "REFUNDED"`): todo status desconhecido passaria como pagável |
| 5 | `REFUNDED` → `morta/estornada`, sem lançar | Herdar o `throw` de `estornada` no caminho novo (D-7): gate travado para sempre |
| 6 | 404 no `GET /payments/{id}` → `morta/nao_encontrada` | Propagar o 404 e trancar a reativação por causa de um id órfão |
| 7 | 500 no `GET /payments/{id}` → **lança** | Tratar qualquer erro como "não encontrada" (degradar em silêncio, #157) — produz cobrança dupla |
| 8 | instrução `SCHEDULED` → `em_processamento` e **zero** chamada a `/pixQrCode` | Ignorar as instruções e devolver copia-e-cola dentro da janela crítica (pagamento em duplicidade) |
| 9 | instruções só `DONE`/`REFUSED`/vazias → `pagavel` | Tratar qualquer instrução como pendente: o gate nunca mais apresentaria cobrança nenhuma |
| 10 | 500 na listagem de instruções → **lança** | Engolir a falha da listagem e apresentar o código sem saber se há débito automático a caminho |
| 11 | `PENDING` sem `invoiceUrl` e sem BR Code → `morta/sem_forma_de_pagamento` | Devolver `pagavel` com QR vazio — a clínica acha que pagou o que não pagou |
| 12 | Ciclo com cobrança `OVERDUE` → **zero** `POST /payments` | **O bug de hoje**: emitir sempre (`debito.ts:226`). O oráculo é a contagem de POSTs, não o retorno |
| 13 | Idem, relendo o banco: `provider_charge_id` **inalterado** | D-5: sobrescrever o id da âncora reaproveitada (`debito.ts:313`) |
| 14 | Pagar a cobrança ANTIGA concilia o ciclo (`levantarDebito` = 0) | **Negativo do DoD.** A mutação de #13 faria o webhook antigo não achar ciclo (`subscription.ts:1745-1755`) → `erroAplicacao: "cobrança sem ciclo correspondente"` = dinheiro recebido com dívida viva |
| 15 | Um ciclo com cobrança viva + um sem → 1 reapresentada e **1** POST só do outro | Consolidar tudo numa cobrança nova por cima da viva — a cobrança dupla que a issue existe para evitar |
| 16 | Ciclo (b) reapontado; âncora nova com `debito_agrupado_em NULL`; pagar (a) não liquida (b) | P-6: deixar o ponteiro velho faz pagar a cobrança de (a) liquidar ciclos de (b) de graça |
| 17 | 500 na consulta → `bloqueado`, zero POST, ciclos `devido`, assinatura `canceled` | D-3: degradar para "emite nova" (cobrança dupla) ou para "adiado" (reativa sem cobrar) |
| 18 | 404 na consulta → segue para (b), **1** POST, sem bloquear | D-3: tratar 404 como indisponibilidade e trancar a clínica fora por um id órfão |
| 19 | Cobrança antiga `RECEIVED` → ciclo `pago` na hora, zero POST, ativação segue | D-4: ignorar o pagamento já recebido e devolver QR de dívida quitada |
| 20 | Instrução `SCHEDULED` → `em_processamento`, sem BR Code, assinatura segue `canceled` | D-6: apresentar copia-e-cola dentro da janela crítica |
| 21 | Ciclo `devido` SEM `provider_charge_id` → fluxo de hoje, 1 POST | Passar a consultar o gateway para todo mundo, inclusive quem nunca teve cobrança |
| 22 | 2 cobranças → dois copia-e-cola distintos e os dois valores na tela | Renderizar só `cobrancas[0]` — a segunda ficaria invisível e nunca seria paga |
| 23 | `em_processamento` → sem QR, sem botão copiar, com a copy própria | Cair no ramo de QR com `brCode` `undefined` |
| 24 | Polling gira com cobrança aberta e para quando `debitoCentavos` zera | Trocar o sinal do polling para `situacaoConta.estado` (gira para sempre sobre QR já pago) |

---

### Tarefa 1: Porta e adapter — `consultarCobrancaParaReuso`

**Arquivos:**
- Modificar: `src/lib/billing/provider/types.ts`
- Modificar: `src/lib/billing/provider/index.ts`
- Modificar: `src/lib/billing/provider/asaas.ts:893` (região de `consultarCobranca`)
- Modificar: `db/tests/provedor-fake.ts:211`
- Teste: `src/lib/billing/provider/asaas.test.ts`

**Interfaces:**
- Consome: nada de tarefas anteriores.
- Produz: `FormaPagamentoCobranca`, `MotivoNaoReuso`, `CobrancaParaReuso` (exportados de `provider/types.ts` e reexportados por `provider/index.ts`); `BillingProvider.consultarCobrancaParaReuso(providerChargeId: string): Promise<CobrancaParaReuso>`.

- [ ] **Passo 1: Escrever os tipos e o método na porta**

Em `src/lib/billing/provider/types.ts`, logo depois de `CobrancaEmitida` (linha 227):

```ts
/**
 * Como uma cobrança se paga, do jeito que a tela precisa renderizar.
 *
 * Mora aqui, e não em `debito.ts`, porque agora é a PORTA que devolve isto:
 * quem sabe montar a forma de pagamento é o adapter, que tem o `invoiceUrl` e o
 * copia-e-cola. `debito.ts` reexporta como `FormaPagamentoDebito`.
 */
export type FormaPagamentoCobranca =
  | { forma: "pix_copia_e_cola"; brCode: string; urlPagamento?: string }
  | { forma: "link"; urlPagamento: string };

/** Por que uma cobrança já emitida NÃO pode ser reapresentada. */
export type MotivoNaoReuso =
  /** O gateway não reconhece o id (404). Ninguém consegue pagar aquilo. */
  | "nao_encontrada"
  /** Removida no gateway. No Asaas não há status "cancelada": é o boolean `deleted`. */
  | "removida"
  /** Estornada/chargeback — decisão comercial humana, nunca reapresentada. */
  | "estornada"
  /** Status fora da allow-list de pagáveis (inclui todo status futuro desconhecido). */
  | "status_nao_pagavel"
  /** Existe e é pagável, mas o gateway não devolveu link nem copia-e-cola. */
  | "sem_forma_de_pagamento";

/**
 * Estado de uma cobrança JÁ EMITIDA, do ponto de vista de quem quer
 * reapresentá-la em vez de emitir outra (#310).
 *
 * ## Por que não é `consultarCobranca` alargada
 *
 * `consultarCobranca` devolve `StatusCobranca`, cujo `default` é `pendente`:
 * `DUNNING_*`, `AWAITING_RISK_ANALYSIS` e todo status que o gateway inventar
 * chegariam como "pendente" e seriam reaproveitados. Decidir reuso por ali é
 * fail-OPEN por construção, e o modo de falha é cobrança dupla. Aqui a decisão
 * é por ALLOW-LIST de status cru, dentro do adapter, que é o único lugar que vê
 * o vocabulário do gateway.
 *
 * Os dois chamadores de `consultarCobranca` (a rota do webhook e a varredura de
 * pendentes) também ficam intocados — eles não devem pagar as chamadas extras
 * de QR e de instrução que só o gate precisa.
 */
export type CobrancaParaReuso =
  /** Viva, pagável, e com forma de pagamento na mão. */
  | { reuso: "pagavel"; pagamento: FormaPagamentoCobranca }
  /**
   * Viva, mas com débito automático a caminho (instrução `AWAITING_REQUEST` ou
   * `SCHEDULED`). Não apresentar como pagável: a janela crítica do Pix
   * Automático bloqueia o recebimento por outro meio das 22h de D-1 até D, e
   * quem paga por fora paga duas vezes. A existência da instrução pendente É o
   * fato — não se calcula hora nem fuso.
   */
  | { reuso: "em_processamento" }
  /** Já paga no gateway. Quem chama liquida o ciclo e recomputa o débito. */
  | { reuso: "paga" }
  /** Não reapresentável. Quem chama manda o ciclo para a cobrança consolidada. */
  | { reuso: "morta"; motivo: MotivoNaoReuso };
```

E dentro de `interface BillingProvider`, logo depois de `consultarCobranca` (que termina na região de `types.ts:345-360`):

```ts
  /**
   * Estado de uma cobrança já emitida, para decidir se ela pode ser
   * REAPRESENTADA em vez de emitirmos outra (#310).
   *
   * Obrigatório na porta: um gateway que não saiba responder isto obrigaria o
   * gate a emitir cobrança nova por cima de uma cobrança viva — a cobrança
   * dupla que esta pergunta existe para evitar.
   *
   * **Nunca devolve "morta" por indisponibilidade.** Erro de rede, timeout, 5xx
   * e 4xx transitório SOBEM. "Não consegui verificar" virando "não existe" é
   * exatamente o caminho para cobrar duas vezes.
   */
  consultarCobrancaParaReuso(
    providerChargeId: string,
  ): Promise<CobrancaParaReuso>;
```

Em `src/lib/billing/provider/index.ts`, adicione `FormaPagamentoCobranca`, `MotivoNaoReuso` e `CobrancaParaReuso` à lista de tipos reexportados de `./types`.

- [ ] **Passo 2: Escrever os testes unitários do adapter (falham)**

Em `src/lib/billing/provider/asaas.test.ts`, dentro do `describe("AsaasProvider")`, acrescente:

```ts
  describe("consultarCobrancaParaReuso (#310)", () => {
    /**
     * Roteador de `fetch` por URL. Escrito aqui e não derivado do adapter: se o
     * teste montasse as rotas a partir do módulo sob teste, trocar o endpoint
     * passaria verde.
     */
    function rotear(mapa: {
      payment?: { corpo: unknown; status?: number };
      instrucoes?: Record<string, unknown[]>;
      qr?: { corpo: unknown; status?: number };
    }) {
      fetchMock.mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("/pixQrCode")) {
          return resposta(mapa.qr?.corpo ?? {}, mapa.qr?.status ?? 200);
        }
        if (u.includes("/pix/automatic/paymentInstructions")) {
          const filtro = new URL(u).searchParams.get("status") ?? "";
          return resposta({ data: mapa.instrucoes?.[filtro] ?? [] });
        }
        if (u.includes("/payments/")) {
          return resposta(mapa.payment?.corpo ?? {}, mapa.payment?.status ?? 200);
        }
        throw new Error(`fetch inesperado: ${u}`);
      });
    }

    /** Mutação morta: restringir o reuso a PENDING. OVERDUE é o estado real
     * depois de esgotadas as retentativas, e é o caso central da #310. */
    it("OVERDUE não removida é reaproveitável, com copia-e-cola", async () => {
      rotear({
        payment: { corpo: { id: "pay_1", status: "OVERDUE", deleted: false, invoiceUrl: "https://asaas/i/1" } },
        qr: { corpo: { payload: "00020126-brcode-1" } },
      });

      const r = await new AsaasProvider().consultarCobrancaParaReuso("pay_1");

      expect(r).toEqual({
        reuso: "pagavel",
        pagamento: {
          forma: "pix_copia_e_cola",
          brCode: "00020126-brcode-1",
          urlPagamento: "https://asaas/i/1",
        },
      });
    });

    /** Mutação morta: decidir só pelo `status`. O Asaas NÃO tem status
     * "cancelada" — `deleted` é o único marcador de remoção, e uma cobrança
     * removida com status PENDING passaria como pagável. */
    it("cobrança removida (`deleted`) não é reaproveitável, mesmo PENDING", async () => {
      rotear({ payment: { corpo: { id: "pay_2", status: "PENDING", deleted: true } } });

      expect(await new AsaasProvider().consultarCobrancaParaReuso("pay_2")).toEqual({
        reuso: "morta",
        motivo: "removida",
      });
    });

    /** Mutação morta: classificar cobrança paga como pagável e reapresentar o
     * QR de uma dívida já quitada. */
    it("RECEIVED volta como paga, para o chamador liquidar o ciclo", async () => {
      rotear({ payment: { corpo: { id: "pay_3", status: "RECEIVED", deleted: false } } });

      expect(await new AsaasProvider().consultarCobrancaParaReuso("pay_3")).toEqual({
        reuso: "paga",
      });
    });

    /** Mutação morta: trocar a allow-list {PENDING,OVERDUE} por deny-list
     * (`status !== "REFUNDED"`). Todo status desconhecido passaria a pagável. */
    it("status fora da allow-list não é reaproveitável", async () => {
      rotear({ payment: { corpo: { id: "pay_4", status: "AWAITING_RISK_ANALYSIS", deleted: false } } });

      expect(await new AsaasProvider().consultarCobrancaParaReuso("pay_4")).toEqual({
        reuso: "morta",
        motivo: "status_nao_pagavel",
      });
    });

    /** Mutação morta: herdar o `throw` de `estornada` no caminho novo (D-7).
     * Com o throw, o gate ficaria travado para sempre. */
    it("estorno é ramo explícito, não exceção", async () => {
      rotear({ payment: { corpo: { id: "pay_5", status: "REFUNDED", deleted: false } } });

      expect(await new AsaasProvider().consultarCobrancaParaReuso("pay_5")).toEqual({
        reuso: "morta",
        motivo: "estornada",
      });
    });

    /** Mutação morta: propagar o 404 e trancar a reativação por causa de um id
     * órfão que ninguém consegue pagar. */
    it("404 é cobrança morta, não indisponibilidade", async () => {
      rotear({ payment: { corpo: { errors: [{ description: "not found" }] }, status: 404 } });

      expect(await new AsaasProvider().consultarCobrancaParaReuso("pay_6")).toEqual({
        reuso: "morta",
        motivo: "nao_encontrada",
      });
    });

    /** Mutação morta: tratar qualquer erro como "não encontrada". É o
     * degradar-em-silêncio do #157, e aqui o preço é cobrança dupla. */
    it("5xx SOBE — não vira cobrança morta", async () => {
      rotear({ payment: { corpo: { errors: [] }, status: 500 } });

      await expect(
        new AsaasProvider().consultarCobrancaParaReuso("pay_7"),
      ).rejects.toBeInstanceOf(BillingProviderError);
    });

    /** Mutação morta: ignorar as instruções e devolver o copia-e-cola dentro da
     * janela crítica — pagamento em duplicidade. O "zero chamada a /pixQrCode"
     * mata também a variante que consulta e devolve o código assim mesmo. */
    it("instrução SCHEDULED bloqueia a apresentação, e nem busca o QR", async () => {
      rotear({
        payment: { corpo: { id: "pay_8", status: "OVERDUE", deleted: false, invoiceUrl: "https://asaas/i/8" } },
        instrucoes: { SCHEDULED: [{ id: "ins_8", status: "SCHEDULED" }] },
        qr: { corpo: { payload: "00020126-nao-deve-aparecer" } },
      });

      expect(await new AsaasProvider().consultarCobrancaParaReuso("pay_8")).toEqual({
        reuso: "em_processamento",
      });
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes("/pixQrCode")),
      ).toHaveLength(0);
    });

    /** Mutação morta: tratar QUALQUER instrução como pendente. O gate nunca
     * mais apresentaria cobrança nenhuma — fail-closed demais é gate morto. */
    it("instruções DONE/REFUSED não bloqueiam", async () => {
      rotear({
        payment: { corpo: { id: "pay_9", status: "OVERDUE", deleted: false, invoiceUrl: "https://asaas/i/9" } },
        instrucoes: { AWAITING_REQUEST: [], SCHEDULED: [] },
        qr: { corpo: { payload: "00020126-brcode-9" } },
      });

      const r = await new AsaasProvider().consultarCobrancaParaReuso("pay_9");
      expect(r.reuso).toBe("pagavel");
    });

    /** Mutação morta: engolir a falha da listagem e apresentar o código sem
     * saber se há débito automático a caminho. */
    it("falha ao listar instruções SOBE", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("/pix/automatic/paymentInstructions")) {
          return resposta({ errors: [] }, 500);
        }
        return resposta({ id: "pay_10", status: "OVERDUE", deleted: false, invoiceUrl: "https://a/10" });
      });

      await expect(
        new AsaasProvider().consultarCobrancaParaReuso("pay_10"),
      ).rejects.toBeInstanceOf(BillingProviderError);
    });

    /** Mutação morta: devolver `pagavel` com QR vazio. A clínica acharia que
     * pagou o que não pagou — mesmo raciocínio de `formaDePagamento`. */
    it("sem link e sem copia-e-cola não é reaproveitável", async () => {
      rotear({
        payment: { corpo: { id: "pay_11", status: "PENDING", deleted: false } },
        qr: { corpo: {} },
      });

      expect(await new AsaasProvider().consultarCobrancaParaReuso("pay_11")).toEqual({
        reuso: "morta",
        motivo: "sem_forma_de_pagamento",
      });
    });
  });
```

- [ ] **Passo 3: Rodar os testes e confirmar que falham**

```powershell
pnpm vitest run src/lib/billing/provider/asaas.test.ts
```

Esperado: FAIL — `provider.consultarCobrancaParaReuso is not a function` em todos os 11 casos.

- [ ] **Passo 4: Implementar no adapter Asaas**

Em `src/lib/billing/provider/asaas.ts`, logo depois de `consultarCobranca` (que termina na linha 922):

```ts
  /**
   * Status crus do Asaas em que uma cobrança AINDA PODE SER PAGA (#310).
   *
   * ALLOW-LIST, não deny-list, e a diferença é o modo de falha: o catálogo de
   * status do Asaas cresce sem versionar (`DUNNING_*`, `AWAITING_RISK_ANALYSIS`
   * já estão lá), e uma deny-list deixaria todo status futuro passar como
   * pagável. Errar para "não é pagável" custa uma cobrança nova consolidada;
   * errar para "é pagável" custa uma cobrança que o cliente paga duas vezes.
   *
   * `OVERDUE` está aqui de propósito, e é o coração da issue: esgotadas as
   * retentativas do Pix Automático o `Payment` vai a OVERDUE, a autorização
   * segue Ativa, e o Asaas MANTÉM o link com boleto e Pix Copia e Cola. É essa
   * cobrança que estava sendo duplicada.
   */
  private static readonly STATUS_PAGAVEIS = new Set(["PENDING", "OVERDUE"]);

  /** Status crus que significam dinheiro já recebido. */
  private static readonly STATUS_PAGOS = new Set([
    "RECEIVED",
    "CONFIRMED",
    "RECEIVED_IN_CASH",
  ]);

  async consultarCobrancaParaReuso(
    providerChargeId: string,
  ): Promise<CobrancaParaReuso> {
    let resposta: Record<string, unknown>;
    try {
      resposta = comoRegistro(
        await chamar("GET", `/payments/${encodeURIComponent(providerChargeId)}`),
      );
    } catch (e) {
      // 404 é o ÚNICO erro que vira "morta": o gateway não reconhece o id, e
      // ninguém consegue pagar o que não existe. Todo o resto (rede, timeout,
      // 5xx, 401/408/429) SOBE — "não consegui verificar" virando "não existe"
      // é o caminho direto para a cobrança dupla (precedente #157).
      if (e instanceof BillingProviderError && e.status === 404) {
        console.warn("[billing-reuso] cobrança não encontrada no gateway", {
          providerChargeId,
        });
        return { reuso: "morta", motivo: "nao_encontrada" };
      }
      throw e;
    }

    // O Asaas não tem status "cancelada": remoção é o boolean `deleted`. Checar
    // antes do status, porque uma removida continua carregando o status que
    // tinha quando foi removida.
    if (resposta.deleted === true) {
      return { reuso: "morta", motivo: "removida" };
    }

    const statusCru = comoTexto(resposta.status) ?? "";
    if (AsaasProvider.STATUS_PAGOS.has(statusCru)) return { reuso: "paga" };
    if (!AsaasProvider.STATUS_PAGAVEIS.has(statusCru)) {
      return {
        reuso: "morta",
        motivo:
          mapearStatusCobranca(statusCru) === "estornada"
            ? "estornada"
            : "status_nao_pagavel",
      };
    }

    // D-6: instrução pendente É o sinal da janela crítica. Não se calcula hora
    // nem fuso — a existência da instrução é o fato. Duas consultas com filtro
    // explícito, e não uma sem filtro: `?paymentId=..&status=..` é a forma já
    // medida e em uso (`instrucaoRecusadaDaCobranca`), e passar vários status
    // num parâmetro só não foi medido.
    if (await this.temInstrucaoPendente(providerChargeId)) {
      return { reuso: "em_processamento" };
    }

    const urlPagamento = comoTexto(resposta.invoiceUrl) ?? undefined;
    const { pixCopiaECola } = await this.brCodeDe(providerChargeId);

    if (pixCopiaECola) {
      return {
        reuso: "pagavel",
        pagamento: {
          forma: "pix_copia_e_cola",
          brCode: pixCopiaECola,
          ...(urlPagamento ? { urlPagamento } : {}),
        },
      };
    }
    if (urlPagamento) {
      return { reuso: "pagavel", pagamento: { forma: "link", urlPagamento } };
    }
    // Existe e está pagável no gateway, mas não veio forma nenhuma de pagar.
    // Não é `pagavel`: renderizar um QR vazio faria a clínica achar que pagou o
    // que não pagou. Vira cobrança nova consolidada.
    console.warn("[billing-reuso] cobrança pagável sem link nem copia-e-cola", {
      providerChargeId,
    });
    return { reuso: "morta", motivo: "sem_forma_de_pagamento" };
  }

  /**
   * Há débito automático a caminho para esta cobrança?
   *
   * **Não engole erro de propósito.** Se a listagem falha, não sabemos se
   * existe instrução pendente — e apresentar o copia-e-cola sem saber é
   * exatamente o pagamento em duplicidade que o D-6 existe para evitar. Difere
   * de `motivoDaRecusa`, que degrada porque o motivo é ENRIQUECIMENTO; aqui a
   * resposta decide se um código de pagamento vai para a tela.
   */
  private async temInstrucaoPendente(
    providerChargeId: string,
  ): Promise<boolean> {
    for (const status of ["AWAITING_REQUEST", "SCHEDULED"]) {
      const resposta = comoRegistro(
        await chamar(
          "GET",
          `/pix/automatic/paymentInstructions?paymentId=${encodeURIComponent(providerChargeId)}&status=${status}`,
        ),
      );
      const lista = Array.isArray(resposta.data) ? resposta.data : [];
      if (lista.length > 0) return true;
    }
    return false;
  }
```

Adicione `CobrancaParaReuso` ao bloco de `import type … from "./types"` no topo de `asaas.ts`.

- [ ] **Passo 5: Rodar os testes e confirmar que passam**

```powershell
pnpm vitest run src/lib/billing/provider/asaas.test.ts
```

Esperado: PASS nos 11 casos novos, e nenhum dos casos antigos do arquivo em vermelho.

- [ ] **Passo 6: Implementar no dublê `ProvedorFake`**

O TypeScript derruba o build enquanto o dublê não acompanhar a porta — é a proteção documentada em `db/tests/provedor-fake.ts:34-40`. Em `db/tests/provedor-fake.ts`, depois de `consultarCobranca` (linha 224):

```ts
  /**
   * Reuso de cobrança (#310). O fake modela só o que os testes de integração
   * dele precisam observar: o `estado` do wire decide, e o copia-e-cola é
   * derivado do id, igual ao de `emitirCobrancaAvulsa`.
   *
   * O gateway fake NÃO modela instrução de débito nem `deleted`: essas duas
   * entidades são do Pix Automático do Asaas e é lá que são testadas.
   */
  async consultarCobrancaParaReuso(
    providerChargeId: string,
  ): Promise<CobrancaParaReuso> {
    const corpo = await pedir(`${BASE_URL_FAKE}/cobrancas/${providerChargeId}`);
    const status = mapearStatusCobranca(corpo.estado);
    if (status === "paga") return { reuso: "paga" };
    if (status === "estornada") return { reuso: "morta", motivo: "estornada" };
    return {
      reuso: "pagavel",
      pagamento: {
        forma: "pix_copia_e_cola",
        brCode: `00020126-fake-debito-${providerChargeId}`,
      },
    };
  }
```

Acrescente `CobrancaParaReuso` ao `import type` do topo do arquivo.

- [ ] **Passo 7: Verificar typecheck e lint**

```powershell
pnpm typecheck
pnpm eslint src/lib/billing/provider db/tests/provedor-fake.ts
```

Esperado: `pnpm typecheck` sem erro. `eslint` sem erro NOVO nesses caminhos.

- [ ] **Passo 8: Formatar e commitar**

```powershell
pnpm prettier --write src/lib/billing/provider/types.ts src/lib/billing/provider/index.ts src/lib/billing/provider/asaas.ts src/lib/billing/provider/asaas.test.ts db/tests/provedor-fake.ts
git add src/lib/billing/provider db/tests/provedor-fake.ts
git commit -m "feat(billing): porta consulta cobranca para reuso (#310)"
```

---

### Tarefa 2: `levantarDebito` devolve os ciclos

Refactor puro, sem mudança de comportamento observável. Existe para que a Tarefa 4 possa classificar ciclo a ciclo.

**Arquivos:**
- Modificar: `src/lib/billing/debito.ts:67-75` (`DebitoLevantado`), `:127-154` (`levantarDebito`), `:196-253` (uso interno)

**Interfaces:**
- Consome: nada da Tarefa 1.
- Produz: `CicloDevido { id, valorCentavos, providerChargeId }` e `DebitoLevantado { totalCentavos, ciclos }`.

- [ ] **Passo 1: Substituir a interface e a função**

Em `src/lib/billing/debito.ts`, troque `DebitoLevantado` (linhas 67-75) por:

```ts
/** Um ciclo `devido`, com o que o gate precisa saber para decidir sobre ele. */
export interface CicloDevido {
  id: string;
  valorCentavos: number;
  /**
   * Cobrança já emitida para este ciclo, se houver.
   *
   * Deixou de ser campo morto na #310: é ele que diz "existe uma cobrança lá
   * fora que talvez ainda seja pagável". Chega povoado por dois caminhos —
   * cobrança de débito de um gate anterior, e cobrança de CICLO de um ciclo
   * `falhou` congelado no corte por carência (`congelarCiclosComoDebito`
   * preserva a coluna, `subscription.ts:525-527`).
   */
  providerChargeId: string | null;
}

export interface DebitoLevantado {
  totalCentavos: number;
  /**
   * Ordenados por `inicio`, depois `id`. A ordem é determinística de propósito:
   * é ela que faz a reentrada do gate eleger sempre a mesma âncora, em vez de
   * eleger outra e emitir uma segunda cobrança da mesma dívida.
   */
  ciclos: CicloDevido[];
}
```

E `levantarDebito` (linhas 127-154) passa a devolver:

```ts
export async function levantarDebito(
  subscriptionId: string,
): Promise<DebitoLevantado> {
  const ciclos = await authDb
    .select({
      id: billingCycle.id,
      valorCentavos: billingCycle.valorCentavos,
      providerChargeId: billingCycle.providerChargeId,
    })
    .from(billingCycle)
    .where(
      and(
        eq(billingCycle.subscriptionId, subscriptionId),
        eq(billingCycle.status, STATUS_DEVIDO),
      ),
    )
    .orderBy(asc(billingCycle.inicio), asc(billingCycle.id));

  return {
    totalCentavos: ciclos.reduce((soma, c) => soma + c.valorCentavos, 0),
    ciclos,
  };
}
```

Ajuste `resolverGateDeDebito` para continuar compilando, sem mudar comportamento: onde havia `debito.ancoraId` use `debito.ciclos[0]?.id ?? null`, e onde havia `debito.outrosIds` use `debito.ciclos.slice(1).map((c) => c.id)`.

- [ ] **Passo 2: Verificar que nada mudou**

```powershell
pnpm typecheck
pnpm vitest run src/lib/billing/debito.test.ts
pnpm vitest run --config vitest.integration.config.ts src/lib/billing/carencia-vencida.int.test.ts
```

Esperado: typecheck limpo; `debito.test.ts` PASS (10 casos); `carencia-vencida.int.test.ts` PASS — é ele que consome `levantarDebito(...).totalCentavos` em cinco lugares. Se a suíte de integração vier "skipped", o Postgres local está fora: suba `docker compose -f infra/docker-compose.yml up -d` e confirme que `MIGRATION_DATABASE_URL` está no `.env` antes de seguir. **Verde com "skipped" não é verde.**

- [ ] **Passo 3: Formatar e commitar**

```powershell
pnpm prettier --write src/lib/billing/debito.ts
git add src/lib/billing/debito.ts
git commit -m "refactor(billing): levantarDebito devolve os ciclos devidos (#310)"
```

---

### Tarefa 3: Contrato novo do gate, sem mudar política

O gate passa a devolver uma LISTA e ganha a variante `bloqueado`; `logic.ts` e a tela acompanham. **A política continua a de hoje** (sempre emite uma cobrança nova, e a lista tem sempre 1 item). Isolar a mudança de FORMA da mudança de POLÍTICA é o que faz o teste #12 da Tarefa 4 ficar vermelho por um motivo só.

**Arquivos:**
- Modificar: `src/lib/billing/debito.ts:77-100` (tipos), `:179-296` (`resolverGateDeDebito`), `:334-350` (`formaDePagamento`)
- Modificar: `src/app/(app)/assinatura/logic.ts:8-11`, `:62-78`, `:184-206`
- Modificar: `src/app/(app)/assinatura/formulario-ativacao.tsx:254-297`
- Modificar: `src/app/(app)/assinatura/formulario-ativacao.test.tsx:861-867`
- Modificar: `src/app/(app)/assinatura/gate-debito.int.test.ts` (asserções de shape)

**Interfaces:**
- Consome: `FormaPagamentoCobranca` (Tarefa 1), `DebitoLevantado.ciclos` (Tarefa 2).
- Produz: `CobrancaDoDebito`, `ResultadoGateDebito` com `cobrancas: CobrancaDoDebito[]` e a variante `bloqueado`; `AtivacaoState.debito = { valorCentavos, cobrancas }`.

- [ ] **Passo 1: Trocar os tipos em `debito.ts`**

Substitua `FormaPagamentoDebito` (linhas 77-80) e `ResultadoGateDebito` (82-100) por:

```ts
/**
 * Reexportado da porta: quem sabe montar a forma de pagamento é o adapter, que
 * tem `invoiceUrl` e copia-e-cola. O nome antigo fica para não mexer no import
 * de `logic.ts`.
 */
export type FormaPagamentoDebito = FormaPagamentoCobranca;

/**
 * UMA cobrança do débito. O débito pode ter mais de uma (#310).
 *
 * ## Por que mais de uma
 *
 * Um ciclo `devido` pode já carregar uma cobrança VIVA e pagável no gateway.
 * Consolidar tudo numa cobrança nova exigiria cancelar a antiga, e o Asaas não
 * documenta quais status o `DELETE /payments/{id}` aceita — emitir por cima da
 * viva É a cobrança dupla que a #310 existe para evitar. Então cada cobrança
 * viva é reapresentada como está, e só o resto vira uma cobrança consolidada.
 */
export interface CobrancaDoDebito {
  /** Ciclo âncora desta cobrança. */
  cicloId: string;
  providerChargeId: string;
  /** Quanto ESTA cobrança cobra — não o total do débito. */
  valorCentavos: number;
  /** `true` = reapresentada do gateway; `false` = emitida agora. */
  reaproveitada: boolean;
  situacao:
    | { estado: "pagavel"; pagamento: FormaPagamentoDebito }
    /**
     * Débito automático a caminho: há instrução `AWAITING_REQUEST`/`SCHEDULED`
     * nesta cobrança. Apresentar o copia-e-cola aqui é pedir pagamento em
     * duplicidade dentro da janela crítica do Pix Automático.
     */
    | { estado: "em_processamento" };
}

export type ResultadoGateDebito =
  /** Nada devido: segue o fluxo de ativação normal. */
  | { tipo: "sem_debito" }
  /**
   * Devido, mas pequeno demais para o gateway emitir — ou recusado por ele.
   * A clínica reativa mesmo assim e os ciclos CONTINUAM `devido`.
   */
  | {
      tipo: "adiado";
      totalCentavos: number;
      motivo: "abaixo_do_piso" | "recusa_do_gateway";
    }
  /**
   * Não deu para decidir com segurança: NADA foi emitido e a reativação NÃO
   * segue. É diferente de `adiado` — ali a clínica volta a usar o Iris, aqui
   * não. Reativação barrada é reversível por nova tentativa; cobrança dupla
   * não é (#310, D-3).
   */
  | {
      tipo: "bloqueado";
      totalCentavos: number;
      motivo: "gateway_indisponivel" | "cobranca_irrecuperavel";
    }
  /** Cobrança(s) na mesa: só depois de pagas a reativação segue. */
  | {
      tipo: "cobranca";
      totalCentavos: number;
      cobrancas: CobrancaDoDebito[];
    };
```

Importe `CobrancaParaReuso` e `FormaPagamentoCobranca` de `./provider` no topo.

- [ ] **Passo 2: Adaptar o retorno de `resolverGateDeDebito` (política inalterada)**

Substitua o bloco final (`debito.ts:258-296`) por:

```ts
  if (cobranca.status === "paga") {
    await conciliarPagamentoDeCiclo(cobranca.providerChargeId, "paga");
    return { tipo: "sem_debito" };
  }

  /**
   * Cobrança estornada não tem saída automática, e agora ela BARRA em vez de
   * lançar (#310, D-7 e P-5).
   *
   * A idempotência do adapter é por `externalReference`, e é ela que impede
   * cobrar duas vezes a mesma dívida. O preço é que uma cobrança ESTORNADA
   * seria devolvida para sempre. Emitir outra automaticamente é pior: o estorno
   * é decisão comercial humana. O que mudou é a FORMA de barrar: um `throw`
   * aqui atravessava as camadas e caía na copy genérica de "fale com o
   * suporte", que também serve para queda de rede. `bloqueado` diz exatamente
   * o que é, com a copy certa, e sem exceção.
   */
  if (cobranca.status === "estornada") {
    console.warn("[billing-debito] cobrança de débito estornada trava o gate", {
      clinicId,
      providerChargeId: cobranca.providerChargeId,
      totalCentavos: debito.totalCentavos,
    });
    return {
      tipo: "bloqueado",
      totalCentavos: debito.totalCentavos,
      motivo: "cobranca_irrecuperavel",
    };
  }

  return {
    tipo: "cobranca",
    totalCentavos: debito.totalCentavos,
    cobrancas: [
      {
        cicloId: ancoraId,
        providerChargeId: cobranca.providerChargeId,
        valorCentavos: debito.totalCentavos,
        reaproveitada: false,
        situacao: { estado: "pagavel", pagamento: formaDePagamento(cobranca) },
      },
    ],
  };
```

`formaDePagamento` continua igual (linhas 334-350), incluindo o `throw` do caso "sem forma nenhuma": ali a cobrança acabou de ser emitida por nós, e não haver forma de pagar é estado impossível que deve gritar.

- [ ] **Passo 3: Adaptar `logic.ts`**

Em `AtivacaoState` (linha 74-77):

```ts
  debito?: {
    /** Total do débito — a soma, mesmo quando há mais de uma cobrança. */
    valorCentavos: number;
    /** Uma entrada por cobrança a pagar. Mais de uma quando parte do débito já
     *  tinha cobrança viva no gateway e foi reapresentada (#310). */
    cobrancas: CobrancaDoDebito[];
  };
```

Trocando o import de `FormaPagamentoDebito` por `CobrancaDoDebito`. E no bloco do gate (linhas 184-206):

```ts
  try {
    const gate = await resolverGateDeDebito(ctx.clinicId);
    if (gate.tipo === "cobranca") {
      return {
        debito: {
          valorCentavos: gate.totalCentavos,
          cobrancas: gate.cobrancas,
        },
      };
    }
    /**
     * `bloqueado` NÃO segue para a ativação, ao contrário de `adiado` (#310,
     * D-3). Duas copies porque as orientações são opostas: gateway fora do ar
     * pede "tente de novo"; cobrança irrecuperável pede suporte. Mandar quem
     * caiu num 500 falar com o suporte é ruído, e mandar quem tem estorno
     * insistir é um beco sem saída.
     */
    if (gate.tipo === "bloqueado") {
      return {
        error:
          gate.motivo === "gateway_indisponivel"
            ? "Não conseguimos confirmar agora as cobranças em aberto da sua conta. Nada foi cobrado, e nenhuma cobrança nova foi criada. Tente novamente em alguns instantes."
            : "A cobrança em aberto da sua conta precisa de revisão manual antes de a assinatura ser reaberta. Fale com o suporte informando o CNPJ da clínica.",
        documento: documentoBruto,
      };
    }
  } catch (e) {
    // …inalterado…
  }
```

- [ ] **Passo 4: Adaptar a tela (ainda um item só)**

Em `formulario-ativacao.tsx`, no bloco `debitoCobrado && !debitoQuitado` (linhas 254-297), troque `debitoCobrado.pagamento` por `debitoCobrado.cobrancas[0]` mantendo a renderização atual. A renderização de N entra na Tarefa 6 — aqui só se preserva o comportamento.

Em `formulario-ativacao.test.tsx:861-867`, o `DEBITO` vira:

```ts
    const DEBITO = {
      valorCentavos: 1300,
      cobrancas: [
        {
          cicloId: "ciclo-1",
          providerChargeId: "pay_290",
          valorCentavos: 1300,
          reaproveitada: false,
          situacao: {
            estado: "pagavel" as const,
            pagamento: {
              forma: "pix_copia_e_cola" as const,
              brCode: "00020126…debito-290",
            },
          },
        },
      ],
    };
```

Em `gate-debito.int.test.ts`, a asserção de shape (linhas 238-242) vira:

```ts
    expect(r.debito?.cobrancas).toEqual([
      {
        cicloId: expect.any(String),
        providerChargeId: ID_COBRANCA_DEBITO,
        valorCentavos: 1300,
        reaproveitada: false,
        situacao: {
          estado: "pagavel",
          pagamento: {
            forma: "pix_copia_e_cola",
            brCode: BR_CODE_DEBITO,
            urlPagamento: "https://sandbox.asaas.com/i/290",
          },
        },
      },
    ]);
```

- [ ] **Passo 5: Verificar que TODA a política antiga continua valendo**

```powershell
pnpm typecheck
pnpm vitest run "src/app/(app)/assinatura/formulario-ativacao.test.tsx" src/lib/billing/debito.test.ts
pnpm vitest run --config vitest.integration.config.ts "src/app/(app)/assinatura/gate-debito.int.test.ts"
```

Esperado: typecheck limpo; todos os casos de componente PASS; os **9 casos** de `gate-debito.int.test.ts` PASS. Nenhum caso deve ter sido removido nesta tarefa — só reescrito no shape novo.

- [ ] **Passo 6: Formatar e commitar**

```powershell
pnpm prettier --write src/lib/billing/debito.ts "src/app/(app)/assinatura/logic.ts" "src/app/(app)/assinatura/formulario-ativacao.tsx" "src/app/(app)/assinatura/formulario-ativacao.test.tsx" "src/app/(app)/assinatura/gate-debito.int.test.ts"
git add src/lib/billing/debito.ts "src/app/(app)/assinatura"
git commit -m "refactor(billing): gate de debito devolve lista de cobrancas (#310)"
```

---

### Tarefa 4: Reaproveitar a cobrança viva (D-1, D-2, D-5)

**Arquivos:**
- Modificar: `src/lib/billing/debito.ts:179-296` (`resolverGateDeDebito`), `:305-332` (`registrarCobrancaDeDebito`)
- Teste: `src/app/(app)/assinatura/gate-debito.int.test.ts`

**Interfaces:**
- Consome: `provider.consultarCobrancaParaReuso` (Tarefa 1), `DebitoLevantado.ciclos` (Tarefa 2), `CobrancaDoDebito`/`ResultadoGateDebito` (Tarefa 3).
- Produz: comportamento de reuso; nenhum tipo novo.

- [ ] **Passo 1: Escrever os testes de integração (falham)**

Em `src/app/(app)/assinatura/gate-debito.int.test.ts`, primeiro estenda o gateway falso para responder consulta de cobrança e listagem de instruções. Substitua `instalarGateway` por:

```ts
function instalarGateway(
  opcoes: {
    cobrancaRecusada?: boolean;
    cobrancaJaPaga?: boolean;
    /** Estado da cobrança ANTIGA em `GET /payments/{id}` (#310). */
    antiga?: {
      status?: string;
      deleted?: boolean;
      httpStatus?: number;
      /** Instruções pendentes por filtro de status. */
      instrucoes?: Record<string, unknown[]>;
    };
  } = {},
): { chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (entrada: unknown, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = (init?.method ?? "GET").toUpperCase();
    chamadas.push({
      url,
      metodo,
      corpo:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {},
    });

    if (url.includes("/pix/automatic/paymentInstructions")) {
      const filtro = new URL(url).searchParams.get("status") ?? "";
      return Response.json({ data: opcoes.antiga?.instrucoes?.[filtro] ?? [] });
    }
    if (url.includes("/pixQrCode")) {
      return Response.json({ payload: BR_CODE_DEBITO });
    }
    // Consulta de UMA cobrança (`/payments/{id}`) — o caminho do reuso (#310).
    // Distinguida da busca por referência (`/payments?…`) pelo separador.
    if (url.includes("/payments/") && metodo === "GET") {
      if (opcoes.antiga?.httpStatus && opcoes.antiga.httpStatus >= 400) {
        return Response.json({ errors: [] }, { status: opcoes.antiga.httpStatus });
      }
      return Response.json({
        id: ID_COBRANCA_ANTIGA,
        status: opcoes.antiga?.status ?? "OVERDUE",
        deleted: opcoes.antiga?.deleted ?? false,
        invoiceUrl: URL_ANTIGA,
      });
    }
    if (url.includes("/payments?") && metodo === "GET") {
      return Response.json({ data: [] });
    }
    if (url.includes("/payments") && metodo === "POST") {
      if (opcoes.cobrancaRecusada) {
        return Response.json(
          { errors: [{ description: "valor abaixo do mínimo permitido" }] },
          { status: 400 },
        );
      }
      return Response.json({
        id: ID_COBRANCA_DEBITO,
        status: opcoes.cobrancaJaPaga ? "RECEIVED" : "PENDING",
        invoiceUrl: "https://sandbox.asaas.com/i/290",
      });
    }
    if (url.includes("/customers")) return Response.json({ id: ID_CLIENTE });
    if (url.includes("/pix/automatic/authorizations")) {
      return Response.json({
        id: ID_AUTORIZACAO_NOVA,
        status: "AWAITING_PAYMENT",
        payload: "00020126…autorizacao-290",
        customerId: ID_CLIENTE,
      });
    }
    throw new Error(`fetch inesperado para ${metodo} ${url}`);
  });
  return { chamadas };
}

/** Cobrança que JÁ existia no gateway antes do gate rodar (#310). */
const ID_COBRANCA_ANTIGA = "pay_000000000310";
const URL_ANTIGA = "https://sandbox.asaas.com/i/310";

/** Conta quantas cobranças NOVAS foram emitidas. O oráculo da #310. */
function emissoes(chamadas: Chamada[]): Chamada[] {
  return chamadas.filter(
    (c) => c.metodo === "POST" && c.url.includes("/payments"),
  );
}
```

E acrescente uma variante de `cicloDevido` que já nasce com cobrança:

```ts
/** Ciclo `devido` que JÁ carrega uma cobrança emitida (o caso da #310). */
async function cicloDevidoComCobranca(
  valorCentavos: number,
  diasAtras: number,
  providerChargeId: string,
): Promise<string> {
  const id = await cicloDevido(valorCentavos, diasAtras);
  await owner`
    UPDATE billing_cycle SET provider_charge_id = ${providerChargeId}
     WHERE id = ${id}`;
  return id;
}
```

Agora os casos:

```ts
  /**
   * Mutação morta: emitir SEMPRE (`debito.ts:226`, o bug de hoje). O oráculo é
   * a CONTAGEM de POSTs, não o retorno — um retorno com a cobrança certa é
   * compatível com uma segunda cobrança tendo sido criada ao lado.
   */
  it("cobrança viva é reapresentada, sem emitir uma segunda", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { status: "OVERDUE" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(0);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
    expect(r.debito?.cobrancas[0]!.reaproveitada).toBe(true);
    expect(r.autorizacao).toBeUndefined();
    expect(await statusAssinatura()).toBe("canceled");
  });

  /**
   * Mutação morta: sobrescrever o `provider_charge_id` da âncora reaproveitada
   * (`debito.ts:313`, D-5). Sem este caso, o teste seguinte não teria como
   * falhar — e é este id que o webhook do pagamento antigo procura.
   */
  it("o id da cobrança reaproveitada NÃO é sobrescrito no ciclo", async () => {
    await assinaturaCancelada();
    const ciclo = await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    instalarGateway({ antiga: { status: "OVERDUE" } });

    await iniciarAtivacaoAssinatura(ctx, formulario());

    const linha = (await lerCiclos()).find((c) => c.id === ciclo)!;
    expect(linha.provider_charge_id).toBe(ID_COBRANCA_ANTIGA);
  });

  /**
   * O NEGATIVO DO DoD, e a razão de a issue existir.
   *
   * Mutação morta: a de cima. Com o id sobrescrito, o webhook do pagamento
   * ANTIGO não acha ciclo (`subscription.ts:1745-1755`), vira
   * `erroAplicacao: "cobrança sem ciclo correspondente"`, e a clínica fica com
   * dinheiro recebido e dívida viva — barrada por uma dívida que já pagou.
   */
  it("pagar a cobrança antiga concilia o ciclo — sem dinheiro recebido com dívida viva", async () => {
    await assinaturaCancelada();
    instalarGateway({ antiga: { status: "OVERDUE" } });
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);

    await iniciarAtivacaoAssinatura(ctx, formulario());
    const conciliou = await conciliarPagamentoDeCiclo(ID_COBRANCA_ANTIGA, "paga");

    expect(conciliou).toBe(true);
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("pago");
  });

  /**
   * Mutação morta: consolidar tudo numa cobrança nova por cima da viva — a
   * cobrança dupla que a #310 existe para evitar. Mata também a variante que
   * agrupa o ciclo de (b) sob a âncora de (a): pagar a cobrança reaproveitada
   * liquidaria o ciclo novo de graça.
   */
  it("débito misto vira duas formas de pagamento: a viva e a consolidada", async () => {
    await assinaturaCancelada();
    const comCobranca = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const semCobranca = await cicloDevido(700, 30);
    const { chamadas } = instalarGateway({ antiga: { status: "OVERDUE" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    // Uma emissão só, e o valor dela é o do conjunto (b) — não o total.
    expect(emissoes(chamadas)).toHaveLength(1);
    expect(emissoes(chamadas)[0]!.corpo.value).toBe(7);

    expect(r.debito?.valorCentavos).toBe(2000);
    expect(r.debito?.cobrancas).toHaveLength(2);
    const reaproveitada = r.debito!.cobrancas.find((c) => c.reaproveitada)!;
    const nova = r.debito!.cobrancas.find((c) => !c.reaproveitada)!;
    expect(reaproveitada.providerChargeId).toBe(ID_COBRANCA_ANTIGA);
    expect(reaproveitada.valorCentavos).toBe(1300);
    expect(nova.providerChargeId).toBe(ID_COBRANCA_DEBITO);
    expect(nova.valorCentavos).toBe(700);

    const ciclos = await lerCiclos();
    const a = ciclos.find((c) => c.id === comCobranca)!;
    const b = ciclos.find((c) => c.id === semCobranca)!;
    expect(a.provider_charge_id).toBe(ID_COBRANCA_ANTIGA);
    expect(b.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    // O ciclo de (b) NÃO pode pendurar na âncora de (a): pagar a reaproveitada
    // liquidaria de graça um ciclo que ela não cobre.
    expect(b.debito_agrupado_em).toBeNull();
    expect(a.debito_agrupado_em).toBeNull();
  });

  /**
   * Mutação morta: deixar o ponteiro `debito_agrupado_em` velho na âncora nova
   * (P-6). A cascata de `liquidarCiclo` liquidaria o ciclo novo quando alguém
   * pagasse a cobrança do ciclo antigo — dívida quitada sem dinheiro.
   */
  it("âncora nova sai limpa do agrupamento antigo, e pagar (a) não liquida (b)", async () => {
    await assinaturaCancelada();
    const antigo = await cicloDevidoComCobranca(1300, 90, ID_COBRANCA_ANTIGA);
    const agrupado = await cicloDevido(700, 60);
    // Estado que um gate anterior deixou: o de 60 dias pendurado no de 90.
    await owner`
      UPDATE billing_cycle SET debito_agrupado_em = ${antigo}
       WHERE id = ${agrupado}`;
    instalarGateway({ antiga: { status: "OVERDUE" } });

    await iniciarAtivacaoAssinatura(ctx, formulario());

    const depois = await lerCiclos();
    const novaAncora = depois.find((c) => c.id === agrupado)!;
    expect(novaAncora.provider_charge_id).toBe(ID_COBRANCA_DEBITO);
    expect(novaAncora.debito_agrupado_em).toBeNull();

    // O oráculo que importa: pagar a REAPROVEITADA liquida só o ciclo dela.
    await conciliarPagamentoDeCiclo(ID_COBRANCA_ANTIGA, "paga");
    const final = await lerCiclos();
    expect(final.find((c) => c.id === antigo)!.status).toBe("pago");
    expect(final.find((c) => c.id === agrupado)!.status).toBe("devido");
  });

  /**
   * Mutação morta: passar a consultar o gateway para todo mundo. Quem nunca
   * teve cobrança não tem o que consultar, e uma consulta a mais por ciclo é
   * latência na porta de entrada da clínica.
   */
  it("ciclo sem cobrança nenhuma segue o fluxo de hoje, sem consulta de reuso", async () => {
    await assinaturaCancelada();
    await cicloDevido(1300, 30);
    const { chamadas } = instalarGateway();

    await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(1);
    expect(
      chamadas.filter((c) => c.metodo === "GET" && /\/payments\/[^?]/.test(c.url)),
    ).toHaveLength(0);
  });
```

- [ ] **Passo 2: Rodar e confirmar que falham**

```powershell
pnpm vitest run --config vitest.integration.config.ts "src/app/(app)/assinatura/gate-debito.int.test.ts"
```

Esperado: os 6 casos novos FAIL. O primeiro falha com `expect(emissoes).toHaveLength(0)` recebendo `1` — é o bug de hoje, medido.

- [ ] **Passo 3: Implementar a classificação e a emissão parcial**

Em `src/lib/billing/debito.ts`, o começo de `resolverGateDeDebito` fica **como está** — leitura da assinatura, `levantarDebito`, curto-circuito de `decidirGate(debito.totalCentavos)` (P-7) e validação de `provider`/`providerCustomerId`. **Remova** o guard `if (!ancoraId) throw …` (linhas 208-214): a âncora deixou de ser única e passa a ser escolhida por conjunto. Substitua todo o miolo daí para baixo por:

```ts
  const provider = getProviderPorId(assinatura.provider);

  /**
   * Divisão do débito em dois conjuntos (#310, D-2).
   *
   * (a) ciclos com cobrança VIVA e pagável no gateway → cada um reapresenta a
   *     SUA cobrança. Consolidá-los numa cobrança nova exigiria cancelar as
   *     antigas, e o Asaas não documenta quais status o `DELETE /payments/{id}`
   *     aceita — emitir por cima da viva É a cobrança dupla que a issue existe
   *     para evitar.
   * (b) todo o resto (sem cobrança, ou com cobrança morta) → UMA cobrança nova
   *     consolidada, exatamente como antes desta issue.
   */
  const reaproveitadas: CobrancaDoDebito[] = [];
  const paraConsolidar: CicloDevido[] = [];

  for (const ciclo of debito.ciclos) {
    if (!ciclo.providerChargeId) {
      paraConsolidar.push(ciclo);
      continue;
    }

    let estado: CobrancaParaReuso;
    try {
      estado = await provider.consultarCobrancaParaReuso(ciclo.providerChargeId);
    } catch (e) {
      /**
       * Fail-closed (D-3). Não dá para saber se a cobrança antiga está viva, e
       * emitir sem saber é cobrar duas vezes. NADA é emitido e a reativação NÃO
       * segue — os ciclos ficam `devido` e a próxima tentativa reabre a decisão.
       * Reativação barrada é reversível; cobrança dupla não é.
       */
      console.warn("[billing-reuso] gateway indisponível na consulta de reuso", {
        clinicId,
        cicloId: ciclo.id,
        providerChargeId: ciclo.providerChargeId,
        err: e instanceof Error ? e.message : String(e),
      });
      return {
        tipo: "bloqueado",
        totalCentavos: debito.totalCentavos,
        motivo: "gateway_indisponivel",
      };
    }

    if (estado.reuso === "paga") {
      // D-4 — dinheiro já recebido, webhook ainda não chegou. Liquida no mesmo
      // caminho do webhook (cascata de agrupados incluída) e sai do débito.
      await conciliarPagamentoDeCiclo(ciclo.providerChargeId, "paga");
      continue;
    }
    if (estado.reuso === "morta") {
      // D-7 — estado terminal é ramo explícito, nunca exceção: um `throw` aqui
      // travaria o gate desta clínica para sempre.
      console.warn("[billing-reuso] cobrança antiga não é reaproveitável", {
        clinicId,
        cicloId: ciclo.id,
        providerChargeId: ciclo.providerChargeId,
        motivo: estado.motivo,
      });
      paraConsolidar.push(ciclo);
      continue;
    }

    reaproveitadas.push({
      cicloId: ciclo.id,
      providerChargeId: ciclo.providerChargeId,
      valorCentavos: ciclo.valorCentavos,
      reaproveitada: true,
      situacao:
        estado.reuso === "pagavel"
          ? { estado: "pagavel", pagamento: estado.pagamento }
          : { estado: "em_processamento" },
    });
  }

  // D-4 — o débito muda quando uma cobrança já paga é liquidada aqui dentro.
  const totalVivo =
    somaDe(reaproveitadas.map((c) => c.valorCentavos)) +
    somaDe(paraConsolidar.map((c) => c.valorCentavos));
  if (totalVivo <= 0) return { tipo: "sem_debito" };

  const totalConsolidar = somaDe(paraConsolidar.map((c) => c.valorCentavos));
  const novas = await emitirConsolidada({
    // O provider vai por PARÂMETRO, já resolvido. Resolver de novo lá dentro
    // reintroduziria a leitura da env que o D26 proíbe: o adapter é resolvido
    // POR LINHA (`subscription.provider`), nunca pelo ambiente.
    provider,
    clinicId,
    clienteId: assinatura.providerCustomerId,
    ciclos: paraConsolidar,
    totalCentavos: totalConsolidar,
  });

  if (novas.tipo === "irrecuperavel") {
    // Sem âncora de referência virgem: toda emissão cairia na cobrança morta
    // por idempotência (P-4/P-5). Se há cobrança viva, ela ainda vale — melhor
    // a clínica pagar o que é pagável do que barrar tudo.
    if (reaproveitadas.length === 0) {
      return {
        tipo: "bloqueado",
        totalCentavos: totalVivo,
        motivo: "cobranca_irrecuperavel",
      };
    }
  }

  const cobrancas = [...reaproveitadas, ...novas.cobrancas];
  if (cobrancas.length === 0) {
    // Nada vivo e nada emitido: o conjunto (b) foi recusado pelo gateway ou
    // ficou abaixo do piso. A dívida NÃO é perdoada — os ciclos continuam
    // `devido` e voltam somados na próxima volta.
    return {
      tipo: "adiado",
      totalCentavos: totalVivo,
      motivo: novas.motivoAdiamento ?? "abaixo_do_piso",
    };
  }

  return { tipo: "cobranca", totalCentavos: totalVivo, cobrancas };
```

E as duas funções auxiliares, ao lado de `registrarCobrancaDeDebito`:

```ts
function somaDe(valores: number[]): number {
  return valores.reduce((soma, v) => soma + v, 0);
}

type ResultadoEmissao = {
  tipo: "ok" | "irrecuperavel";
  cobrancas: CobrancaDoDebito[];
  motivoAdiamento?: "abaixo_do_piso" | "recusa_do_gateway";
};

/**
 * Emite UMA cobrança consolidada para o conjunto (b).
 *
 * ## A âncora é o mais antigo SEM cobrança prévia (#310, P-4)
 *
 * A `referenciaExterna` é `debito:<âncora>`, e é ela que dá idempotência no
 * gateway. Se a âncora fosse um ciclo que já carrega uma cobrança MORTA, o
 * adapter encontraria aquela mesma cobrança pela referência e a devolveria —
 * ressuscitando exatamente o estado que acabamos de classificar como não
 * pagável, e travando o gate para sempre. Uma âncora sem cobrança prévia
 * garante uma referência externa virgem.
 */
async function emitirConsolidada(dados: {
  provider: BillingProvider;
  clinicId: string;
  clienteId: string;
  ciclos: CicloDevido[];
  totalCentavos: number;
}): Promise<ResultadoEmissao> {
  if (dados.ciclos.length === 0) return { tipo: "ok", cobrancas: [] };
  if (decidirGate(dados.totalCentavos) !== "cobrar") {
    // Piso: só governa a EMISSÃO. Cobrança que já existe é apresentada mesmo
    // com total pequeno — ela já foi aceita pelo gateway uma vez.
    return { tipo: "ok", cobrancas: [], motivoAdiamento: "abaixo_do_piso" };
  }

  const ancora = dados.ciclos.find((c) => !c.providerChargeId);
  if (!ancora) {
    console.warn("[billing-reuso] sem âncora de referência virgem no débito", {
      clinicId: dados.clinicId,
      cicloIds: dados.ciclos.map((c) => c.id),
    });
    return { tipo: "irrecuperavel", cobrancas: [] };
  }

  let cobranca: CobrancaEmitida;
  try {
    cobranca = await dados.provider.emitirCobrancaAvulsa({
      clienteId: dados.clienteId,
      valorCentavos: dados.totalCentavos,
      referenciaExterna: `debito:${ancora.id}`,
      descricao:
        "Iris — débito do ciclo interrompido no cancelamento, para reativar a assinatura",
      vencimento: somarDias(new Date(), DIAS_VENCIMENTO_DEBITO),
    });
  } catch (e) {
    if (recusaDefinitivaDoGateway(e)) {
      console.warn("[billing-debito] gateway recusou a cobrança de débito", {
        clinicId: dados.clinicId,
        totalCentavos: dados.totalCentavos,
        status: e instanceof BillingProviderError ? e.status : undefined,
        err: e instanceof Error ? e.message : String(e),
      });
      return { tipo: "ok", cobrancas: [], motivoAdiamento: "recusa_do_gateway" };
    }
    // 5xx, rede e 4xx transitório continuam propagando, como antes da #310:
    // instabilidade do gateway não pode virar reativação grátis.
    throw e;
  }

  const outros = dados.ciclos.filter((c) => c.id !== ancora.id).map((c) => c.id);
  await registrarCobrancaDeDebito(ancora.id, outros, cobranca);

  if (cobranca.status === "paga") {
    await conciliarPagamentoDeCiclo(cobranca.providerChargeId, "paga");
    return { tipo: "ok", cobrancas: [] };
  }
  if (cobranca.status === "estornada") {
    console.warn("[billing-debito] cobrança de débito estornada trava o gate", {
      clinicId: dados.clinicId,
      providerChargeId: cobranca.providerChargeId,
      totalCentavos: dados.totalCentavos,
    });
    return { tipo: "irrecuperavel", cobrancas: [] };
  }

  return {
    tipo: "ok",
    cobrancas: [
      {
        cicloId: ancora.id,
        providerChargeId: cobranca.providerChargeId,
        valorCentavos: dados.totalCentavos,
        reaproveitada: false,
        situacao: { estado: "pagavel", pagamento: formaDePagamento(cobranca) },
      },
    ],
  };
}
```

Acrescente `BillingProvider` ao `import type … from "./provider"` no topo de `debito.ts`.

E em `registrarCobrancaDeDebito` (linha 310-317), acrescente a limpeza do P-6:

```ts
  await authDb
    .update(billingCycle)
    .set({
      providerChargeId: cobranca.providerChargeId,
      cobrancaEmitidaEm: new Date(),
      erro: null,
      // P-6/#310: a âncora pode ter sido, num gate anterior, um ciclo AGRUPADO
      // sob outra âncora cuja cobrança agora morreu. Se o ponteiro velho ficar,
      // a cascata de `liquidarCiclo` liquida este ciclo de graça quando alguém
      // pagar a cobrança daquela outra âncora.
      debitoAgrupadoEm: null,
    })
    .where(eq(billingCycle.id, ancoraId));
```

- [ ] **Passo 4: Rodar e confirmar que passam**

```powershell
pnpm vitest run --config vitest.integration.config.ts "src/app/(app)/assinatura/gate-debito.int.test.ts"
```

Esperado: PASS nos 15 casos (9 antigos + 6 novos). Confira a CONTAGEM de casos executados, não só a cor.

- [ ] **Passo 5: Formatar e commitar**

```powershell
pnpm typecheck
pnpm prettier --write src/lib/billing/debito.ts "src/app/(app)/assinatura/gate-debito.int.test.ts"
git add src/lib/billing/debito.ts "src/app/(app)/assinatura/gate-debito.int.test.ts"
git commit -m "fix(billing): gate reaproveita cobranca viva em vez de emitir outra (#310)"
```

---

### Tarefa 5: Bordas — fail-closed, já paga, instrução pendente

**Arquivos:**
- Teste: `src/app/(app)/assinatura/gate-debito.int.test.ts`
- Modificar (se algum caso falhar): `src/lib/billing/debito.ts`

Os quatro casos abaixo exercitam código que a Tarefa 4 já escreveu. Eles existem porque **um ramo sem teste é um ramo que ninguém verificou** — três deles (D-3, D-4, D-6) são justamente os que só aparecem em produção.

**Interfaces:**
- Consome: tudo das Tarefas 1-4. Não produz interface nova.

- [ ] **Passo 1: Escrever os quatro casos**

```ts
  /**
   * Mutação morta (D-3): degradar a indisponibilidade em "emite nova" (cobrança
   * dupla) ou em "adiado" (reativa sem cobrar). Os três oráculos são
   * independentes de propósito: o retorno pode estar certo com o POST tendo
   * saído ao lado, e o POST pode não ter saído com a assinatura já reaberta.
   */
  it("gateway fora do ar barra a reativação e não emite nada", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { httpStatus: 500 } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito).toBeUndefined();
    expect(r.autorizacao).toBeUndefined();
    expect(r.error).toMatch(/tente novamente em alguns instantes/i);
    expect(emissoes(chamadas)).toHaveLength(0);
    expect(
      chamadas.filter((c) => c.url.includes("/pix/automatic/authorizations")),
    ).toHaveLength(0);
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("devido");
    expect(await statusAssinatura()).toBe("canceled");
  });

  /**
   * Mutação morta (D-3): tratar 404 como indisponibilidade. Um id órfão —
   * cobrança apagada no painel, chave de ambiente trocada — trancaria a clínica
   * fora para sempre por algo que ninguém consegue pagar.
   */
  it("id que o gateway não reconhece vira cobrança nova, sem barrar", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { httpStatus: 404 } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(emissoes(chamadas)).toHaveLength(1);
    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.reaproveitada).toBe(false);
    expect(r.error).toBeUndefined();
  });

  /**
   * Mutação morta (D-4): ignorar o pagamento já recebido e devolver o QR de uma
   * dívida quitada. O webhook pode simplesmente não ter chegado ainda — mandar
   * a clínica esperar é repetir na tela o problema que o polling resolve.
   */
  it("cobrança antiga já paga liquida o ciclo no gate e libera a reativação", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({ antiga: { status: "CONFIRMED" } });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito).toBeUndefined();
    expect(emissoes(chamadas)).toHaveLength(0);
    expect(r.autorizacao?.forma).toBe("pix_copia_e_cola");
    const [ciclo] = await lerCiclos();
    expect(ciclo!.status).toBe("pago");
    expect(await statusAssinatura()).toBe("setup_pending");
  });

  /**
   * Mutação morta (D-6): apresentar o copia-e-cola com débito automático a
   * caminho. Dentro da janela crítica (22h de D-1 até D) o recebimento por
   * outro meio fica bloqueado — quem paga por fora paga duas vezes. A
   * existência da instrução pendente É o fato; não se calcula hora nem fuso.
   */
  it("instrução pendente esconde o código de pagamento, sem reativar", async () => {
    await assinaturaCancelada();
    await cicloDevidoComCobranca(1300, 30, ID_COBRANCA_ANTIGA);
    const { chamadas } = instalarGateway({
      antiga: {
        status: "OVERDUE",
        instrucoes: { SCHEDULED: [{ id: "ins_310", status: "SCHEDULED" }] },
      },
    });

    const r = await iniciarAtivacaoAssinatura(ctx, formulario());

    expect(r.debito?.cobrancas).toHaveLength(1);
    expect(r.debito?.cobrancas[0]!.situacao).toEqual({
      estado: "em_processamento",
    });
    expect(JSON.stringify(r.debito)).not.toContain(BR_CODE_DEBITO);
    expect(emissoes(chamadas)).toHaveLength(0);
    expect(await statusAssinatura()).toBe("canceled");
  });
```

- [ ] **Passo 2: Rodar; corrigir apenas o que estiver vermelho**

```powershell
pnpm vitest run --config vitest.integration.config.ts "src/app/(app)/assinatura/gate-debito.int.test.ts"
```

Esperado: 19 casos, todos PASS. Se algum falhar, o defeito está na implementação da Tarefa 4 — corrija lá, não no teste. **Se o caso da instrução pendente passar sem nenhuma alteração, confirme que ele realmente falha ao remover a chamada a `temInstrucaoPendente`**: um caso que não muda de cor quando o código muda não testa nada (memória `teste-verde-que-nao-testa-nada`).

- [ ] **Passo 3: Formatar e commitar**

```powershell
pnpm prettier --write "src/app/(app)/assinatura/gate-debito.int.test.ts"
git add "src/app/(app)/assinatura/gate-debito.int.test.ts"
git commit -m "test(billing): bordas do reuso — fail-closed, ja paga e instrucao pendente (#310)"
```

---

### Tarefa 6: Tela — N cobranças e o estado "em processamento"

**Arquivos:**
- Modificar: `src/app/(app)/assinatura/formulario-ativacao.tsx:254-297`
- Teste: `src/app/(app)/assinatura/formulario-ativacao.test.tsx:851-968`

**Interfaces:**
- Consome: `AtivacaoState.debito.cobrancas` (Tarefa 3), estados `pagavel`/`em_processamento` (Tarefa 4).
- Não produz interface nova.

- [ ] **Passo 1: Escrever os testes de componente (falham)**

Em `formulario-ativacao.test.tsx`, dentro de `describe("débito de reativação")`, acrescente:

```ts
    const cobranca = (
      id: string,
      valorCentavos: number,
      brCode: string,
    ) => ({
      cicloId: `ciclo-${id}`,
      providerChargeId: id,
      valorCentavos,
      reaproveitada: true,
      situacao: {
        estado: "pagavel" as const,
        pagamento: { forma: "pix_copia_e_cola" as const, brCode },
      },
    });

    /**
     * Mutação morta: renderizar só `cobrancas[0]`. A segunda cobrança ficaria
     * invisível, a clínica pagaria metade e continuaria barrada por uma dívida
     * que não tem como ver.
     */
    it("com duas cobranças, mostra os dois códigos e os dois valores", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            debito: {
              valorCentavos: 2000,
              cobrancas: [
                cobranca("pay_a", 1300, "00020126-codigo-a"),
                cobranca("pay_b", 700, "00020126-codigo-b"),
              ],
            },
          }}
          situacaoConta={situacao(2000)}
        />,
      );

      expect(document.body.textContent).toMatch(/00020126-codigo-a/);
      expect(document.body.textContent).toMatch(/00020126-codigo-b/);
      expect(document.body.textContent).toMatch(/13,00/);
      expect(document.body.textContent).toMatch(/7,00/);
      expect(screen.getAllByRole("button", { name: /copiar código pix/i })).toHaveLength(2);
    });

    /**
     * Mutação morta: cair no ramo de QR com `brCode` `undefined` — um QR vazio
     * e um copia-e-cola em branco, dentro da janela em que pagar por fora
     * significa pagar duas vezes.
     */
    it("cobrança em processamento não mostra QR nem botão de copiar", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            debito: {
              valorCentavos: 1300,
              cobrancas: [
                {
                  cicloId: "ciclo-1",
                  providerChargeId: "pay_x",
                  valorCentavos: 1300,
                  reaproveitada: true,
                  situacao: { estado: "em_processamento" as const },
                },
              ],
            },
          }}
          situacaoConta={situacao(1300)}
        />,
      );

      expect(screen.getByText(/em processamento no seu banco/i)).toBeTruthy();
      expect(document.body.textContent).toMatch(/não pague por outro meio/i);
      expect(screen.queryByRole("button", { name: /copiar código pix/i })).toBeNull();
    });
```

Adapte também o caso existente "faz polling enquanto o débito não é quitado" para usar uma cobrança `em_processamento`, provando que o polling **não** depende de haver código na tela — mutação morta: parar o polling quando não há QR, deixando a clínica olhando "em processamento" para sempre.

- [ ] **Passo 2: Rodar e confirmar que falham**

```powershell
pnpm vitest run "src/app/(app)/assinatura/formulario-ativacao.test.tsx"
```

Esperado: os casos novos FAIL.

- [ ] **Passo 3: Implementar a renderização**

Em `formulario-ativacao.tsx`, substitua o bloco `debitoCobrado && !debitoQuitado` (linhas 254-297) por:

```tsx
      {debitoCobrado && !debitoQuitado ? (
        <Alert severidade="info" titulo="Pague o valor em aberto para reativar">
          {debitoCobrado.cobrancas.length > 1 ? (
            <p>
              Há mais de uma cobrança em aberto e cada uma se paga
              separadamente. Uma delas já tinha sido enviada antes e continua
              válida — pagar as duas quita o total de{" "}
              <strong>{formatarBRL(debitoCobrado.valorCentavos)}</strong>.
            </p>
          ) : (
            <p>
              <strong>
                Esta cobrança é de {formatarBRL(debitoCobrado.valorCentavos)}
              </strong>{" "}
              — o ciclo que ficou aberto quando a assinatura foi cancelada,
              proporcional aos dias usados. Não é mensalidade nem taxa: é o
              período que já foi utilizado.
            </p>
          )}
          <p className="mt-2">
            A assinatura só é reaberta depois deste pagamento. Confirmado o Pix,
            esta tela avisa sozinha e você segue para a autorização.
          </p>

          {debitoCobrado.cobrancas.map((c) => (
            <div
              key={c.providerChargeId}
              className="mt-4 border-t-2 border-[var(--border-brutal)]/30 pt-3 first:border-t-0 first:pt-0"
            >
              {debitoCobrado.cobrancas.length > 1 ? (
                <p className="font-display text-sm font-semibold">
                  Cobrança de {formatarBRL(c.valorCentavos)}
                </p>
              ) : null}

              {c.situacao.estado === "em_processamento" ? (
                // D-6: há instrução de débito a caminho no banco. Dentro da
                // janela crítica do Pix Automático o recebimento por outro meio
                // fica bloqueado — oferecer o copia-e-cola aqui é pedir
                // pagamento em duplicidade.
                <>
                  <p className="font-display mt-1 text-sm font-semibold">
                    Cobrança em processamento no seu banco
                  </p>
                  <p className="mt-1 text-sm">
                    Esta cobrança já foi enviada ao seu banco e está sendo
                    processada. Não pague por outro meio agora — você pode
                    acabar pagando duas vezes. Assim que o banco responder, esta
                    tela avisa sozinha.
                  </p>
                </>
              ) : c.situacao.pagamento.forma === "pix_copia_e_cola" ? (
                <>
                  <div className="mt-3 flex justify-center">
                    <QrCode
                      value={c.situacao.pagamento.brCode}
                      alt={`QR Code do Pix para quitar ${formatarBRL(c.valorCentavos)} em aberto`}
                    />
                  </div>
                  <p className="mt-3 max-w-full overflow-x-auto rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)]/40 bg-[var(--surface-muted)] p-2 font-mono text-xs break-all">
                    {c.situacao.pagamento.brCode}
                  </p>
                  <div className="mt-2">
                    <CopyButton
                      valor={c.situacao.pagamento.brCode}
                      rotulo="Copiar código Pix"
                    />
                  </div>
                </>
              ) : (
                <p className="mt-2">
                  <a
                    href={c.situacao.pagamento.urlPagamento}
                    className="font-semibold text-[var(--text-primary)] underline underline-offset-4"
                  >
                    Abrir a cobrança para pagar
                  </a>
                </p>
              )}
            </div>
          ))}
        </Alert>
      ) : null}
```

- [ ] **Passo 4: Rodar e confirmar que passam**

```powershell
pnpm vitest run "src/app/(app)/assinatura/formulario-ativacao.test.tsx"
```

Esperado: PASS em todos os casos do arquivo.

- [ ] **Passo 5: Verificar no Storybook / navegador (opcional, mas recomendado)**

```powershell
pnpm dev
```

Abra `/assinatura` como coordenador de clínica cancelada com débito. **Não invente estado no banco à mão para isso** — se quiser o cenário de duas cobranças, use o seed local e o gate real. O oráculo desta tarefa continua sendo o teste de componente.

- [ ] **Passo 6: Formatar e commitar**

```powershell
pnpm typecheck
pnpm prettier --write "src/app/(app)/assinatura/formulario-ativacao.tsx" "src/app/(app)/assinatura/formulario-ativacao.test.tsx"
git add "src/app/(app)/assinatura"
git commit -m "feat(assinatura): tela renderiza N cobrancas do debito (#310)"
```

---

### Tarefa 7: Fechamento e verificação final

**Arquivos:**
- Modificar: `src/lib/billing/debito.ts` (cabeçalho do módulo)
- Modificar: `BACKLOG.md`

- [ ] **Passo 1: Atualizar o cabeçalho do módulo**

No comentário de topo de `src/lib/billing/debito.ts` (linhas 12-36), acrescente a seção:

```
 * ## Uma cobrança viva não é cobrada de novo (#310)
 *
 * Antes desta issue o gate emitia SEMPRE uma cobrança nova. Um ciclo `devido`
 * pode chegar aqui já carregando `provider_charge_id` — cobrança de um gate
 * anterior, ou cobrança de CICLO de um `falhou` congelado no corte por carência
 * (`congelarCiclosComoDebito` preserva a coluna). Esgotadas as retentativas do
 * Pix Automático, o Asaas leva o `Payment` a `OVERDUE`, mantém a autorização
 * Ativa e MANTÉM o link com boleto e Pix Copia e Cola. Emitir outra por cima
 * dessa é cobrar duas vezes a mesma dívida.
 *
 * Consolidar as duas numa cobrança só exigiria cancelar a antiga, e o Asaas não
 * documenta quais status o `DELETE /payments/{id}` aceita. Por isso o débito é
 * PARTIDO: cada cobrança viva é reapresentada como está, e só o resto vira uma
 * cobrança nova consolidada — e o gate passa a devolver uma LISTA.
```

- [ ] **Passo 2: Rodar a verificação completa**

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:rls
```

Compare contra a baseline declarada no topo deste plano:
- `pnpm typecheck`: **zero** erro.
- `pnpm lint`: exatamente os **39 erros pré-existentes**, nenhum novo em `src/` ou `db/`.
- `pnpm format:check`: pode acusar arquivos que você não tocou (dívida antiga) — **não formate o repositório para calar isso**. Só os arquivos desta issue precisam estar formatados.
- `pnpm test`: exatamente **1 falha** (`vencimento.test.ts`, timeout de 5000ms). Qualquer outra é regressão sua.
- `pnpm test:rls`: **verde e com contagem**. Anote quantos arquivos rodaram e quantos foram pulados; muitos "skipped" é vermelho disfarçado (memória `suite-rls-rodando-como-superusuario`).

- [ ] **Passo 3: Registrar no BACKLOG e no grafo**

Acrescente ao `BACKLOG.md` a linha da #310 como resolvida, com as duas assunções não medidas ("status do Payment na recusa por teto no agendamento" e "sobrevivência de instrução pendente à revogação da autorização") registradas como verificação pendente em produção.

```powershell
graphify update .
```

- [ ] **Passo 4: Commit final e PR**

```powershell
pnpm prettier --write src/lib/billing/debito.ts BACKLOG.md
git add src/lib/billing/debito.ts BACKLOG.md
git commit -m "docs(billing): registra o reuso de cobranca no gate (#310)"
git push -u origin feat/310-reaproveitar-cobranca-gate
```

Abra o PR em **Draft**, descrição em PT-BR, com: o fato medido do Asaas que torna a issue possível, as sete decisões travadas, as nove decisões deste plano (P-1 a P-9), a tabela de mutação por comportamento e a baseline de vermelho herdado. `Closes #310` (a keyword precisa estar em inglês — "Fecha #310" mergeia e deixa a issue OPEN em silêncio).

---

## Checklist de saída (`AGENTS.md` §5.2 / §7)

- [ ] `pnpm typecheck` — zero erro
- [ ] `pnpm lint` — nenhum erro novo além dos 39 pré-existentes
- [ ] `pnpm prettier --write` **apenas nos arquivos tocados** (nunca `pnpm format` no repo)
- [ ] `pnpm test` — só a falha pré-existente de `vencimento.test.ts`
- [ ] **`pnpm test:rls` — verde, com a contagem conferida (skipped ≠ passou)**
- [ ] Toda cobrança reaproveitada mantém o `provider_charge_id` no ciclo (teste #13)
- [ ] Pagar a cobrança ANTIGA concilia o ciclo (teste #14 — o negativo do DoD)
- [ ] Nenhum caminho novo lança para barrar: `bloqueado` é ramo explícito (D-7)
- [ ] Copy de todos os estados novos em PT-BR e revisada
- [ ] Cada teste do diff traz a linha "qual mutação este teste mata"
- [ ] PR em Draft, em PT-BR, com `Closes #310` em inglês
- [ ] `graphify update .` rodado após o merge
