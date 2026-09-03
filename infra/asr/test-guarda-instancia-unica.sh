#!/usr/bin/env bash
# test-guarda-instancia-unica.sh — exercita a guarda de instância única do
# agendador.sh (bug de produção: crash loop no `asr-agendador`, VPS, 2026-09-03).
#
# POR QUE EXISTE: em container, o processo do agendador É o pid 1. Se o
# HEARTBEAT_DIR sobrevive a um restart (é o mesmo caminho a cada boot do
# container) e o lock não foi limpo pela trap (kill -9/OOM matam antes do
# trap rodar), o `.lock/pid` de um boot anterior contém "1" — e o NOVO
# processo, também pid 1 no boot atual, faz `kill -0 1` contra SI MESMO. A
# checagem de vivacidade nunca falha, o guard nunca entra no ramo de
# recuperação de lock órfão, e o container crash-looping para sempre com
# "já existe um agendador de ASR vivo" — mesmo não havendo segundo processo
# algum.
#
# NÃO É CÓPIA: o bloco testado é EXTRAÍDO de agendador.sh com `sed`, entre os
# marcadores `# ─── Guarda de instância única` e a linha que grava o próprio
# pid. Se o bloco for renomeado ou sumir, o teste falha alto.
#
# Generaliza pid=1 como "pid igual ao nosso próprio $$": em bash comum (fora
# de container) não dá pra forçar o processo a nascer com pid 1, mas o
# mecanismo do bug é o mesmo em qualquer caso onde o pid gravado no lock
# coincide com o pid do processo QUE ESTÁ CHECANDO — kill -0 sempre acha a si
# mesmo. É essa coincidência que o guard tem que tratar como "não é uma
# segunda instância", nunca como prova de vivacidade alheia.
#
# COMO RODAR (na raiz do repo, sem Docker):
#   bash infra/asr/test-guarda-instancia-unica.sh infra/asr/agendador.sh
set -uo pipefail

ALVO="${1:-}"
if [[ -z "${ALVO}" || ! -r "${ALVO}" ]]; then
	echo "uso: bash $0 <caminho para agendador.sh>" >&2
	exit 1
fi
FALHAS=0

ok() { printf 'ok   %s\n' "$*"; }
nok() {
	printf 'FAIL %s\n' "$*"
	FALHAS=$((FALHAS + 1))
}

# --- extrai o bloco real da guarda -----------------------------------------
HARNESS="$(mktemp)"
{
	echo 'set -Eeuo pipefail'
	echo 'log() { printf "[agendador-asr] %s\n" "$*" >&2; }'
	echo 'HEARTBEAT_DIR="${HEARTBEAT_DIR:?}"'
	sed -n '/^readonly LOCK_DIR=/,/^printf .%s\\n. "\$\$" >"\${LOCK_DIR}\/pid"$/p' "${ALVO}"
} >"${HARNESS}"

if ! grep -q 'readonly LOCK_DIR=' "${HARNESS}"; then
	echo "FAIL: não achei o bloco da guarda em ${ALVO} — o teste ficaria vácuo"
	exit 1
fi
if ! grep -q 'printf .%s\\n. "\$\$"' "${HARNESS}"; then
	echo "FAIL: não achei a linha que grava o próprio pid em ${ALVO} — extração incompleta"
	cat "${HARNESS}"
	exit 1
fi

rodar_guarda() {
	# roda a guarda extraída num diretório de heartbeat isolado; devolve o
	# exit code do bloco (0 = passou/recuperou, 1 = "já existe agendador vivo")
	local dir="$1"
	HEARTBEAT_DIR="${dir}" bash "${HARNESS}" >"${dir}/.saida" 2>&1
	echo $?
}

TMP_BASE="$(mktemp -d)"
trap 'rm -rf -- "${TMP_BASE}" "${HARNESS}"' EXIT

# --- cenário 1: sem lock nenhum -> passa e grava o próprio pid --------------
D1="${TMP_BASE}/sem-lock"
mkdir -p "${D1}"
COD="$(rodar_guarda "${D1}")"
[[ "${COD}" == '0' && -f "${D1}/.agendador-asr.lock/pid" ]] &&
	ok 'sem lock: guarda passa e grava o próprio pid' ||
	nok 'sem lock: guarda deveria passar e gravar o pid'

# --- cenário 2: lock órfão de um pid morto de verdade -> recupera ----------
D2="${TMP_BASE}/lock-orfao"
mkdir -p "${D2}/.agendador-asr.lock"
# processo real que já terminou: um subshell finalizado tem pid ainda não
# reciclado por um instante — mais robusto é achar um pid alto improvável.
# Usamos $BASHPID de um subshell já morto via disown+wait para pid garantido
# morto: mais simples e determinístico é 99999 (não deve existir).
echo '99999' >"${D2}/.agendador-asr.lock/pid"
COD="$(rodar_guarda "${D2}")"
[[ "${COD}" == '0' ]] &&
	ok 'lock órfão (dono morto de verdade): guarda recupera e segue' ||
	nok 'lock órfão (dono morto): guarda deveria recuperar (saiu com código '"${COD}"')'

# --- cenário 3: segunda instância REAL e viva, com pid DIFERENTE do nosso --
# É o caso que a guarda existe para proteger: `docker exec` manual iniciando
# um segundo laço. Tem que continuar bloqueando depois do fix.
D3="${TMP_BASE}/duplicata-real"
mkdir -p "${D3}/.agendador-asr.lock"
sleep 30 &
PID_VIVO=$!
echo "${PID_VIVO}" >"${D3}/.agendador-asr.lock/pid"
COD="$(rodar_guarda "${D3}")"
kill "${PID_VIVO}" 2>/dev/null || true
wait "${PID_VIVO}" 2>/dev/null || true
[[ "${COD}" == '1' ]] &&
	ok 'segunda instância real e viva (pid diferente): guarda continua bloqueando' ||
	nok 'segunda instância real e viva: guarda deveria bloquear (saiu com código '"${COD}"')'

# --- cenário 4: o BUG — pid gravado no lock é o MESMO pid de quem checa ----
# Em container isto é `pid 1` sobrevivendo a um restart via HEARTBEAT_DIR
# persistente; aqui reproduzimos a mesma colisão de identidade gravando o
# próprio $$ do processo que vai rodar a guarda ANTES de ele rodar.
D4="${TMP_BASE}/colisao-pid1"
mkdir -p "${D4}/.agendador-asr.lock"
# Precisa ser o MESMO processo que grava o pid e que roda a guarda — por
# isso `source` em vez de invocar um segundo `bash`, que nasceria com outro
# pid e não reproduziria a colisão real do pid 1 entre boots do container.
cat >"${D4}/wrapper.sh" <<EOF
set -uo pipefail
echo "\$\$" >"${D4}/.agendador-asr.lock/pid"
HEARTBEAT_DIR="${D4}"
source "${HARNESS}"
EOF
bash "${D4}/wrapper.sh" >"${D4}/.saida" 2>&1
COD=$?
[[ "${COD}" == '0' ]] &&
	ok 'colisão pid==$$ (bug do pid 1 pós-restart): guarda recupera em vez de travar' ||
	nok 'colisão pid==$$ (bug do pid 1 pós-restart): guarda travou achando que é outra instância (saiu com código '"${COD}"', ver '"${D4}"'/.saida)'

printf '\n%s\n' "falhas: ${FALHAS}"
exit $((FALHAS > 0 ? 1 : 0))
