#!/usr/bin/env bash
# restore.sh — restaura um dump (-Fc) num banco alvo. Destrutivo por design
# (--clean): existe pra restore de verdade, não pra rodar "sem pensar".
#
# Uso:
#   restore.sh <caminho-do-dump|latest>
#
# Env:
#   TARGET_DATABASE_URL         obrigatório — postgres://user:pass@host:port/db
#   BACKUP_DIR                  default /backups (só usado para resolver "latest")
#   PROTECTED_DATABASE_NAMES    default "iris" — nomes de banco que exigem o
#                                guardrail abaixo (lista separada por espaço)
#   I_UNDERSTAND_THIS_OVERWRITES  precisa ser exatamente "yes" para restaurar
#                                contra um banco cujo nome está na lista acima
#   RESTORE_ROLE                 opcional — role usada por `pg_restore --role`
#   SKIP_GLOBALS                 default "" — "yes" pula a aplicação dos
#                                globals (roles/grants de cluster). NÃO use em
#                                DR de verdade: sem globals, o restore fica
#                                sem RLS (ver seção "globals" abaixo).
#   TOMBSTONE_LEDGER             opcional — caminho do ledger de expurgos a
#                                reaplicar. Default: o tombstones-*.csv MAIS
#                                RECENTE em BACKUP_DIR (de propósito: não é o
#                                par deste dump — ver seção "tombstones").
#   SKIP_TOMBSTONES              default "" — "yes" pula a reaplicação de
#                                expurgos. Só use se você SABE que não houve
#                                purga depois do dump: sem isso, restaurar
#                                RESSUSCITA titular que exerceu o Art. 18.
#
# Guardrail: "iris" é o nome do banco tanto em produção quanto em dev local
# (docker-compose usa POSTGRES_DB=iris) — de propósito. Restore é destrutivo
# (--clean --if-exists derruba os objetos existentes antes de recriar), então
# a proteção é por NOME de banco, sempre explícita, inclusive em dev: você
# tem que confirmar "sim, entendo que isso sobrescreve" toda vez.
#
# Globals (roles/grants de cluster): pg_dump só cobre UM banco. As roles
# app_role/iris_auth que os CREATE POLICY ... TO referenciam são objetos de
# CLUSTER e nunca entram no dump -Fc. Num cluster novo/vazio (cenário real de
# disaster recovery), pg_restore recria as tabelas mas TODO GRANT/POLICY que
# referencia essas roles falha com "role does not exist" — sem erro fatal,
# só warnings que pg_restore engole. Resultado: banco com dado clínico e ZERO
# isolamento multi-tenant. Por isso este script aplica o par
# iris-<ts>.globals.sql (gerado por backup.sh com `pg_dumpall --globals-only`)
# ANTES do pg_restore, e recusa seguir sem ele a menos que o operador passe
# SKIP_GLOBALS=yes explicitamente.

set -Eeuo pipefail
IFS=$'\n\t'

log_info() { printf '[restore] %s\n' "$*"; }
log_error() { printf '[restore] ERRO: %s\n' "$*" >&2; }

on_error() {
	local line_no=${1:-desconhecida}
	log_error "falha na linha ${line_no}"
}
trap 'on_error ${LINENO}' ERR

# Nunca logar a connection string inteira (tem senha). Mascara user:senha@.
mask_url() {
	printf '%s' "$1" | sed -E 's#(://[^:]+):[^@]*@#\1:***@#'
}

usage() {
	cat <<-EOF
		Uso: $(basename "$0") <caminho-do-dump|latest>

		Env obrigatória: TARGET_DATABASE_URL
		Env opcional: BACKUP_DIR (default /backups), RESTORE_ROLE,
		              PROTECTED_DATABASE_NAMES (default "iris"),
		              I_UNDERSTAND_THIS_OVERWRITES=yes (obrigatório p/ nomes protegidos)
	EOF
}

