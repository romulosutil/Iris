#!/usr/bin/env bash
# verify-restore.sh — "restore testado de verdade" (item LGPD). Não é smoke
# fraco: pega o dump mais recente, restaura num banco DESCARTÁVEL no mesmo
# cluster, roda asserções de estrutura/RLS/contagem contra o banco de
# origem, e sempre dropa o banco descartável no final (sucesso ou falha).
#
# LIMITAÇÃO CONHECIDA E DELIBERADA: este script roda no MESMO cluster do
# banco de origem — as roles app_role/iris_auth JÁ EXISTEM ali, então mesmo
# um restore sem globals "funcionaria" aqui. É por isso que o furo (dump não
# leva roles) passou despercebido antes: o teste de restore era otimista
# demais. Este script agora assere que o par .globals.sql existe e contém as
# roles certas, mas isso NÃO substitui o teste de cluster novo — esse é
# manual (runbook de DR), porque exige um segundo cluster Postgres vazio.
#
# Contrato de env vars (mesmo estilo de backup.sh):
#   PGHOST                    obrigatório
#   PGPORT                    default 5432
#   PGUSER                    obrigatório — precisa ter CREATEDB (superuser
#                              serve; é o mesmo dono usado pelas migrations)
#   PGPASSWORD                obrigatório (nunca logar)
#   PGDATABASE                obrigatório — banco de ORIGEM, usado como
#                              "gabarito" de comparação
#   BACKUP_DIR                default /backups
#   RESTORE_CHECK_DB_PREFIX   default iris_restore_check
#
# Exit 0 = todas as asserções passaram. Exit 1 = qualquer uma falhou (mensagem
# clara de qual). O banco descartável é dropado nos dois casos (trap EXIT).

set -Eeuo pipefail
IFS=$'\n\t'

log_info() { printf '[verify-restore] %s\n' "$*"; }
log_error() { printf '[verify-restore] ERRO: %s\n' "$*" >&2; }
log_ok() { printf '[verify-restore] OK: %s\n' "$*"; }

# shellcheck disable=SC2329 # invocada indiretamente via `trap ... ERR`
on_error() {
	local line_no=${1:-desconhecida}
	log_error "falha inesperada na linha ${line_no}"
}
trap 'on_error ${LINENO}' ERR

: "${PGHOST:?PGHOST é obrigatório}"
: "${PGUSER:?PGUSER é obrigatório}"
: "${PGPASSWORD:?PGPASSWORD é obrigatório}"
: "${PGDATABASE:?PGDATABASE é obrigatório (banco de origem)}"

readonly PGPORT="${PGPORT:-5432}"
readonly BACKUP_DIR="${BACKUP_DIR:-/backups}"
readonly RESTORE_CHECK_DB_PREFIX="${RESTORE_CHECK_DB_PREFIX:-iris_restore_check}"

export PGPASSWORD

# Tabelas com dado clínico/paciente (curadas de db/migrations/ — ver
# 0000_fase1_tabelas.sql, 0003, 0005, 0013, 0015, 0018, 0024, 0038, 0041,
# 0047). Servem de asserção "dura": RLS tem que estar ligado nelas
# INDEPENDENTE do que a origem diz — defesa em profundidade além do
# checkpoint b) abaixo, que já compara TODA tabela contra a origem.
readonly PATIENT_DATA_TABLES=(
	patient patient_clinical_profile patient_protocol consent
	care_team_membership patient_alvo_disciplina
	session session_note session_snapshot session_protocol_scope
	audio_capture extraction evidence evidence_query evidence_revision
	goal goal_candidacy goal_milestone_mapping milestone milestone_candidacy
	reinforcer_profile report report_pdf alerta audit_log
)

psql_q() {
	# $1 = banco, $2 = SQL. -tAc = tuple only, unaligned, retorna 1 linha/valor.
	psql --host="${PGHOST}" --port="${PGPORT}" --username="${PGUSER}" \
		--dbname="$1" -X -q -v ON_ERROR_STOP=1 -tAc "$2"
}

# --- resolve o dump mais recente ---------------------------------------------
DUMP_PATH="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'iris-*.dump' | sort | tail -n1)"
readonly DUMP_PATH
if [[ -z "${DUMP_PATH}" ]]; then
	log_error "nenhum dump iris-*.dump encontrado em ${BACKUP_DIR}"
	exit 1
