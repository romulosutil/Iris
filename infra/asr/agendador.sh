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

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultimo-disparo-asr"

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
