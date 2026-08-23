#!/usr/bin/env bash
# expurgo-offsite.sh — AUDITORIA (e, sob flag explícita, expurgo) das cópias de
# segurança off-site (OCI S3 / Oracle Cloud) com mais de 30 dias (LGPD Art. 46).
#
# POR QUE ISTO EXISTE:
# O script de backup local (infra/backup/backup.sh) executa prune automático de
# 30 dias (RETENTION_DAYS=30) nos volumes locais e no MinIO local. A retenção
# off-site é regida por uma Lifecycle Rule configurada NO PROVEDOR — fora deste
# repositório. Este script não substitui essa regra: ele MEDE se ela está
# funcionando, e falha alto quando não está.
#
# POR QUE AUDITAR É O PADRÃO E EXPURGAR É OPT-IN:
# A credencial do destino off-site é write-only de propósito (sem DeleteObject,
# sem CreateBucket — ver §"o terceiro destino" em infra/README.md). É essa
# ausência de permissão que impede um VPS comprometido de APAGAR a cópia de
# recuperação de desastre. Se este script expurgasse por padrão, a credencial
# usada por ele precisaria de DeleteObject — e a propriedade de segurança
# morreria em troca de conveniência. Então: por padrão só mede e reporta; a
# exclusão ativa exige `--expurgar` E uma credencial separada, de operação
# manual, com permissão de exclusão.
#
# COMO A IDADE É MEDIDA:
# Pelo mtime do objeto no bucket (metadado do storage), via `mc find
# --older-than` — o MESMO predicado e a MESMA flag que `mc rm --older-than`
# usa para excluir. Auditoria e expurgo enxergam exatamente o mesmo conjunto.
# NÃO se usa o carimbo do NOME do arquivo (iris-YYYYMMDDTHHMMSSZ...): nome é
# texto escolhido por quem sobe, mtime é fato registrado por quem armazena, e
# medir por um e excluir por outro faz o script relatar não-conformidade que a
# exclusão nunca alcança.
#
# USO:
#   export OFFSITE_S3_ENDPOINT=https://<namespace>.compat.objectstorage.<região>.oraclecloud.com
#   export OFFSITE_S3_ACCESS_KEY=...
#   export OFFSITE_S3_SECRET_KEY=...
#   export OFFSITE_S3_BUCKET=iris-backups-offsite
#   export RETENTION_DAYS=30
#   ./infra/backup/expurgo-offsite.sh                # AUDITA (padrão, não apaga nada)
#   ./infra/backup/expurgo-offsite.sh --expurgar     # audita E apaga (exige DeleteObject)
#
# EXIT CODE:
#   0 = EM CONFORMIDADE: nenhum objeto com idade > RETENTION_DAYS no bucket.
#   1 = ERRO OU NÃO-CONFORMIDADE: falha de execução, bucket vazio/inacessível,
#       ou objetos com idade > RETENTION_DAYS presentes ao fim da execução.

set -Eeuo pipefail
IFS=$'\n\t'

log_info() {
	printf '[expurgo-offsite] %s\n' "$*"
}

log_error() {
	printf '[expurgo-offsite] ERRO: %s\n' "$*" >&2
}

# shellcheck disable=SC2329 # invocada indiretamente via `trap ... ERR`
on_error() {
	local exit_code=$?
	log_error "falha na linha ${1:-desconhecida} (exit ${exit_code})"
	exit "${exit_code}"
}
trap 'on_error ${LINENO}' ERR

# --- argumentos / flags ------------------------------------------------------
# EXPURGAR=0 é o padrão e é uma decisão de segurança, não uma conveniência —
# ver o cabeçalho. `--dry-run`/`--check-only` são o padrão dito em voz alta:
# existem para quem quer deixar explícito no cron/painel que aquela invocação
# não apaga, e para não quebrar chamadas já escritas.
EXPURGAR=0
for arg in "$@"; do
	case "${arg}" in
		--dry-run|--check-only)
			EXPURGAR=0
			;;
		--expurgar|--purge)
			EXPURGAR=1
			;;
		*)
			log_error "argumento não reconhecido: ${arg}. Uso: $0 [--check-only|--dry-run|--expurgar]"
			exit 1
			;;
	esac
done

