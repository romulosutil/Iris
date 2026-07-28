#!/usr/bin/env bash
# verify-offsite.sh — prova que a réplica off-site cifrada é RESTAURÁVEL
# (issue #86). Roda na máquina do operador, NUNCA no VPS.
#
# POR QUE ISTO EXISTE: "o upload saiu 0" e "existe um .age no bucket" não
# provam nada. Uma réplica cifrada com uma chave cuja privada ninguém tem é
# indistinguível de uma boa até o dia do desastre — mesmo tamanho, mesmo
# header, mesmo log de sucesso. A única prova é decifrar e restaurar. Este
# script fecha esse laço contra o bucket de PRODUÇÃO:
#
#   lista o bucket -> baixa o par (dump + globals) mais recente -> confirma que
#   está cifrado -> DECIFRA com a chave privada -> confirma que o dump é um
#   dump Postgres válido, com tabelas e com dado -> confirma que os globals
#   trazem as roles (sem elas, o restore recria as tabelas e ZERO policy de
#   RLS) -> imprime o sha256 do dump decifrado para bater com o log do backup.
#
# O sha256 é o fecho: se ele bate com o `sha256=` que o backup.sh logou no dia,
# está provado que o artefato que dá para restaurar é exatamente aquele que o
# VPS gerou — não uma cópia antiga, não outro banco.
#
# ONDE RODAR: na máquina que guarda a chave PRIVADA age. O VPS tem só a
# pública, por construção. Rodar isto no VPS exigiria levar a privada para lá,
# o que anularia o desenho inteiro da #86.
#
# COMO RODAR (na raiz do repo, com Docker):
#
#   export OFFSITE_S3_ENDPOINT=https://<ns>.compat.objectstorage.<região>.oraclecloud.com
#   export OFFSITE_S3_ACCESS_KEY=...     # precisa poder LER o bucket
#   export OFFSITE_S3_SECRET_KEY=...
#   export OFFSITE_S3_BUCKET=iris-backups-offsite
#   docker compose -f infra/docker-compose.yml --profile backup run --rm --no-deps -T \
#     backup ./verify-offsite.sh < /caminho/para/chave-privada-age.txt
#
# A chave privada entra por STDIN e só por stdin. Não é parâmetro (ficaria em
# `ps`), não é env var (`docker inspect` mostra o env de qualquer container) e
# não é volume montado. Dentro do container ela vira um arquivo 0600 em /tmp,
# apagado no EXIT, num container `--rm`.
#
# Argumento opcional: o nome do objeto a verificar. Sem ele, verifica o mais
# recente do bucket.
#   ... backup ./verify-offsite.sh iris-20260728T024929Z.dump.age < chave.txt
#
# Exit code:
#   0 = a réplica off-site é restaurável (com o sha256 impresso).
#   1 = falhou em algum ponto — a mensagem diz qual, e a distinção importa:
#       não conseguir LISTAR o bucket é problema de credencial de leitura;
#       não conseguir DECIFRAR é a chave errada, que é o desastre silencioso
#       que este script existe para encontrar antes do dia ruim.

set -Eeuo pipefail
IFS=$'\n\t'

log_info() {
	printf '[verify-offsite] %s\n' "$*"
}

log_error() {
	printf '[verify-offsite] ERRO: %s\n' "$*" >&2
}

# shellcheck disable=SC2329 # invocada indiretamente via `trap ... ERR`
on_error() {
	local exit_code=$?
	log_error "falha inesperada na linha ${1:-desconhecida} (exit ${exit_code}) — isto é um bug do próprio verify-offsite.sh, não um veredito sobre a réplica. A réplica continua NÃO VERIFICADA."
	exit "${exit_code}"
}
trap 'on_error ${LINENO}' ERR

readonly MC_ALIAS="irisverify"
readonly OBJETO_ALVO="${1:-}"

# Diretório de trabalho e da config do mc: 0700, fora de qualquer volume, e
# apagado no EXIT. Mesmo raciocínio do backup.sh — o `mc alias set` grava a
# credencial em texto plano no config.json, e aqui ainda passa a chave privada
# e o dump DECIFRADO (dado clínico em claro) por este diretório.
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/.verify-offsite.XXXXXX")"
readonly TMP_DIR
chmod 700 "${TMP_DIR}"
export MC_CONFIG_DIR="${TMP_DIR}/mc"

limpar() {
	rm -rf -- "${TMP_DIR}"
}
trap limpar EXIT

