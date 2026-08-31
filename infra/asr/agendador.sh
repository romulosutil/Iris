#!/usr/bin/env bash
# agendador.sh — laço do worker de transcrição de ditado de voz (#72).
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Mesma escolha de infra/retencao/agendador.sh, infra/billing/agendador.sh e
# infra/escalonamento/agendador.sh: script versionado, painel só aponta
# Comando = `/app/agendador.sh`, e o container fica de pé dormindo entre ticks.
#
# GATILHO MAGRO (T08), NÃO O WORKER: este laço só dispara um POST em
# `ASR_JOB_URL` (rota interna do Next, T07) — reserva de lote, download do
# bucket efêmero, chamada ao serviço `iris-asr` e conclusão/falha moram
# INTEIRAMENTE do lado do app, em `src/app/api/internal/jobs/asr-transcrever/
# route.ts`. Mesmo desenho de infra/billing/agendador.sh e pelo mesmo motivo
# do #156: a imagem deste job não herda o `node_modules` do app, e duplicar a
# chamada ao provider ASR aqui seria a mesma classe de bug — só que perdendo
# áudio clínico em vez de gerando cobrança errada.
#
# Env:
#   INTERVALO_S          segundos entre disparos. Default 20 — ver nota abaixo.
#   ASR_JOB_URL           rota interna do Next que reserva e processa o lote.
#   ASR_JOB_TOKEN         segredo do disparo. NUNCA logado por este script.
#   ASR_HEARTBEAT_DIR     default /heartbeat.
#
# ⚠️ POR QUE O TICK NÃO ESTÁ "CONFIRMADO" — só RACIOCINADO (memória
# `verificar-fato-de-infra-com-medicao`: nunca marcar fato de infra como
# CONFIRMADO sem medição).
#
# O QUE JÁ FOI MEDIDO (T06, runbook.md §2, real, no serviço `iris-asr` na VPS,
# 30/08/2026): o modelo `small` transcreve um clipe de ~2min14s em mediana de
# 43,31s — 0,32x a duração real. Isso mede o CUSTO DE UM CLIPE ISOLADO.
#
# O QUE **NÃO** FOI MEDIDO: o comportamento da FILA sob concorrência real de
# várias clínicas ditando ao mesmo tempo, que é o que realmente determina o
# tick certo deste agendador. A rota de T07 processa até 5 clipes por tick
# (LOTE_PADRAO, sequencial) — um lote cheio no modelo `small` pode legitimamente
# levar ~5×43s ≈ 215s para responder, então o INTERVALO_S abaixo governa só o
# intervalo ENTRE ticks quando a fila já drenou, não o tempo de um tick cheio.
#
# `INTERVALO_S=20` é um PLACEHOLDER RACIOCINADO, não medido sob carga: curto o
# bastante para não represar ditado em tempo real quando a fila está vazia
# (R1: clipes de até 2min, UX de ditado espera retorno em escala de segundos,
# não minutos), longo o bastante para não martelar a rota/banco a cada
# segundo. ESTE VALOR PRECISA SER REVISTO com observação real de produção
# (volume de clipes/dia, tempo de fila observado no painel) antes do piloto
# com clínica real — não é decisão de arquitetura fechada, é chute informado.
# Registrar a revisão no BACKLOG.md quando acontecer.
#
# POR QUE NÃO HÁ MARCADOR DE IDEMPOTÊNCIA: a chamada é idempotente por
# natureza — `app_asr_reservar` (T02) já é o mecanismo de exclusão mútua da
# fila (SELECT ... FOR UPDATE SKIP LOCKED, mesma família de app_billing_*).
# Rodar dois ticks sobrepostos não duplica transcrição: o segundo tick reserva
# só o que o primeiro não pegou.
#
# ⚠️ SOBREPOSIÇÃO DE TICKS É REAL — E O LOCKFILE ABAIXO **NÃO** É O QUE A
# RESOLVE (#494/T19). Registrado aqui porque o comentário da migração
# `0136:130-134` afirmava o contrário ("com o teto de concorrência do serviço >=
# o teto do agendador, 503 é anomalia") e essa afirmação não se sustenta:
#
#   1. Este laço É serial dentro do container — ele espera o `node --once`
#      terminar antes de dormir. Até aí, sem sobreposição.
#   2. Mas o cliente do disparo aborta em 120s (`timeoutMs` em
#      `scripts/disparo-asr-transcrever.mjs`) e um tick CHEIO do lado do
#      servidor pode levar ~215s (5 clipes × ~43s medidos, §2 do runbook). O
#      `AbortSignal` derruba a conexão do CLIENTE; a rota do Next segue
#      processando. O laço dorme 20s e dispara de novo contra um tick vivo.
#   3. Logo, sob fila cheia, `503` do `iris-asr` (teto `ASR_MAX_CONCORRENTES`)
#      é o REGIME NORMAL, não anomalia.
#
# Nenhum lockfile deste script alcança (2): quando o guard é liberado, o
# processo local já morreu — o que continua vivo é o tick do OUTRO lado do HTTP.
# O que fecha o laço é do lado do banco (migração 0141): teto de reversões por
# clipe em `app_asr_falhar(id, true)` + backstop de idade da linha
# (`app_asr_expirar_presos`, chamado no início de cada tick pela rota). O guard
# abaixo cobre só o que ele consegue cobrir de fato: um SEGUNDO agendador dentro
# do mesmo container (`docker exec` manual durante uma investigação, campo
# Comando duplicado no painel) — barato, e sem ele um operador consegue dobrar a
# carga sobre o serviço ASR sem perceber.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-asr] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-20}"
readonly HEARTBEAT_DIR="${ASR_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/disparo-asr-transcrever.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

