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
# NÃO É CÓPIA: TODAS as funções testadas são EXTRAÍDAS do verify-offsite.sh real
# com `sed`. Se alguma for renomeada ou sumir, o teste falha alto em vez de
# passar verde testando uma cópia velha — que é o defeito clássico deste tipo de
# arquivo, e que esta suíte já cometeu: numa revisão anterior as asserções de
# carimbo eram reimplementações locais, e o arquivo seguia 14/14 verde com o `<`
# do script trocado por `>`. A regra vale: se a asserção não lê ${ALVO}, não é
# teste.
#
# As três mutações que a suíte tem de pegar (e pega): inverter a comparação do
# corte, esvaziar o regex do formato do corte, e remover o strip do prefixo
# `iris-` antes de comparar.
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

# Prefixo em caixa alta: a minúscula tem que vir ANTES do strip, senão o
# `SHA256=` sobrevive e o valor é recusado com o diagnóstico errado.
[[ "$(sha_normaliza "SHA256=${SHA_VALIDO}")" == "${SHA_VALIDO}" ]] &&
	ok 'prefixo SHA256= em caixa alta é removido' || nok 'prefixo em caixa alta sobreviveu ao strip'

# Espaço e quebra de linha em volta vêm do clipboard, não do operador.
[[ "$(sha_normaliza "  ${SHA_VALIDO}  ")" == "${SHA_VALIDO}" ]] &&
	ok 'espaço em volta é aparado' || nok 'espaço em volta não foi aparado'
printf -v COM_QUEBRA '%s\n' "${SHA_VALIDO}"
[[ "$(sha_normaliza "${COM_QUEBRA}")" == "${SHA_VALIDO}" ]] &&
	ok 'quebra de linha ao final é aparada' || nok 'quebra de linha não foi aparada'

# --- corte de carimbo: as funções REAIS, extraídas do script --------------------
# Reimplementar a comparação aqui seria testar esta cópia, não o script: uma
# revisão anterior desta suíte fazia exatamente isso e continuava 14/14 verde com
# o `<` do script trocado por `>`. Extrair é o que dá direito de chamar isto de
# teste.
HARNESS_CARIMBO="$(mktemp)"
{
	# Sem `set -e` aqui de propósito: este arquivo é `source`ado no shell do
	# teste, e ligar errexit no meio da suíte faria a primeira asserção negativa
	# derrubar tudo.
	sed -n '/^corte_carimbo_valido()/,/^}/p' "${ALVO}"
	sed -n '/^carimbo_abaixo_do_corte()/,/^}/p' "${ALVO}"
} >"${HARNESS_CARIMBO}"

for fn in corte_carimbo_valido carimbo_abaixo_do_corte; do
	if ! grep -q "^${fn}()" "${HARNESS_CARIMBO}"; then
		echo "FAIL: não achei ${fn} em ${ALVO} — as asserções de carimbo seriam vácuo"
		rm -f "${HARNESS}" "${HARNESS_CARIMBO}"
		exit 1
	fi
done

# shellcheck source=/dev/null
source "${HARNESS_CARIMBO}"

CORTE='20260728T040000Z'

carimbo_abaixo_do_corte 'iris-20260728T024929Z' "${CORTE}" &&
	ok 'objeto pré-rotação é barrado pelo corte' || nok 'objeto pré-rotação não foi barrado'
! carimbo_abaixo_do_corte 'iris-20260729T024929Z' "${CORTE}" &&
	ok 'objeto pós-rotação passa' || nok 'objeto pós-rotação foi barrado'
! carimbo_abaixo_do_corte "iris-${CORTE}" "${CORTE}" &&
	ok 'carimbo igual ao corte passa (corte é inclusivo)' || nok 'carimbo igual ao corte foi barrado'
carimbo_abaixo_do_corte 'iris-20251231T235959Z' "${CORTE}" &&
	ok 'virada de ano compara certo' || nok 'comparação lexicográfica errou na virada de ano'

# O strip do prefixo é a peça mais fácil de errar: sem ela, `iris-2026...` é
# sempre "maior" que `2026...` e o corte vira um no-op silencioso — recusa
# nenhuma, aviso nenhum.
carimbo_abaixo_do_corte '20260728T024929Z' "${CORTE}" &&
	ok 'carimbo sem o prefixo iris- dá o mesmo veredito' || nok 'o strip de iris- não está sendo aplicado'

# Corte vazio (parâmetro omitido) não pode recusar nada.
! carimbo_abaixo_do_corte 'iris-19700101T000000Z' '' &&
	ok 'corte vazio nunca barra' || nok 'corte vazio barrou objeto'

corte_carimbo_valido "${CORTE}" && ok 'corte bem formado é aceito' || nok 'corte bem formado recusado'
corte_carimbo_valido '' && ok 'corte vazio é válido (parâmetro é opcional)' || nok 'corte vazio recusado'
! corte_carimbo_valido '2026-07-28' && ok 'corte com hífen é recusado' || nok 'aceitou corte com hífen'
! corte_carimbo_valido "iris-${CORTE}" && ok 'corte com prefixo iris- é recusado' || nok 'aceitou prefixo iris-'
! corte_carimbo_valido '20260728T0400Z' && ok 'corte truncado é recusado' || nok 'aceitou corte truncado'

rm -f "${HARNESS}" "${HARNESS_CARIMBO}"
printf '\n%s\n' "falhas: ${FALHAS}"
exit $((FALHAS > 0 ? 1 : 0))