# --- validação ---------------------------------------------------------------
if [[ -n "${AGE_IDENTITY:-}" ]]; then
	log_error "AGE_IDENTITY veio como env var. A chave privada entra por STDIN — env var de container aparece em 'docker inspect' e fica no histórico do daemon. Desetar e repassar por stdin."
	exit 1
fi

: "${OFFSITE_S3_ENDPOINT:?OFFSITE_S3_ENDPOINT é obrigatório}"
: "${OFFSITE_S3_ACCESS_KEY:?OFFSITE_S3_ACCESS_KEY é obrigatório}"
: "${OFFSITE_S3_SECRET_KEY:?OFFSITE_S3_SECRET_KEY é obrigatório}"
readonly OFFSITE_S3_BUCKET="${OFFSITE_S3_BUCKET:-iris-backups-offsite}"
readonly OFFSITE_REGION="${OFFSITE_S3_REGION:-}"
readonly OFFSITE_PATH_STYLE="${OFFSITE_S3_PATH_STYLE:-auto}"

# Mesma validação do backup.sh. Sem ela um typo (`onn`) chega cru no
# `mc alias set --path` e sai como "mc alias set falhou" — que o runbook
# condiciona a ler como problema de credencial. Este script roda sob pressão de
# DR; não é hora de diagnosticar errado.
if ! [[ "${OFFSITE_PATH_STYLE}" =~ ^(auto|on|off)$ ]]; then
	log_error "OFFSITE_S3_PATH_STYLE precisa ser auto, on ou off — recebido: ${OFFSITE_PATH_STYLE}"
	exit 1
fi

# O argumento opcional vira o nome do objeto e a raiz de onde o nome do globals
# é derivado. Sem validar, um nome digitado pela metade (ou o nome do globals no
# lugar do dump) faz os dois downloads darem 404 e o operador recebe a mensagem
# de "par INCOMPLETO no bucket" — um incidente de gravidade máxima — por causa de
# um erro de digitação.
if [[ -n "${OBJETO_ALVO}" ]] && ! [[ "${OBJETO_ALVO}" =~ ^iris-[0-9]{8}T[0-9]{6}Z\.dump\.age$ ]]; then
	log_error "argumento inválido: '${OBJETO_ALVO}'. Esperado o nome do DUMP cifrado, no formato iris-YYYYMMDDTHHMMSSZ.dump.age (o nome dos globals é derivado dele). Sem argumento, verifica o par mais recente."
	exit 1
fi

if [[ -t 0 ]]; then
	log_error "stdin é um terminal — a chave privada age não foi passada. Ver o cabeçalho deste arquivo para a linha de comando completa."
	exit 1
fi

readonly IDENTITY_FILE="${TMP_DIR}/identity"
(
	umask 077
	cat >"${IDENTITY_FILE}"
)

if ! grep -q '^AGE-SECRET-KEY-' "${IDENTITY_FILE}"; then
	log_error "o que veio por stdin não contém uma linha AGE-SECRET-KEY-. Passar a chave PRIVADA (o arquivo do age-keygen), não a pública age1... . O conteúdo não é logado."
	exit 1
fi

# --- alias do mc --------------------------------------------------------------
# Credenciais por stdin, mesmo motivo do backup.sh: segredo em argv fica visível
# em `ps` e /proc/<pid>/cmdline, e MC_HOST_<alias> é uma URL que quebra com `/`
# e `+` no secret.
if ! saida_alias="$(
	printf '%s\n%s\n' "${OFFSITE_S3_ACCESS_KEY}" "${OFFSITE_S3_SECRET_KEY}" \
		| mc alias set "${MC_ALIAS}" "${OFFSITE_S3_ENDPOINT}" --api S3v4 --path "${OFFSITE_PATH_STYLE}" 2>&1
)"; then
	# O mc ecoa a chave inválida na mensagem de erro — redigir antes de logar.
	log_error "mc alias set falhou: ${saida_alias//${OFFSITE_S3_SECRET_KEY}/***}"
	exit 1
fi

log_info "bucket=${OFFSITE_S3_BUCKET} região=${OFFSITE_REGION:-us-east-1 (default do mc)} path-style=${OFFSITE_PATH_STYLE}"

# --- escolha do par a verificar ------------------------------------------------
if ! listagem="$(MC_REGION="${OFFSITE_REGION}" mc ls "${MC_ALIAS}/${OFFSITE_S3_BUCKET}/" 2>&1)"; then
	log_error "não foi possível LISTAR ${OFFSITE_S3_BUCKET}. Se a credencial de produção é write-only (por design, sem DeleteObject), ela pode também não ter leitura — gerar uma credencial de LEITURA só para esta verificação e revogá-la depois. Resposta: ${listagem}"
	exit 1
