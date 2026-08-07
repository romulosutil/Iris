#!/usr/bin/env bash
# agendador.sh — laço do job de auto-arquivamento por inatividade (#174, D4).
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Não há campo "Schedule" e não existe tipo de serviço "Cron". Mesmas três
# alternativas do backup e do escalonamento, mesma escolha:
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
#   INTERVALO_S                 segundos entre varreduras. Default 86400 (1x/dia).
#   ARQUIVAMENTO_DATABASE_URL   role de login que herda `iris_arquivamento`
#                               (revalidada pelo próprio script Node).
#   ARQUIVAMENTO_HEARTBEAT_DIR  default /heartbeat.
#
# POR QUE 86400s E NÃO 60s COMO O ESCALONAMENTO: aqui não há prazo clínico. Os
# limiares são 83 e 90 DIAS, com 7 dias de folga entre eles, e a régua conta em
# dias civis (src/lib/jobs/auto-arquivamento.ts) — varrer de minuto em minuto
# não anteciparia nada, só produziria 1440x mais chamadas que não mudam linha
# nenhuma. Uma varredura por dia é a granularidade da própria regra.
#
# POR QUE NÃO HÁ MARCADOR DE IDEMPOTÊNCIA: a varredura é idempotente por
# natureza. `app_auto_arquivar_pacientes()` só toca paciente que AINDA não foi
# avisado/arquivado na janela; a própria escrita tira a linha do conjunto
# elegível. Rodar duas vezes seguidas — por restart de container, deploy ou
# reboot do VPS — não arquiva nada duas vezes e não duplica aviso na trilha.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-arquivamento] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-86400}"
readonly HEARTBEAT_DIR="${ARQUIVAMENTO_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/auto-arquivamento.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

# Validado ANTES do laço, não dentro (mesma disciplina do infra/billing): sem
# env o job falha em 100% dos ticks, e um laço que falha para sempre é ruído que
# esconde a falha real. Com tick de 24h seria pior ainda — a primeira evidência
# só apareceria no dia seguinte. Só o NOME da variável ausente aparece — nunca
# o valor, que é uma credencial de banco.
faltando=()
[[ -n "${ARQUIVAMENTO_DATABASE_URL:-}" ]] || faltando+=("ARQUIVAMENTO_DATABASE_URL")
if [[ ${#faltando[@]} -gt 0 ]]; then
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando[*]}"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultima-varredura"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (banco
	# reiniciando, deploy do Postgres, rede) desligaria o arquivamento para
	# SEMPRE, e arquivamento desligado é indistinguível de "ninguém passou dos
	# 90 dias" — a fatura segue cobrando paciente inativo em silêncio.
	#
	# Quem percebe a parada NÃO é este log: é o heartbeat, escrito pelo próprio
	# script Node só em varredura bem-sucedida. Enquanto as varreduras falham,
	# `.ultima-varredura` para de avançar e o monitor externo (ver
	# infra/README.md) dispara. Este log só explica o porquê depois.
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
		log "ATENÇÃO: enquanto isso durar, paciente inativo NÃO está sendo arquivado e"
		log "ATENÇÃO: SEGUE CONTANDO na fatura da clínica."
		log "ATENÇÃO: o heartbeat parou de avançar. Ver §Auto-arquivamento por inatividade em infra/README.md."
		log "ATENÇÃO: o erro completo está nas linhas de stderr acima desta."
	fi

	sleep "${INTERVALO_S}"
done