fi
log_info "usando dump: ${DUMP_PATH}"

# --- roles referenciadas pelas policies (curadas de db/migrations/*.sql,
# `CREATE POLICY ... TO <role>`) — o mesmo conjunto que backup.sh precisa
# dumpar via pg_dumpall --globals-only e que restore.sh precisa aplicar
# ANTES do pg_restore num cluster novo.
readonly POLICY_ROLES=(app_role iris_auth)

GLOBALS_PATH="${DUMP_PATH%.dump}.globals.sql"
readonly GLOBALS_PATH

CHECK_DB="${RESTORE_CHECK_DB_PREFIX}_$(date -u +%Y%m%dT%H%M%SZ)_$$"
readonly CHECK_DB
log_info "banco descartável: ${CHECK_DB}"

FAILURES=0
fail() {
	log_error "$*"
	FAILURES=$((FAILURES + 1))
}

# --- cria o banco descartável e garante o drop no final ----------------------
DB_CREATED=0
# shellcheck disable=SC2329 # invocada indiretamente via `trap ... EXIT`
cleanup_check_db() {
	if [[ "${DB_CREATED}" -eq 1 ]]; then
		log_info "dropando banco descartável ${CHECK_DB}"
		# Termina conexões residuais antes do DROP (psql/pg_restore podem
		# deixar conexão idle) — best-effort, não fatal se falhar.
		psql_q "${PGDATABASE}" \
			"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${CHECK_DB}' AND pid <> pg_backend_pid();" \
			>/dev/null 2>&1 || true
		if ! psql_q "${PGDATABASE}" "DROP DATABASE IF EXISTS \"${CHECK_DB}\";" >/dev/null 2>&1; then
			log_error "não consegui dropar ${CHECK_DB} — limpeza manual necessária"
		fi
	fi
}
trap cleanup_check_db EXIT

log_info "criando banco descartável"
psql_q "${PGDATABASE}" "CREATE DATABASE \"${CHECK_DB}\";" >/dev/null
DB_CREATED=1

log_info "restaurando dump em ${CHECK_DB} (--no-owner)"
if ! pg_restore --no-owner \
	--host="${PGHOST}" --port="${PGPORT}" --username="${PGUSER}" \
	--dbname="${CHECK_DB}" "${DUMP_PATH}"; then
	fail "pg_restore falhou ao restaurar em ${CHECK_DB} — restore não é confiável"
	# Sem estrutura restaurada, as asserções abaixo não fazem sentido.
	log_error "RESUMO: FALHOU (restore em si já falhou, ver acima)"
	exit 1
fi

# --- a) contagem de tabelas do schema public ---------------------------------
origin_table_count="$(psql_q "${PGDATABASE}" \
	"SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
restored_table_count="$(psql_q "${CHECK_DB}" \
	"SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"

if [[ "${origin_table_count}" -eq 0 ]]; then
	fail "banco de origem (${PGDATABASE}) tem 0 tabelas em public — algo está errado na origem, não no restore"
elif [[ "${restored_table_count}" -ne "${origin_table_count}" ]]; then
	fail "contagem de tabelas não bate: origem=${origin_table_count} restaurado=${restored_table_count}"
else
	log_ok "contagem de tabelas: ${restored_table_count} (origem == restaurado, > 0)"
fi

# --- a.5) par de globals existe e contém as roles certas ---------------------
# Esta é a asserção que teria pego o furo original: dump sem globals =
# restore em cluster novo sem RLS. Roda ANTES de qualquer coisa depender do
# restore em si — se o par não existe ou está incompleto, é falha grave (não
# é "aviso", como o antigo checkpoint (d) tratava).
if [[ ! -f "${GLOBALS_PATH}" ]]; then
	fail "par de globals não encontrado para este dump: ${GLOBALS_PATH} (backup.sh deveria gerar os dois no mesmo ciclo — ver comentário no topo deste script)"