# Validado ANTES do laço, não dentro (mesma disciplina dos demais agendadores
# deste repo): sem env o job falha em 100% dos ticks, e um laço que falha para
# sempre é ruído que esconde a falha real. Só o NOME da variável ausente
# aparece — nunca o valor, que é credencial.
faltando=()
[[ -n "${ASR_JOB_URL:-}" ]] || faltando+=("ASR_JOB_URL")
[[ -n "${ASR_JOB_TOKEN:-}" ]] || faltando+=("ASR_JOB_TOKEN")
if [[ ${#faltando[@]} -gt 0 ]]; then
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando[*]}"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

# ─── Guarda de instância única (ver bloco ⚠️ no topo sobre o que ela NÃO cobre) ─
#
# `mkdir` e não `flock`: `mkdir` é atômico em qualquer filesystem e é builtin do
# coreutils/busybox que a imagem já tem garantidamente. `flock` é applet
# opcional do busybox nesta alpine — depender dele seria a mesma classe de bug
# das memórias `imagem-escalonamento-nao-herda-app` e `carga-nao-cobre-import-
# dinamico`: falta silenciosa numa imagem que sobe verde.
#
# Lock ENVELHECIDO é recuperado, não respeitado: um container morto por OOM
# deixa o diretório para trás, e um guard que respeita lock de dono morto
# desliga a transcrição para sempre — que é exatamente o modo de falha que este
# laço inteiro existe para evitar. Por isso o PID é gravado e conferido.
readonly LOCK_DIR="${HEARTBEAT_DIR}/.agendador-asr.lock"

if ! mkdir -- "${LOCK_DIR}" 2>/dev/null; then
	dono="$(cat -- "${LOCK_DIR}/pid" 2>/dev/null || true)"
	if [[ -n "${dono}" ]] && kill -0 "${dono}" 2>/dev/null; then
		log "ERRO: já existe um agendador de ASR vivo neste container (pid ${dono}). Não subindo um segundo — dois laços dobrariam a carga sobre o serviço iris-asr sem aparecer em lugar nenhum."
		exit 1
	fi
	log "ATENÇÃO: lock órfão em ${LOCK_DIR} (dono='${dono:-desconhecido}' não está vivo) — provável container morto no meio de um tick. Retomando."
	rm -rf -- "${LOCK_DIR}"
	mkdir -- "${LOCK_DIR}"
fi
printf '%s\n' "$$" >"${LOCK_DIR}/pid"

# `INT TERM` explícitos além de `EXIT`: bash NÃO roda o trap de EXIT quando o
# processo morre por sinal não capturado, e `docker stop` manda SIGTERM. Sem
# eles todo restart do serviço deixaria lock órfão e todo boot pagaria o caminho
# de recuperação acima. `exit 143` = 128+SIGTERM, o código que o supervisor
# espera de uma parada limpa.
trap 'rm -rf -- "${LOCK_DIR}"' EXIT
trap 'rm -rf -- "${LOCK_DIR}"; exit 143' INT TERM

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultimo-disparo-asr · lock=${LOCK_DIR}"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (deploy do
	# app, rede, 502 do proxy, serviço iris-asr reiniciando) desligaria a
	# transcrição de ditado para SEMPRE, e ditado desligado é indistinguível de
	# "ninguém gravou nada" na UI — a terapeuta descobre só quando o texto
	# nunca chega.
	#
	# Quem percebe a parada NÃO é este log: é o heartbeat, escrito só em
	# disparo bem-sucedido. Enquanto os disparos falham, `.ultimo-disparo-asr`
	# para de avançar e o monitor externo (ver infra/README.md) dispara. Este
	# log só explica o porquê depois.
	saida=0
	node "${SCRIPT}" --once || saida=$?

	if [[ "${saida}" -eq 0 ]]; then
		date -u '+%Y-%m-%dT%H:%M:%SZ' >"${HEARTBEAT_DIR}/.ultimo-disparo-asr"
		if [[ "${falhas_seguidas}" -gt 0 ]]; then
			log "recuperado após ${falhas_seguidas} falha(s) seguida(s)."
		fi
		falhas_seguidas=0
	else
		falhas_seguidas=$((falhas_seguidas + 1))
		log "ATENÇÃO: disparo de transcrição FALHOU (exit ${saida}) — ${falhas_seguidas} falha(s) seguida(s)."
		log "ATENÇÃO: enquanto isso durar, NENHUM clipe de ditado é transcrito — a fila só cresce."
		log "ATENÇÃO: o heartbeat parou de avançar. Ver §Worker de transcrição em infra/README.md."
		log "ATENÇÃO: a causa REAL (status HTTP e corpo recebido, ou erro de rede/timeout) está na"
		log "ATENÇÃO: linha JSON e no stderr acima desta."
	fi

	sleep "${INTERVALO_S}"
done