# --- validação de ambiente ----------------------------------------------------
verificar_env_obrigatoria() {
	local nome="$1"
	local valor="${!nome:-}"
	if [[ -z "${valor}" ]]; then
		log_error "${nome} é obrigatório e não foi definido."
		exit 1
	fi
	if [[ "${valor}" == *'<'*'>'* ]]; then
		log_error "${nome} contém um placeholder não substituído (formato <...>)."
		exit 1
	fi
}

verificar_env_obrigatoria OFFSITE_S3_ENDPOINT
verificar_env_obrigatoria OFFSITE_S3_ACCESS_KEY
verificar_env_obrigatoria OFFSITE_S3_SECRET_KEY

readonly OFFSITE_S3_BUCKET="${OFFSITE_S3_BUCKET:-iris-backups-offsite}"
readonly OFFSITE_REGION="${OFFSITE_S3_REGION:-}"
readonly OFFSITE_PATH_STYLE="${OFFSITE_S3_PATH_STYLE:-auto}"
readonly RETENTION_DAYS="${RETENTION_DAYS:-30}"

if ! [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
	log_error "RETENTION_DAYS precisa ser um inteiro >= 0 (recebido: '${RETENTION_DAYS}')."
	exit 1
fi

if ! [[ "${OFFSITE_PATH_STYLE}" =~ ^(auto|on|off)$ ]]; then
	log_error "OFFSITE_S3_PATH_STYLE precisa ser auto, on ou off (recebido: '${OFFSITE_PATH_STYLE}')."
	exit 1
fi

readonly IDADE_LIMITE="${RETENTION_DAYS}d"

# Diretório temporário para configuração do mc, destruído ao sair
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/.expurgo-offsite.XXXXXX")"
readonly TMP_DIR
chmod 700 "${TMP_DIR}"
export MC_CONFIG_DIR="${TMP_DIR}/mc"

limpar() {
	rm -rf -- "${TMP_DIR}"
}
trap limpar EXIT

readonly MC_ALIAS="irisexpurge"

# Redige o secret de qualquer texto antes de ele virar log. O mc ecoa a URL
# completa em várias mensagens de erro.
redigir() {
	printf '%s' "${1//${OFFSITE_S3_SECRET_KEY}/***}"
}

mc_configurar_alias() {
	local alias="$1" endpoint="$2" access_key="$3" secret_key="$4" path_style="${5:-auto}"
	local saida

	if saida="$(
		printf '%s\n%s\n' "${access_key}" "${secret_key}" \
			| mc alias set "${alias}" "${endpoint}" --api S3v4 --path "${path_style}" 2>&1
	)"; then
		return 0
	fi

	log_error "mc alias set falhou para '${alias}': $(redigir "${saida}")"
	return 1
}

if ! mc_configurar_alias "${MC_ALIAS}" "${OFFSITE_S3_ENDPOINT}" \
	"${OFFSITE_S3_ACCESS_KEY}" "${OFFSITE_S3_SECRET_KEY}" "${OFFSITE_PATH_STYLE}"; then
	exit 1
fi

if [[ "${EXPURGAR}" -eq 1 ]]; then
	MODO="EXPURGO ATIVO (--expurgar: exige credencial com DeleteObject)"
else
	MODO="AUDITORIA (padrão: NÃO apaga nada)"
fi
readonly MODO

log_info "bucket=${OFFSITE_S3_BUCKET} · retenção=${IDADE_LIMITE} · modo=${MODO}"

# --- o bucket precisa estar acessível E ter conteúdo --------------------------
# "Listagem vazia" NÃO é prova de conformidade. Um bucket de backup vazio é uma
# das três coisas, e nenhuma delas é boa: (a) a credencial não tem ListObjects e
# o provedor devolve conjunto vazio em vez de negar; (b) o bucket/endpoint está
# errado e estamos auditando um lugar onde nada nunca foi escrito; (c) o bucket
# é o certo e o backup off-site parou de subir. Sair 0 aqui carimbaria
# "CONFORMIDADE VERIFICADA" em cima de um destino de recuperação de desastre
# INEXISTENTE — o modo de falha mais caro que este script poderia ter.
if ! listagem="$(MC_REGION="${OFFSITE_REGION}" mc ls "${MC_ALIAS}/${OFFSITE_S3_BUCKET}/" 2>&1)"; then
	log_error "não foi possível listar ${OFFSITE_S3_BUCKET}. Resposta do mc: $(redigir "${listagem}")"
	exit 1
fi