fi

if [[ -n "${OBJETO_ALVO}" ]]; then
	NOME_DUMP="${OBJETO_ALVO}"
else
	# Ordena por nome: o timestamp é ISO-8601 básico UTC (iris-YYYYMMDDTHHMMSSZ),
	# então ordem lexicográfica == ordem cronológica. Não depende do campo de
	# data do `mc ls`, que muda de formato entre versões.
	# `|| true` obrigatório: bucket vazio faz `mc ls` sair 0 com saída vazia, o
	# grep sair 1, e o `pipefail` matar o script AQUI — antes da mensagem que
	# explica que o bucket está vazio. Erro silencioso num script cujo trabalho
	# é diagnosticar é a pior falha possível.
	NOME_DUMP="$(printf '%s\n' "${listagem}" | grep -oE 'iris-[0-9]{8}T[0-9]{6}Z\.dump\.age' | sort | tail -1 || true)"
fi
readonly NOME_DUMP

if [[ -z "${NOME_DUMP}" ]]; then
	log_error "nenhum objeto iris-*.dump.age em ${OFFSITE_S3_BUCKET}. O bucket existe e responde, mas está VAZIO — a réplica nunca subiu, ou subiu para outro bucket."
	exit 1
fi

# O par nasce e morre junto: o globals tem o MESMO timestamp do dump. Derivar o
# nome em vez de pegar "o globals mais recente" evita verificar um dump de hoje
# contra um globals de semana passada e concluir que está tudo bem.
readonly CARIMBO="${NOME_DUMP%.dump.age}"
readonly NOME_GLOBALS="${CARIMBO}.globals.sql.age"

log_info "verificando o par ${NOME_DUMP} + ${NOME_GLOBALS}"

# --- download ------------------------------------------------------------------
for objeto in "${NOME_DUMP}" "${NOME_GLOBALS}"; do
	# Capturar o stderr do mc, não descartá-lo: a credencial de produção é
	# write-only por design, então `ListBucket` sem `GetObject` é um desfecho
	# provável. Sem a resposta do provedor, um 403 AccessDenied fica
	# indistinguível de um 404, e a mensagem abaixo — que afirma uma causa —
	# manda o operador tratar como par incompleto (incidente classe PR #85) uma
	# réplica íntegra com credencial errada.
	if ! saida_cp="$(MC_REGION="${OFFSITE_REGION}" mc cp --quiet \
		"${MC_ALIAS}/${OFFSITE_S3_BUCKET}/${objeto}" "${TMP_DIR}/${objeto}" 2>&1)"; then
		log_error "falha ao baixar ${objeto}. Se for negação de acesso, é a credencial (a de produção é write-only — gerar uma de LEITURA temporária). Se for objeto inexistente e o outro do par tiver baixado, o par está INCOMPLETO no bucket — um restore com esse artefato recria as tabelas e nenhuma policy de RLS (ver PR #85). Resposta: ${saida_cp//${OFFSITE_S3_SECRET_KEY}/***}"
		exit 1
	fi
done

# --- o que está no bucket está mesmo cifrado ------------------------------------
for objeto in "${NOME_DUMP}" "${NOME_GLOBALS}"; do
	if ! head -c 21 "${TMP_DIR}/${objeto}" | grep -q 'age-encryption.org'; then
		log_error "${objeto} NÃO tem header age. Isso significa que subiu algo que não passou pela cifra — tratar como INCIDENTE de vazamento: dado clínico em claro num bucket de terceiro."
		exit 1
	fi
done

log_info "ambos os artefatos têm header age (estão cifrados no bucket)"

# --- decifra --------------------------------------------------------------------
# É AQUI que mora o desastre silencioso que este script existe para achar: uma
# réplica cifrada com uma chave pública cuja privada ninguém guardou passa por
# todas as verificações anteriores e falha só nesta.
if ! age -d -i "${IDENTITY_FILE}" -o "${TMP_DIR}/${CARIMBO}.dump" "${TMP_DIR}/${NOME_DUMP}" 2>"${TMP_DIR}/age.err"; then
	log_error "NÃO FOI POSSÍVEL DECIFRAR ${NOME_DUMP} com a chave fornecida. A réplica off-site existe e é INÚTIL até isto ser resolvido. Verificar se a chave privada é o par de OFFSITE_AGE_RECIPIENT configurado no VPS. Detalhe do age: $(tr -d '\n' <"${TMP_DIR}/age.err")"
	exit 1
