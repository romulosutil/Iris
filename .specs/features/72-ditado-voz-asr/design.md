# Design — Issue #72: Ditado de Voz (ASR self-hosted)

> Ler `context.md` (decisões + fatos medidos) e `spec.md` (requisitos R1-R23) antes.

## 1. Visão

Quatro peças, três já com molde no repo:

```
Navegador                 Next (app)                  Postgres            Serviço ASR
─────────                 ──────────                  ────────            ───────────
audio-local.tsx           enviarLoteAsr ────────────► audio_capture       infra/asr/
 ├ MediaRecorder          (server action)              (linhas na fila)    faster-whisper
 ├ IndexedDB              upload efêmero ──► MinIO                         HTTP interno
 └ polling ◄────────────  obterEstadoLote ◄────────── audio_capture
                                  ▲
  enviarLoteAsr ─enqueue(tx)─► pgboss.job ──► consumidor (asr-agendador)
                                                        │
  cron CRON_TICK_ASR (rede de segurança) ───────────────┤
                                                        │
                                                        ▼
                                POST ──► /api/internal/jobs/asr-transcrever
                                   ├ reserva via SECURITY DEFINER
                                   ├ baixa objeto do MinIO
                                   ├ chama AsrProvider ─────────────────► POST /transcrever
                                   └ finally: apaga objeto SEMPRE
```

## 2. Modelo de dados

Colunas novas em `audio_capture` (D4 — herda RLS, consentimento, sigilo, expurgo `0128:162`, export `coletor.ts:84`):

| Coluna              | Tipo                         | Papel                                                                |
| ------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `lote_id`           | `uuid` null                  | Agrupa os clipes de um envio. Null nas linhas legadas.               |
| `ordem`             | `integer` null               | Posição do clipe no lote → ordem do parágrafo (R6).                  |
| `asr_status`        | enum `asr_status`            | `nao_solicitado`, `na_fila`, `transcrevendo`, `transcrito`, `falhou` |
| `transcricao_texto` | `text` null                  | Texto do clipe. Dado clínico.                                        |
| `transcrito_em`     | `timestamptz` null           | Carimbo de conclusão.                                                |
| `tentativas`        | `integer not null default 0` | Teto de retry (R16).                                                 |

`objeto_ref` (já existe) passa a guardar a chave do objeto efêmero no MinIO enquanto o clipe está em voo; volta a `NULL` quando o objeto é apagado.

**Índice da fila:** parcial em `(asr_status, criado_em)` cobrindo só `na_fila` e `transcrevendo`.

**GRANT obrigatório** (regra 4 do CLAUDE.md — esta tabela tem `UPDATE` coluna-a-coluna em `0006:126`):

```sql
GRANT UPDATE (lote_id, ordem, asr_status, transcricao_texto, transcrito_em, tentativas)
  ON audio_capture TO app_role;
```

Sem isso: `permission denied for table audio_capture`.

`asr_status` com default `nao_solicitado` → linha legada e linha criada pelo fluxo single-clipe atual seguem fora da fila, sem backfill.

## 3. A fila cross-tenant — o ponto de maior risco

`audio_capture` tem `FORCE ROW LEVEL SECURITY` e policies só `TO app_role`, resolvidas por `app_clinic_id_exigido()`. O worker roda **sem tenant**: sob `app_role` ele veria **fila vazia, sem erro** (memória `grant-sem-policy-nega-tudo-em-silencio`). Por isso, três funções `SECURITY DEFINER` do owner, no idioma de `src/lib/export/acervo/motor.ts:141-170`:

- `app_asr_reservar(p_limite int)` — `UPDATE` para `transcrevendo` com `tentativas = tentativas + 1`, escolhendo ids por subquery `ORDER BY criado_em ... FOR UPDATE SKIP LOCKED LIMIT p_limite`; retorna `id, clinic_id, objeto_ref, ordem`.
- `app_asr_concluir(p_id uuid, p_texto text)` — `asr_status = 'transcrito'`, grava texto, `transcrito_em = now()`, `objeto_ref = NULL`.
- `app_asr_falhar(p_id uuid)` — volta a `na_fila` se `tentativas < 3`, senão `falhou` definitivo; `objeto_ref = NULL` nos dois casos.

