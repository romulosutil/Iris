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
readonly DEGRADADO_MARCADOR="${BACKUP_DIR}/.offsite-degradado"

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

		# Uma falha não pode matar o agendador, senão a primeira falha
		# transitória (banco reiniciando, MinIO fora) desliga o backup para
		# SEMPRE e ninguém percebe. O exit code fica no log do painel.
		#
		# O marcador é escrito em DOIS casos, não um:
		#
		#   exit 0 — sucesso completo.
		#   exit 3 — backup do dia íntegro em disco, mas alguma replicação
		#            (MinIO e/ou off-site) falhou. O DUMP ESTÁ FEITO. Refazê-lo
		#            não conserta o destino que está fora, e sem marcador o
		#            laço dispararia um pg_dump completo contra o banco de
		#            produção a cada ${CHECK_INTERVAL_S}s até a hora virar —
		#            carga real e contínua por um problema que não é do dump.
		#            Registra alto e segue; a próxima janela replica.
		#
		# Qualquer outro exit (1 = dump/globals falharam, 2 = uso incorreto):
		# NÃO grava marcador — não existe backup do dia — e tenta de novo na
		# próxima volta, ainda dentro da janela.
		backup_exit=0
		"${BACKUP_SCRIPT}" || backup_exit=$?

		case "${backup_exit}" in
			0)
				date -u '+%Y-%m-%dT%H:%M:%SZ' >"${marcador}"
				rm -f -- "${DEGRADADO_MARCADOR}" 2>/dev/null || true
				log "backup do dia ${hoje} concluído com sucesso"
				;;
			3)
				date -u '+%Y-%m-%dT%H:%M:%SZ' >"${marcador}"
				if [[ ! -f "${DEGRADADO_MARCADOR}" ]]; then
					printf 'timestamp=%s\nexit_code=3\ndate=%s\nstatus=degraded\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "${hoje}" >"${DEGRADADO_MARCADOR}"
				fi
				log "ATENÇÃO: backup do dia ${hoje} está ÍNTEGRO em disco, mas a REPLICAÇÃO falhou (exit 3)."
				log "ATENÇÃO: pode não haver cópia fora do host. Verificar MinIO e destino off-site HOJE — ver §Backup e restore em infra/README.md."
				log "ATENÇÃO: sinalizador de degradação registrado em ${DEGRADADO_MARCADOR}."
				log "ATENÇÃO: o dump NÃO será refeito nesta janela (refazer não conserta destino fora do ar)."
				;;
			*)
				log "ERRO: backup do dia ${hoje} FALHOU (exit ${backup_exit}) — não há backup do dia. Vai tentar de novo em ${CHECK_INTERVAL_S}s, ainda dentro da janela"
				;;
		esac

		# Limpa marcadores antigos para não acumular um arquivo por dia
		# indefinidamente no volume.
		find "${BACKUP_DIR}" -maxdepth 1 -type f -name '.ultimo-backup-*' -mtime +7 -delete 2>/dev/null || true
	fi

	sleep "${CHECK_INTERVAL_S}"
done
