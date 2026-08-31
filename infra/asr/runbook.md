# Runbook — Serviço ASR self-hosted (Iris, #72)

> Escopo: serviço `iris-asr` (faster-whisper), container Python interno ao
> Swarm do Easypanel. Sem GPU, VPS Hostinger (4 vCPU / 16 GB).

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

| Variável                 | Papel                                                                                                                  | Obrigatória                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `ASR_SERVICE_URL`        | URL completa da rota `/transcrever` no host **interno** do Swarm (ex. `http://espectro-mvp_iris-asr:8000/transcrever`) | **sim** com `ASR_PROVIDER=self-hosted` |
| `ASR_SERVICE_TOKEN`      | Bearer enviado; tem que ser idêntico ao do serviço                                                                     | sim                                    |
| `ASR_SERVICE_TIMEOUT_MS` | Timeout do POST, default `120000`                                                                                      | não                                    |

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
