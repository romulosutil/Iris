# Plano — #322: orquestração de retentativa extradia do Pix Automático

> Passo 9 (último) da ordem de conclusão da linha de billing. Branch `feat/322-orquestracao-retentativa`, nascida de `main` (`a7d6e4e`).
> Escrito em 16/08/2026 depois de ler a #322 inteira, os comentários das #317, #318 e #319, e de mapear os pontos de extensão no código.

## 0. O que a issue diz que não vale mais

Quatro afirmações do corpo da #322 estão superadas por decisões posteriores. Planejar pelo corpo sozinho produz retrabalho:

1. **"7 de retentativa + 7 de carência = 14 dias de escrita livre"** — falso duas vezes. A carência é **10 dias** desde a `0098` (decisão D-3 da #319), e as janelas **se sobrepõem**: `subscription.pastDueDesde` recebe `?? agora` na **primeira** recusa, então a janela de retentativa corre **dentro** da carência. A "pendência registrada na #319" que a #322 cita já foi fechada lá.
2. **"Só retentar recusa de saldo (`PAYMENT_OVERDUE`)"** — mais restritivo que a tabela da #318, que marca `valeGastarRetentativa` também para G0, G1, G4, G6 e G7. A tabela e este plano convergem mesmo assim; o porquê está na D-2.
3. **"Depende de #317 (sem a flag toda chamada volta 400)"** — a flag entrou em 15/08 e já está em `main`, com eco medido no sandbox. Dependência satisfeita.
4. **"Política 'N'"** — a mensagem literal do Asaas é `A autorização desta cobrança não permite retentativas extradia (Política N).`

O FAQ do Asaas (item 5) **nega** a existência da retentativa extradia. É anterior à Jornada 3. Não usar como fonte.

## 1. As nove decisões, fechadas

### D-1 — O gatilho é varredura no job de fechamento, não reação ao webhook

A validação 3 do Asaas ("comando até 23h59 do dia anterior à data desejada") transforma o horário de execução em parte da regra. Uma varredura que só comanda `dueDate ≥ amanhã` satisfaz essa validação **por construção**, a qualquer hora do dia.

Reagir ao webhook de recusa foi descartado por três motivos, nesta ordem:

- O envelope que `normalizarEventoAsaas` assume **não foi medido** e não aparece na doc (achado aberto desde 15/08). Pendurar a recuperação de receita nele é empilhar desenho sobre suposição.
- Entrega de webhook não é garantida. Varredura reavalia o predicado toda passada e **se auto-cura**; reação a evento perde o caso para sempre se o evento não chegar.
- Concorrência: dois webhooks do mesmo ciclo é o modo de falha primário que a própria doc do Asaas nomeia. Uma varredura serializada por passada tem uma janela muito menor.

**Contrapartida assumida e declarada:** até ~1 dia de latência entre a recusa e a 1ª retentativa extradia. Custo real ≈ zero: o dia da recusa já é coberto pela retentativa **intradia**, que o PSP Pagador executa sozinho entre 18h e 21h e que **não consome** nenhuma das 3 tentativas.

### D-2 — Elegibilidade automática: só G2 (`PAYMENT_OVERDUE`), e por um campo novo

A coluna `valeGastarRetentativa` da #318 responde "vale a pena gastar uma tentativa **algum dia**?" — e para G1, G4 e G6 a resposta vem com "**depois** que a clínica agir / depois do conserto". Uma varredura não age nem conserta. Ler esse campo como gatilho automático seria confundir **flag habilitadora com mecanismo**, e queimaria tentativas que o caso de saldo precisa (`ACCOUNT_CLOSED` é o exemplo que a própria #318 dá).

Por isso a política ganha um campo **novo e explícito**, `retentavelAutomaticamente`, `true` **só em G2**. Nunca reusar `valeGastarRetentativa` como gatilho.

G7 (operacional/transitório) fica **de fora** do automático, deliberadamente: o balde inclui `OTHER`, que é desconhecido disfarçado de transitório, e a intradia do PSP já cobre o transitório do mesmo dia. Resíduo registrado.

### D-3 — A `dueDate` é calculada contra as quatro restrições, nunca assumida

Ordem de cálculo, com `hoje` = dia civil de São Paulo:

1. **Candidata mínima** = `hoje + 1 dia` (consequência direta da validação 3).
2. **Nunca repetir data já comandada** (validação 1 exige datas diferentes): se a candidata for igual a `ultima_retentativa_vencimento`, anda +1 dia.
3. **Teto A** = `vencimento_cobranca + 7 dias corridos` (validação 2), via `diasCorridosEntre`.
4. **Teto B** = estritamente **antes** do início do próximo ciclo (validação 4).
5. Candidata > qualquer teto ⇒ **não comandar**, registrar o motivo nomeado no relatório. Fail-closed: não existe "chuta uma data".

**Não empurrar para dia útil bancário.** A medição da #321 mostrou `dueDate` em sábado, domingo e feriado aceita no `POST /payments`, e empurrar consumiria janela — que já é menor que 7 dias por causa da liquidação. A extensão dessa medição do trilho avulso para `/retries` é **dedução, não medição**, e vai escrita no docblock.

### D-4 — Idempotência: reservar no banco antes de chamar, gravar o desfecho depois

- **Guarda 1:** não comandar se `temInstrucaoPendente(providerChargeId)` (`AWAITING_REQUEST | SCHEDULED`). O método já existe.
- **Guarda 2:** reserva por compare-and-set — `UPDATE billing_cycle SET retentativas_comandadas = n + 1, ultima_retentativa_em = agora, ultima_retentativa_vencimento = <data> WHERE id = ? AND retentativas_comandadas = n`. Zero linhas afetadas ⇒ outra passada ganhou ⇒ pular sem chamar o gateway.

A ordem é **reserva → chamada → desfecho**, e isso é o **contrário** da regra da #319 ("gravar o estado por último"). A inversão é deliberada e vale só aqui: lá o efeito era interno e reversível; aqui o efeito é **externo e irreversível**, e a doc do Asaas nomeia a chamada concorrente como modo de falha primário. O custo assumido é que uma falha de rede pode consumir 1 das 3 tentativas sem ter comandado nada.

Esse custo **não** trava o ciclo: a elegibilidade continua sendo `contador < 3 ∧ sem instrução pendente ∧ existe data possível`, então a passada seguinte segue tentando com o orçamento restante. O que se perde é uma tentativa, nunca a auto-cura.

### D-5 — `purpose` e `retryAttempt` entram na conciliação

`EventoWebhookNormalizado` ganha `retentativa: { proposito: "SCHEDULE" | "RETRY_AFTER_DUE_DATE" | null; tentativa: number | null }`, lido de `paymentInstruction`. `conciliarPagamentoDeCiclo` passa a receber esse dado e:

- **Recusa com `proposito === "RETRY_AFTER_DUE_DATE"` sobre ciclo já `falhou`:** não reescreve `erro` nem `recusa_codigo` e **não recarimba** `past_due`. Preserva o diagnóstico da recusa original — é a mesma regra que já protege G6. Sem isso o Iris carimba o mesmo ciclo três vezes.
- **Pagamento com `proposito === "RETRY_AFTER_DUE_DATE"`:** liquida normalmente. É a receita recuperada, e é o caminho que justifica a issue inteira.

`pastDueDesde` já é preservado pelo `?? agora`; o guard novo é explícito e testado mesmo assim, porque hoje nada prova essa preservação sob retentativa.

### D-6 — Esgotar as 3 tentativas não antecipa nem adia o corte

A carência de 10 dias foi dimensionada exatamente como `7 (janela de retentativa) + 3 (folga)`. Esgotar antes não muda o relógio: quem esgotou em D+3 continua com carência até D+10. O que muda é **visibilidade** — o relatório do job passa a dizer quantas foram comandadas e quantas esgotaram, para que o esgotamento apareça antes do corte, e não junto com ele.

### D-7 — Nenhum estado novo, nenhum enum novo. Três colunas.

`billing_cycle` ganha, via `schema.ts` + `pnpm db:generate`:

| Coluna                          | Tipo                   | Papel                                            |
| :------------------------------ | :--------------------- | :----------------------------------------------- |
| `retentativas_comandadas`       | `integer NOT NULL 0`   | orçamento gasto; base do CAS da D-4              |
| `ultima_retentativa_em`         | `timestamptz`          | instante da reserva                              |
| `ultima_retentativa_vencimento` | `date`                 | data já comandada; alimenta o passo 2 da D-3     |

`GRANT` explícito das três colunas no `.sql` gerado, **seguindo o precedente medido da própria tabela** (`0100:29-30` e `0101:42-43`): em `billing_cycle` quem escreve é **`iris_auth`** (`SELECT/INSERT/UPDATE`); `app_role` recebe **só `SELECT`**. A primeira versão desta decisão dizia `UPDATE` para `app_role` — errado, e corrigido depois de medir `information_schema.column_privileges`, não depois de reler o plano.

Hoje os `GRANT`s de coluna são **redundantes**: `billing_cycle` não tem `REVOKE` por tabela, então o privilégio de tabela já cobre. Ficam escritos mesmo assim, como nas `0100`/`0101` — o dia em que a tabela ganhar `REVOKE`, a coluna sem grant vira `permission denied for table billing_cycle` em silêncio.

### D-8 — No relatório do job, etapa própria — nunca somada às existentes

Chaves novas: `retentativaAbortada`, `retentativasAvaliadas`, `retentativasComandadas`, `retentativasTruncado`, `retentativasFalhas[]`, `retentativas[]`. `try/catch` próprio, no padrão de `carenciaAbortada`/`backstopAbortado`. `resumoDoCorpo` do `.mjs` lê as novas com default, senão o job registra `undefined` no log que é a única memória do ato.

**Ordem na rota:** depois de `fecharCiclosVencendo`, **antes** da carência. Comandar antes de cortar é a ordem certa; e a varredura **exclui** assinatura cuja carência vence nesta passada, para não gastar tentativa em quem vai ser cortado em seguida.

### D-9 — Fora de escopo, nomeado

Botão da clínica (é o D36 / UI), retentativa dos grupos G0/G1/G4/G6/G7, medição de `purpose`/`retryAttempt` em payload real (só o ensaio em produção alcança), e qualquer mudança na carência.

## 2. Fases

| Fase | Entrega                                                                                             | Arquivos                                                                        |
| :--- | :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| F1   | 3 colunas + migração gerada + `GRANT` + aplicada e medida no Postgres                               | `src/db/schema.ts`, `db/migrations/0106_*`                                       |
| F2   | `retentavelAutomaticamente` na política (só G2) + oráculo                                           | `classificacao-recusa.ts` (+ `.test.ts`)                                         |
| F3   | `comandarRetentativa` na porta + `AsaasProvider` + dublê                                            | `provider/types.ts`, `provider/asaas.ts`, `db/tests/provedor-fake.ts` (+ testes) |
| F4   | `purpose`/`retryAttempt` normalizados                                                               | `provider/asaas.ts`, `provider/types.ts` (+ testes)                              |
| F5   | Guard de conciliação sob retentativa                                                                | `subscription.ts`, `hooks/asaas/route.ts` (+ testes)                             |
| F6   | Varredura `comandarRetentativasPendentes` + cálculo da `dueDate` + CAS                              | `subscription.ts` (+ `.int.test.ts` novo)                                        |
| F7   | Etapa no relatório da rota + `resumoDoCorpo`                                                        | `fechar-ciclos/route.ts`, `scripts/fechamento-ciclo-billing.mjs` (+ testes)      |
| F8   | Integração ponta a ponta: recusa → 3 retentativas → esgotamento → carência                          | `retentativa-extradia.int.test.ts`                                               |

## 3. Definição de Pronto (da issue, com o que prova cada item)

- [ ] Decisões registradas com o porquê — §1 deste plano, replicado em comentário na issue.
- [ ] Retentativa comandada respeitando as 5 validações, **com teste de cada 400** — F3 (stub de `fetch` devolvendo cada mensagem literal) + F6 (as de data, barradas antes da chamada).
- [ ] `purpose`/`retryAttempt` lidos; retentativa recusada **não** recarimba `past_due` — F4 + F5.
- [ ] Idempotência sob concorrência demonstrada em teste — F6 (duas passadas concorrentes, uma só chamada ao gateway).
- [ ] Fluxo completo em integração — F8.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` verdes; `pnpm test:rls` porque há migração.
