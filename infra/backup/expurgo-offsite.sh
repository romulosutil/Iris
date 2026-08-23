#!/usr/bin/env bash
# expurgo-offsite.sh — automação e auditoria do expurgo de cópias de segurança
# off-site (OCI S3 / Oracle Cloud) com mais de 30 dias (LGPD Art. 46).
#
# POR QUE ISTO EXISTE:
# O script de backup local (infra/backup/backup.sh) executa prune automático de
# 30 dias (RETENTION_DAYS=30) nos volumes locais e no MinIO local. A retenção
# off-site no bucket da Oracle Cloud (OCI S3) é regida por uma Lifecycle Rule no
# provedor. Este script fornece a verificação/expurgo automatizado no repositório
# para garantir que nenhum artefato com mais de RETENTION_DAYS dias permaneça no
# bucket off-site, assegurando a conformidade técnica contínua com o Art. 46 da LGPD.
#
# USO:
#   export OFFSITE_S3_ENDPOINT=https://<namespace>.compat.objectstorage.<região>.oraclecloud.com
#   export OFFSITE_S3_ACCESS_KEY=...
#   export OFFSITE_S3_SECRET_KEY=...
#   export OFFSITE_S3_BUCKET=iris-backups-offsite
#   export RETENTION_DAYS=30
#   ./infra/backup/expurgo-offsite.sh [--dry-run|--check-only]
#
# EXIT CODE:
#   0 = SUCESSO / EM CONFORMIDADE: expurgo executado (se habilitado) e
#       nenhum objeto com idade > RETENTION_DAYS permanece no bucket off-site.
#   1 = ERRO OU NÃO-CONFORMIDADE: falha de execução ou detectados objetos com idade
#       > RETENTION_DAYS que não puderam ser expurgados.

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
DRY_RUN=0
for arg in "$@"; do
	case "${arg}" in
		--dry-run|--check-only)
			DRY_RUN=1
			;;
		*)
			log_error "argumento não reconhecido: ${arg}. Uso: $0 [--dry-run|--check-only]"
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

mc_configurar_alias() {
	local alias="$1" endpoint="$2" access_key="$3" secret_key="$4" path_style="${5:-auto}"
	local saida

	if saida="$(
		printf '%s\n%s\n' "${access_key}" "${secret_key}" \
			| mc alias set "${alias}" "${endpoint}" --api S3v4 --path "${path_style}" 2>&1
	)"; then
		return 0
	fi

	if [[ -n "${secret_key}" ]]; then
		saida="${saida//${secret_key}/***}"
	fi
	log_error "mc alias set falhou para '${alias}': ${saida}"
	return 1
}

if ! mc_configurar_alias "${MC_ALIAS}" "${OFFSITE_S3_ENDPOINT}" \
	"${OFFSITE_S3_ACCESS_KEY}" "${OFFSITE_S3_SECRET_KEY}" "${OFFSITE_PATH_STYLE}"; then
	exit 1
fi

log_info "iniciando verificação de expurgo no bucket ${OFFSITE_S3_BUCKET} (retenção: ${RETENTION_DAYS}d, dry-run: ${DRY_RUN})"

# --- listagem do bucket -------------------------------------------------------
if ! listagem="$(MC_REGION="${OFFSITE_REGION}" mc ls "${MC_ALIAS}/${OFFSITE_S3_BUCKET}/" 2>&1)"; then
	log_error "não foi possível listar ${OFFSITE_S3_BUCKET}. Resposta do mc: ${listagem//${OFFSITE_S3_SECRET_KEY}/***}"
	exit 1
fi

if [[ -z "${listagem}" ]]; then
	log_info "bucket ${OFFSITE_S3_BUCKET} está VAZIO. NENHUM objeto expirado encontrado."
	log_info "CONFORMIDADE LGPD ART. 46 VERIFICADA: 0 objetos com idade > ${RETENTION_DAYS}d."
	exit 0
fi

# --- cálculo de corte por timestamp ISO ---------------------------------------
AGORA_EPOCH="$(date +%s)"
INTERVALO_S=$((RETENTION_DAYS * 86400))
CUTOFF_EPOCH=$((AGORA_EPOCH - INTERVALO_S))
CUTOFF_ISO="$(date -u -d "@${CUTOFF_EPOCH}" +%Y%m%dT%H%M%SZ)"
readonly CUTOFF_ISO

log_info "corte de retenção calculado: ${CUTOFF_ISO} (objetos com carimbo anterior a este limite são considerados expirados)"

# --- remoção ativa (se não for dry-run) --------------------------------------
if [[ "${DRY_RUN}" -eq 0 ]]; then
	log_info "executando expurgo ativo no bucket ${MC_ALIAS}/${OFFSITE_S3_BUCKET} para objetos com mais de ${RETENTION_DAYS}d..."
	if ! saida_rm="$(MC_REGION="${OFFSITE_REGION}" mc rm --recursive --force --older-than "${RETENTION_DAYS}d" "${MC_ALIAS}/${OFFSITE_S3_BUCKET}/" 2>&1)"; then
		log_info "aviso: 'mc rm --older-than' retornou código não-zero (possível credencial sem permissão de exclusão DeleteObject). Resposta: ${saida_rm//${OFFSITE_S3_SECRET_KEY}/***}"
	fi
fi

# --- auditoria de conformidade pós-expurgo -----------------------------------
if ! listagem_pos="$(MC_REGION="${OFFSITE_REGION}" mc ls "${MC_ALIAS}/${OFFSITE_S3_BUCKET}/" 2>&1)"; then
	log_error "falha ao relistar bucket para auditoria de conformidade."
	exit 1
fi

OBJETOS_EXPIRADOS=()

while IFS= read -r linha; do
	[[ -z "${linha}" ]] && continue
	# Extrai nome do objeto no formato iris-YYYYMMDDTHHMMSSZ.*.age
	if [[ "${linha}" =~ (iris-[0-9]{8}T[0-9]{6}Z\.[a-zA-Z0-9\._\-]+) ]]; then
		nome_obj="${BASH_REMATCH[1]}"
		carimbo="${nome_obj%%.*}" # iris-YYYYMMDDTHHMMSSZ
		carimbo_puro="${carimbo#iris-}" # YYYYMMDDTHHMMSSZ

		if [[ "${carimbo_puro}" < "${CUTOFF_ISO}" ]]; then
			log_error "objeto expirado detectado: ${nome_obj} (carimbo: ${carimbo_puro} < corte: ${CUTOFF_ISO})"
			OBJETOS_EXPIRADOS+=("${nome_obj}")
		fi
	fi
done <<< "${listagem_pos}"

NUM_EXPIRADOS="${#OBJETOS_EXPIRADOS[@]}"

if [[ "${NUM_EXPIRADOS}" -gt 0 ]]; then
	if [[ "${DRY_RUN}" -eq 1 ]]; then
		log_error "AUDITORIA DE RETENÇÃO OFF-SITE: ${NUM_EXPIRADOS} objeto(s) com idade > ${RETENTION_DAYS}d encontrado(s) no bucket em modo --dry-run."
	else
		log_error "EXPURGO OFF-SITE INCOMPLETO: ${NUM_EXPIRADOS} objeto(s) com idade > ${RETENTION_DAYS}d permanece(m) no bucket após o expurgo. Se a credencial for write-only, verifique se a Lifecycle Rule de 30 dias está ativa no painel da OCI."
	fi
	exit 1
fi

log_info "CONFORMIDADE LGPD ART. 46 VERIFICADA: o bucket ${OFFSITE_S3_BUCKET} não contém nenhum objeto com idade > ${RETENTION_DAYS} dias."
exit 0
