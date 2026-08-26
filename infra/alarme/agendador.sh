#!/usr/bin/env bash
# agendador.sh — laço do detector de alarme automático de jobs de infra (#294).
#
# Mesmo desenho de infra/escalonamento/agendador.sh: o Easypanel (v2.31.0) não
# tem cron para serviço de app, então o laço vive aqui, versionado.
#
# Env:
#   INTERVALO_S            segundos entre varreduras. Default 3600 (as três
#                          checagens são de efeito, não de prazo clínico —
#                          uma hora de atraso não muda o diagnóstico).
#   ALARME_DATABASE_URL    role de login que herda iris_alarme.
#   ALARME_HEARTBEAT_DIR   default /heartbeat.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-alarme] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-3600}"
readonly HEARTBEAT_DIR="${ALARME_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/alarme-jobs.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

if [[ -z "${ALARME_DATABASE_URL:-}" ]]; then
	log "ERRO: variável de ambiente ausente: ALARME_DATABASE_URL"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultima-verificacao"

falhas_seguidas=0

while :; do
	saida=0
	node "${SCRIPT}" || saida=$?

	if [[ "${saida}" -eq 0 ]]; then
		if [[ "${falhas_seguidas}" -gt 0 ]]; then
			log "recuperado após ${falhas_seguidas} falha(s) seguida(s)."
		fi
		falhas_seguidas=0
	else
		falhas_seguidas=$((falhas_seguidas + 1))
		log "ATENÇÃO: o detector não conseguiu cumprir o papel dele (exit ${saida}) — ${falhas_seguidas} vez(es) seguida(s)."
		log "ATENÇÃO: exit 1 aqui NÃO significa 'job de infra parado' — significa que o alarme não conseguiu avisar. O detalhe está nas linhas acima desta."
	fi

	sleep "${INTERVALO_S}"
done
