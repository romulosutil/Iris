#!/usr/bin/env bash
# backup.sh — dump agendado do Postgres do Iris (pg_dump -Fc) com verificação
# de integridade, upload pro MinIO e prune de retenção local + remoto.
#
# Contrato de env vars (ver infra/backup/ para o restante do serviço):
#   PGHOST            obrigatório
#   PGPORT            default 5432
#   PGUSER            obrigatório
#   PGPASSWORD        obrigatório (nunca logar)
#   PGDATABASE        obrigatório
#   BACKUP_DIR        default /backups
#   RETENTION_DAYS    default 30
#   S3_ENDPOINT       opcional — vazio = pula upload (dev local sem MinIO)
#   S3_ACCESS_KEY     obrigatório SE S3_ENDPOINT setado
#   S3_SECRET_KEY     obrigatório SE S3_ENDPOINT setado
#   S3_BACKUP_BUCKET  default iris-backups
#
# Exit code: 0 = sucesso completo. != 0 = alguma etapa falhou (o schedule do
# Easypanel precisa detectar isso, então nunca "engolimos" erro aqui).
#
# Ordem de execução (cada etapa só roda se a anterior for segura):
#   1. dump do banco em arquivo TEMPORÁRIO (nunca no nome final)
#   2. dump de GLOBALS (roles/grants de cluster) em arquivo TEMPORÁRIO — ver
#      seção "globals" abaixo. pg_dump só dumpa UM banco; roles (CREATE ROLE,
#      GRANT de role) são objetos de CLUSTER e não entram nele. Sem este
#      segundo artefato, um restore em cluster novo recria as 37 tabelas mas
#      falha em TODO `CREATE POLICY ... TO app_role/iris_auth` porque a role
#      não existe — resultado: banco com dado clínico e ZERO isolamento
#      multi-tenant, sem nenhum erro fatal visível. Já reproduzido e corrigido.
#   3. verificação de integridade dos DOIS arquivos — falha em qualquer um
#      ABORTA tudo: não renomeia nenhum, não sobe pro S3, não faz prune. Os
#      dois artefatos são um par: nunca existe "backup do dia" com só um.
#   4. rename atômico tmp -> nome final dos dois (só íntegro vira "o backup do dia")
#   5. upload pro MinIO dos dois (se configurado)
#   6. prune local + remoto por retenção (dump E globals)

set -Eeuo pipefail
IFS=$'\n\t'

# --- estado global de saída -------------------------------------------------
# EXIT_CODE começa em 0; qualquer etapa não-fatal-mas-com-falha (ex.: upload
# pro S3 falhou depois de um dump local válido) marca 1 aqui em vez de sair
# na hora, para não pular o prune local (que é independente do S3).
EXIT_CODE=0

log_info() {
	printf '[backup] %s\n' "$*"
}

log_error() {
	printf '[backup] ERRO: %s\n' "$*" >&2
}

# Configura o alias do mc lendo as credenciais por STDIN.
#
# Por que não `MC_HOST_<alias>="scheme://KEY:SECRET@host"`: aquilo é uma URL, e
# segredo de MinIO é tipicamente base64 — contém `/` e `+`. Um `/` cru encerra o
# campo userinfo e o mc lê o resto como path; a autenticação falha com erro que
# não aponta pra causa. E percent-encodar NÃO resolve: verificado que este mc
# não faz percent-decode do userinfo, então `%2F` chega como três caracteres
# literais e o segredo fica errado ("signature does not match").
#
# Por que não `mc alias set ALIAS URL KEY SECRET`: credencial em argv fica
# visível em `ps` e /proc/<pid>/cmdline.
#
# `mc alias set ALIAS URL` sem as chaves lê Access Key e Secret Key de stdin —
# não passa por parsing de URL (aceita qualquer caractere) e não vai pra argv.
# Custo: o mc grava as chaves em texto plano no config.json. Por isso
# MC_CONFIG_DIR aponta pra um diretório temporário 0700 apagado no EXIT, fora do
# volume persistente `/backups`.
mc_configurar_alias() {
	printf '%s\n%s\n' "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" \
		| mc alias set "${MC_ALIAS}" "${S3_ENDPOINT}" --api S3v4 >/dev/null 2>&1
}

