#!/usr/bin/env bash
# agendador.sh — laço do job de AVISO PRÉVIO de expurgo de prontuário (#352).
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Não há campo "Schedule" e não existe tipo de serviço "Cron". Mesmas três
# alternativas do backup, do escalonamento e do arquivamento, mesma escolha:
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
#   INTERVALO_S             segundos entre varreduras. Default 86400 (1x/dia).
#   RETENCAO_DATABASE_URL   role de login que herda `iris_retencao` (revalidada
#                           pelo próprio script Node).
#   RETENCAO_HEARTBEAT_DIR  default /heartbeat.
#
# POR QUE 86400s: a janela do aviso é de 90 DIAS e a régua conta em DIAS CIVIS
# no fuso da clínica (src/lib/jobs/retencao.ts). Varrer de minuto em minuto não
# anteciparia aviso nenhum — só produziria 1440x mais chamadas que não mudam
# linha alguma. Uma varredura por dia é a granularidade da própria regra.
#
# POR QUE NÃO HÁ MARCADOR DE IDEMPOTÊNCIA: a varredura é idempotente por
# natureza. O `INSERT` de `app_retencao_avisar` É o dedup — a própria escrita
# tira o paciente do conjunto elegível (`NOT EXISTS ... criado_em > alta_em`).
# Rodar duas vezes seguidas — por restart de container, deploy ou reboot do VPS
# — não duplica aviso na trilha append-only, que é onde a duplicata seria
# permanente e impossível de apagar.
#
# ESTE SERVIÇO NÃO PURGA NADA. Ele avisa. A eliminação definitiva é ato do
# coordenador, na tela, com confirmação por nome — a role deste job sequer tem
# EXECUTE em `app_purgar_paciente` (migração 0128).

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-retencao] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-86400}"
readonly HEARTBEAT_DIR="${RETENCAO_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/retencao-aviso-previo.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

# Validado ANTES do laço, não dentro (mesma disciplina do infra/arquivamento):
# sem env o job falha em 100% dos ticks, e um laço que falha para sempre é ruído
# que esconde a falha real. Com tick de 24h seria pior ainda — a primeira
# evidência só apareceria no dia seguinte. Só o NOME da variável ausente
# aparece — nunca o valor, que é uma credencial de banco.
faltando=()
[[ -n "${RETENCAO_DATABASE_URL:-}" ]] || faltando+=("RETENCAO_DATABASE_URL")
if [[ ${#faltando[@]} -gt 0 ]]; then
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando[*]}"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultima-retencao"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (banco
	# reiniciando, deploy do Postgres, rede) desligaria o aviso prévio para
	# SEMPRE, e aviso desligado é indistinguível de "nenhum prontuário está a
	# vencer" — a clínica descobre o vencimento depois de ele passar.
	#
	# Quem percebe a parada NÃO é este log: é o heartbeat, escrito pelo próprio
	# script Node só em varredura completa e bem-sucedida. Enquanto as varreduras
	# falham, `.ultima-retencao` para de avançar e o monitor externo (ver
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
		log "ATENÇÃO: enquanto isso durar, NENHUM aviso prévio de expurgo está sendo emitido."
		log "ATENÇÃO: a clínica perde os 90 dias de antecedência para organizar a guarda —"
		log "ATENÇÃO: e o prontuário chega vencido na fila sem que ninguém tenha sido avisado."
		log "ATENÇÃO: o heartbeat parou de avançar. Ver §Aviso prévio de expurgo em infra/README.md."
		log "ATENÇÃO: o erro completo está nas linhas de stderr acima desta."
	fi

	sleep "${INTERVALO_S}"
done
