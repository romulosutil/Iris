# Tasks — Issue #72: Ditado de Voz (ASR self-hosted)

> Ler `context.md`, `spec.md` e `design.md` antes. Requisitos referenciados como R1-R23.
> Fronteira de atomização: cada task é rejeitável ou aprovável isolada por um revisor.

## Ordem e dependências

```
T01 ─┬─ T02 ── T03
     └─ T09 ─┬─ T10 ── T11 ── T12
T04 ─────────┘         │
T05 ─┬─ T07 ── T08     T13
T06 ─┘   │             T14
         T15
                       T16 (depende de todas) ── T17
```

---

## T01 — Migração: colunas de ASR em `audio_capture`

**Onde:** `src/db/schema.ts`, `db/migrations/` (gerada), `db/migrations/meta/`
**Depende de:** —
**Reusa:** padrão de enum + coluna do próprio `schema.ts`; grants de `0006_fase2_rls.sql:126`

**O quê:** enum `asr_status` (`nao_solicitado`, `na_fila`, `transcrevendo`, `transcrito`, `falhou`); colunas `lote_id`, `ordem`, `asr_status` (default `nao_solicitado`), `transcricao_texto`, `transcrito_em`, `tentativas` (default 0); índice parcial da fila.

**Done when:**

- `pnpm db:generate` gerou o `.sql` + `meta/NNNN_snapshot.json`, commitados juntos.
- O `.sql` gerado foi editado à mão só para adicionar o `GRANT UPDATE (lote_id, ordem, asr_status, transcricao_texto, transcrito_em, tentativas) ON audio_capture TO app_role;` — **sem tocar o snapshot**.
- Constraints nomeadas no padrão Drizzle (`_fk`/`_pk`/`_unique`), não Postgres.
- Verificado **medindo**: `information_schema.columns` mostra as 6 colunas e `has_column_privilege('app_role','audio_capture','asr_status','UPDATE')` é `true`.

**Testes:** `src/db/migrations.test.ts` continua verde (journal, `when`, `idx`, tag).
**Gate:** `pnpm test -- migrations`, `pnpm typecheck`

⚠️ Enum novo + uso na mesma migração: `tipo::text` contorna o "unsafe use of new value" (memória `enum-novo-e-check-numa-migracao`).

---

## T02 — Funções `SECURITY DEFINER` da fila

**Onde:** `db/migrations/NNNN_asr_fila.sql` (escrita à mão)
**Depende de:** T01
**Reusa:** `src/lib/export/acervo/motor.ts:141-170` como precedente de reserva atômica

**O quê:** `app_asr_reservar(p_limite int)`, `app_asr_concluir(p_id uuid, p_texto text)`, `app_asr_falhar(p_id uuid)`. Reserva com `FOR UPDATE SKIP LOCKED`, incremento de `tentativas` **na reserva**, teto de tentativas **dentro da subquery do `LIMIT`**.

**Done when:**

- Migração à mão com entrada manual no `_journal.json` e `when` = anterior **+ 1000**.
- Nenhuma função resolve tenant com `current_setting('app.clinic_id')` cru — usa `app_clinic_id_atual()` onde precisar (é dentro de função).
- Verificado em `pg_proc` com `prosecdef = true`, não em `git log`.

**Testes:** —
**Gate:** `pnpm db:migrate` local + consulta em `pg_proc`

⚠️ Não editar migração já aplicada in-place (memória `editar-migracao-aplicada-nao-roda`); `CREATE OR REPLACE` torna o diff enganoso — medir o corpo em `pg_proc`.

---

## T03 — Teste de integração da fila

**Onde:** `db/tests/asr-fila-rls.int.test.ts`
**Depende de:** T02
**Reusa:** fixtures de int-test existentes

**Done when:** cobre — (a) `app_role` de clínica A não enxerga clipe de clínica B; (b) `app_asr_reservar` reserva cross-tenant e é idempotente sob dois ticks concorrentes (segunda chamada não devolve a mesma linha); (c) clipe com `tentativas` no teto **não** ocupa a janela do `LIMIT`; (d) `app_asr_falhar` no teto marca `falhou` definitivo e zera `objeto_ref`.

**Testes:** os 4 cenários acima.
**Gate:** `pnpm test:rls` — **conferir a contagem de arquivos coletados**, não só o verde (memória `vitest-int-test-coleta-zero`, `suite-rls-rodando-como-superusuario`).

