# Débito na reativação — "cliente que cancela vira devedor" (#290)

> Continuação da #287. A **mecânica 1** da #290 (congelar o ciclo interrompido
> como `devido`, pro-rata dos dias usados) já foi entregue no PR #307 — migração
> `0096`, `apurarDebitoProRata`, `congelarCiclosComoDebito`. Esta spec cobre o
> que sobrou: **mecânica 2 (tarja de devedor)** e **mecânica 3 (gate de débito na
> reativação)**, mais a pendência do piso de cobrança.

## Problem Statement

Hoje o ciclo interrompido pelo cancelamento fica congelado em `devido` com o
valor pro-rata gravado — e **ninguém nunca cobra**. A clínica não vê que deve, e
a reativação (`iniciarAtivacao`) abre uma autorização nova de R$ 0,01 sem olhar
para o débito. Duas consequências:

1. **Receita apurada e nunca faturada.** O `devido` é um estado terminal sem
   consumidor: nenhum job varre, nenhuma tela mostra.
2. **O loop cancela-usa-cancela continua aberto.** Cancelar antes do fechamento
   do ciclo é uso gratuito enquanto ninguém cobrar na porta de entrada.

## Goals

- [ ] Conta cancelada com débito exibe o **valor devido** na tarja e na tela de
      assinatura — sem perder leitura nem exportação.
- [ ] Reativação com débito **cobra antes** de criar a autorização de R$ 0,01;
      autorização só nasce depois do pagamento confirmado pelo webhook.
- [ ] Reativação **sem** débito permanece byte-a-byte o fluxo de hoje.
- [ ] Débito abaixo do piso de cobrança do gateway não trava a clínica **e não
      caduca**: acumula até cruzar o piso.

## Out of Scope

| Item                                                    | Motivo                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-mail de aviso no cancelamento                         | Pendência da #290, fora da Definição de Pronto dela. Depende do trilho de e-mail (`resend`) e de copy própria. → **#312**                                       |
| Débito de ciclos `falhou` (cobrança emitida e recusada) | **Gap real, documentado em `RISCO-2`.** Envolve reaproveitar a cobrança já existente no gateway em vez de emitir outra — risco de cobrança em dobro. → **#310** |
| Medir o piso real de cobrança Pix do Asaas              | `PISO_COBRANCA_CENTAVOS` é escolha conservadora, não medição; o erro é seguro nas duas direções (ver abaixo). → **#311**                                        |
| Parcelamento / negociação do débito                     | Não pedido. O modelo é binário: paga e volta.                                                                                                                   |
| Expiração / prescrição do débito                        | Decisão explícita da #290: "débito não caduca".                                                                                                                 |
| Cobrar débito de quem nunca ativou (trial)              | Não existe `billing_cycle` antes de `active`. Débito zero, gate transparente.                                                                                   |

---

## User Stories

### P1: Ver quanto devo ⭐ MVP

**User Story**: Como coordenador de uma clínica cancelada, quero ver quanto devo
e por quê, para decidir se volto.

**Why P1**: Sem isso a cobrança na reativação é uma surpresa na cara do cliente.

**Acceptance Criteria**:

1. WHEN a conta está `cancelada` e existe ao menos um `billing_cycle` em
   `devido` THEN a tarja SHALL informar o valor total devido, formatado em BRL.
2. WHEN a conta está `cancelada` e o total devido é zero (cancelou no trial, ou
   ciclo apurou 0 ficha) THEN a tarja SHALL manter a copy atual, sem mencionar
   débito.
3. WHEN a conta está `cancelada` com débito THEN leitura e exportação SHALL
   continuar liberadas (`podeEscrever = false` apenas).
