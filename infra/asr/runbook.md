# Runbook — Serviço ASR self-hosted (Iris, #72)

> Escopo: serviço `iris-asr` (faster-whisper), container Python interno ao
> Swarm do Easypanel. Sem GPU, VPS Hostinger (4 vCPU / 16 GB).

> **Cotas de CPU e memória deste serviço** (#631): teto de **1 vCPU / 3 GB**,
> com `cpu_shares=128` para nunca disputar núcleo com o Postgres. Os números, o
> passo a passo no painel e o teste de carga que prova a cota estão em
> [`infra/README.md`, §Cotas de CPU e memória](../README.md#cotas-de-cpu-e-memória).
> Um `asr` que ficou lento **depois** de uma mudança de cota é o primeiro
> suspeito antes de mexer em `ASR_MODEL_SIZE` ou `ASR_MAX_CONCORRENTES`: com
> 1 vCPU e `ASR_MAX_CONCORRENTES=2`, duas transcrições simultâneas ficam cada
> uma ~2x mais lentas — é o desenho, não um defeito.

## 0. Rotas

| Rota           | Método | Autenticação                  | Corpo                           |
| -------------- | ------ | ----------------------------- | ------------------------------- |
| `/saude`       | GET    | nenhuma                       | —                               |
| `/transcrever` | POST   | `Bearer ${ASR_SERVICE_TOKEN}` | bytes crus do áudio (webm/opus) |

Códigos que `/transcrever` devolve além de `200`/`401`, todos com corpo
`{"erro": "..."}` — o provider (T05) e o worker (T07) tratam cada um:

| Código | Quando                                                                                  | O que o worker faz                              |
| ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `400`  | `Content-Length` ausente, zero ou malformado; corpo truncado antes do tamanho anunciado | Falha do clipe — não reenviar igual             |
| `408`  | Corpo não terminou de chegar dentro de `ASR_TIMEOUT_CONEXAO_S`                          | Falha transitória — volta para `na_fila`        |
| `413`  | Corpo acima de `ASR_MAX_BYTES`                                                          | Falha definitiva do clipe                       |
| `503`  | Teto de `ASR_MAX_CONCORRENTES` atingido                                                 | Devolve para `na_fila` **sem gastar tentativa** |
| `500`  | Falha da transcrição. O corpo é genérico de propósito; a causa está no log do container | Falha transitória, conta tentativa              |

Além desses, o provider (`src/lib/asr/self-hosted.ts`) trata como **recusa de
infraestrutura** o `401`/`403` (token divergente entre app e serviço), o `404`
(`ASR_SERVICE_URL` apontando para rota/host errado), o `502`/`504` (proxy do
Easypanel reiniciando ou sem upstream) e o abort/falha de rede do próprio
cliente. Todos recebem o mesmo tratamento do `503`: **devolve para `na_fila`
sem gastar tentativa** (T14, #494). O motivo é que `falhou` zera `objeto_ref`
(`0136`) e o worker então apaga o áudio do bucket efêmero — um
`ASR_SERVICE_TOKEN` rotacionado só de um lado destruiria a fila inteira em
~60s, com texto vazio e áudio perdido para sempre. Só `400`/`413` (áudio
inválido) e erro de aplicação (`408`/`500`) contam contra o teto de 3
tentativas.

## 1. Variáveis de ambiente

| Variável                | Papel                                                            | Obrigatória |
| ----------------------- | ---------------------------------------------------------------- | ----------- |
| `ASR_MODEL_SIZE`        | Tamanho do modelo carregado (tem que casar com o `ARG` do build) | sim         |
| `ASR_LANGUAGE`          | Idioma forçado na transcrição, default `pt`                      | não         |
| `ASR_SERVICE_TOKEN`     | Bearer comparado em `/transcrever`                               | sim         |
| `PORT`                  | Porta HTTP, default `8080`                                       | não         |
| `ASR_MAX_BYTES`         | Teto do corpo de `/transcrever`, default `10485760` (10 MiB)     | não         |
| `ASR_MAX_CONCORRENTES`  | Transcrições simultâneas antes de responder `503`, default `2`   | não         |
| `ASR_TIMEOUT_CONEXAO_S` | Timeout de socket por conexão, default `300`                     | não         |

`ASR_SERVICE_TOKEN` ausente **derruba o boot** (`exit 1`), de propósito: sem
ele o `/saude` seguiria `200` enquanto todo `/transcrever` responde `401` —
verde e morto, o modo de falha que não se diagnostica de fora. Crashloop no
Easypanel é o sinal certo.

O teto de `ASR_MAX_BYTES` deriva de R1 (clipe de 2 min): ~1,9 MB em webm/opus
a 128 kbps, com folga de ~5x. `ASR_MAX_CONCORRENTES` é o **backstop do lado do
serviço** — o agendador (T08) tem o teto dele; este existe para o teto do
chamador não ser a única barreira numa VPS de 4 vCPU sem GPU.

### 1.1 Envs do lado do APP (não do container `iris-asr`)

Estas o Next.js lê para falar com o serviço. Ficam no ambiente da app no
Easypanel, não no do `iris-asr`:

| Variável                 | Papel                                                                                                                                                    | Obrigatória                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `ASR_SERVICE_URL`        | URL completa da rota `/transcrever` no host **interno** do Swarm — HÍFEN, não underscore (ex. `http://espectro-mvp-iris-asr:8080/transcrever`; ver §1.5) | **sim** com `ASR_PROVIDER=self-hosted` |
| `ASR_SERVICE_TOKEN`      | Bearer enviado; tem que ser idêntico ao do serviço                                                                                                       | sim                                    |
| `ASR_SERVICE_TIMEOUT_MS` | Timeout do POST, default `120000`                                                                                                                        | não                                    |

`ASR_SERVICE_URL` ausente faz `SelfHostedAsrProvider` lançar — nunca aponte
para o domínio público do serviço: áudio clínico não atravessa a internet
(R11, e ver pendência do §5).

O default de `ASR_SERVICE_TIMEOUT_MS` **cita o §2 abaixo**: a mediana medida é
43,31s, então 120000 ms dá ~2,8x de folga. Não baixar para perto da mediana —
o abort do cliente não chega ao servidor (`servidor.py` segura o semáforo
`_vagas` até o fim da transcrição e só o libera no `finally`, antes do
`_responder`), então cada timeout prematuro deixa uma das
`ASR_MAX_CONCORRENTES` vagas ocupada por trabalho abandonado e empurra todo o
resto para `503`.

### 1.2 Papel de banco do worker (`ASR_WORKER_DATABASE_URL`, #494/T18)

A rota `/api/internal/jobs/asr-transcrever` **não usa mais** a `DATABASE_URL` da
app. Ela abre um pool próprio (`asrWorkerDb`, `src/db/client.ts`) sob uma role
membro de `iris_asr_worker` — role `NOLOGIN` criada pela migração
`0140_asr_worker_role.sql`.

**Por quê:** `app_asr_reservar` devolve `clinic_id` + a chave do objeto de áudio
de **outras clínicas**, e `app_asr_concluir(uuid, text)` escreve texto arbitrário
na linha de qualquer clínica. Enquanto o `EXECUTE` estava em `app_role` (o papel
de toda requisição web logada), a fronteira era uma promessa da camada de app.
A `0140` revoga de `app_role` — agora quem chamar de lá recebe `42501`.

Provisionar **uma vez**, conectado como dono do banco:

```sql
CREATE ROLE iris_asr_worker_login LOGIN PASSWORD '<gerar com openssl rand -hex 32>'
  IN ROLE iris_asr_worker;
```

Depois apontar `ASR_WORKER_DATABASE_URL` para ela no ambiente da **app** (não do
`iris-asr`) e **Implantar** (memória `easypanel-ambiente-expoe-segredos`: salvar
env não aplica). Sem a variável a rota recusa rodar — não há fallback para
`DATABASE_URL`.

Conferir **medindo**, não lendo:

```sql
SELECT has_function_privilege('app_role','app_asr_reservar(integer)','EXECUTE');        -- esperado: f
SELECT has_function_privilege('iris_asr_worker','app_asr_reservar(integer)','EXECUTE'); -- esperado: t
SELECT has_function_privilege('app_role','app_asr_objetos_em_uso(text[],interval)','EXECUTE'); -- esperado: t (o sweeper depende)
-- A sobrecarga de 1 argumento foi DERRUBADA na 0155. Se esta consulta der erro
-- de "function does not exist", a 0155 nao rodou; se ela responder `t`, alguem
-- a recriou — e a versao de 1 argumento apaga audio em resgate.
SELECT to_regprocedure('app_asr_objetos_em_uso(text[])') IS NULL;                -- esperado: t
```

### 1.3 Fila que não drena e áudio retido (#494/T19)

Duas travas foram acrescentadas porque `503` do `iris-asr` é o **regime normal**
sob fila cheia, não uma anomalia — o cliente do disparo aborta em 120s e um tick
cheio pode levar ~215s (§2), então o laço dispara de novo contra um tick vivo:

- **Teto de reversões por clipe** (`audio_capture.reversoes`, migração `0141`).
  `app_asr_falhar(id, true)` devolvia o clipe à fila ignorando o teto de
  tentativas; sem contador próprio isso não tinha fim, e `app_asr_objetos_em_uso`
  mantinha o áudio vivo no bucket indefinidamente (R11 violado sem limite).
  Passadas 10 reversões, o clipe passa a gastar tentativa e termina em `falhou`.
- **Backstop de idade da linha** (`app_asr_expirar_presos`, `0141`), chamado no
  início de cada tick com 6h — a mesma régua do sweeper de objetos. Linha presa
  em `na_fila`/`transcrevendo` além disso vira `falhou`. **Desde a `0155` ela
  NÃO solta mais o `objeto_ref`**: a linha passa a `falhou` com `falhou_em`
  carimbado e entra na janela de resgate (§1.4) — quem solta a referência, no
  fim da janela, é `app_asr_expirar_resgate`.

### 1.4 Janela de resgate do áudio (`0155`)

**O defeito que ela conserta.** Até a `0155`, `app_asr_falhar` zerava
`objeto_ref` no teto de 3 tentativas. Sem a referência,
`app_asr_objetos_em_uso` deixava de reivindicar a chave e o `finally` do worker
chamava `apagar()`: o áudio saía do MinIO **no mesmo tick da terceira falha**.
A UI só sabe reenviar a partir do blob local (IndexedDB, TTL 24h, purgado no
sign-out), então passada essa janela a única saída oferecida à terapeuta era
"digite o trecho à mão no diário". Falha de IA destruía documento clínico.

**Como funciona.** O desfecho definitivo preserva `objeto_ref` e carimba
`falhou_em`. Enquanto `now() - falhou_em < ASR_RESGATE_DIAS` (default 30):

- `app_asr_objetos_em_uso` reivindica a chave — o `finally` do worker não apaga
  e o **sweeper de órfãos preserva** o objeto;
- a UI oferece o reenvio pelo servidor (`reenviarClipesFalhosDoServidor`), que
  devolve a linha a `na_fila` com `tentativas = 0` reusando o MESMO áudio.

Vencida a janela, `app_asr_expirar_resgate` (chamada no início de cada tick,
ao lado do backstop) zera `objeto_ref` e o sweeper recolhe o objeto no ciclo
seguinte. **É essa metade que impede a janela de virar retenção indefinida** —
o bucket efêmero não tem expurgo LGPD, então áudio preservado para sempre seria
dado de paciente fora de todo wiring de retenção.

`ASR_RESGATE_DIAS` é lida pelo **app E pelo serviço do sweeper**; configure nos
dois (memória `env-compartilhada-so-no-servico-alvo`).

Quantos clipes estão em resgate agora, e quanto falta para cada um vencer:

```sql
SELECT clinic_id,
       count(*)                                   AS em_resgate,
       min(falhou_em) AS mais_antigo,
       min(falhou_em) + interval '30 days' - now() AS vence_em
  FROM audio_capture
 WHERE asr_status = 'falhou' AND objeto_ref IS NOT NULL
 GROUP BY clinic_id;
```

Se `em_resgate` só cresce, a terapeuta não está encontrando o botão de reenvio
— é problema de UI, não de fila. Se ele fica em zero mesmo com `falhou`
acumulando, confira que a `0155` rodou: `falhou_em IS NULL` em linha `falhou` é
o carimbo de uma falha ANTERIOR à migração, e essas linhas não entram no
resgate de propósito (o objeto delas já foi apagado pelo comportamento antigo).

Diagnóstico rápido de fila represada:

```sql
SELECT asr_status, count(*), max(reversoes), min(criado_em)
  FROM audio_capture GROUP BY 1 ORDER BY 1;
```

`max(reversoes)` colado em 10 = o serviço ASR está saturado de forma sustentada
(subir `ASR_MAX_CONCORRENTES` ou afrouxar `CRON_TICK_ASR` em
`src/lib/queue/config.ts`), não um
defeito dos clipes.

O laço `infra/asr/agendador.sh` também ganhou guarda de instância única
(lockfile por `mkdir` em `${ASR_HEARTBEAT_DIR}/.agendador-asr.lock`). Ela cobre
apenas um segundo agendador **dentro do mesmo container**; a sobreposição via
timeout de cliente é fechada pelas duas travas de banco acima, não por ela. Lock
órfão de container morto é recuperado sozinho (o PID é conferido com `kill -0`).

### 1.5 Host interno: hífen, nunca underscore (#500)

> **[x] CONFIRMADO — medido em produção ao provisionar #500, 31/08/2026.**
> MinIO devolve `400 InvalidRequest` ("not a valid hostname") quando o `Host`
> do endpoint tem `_` — o Docker Swarm do Easypanel nomeia os serviços com
> underscore (`espectro-mvp_iris-minio`, `espectro-mvp_iris-asr`), e é esse
> literal que aparece pré-preenchido no painel. **Sempre trocar por hífen**
> antes de colar em `ASR_S3_ENDPOINT`/`ASR_SERVICE_URL`: o Swarm registra os
> dois nomes para o MESMO serviço (`getent hosts` resolve ambos para o mesmo
> IP), então a troca é só de string, não de infraestrutura.
>
> **Por que só apareceu agora:** `mc` (o cliente MinIO) e o driver do
> Postgres não validam o formato do `Host` da mesma forma — por isso
> `DATABASE_URL`/`ASR_WORKER_DATABASE_URL`/`ASR_SWEEPER_DATABASE_URL` com
> underscore funcionam sem problema, e um `mc ls` manual contra o mesmo
> bucket, com as mesmas credenciais, não reproduzia o defeito. O bug é
> específico do parser de `Host` do MinIO sobre HTTP/S3, e só apareceu
> quando o `@aws-sdk/client-s3` do Node tentou o primeiro `ListObjectsV2`
> de verdade (o sweeper, T15/#500).
>
> **Como confirmar depois de mudar:** o log do `asr-sweeper` deve trocar de
> `ATENÇÃO: varredura FALHOU` para `varredura concluída: N objeto(s)
inspecionado(s)`. `Resource: '/iris-asr-efemero/'` no erro antigo era só o
> caminho da requisição — a causa estava no cabeçalho `Host`, não no bucket
> nem nas credenciais.

## 2. Benchmark — small vs medium (T06)

> **[x] CONFIRMADO — medido de verdade no serviço `iris-asr` implantado no
> Easypanel (VPS Hostinger, 4 vCPU / 16 GB, sem GPU), 30/08/2026.** Memória
> `verificar-fato-de-infra-com-medicao`. Clipe: 134,6s (~2min14s) de áudio
> PT-BR clínico sintético (TTS `pt-BR-FranciscaNeural`, texto de nota de
> sessão plausível — não gravação real; o número mede throughput de CPU, que
> independe do conteúdo). 3 execuções por modelo via `POST /transcrever`
> através do domínio público temporário do serviço, medindo o request
> completo (rede + fila + inferência).

| Modelo   | Tempo (mediana, 3 execuções)       | Razão p/ duração do clipe | RAM observada (container) | Decisão       |
| -------- | ---------------------------------- | ------------------------- | ------------------------- | ------------- |
| `small`  | 43,31s (43,17 / 43,31 / 46,13)     | 0,32x                     | ~423 MB                   | **Escolhido** |
| `medium` | 104,29s (104,22 / 104,29 / 106,06) | 0,77x                     | ~1,2 GB                   | Descartado    |

**Decisão: `small`.** Ambos processam mais rápido que a duração do áudio
(folga pra fila), mas `medium` usa 2,4x mais tempo de CPU por clipe — numa
VPS de 4 vCPU compartilhada com todos os outros serviços do Iris (billing,
escalonamento, retenção, app, Postgres...), essa folga desaparece rápido sob
concorrência real. `small` deixa margem pra processar múltiplos clipes em
fila sem competir por toda a CPU da VPS. **Proposta de arquitetura — validar
com Rômulo antes de fechar T08** (regra do CLAUDE.md: decisão nova de
arquitetura marca como pendente).

O tick do agendador (T08) e o teto de concorrência **citam este número**:
com small em 0,32x tempo real, um teto de concorrência de 2-3 clipes
simultâneos ainda deixa a fila drenar mais rápido que ela enche num fluxo
de ditado normal (clipes gravados em tempo real pelo terapeuta).

## 3. Prova de boot sem rede

`Dockerfile` tem uma camada `RUN --network=none` que recarrega o modelo do
cache da imagem sem acesso à rede. Se o build passar por essa camada, o boot
em produção não depende do HuggingFace Hub estar no ar.

A prova é a camada, **não o build inteiro**: `docker build --network=none` no
build completo falha em `apt-get`/`pip`, que precisam de rede legitimamente. O
build normal já executa a camada isolada e é ela que prova o ponto.

Confirmar manualmente, se necessário:

```bash
# Build normal: a camada `RUN --network=none` do final roda dentro dele.
docker build --no-cache -f infra/asr/Dockerfile -t iris-asr:prova .

# Prova independente, no container pronto: carregar o modelo sem rede nenhuma.
docker run --rm --network=none iris-asr:prova   python -c "import os; from faster_whisper import WhisperModel;              WhisperModel(os.environ['ASR_MODEL_SIZE'], device='cpu', compute_type='int8');              print('modelo carregado sem rede')"
```

## 4. Incidentes

| Sintoma                                                       | Causa provável                                                                                                            | Ação                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/saude` não responde                                         | Container não subiu — checar log de boot, modelo pode ter falhado ao carregar                                             | Reimplantar; se persistir, checar RAM disponível na VPS                        |
| `401` em todo `/transcrever`                                  | `ASR_SERVICE_TOKEN` ausente/divergente entre app e serviço                                                                | Conferir env dos dois lados no Easypanel                                       |
| `/transcrever` lento além do medido no §2                     | VPS sob carga concorrente (outro serviço competindo por CPU)                                                              | Checar uso de CPU da VPS; considerar reduzir teto de concorrência do agendador |
| Container em crashloop com `ASR_SERVICE_TOKEN ausente` no log | Env não aplicada no Easypanel (salvar env não implanta — memória `easypanel-ambiente-expoe-segredos`)                     | Preencher a env e clicar **Implantar**                                         |
| `503` recorrente no worker                                    | `ASR_MAX_CONCORRENTES` menor que o teto do agendador (T08)                                                                | Alinhar os dois tetos; o do serviço tem que ser >= o do agendador              |
| Boot falha com `LocalEntryNotFoundError`                      | `ASR_MODEL_SIZE` do runtime diverge do `ARG` usado no build — modelo não está no cache e `HF_HUB_OFFLINE=1` proíbe baixar | Rebuild com o `ARG` certo, ou corrigir a env para o modelo que está na imagem  |

## 5. Pendências

- [ ] **Confirmar que o domínio público temporário do serviço foi removido.** O
      benchmark do §2 rodou através dele; enquanto existir, `iris-asr` está
      alcançável da internet, o que contraria R11 (áudio clínico não atravessa
      a internet). O áudio do benchmark era sintético — nenhum dado de paciente
      passou por ali —, mas a exposição tem que acabar antes de T07. Verificar
      medindo (`curl` do domínio de fora), não pelo painel.
      **Vira pré-requisito bloqueante do smoke da #500** (§6.1, item 4): o
      benchmark levou áudio sintético por ali, o smoke leva áudio real.

## 6. Smoke de produção do ditado de voz (#500)

> **Estado:** procedimento escrito e revisado contra `main` em **07/09/2026**;
> **NÃO executado**. Nenhum `[x] CONFIRMADO` aqui — quem executar carimba o
> resultado no `BACKLOG.md` (§6.6), como manda `verificar-fato-de-infra-com-medicao`.

O provisionamento da #500 (role do worker, `asr-agendador`, `asr-sweeper`,
`iris-asr`) foi fechado em 31/08/2026. O que sobrou é o único item que
`"ok":true` no heartbeat não prova: **áudio real atravessando bucket →
`iris-asr` → banco → UI**. Este é o passo a passo dele.

### 6.0 O que envelheceu no enunciado da #500

Auditado contra `main` antes de escrever o procedimento — três itens do corpo
da issue descrevem um repositório que não existe mais:

| Item da #500                                                   | Situação medida em 07/09/2026                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "revisar `INTERVALO_S` (hoje 20s)"                             | **A env não existe mais.** O laço `while :; do … sleep 20` morreu na D73 (commit `115bc8ce`); quem agenda o tick é o cron do pg-boss, `CRON_TICK_ASR = "* * * * *"` em `src/lib/queue/config.ts`. O `INTERVALO_S` que sobra em `infra/asr/` é o do **sweeper de órfãos** (default 3600 s) — outro botão, outra pergunta. Ver §6.6. |
| "Fora de escopo: **D71** continua aberto"                      | **D71 fechado em 05/09/2026** — `audio_capture.mime_type` (migração `0155`) carrega o mime real até o POST de transcrição. iOS/Safari deixou de ser pré-requisito separado.                                                                                                                                                        |
| "heartbeat **avançando**"                                      | Desde a #536 o sinal de vida **não é mais arquivo em `/heartbeat`** — é a linha `job_heartbeat` no banco, escrita pela ROTA. No container só mora o lockfile. A query está no passo 3 do §6.1.                                                                                                                                     |
| "`FEATURE_FLAG_ASR_ENABLED` continua `false`" (corpo da issue) | **Está `true` em produção**, medido em 07/09/2026. O ditado já está oferecido às clínicas ativas — o que nunca aconteceu é um clipe ser transcrito (§6.1).                                                                                                                                                                         |

### 6.1 Pré-voo — cinco medições ANTES de tocar a flag

> **[x] PRÉ-VOO EXECUTADO — medido no painel de produção em 07/09/2026, ~21:10 BRT.**
> Os cinco itens abaixo passaram. **O que falta da #500 é só a gravação** — todo
> o resto do pré-voo está verde e não precisa ser refeito, a menos que algo
> tenha sido reimplantado depois desta data.
>
> | #   | O que foi medido                         | Resultado                                                                                                                                                                      |
> | --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | 1   | `ASR_PROVIDER` na env do `App`           | `self-hosted` ✅ — e **`FEATURE_FLAG_ASR_ENABLED` já está `true`** (ver §6.2, passo 1: o passo virou conferência, não ação)                                                    |
> | 2   | Grants (as quatro consultas do §1.2)     | `f` / `t` / `t` / `t` ✅ — `0140` e `0155` aplicadas                                                                                                                           |
> | 3   | `job_heartbeat` de `asr` e `asr-sweeper` | `asr` com **21 s** de idade, `asr-sweeper` com 2 min 45 s, `ultimo_erro` nulo nos dois ✅ — ticks saindo                                                                       |
> | 4   | Domínio público temporário do `iris-asr` | aba `Domínios` **vazia** ✅ — a pendência do §5 está fechada; e o serviço está de pé (323 MB, log `Serviço ASR de pé na porta 8080 (modelo=small, idioma=pt, concorrentes=2)`) |
> | 5   | Alcance da flag global                   | **8 clínicas, 2 ativas nos últimos 7 dias, 28 sessões, 32 usuários** — com a flag já ligada, o ditado já está oferecido a essas clínicas                                       |
>
> **O que a mesma passada revelou sobre a fila**, e que muda o enunciado da
> #500: `audio_capture` tinha **uma única linha em toda a produção** — a do
> incidente #604 (criada 31/08 23:24, `falhou`, `tentativas=0`, `reversoes=0`,
> assinatura do backstop de idade). **Zero clipes `transcrito`, nunca.** E o
> áudio dela **não é resgatável**: `objeto_ref` e `falhou_em` estão nulos
> porque a linha é ANTERIOR à `0155` — o comportamento antigo já tinha apagado
> o objeto. Não dá para provar o pipeline reenviando essa linha; tem que ser
> clipe novo.
>
> **A pergunta que isso abre** (não é item de infra, é de produto): a flag está
> ligada desde ~31/08, e nesses 7 dias houve **28 sessões e nenhum clipe
> gravado**. Ou as terapeutas não estão encontrando o gravador, ou algo na UI
> não o oferece nas condições reais. Vale medir antes de concluir que "o ditado
> está no ar".

Todas rodam com a flag ainda em `false`. Nenhuma altera dado.

O SQL sai do console do Easypanel: serviço **`iris-postgres` → aba `Bash`**,
depois `psql -U iris -d iris`. A aba **`Postgres Client` não serve** — ela
tenta a role `postgres`, que não existe neste banco; o dono é `iris`
(que, sendo dono, **bypassa RLS** — é por isso que as consultas abaixo
enxergam todas as clínicas).

**1. `ASR_PROVIDER=self-hosted` está na env do serviço `App`?**

Esta é a checagem que impede um smoke **verde e vazio**. `getAsrProvider()`
(`src/lib/asr/provider.ts`) cai no `StubAsrProvider` para qualquer valor
diferente da string exata `self-hosted` — inclusive ausente. O stub não faz
rede, não fala com `iris-asr` e devolve texto determinístico. O clipe
percorreria `na_fila → transcrevendo → transcrito` inteirinho, a UI mostraria
texto, e **nada do pipeline real teria sido exercitado**.

- Onde olhar: `App` → aba `Ambiente`. (Não tire screenshot: o painel mostra
  todo segredo em texto claro sobre HTTP — memória `easypanel-ambiente-expoe-segredos`.)
- Oráculo de fim de linha, no §6.3: transcrição que começa com
  `[transcrição stub —` **é o stub**. Smoke inválido; corrija a env e recomece.

**2. Os grants da role do worker.** As quatro consultas do §1.2 deste runbook,
com os quatro resultados esperados. Elas provam a `0140` e a `0155`.

**3. Os dois agendadores de pé, com heartbeat AVANÇANDO.**

```sql
SELECT job, ultimo_ok, now() - ultimo_ok AS idade, ultimo_erro, detalhe
  FROM job_heartbeat
 WHERE job IN ('asr', 'asr-sweeper');
```

Esperado: `idade` do `asr` **abaixo de 1 min** (o cron é de 1 min; o alarme só
dispara em 30 min — `scripts/alarme-jobs.mjs:353`), e do `asr-sweeper` abaixo
de 1 h. **Rode duas vezes com um minuto de intervalo**: um `ultimo_ok` recente
prova que houve um tick, dois valores DIFERENTES provam que os ticks continuam
saindo. Deploy verde não é serviço no ar
(`job-provisionado-nao-e-job-que-fecha-ciclo`).

**4. O domínio público temporário do `iris-asr` já foi removido?** É a
pendência do §5 e é pré-requisito **desta** etapa, não da anterior: o benchmark
do §2 rodou por ali com áudio sintético, mas o smoke roda com áudio de
verdade, e enquanto o domínio existir R11 está sendo violado. Medir de fora,
com `curl` do domínio, **não pelo painel**.

**5. A flag é GLOBAL — não existe "clínica de teste" no gate.**
`asrHabilitado()` lê `process.env.FEATURE_FLAG_ASR_ENABLED` e mais nada; não há
coluna por clínica, nem allowlist. Ligá-la libera o ditado para **toda clínica
do ambiente**, no mesmo instante. Antes de decidir a janela do smoke, meça
quantas são e quantas estão vivas:

```sql
SELECT count(*) AS clinicas FROM clinic;

SELECT count(DISTINCT clinic_id) AS clinicas_com_sessao_nos_7_dias
  FROM session WHERE criado_em > now() - interval '7 days';
```

Se o segundo número for **0**, o smoke é seguro a qualquer hora. Se for maior
que 0, escolha uma janela fora do horário de atendimento e trate o §6.5
(rollback) como parte do plano, não como plano B.

### 6.2 Execução

1. **A flag.** Em 07/09/2026 ela **já está `true`** em produção (§6.1), então
   este passo é conferência, não ação: abra `App` → `Ambiente` e confirme.
   Se em algum momento ela voltar a `false`, ligar exige `Implantar` — salvar
   env não aplica sozinho. Anote o horário de início: ele é o marco `T0` das
   consultas abaixo.

2. **Gravar o clipe.** Entrar na UI com um usuário de perfil terapeuta da
   clínica escolhida, abrir uma sessão, ir ao passo de documentar e gravar
   **~30 s falando de verdade** (frase corrida, em português). Não use silêncio
   nem ruído: o oráculo do §6.3 é reconhecer as palavras faladas.

3. **Ver a linha nascer e ser promovida.** Rode logo após soltar o botão:

```sql
SELECT id, ordem, asr_status, mime_type, objeto_ref IS NOT NULL AS tem_objeto,
       tentativas, reversoes, criado_em
  FROM audio_capture
 WHERE criado_em > now() - interval '10 minutes'
 ORDER BY criado_em DESC;
```

Esperado: `asr_status = 'na_fila'`, `tem_objeto = t` e `mime_type` preenchido
(`audio/webm;codecs=opus` no Chrome, `audio/mp4` no Safari). `mime_type` nulo
numa linha recém-criada é regressão da `0155` — pare e investigue.
`asr_status` parado em `nao_solicitado` é upload que não confirmou: o blob não
chegou ao MinIO, e o clipe nunca será reservado.

4. **Ver o tick pegar.** O app enfileira o job dentro da mesma transação que
   promove a linha, então **não espere o cron**: em segundos o log do
   `asr-agendador` deve mostrar `queue.asr.tick-iniciando` e, ao fim,
   `queue.asr.tick-concluido` com `processados: 1`. Repetindo a consulta do
   passo 3, o `asr_status` passa por `transcrevendo` e chega a `transcrito`.

   Com o modelo `small` medido no §2 (0,32x tempo real), 30 s de áudio ficam
   em ~10 s de inferência; some fila e rede e espere **até ~1 min**.

5. **Conferir o texto ANTES de aceitar.** Esta ordem importa:

```sql
SELECT asr_status, transcrito_em, left(transcricao_texto, 120) AS trecho
  FROM audio_capture
 WHERE id = 'ID-DO-PASSO-3';
```

`aceitarTranscricaoLote` **apaga `transcricao_texto` no mesmo statement em
que devolve o texto** (T25, R19, decisão C de 31/08/2026 — a transcrição é
efêmera e quem sobrevive é a `session_note`). Se você aceitar primeiro,
esta consulta volta vazia e não dá para distinguir "funcionou e foi
consumido" de "transcreveu vazio".

6. **Aceitar na UI** e confirmar que os parágrafos entram no rascunho da nota
   de sessão. Rodando a consulta do passo 5 de novo, `transcricao_texto` deve
   estar **nulo** — é assim que se prova que o expurgo do aceite funcionou.

### 6.3 Oráculo de aceite

O smoke fecha quando **todos** valem:

- [ ] `mime_type` gravado na linha (não nulo);
- [ ] a linha percorreu `na_fila → transcrevendo → transcrito`, com
      `tentativas = 1` e `reversoes = 0` (mais que isso significa que houve
      recusa do serviço no caminho — anote, não ignore);
- [ ] `transcricao_texto` **contém as palavras que você falou** e **não**
      começa com `[transcrição stub —`;
- [ ] o texto aparece no rascunho da nota na UI;
- [ ] depois do aceite, `transcricao_texto IS NULL`;
- [ ] o objeto sumiu do bucket efêmero — o log do `asr-sweeper` no ciclo
      seguinte não deve reclamar da chave, e não há linha nova em resgate:

```sql
SELECT count(*) FROM audio_capture
 WHERE asr_status = 'falhou' AND objeto_ref IS NOT NULL;
```

### 6.4 Se travar

A tabela de incidentes do §4 cobre o serviço `iris-asr`. O que é específico
deste smoke:

| Sintoma                                                            | Onde olhar                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Texto começa com `[transcrição stub —`                             | `ASR_PROVIDER` não é `self-hosted` no `App` (§6.1, passo 1). Nada do pipeline real rodou.                                                              |
| Linha fica em `nao_solicitado`                                     | Upload ao MinIO não confirmou. `ASR_S3_*` no `App` — e confira o **hífen** no Host (§1.5).                                                             |
| Linha fica em `na_fila`, `tick-concluido` com `processados: 0`     | A reserva não devolveu a linha: ou falta `objeto_ref`, ou o `EXECUTE` da role (§1.2), ou `ASR_WORKER_DATABASE_URL` não foi aplicada com **Implantar**. |
| `reversoes` subindo, `tentativas` parado                           | Recusa de INFRAESTRUTURA classificada como `saturacao` (§0): token divergente, URL errada ou proxy. Não é culpa do clipe — leia o log do `iris-asr`.   |
| `tentativas` chega a 3 e vira `falhou` com `objeto_ref` preservado | Falha de aplicação (408/500). O áudio está na janela de resgate (§1.4) e a UI oferece reenviar — use isso em vez de regravar.                          |
| Nada acontece e o heartbeat `asr` parou de avançar                 | O `asr-agendador` caiu. Log do serviço; depois `job_heartbeat.ultimo_erro`/`detalhe`.                                                                  |

### 6.5 Rollback

`FEATURE_FLAG_ASR_ENABLED=false` + **`Implantar`**. A flag é lida por função a
cada chamada (`src/lib/flags.ts`), então nenhum valor fica congelado no bundle.

O que o rollback **não** desfaz: clipe já em `na_fila` continua sendo
processado pelo worker (a rota do job não consulta a flag — quem consulta é a
ação da UI). Isso é desejado: desligar a flag no meio de um lote não deve
deixar áudio de paciente órfão no bucket. Se precisar drenar antes de
desligar, espere a consulta do passo 3 mostrar `transcrito`/`falhou` para
todas as linhas recentes.

### 6.6 Registrar o resultado — e a pergunta que substitui o `INTERVALO_S`

Escreva no `BACKLOG.md` (seção `🏁 Sessão …`): o que foi medido, com números, e
o horário. Inclusive se falhou — principalmente se falhou.

A revisão de cadência que a #500 pediu como "`INTERVALO_S` (hoje 20s)" precisa
ser **reformulada** antes de ser respondida, porque o botão mudou de natureza
com a D73: o cron **deixou de ser o caminho de latência** (o app enfileira o
tick na própria transação que promove os clipes). O `CRON_TICK_ASR` de 1 min
hoje é rede de segurança, e a única régua real que ele precisa respeitar é
ficar **muito abaixo dos 30 min** do alarme de heartbeat. A pergunta a medir
depois do piloto é outra:

- clipes/dia e clipes por lote observados;
- tempo entre `criado_em` e `transcrito_em` (latência ponta a ponta real);
- quantos ticks fecharam com `processados: 0` (cron girando à toa).

```sql
SELECT date_trunc('day', criado_em) AS dia,
       count(*) AS clipes,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY transcrito_em - criado_em) AS mediana,
       max(transcrito_em - criado_em) AS pior
  FROM audio_capture
 WHERE asr_status = 'transcrito' AND transcrito_em IS NOT NULL
 GROUP BY 1 ORDER BY 1 DESC;
```

Se a mediana ficar bem abaixo de 1 min, o cron está fazendo o que devia (nada,
quase sempre) e não há o que ajustar. Quem precisa de revisão sob volume é o
teto de concorrência do serviço (`ASR_MAX_CONCORRENTES`, §1.3), não a cadência.

#### 6.6.1 O comando que responde tudo isso de uma vez

As consultas acima e as do §6.1 viraram um script — `scripts/medir-adocao-asr.mjs`
—, porque medir isso pelo painel exige um humano colando SQL, e foi exatamente
o que não aconteceu durante os sete dias em que a produção não transcreveu
nada:

```bash
SMOKE_DATABASE_URL='postgres://iris:...@HOST:5432/iris' ALLOW_SEED_REMOTE=true node scripts/medir-adocao-asr.mjs --dias=7
```

Ele imprime, numa passada: clínicas reais vs. demo, sessões criadas, **sessões
documentadas** (as oportunidades reais de ditado), clipes por `asr_status`
separando demo de real, latência `criado_em → transcrito_em` (p50 e máximo),
resgate pendente, idade dos heartbeats, o piso de ticks vazios e um
**veredito**.

Três coisas que ele NÃO faz, de propósito:

| Não faz                                          | Por quê                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Não escreve                                      | A transação roda sob `SET TRANSACTION READ ONLY`. Escrita futura por descuido vira `25006` do Postgres — trava medida em `db/tests/medir-adocao-asr.int.test.ts`, não promessa de docblock. |
| Não lê `FEATURE_FLAG_ASR_ENABLED`/`ASR_PROVIDER` | São env do serviço `App`, não linha de banco. O passo 1 do §6.1 continua sendo no painel — e sem ele os números abaixo não têm interpretação.                                               |
| Não conta o `processados: N`                     | Esse número só existe no LOG da rota. O script publica um **piso** derivado de ticks vazios (`dias × 1440 − clipes`) e diz que é piso.                                                      |

Os vereditos, e o que cada um significa:

- `sem-uso-do-produto` — nenhuma sessão documentada na janela. **Não** conclua
  nada sobre o ditado: sem oportunidade de gravar, zero clipe não é evidência.
  Amplie com `--dias`.
- `gap-de-adocao` — houve sessão documentada e nenhum clipe. Foi este o estado
  de 07/09/2026. O problema é de descoberta/UI, e **nenhum alarme do repo o
  cobre**: `alarme-jobs.mjs`, heartbeat e fila medem saúde de job, e todos
  respondiam `ok` enquanto isso.
- `pipeline-travado` — gravaram e nada transcreveu. Aí sim é infraestrutura:
  triagem no §6.4.
- `em-uso` — há clipe transcrito; a latência impressa responde à pergunta de
  cadência reformulada acima.

Rode-o **antes** do §6.2 (linha de base) e **depois** (prova de que o clipe do
smoke atravessou). A diferença entre as duas execuções é o registro que o §6.6
pede.
