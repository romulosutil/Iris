#!/usr/bin/env bash
# sweeper-orfaos.sh — laço do BACKSTOP de objetos órfãos no bucket efêmero de
# ASR (#72/T15).
#
# POR QUE ISTO EXISTE: `scripts/asr-sweeper-orfaos.mjs` faz UMA varredura e
# sai — o laço é responsabilidade deste agendador, mesmo desenho de
# infra/retencao/agendador.sh e infra/backup/backup.sh. Assim a mesma unidade
# de trabalho roda à mão no console durante um incidente, sem herdar o laço.
#
# T15 é um script AUTÔNOMO, não um passo dentro de `infra/asr/agendador.sh`:
# no momento em que esta task foi implementada, T08 (o agendador principal do
# pipeline de ASR) ainda não existia no repo. Se T08 chegar depois com um
# laço próprio, decidir ali se compensa fundir os dois ticks — não é decisão
# de T15 antecipar.
#
# O Easypanel (v2.31.0) não tem cron para serviços de app — mesma constatação
# de infra/retencao/agendador.sh: o serviço roda com Comando =
# `/app/infra/asr/sweeper-orfaos.sh`, container fica de pé dormindo e acorda a
# cada tick.
#
# Env:
#   INTERVALO_S              segundos entre varreduras. Default 3600 (1h) —
#                             a janela do backstop é de 6h (ASR_SWEEPER_LIMITE_HORAS
#                             no script Node); varrer de hora em hora dá folga
#                             suficiente sem deixar objeto órfão exposto por
#                             muito além da janela.
#   ASR_S3_ENDPOINT/ASR_S3_ACCESS_KEY/ASR_S3_SECRET_KEY   obrigatórias — mesmas
#                             de src/lib/asr/storage.ts (T04), revalidadas pelo
#                             próprio script Node.
#   ASR_S3_BUCKET             default iris-asr-efemero (validado no script Node).
#   ASR_SWEEPER_LIMITE_HORAS  default 6 (validado no script Node).
#
# ISTO NÃO É RETENÇÃO/LGPD: é limpeza de vazamento de um bucket de trabalho
# efêmero, deixado por um container que morreu no meio do processamento antes
# do `finally` de T07 rodar. Não confundir com os scripts de expurgo/retenção
# de prontuário em infra/retencao/.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[asr-sweeper] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-3600}"
readonly SCRIPT="/app/scripts/asr-sweeper-orfaos.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

# Validado ANTES do laço, não dentro (mesma disciplina de
# infra/retencao/agendador.sh e infra/backup/expurgo-offsite.sh): sem env o
# job falha em 100% dos ticks, e um laço que falha para sempre é ruído que
# esconde a falha real. Só o NOME da variável ausente aparece — nunca o
# valor, que é credencial.
faltando=()
[[ -n "${ASR_S3_ENDPOINT:-}" ]] || faltando+=("ASR_S3_ENDPOINT")
[[ -n "${ASR_S3_ACCESS_KEY:-}" ]] || faltando+=("ASR_S3_ACCESS_KEY")
[[ -n "${ASR_S3_SECRET_KEY:-}" ]] || faltando+=("ASR_S3_SECRET_KEY")
if [[ ${#faltando[@]} -gt 0 ]]; then
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando[*]}"
	exit 1
fi

log "ativo. intervalo=${INTERVALO_S}s"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (MinIO
	# reiniciando, deploy, rede) desligaria o backstop para SEMPRE, e backstop
	# desligado é indistinguível de "nenhum objeto órfão existe" — o vazamento
	# some do resultado do script sem sumir do bucket.
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
		log "ATENÇÃO: enquanto isso durar, objetos órfãos do bucket efêmero de ASR NÃO são varridos."
		log "ATENÇÃO: o erro completo está nas linhas de stderr acima desta."
	fi

	sleep "${INTERVALO_S}"
done
