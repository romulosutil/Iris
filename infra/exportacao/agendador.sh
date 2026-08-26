#!/usr/bin/env bash
# agendador.sh — laço do job de exportação integral do acervo (#374 ∪ #353, D62).
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Mesma escolha do billing (infra/billing/agendador.sh): lógica de laço inline
# no painel vira conhecimento tribal fora do repo, crontab no SO do VPS idem e
# ainda some dos logs do painel — então: script versionado, com o painel só
# apontando `Comando = /app/agendador.sh`.
#
# Env:
#   INTERVALO_S              segundos entre disparos. Default 300 (5min).
#   EXPORT_JOB_URL            rota interna do Next que monta o acervo de verdade.
#   EXPORT_JOB_TOKEN          segredo do disparo. NUNCA logado por este script.
#   EXPORT_HEARTBEAT_DIR      default /heartbeat.
#
# POR QUE 300s E NÃO 3600s COMO O BILLING: aqui há titular esperando do outro
# lado — o pedido de portabilidade (Art. 18, V) é ação humana, não um corte de
# ciclo que não muda para o cliente dentro de uma hora. A rota processa até 5
# bundles por tick e expira os vencidos (> 72h); um intervalo de 5 minutos
# mantém a fila andando sem multiplicar POSTs vazios quando não há pedido
# pendente — o disparo é idempotente do lado da rota.
#
# POR QUE NÃO É 60s COMO O ESCALONAMENTO: não há prazo clínico aqui, e cada
# tick pode custar CPU/bytea real (monta ZIP, calcula SHA-256). 60s
# multiplicaria por 5 o custo de varreduras vazias sem entregar nada mais
# rápido ao titular do que 5 minutos já entregam.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-exportacao] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-300}"
readonly HEARTBEAT_DIR="${EXPORT_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/exportacao-acervo.mjs"

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
[[ -n "${EXPORT_JOB_URL:-}" ]] || faltando+=("EXPORT_JOB_URL")
[[ -n "${EXPORT_JOB_TOKEN:-}" ]] || faltando+=("EXPORT_JOB_TOKEN")
if [[ ${#faltando[@]} -gt 0 ]]; then
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando[*]}"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultima-exportacao"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (deploy do app,
	# rede, 502 do proxy) desligaria a exportação para SEMPRE, e exportação
	# desligada é indistinguível de "fila vazia" — o titular pede portabilidade e
	# nada acontece, sem erro visível em lugar nenhum (o próprio D62).
	#
	# Quem percebe a parada NÃO é este log: é o heartbeat abaixo, que só avança
	# em disparo bem-sucedido. Enquanto os disparos falham, `.ultima-exportacao`
	# congela e o monitor externo dispara. Este log só explica o porquê depois.
	saida=0
	node "${SCRIPT}" || saida=$?

	if [[ "${saida}" -eq 0 ]]; then
		date -u '+%Y-%m-%dT%H:%M:%SZ' >"${HEARTBEAT_DIR}/.ultima-exportacao"
		if [[ "${falhas_seguidas}" -gt 0 ]]; then
			log "recuperado após ${falhas_seguidas} falha(s) seguida(s)."
		fi
		falhas_seguidas=0
	else
		falhas_seguidas=$((falhas_seguidas + 1))
		log "ATENÇÃO: disparo de exportação FALHOU (exit ${saida}) — ${falhas_seguidas} falha(s) seguida(s)."
		log "ATENÇÃO: enquanto isso durar, NENHUM pedido de exportação integral está sendo processado."
		log "ATENÇÃO: o titular pediu portabilidade (Art. 18, V) e o pedido fica parado em 'pendente'."
		log "ATENÇÃO: o heartbeat parou de avançar. A causa REAL (status HTTP e corpo"
		log "ATENÇÃO: recebido, ou erro de rede/timeout) está na linha JSON e no stderr acima."
	fi

	sleep "${INTERVALO_S}"
done
