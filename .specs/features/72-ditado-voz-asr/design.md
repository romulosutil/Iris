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
infra/asr/agendador.sh ──POST──► /api/internal/jobs/asr-transcrever
   (tick, sem cron)                ├ reserva via SECURITY DEFINER
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

**Tamanho do modelo é resultado de medição, não escolha a priori.** T6 mede na VPS real (4 vCPU / 16 GB, sem GPU) o tempo de transcrição de um clipe de 2 min em `small` e em `medium`, em PT-BR clínico. O tick do agendador e o teto de concorrência saem desse número.

## 7. Gatilho (`infra/asr/agendador.sh`)

Easypanel não tem cron. Script versionado no repo, painel só aponta o campo Comando — igual a `infra/retencao/agendador.sh`. Faz `POST /api/internal/jobs/asr-transcrever` com bearer `ASR_JOB_TOKEN` comparado em `timingSafeEqual`, mesmo idioma de `api/internal/billing/fechar-ciclos/route.ts`. Env ausente = recusa tudo, nunca "passa porque não há token configurado".

A lógica mora na rota do app, não num `.mjs` do job — a imagem do job não herda as deps do app, e um guard TS não alcançaria o código do agendador (memória `guard-em-processo-que-nao-importa-o-codigo`).

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
