#!/usr/bin/env bash
# scheduler.sh — laço de agendamento do backup.
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Não há campo "Schedule", não existe tipo de serviço "Cron", e o backup nativo
# do serviço Postgres é manual (e faria `pg_dump` sem globals — o furo que a
# #85 corrigiu). As alternativas eram:
#
#   a) lógica de laço inline no campo "Comando" do painel  -> conhecimento
#      tribal fora do repo, exatamente o que a Etapa 0 da #75 combateu;
#   b) crontab no SO do VPS                                -> idem, e fora dos
#      logs do painel;
#   c) este script, versionado, com o painel só apontando  -> escolhido.
#
# O serviço roda com Comando = `/app/scheduler.sh`. O container fica de pé
# dormindo (alguns MB de RSS, 0% de CPU) e acorda no horário.
#
# Env (além das do backup.sh):
#   BACKUP_AT_HOUR_UTC  hora UTC do backup, 0-23. Default 6 (= 03:00 em
#                       Brasília, UTC-3 sem horário de verão desde 2019).
#   CHECK_INTERVAL_S    de quanto em quanto tempo reavalia. Default 600.
#
# Idempotência: marca `.ultimo-backup-YYYY-MM-DD` em BACKUP_DIR e nunca roda
# duas vezes no mesmo dia UTC. É isso que permite reavaliar a cada 10min sem
# depender de acordar no minuto exato — e o que evita um restart do container
# (deploy, OOM, reboot do VPS) disparar um backup extra a cada volta.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[scheduler] %s\n' "$*"; }

readonly BACKUP_DIR="${BACKUP_DIR:-/backups}"
readonly BACKUP_AT_HOUR_UTC="${BACKUP_AT_HOUR_UTC:-6}"
readonly CHECK_INTERVAL_S="${CHECK_INTERVAL_S:-600}"
readonly BACKUP_SCRIPT="/app/backup.sh"

if ! [[ "${BACKUP_AT_HOUR_UTC}" =~ ^([0-9]|1[0-9]|2[0-3])$ ]]; then
	log "ERRO: BACKUP_AT_HOUR_UTC precisa ser 0-23, recebido: ${BACKUP_AT_HOUR_UTC}"
	exit 1
fi

mkdir -p -- "${BACKUP_DIR}"

log "ativo. janela=${BACKUP_AT_HOUR_UTC}:00 UTC · reavalia a cada ${CHECK_INTERVAL_S}s · dir=${BACKUP_DIR}"
log "hora atual do container: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

while :; do
	hoje="$(date -u +%F)"
	hora_atual="$(date -u +%-H)"
	marcador="${BACKUP_DIR}/.ultimo-backup-${hoje}"

	if [[ "${hora_atual}" -eq "${BACKUP_AT_HOUR_UTC}" && ! -f "${marcador}" ]]; then
		log "janela atingida (${hora_atual}:xx UTC) e ${hoje} ainda sem backup — executando"

		# `|| true` de propósito: um dia que falha não pode matar o agendador,
		# senão a primeira falha transitória (banco reiniciando, MinIO fora)
		# desliga o backup para SEMPRE e ninguém percebe. O exit code fica no
		# log do painel; o marcador só é escrito em caso de sucesso, então a
		# próxima volta (10min) tenta de novo no mesmo dia.
		if "${BACKUP_SCRIPT}"; then
			date -u '+%Y-%m-%dT%H:%M:%SZ' >"${marcador}"
			log "backup do dia ${hoje} concluído com sucesso"
		else
			log "ERRO: backup do dia ${hoje} FALHOU (exit $?) — vai tentar de novo em ${CHECK_INTERVAL_S}s, ainda dentro da janela"
		fi

		# Limpa marcadores antigos para não acumular um arquivo por dia
		# indefinidamente no volume.
		find "${BACKUP_DIR}" -maxdepth 1 -type f -name '.ultimo-backup-*' -mtime +7 -delete 2>/dev/null || true
	fi

	sleep "${CHECK_INTERVAL_S}"
done