fi

if ! age -d -i "${IDENTITY_FILE}" -o "${TMP_DIR}/${CARIMBO}.globals.sql" "${TMP_DIR}/${NOME_GLOBALS}" 2>"${TMP_DIR}/age.err"; then
	log_error "dump decifrou mas os globals NÃO — par cifrado com chaves diferentes. Detalhe do age: $(tr -d '\n' <"${TMP_DIR}/age.err")"
	exit 1
fi

log_info "decifra OK (dump + globals)"

# --- o dump decifrado é restaurável ---------------------------------------------
if ! pg_restore --list "${TMP_DIR}/${CARIMBO}.dump" >"${TMP_DIR}/toc.txt" 2>"${TMP_DIR}/pg.err"; then
	log_error "o artefato decifrou mas pg_restore --list o rejeita — não é um dump Postgres válido. Detalhe: $(tr -d '\n' <"${TMP_DIR}/pg.err")"
	exit 1
fi

# Um dump VAZIO também passa no `--list`. Contar objetos é o que separa "é um
# dump" de "é o backup de um banco com dado dentro".
#
# Contado por CAMPO, não por substring: a linha de dados do TOC é
# `<id>; <oid> <oid> TABLE DATA <schema> <tabela> <dono>`, então um `grep ' TABLE '`
# casa também com ela e reporta o dobro das tabelas. Número errado no artefato
# cuja função inteira é servir de evidência é pior do que número nenhum.
N_TABELAS="$(awk '$4 == "TABLE" && $5 != "DATA"' "${TMP_DIR}/toc.txt" | wc -l)"
N_DADOS="$(awk '$4 == "TABLE" && $5 == "DATA"' "${TMP_DIR}/toc.txt" | wc -l)"

if [[ "${N_TABELAS}" -lt 1 ]]; then
	log_error "o dump decifra e é válido, mas não tem NENHUMA tabela. Backup de banco vazio — verificar PGDATABASE no serviço de backup."
	exit 1
fi

# Schema sem dado é um desfecho real e silencioso: `pg_dump --schema-only` por
# engano produz um artefato que decifra, passa no `--list` e tem todas as
# tabelas. No dia do desastre ele restaura um banco vazio. O cabeçalho promete
# "com tabelas E com dado" — aqui é onde a promessa é cobrada.
if [[ "${N_DADOS}" -lt 1 ]]; then
	log_error "o dump tem ${N_TABELAS} tabela(s) mas NENHUMA entrada TABLE DATA — é um dump só de schema. Restaurar isto recria a estrutura e ZERO dado clínico. Verificar as flags do pg_dump no backup.sh."
	exit 1
fi

log_info "dump restaurável: ${N_TABELAS} tabela(s), ${N_DADOS} com dado"

# --- os globals trazem as roles --------------------------------------------------
# O furo do PR #85: roles são objeto de CLUSTER e não entram no pg_dump. Restore
# sem elas recria as 37 tabelas e falha em TODO `CREATE POLICY ... TO app_role`
# — banco com dado clínico e ZERO isolamento multi-tenant, sem erro fatal
# visível. Se o off-site perder os globals, o furo volta por aqui.
FALTANDO=()
for role in app_role iris_auth; do
	if ! grep -qE "CREATE ROLE ${role}\b" "${TMP_DIR}/${CARIMBO}.globals.sql"; then
		FALTANDO+=("${role}")
	fi
done

if [[ "${#FALTANDO[@]}" -gt 0 ]]; then
	log_error "globals decifram mas NÃO contêm CREATE ROLE de: ${FALTANDO[*]}. Um restore com este par recria as tabelas e nenhuma policy de RLS (PR #85)."
	exit 1
fi

log_info "globals contêm as roles de RLS (app_role, iris_auth)"

# --- fecho: sha256 do dump decifrado ---------------------------------------------
SHA_DUMP="$(sha256sum "${TMP_DIR}/${CARIMBO}.dump" | cut -d' ' -f1)"
SHA_GLOBALS="$(sha256sum "${TMP_DIR}/${CARIMBO}.globals.sql" | cut -d' ' -f1)"

log_info "sha256 do dump decifrado    = ${SHA_DUMP}"
log_info "sha256 dos globals decifrados = ${SHA_GLOBALS}"
log_info "conferir contra as linhas 'sha256=' do log do backup.sh de ${CARIMBO}: se batem, o artefato restaurável é exatamente o que o VPS gerou."
log_info "RÉPLICA OFF-SITE VERIFICADA: ${CARIMBO} é restaurável."