**Teto de tentativas = 3** (R16, hardcoded na função — não é config, mesmo idioma de outros limites fixos do repo). Vai dentro da subquery do `app_asr_reservar`: `WHERE asr_status = 'na_fila' AND tentativas < 3`.

Armadilhas conhecidas, endereçadas:

- **`FOR UPDATE` exige privilégio de UPDATE** — a função é do owner, então passa; mas o guard interno precisa existir, porque `SECURITY DEFINER` desliga a RLS.
- **Reserva ANTES de processar** (memória `varredura-escreve-o-proprio-predicado`): o `UPDATE` para `transcrevendo` acontece na reserva, não depois da transcrição, e `tentativas` é incrementado ali. Falha parcial não devolve o clipe ao conjunto elegível no mesmo tick — fail-closed **com progresso**, sem loop preso.
- **Filtro depois do `LIMIT`** (memória `varredura-filtro-depois-do-limit`): o teto de tentativas entra **dentro** da subquery do `LIMIT`, nunca num `WHERE` externo. Senão um clipe estourado ocupa a janela e trava a fila inteira.
- **`SKIP LOCKED`** evita que dois ticks sobrepostos disputem a mesma linha.

## 4. Storage efêmero

Bucket dedicado no MinIO já provisionado — `iris-asr-efemero`, credencial própria, separado dos buckets de backup e exportação.

Ciclo de vida do objeto: escrito por `enviarLoteAsr`, lido pelo worker, **apagado no `finally`** do processamento do clipe — em sucesso, em falha transitória e em falha definitiva (R11). Não existe caminho em que o objeto sobreviva ao fim do processamento.

**Sweeper (T15):** não é retenção, é limpeza de vazamento. Varre por **mtime** (memória `auditar-por-nome-apagar-por-mtime`: `--older-than` mede mtime, não o nome do objeto) e apaga objeto com mais de 6h — só chega lá órfão de container morto no meio do processamento.

## 5. Provider

```ts
// src/lib/asr/provider.ts
export interface AsrProvider {
  transcrever(audio: Uint8Array, mime: string): Promise<{ texto: string }>;
}
```

- `SelfHostedAsrProvider` — `POST` para o host interno do Swarm (`espectro-mvp_iris-asr`), bearer `ASR_SERVICE_TOKEN`, timeout explícito. O áudio não atravessa a internet.
- `StubAsrProvider` — texto determinístico, **sem rede** (R22), selecionado por env em CI/teste.

A escolha do provider é **estática por env**, não `await import()` dinâmico: memória `carga-nao-cobre-import-dinamico` — import dinâmico em try/catch degrada em silêncio e a carga passa verde com a dependência ausente da imagem.

## 6. Serviço ASR (`infra/asr/`)

Container Python separado, molde `infra/billing/`. **Não herda nada do app** (memória `imagem-escalonamento-nao-herda-app`): toda dependência listada à mão no Dockerfile, e o modelo baixado **na build**, não em runtime — senão o primeiro boot depende de rede externa (memória `build-docker-depende-de-rede-externa`; provar com `RUN --network=none`).

Servidor HTTP mínimo: `POST /transcrever` (bytes → `{ texto }`) e `GET /saude`.

**Contrato de recusa (T06 fechado, T05/T07 consomem).** O provider não pode
tratar todo não-200 como a mesma falha — o worker decide entre gastar tentativa
e devolver o clipe para a fila a partir do código. Tabela canônica em
`infra/asr/runbook.md` §0; o resumo que T05/T07 implementam:

