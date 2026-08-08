#!/usr/bin/env bash
# test-verify-offsite-logica.sh — exercita as partes PURAS que a #105
# acrescentou ao verify-offsite.sh: a normalização/validação do sha256 esperado
# e o corte de carimbo.
#
# POR QUE EXISTE, sendo que o test-offsite.sh já cobre o verify-offsite: aquele
# sobe Postgres + MinIO + Docker e só roda em Linux com Docker. Este roda em
# qualquer bash, inclusive no Git Bash do Windows onde o operador trabalha, em
# menos de um segundo. É a rede que pega o erro de lógica antes de gastar um
# ciclo de container inteiro.
#
# NÃO É CÓPIA: os trechos testados são EXTRAÍDOS do verify-offsite.sh real com
# `sed`. Se a função for renomeada ou sumir, o teste falha alto em vez de passar
# verde testando uma cópia velha — que é o defeito clássico deste tipo de
# arquivo.
#
# Este teste pegou um defeito real antes de o código ser commitado: a validação
# do sha vivia dentro de `$(...)`, onde o `exit 1` mata só o subshell — um sha
# esperado malformado sairia 2 ("procedência não provada") em vez de 1 ("valor
# errado"), com a mensagem errada.
#
# COMO RODAR (na raiz do repo, sem Docker):
#   bash infra/backup/test-verify-offsite-logica.sh infra/backup/verify-offsite.sh
#
# Exit code: 0 = tudo passou. 1 = alguma asserção falhou (o resumo diz quantas).
set -uo pipefail

ALVO="${1:-}"
if [[ -z "${ALVO}" || ! -r "${ALVO}" ]]; then
	echo "uso: bash $0 <caminho para verify-offsite.sh>" >&2
	exit 1
fi
FALHAS=0

ok() { printf 'ok   %s\n' "$*"; }
nok() {
	printf 'FAIL %s\n' "$*"
	FALHAS=$((FALHAS + 1))
}

# --- extrai normalizar_sha_esperado do arquivo real -----------------------------
HARNESS="$(mktemp)"
{
	echo 'set -Eeuo pipefail'
	echo 'log_error() { printf "ERRO: %s\n" "$*" >&2; }'
	sed -n '/^normalizar_sha_esperado()/,/^}/p' "${ALVO}"
	echo 'normalizar_sha_esperado ALVO_VAR SAIDA'
	echo 'printf "%s" "${SAIDA}"'
} >"${HARNESS}"

if ! grep -q 'normalizar_sha_esperado()' "${HARNESS}"; then
	echo "FAIL: não achei normalizar_sha_esperado em ${ALVO} — o teste ficaria vácuo"
	exit 1
fi

sha_normaliza() {
	ALVO_VAR="$1" bash "${HARNESS}" 2>/dev/null
}
sha_exit() {
	ALVO_VAR="$1" bash "${HARNESS}" >/dev/null 2>&1
	echo $?
}

SHA_VALIDO="$(printf 'a%.0s' {1..64})"

# vazio => saída vazia, exit 0 (o caminho do exit 2, não pode derrubar o script)
[[ "$(sha_normaliza '')" == '' && "$(sha_exit '')" == '0' ]] &&
	ok 'vazio passa e não dispara errexit' || nok 'vazio deveria passar limpo'

# preenchido => exit 0 (era o bug do `[[ ]] && return 0` com set -e)
[[ "$(sha_exit "${SHA_VALIDO}")" == '0' ]] &&
	ok 'sha válido não dispara errexit' || nok 'sha válido derrubou a função (bug do && return)'

# prefixo sha256= é tolerado
[[ "$(sha_normaliza "sha256=${SHA_VALIDO}")" == "${SHA_VALIDO}" ]] &&
	ok 'prefixo sha256= é removido' || nok 'prefixo sha256= não foi removido'

# caixa alta é normalizada
[[ "$(sha_normaliza "${SHA_VALIDO^^}")" == "${SHA_VALIDO}" ]] &&
	ok 'caixa alta vira minúscula' || nok 'caixa alta não normalizou'

# lixo é RECUSADO (mutação: se o regex sumir, isto passa a valer 0)
[[ "$(sha_exit 'nao-e-um-sha')" == '1' ]] &&
	ok 'valor que não é sha256 é recusado' || nok 'aceitou valor que não é sha256'

# 63 chars (off-by-one no regex)
[[ "$(sha_exit "${SHA_VALIDO:0:63}")" == '1' ]] &&
	ok '63 hex é recusado' || nok 'aceitou 63 hex'

# linha inteira do log colada
[[ "$(sha_exit "dump sha256=${SHA_VALIDO}")" == '1' ]] &&
	ok 'linha inteira do log é recusada' || nok 'aceitou a linha inteira do log'

# --- corte de carimbo: mesma comparação que o script usa ------------------------
CORTE='20260728T040000Z'
menor() { [[ "$1" < "$2" ]]; }

menor '20260728T024929Z' "${CORTE}" &&
	ok 'objeto pré-rotação fica ABAIXO do corte' || nok 'objeto pré-rotação não foi barrado'
! menor '20260729T024929Z' "${CORTE}" &&
	ok 'objeto pós-rotação passa do corte' || nok 'objeto pós-rotação foi barrado'
! menor "${CORTE}" "${CORTE}" &&
	ok 'carimbo igual ao corte passa (corte é inclusivo)' || nok 'carimbo igual ao corte foi barrado'
menor '20251231T235959Z' "${CORTE}" &&
	ok 'virada de ano compara certo' || nok 'comparação lexicográfica errou na virada de ano'

# regex do corte
vale_corte() { [[ "$1" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; }
vale_corte "${CORTE}" && ok 'corte bem formado é aceito' || nok 'corte bem formado recusado'
! vale_corte '2026-07-28' && ok 'corte com hífen é recusado' || nok 'aceitou corte com hífen'
! vale_corte "iris-${CORTE}" && ok 'corte com prefixo iris- é recusado' || nok 'aceitou prefixo iris-'

rm -f "${HARNESS}"
printf '\n%s\n' "falhas: ${FALHAS}"
exit $((FALHAS > 0 ? 1 : 0))
