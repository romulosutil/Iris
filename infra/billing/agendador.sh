#!/usr/bin/env bash
# agendador.sh — laço do job de fechamento de ciclo de faturamento (#36).
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Mesma escolha do motor de escalonamento (infra/escalonamento/agendador.sh):
# lógica de laço inline no painel vira conhecimento tribal fora do repo, crontab
# no SO do VPS idem e ainda some dos logs do painel — então: script versionado,
# com o painel só apontando `Comando = /app/agendador.sh`.
#
# Env:
#   INTERVALO_S        segundos entre disparos. Default 3600.
#   BILLING_JOB_URL    rota interna do Next que faz a apuração de verdade.
#   BILLING_JOB_TOKEN  segredo do disparo. NUNCA logado por este script.
#   BILLING_HEARTBEAT_DIR  default /heartbeat.
#
# POR QUE 3600s E NÃO 60s COMO O ESCALONAMENTO: aqui não há prazo clínico. A
# apuração roda 3 DIAS antes da renovação do ciclo, então a janela útil é de
# dias — de hora em hora já é folgado, e o disparo é idempotente do lado da
# rota (que só fecha ciclo ainda aberto). Um tick de 1 minuto só geraria 60x
# mais POST sem fechar nada.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-billing] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-3600}"
readonly HEARTBEAT_DIR="${BILLING_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/fechamento-ciclo-billing.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

# Validado ANTES do laço, não dentro: sem env o job falha em 100% dos ticks, e
# um laço que falha para sempre é ruído que esconde a falha real. Só o NOME da
# variável ausente aparece — nunca o valor.
faltando=()
[[ -n "${BILLING_JOB_URL:-}" ]] || faltando+=("BILLING_JOB_URL")
[[ -n "${BILLING_JOB_TOKEN:-}" ]] || faltando+=("BILLING_JOB_TOKEN")
if [[ ${#faltando[@]} -gt 0 ]]; then
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando[*]}"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultimo-fechamento"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (deploy do app,
	# rede, 502 do proxy) desligaria o faturamento para SEMPRE, e faturamento
	# desligado é indistinguível de "nenhum ciclo venceu" — falha silenciosa.
	#
	# Quem percebe a parada NÃO é este log: é o heartbeat abaixo, que só avança
	# em disparo bem-sucedido. Enquanto os disparos falham, `.ultimo-fechamento`
	# congela e o monitor externo dispara. Este log só explica o porquê depois.
	saida=0
	node "${SCRIPT}" --once || saida=$?

	if [[ "${saida}" -eq 0 ]]; then
		date -u '+%Y-%m-%dT%H:%M:%SZ' >"${HEARTBEAT_DIR}/.ultimo-fechamento"
		if [[ "${falhas_seguidas}" -gt 0 ]]; then
			log "recuperado após ${falhas_seguidas} falha(s) seguida(s)."
		fi
		falhas_seguidas=0
	else
		falhas_seguidas=$((falhas_seguidas + 1))
		log "ATENÇÃO: disparo de fechamento FALHOU (exit ${saida}) — ${falhas_seguidas} falha(s) seguida(s)."
		log "ATENÇÃO: enquanto isso durar, ciclo de faturamento vencido NÃO está sendo fechado."
		log "ATENÇÃO: o heartbeat parou de avançar. A causa REAL (status HTTP e corpo"
		log "ATENÇÃO: recebido, ou erro de rede/timeout) está na linha JSON e no stderr acima."
	fi

	sleep "${INTERVALO_S}"
done