else
	missing_role_dump=""
	for role_name in "${POLICY_ROLES[@]}"; do
		if ! grep -qE "CREATE ROLE ${role_name}\\b" "${GLOBALS_PATH}"; then
			missing_role_dump="${missing_role_dump}${role_name} "
		fi
	done
	if [[ -n "${missing_role_dump}" ]]; then
		fail "globals (${GLOBALS_PATH}) não contêm CREATE ROLE para: ${missing_role_dump}(referenciadas por CREATE POLICY em db/migrations/) — restore em cluster novo perderia RLS para essas roles"
	else
		log_ok "globals (${GLOBALS_PATH}) contêm CREATE ROLE para todas as roles referenciadas por policies: ${POLICY_ROLES[*]}"
	fi
fi

# --- b) RLS ainda ativo -------------------------------------------------------
# b.1: para TODA tabela de public, relrowsecurity(origem) == relrowsecurity(restaurado).
# Conexões separadas (origem e check db são bancos diferentes no mesmo
# cluster) — sem dependência de dblink, só duas queries + comparação em bash.
mismatched_rls=""
while IFS='|' read -r tbl_name origin_rls; do
	[[ -z "${tbl_name}" ]] && continue
	restored_rls="$(psql_q "${CHECK_DB}" "SELECT relrowsecurity FROM pg_class WHERE relname = '${tbl_name}' AND relnamespace = 'public'::regnamespace;")"
	if [[ "${origin_rls}" != "${restored_rls}" ]]; then
		mismatched_rls="${mismatched_rls}${tbl_name} "
	fi
done < <(psql_q "${PGDATABASE}" "SELECT relname || '|' || relrowsecurity FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace;")

if [[ -n "${mismatched_rls}" ]]; then
	fail "relrowsecurity difere da origem nas tabelas: ${mismatched_rls}"
else
	log_ok "relrowsecurity igual à origem em todas as tabelas de public"
fi

# b.2: contagem de policies bate (origem vs restaurado).
origin_policy_count="$(psql_q "${PGDATABASE}" "SELECT count(*) FROM pg_policies WHERE schemaname = 'public';")"
restored_policy_count="$(psql_q "${CHECK_DB}" "SELECT count(*) FROM pg_policies WHERE schemaname = 'public';")"

if [[ "${restored_policy_count}" -ne "${origin_policy_count}" ]]; then
	fail "contagem de policies não bate: origem=${origin_policy_count} restaurado=${restored_policy_count}"
else
	log_ok "contagem de policies (pg_policies): ${restored_policy_count} (origem == restaurado)"
fi

# b.3: asserção dura — tabelas com dado de paciente/clínico têm que ter RLS
# ligado no restaurado, ponto, independente do que a origem tiver (defesa em
# profundidade contra um lapso na própria configuração de origem).
hard_rls_failures=""
for tbl in "${PATIENT_DATA_TABLES[@]}"; do
	exists="$(psql_q "${CHECK_DB}" "SELECT count(*) FROM pg_class WHERE relname = '${tbl}' AND relnamespace = 'public'::regnamespace;")"
	if [[ "${exists}" -eq 0 ]]; then
		continue # tabela não existe neste schema/versão — não é falha de RLS
	fi
	rls_on="$(psql_q "${CHECK_DB}" "SELECT relrowsecurity FROM pg_class WHERE relname = '${tbl}' AND relnamespace = 'public'::regnamespace;")"
	if [[ "${rls_on}" != "t" ]]; then
		hard_rls_failures="${hard_rls_failures}${tbl} "
	fi
done

if [[ -n "${hard_rls_failures}" ]]; then
	fail "tabelas com dado de paciente SEM RLS ligado no restaurado: ${hard_rls_failures}"
else
	log_ok "todas as tabelas de dado de paciente presentes têm RLS ligado no restaurado"
fi

# --- c) row counts das tabelas principais -----------------------------------
row_count_mismatches=""
for tbl in "${PATIENT_DATA_TABLES[@]}"; do
	origin_exists="$(psql_q "${PGDATABASE}" "SELECT count(*) FROM pg_class WHERE relname = '${tbl}' AND relnamespace = 'public'::regnamespace;")"
	[[ "${origin_exists}" -eq 0 ]] && continue

	origin_rows="$(psql_q "${PGDATABASE}" "SELECT count(*) FROM \"${tbl}\";")"
	restored_rows="$(psql_q "${CHECK_DB}" "SELECT count(*) FROM \"${tbl}\";" 2>/dev/null || echo "ERRO")"

	if [[ "${restored_rows}" != "${origin_rows}" ]]; then
		row_count_mismatches="${row_count_mismatches}${tbl}(origem=${origin_rows},restaurado=${restored_rows}) "
	fi