⚠️ E-mail de fixture novo e único; não reusar `coord@a.test` (memória `email-de-fixture-colide-entre-int-tests`). Sem `TRUNCATE` extra (memória `truncate-extra-colide-com-int-test-paralelo`).

---

## T04 — Bucket efêmero + client de storage

**Onde:** `src/lib/asr/storage.ts`, provisionamento do bucket `iris-asr-efemero`
**Depende de:** —
**Reusa:** client de MinIO já usado em backup/exportação

**Done when:** `guardar`, `ler`, `apagar` por chave; bucket com credencial própria, separada de backup e exportação; região/assinatura explícitas.

**Testes:** unitário do client contra dublê.
**Gate:** `pnpm test`

⚠️ Dublê não cobre dialeto do destino (memória `teste-com-duble-nao-cobre-dialeto-do-destino`): `mc` assina `us-east-1` sem `MC_REGION`. O teste do dublê não prova a cópia — a prova é o smoke em T08.

---

## T05 — Interface `AsrProvider` + `StubAsrProvider` + `SelfHostedAsrProvider`

**Onde:** `src/lib/asr/provider.ts`, `stub.ts`, `self-hosted.ts`
**Depende de:** —

**Done when:** seleção do provider é **estática por env**, sem `await import()` dinâmico; `StubAsrProvider` não faz rede nenhuma; `SelfHostedAsrProvider` tem timeout explícito e bearer `ASR_SERVICE_TOKEN`.

**Testes:** stub devolve texto determinístico; self-hosted monta a requisição certa contra dublê de fetch.
**Gate:** `pnpm test`, `pnpm typecheck`

⚠️ Dublê com arrow não é construtor (memória `duble-arrow-nao-e-construtor`) — se o provider for instanciado com `new`, o dublê precisa ser função/classe.

---

## T06 — Serviço faster-whisper (`infra/asr/`) + benchmark medido

**Onde:** `infra/asr/Dockerfile`, `infra/asr/servidor.py`, `infra/asr/runbook.md`
**Depende de:** —
**Reusa:** molde `infra/billing/`

**O quê:** container Python com `POST /transcrever` e `GET /saude`. Deps listadas à mão; modelo baixado **na build**.

**Done when:**

- `RUN --network=none` prova que o boot não depende de rede externa.
- **Benchmark registrado no `runbook.md`**: tempo de transcrição de clipe de 2 min em `small` e `medium`, na VPS real (4 vCPU / 16 GB, sem GPU), em áudio PT-BR clínico. O tamanho de modelo escolhido e o tick de T08 **citam esse número**.

**Testes:** —
**Gate:** build local da imagem + benchmark executado na VPS

⚠️ O número tem que ser **medido**, não estimado (memória `verificar-fato-de-infra-com-medicao`). `[x] CONFIRMADO` sem prova custa mais que `[ ]`.

---

## T07 — Rota interna do worker

