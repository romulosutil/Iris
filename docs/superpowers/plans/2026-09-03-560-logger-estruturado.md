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
- **F3b — jobs `.mjs`.** ~47 sítios em 13 scripts copiados para imagens de infra. Não importam `pino` nem `src/`: ganham um emissor **sem dependência** (`scripts/lib/log-estruturado.mjs`, Node puro) com a mesma forma do registro — `nivel`/`evento`/`hora`/contexto, redaction por chave, `execucaoId` por rodada no lugar do `requestId`. COPY relativo, `npm install` continua não existindo. Prova é build de imagem + `scripts/ci/verificar-deps-imagem.mjs`, não `pnpm test`.

### F4 · Migração — os 11 `logic.ts` de rota

- **Última**, e a que colide com #559 e #558.
- **Ordem obrigatória**: esta fatia vai **antes** do F4 do plano de #559 (que move esses mesmos arquivos). Inverter obriga a reescrever a chamada de log duas vezes.

### F5 · Contadores — independente

- Extrações/min, latência do provider, falhas por provider. Generaliza o que a #555 já grava para a extração.
- **Pronto quando**: existe um número que muda quando o sistema é exercitado, e alguém consegue lê-lo. Métrica que ninguém lê é log com outro nome.
- **Cuidado medido antes**: métrica sob enforcement obrigatório marca 100% para sempre e não informa nada. Escolher contador que possa variar.

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