done

if [[ -n "${row_count_mismatches}" ]]; then
	fail "row count não bate: ${row_count_mismatches}"
else
	log_ok "row counts das tabelas de dado de paciente batem com a origem"
fi

# --- d) roles/grants sobrevivem ao restore (informativo, não pode ser a
# única defesa — ver checkpoint a.5 acima, que é o que de fato cobre o furo) --
# --no-owner (ver restore.sh) deliberadamente NÃO recria ownership pelo nome
# original — os objetos ficam com o dono da conexão do restore (aqui,
# PGUSER). Os GRANTs explícitos (GRANT ... TO app_role / iris_auth), esses
# sim, vêm no dump e são reaplicados — MAS só funcionam se as roles
# app_role/iris_auth já existirem no cluster de destino (CREATE ROLE é
# objeto de CLUSTER, não de banco — pg_dump/pg_restore de um banco não cria
# roles). Neste script, mesmo cluster do banco de origem ⇒ as roles SEMPRE já
# existem, então este checkpoint por si só nunca pegaria o furo original —
# por isso é tratado como informativo (não derruba o exit code) e o
# checkpoint a.5 (par de globals + CREATE ROLE dentro dele) é quem carrega o
# peso de garantir que um restore em cluster NOVO teria as roles. O teste
# real de cluster novo continua sendo o runbook manual de DR (ver resumo
# final).
roles_missing=""
for role_name in app_role iris_auth; do
	role_exists="$(psql_q "${PGDATABASE}" "SELECT count(*) FROM pg_roles WHERE rolname = '${role_name}';")"
	if [[ "${role_exists}" -eq 0 ]]; then
		continue # role nem existe no cluster de origem — nada a checar
	fi
	grant_count="$(psql_q "${CHECK_DB}" "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = '${role_name}' AND table_schema = 'public';")"
	if [[ "${grant_count}" -eq 0 ]]; then
		roles_missing="${roles_missing}${role_name} "
	fi
done

if [[ -n "${roles_missing}" ]]; then
	log_info "AVISO (não derruba o exit code): grants de role não encontrados no restaurado para: ${roles_missing}"
	log_info "esperado quando o restore roda num cluster onde app_role/iris_auth já existiam (mesmo cluster = OK, GRANT reaplicado)."
	log_info "num cluster NOVO (disaster recovery), rode as migrations ANTES do restore para criar essas roles — passo manual, documentar em infra/README.md."
else
	log_ok "grants de app_role/iris_auth presentes no banco restaurado"
fi

# --- resumo final --------------------------------------------------------------
log_info "----------------------------------------"
log_info "dump testado : ${DUMP_PATH}"
log_info "banco origem : ${PGDATABASE}"
log_info "banco check  : ${CHECK_DB} (será dropado ao sair)"
log_info "tabelas      : origem=${origin_table_count} restaurado=${restored_table_count}"
log_info "policies     : origem=${origin_policy_count} restaurado=${restored_policy_count}"
log_info "globals      : ${GLOBALS_PATH}"
log_info "----------------------------------------"
log_info "AVISO DE ESCOPO: este verify roda no MESMO cluster do banco de origem — as"
log_info "roles ${POLICY_ROLES[*]} já existem ali, então este teste NÃO cobre o cenário de"
log_info "disaster recovery (cluster Postgres novo/vazio). O checkpoint a.5 (par de"
log_info "globals + CREATE ROLE) reduz o risco de repetir o furo, mas o teste de"
log_info "verdade — restaurar num cluster novo e conferir 37 tabelas + 85 policies —"
log_info "é o runbook manual de DR, não este script automatizado."

if [[ "${FAILURES}" -eq 0 ]]; then
	log_info "RESUMO: PASSOU (${FAILURES} falha(s))"
	exit 0
else
	log_error "RESUMO: FALHOU (${FAILURES} falha(s) — ver mensagens ERRO acima)"
	exit 1
fi
