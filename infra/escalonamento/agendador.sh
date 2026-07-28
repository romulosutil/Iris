#!/usr/bin/env bash
# agendador.sh — laço do motor de escalonamento de alerta de risco (#122, H1).
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Não há campo "Schedule" e não existe tipo de serviço "Cron". Mesmas três
# alternativas do backup, mesma escolha:
#
#   a) lógica de laço inline no campo "Comando" do painel  -> conhecimento
#      tribal fora do repo;
#   b) crontab no SO do VPS                                -> idem, e fora dos
#      logs do painel;
#   c) este script, versionado, com o painel só apontando  -> escolhido.
#
# O serviço roda com Comando = `/app/agendador.sh`. O container fica de pé
# dormindo e acorda a cada tick.
#
# Env:
#   INTERVALO_S                  segundos entre varreduras. Default 60.
#   ESCALONAMENTO_DATABASE_URL   role de login que herda `iris_escalonamento`
#                                (validada pelo próprio script Node).
#   ESCALONAMENTO_HEARTBEAT_DIR  default /heartbeat.
#
# POR QUE 60s E NÃO 600s COMO O BACKUP: o menor prazo da tabela §4.1 é de 15
# minutos (ideação ativa com plano, tentativa relatada). Um tick de 5 minutos
# adicionaria até 5 min de atraso sobre 15 — até 1/3 do prazo inteiro, gasto
# depois que o prazo já venceu. Com 1 minuto o erro máximo é ~7%. O custo é uma
# chamada de função indexada por minuto (índice `idx_alerta_risco_sla`), que na
# esmagadora maioria dos ticks não retorna linha nenhuma.
#
# POR QUE NÃO HÁ MARCADOR DE IDEMPOTÊNCIA (o backup tem um, aqui não é
# esquecimento): a varredura é idempotente por natureza. `app_escalonar_risco_
# vencidos()` só toca alertas que AINDA estão em `aberto`/`escalado_estagio_1`
# com prazo vencido; o próprio UPDATE tira a linha do conjunto elegível. Rodar
# duas vezes seguidas — por restart de container, deploy ou reboot do VPS — não
# escala nada duas vezes e não reinicia prazo. O marcador diário do backup
# existe para evitar um `pg_dump` extra e caro; aqui não há nada de caro nem de
# repetível para evitar.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-escalonamento] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-60}"
readonly HEARTBEAT_DIR="${ESCALONAMENTO_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/escalonamento-risco.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultima-varredura"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (banco
	# reiniciando, deploy do Postgres, rede) desligaria o escalonamento para
	# SEMPRE, e um motor desligado é indistinguível de "nada venceu" — a falha
	# silenciosa exata que a #122 existe para impedir.
	#
	# Quem percebe a parada NÃO é este log: é o heartbeat. Enquanto as
	# varreduras falham, o arquivo `.ultima-varredura` para de avançar, e o
	# monitor externo (ver infra/README.md) dispara. Este log só explica o
	# porquê depois que o heartbeat já apontou.
	saida=0
	node "${SCRIPT}" --once || saida=$?

	if [[ "${saida}" -eq 0 ]]; then
		if [[ "${falhas_seguidas}" -gt 0 ]]; then
			log "recuperado após ${falhas_seguidas} falha(s) seguida(s)."
		fi
		falhas_seguidas=0
	else
		falhas_seguidas=$((falhas_seguidas + 1))
		log "ATENÇÃO: varredura FALHOU (exit ${saida}) — ${falhas_seguidas} falha(s) seguida(s)."
		log "ATENÇÃO: enquanto isso durar, alerta de risco vencido NÃO está sendo escalado."
		log "ATENÇÃO: o heartbeat parou de avançar. Ver §Motor de escalonamento em infra/README.md."
		log "ATENÇÃO: o erro completo está nas linhas de stderr acima desta."
	fi

	sleep "${INTERVALO_S}"
done