if [[ -z "${listagem// /}" ]]; then
	log_error "bucket ${OFFSITE_S3_BUCKET} está VAZIO — isto NÃO é prova de conformidade."
	log_error "Um bucket de backup sem NENHUM objeto significa credencial sem ListObjects, bucket/endpoint errado, ou replicação off-site parada. Verificar antes de tratar a retenção como em dia."
	exit 1
fi

# --- objetos expirados (mtime > RETENTION_DAYS) -------------------------------
# `mc find --older-than` é o MESMO predicado de `mc rm --older-than`. Auditar e
# expurgar com a mesma flag é o que garante que o conjunto relatado é o conjunto
# que a exclusão alcança.
#
# `--ignore "tombstones-*"` exclui o ledger de tombstones LGPD (issue #89) do
# expurgo por idade. O ledger é gravado com esse prefixo de propósito — ver
# infra/backup/backup.sh, TOMBSTONES_NAME — justamente para sobreviver além dos
# RETENTION_DAYS do dump. Sem esta exclusão, um `--expurgar` apaga o ledger
# junto do dump e o restore.sh perde a fonte de reaplicação dos expurgos.
listar_expirados() {
	MC_REGION="${OFFSITE_REGION}" mc find "${MC_ALIAS}/${OFFSITE_S3_BUCKET}/" \
		--older-than "${IDADE_LIMITE}" --ignore "tombstones-*" 2>&1
}

if ! expirados_antes="$(listar_expirados)"; then
	log_error "falha ao consultar objetos expirados: $(redigir "${expirados_antes}")"
	exit 1
fi

contar() {
	[[ -z "${1// /}" ]] && { printf '0'; return; }
	printf '%s' "$1" | grep -c '' || true
}

NUM_ANTES="$(contar "${expirados_antes}")"
log_info "objetos com idade > ${IDADE_LIMITE} encontrados: ${NUM_ANTES}"

if [[ "${NUM_ANTES}" -gt 0 ]]; then
	printf '%s\n' "${expirados_antes}" | sed 's/^/[expurgo-offsite]   expirado: /'
fi

# --- expurgo ativo (somente sob --expurgar) -----------------------------------
if [[ "${EXPURGAR}" -eq 1 && "${NUM_ANTES}" -gt 0 ]]; then
	log_info "executando expurgo ativo (mc rm --older-than ${IDADE_LIMITE}, ledger tombstones-* excluído)..."
	if ! saida_rm="$(MC_REGION="${OFFSITE_REGION}" mc rm --recursive --force \
		--older-than "${IDADE_LIMITE}" --ignore "tombstones-*" "${MC_ALIAS}/${OFFSITE_S3_BUCKET}/" 2>&1)"; then
		log_error "mc rm falhou — a credencial provavelmente não tem DeleteObject (o que é o desenho padrão do destino off-site). Resposta: $(redigir "${saida_rm}")"
	fi
fi

# --- auditoria final ----------------------------------------------------------
# Sempre remede depois, inclusive no modo auditoria: é a medição pós-estado que
# vale, não a intenção declarada antes.
if ! expirados_depois="$(listar_expirados)"; then
	log_error "falha ao remedir objetos expirados para a auditoria final: $(redigir "${expirados_depois}")"
	exit 1
fi

NUM_DEPOIS="$(contar "${expirados_depois}")"

if [[ "${NUM_DEPOIS}" -gt 0 ]]; then
	if [[ "${EXPURGAR}" -eq 1 ]]; then
		log_error "EXPURGO OFF-SITE INCOMPLETO: ${NUM_DEPOIS} objeto(s) com idade > ${IDADE_LIMITE} permanece(m) após o expurgo. Credencial sem DeleteObject?"
	else
		log_error "RETENÇÃO OFF-SITE NÃO CONFORME: ${NUM_DEPOIS} objeto(s) com idade > ${IDADE_LIMITE} no bucket ${OFFSITE_S3_BUCKET}."
		log_error "Este script roda em modo AUDITORIA e NÃO apaga por padrão. Confirmar a Lifecycle Rule de ${RETENTION_DAYS} dias no console da OCI; se ela estiver ausente, criá-la (caminho preferido) ou rodar este script com --expurgar usando a credencial de operação com DeleteObject."
	fi
	exit 1
fi

log_info "CONFORMIDADE LGPD ART. 46 VERIFICADA: o bucket ${OFFSITE_S3_BUCKET} não contém nenhum objeto com idade > ${RETENTION_DAYS} dias."
exit 0
