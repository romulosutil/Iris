# #560 · `DA-04` — logger estruturado, id de correlação e métricas

> Achado `DA-04` da auditoria 360. **P3 · esforço M.**
> Atomizado em 03/09/2026.

## Ponto de partida medido

- `src/lib/observabilidade/logar-erro.ts` tem **49 consumidores**, dos quais **11 são `logic.ts`** de rota.
- A W3 (#531 / PR #546) já entregou `logarErroSemPII` + `beforeSend` do Sentry. **A metade "perigoso" está fechada**; esta issue é a metade "pobre".
- A W7 (#535 / PR #555) já instrumentou modelo, versão de prompt, latência e tokens da extração — primeira métrica real do sistema. `DA-04` generaliza.
- 144 `console.*` fora de teste, sem prefixo consistente, sem JSON, sem `requestId`.

**Regra que governa tudo abaixo**: o logger estruturado **absorve** `logarErroSemPII`; não convive com ele. Dois caminhos de log é como se perde a garantia de redaction que a #546 comprou.

## Fatias

```
F1 (núcleo + correlação) ──> F2 ──> F3 ──> F4   (migração dos 49 sítios, em ondas)
                         └──> F5               (métricas, independente)
```

### F1 · Núcleo do logger + id de correlação — PR 1

- **O quê**: `pino` com **redaction por chave** (`texto`, `trecho_fonte`, `nome`, `cpf*` — a lista sai do que a #546 já classificou como PII), e id de correlação por request.
- **Onde**: novo módulo em `src/lib/observabilidade/`; correlação no `proxy.ts`.
- **Pronto quando**:
  - `logarErroSemPII` passa a ser **fachada fina** sobre o logger novo — os 49 sítios continuam compilando sem alteração;
  - todo registro sai como JSON com `requestId`;
  - a redaction é provada por teste com payload contendo cada chave da lista.
- **Prova de mutação**: remover uma chave da lista de redaction faz o teste vazar aquele campo e ficar **vermelho**. Mutar produção, reverter com patch inverso.
- **Por que a fachada importa**: permite mergear F1 sem tocar em nenhum dos 49 sítios, e sem conflitar com #558/#582/#559, que estão nos mesmos arquivos.

### F2 · Migração — bibliotecas (`src/lib/**`)

- Sítios de `lib/` primeiro: não colidem com rotas em obra.
- **Pronto quando**: nenhum `console.*` cru em `src/lib/`; contexto estruturado (não string interpolada) em cada chamada.

### F3 · Migração — jobs e rotas de API

- `src/app/api/internal/jobs/**`, scripts de infra.
- **Atenção**: a imagem dos jobs **não herda as dependências do app** — se `pino` entrar num job, precisa estar no Dockerfile daquele serviço. Já mordeu antes (motor de escalonamento caiu com CI verde). Provar com build da imagem, não com `pnpm test`.

**Medido em 04/09/2026, ao abrir a fatia** — a advertência acima é mais forte do que parecia. `infra/billing/Dockerfile` documenta **zero `npm install`, de propósito**: os jobs são gatilhos magros que só usam o `fetch` nativo, e "uma imagem sem dependência nenhuma não tem essa classe de falha" (#36/#156). Meter `pino` ali reabriria exatamente o modo de falha que a decisão fechou. Daí o corte em duas PRs:

- **F3a — rotas de API (esta).** Superfície medida: **4 sítios**, todos em `internal/jobs/asr-transcrever/route.ts` (o `console.warn` de `fechar-ciclos` era menção em comentário). Rodam no runtime do Next, onde `pino` já existe. `diagnosticoDoErro` local sai: `logarErroSemPII` produz um superconjunto do que ela montava. Guard `obs/sem-console-cru` passa a cobrir `src/app/api/**`, com piso zero medido.
- **F3b — jobs `.mjs` (entregue).** 47 sítios em 12 scripts + `scripts/lib/heartbeat.mjs`. Emissor **sem dependência** em `scripts/lib/log-estruturado.mjs` (Node puro, só `node:crypto`): mesma forma de registro do logger da app, com `execucaoId` no lugar do `requestId` — não há request num job, o que correlaciona linhas é a rodada. A lista de PII é **espelho** de `redacao.ts`, com teste de paridade que fica vermelho quando as duas divergem. Guard `obs/sem-console-cru` cobre os `.mjs` copiados para imagem, por lista explícita: a CLI de desenvolvimento (`seed*`, `ci/**`, `guardrail-conexao`) fica fora porque ali o destino é o terminal de um humano. Prova: build das 8 imagens + carga dos scripts DENTRO delas com `--network=none` + `verificar-deps-imagem.mjs`; remover o `COPY` novo de um Dockerfile deixa o guard vermelho.

### F4 · Migração — os `logic.ts` de rota (entregue)

- **Última**, e a que colide com #559 e #558.
- **Ordem obrigatória**: esta fatia vai **antes** do F4 do plano de #559 (que move esses mesmos arquivos). Inverter obriga a reescrever a chamada de log duas vezes.

**Medido em 04/09/2026, ao abrir a fatia.** Os 11 `logic.ts` do ponto de partida são os que _importam_ `logarErroSemPII` — e esses já saíam pelo caminho estruturado desde a F1, porque a fachada absorveu o helper. O que sobrou de fato para migrar foram **8 `console.*` crus em 5 arquivos**: `diario/[sessionId]` (1), `revisao/[sessionId]` (1), `cadastro` (2), `esqueci-senha` (2), `redefinir-senha` (2).

- **Frase interpolada vira campo.** Os dois sítios de `logger.*` novos (`diario-asr.lote-incompleto`, `revisao-dlq.transicao-concorrente-venceu`) levavam número e id colados numa sentença; agora saem em `loteId`, `clipesComFalha`, `extractionId`, `versaoCliente`. O operador filtra em vez de escrever um regex por sítio.
- **Três `descreverErro` locais saíram.** Um em cada `logic.ts` de `(auth)`, cada um montando `nome(code=…)` à mão. `logarErroSemPII` produz um superconjunto disso — `erroNome`, `codigo`, `constraint`, `causaNome`, `httpStatus`, `hashMensagem`, `correlacaoId`, em campos separados — e passa pela redaction por chave, que uma string pronta no `console.error` contornava. Mesmo movimento que a F3a fez com `diagnosticoDoErro`.
- **`src/auth/**` entrou na fatia.** `auth.ts` tinha o sítio de pior classe da varredura inteira: `console.error("dispararEmail: …", err)` com o objeto de erro **cru** — `err` ali vem do provedor de e-mail (a `message` do Resend embute o destinatário) ou do driver (a `message` é o SQL + os params). Deixá-lo fora tornaria falsa a invariante da issue ("um caminho só de log"), e o guard pararia na fronteira de `src/app` justamente antes do arquivo que a issue existe para consertar. Junto veio o aviso de `BETTER_AUTH_URL` ausente em produção, agora `auth-config.url-base-ausente-em-producao`.
- **Guard.** `ESCOPO_SEM_CONSOLE` deixou de ser `src/app/api/**` e passou a `src/app/**` + `src/auth/**`, com piso **zero** medido (sem baseline). O glob cobre a árvore de rota inteira, e não só `**/logic.ts`: o próximo `console` nasceria numa `page.tsx` `async` ou numa `actions.ts`, que rodam no mesmo servidor e escrevem no mesmo stdout. Os `"use client"` de `src/components/**` seguem fora por decisão — ali o `console` é o canal do browser.
- **Prova de mutação**: `console.warn` cru acrescentado a `pacientes/[id]/metas/logic.ts` deixa `nenhum console cru em src/app inteiro (F4)` **vermelho**; revertido com patch inverso.
- **Testes que espionavam o `console` passaram a ler `capturarLog()`** (`cadastro/logic.test.ts`, `redefinir-senha/logic.test.ts`): o sink ainda escreve no `console`, então o espião continuaria "funcionando" — lendo uma string JSON num argumento só, e o primeiro que esquecesse o `JSON.parse` passaria verde comparando `undefined` com `undefined`.

### F5 · Contadores — independente (entregue)

- Extrações/min, latência do provider, falhas por provider. Generaliza o que a #555 já grava para a extração.
- **Pronto quando**: existe um número que muda quando o sistema é exercitado, e alguém consegue lê-lo. Métrica que ninguém lê é log com outro nome.
- **Cuidado medido antes**: métrica sob enforcement obrigatório marca 100% para sempre e não informa nada. Escolher contador que possa variar.

**Medido em 04/09/2026, ao abrir a fatia — três achados que definiram o desenho:**

- **A view da 0148 já existia, e não resolve isto.** `metricas_extracao_por_clinica_semana` (#535) agrega extração por clínica e semana ISO e alimenta a "Saúde da IA" do `/supervisao`. É leitura **de tenant** (`app_clinic_id_exigido()`, só `coordenador`): responde "como está a IA na minha clínica esta semana". Não responde "o provider degradou agora, em qualquer clínica", que é a única pergunta que um alarme pode fazer. Alargar a view quebraria o isolamento que é a razão de ela existir — daí função própria, cross-tenant, de janela curta (`app_alarme_extracao`, `0153`).
- **`extraction` não é ledger de chamada.** Sucesso grava N linhas (uma por item de evidência); falha grava UMA (`PENDENTE_DRAFT`). E a Fase C da consolidação **apaga e regrava** as linhas `sugerida`/`pendente_reprocessamento` da sessão. Duas consequências: contar linhas cruas mediria "itens de evidência" e diluiria a taxa de falha por um fator que muda com o tamanho da nota (resolvido colapsando por sessão dentro da função); e a falha que o terapeuta re-tentou com sucesso **some do histórico**.
- **Falha não resolvida é a métrica CERTA para um alarme, não uma concessão.** Queda real do provider mantém as linhas de pé — ninguém consegue re-tentar com sucesso enquanto ele está fora. A falha transitória que o retry resolveu é justamente a que não deve acordar ninguém. Ledger fiel, se a contagem histórica virar requisito, é **tabela nova** — registrado como débito, não improvisado aqui. **Decisão do Rômulo (04/09/2026): derivar de `extraction`.**

**Desenho.** Uma chamada a `app_alarme_extracao('1 hour')` por tick do `iris-alarme`, com duas saídas de propósitos diferentes: (1) `log.info("alarme-jobs.metricas-extracao")` **sempre**, inclusive no tick saudável — é o contador (chamadas, falhas, `chamadasPorMin`, p95 por modelo), legível no Console sem abrir o banco, e é a série do tick saudável que dá régua para dizer o que "degradado" significa; (2) e-mail **só** ao cruzar limiar, porque resumo diário que chega mesmo quando está tudo bem vira filtro de caixa de entrada em duas semanas. **Decisão do Rômulo (04/09/2026): alarme por limiar, não painel nem resumo diário.**

**Limiares, e por que cada um.** Piso de amostra 5 (a clínica solo é o caso-base: a única extração da manhã falhando é uma falha, não 100%); taxa de falha > 30% (1 falha é rotina; esperar 100% torna o alarme inútil); p95 > 30 s, contra o timeout de 45 s de `resiliencia.ts` — acusa a degradação enquanto ainda há decisão a tomar. p95 é avaliado **por modelo** e só com amostra ≥ 5: um modelo lento diluído num rápido some da média. Os dois limiares juntos saem num alarme **só** (`motivo: "extracao"`) — um dedup, um e-mail.

**Janela vazia é `ok`, não `indeterminado`.** Madrugada e fim de semana são o estado normal de uma clínica pequena; `indeterminado` ali acumularia o contador de detector cego e mandaria "o detector pode estar cego" toda noite. `extracao` também fica fora do escalonamento de cegueira, pelo mesmo motivo dos heartbeats: lê o mesmo banco de `billing`/`escalonamento`, que já acusam.

**Sem `clinic_id` na saída** (diferente das duas funções da 0129): o provider é global — quando degrada, degrada para todos, e a chave de investigação é o **modelo**. Devolver o tenant só ampliaria o que uma credencial vazada deste serviço extrai sem responder nada que o operador vá usar.

**Prova de mutação (4 no `.mjs`, 2 no banco, todas revertidas com patch inverso):** teto de falha inerte (`> 1.1`) → 4 vermelhos; piso de amostra inerte (`< 0`) → 1; p95 sem piso por modelo → 1; contador não emitido → 1. No Postgres: função **sem** `SECURITY DEFINER` (`prosecdef=false` medido) → 2 vermelhos, e `GROUP BY e.id` no lugar de `e.session_id` → 1. Este último é o que prova a unidade: contando linha, `chamadas` daria 4 e o p95 1850 (interpolação sobre `[1000,1000,1000,2000]`); contando chamada, dá 2 e 1950. **Registrado porque quase passou batido:** a primeira tentativa da mutação `sem-definer` saiu **verde** — o `String.replace` do script trocou a primeira ocorrência de "SECURITY DEFINER", que está no comentário do cabeçalho, e não na assinatura. Mutante que não muta produção passa por prova e não é.

**Corrigido na revisão da PR #617:** o `catch` de `verificarExtracao` nasceu com `err.message` interpolado no `detalhe` — copiado de `verificarBilling`, o precedente errado. O `detalhe` é interpolado no **corpo do e-mail** por `enviarEmailAlarme`, e a `message` do driver de Postgres é a query com os params. Passou a usar `detalheDoErro(err)` (`erro=<name> code=<code>`), o mesmo caminho de `verificarHeartbeats`. Teste novo afirma a ausência do texto da message e a presença de `erro=`/`code=`; o mutante que volta ao `err.message` fica vermelho. Guard nenhum pegaria — os seletores de #531 casam `console.error(…err…)`, não interpolação em campo de dado (débito **D85**).

**Gates:** `typecheck` 0 · `lint` 0 erros / 8 warnings pré-existentes · `test` 3176/3176 (369 arquivos) · `test:rls` 1424/1424 (162 arquivos, inclui o int-test novo 3/3 contra banco real) · carga da imagem `iris-alarme` 7/7 asserções (nenhum Dockerfile mudou: a fatia não acrescenta import).

## Fora de escopo

| Item                                | Razão                                                              |
| ----------------------------------- | ------------------------------------------------------------------ |
| OpenTelemetry / tracing distribuído | `tracesSampleRate: 0` é decisão de custo. Reabrir é issue própria. |
| Trocar GlitchTip                    | Está funcionando para exceções.                                    |
| Backfill de log histórico           | Log não se reescreve.                                              |

## Riscos

- **Campo livre de terceiro carrega PII**: mensagem de bounce do provedor de e-mail embute o destinatário. Logar só categoria fechada, nunca o texto do terceiro.
- **`err.message` de driver é o SQL + params**: `DrizzleQueryError.message` não é a exceção do Postgres. Usar `name` + código PG.
- **Dependência que só falta em produção**: `await import()` degrada em silêncio; imagem sem o pacote passa verde no CI.