**Onde:** `src/app/api/internal/jobs/asr-transcrever/route.ts` (+ `route.test.ts`)
**Depende de:** T02, T04, T05
**Reusa:** `api/internal/billing/fechar-ciclos/route.ts` (bearer `timingSafeEqual`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`)

**O quê:** autoriza por `ASR_JOB_TOKEN`; reserva lote via `app_asr_reservar`; por clipe baixa o objeto, chama o provider, chama `app_asr_concluir` ou `app_asr_falhar`, e **apaga o objeto no `finally`** (R11).

**Done when:** falha de 1 clipe não aborta os demais do tick (R12); token ausente recusa tudo; o `finally` de apagar o objeto roda nos três desfechos.

**Testes:** token ausente → 401; lote de 3 com o do meio falhando → 2 `transcrito`, 1 de volta à fila, 3 objetos apagados; teto de tentativas → `falhou` definitivo.
**Gate:** `pnpm test`, `pnpm typecheck`, `pnpm lint`

⚠️ Mensagem de erro não afirma causa única (memória `mensagem-de-erro-que-afirma-causa`) — reportar `Error.message` quando houver, senão o valor cru.

---

## T08 — Agendador + provisionamento no Easypanel

**Onde:** `infra/asr/agendador.sh`, `infra/README.md`
**Depende de:** T06, T07
**Reusa:** `infra/retencao/agendador.sh`

**Done when:**

- Script versionado; painel só aponta o campo Comando.
- Tick derivado do benchmark de T06.
- **Serviço verificado de pé no painel**, com um lote real transcrito ponta a ponta — issue fechada não prova serviço rodando (memória `job-provisionado-nao-e-job-que-fecha-ciclo`).

**Testes:** —
**Gate:** smoke em produção com clínica de teste

⚠️ Salvar env no Easypanel não aplica — exige "Implantar" (memória `easypanel-ambiente-expoe-segredos`).

---

## T09 — Server action `enviarLoteAsr`

**Onde:** `src/app/(app)/diario/[sessionId]/logic.ts` (core) + `actions.ts` (wrapper)
**Depende de:** T01, T04
**Reusa:** `registrarAudioLocal` (`logic.ts:222`), `comEscrita`, `withTenant`, `getTenantContext`

**O quê:** recebe N clipes com ordem, gera `lote_id`, insere N linhas em `audio_capture` (`asr_status = 'na_fila'`, `ordem` 0..N-1), sobe cada blob para o bucket efêmero e grava `objeto_ref`. Retorna `loteId` **imediatamente** (R9).

**Done when:** o core ctx-accepting **não** é exportado de `actions.ts`; gate da flag recusa quando desligada (R21); recusa de consentimento não escapa como erro genérico.

**Testes (int):** cria N linhas com ordem preservada; flag desligada → recusa; papel errado → recusa.
**Gate:** `pnpm test`, `pnpm test:rls`, `pnpm typecheck`

⚠️ `ctx` forjável em `"use server"` (memória `ctx-forjavel-use-server`).

---

## T10 — Leitura de estado do lote + limites de polling

**Onde:** `src/app/(app)/diario/[sessionId]/logic.ts` + `actions.ts`
**Depende de:** T09

**O quê:** `obterEstadoLote(loteId)` → por clipe: `ordem`, `asr_status`, `transcricao_texto`. Leitura sob RLS do tenant do request.

**Done when:** os limites de R20 estão no código e nomeados: intervalo de 3s, teto de 10 min. Estourado o teto, o retorno diz "segue processando", **nunca** "falhou".

**Testes (int):** lote de outro tenant não é legível; lote parcial devolve os transcritos e marca os pendentes.
**Gate:** `pnpm test:rls`

⚠️ `catch { setState(null) }` transforma falha de rede em afirmação clínica (memória `erro-renderizado-como-empty-state`) — erro de leitura é erro, não lista vazia.

---

## T11 — UI multi-clipe

**Onde:** `src/app/(app)/diario/[sessionId]/audio-local.tsx`
**Depende de:** T10
**Reusa:** o próprio componente (D1) — evoluir, não substituir

**O quê:** teto de 2 min por clipe com encerramento automático (R1); lista de clipes com duração, descartar e regravar por item (R4); sem teto de quantidade (R2); botão explícito "Enviar pra Iris analisar" (R5); ordem preservada (R6).

**Done when:** nenhum clipe sobe ao terminar de gravar; a aba "Áudio" do `captura-form.tsx` continua funcionando; a11y do componente coberta.

**Testes:** teto de 2 min encerra sozinho; descartar remove o item e o blob; ordem da lista = ordem enviada.
**Gate:** `pnpm test`, `pnpm lint`

⚠️ Matcher nativo sobre o DOM cru — o repo **não tem jest-dom** (memória `repo-nao-tem-jest-dom`).

---

## T12 — Resultado no editor: parágrafos, marcador de IA, clipe não transcrito

**Onde:** `audio-local.tsx` + `captura-form.tsx`
**Depende de:** T11

**O quê:** 1 clipe = 1 parágrafo, na ordem (R6); indicador visual de IA no rascunho (R17); clipe falho vira parágrafo marcado **"não transcrito"** com opção de reenviar do IndexedDB ou digitar à mão (R12, R13). Salvar segue sendo ato explícito (R18).

**Done when:** o texto nunca vai direto para `session_note`; o marcador de IA é visível, não só `aria-label`.

**Testes:** lote com 1 falha entre 3 → 2 parágrafos com texto, 1 marcado; nenhum caminho salva sem clique do terapeuta.
**Gate:** `pnpm test`, `pnpm lint`

⚠️ Componente do design system, nunca cor/estilo chumbado.

---

## T13 — Feature flag `FEATURE_FLAG_ASR_ENABLED`

**Onde:** `src/lib/flags.ts`, `.env.example`
**Depende de:** —

**Done when:** server-only; ausente ou inválida = **desligada** (R21); gate no server action (autoridade) **e** na UI; o booleano chega à UI pelo server component, sem ler env no cliente.

**Testes:** ausente → desligada; `"false"`/`"1"`/`"yes"` → desligada; só `"true"` liga.
**Gate:** `pnpm test`, `pnpm typecheck`

⚠️ Primeiro flag do repo — estabelece o padrão. Testar o comportamento, não a config (memória `teste-verde-que-nao-testa-nada`).

---

## T14 — Purga do IndexedDB

**Onde:** `src/lib/audio/local-store.ts` (+ teste), ponto de logout
**Depende de:** —
**Reusa:** store `iris-audio-rascunho` existente — **não renomear**

**O quê:** índice de clipes do lote no store; purga no **logout**; apagar clipe após o lote ser aceito (R8); flush em `window.online`. Codec dual `webm;opus` / `mp4` AAC (R7).

**Done when:** logout deixa o store vazio; falha de IndexedDB nunca bloqueia o texto do diário (R23).

**Testes:** purga no logout; fallback de codec escolhe `mp4` quando `webm;opus` não é suportado; erro de IndexedDB é degradação, não bloqueio.
**Gate:** `pnpm test`

---

## T15 — Sweeper de objetos órfãos

**Onde:** `infra/asr/agendador.sh` (passo adicional) ou script próprio
**Depende de:** T07

**O quê:** varre o bucket efêmero e apaga objeto com mais de 6h. **Não é retenção** — é limpeza de vazamento de container morto no meio do processamento.

**Done when:** o predicado é **mtime**, não nome; bucket vazio não é erro.
**Testes:** unitário do predicado de idade.
**Gate:** `pnpm test`

⚠️ Memória `auditar-por-nome-apagar-por-mtime`: `--older-than` mede mtime; nome antigo subido hoje não vence.

---

## T16 — Bateria de verificação da spec

**Onde:** onde cada cenário couber
**Depende de:** todas

**O quê:** os 7 cenários de §3 do design doc, mais os do escopo desta issue:

1. `StubAsrProvider` transcreve sem chamada de rede.
2. Purga do IndexedDB no logout.
3. Recusa de consentimento ASR **não** bloqueia salvar `SessionNote` por Modo 1 (R23).
4. Retenção: objeto apagado em sucesso **e** em falha — **não existe TTL de 7 dias** (R11, D3).
5. Fallback: falha de transcrição preserva o áudio **local** e permite digitação daquele parágrafo.
6. Teto de clipe: gravação encerra sozinha aos 2 min e o clipe fica revisável.
7. Lote parcialmente falho: N-1 transcrevem, 1 volta marcado "não transcrito".
8. Flag desligada: a action recusa e a UI não oferece ditado.
9. Transcrição entra no expurgo por paciente (`0128`) e na exportação do acervo (R19).

**Done when:** cada cenário é morto por mutação no código de **produção** (memória `mutante-equivalente-nao-pede-teste`: mutar produção, não o helper de teste).
**Gate:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` — **com contagem conferida**.

---

## T17 — Documentação e sincronização

**Onde:** `docs/superpowers/specs/2026-08-02-issue-72-ditado-voz-asr-design.md`, `.env.example`, `infra/README.md`, corpo da issue #72, `BACKLOG.md`
**Depende de:** T16

**O quê:** reconciliar o design doc com a realidade medida (caminhos reais, store real, storage efêmero em vez de TTL 7d); documentar `FEATURE_FLAG_ASR_ENABLED`, `ASR_JOB_TOKEN`, `ASR_SERVICE_TOKEN` e o bucket no `.env.example`; runbook do serviço no `infra/README.md`; **atualizar o corpo da issue #72** para bater com esta spec.

**Done when:** o corpo da issue não contradiz mais o que foi implementado.
**Gate:** revisão humana

⚠️ Executor implementa a **issue**, não a spec em comentário (memória `executor-implementa-issue-nao-spec`). Corpo da issue por `--body-file`, nunca inline no PowerShell (memória `corpo-de-issue-truncado-por-escape-do-powershell`).