- `503` (teto de concorrência do serviço) → devolve para `na_fila` **revertendo
  a tentativa**. É saturação, não falha do clipe: `app_asr_reservar` já
  incrementou `tentativas` na reserva, então sem reverter o clipe queima o teto
  de 3 (R16) por carga da VPS e morre em `falhou` **sem nunca ter sido
  processado**. Mecanismo: `app_asr_falhar(p_id uuid, p_reverter_tentativa
boolean DEFAULT false)` — em `true`, `tentativas = greatest(tentativas - 1,
0)` e status volta a `na_fila` ignorando o teto. **Proposta de arquitetura —
  validar com Rômulo antes de fechar T02.** O risco conhecido é laço infinito
  se o serviço ficar saturado para sempre.

  ⚠️ **A contenção original desta proposta não se sustentou** e o texto ficou
  aqui porque o raciocínio errado é parte do registro: dizia-se que "teto do
  serviço >= teto do agendador torna `503` anomalia, não caminho normal". Não
  tornava — o laço de `sleep 20` disparava contra ticks ainda vivos de ~215 s,
  então `503` era o regime NORMAL (#494/T19). Quem de fato contém hoje são duas
  coisas do lado do banco: o teto de reversões por clipe em
  `app_asr_falhar(id, true)` + o backstop de idade `app_asr_expirar_presos`
  (`0141`), e — desde a D73 — a concorrência 1 da fila `pgboss`, que impede um
  segundo tick de sair de `created` enquanto o primeiro está `active`.

- `400`/`413` (corpo vazio, truncado ou acima do teto) → falha **definitiva**
  do clipe. Reenviar o mesmo byte range dá o mesmo erro.
- `408`/`500` → falha transitória, conta tentativa.

**Tetos do serviço são backstop, não a única barreira.** `ASR_MAX_CONCORRENTES`
(default 2) e `ASR_MAX_BYTES` (default 10 MiB, derivado de R1) vivem no serviço
além do teto do consumidor: o chamador não é a única coisa entre a fila e uma
VPS de 4 vCPU sem GPU. O teto do serviço tem que ser **>=** o do consumidor, ou
todo tick normal colhe `503`.

⚠️ **O teto do consumidor é `localConcurrency`, ou seja, POR PROCESSO** (D73).
`asr-transcrever` tem `concurrency: 1`, mas duas réplicas do serviço
`asr-agendador` são dois tetos de 1 — a fila entrega um job a cada uma e a
carga dobra sem nada acusar. Réplicas = 1 é requisito, não economia, e a guarda
de instância única em `infra/asr/agendador.sh` cobre o caso do segundo processo
dentro do MESMO container.

**`ASR_SERVICE_TOKEN` ausente derruba o boot.** Fail-fast em vez de `/saude`
verde com `/transcrever` respondendo `401` para sempre — o modo "verde e morto"
não se diagnostica de fora.

**Tamanho do modelo é resultado de medição, não escolha a priori.** T6 mede na VPS real (4 vCPU / 16 GB, sem GPU) o tempo de transcrição de um clipe de 2 min em `small` e em `medium`, em PT-BR clínico. O teto de concorrência sai desse número.

## 7. Gatilho — fila `pg-boss` (D73, PR #624)

> **Este item mudou.** O desenho original era um laço de shell
> (`infra/asr/agendador.sh` com `sleep 20`), porque o Easypanel não tem cron.
> Ele funcionava como agendador e **não** resolvia sobreposição de ticks: o
> cliente abortava em 120 s, a rota seguia processando por ~215 s, o laço dormia
> 20 s e disparava de novo contra um tick vivo (#494/T19). A D73 substituiu o
> laço por fila transacional nativa no PostgreSQL (`pg-boss` v12).

Dois caminhos alimentam a mesma fila `asr-transcrever`:

1. **Caminho quente (latência).** `enviarLoteAsr` chama `enqueueJob` com a
   transação Drizzle em curso (`fromDrizzle(tx, sql)`), no mesmo COMMIT que
   promove os clipes a `na_fila`. Rollback da transação = job nunca existe; não
   há dual-write nem job fantasma apontando para estado não commitado. É o que
   mantém o ditado respondendo em segundos (R1).
2. **Rede de segurança.** `boss.schedule("asr-transcrever", CRON_TICK_ASR)`,
   1 min. Existe por duas razões que o caminho quente não cobre:
   `app_asr_falhar(id, true)` e `app_asr_expirar_presos` devolvem clipes a
   `na_fila` DEPOIS que o job daquele lote concluiu com sucesso; e o heartbeat
   `asr` (lido por `scripts/alarme-jobs.mjs`, limite de 30 min) é escrito pela
   ROTA, uma vez por tick — clínica sem ditado nenhum alarmaria sem nada estar
   quebrado.

O que **não** mudou é o que importa: **a lógica continua morando na rota do
app**. O consumidor (`src/lib/queue/handlers/asr.ts`) só faz
`POST /api/internal/jobs/asr-transcrever` com bearer `ASR_JOB_TOKEN` comparado
em `timingSafeEqual` — mesmo idioma de
`api/internal/billing/fechar-ciclos/route.ts`. Env ausente = recusa tudo, nunca
"passa porque não há token configurado", e o worker se recusa a subir antes de
registrar qualquer consumidor.

A imagem do job continua não herdando as deps do app (#156, memória
`guard-em-processo-que-nao-importa-o-codigo`). Como o consumidor é TypeScript e
vive em `src/lib/queue/**`, `infra/asr/Dockerfile.agendador` ganhou um estágio
`bundler` com esbuild que produz um `.mjs` autocontido (11,7 KB; único import
externo é `pg-boss`). `src/lib/queue/boss.ts` está separado de `client.ts`
exatamente para o Drizzle ficar fora desse bundle. `src/lib/queue/bundle.test.ts`
é o oráculo sobre esses artefatos — nenhum teste de unidade do worker alcança
essa classe de defeito, porque todos importam o código direto do repo.

## 8. Fronteira cliente/servidor

`audio-local.tsx` é `"use client"`. A action de envio mora em `diario/[sessionId]/actions.ts` (já `"use server"`), delegando ao core em `logic.ts`. O core ctx-accepting **nunca** é exportado de módulo `"use server"` (memória `ctx-forjavel-use-server`: seria endpoint client-invocável com bypass de RLS). Nenhum helper novo é exportado do módulo `"use client"` para consumo do servidor (memória `use-client-quebra-chamada-do-servidor`).

`obterEstadoLote` é leitura por server action chamada do cliente no polling — não `revalidatePath`, que não revalida em navegação client-side (memória `layout-nao-revalida-em-nav-client-side`).

## 9. Feature flag

Primeiro flag do repo. `src/lib/flags.ts`, server-only, lendo `process.env.FEATURE_FLAG_ASR_ENABLED === "true"`. Ausente ou inválida = desligada (R21, fail-closed). Gate em dois pontos: no server action (autoridade) e na UI (não oferece o que a action recusaria). O booleano chega à UI pelo server component — a página não lê env no cliente.

## 10. Casos de borda (R24-R27)

- **Duplo clique em "Enviar" (R24):** o `loteId` (`crypto.randomUUID()`) é gerado **no cliente**, antes do POST, e o botão desabilita no clique. `enviarLoteAsr` recebe o `loteId` pronto e faz `INSERT ... ON CONFLICT (lote_id) DO NOTHING` na primeira linha de checagem, ou verifica existência antes de inserir — reenvio do mesmo `loteId` (rede falhou, cliente retry) não duplica `audio_capture`.
- **Fechar aba durante gravação (R25):** nada a fazer — R3 já garante que só o clipe **concluído** é persistido; o `MediaRecorder` em andamento morre com a aba, sem rastro.
- **Fechar aba/navegar durante o polling (R26):** o processamento é 100% servidor (fila + worker), não depende da aba aberta. Ao reabrir `diario/[sessionId]`, o server component busca o `loteId` mais recente por `sessionId` (não por estado local) e a UI decide entre "retomar polling" (ainda `na_fila`/`transcrevendo`) ou "mostrar resultado" (já `transcrito`/`falhou`) — nunca reenvia.
- **Regravar item já enviado (R27):** a lista local marca item como "enviado" no clique de "Enviar" e remove as ações descartar/regravar daquele item — elas só existem para clipe em `vazio`/`gravado`, nunca depois do POST do lote.

## 11. O que este design NÃO faz

- Não transcreve ao vivo. Sem VAD nem streaming; Whisper batch, pós-sessão. Modo 3 fica fora.
- Não retém áudio no servidor por 7 dias (D3).
- Não chama provedor externo — logo, nada de DPA/SCC/ZDR no V1.
- Não mexe em `docs/legal/`: §8.1 do termo adulto já cobre, e efêmero é mais restrito que o prometido.
- Não renomeia o store IndexedDB existente.