4. WHEN o débito é quitado e a assinatura reativa THEN a tarja SHALL sumir na
   navegação seguinte (revalidação de layout, padrão do #285).

**Independent Test**: assinatura `canceled` + ciclo `devido` de 1300 centavos →
`derivarSituacao` devolve `debitoCentavos: 1300`; a tarja renderiza "R$ 13,00".

---

### P1: Pagar o débito antes de reativar ⭐ MVP

**User Story**: Como coordenador, quero pagar o que devo e só então autorizar o
Pix Automático de novo.

**Why P1**: É o mecanismo que fecha o loop cancela-usa-cancela. Sem ele a #290
não existe.

**Acceptance Criteria**:

1. WHEN a clínica clica em "Ativar assinatura" e o total devido é **zero** THEN
   o sistema SHALL executar `iniciarAtivacao` exatamente como hoje.
2. WHEN o total devido é **≥ o piso de cobrança** THEN o sistema SHALL emitir
   uma **cobrança Pix avulsa** do valor devido e SHALL NÃO chamar
   `iniciarAtivacao`.
3. WHEN a cobrança de débito é emitida THEN a tela SHALL mostrar o valor e o
   copia-e-cola antes de qualquer pagamento.
4. WHEN o webhook confirma o pagamento da cobrança de débito THEN todos os
   ciclos cobertos por ela SHALL virar `pago` e a assinatura SHALL permanecer
   `canceled` (pagar débito não reativa — só destrava o botão).
5. WHEN a clínica clica em "Ativar" de novo, já sem débito THEN o fluxo SHALL
   seguir para a autorização de R$ 0,01.
6. WHEN existe cobrança de débito **já emitida e ainda não paga** THEN uma nova
   tentativa SHALL devolver a MESMA cobrança, sem emitir uma segunda no gateway.

**Independent Test**: integração — `canceled` + ciclo `devido` 1300 → ação de
ativação devolve cobrança de débito e **nenhuma** `subscription.status =
setup_pending`; webhook de pagamento → ciclo `pago`; segunda ação → autorização
normal.

---

### P2: Débito abaixo do piso acumula

**User Story**: Como Iris, quero que um débito pequeno demais para o gateway não
trave a clínica nem evapore.

**Why P2**: Sem isso, ou a reativação entra em deadlock (cobrança que o gateway
recusa), ou o loop ganha dias grátis.

**Acceptance Criteria**:

1. WHEN o total devido é maior que zero e **menor que o piso** THEN a reativação
   SHALL prosseguir normalmente (`iniciarAtivacao`), sem emitir cobrança.
2. WHEN a reativação passa com débito abaixo do piso THEN os ciclos `devido`
   SHALL permanecer `devido` (o débito não é perdoado nem zerado).
3. WHEN um cancelamento posterior soma novo débito e o total cruza o piso THEN a
   reativação seguinte SHALL cobrar o **total acumulado**, incluindo os ciclos
   antigos.

**Independent Test**: dois ciclos `devido` de 260 centavos → 1ª reativação passa
livre; 3º ciclo `devido` → total 780 ≥ 500 → cobrança de 780 emitida.

---

## Edge Cases

- WHEN existem N ciclos `devido` THEN a cobrança SHALL ser **uma só**, do total,
  ancorada no ciclo mais antigo; os demais apontam para a âncora via
  `debito_agrupado_em`.
- WHEN a assinatura cancelada não tem `provider_customer_id` gravado THEN o gate
  SHALL falhar com mensagem acionável — nunca deixar passar sem cobrar (falhar
  fechado; o débito é receita).
- WHEN a autorização Pix Automático foi revogada THEN a cobrança de débito SHALL
  NÃO usar `pixAutomaticAuthorizationId` (o trilho está morto) — é Pix comum
  contra `customer`.
- WHEN o webhook do pagamento de débito é reentregue THEN a conciliação SHALL ser
  idempotente (ciclo já `pago` não é reescrito).
- WHEN quem abre a tela não é coordenador THEN o gate SHALL nem chegar a ser
  avaliado (`requireRole` primeiro, como hoje).
- WHEN a clínica está `cancelada` sem ciclo nenhum (cancelou no trial) THEN
  débito é zero e nada muda.

---

## Regra de preço — piso de cobrança

`PISO_COBRANCA_CENTAVOS = 500` (R$ 5,00).

**Este número é uma escolha CONSERVADORA, não uma medição.** O valor mínimo de
uma cobrança Pix no Asaas não foi verificado contra a API nem contra a
documentação nesta sessão (Knowledge Verification Chain, passo 5: sinalizado como
incerto). A direção do erro é segura por construção: se o piso real for MENOR que
R$ 5,00, o único efeito é que débitos entre o piso real e R$ 5,00 esperam mais um
cancelamento para serem cobrados — nunca uma cobrança rejeitada pelo gateway.
Se for MAIOR, a primeira emissão real falha alto e o valor sobe numa linha.

Verificação pendente: emitir uma cobrança de R$ 1,00 no sandbox e observar a
resposta. Anotar no runbook de `infra/README.md`. Rastreado em **#311**.

---

## Requirement Traceability

| ID     | Story                             | Onde é medido                                                                         | Status   |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| DEB-01 | P1: Ver quanto devo               | `estado-conta.test.ts`, `faixa-trial.test.tsx`, `formulario-ativacao.test.tsx`        | Verified |
| DEB-02 | P1: Ver quanto devo (zero)        | `estado-conta.test.ts`, `faixa-trial.test.tsx`                                        | Verified |
| DEB-03 | P1: Pagar antes de reativar       | `gate-debito.int.test.ts` (cobra e não cria autorização; quita sem reativar)          | Verified |
| DEB-04 | P1: Reativação sem débito         | `gate-debito.int.test.ts` (não-regressão; zero round-trip de cobrança)                | Verified |
| DEB-05 | P1: Idempotência da cobrança      | `asaas.test.ts` (`buscarCobrancaPorReferencia`), `gate-debito.int.test.ts`            | Verified |
| DEB-06 | P2: Acumular abaixo do piso       | `debito.test.ts` (fronteira do piso), `gate-debito.int.test.ts` (segue `devido`)      | Verified |
| DEB-07 | Edge: agrupamento de N ciclos     | `gate-debito.int.test.ts` (uma cobrança, âncora + `debito_agrupado_em`)               | Verified |
| DEB-08 | Edge: falhar fechado sem customer | `debito.ts` — lança `BillingProviderError`; sem caso automatizado (estado impossível) | Parcial  |

**Cobertura:** 8 requisitos, 7 com teste medindo estado real; `DEB-08` fica só
com a guarda no código — o estado que ela defende (assinatura que já esteve
`active` sem `provider_customer_id`) não é construível pelo caminho normal, e
forjá-lo no teste mediria o fixture, não a regra.

**Mutação:** 6 mutantes aplicados e mortos — fronteira do piso (`<` → `<=`),
cascata de liquidação removida, guarda de degradação sempre falsa, exceção da
tarja em conta `ativa` removida, polling do débito sem a condição de quitação, e
`cancelada_em` não zerada na reativação.

**Defeito encontrado ao escrever o teste do loop:** `aplicarStatusProvider` não
limpava `subscription.cancelada_em` ao reativar. A segunda volta do loop era
apurada contra o corte da PRIMEIRA — `encerradoEm` caía antes do início do ciclo
novo, `apurarDebitoProRata` saturava no piso de 1 dia, e 10 dias usados saíam por
R$ 1,30 em vez de R$ 13,00. O dia grátis que esta issue fecha na ida estava
reaberto na volta. Corrigido junto, e o mutante que reverte a correção derruba o
teste do loop (130 ≠ 1300).

---

## Success Criteria

- [ ] Loop demonstrado em teste: cancelar no dia 10 → reativar (paga) → cancelar
      no dia 10 de novo → dois débitos, nenhum dia gratuito.
- [ ] Nenhuma cobrança em dobro: reemissão devolve a cobrança existente.
- [ ] Nenhum caminho novo em que a clínica perde leitura/exportação.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` verdes.