# shellcheck disable=SC2329 # invocada indiretamente via `trap ... ERR`
on_error() {
	local exit_code=$?
	local line_no=${1:-desconhecida}
	log_error "falha na linha ${line_no} (exit ${exit_code})"
	exit "${exit_code}"
}
trap 'on_error ${LINENO}' ERR

# --- argv ------------------------------------------------------------------
# backup.sh não aceita argumento. Falhar alto aqui é proposital: se alguém
# invocar `... backup ./verify-restore.sh` e o script for chamado com esse
# caminho como argv, o pior desfecho possível seria rodar um backup, sair 0 e
# o operador concluir que o teste de restore passou. Melhor quebrar.
if [[ $# -gt 0 ]]; then
	log_error "backup.sh não aceita argumentos (recebido: $*). Para rodar outro script use \`docker compose ... run --rm backup ./verify-restore.sh\`."
	exit 2
fi

# --- validação de env obrigatória ------------------------------------------
: "${PGHOST:?PGHOST é obrigatório}"
: "${PGUSER:?PGUSER é obrigatório}"
: "${PGPASSWORD:?PGPASSWORD é obrigatório}"
: "${PGDATABASE:?PGDATABASE é obrigatório}"

readonly PGPORT="${PGPORT:-5432}"
readonly BACKUP_DIR="${BACKUP_DIR:-/backups}"
readonly RETENTION_DAYS="${RETENTION_DAYS:-30}"
readonly S3_ENDPOINT="${S3_ENDPOINT:-}"
readonly S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
readonly S3_SECRET_KEY="${S3_SECRET_KEY:-}"
readonly S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-iris-backups}"

if [[ -n "${S3_ENDPOINT}" ]]; then
	: "${S3_ACCESS_KEY:?S3_ACCESS_KEY é obrigatório quando S3_ENDPOINT está setado}"
	: "${S3_SECRET_KEY:?S3_SECRET_KEY é obrigatório quando S3_ENDPOINT está setado}"
fi

if ! [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
	log_error "RETENTION_DAYS precisa ser inteiro >= 0, recebido: ${RETENTION_DAYS}"
	exit 1
fi

# PGPASSWORD é lido diretamente pela libpq (pg_dump/pg_restore) — nunca
# passamos senha em argv nem interpolamos PGHOST/PGUSER numa "connection
# string" que possa vazar em log de processo.
export PGPASSWORD

mkdir -p -- "${BACKUP_DIR}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly TIMESTAMP
readonly FINAL_NAME="iris-${TIMESTAMP}.dump"
readonly FINAL_PATH="${BACKUP_DIR}/${FINAL_NAME}"
# Globals do MESMO ciclo (mesmo TIMESTAMP) — é assim que restore.sh e
# verify-restore.sh encontram o irmão de um dump: trocando a extensão.
readonly GLOBALS_NAME="iris-${TIMESTAMP}.globals.sql"
readonly GLOBALS_PATH="${BACKUP_DIR}/${GLOBALS_NAME}"

# mktemp no MESMO diretório do destino final: garante que o rename posterior
# seja atômico (mesmo filesystem), nunca um "copy" que pode ficar pela metade.
# O template PRECISA terminar nos X: o mktemp do busybox (Alpine, que é a base
# desta imagem) rejeita sufixo depois deles — daí o `.tmp` vir antes.
TMP_PATH="$(mktemp "${BACKUP_DIR}/.${FINAL_NAME}.tmp.XXXXXX")"
readonly TMP_PATH
TMP_GLOBALS_PATH="$(mktemp "${BACKUP_DIR}/.${GLOBALS_NAME}.tmp.XXXXXX")"
readonly TMP_GLOBALS_PATH

# Config do mc fica num dir temporário 0700 FORA do volume persistente
# `/backups` — o `mc alias set` grava as credenciais em texto plano nele, e elas
# não podem sobreviver ao container nem entrar no volume de backup.
MC_CONFIG_DIR="$(mktemp -d "/tmp/.mc-iris.XXXXXX")"
export MC_CONFIG_DIR
chmod 700 -- "${MC_CONFIG_DIR}"

# shellcheck disable=SC2329 # invocada indiretamente via `trap ... EXIT`
cleanup_tmp() {
	# Se o script sair antes do rename (passo 4), nenhum tmp pode sobreviver
	# — evita lixo se acumulando e principalmente evita um dump/globals
	# truncado sendo confundido com um backup válido.
	if [[ -f "${TMP_PATH}" ]]; then
		rm -f -- "${TMP_PATH}"
	fi
	if [[ -f "${TMP_GLOBALS_PATH}" ]]; then
		rm -f -- "${TMP_GLOBALS_PATH}"
	fi
	# Credencial em texto plano não sobrevive ao script, mesmo em falha.
	if [[ -n "${MC_CONFIG_DIR:-}" && -d "${MC_CONFIG_DIR}" ]]; then
		rm -rf -- "${MC_CONFIG_DIR}"
	fi
}
trap cleanup_tmp EXIT

log_info "iniciando dump de ${PGDATABASE}@${PGHOST}:${PGPORT} -> ${TMP_PATH}"

START_EPOCH="$(date +%s)"

pg_dump \
	--host="${PGHOST}" \
	--port="${PGPORT}" \
	--username="${PGUSER}" \
	--dbname="${PGDATABASE}" \
	--format=custom \
	--file="${TMP_PATH}"

log_info "dump gerado, verificando integridade (pg_restore --list)"

# Verificação de integridade: um dump -Fc corrompido ou truncado falha aqui.
# Isso PRECISA rodar antes do rename — nunca deixamos um dump não verificado
# assumir o nome final (que o restore.sh trataria como válido).
if ! pg_restore --list "${TMP_PATH}" >/dev/null 2>&1; then
	log_error "dump falhou na verificação de integridade (pg_restore --list) — abortando, sem upload e sem prune"
	exit 1
fi

log_info "integridade OK"

# --- dump de globals (roles/grants de CLUSTER) -------------------------------
# pg_dump acima só cobre o banco ${PGDATABASE}. Roles (CREATE ROLE app_role,
# CREATE ROLE iris_auth, os GRANT de role a role) são objetos de CLUSTER —
# vivem fora de qualquer banco — e pg_dump nunca os inclui. `pg_dumpall
# --globals-only` é a ferramenta certa para isso.
#
# --no-role-passwords DE PROPÓSITO: o hash de senha de role é credencial, e
# este arquivo vai pro MinIO (offsite). Sem as senhas, o CREATE ROLE do dump
# recria a role mas com senha nula/inválida para login — por isso restore.sh
# loga um lembrete para o operador rodar `ALTER ROLE ... PASSWORD` logo após
# aplicar os globals, usando as env vars que ele já tem (mesmas do
# provisionamento original). Trocar "não vaza senha" por "operador re-seta
# senha manualmente" é a troca certa aqui — a role/GRANT (o que garante RLS)
# não depende de senha nenhuma.
log_info "gerando dump de globals (roles/grants de cluster) -> ${TMP_GLOBALS_PATH}"

pg_dumpall \
	--host="${PGHOST}" \
	--port="${PGPORT}" \
	--username="${PGUSER}" \
	--globals-only \
	--no-role-passwords \
	--file="${TMP_GLOBALS_PATH}"

# Verificação de integridade dos globals: arquivo não-vazio E contém pelo
# menos um CREATE ROLE. Um pg_dumpall que retornou vazio ou truncado (ex.:
# conexão caiu no meio) passaria pelo `exit 0` do pg_dumpall silenciosamente
# — esta checagem é o que pega isso. Falha aqui aborta TUDO: o dump do banco
# já está íntegro nesse ponto, mas um backup sem globals é exatamente o furo
# que este script existe para fechar, então nenhum dos dois vira "o backup
# do dia" (nem renomeia, nem sobe pro S3, nem entra no prune).
if [[ ! -s "${TMP_GLOBALS_PATH}" ]] || ! grep -q 'CREATE ROLE' "${TMP_GLOBALS_PATH}"; then
	log_error "dump de globals falhou na verificação de integridade (vazio ou sem CREATE ROLE) — abortando, sem upload e sem prune. Dump do banco também não vira backup do dia: os dois são um par."
	exit 1
fi

log_info "integridade dos globals OK"

# Rename atômico: só a partir daqui existe um "backup do dia" (dump + globals
# — os dois juntos, nunca um sem o outro).
mv -f -- "${TMP_PATH}" "${FINAL_PATH}"
mv -f -- "${TMP_GLOBALS_PATH}" "${GLOBALS_PATH}"

END_EPOCH="$(date +%s)"
DURATION_S=$((END_EPOCH - START_EPOCH))

# `stat -c %s` lê o tamanho do inode (metadado); `wc -c` streamaria o dump
# inteiro por stdin só para contar byte — I/O desnecessário num arquivo que
# cresce com o banco.
SIZE_BYTES="$(stat -c %s "${FINAL_PATH}")"
CHECKSUM="$(sha256sum "${FINAL_PATH}" | awk '{print $1}')"
GLOBALS_SIZE_BYTES="$(stat -c %s "${GLOBALS_PATH}")"
GLOBALS_CHECKSUM="$(sha256sum "${GLOBALS_PATH}" | awk '{print $1}')"

log_info "arquivo=${FINAL_NAME} tamanho_bytes=${SIZE_BYTES} duracao_s=${DURATION_S} sha256=${CHECKSUM}"
log_info "arquivo=${GLOBALS_NAME} tamanho_bytes=${GLOBALS_SIZE_BYTES} sha256=${GLOBALS_CHECKSUM}"

# --- upload pro MinIO --------------------------------------------------------
readonly MC_ALIAS="irisbackup"

if [[ -z "${S3_ENDPOINT}" ]]; then
	log_info "S3_ENDPOINT vazio — pulando upload (esperado em dev local sem MinIO)"
else
	# Alias configurado por stdin — ver mc_configurar_alias() para o porquê de
	# não usar MC_HOST_* (URL, quebra com `/` no segredo) nem argv (vaza em ps).
	if ! mc_configurar_alias; then
		log_error "falha ao configurar o alias do mc — conferir S3_ENDPOINT/credenciais (valores não são logados)"
		EXIT_CODE=1
	fi

	log_info "subindo ${FINAL_NAME} e ${GLOBALS_NAME} para ${MC_ALIAS}/${S3_BACKUP_BUCKET} (endpoint mascarado)"

	if mc mb --ignore-existing "${MC_ALIAS}/${S3_BACKUP_BUCKET}" >/dev/null 2>&1 \
		&& mc cp --quiet "${FINAL_PATH}" "${MC_ALIAS}/${S3_BACKUP_BUCKET}/${FINAL_NAME}" >/dev/null \
		&& mc cp --quiet "${GLOBALS_PATH}" "${MC_ALIAS}/${S3_BACKUP_BUCKET}/${GLOBALS_NAME}" >/dev/null; then
		log_info "upload concluído (dump + globals)"
	else
		log_error "upload pro MinIO falhou (dump ou globals) — backup local existe, mas cópia offsite não está completa. Marcando falha."
		EXIT_CODE=1
	fi
fi

# --- prune local -------------------------------------------------------------
# Só faz sentido podar depois que o backup do dia (dump + globals +
# verificação) deu certo — se chegamos até aqui é porque deu (uma falha de
# upload não impede o prune local, que é responsabilidade independente de
# espaço em disco). Poda os dois padrões de nome com a MESMA retenção —
# dump e globals nascem e morrem juntos.
log_info "prune local: removendo iris-*.dump e iris-*.globals.sql com mais de ${RETENTION_DAYS} dias em ${BACKUP_DIR}"

PRUNED_COUNT=0
while IFS= read -r -d '' old_file; do
	rm -f -- "${old_file}"
	PRUNED_COUNT=$((PRUNED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name 'iris-*.dump' -o -name 'iris-*.globals.sql' \) -mtime "+${RETENTION_DAYS}" -print0)

log_info "prune local: ${PRUNED_COUNT} arquivo(s) removido(s)"

# --- prune remoto -------------------------------------------------------------
if [[ -n "${S3_ENDPOINT}" ]]; then
	log_info "prune remoto: removendo objetos com mais de ${RETENTION_DAYS}d em ${MC_ALIAS}/${S3_BACKUP_BUCKET}"
	if ! mc rm --recursive --force --older-than "${RETENTION_DAYS}d" "${MC_ALIAS}/${S3_BACKUP_BUCKET}/" >/dev/null 2>&1; then
		log_error "prune remoto falhou (não fatal para o backup do dia, mas fica registrado)"
		EXIT_CODE=1
	fi
	# O config do mc (com credencial em texto plano) é apagado no trap EXIT.
fi

if [[ "${EXIT_CODE}" -eq 0 ]]; then
	log_info "concluído com sucesso"
else
	log_error "concluído com falhas parciais — ver mensagens acima"
fi

exit "${EXIT_CODE}"
