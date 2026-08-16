# Carência que nunca corre (#319) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a carência de fato **correr**. Hoje `past_due` é estado terminal: nada no repo lê `subscription.past_due_desde` para transicionar a assinatura para `canceled`, então a máquina de dívida da #290 (`congelarCiclosComoDebito` → ciclo `devido` → gate de reativação) é **inalcançável por inadimplência** — só por cancelamento deliberado. Esta entrega escreve a varredura que fecha o circuito.

**Architecture:** Uma função nova em `src/lib/billing/subscription.ts`, encaixada como terceira chamada da rota interna de fechamento, mais uma migração de default + backfill em `subscription.carencia_dias` e o índice que sustenta a varredura. Não toca RLS nem o schema do agente de extração.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres, Vitest.

**Spec:** issue [#319](https://github.com/romulosutil/Iris/issues/319). Ordem dos passos: artifact "Ordem de conclusão" (passo 3 de 9, depois do #317). Decisões fechadas com o Rômulo em 15/08/2026.

---

## Global Constraints

- Documentação, comentários e copy em **pt-BR**. Commits em **inglês**.
- Formatar **só os arquivos tocados** (`pnpm prettier --write <arquivo>`) — nunca `pnpm format`.
- Migração à mão exige entrada manual no `_journal.json` com `when` = anterior **+ 1000**; migração gerada por schema commita `.sql` + `meta/NNNN_snapshot.json` juntos. A próxima tag livre é `0098`.
- Toda transição de estado passa pelo gateway **antes** do banco (ver D-2). Nada de meio-aplicado.
- Verde exigido ao final: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

---

## Fato medido que corrige a premissa da issue

O corpo da #319 afirma que a clínica ganha "7 dias de retentativa + 7 de carência = **14 dias** de escrita livre". **É falso**, e a diferença muda o dimensionamento.

`subscription.ts:882-885` carimba:

```ts
          // Só na ENTRADA: recarimbar a cada reentrega zeraria a carência para
          // sempre e a assinatura nunca venceria.
          pastDueDesde: assinatura.pastDueDesde ?? agora,
```

O `??` preserva o **primeiro** carimbo. A assinatura vira `past_due` já na **primeira** recusa, e as retentativas `ALLOW_THREE_IN_SEVEN_DAYS` do #317 correm **dentro** da carência, não antes dela. As duas janelas **se sobrepõem, não somam**: o total é o `carencia_dias`, não `7 + carencia_dias`. É exatamente por isso que a D-3 abaixo mexe no número.

---

## Decisões de produto tomadas nesta sessão (arquiteto)

| #                                                                                    | Decisão                                                                                                                                                                                                                                                                                                                      | Por quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-1** — Onde roda a varredura                                                      | Na rota interna `src/app/api/internal/billing/fechar-ciclos/route.ts`, como **3ª chamada**, depois de `reprocessarEventosPendentes()` e `fecharCiclosVencendo()`. O `.mjs` do job segue gatilho magro (HTTP + token, nada mais)                                                                                              | Coerente com a arquitetura já registrada no docblock da própria rota: a lógica de billing mora no app porque **a imagem Docker do job não herda as deps do app**. A ordem importa: fechar ciclos primeiro produz as recusas do dia; varrer depois evita cortar alguém no mesmo tick em que a cobrança ainda ia ser tentada.                                                                                                                                                                                                                                                                                                                                                        |
| **D-2** — `cancelarVinculo` no gateway: chamar, **fail-closed**, mas **idempotente** | `DELETE /pix/automatic/authorizations/{id}` (`asaas.ts`) é chamado **antes** de gravar `canceled`. Se falhar, a assinatura **não** transiciona: fica em `past_due` e a varredura tenta de novo amanhã. **Exceção medida na revisão:** "a autorização não existe mais" (404) é o objetivo **já atingido** e o corte prossegue | Nunca fica meio-aplicado. **Custo aceito:** a autorização morre e a reativação exige novo QR + novo consentimento — mas `iniciarAtivacao` só reaproveita vínculo em `setup_pending`, então a reativação já criaria vínculo novo de qualquer jeito. **Recusado o "best-effort":** deixaria autorização ativa no Asaas com assinatura morta no Iris — divergência silenciosa entre os dois lados, a classe de bug mais cara deste domínio. **E recusado o fail-closed cego:** tratar 404 como falha faria toda passada diária repetir o erro e a assinatura **nunca** ser cortada — com `past_due` liberando escrita, o loop preso é o próprio defeito que a #319 existe para matar. |
| **D-3** — Carência passa de **7 para 10 dias**                                       | Novo default da coluna `carencia_dias` (`schema.ts:1810`) + **backfill** das linhas existentes                                                                                                                                                                                                                               | 7 da janela de retentativa do #317 + 3 de folga, para a **última** das 3 tentativas do Asaas liquidar antes do corte. Sem isso, a carência acaba junto com (ou antes de) a última tentativa — ver o fato medido acima. O backfill é seguro porque **nenhuma tela nunca permitiu customizar esse valor**: toda linha em 7 é default herdado, não escolha de ninguém. O CHECK `subscription_carencia_nao_negativa` (`0071:83`) continua.                                                                                                                                                                                                                                             |
| **D-4** — Ciclo `falhou` vira `devido` na transição                                  | `congelarCiclosComoDebito` (`subscription.ts:422-467`) passa a incluir `falhou` além de `aberto`/`apurado`                                                                                                                                                                                                                   | É o que **fecha o buraco**: hoje o filtro é `inArray(billingCycle.status, ["aberto","apurado"])`, então o ciclo que efetivamente **não foi pago** fica fora da dívida — a clínica é cortada devendo, e o débito não registra justamente o mês que ela não pagou.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **D-5** — Aviso ao cliente fica **fora** desta entrega                               | Vai para a **#312**                                                                                                                                                                                                                                                                                                          | A ordem de conclusão já prevê escrever a #312 **depois** do #319, justamente para cobrir os **dois** gatilhos de corte — revogação deliberada no app do banco × carência vencida por inadimplência — com copy diferente, de uma vez, em vez de reabrir a mesma tela duas vezes.                                                                                                                                                                                                                                                                                                                                                                                                    |

**Efeito colateral da D-4, assumido e registrado:** ao congelar o ciclo `falhou` como `devido`, a **cobrança antiga segue `OVERDUE` e pagável no Asaas**. Existe portanto uma janela de **cobrança dupla** (a antiga ainda liquidável + a do gate de reativação) até a **#310** — reaproveitar a cobrança existente no gate — entrar. Isso **não é motivo para adiar**: sem a D-4 a issue não fecha e o gate da #290 segue inalcançável. O comentário no código deve nomear a #310 como o fechamento dessa ponta.

---

## ⚠️ Armadilha nova encontrada no desenho — `pastDueDesde` PRECISA ser zerado

Na transição para `canceled`, `pastDueDesde` tem que voltar a `NULL`.

Se o carimbo ficar, o defeito é este, e é silencioso:

1. Assinatura reativada depois do corte;
2. numa recusa futura, `conciliarPagamentoDeCiclo` roda o `pastDueDesde: assinatura.pastDueDesde ?? agora`;
3. o `??` preserva o carimbo **velho**, de meses atrás;
4. a carência **já nasce vencida**, e o corte é **imediato na primeira recusa** — sem nenhum dia de tolerância.

É a mesma classe de defeito do carimbo `cancelada_em` não limpo na reativação, que fez o segundo pro-rata saturar no piso de 1 dia (R$ 1,30 em vez de R$ 13,00). Um teste de ida só passa. **Só um teste de ida-volta-ida** — `past_due` → `canceled` → reativação → `past_due` de novo, **medindo a data de corte resultante** — enxerga isso.

---

## Escopo

**Entra:**

- Migração `0098`: novo default de `carencia_dias` (7 → 10), backfill das linhas existentes, índice de suporte à varredura.
- `cancelarAssinaturasComCarenciaVencida` em `src/lib/billing/subscription.ts`.
- Encaixe na rota interna, com o resultado somado ao corpo JSON da resposta.
- `congelarCiclosComoDebito` passa a incluir ciclos `falhou`.
- Zerar `pastDueDesde` na transição (armadilha acima).
- Correção dos **três comentários que afirmam a implementação inexistente**:
  - `subscription.ts:63-65` — "a assinatura a `past_due`, onde a carência começa a correr" (a carência não corria);
  - `subscription.ts:707-708` — "a carência leva a `canceled` a partir daí" (não levava);
  - `estado-conta.ts:119` — "a carência é aplicada pelo job de cobrança, que é quem transiciona para `canceled`" (o job não fazia isso).
- Testes: unitários da regra de corte + integração da varredura + o ida-volta-ida.

**Fica de fora, declarado:**

- E-mail/aviso ao cliente antes e depois do corte → **#312**.
- Reaproveitamento da cobrança antiga no gate de reativação → **#310**.
- Classificação de recusas (permanente × transitória) → **#318**.

---

## File Structure

| Arquivo                                                | Responsabilidade                    | Ação                                                                                                                                                          |
| :----------------------------------------------------- | :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/db/schema.ts`                                     | Schema Drizzle                      | Modificar — `carenciaDias` default `7` → `10` (linha 1810)                                                                                                    |
| `db/migrations/0098_*.sql` + `meta/0098_snapshot.json` | DDL                                 | Criar — `ALTER COLUMN SET DEFAULT`, backfill das linhas em 7, índice para a varredura                                                                         |
| `src/lib/billing/subscription.ts`                      | Motor de assinatura e ciclo         | Modificar — nova `cancelarAssinaturasComCarenciaVencida`; `congelarCiclosComoDebito` aceita `falhou`; zerar `pastDueDesde`; comentários `:63-65` e `:707-708` |
| `src/lib/billing/estado-conta.ts`                      | Gate de escrita por estado da conta | Modificar — comentário `:119`                                                                                                                                 |
| `src/app/api/internal/billing/fechar-ciclos/route.ts`  | Gatilho interno do fechamento       | Modificar — 3ª chamada + campo novo no JSON de resposta                                                                                                       |
| `src/lib/billing/subscription.test.ts`                 | Unitários do motor                  | Modificar — regra de corte, ida-volta-ida                                                                                                                     |
| Integração da varredura (`*.int.test.ts` do billing)   | Fim-a-fim contra Postgres           | Modificar/Criar — fail-closed do gateway, ciclo `falhou` → `devido`                                                                                           |

---

### Task 1: Migração — carência de 10 dias e índice da varredura

- [ ] **Step 1: `schema.ts`** — `carenciaDias` passa a `.default(10)`, com o comentário existente ("Falha de Pix Automático/cartão costuma ser do banco do cliente; derrubar acesso a prontuário por isso é dano desproporcional") **acrescido** da justificativa dos 10: 7 da janela de retentativa do #317 + 3 de folga para a última tentativa liquidar. Registrar ali a correção da premissa: as janelas **se sobrepõem**, não somam.

- [ ] **Step 2: Gerar a migração** — `pnpm db:generate`. Editar o `.sql` gerado para acrescentar, à mão, o **backfill** e o **índice**, sem tocar no snapshot:
  - backfill: subir para 10 as linhas que estão em 7 (todas — o valor nunca foi customizável por tela);
  - índice parcial para a varredura, sobre `past_due_desde` filtrado por `status = 'past_due'`.
- [ ] **Step 3: Conferir o `_journal.json`** — entrada `0098` presente, `when` estritamente crescente, `idx` em sequência, tag no padrão `NNNN_nome`. `src/db/migrations.test.ts` falha o CI se algo disso escorregar.
- [ ] **Step 4: Verde** — `pnpm vitest run src/db/migrations.test.ts && pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(billing): widen subscription grace period to ten days (#319)`

---

### Task 2: A varredura — `cancelarAssinaturasComCarenciaVencida`

**Interfaces:**

- Produces: `cancelarAssinaturasComCarenciaVencida(opcoes?: { dryRun?: boolean }): Promise<ResultadoCorte[]>`, no mesmo idioma de `fecharCiclosVencendo` — falha de **uma** clínica não derruba a varredura, vai no resultado com `erro` preenchido.
- Consumes: `subscription.status`, `subscription.pastDueDesde`, `subscription.carenciaDias`, o provider (`cancelarVinculo`, `types.ts:297`) e `congelarCiclosComoDebito`.

- [ ] **Step 1: Testes primeiro (vermelho)** — no mínimo:
  - assinatura `past_due` com carência **não** vencida: não transiciona;
  - carência vencida: `cancelarVinculo` é chamado **antes** da escrita, e só então grava `canceled`;
  - `cancelarVinculo` estoura: **nada** é gravado, a assinatura continua `past_due` (fail-closed, D-2);
  - `dryRun`: nenhuma escrita, nenhuma chamada ao gateway;
  - **ida-volta-ida**: `past_due` → `canceled` → reativação → `past_due` de novo, asserindo a **data de corte** da segunda vez (é o teste da armadilha; sem ele o `??` velho passa).
- [x] **Step 2: Implementar** — ordem obrigatória por transição: (1) `cancelarVinculo` no gateway (tolerando 404, D-2); (2) `congelarCiclosComoDebito`; (3) `UPDATE` da assinatura para `canceled`, **zerando `pastDueDesde`** e carimbando `canceladaEm` com o **mesmo `agora`** que foi para o `encerradoEm` do congelamento. (2) e (3) rodam na **mesma transação**. Qualquer falha em (1) aborta a transição inteira daquela clínica e deixa para o dia seguinte; qualquer falha em (2)/(3) deixa a linha em `past_due` e a passada seguinte se cura.

  > **Correção da revisão adversarial (15/08/2026):** a versão implementada antes desta revisão fazia (1) → (3) → (2), com o congelamento **por último**. Era irrecuperável: falha em (2) depois do `canceled` commitado deixava a linha fora do predicado da varredura (`status = 'past_due'`), **nada mais congelava**, `levantarDebito` ficava 0, o gate da #290 abria e a clínica cortada reativava de graça. O congelamento por primeiro, dentro da transação, é o que torna a falha auto-curável — e é o ponto inteiro do desenho.

- [ ] **Step 3: `congelarCiclosComoDebito` aceita `falhou`** — o `inArray(billingCycle.status, [...])` (`:436`) ganha `"falhou"`. O docblock acima dele (`:420-424`) diz hoje que `falhou` "fica de fora: ali já existe cobrança emitida no gateway" — esse parágrafo tem que ser **reescrito**, não apenas ampliado, e precisa nomear a janela de cobrança dupla e a **#310** como quem a fecha.
- [ ] **Step 4: Verde** — `pnpm vitest run src/lib/billing/subscription.test.ts`.
- [ ] **Step 5: Commit** — `feat(billing): cancel subscriptions whose grace period expired (#319)`

---

### Task 3: Encaixe na rota interna e correção dos comentários mentirosos

- [ ] **Step 1: Rota** — importar a função nova e chamá-la **depois** de `fecharCiclosVencendo`, passando o mesmo `dryRun`. O resultado entra no `Response.json` já existente (contagem de assinaturas cortadas + as falhas por clínica, no mesmo formato do array `falhas` de hoje). Comentário curto explicando **por que a ordem é essa** (D-1): fechar ciclos primeiro produz as recusas do dia; varrer depois evita cortar quem ainda ia ser cobrado neste tick.
- [ ] **Step 2: Os três comentários** — `subscription.ts:63-65`, `subscription.ts:707-708` e `estado-conta.ts:119` descrevem hoje um comportamento que **não existia**. Passam a descrever o que passa a existir, e o de `estado-conta.ts` mantém a invariante de produto intacta: **`past_due` continua podendo escrever** — o que muda é que agora `past_due` tem fim.
- [ ] **Step 3: Suíte inteira** — `pnpm test && pnpm typecheck && pnpm lint`.
- [ ] **Step 4: Commit** — `feat(billing): run grace-period sweep in the cycle-closing job (#319)`

---

## Revisão adversarial (15/08/2026) — o que mudou depois do plano original

Seis achados. Os quatro primeiros mudaram o desenho; os dois últimos, o alcance e a leitura do resultado.

| Achado                                                            | Correção                                                                                                                                                                                                                                                                                                |
| :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ordem de escrita invertida** (grave)                            | Congelar **antes** do `UPDATE`, os dois na mesma transação. Ver Task 2 Step 2.                                                                                                                                                                                                                          |
| **`cancelarVinculo` não era fail-closed, era loop preso** (grave) | 404 = objetivo atingido, corte prossegue (`revogarVinculoIdempotente` em `subscription.ts` + tolerância no `AsaasProvider.cancelarVinculo`, que ainda reconsulta o `GET` quando o gateway responde 400 ambíguo). Rede, timeout e 5xx continuam barrando o corte.                                        |
| **Corte reversível por não pagar** (grave, **pré-existente**)     | O ramo `recusada` de `conciliarPagamentoDeCiclo` gravava `past_due` sem guard de status: a clínica já cortada que não pagasse o débito da #290 voltava a `past_due` — recuperando escrita e ganhando 10 dias novos. Ganhou `inArray(status, ['active','past_due'])`, espelhando o guard do ramo `paga`. |
| **`cortada: false` mentiroso**                                    | `ResultadoCortePorCarencia.etapaFalha` (`gateway` × `congelamento` × `escrita`) e a etapa prefixada dentro de `erro` — é `erro`, e só ele, que a rota publica em `carenciaFalhas`.                                                                                                                      |
| **Varredura sem teto**                                            | `ORDER BY past_due_desde ASC` + `TETO_CORTES_POR_PASSADA = 20` (constante exportada e comentada). O excedente sai na passada seguinte e a passada truncada marca `truncado` em todos os itens, além de um `console.warn("[billing-corte-truncado]")`.                                                   |
| **Comentário falso do piso**                                      | O discriminador do piso de valor é a **existência de `provider_charge_id`**, não o status do ciclo: `apurado` COM cobrança emitida é alcançável (`fecharCiclosVencendo` tem um ramo vazio de idempotência da emissão). Comentário reescrito para descrever a condição real.                             |

**Limite conhecido, não resolvido:** o campo `truncado` não aparece no JSON da rota interna — `fechar-ciclos/route.ts` mapeia campo a campo e não estava no escopo desta correção. Hoje o sinal de truncamento chega ao operador pelo `console.warn`. Quem tocar na rota deve subir `truncado` para o corpo da resposta.

---

## Self-Review

**Cobertura da DoD:** carência efetivamente corre ✔ (T2) · `past_due` deixa de ser terminal ✔ (T2) · máquina de dívida da #290 alcançável por inadimplência ✔ (T2 step 3) · gateway cancelado antes do banco, fail-closed ✔ (D-2/T2 step 2) · `pastDueDesde` zerado com teste de ida-volta-ida ✔ (T2 step 1) · carência redimensionada com backfill ✔ (T1) · comentários falsos corrigidos ✔ (T3 step 2) · aviso ao cliente declarado fora ✔ (D-5 → #312).

**Premissa da issue corrigida no plano, não em silêncio:** os "14 dias" não existem. Quem ler só a issue dimensiona errado; a seção "Fato medido" fica aqui para que a próxima sessão não reintroduza a soma.

---

## Verificação — o que dá para provar nesta máquina e o que não dá

**Dá para provar aqui:**

- `pnpm test` (unitários), `pnpm typecheck`, `pnpm lint`.
- `src/db/migrations.test.ts` — integridade do `_journal.json` (entrada órfã, `when` não crescente, `idx` fora de sequência, tag malformada). Roda no `pnpm test`, sem banco.
- Que os três comentários mentirosos foram corrigidos e que nenhuma referência ao comportamento antigo sobrou (`rg`).

**NÃO dá para provar nesta sessão, sem eufemismo:**

- O **Postgres local está fora do ar** e o **daemon do Docker não sobe nesta máquina**. Portanto **nenhum `*.int.test.ts` foi executado** e **`pnpm db:migrate` não foi rodado**. A migração `0098` está **escrita, não aplicada**.
- Consequência direta, e ela já mordeu este repo antes: **migração commitada não é migração aplicada**. O default novo, o backfill e o índice só contam depois de medidos no Postgres — `information_schema.columns.column_default` para o default, `SELECT` de contagem por valor para o backfill, `pg_indexes` para o índice. `git log` não prova execução.
- A fail-closed da D-2 contra o **Asaas real** também não foi exercitada: o que passa aqui é o dublê. O comportamento do `DELETE` sob autorização já revogada pelo pagador no app do banco continua **suposto**, não medido — e o sandbox não resolve (nenhuma autorização chega a `ACTIVE` lá, #321).
- Em consequência, a **tolerância a idempotência da D-2 é desenho defensivo, não medição**. O que está confirmado é só a doc do endpoint (`DELETE /pix/automatic/authorizations/{id}` declara 200, 400, 401 e 404). Que uma autorização já cancelada devolva 404 — e não 200, e não 400 — **não foi observado**. Por isso o adapter, no 400, reconsulta o `GET` e só aceita como sucesso se o gateway **disser** que ela está cancelada. Medir na primeira revogação real de produção.

Quem retomar: rodar `pnpm db:migrate` + a suíte de integração **antes** de considerar a #319 fechada, e medir os três itens acima no banco.