if [[ $# -ne 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 1
fi

readonly DUMP_ARG="$1"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL é obrigatório}"

readonly BACKUP_DIR="${BACKUP_DIR:-/backups}"
readonly PROTECTED_DATABASE_NAMES="${PROTECTED_DATABASE_NAMES:-iris}"
readonly I_UNDERSTAND_THIS_OVERWRITES="${I_UNDERSTAND_THIS_OVERWRITES:-}"
readonly RESTORE_ROLE="${RESTORE_ROLE:-}"
readonly SKIP_GLOBALS="${SKIP_GLOBALS:-}"

MASKED_URL="$(mask_url "${TARGET_DATABASE_URL}")"
readonly MASKED_URL

# --- resolve o dump ----------------------------------------------------------
if [[ "${DUMP_ARG}" == "latest" ]]; then
	DUMP_PATH="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'iris-*.dump' | sort | tail -n1)"
	if [[ -z "${DUMP_PATH}" ]]; then
		log_error "nenhum dump iris-*.dump encontrado em ${BACKUP_DIR}"
		exit 1
	fi
	log_info "latest resolvido para: ${DUMP_PATH}"
else
	DUMP_PATH="${DUMP_ARG}"
fi
readonly DUMP_PATH

if [[ ! -f "${DUMP_PATH}" ]]; then
	log_error "dump não encontrado: ${DUMP_PATH}"
	exit 1
fi

# --- resolve o irmão de globals (roles/grants de cluster) --------------------
# Convenção de nome: iris-<TIMESTAMP>.dump <-> iris-<TIMESTAMP>.globals.sql
# (backup.sh gera os dois no mesmo ciclo, mesmo TIMESTAMP). Trocar a extensão
# é suficiente para achar o par.
GLOBALS_PATH="${DUMP_PATH%.dump}.globals.sql"
readonly GLOBALS_PATH

if [[ ! -f "${GLOBALS_PATH}" ]]; then
	if [[ "${SKIP_GLOBALS}" == "yes" ]]; then
		log_error "AVISO ALTO: globals não encontrados (${GLOBALS_PATH}) e SKIP_GLOBALS=yes — seguindo SEM aplicar roles/grants de cluster."
		log_error "AVISO ALTO: o banco resultante NÃO tem isolamento multi-tenant garantido (policies referenciam roles que podem não existir neste cluster)."
	else
		log_error "globals não encontrados para este dump: ${GLOBALS_PATH}"
		log_error "restaurar sem globals produz um banco SEM RLS funcional em cluster novo: as roles app_role/iris_auth"
		log_error "que as policies referenciam não existem fora do cluster de origem, então todo GRANT/POLICY do dump falha silenciosamente."
		log_error "Para prosseguir mesmo assim (só se você SABE que as roles já existem no cluster de destino), rode de novo com:"
		log_error "  SKIP_GLOBALS=yes $(basename "$0") ${DUMP_ARG}"
		exit 1
	fi
fi

# --- extrai o nome do banco alvo da connection string ------------------------
# Formato esperado: postgres(ql)://[user[:pass]@]host[:port]/dbname[?params]
target_db_name="${TARGET_DATABASE_URL##*/}"
target_db_name="${target_db_name%%\?*}"

if [[ -z "${target_db_name}" ]]; then
	log_error "não consegui extrair o nome do banco de TARGET_DATABASE_URL (${MASKED_URL})"
	exit 1
fi

# --- guardrail de destrutividade ---------------------------------------------
is_protected=0
for protected_name in ${PROTECTED_DATABASE_NAMES}; do
	if [[ "${target_db_name}" == "${protected_name}" ]]; then
		is_protected=1
		break
	fi
done

if [[ "${is_protected}" -eq 1 && "${I_UNDERSTAND_THIS_OVERWRITES}" != "yes" ]]; then
	log_error "banco alvo '${target_db_name}' está na lista protegida (${PROTECTED_DATABASE_NAMES})."
	log_error "restore é destrutivo (--clean). Para confirmar, rode de novo com:"
	log_error "  I_UNDERSTAND_THIS_OVERWRITES=yes $(basename "$0") ${DUMP_ARG}"
	exit 1
fi

log_info "restaurando ${DUMP_PATH} -> ${MASKED_URL} (banco: ${target_db_name})"

# --- aplica os globals ANTES do pg_restore -----------------------------------
# Ordem importa: as roles precisam existir antes que o pg_restore tente
# GRANT/CREATE POLICY que as referenciam.
#
# ON_ERROR_STOP=0 de propósito (diferente do restante do repo, que prefere
# ON_ERROR_STOP=1): os globals incluem CREATE ROLE para roles que já podem
# existir no cluster de destino (ex.: reaplicando globals num cluster que já
# rodou as migrations, ou um segundo restore no mesmo cluster) — isso é um
# erro benigno e esperado ("role already exists"), não deve abortar o
# restore. Um erro real e destrutivo aqui (globals corrompido, sintaxe
# inválida) já teria sido pego na verificação de integridade do backup.sh; o
# risco residual de continuar após erro é aceitável porque o pg_restore
# seguinte falha de forma óbvia (GRANT/POLICY para role inexistente) se os
# globals realmente não tiverem sido aplicados.
if [[ -f "${GLOBALS_PATH}" ]]; then
	log_info "aplicando globals (roles/grants de cluster) de ${GLOBALS_PATH}"
	if ! psql -v ON_ERROR_STOP=0 --dbname="${TARGET_DATABASE_URL}" --file="${GLOBALS_PATH}" >/dev/null; then
		log_error "psql retornou erro ao aplicar globals — pode ser benigno (roles já existentes) ou não; confira a saída acima antes de seguir."
	fi
	log_info "globals aplicados. LEMBRETE: os globals vieram sem senha (--no-role-passwords)."
	log_info "LEMBRETE: re-setar senha de login das roles que precisam autenticar, ex.: ALTER ROLE app_role PASSWORD '...' — use os valores que você já tem (env vars do provisionamento)."
fi

# --no-owner: os comandos ALTER ... OWNER TO do dump original são ignorados;
# os objetos ficam com o dono = usuário da conexão do restore (ou o que
# --role definir). Isso importa porque o RLS do Iris depende de QUEM é o
# dono da tabela (dono/superuser sempre bypassa RLS) — queremos que o
# restore assuma o mesmo dono/role do ambiente de destino, não um nome de
# role que pode nem existir lá (ex.: dump feito em dev, restaurado em prod).
#
# --clean --if-exists: dropa os objetos existentes antes de recriar — sem
# isso, restaurar sobre um banco não-vazio falha com "already exists". Por
# ser destrutivo é exatamente o motivo do guardrail acima.
#
# Sem --no-privileges: mantemos os GRANT ... TO app_role/iris_auth do dump.
# Pré-requisito: as roles app_role/iris_auth já precisam existir no cluster
# de destino (são criadas pelas migrations, não pelo pg_dump — CREATE ROLE
# é objeto de cluster, não de banco). Num cluster novo/DR, rodar as
# migrations (que criam essas roles) ANTES deste restore.
restore_args=(
	--clean
	--if-exists
	--no-owner
	--dbname="${TARGET_DATABASE_URL}"
)

if [[ -n "${RESTORE_ROLE}" ]]; then
	restore_args+=(--role="${RESTORE_ROLE}")
fi

restore_args+=("${DUMP_PATH}")

if pg_restore "${restore_args[@]}"; then
	log_info "restore concluído"
else
	log_error "pg_restore terminou com erro — ver mensagens acima (algumas são esperadas, ex.: DROP ... IF EXISTS de objeto que nunca existiu; confira o código de saída real)"
	exit 1
fi

# --- reaplicação de expurgos (tombstones, issue #89) -------------------------
# POR QUE ISTO EXISTE: um dump é uma fotografia de um instante. Se um titular
# exerceu o direito ao esquecimento (LGPD Art. 18) DEPOIS da fotografia, o dump
# ainda contém o prontuário dele — e restaurá-lo desfaz o expurgo. Não adianta
# consultar o `audit_log` restaurado: o tombstone da purga nasceu depois do
# dump e, por construção, não está lá dentro. Por isso o ledger viaja FORA do
# dump (`backup.sh` gera `tombstones-<TS>.csv` a cada ciclo) e o que vale aqui é
# o ledger MAIS RECENTE disponível, não o par deste dump.
#
# O ledger só tem UUIDs e um timestamp — nenhum texto livre, nenhum dado
# clínico. É o mínimo necessário para saber A QUEM re-aplicar o expurgo.
#
# A re-eliminação chama a MESMA `app_purgar_paciente()` que a aplicação chama.
# Reimplementar os DELETEs aqui garantiria drift: a função cresce a cada tabela
# nova do modelo e este script não acompanharia — sobrariam órfãos do titular
# expurgado justamente no cenário em que ninguém está olhando.
readonly SKIP_TOMBSTONES="${SKIP_TOMBSTONES:-}"
TOMBSTONE_LEDGER="${TOMBSTONE_LEDGER:-}"

if [[ "${SKIP_TOMBSTONES}" == "yes" ]]; then
	log_error "AVISO ALTO: SKIP_TOMBSTONES=yes — nenhum expurgo foi reaplicado."
	log_error "AVISO ALTO: se algum titular exerceu o Art. 18 depois de ${DUMP_PATH}, o prontuário dele acabou de VOLTAR e a exclusão foi desfeita."
	log_error "AVISO ALTO: rode este script de novo sem SKIP_TOMBSTONES assim que tiver o ledger, ou reaplique as purgas à mão antes de liberar o banco."
else
	if [[ -z "${TOMBSTONE_LEDGER}" ]]; then
		# `sort` lexicográfico resolve a ordem porque o nome carrega o carimbo
		# ISO básico (tombstones-YYYYMMDDTHHMMSSZ.csv) — mesma convenção do dump.
		TOMBSTONE_LEDGER="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'tombstones-*.csv' | sort | tail -n1)"
	fi

	if [[ -z "${TOMBSTONE_LEDGER}" || ! -f "${TOMBSTONE_LEDGER}" ]]; then
		log_error "ledger de tombstones não encontrado (procurado: tombstones-*.csv em ${BACKUP_DIR})."
		log_error "Sem ele NÃO é possível saber quem foi expurgado depois deste dump — e o restore que acabou de rodar pode ter ressuscitado titular que exerceu o Art. 18."
		log_error "Aponte o ledger com TOMBSTONE_LEDGER=/caminho/tombstones-<TS>.csv (use o MAIS RECENTE que existir, inclusive o do off-site),"
		log_error "ou, se você SABE que não houve nenhuma purga, siga com SKIP_TOMBSTONES=yes — assumindo o risco por escrito."
		exit 1
	fi

	# O ledger precisa ser MAIS NOVO que o dump. Um ledger anterior ao dump não
	# conhece nenhuma purga posterior a ele: aplicá-lo roda 0 re-eliminações e
	# imprime sucesso, que é pior que falhar — vira prova de conformidade para
	# um banco que ressuscitou titular.
	dump_ts="$(basename "${DUMP_PATH}")"
	dump_ts="${dump_ts#iris-}"
	dump_ts="${dump_ts%%.*}"
	ledger_ts="$(basename "${TOMBSTONE_LEDGER}")"
	ledger_ts="${ledger_ts#tombstones-}"
	ledger_ts="${ledger_ts%%.*}"

	if [[ -n "${dump_ts}" && -n "${ledger_ts}" && "${ledger_ts}" < "${dump_ts}" ]]; then
		log_error "o ledger escolhido (${ledger_ts}) é ANTERIOR ao dump (${dump_ts})."
		log_error "Ele não pode conhecer nenhuma purga feita depois do dump, então aplicá-lo daria um 'ok' que não vale nada."
		log_error "Busque o ledger mais recente (MinIO ou off-site) e passe em TOMBSTONE_LEDGER."
		exit 1
	fi

	log_info "reaplicando expurgos a partir de ${TOMBSTONE_LEDGER}"

	# A regra mora em reaplicar-tombstones.sql, não aqui: é o mesmo arquivo que
	# `db/tests/fase6-tombstone-restauracao.int.test.ts` carrega e executa. Um
	# bloco SQL inline neste script seria código de produção sem teste nenhum.
	SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
	readonly SCRIPT_DIR
	readonly SQL_TOMBSTONES="${SCRIPT_DIR}/reaplicar-tombstones.sql"

	if [[ ! -f "${SQL_TOMBSTONES}" ]]; then
		log_error "reaplicar-tombstones.sql não encontrado em ${SCRIPT_DIR} — imagem incompleta. NÃO libere o banco restaurado."
		exit 1
	fi

	# ON_ERROR_STOP=1 e transação única: ou todos os titulares do ledger voltam
	# a estar expurgados, ou o operador fica sabendo. Um banco meio-expurgado
	# liberado para uso é o desfecho a evitar.
	# O CSV entra por STDIN, não por variável do psql: `\copy ... FROM :'ledger'`
	# NÃO interpola — o `:'ledger'` chega literal ao parser do \copy e vira
	# `:: No such file or directory`. Pego num restore de ponta a ponta, não na
	# leitura do arquivo.
	if ! psql \
		-v ON_ERROR_STOP=1 \
		--dbname="${TARGET_DATABASE_URL}" \
		--no-psqlrc \
		--quiet \
		-f "${SQL_TOMBSTONES}" \
		<"${TOMBSTONE_LEDGER}"
	then
		log_error "a reaplicação de expurgos FALHOU. O banco restaurado pode conter titular já expurgado — NÃO libere para uso."
		log_error "Resolva a causa acima (ator ausente, ledger corrompido, função app_purgar_paciente ausente) e rode de novo."
		exit 1
	fi

	log_info "expurgos reaplicados a partir de ${TOMBSTONE_LEDGER} (ver NOTICE acima para a contagem)"
fi
