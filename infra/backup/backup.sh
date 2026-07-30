#!/usr/bin/env bash
# backup.sh — dump agendado do Postgres do Iris (pg_dump -Fc) com verificação
# de integridade, replicação (MinIO local + off-site cifrado) e prune de
# retenção.
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
#   -- réplica off-site (issue #86) --
#   OFFSITE_S3_ENDPOINT     opcional — vazio = pula a réplica off-site
#   OFFSITE_S3_ACCESS_KEY   obrigatório SE OFFSITE_S3_ENDPOINT setado
#   OFFSITE_S3_SECRET_KEY   obrigatório SE OFFSITE_S3_ENDPOINT setado
#   OFFSITE_S3_BUCKET       default iris-backups-offsite
#   OFFSITE_S3_REGION       opcional — região de ASSINATURA SigV4 do destino
#                            off-site. Vazio (default) = o mc assina
#                            `us-east-1`, que é o que a OCI aceita hoje. Só
#                            mexer com evidência. Ver "região de assinatura".
#   OFFSITE_S3_PATH_STYLE   opcional — auto (default) | on | off. Só mexer se o
#                            destino recusar bucket em virtual-host.
#   OFFSITE_AGE_RECIPIENT   obrigatório SE OFFSITE_S3_ENDPOINT setado — chave
#                            PÚBLICA age (age1...). Ver seção "off-site" abaixo.
#   OFFSITE_INTERVAL_DAYS   default 1 (toda execução). 7 = semanal. Só afeta a
#                            réplica off-site; o dump local e o MinIO continuam
#                            diários. Ver "cadência do off-site" abaixo.
#
# Exit code:
#   0 = sucesso completo.
#   1 = o BACKUP DO DIA falhou (dump ou globals). Não existe artefato válido.
#   2 = uso incorreto (argumento passado).
#   3 = backup do dia ÍNTEGRO em disco, mas alguma REPLICAÇÃO falhou (MinIO
#       e/ou off-site). Distinguir 1 de 3 é essencial: o scheduler.sh trata 3
#       como "dia resolvido, com aviso" e NÃO refaz o dump. Sem essa distinção,
#       uma falha persistente de replicação (conta off-site suspensa, MinIO
#       fora) faria o scheduler disparar um pg_dump completo a cada 10 minutos,
#       24h por dia, contra o banco de produção — carga real por um problema
#       que não é do dump.
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
#   6. réplica off-site CIFRADA dos dois (se configurada) — passo 6, novo
#   7. prune local + remoto (MinIO) por retenção (dump E globals)
#
# --- off-site (issue #86): por que cifrado e por que sem delete -------------
#
# O MinIO do passo 5 roda no MESMO VPS do Postgres. Ele cobre corrupção, DROP
# acidental e erro humano — NÃO cobre perda total do host (VPS destruído, conta
# suspensa, ransomware no host). Os dois destinos de hoje são um único domínio
# de falha. O passo 6 é a terceira cópia, num provedor e numa conta distintos.
#
# CIFRA CLIENT-SIDE (age): o off-site é conta de terceiro. O dump vai cifrado
# com uma chave PÚBLICA age; o VPS carrega só a chave pública e por construção
# NÃO CONSEGUE DECIFRAR o que ele mesmo enviou. Consequências, ambas desejadas:
#   - o provedor off-site nunca vê dado clínico legível;
#   - um atacante que tome o VPS não consegue ler a réplica.
# Preço: NÃO É POSSÍVEL testar o restore do off-site automaticamente aqui. Esse
# drill é manual, com a chave privada, e está no runbook (infra/README.md).
# A chave privada NÃO fica no VPS. Perder a chave privada = perder a réplica
# off-site (as cópias local e MinIO continuam em claro e restauráveis).
#
# CADÊNCIA DO OFF-SITE (OFFSITE_INTERVAL_DAYS): a réplica pode ser mais
# esparsa que o dump. O dump local roda todo dia de qualquer forma — ele é
# barato e fica no mesmo disco. Já a réplica cifrada custa banda e cota no
# provedor de terceiro, e para muitos estágios de produto uma cópia semanal
# fora do host é a troca certa entre "quanto eu perco no pior dia" e "quanto
# isso me custa".
#
# O controle é por MARCADOR de tempo (.ultimo-offsite), não por dia da semana.
# Diferença que importa: se o container estiver parado no dia marcado (deploy,
# reboot, OOM), a regra por dia-da-semana simplesmente PULA a semana inteira e
# ninguém percebe. Com marcador, a réplica sai na próxima execução em que o
# tempo já venceu — atrasada, nunca perdida.
#
# O marcador só é escrito em SUCESSO. Off-site que falhou é off-site devido, e
# tenta de novo no dia seguinte independente do intervalo.

# CREDENCIAL SEM DeleteObject: a credencial off-site é dedicada e só escreve.
# Backup que o host comprometido consegue apagar não é backup. Por isso este
# script NÃO poda o off-site — a retenção lá é responsabilidade de uma REGRA DE
# LIFECYCLE no bucket, do lado do provedor. Prune disparado pelo host confiaria
# no relógio e nas permissões do host, que são exatamente o que se assume
# perdido no cenário que o off-site existe para cobrir.

set -Eeuo pipefail
IFS=$'\n\t'

# --- estado global de saída -------------------------------------------------
# EXIT_CODE começa em 0; qualquer etapa não-fatal-mas-com-falha (ex.: upload
# pro S3 falhou depois de um dump local válido) marca 3 (REPLICAÇÃO PARCIAL)
# aqui em vez de sair na hora, para não pular o prune local (que é
# independente do S3). Falha do dump/globals sai com 1 na hora — ali não
# existe backup do dia. Ver a tabela de exit codes no cabeçalho.
readonly EXIT_REPLICACAO_PARCIAL=3
EXIT_CODE=0

log_info() {
	printf '[backup] %s\n' "$*"
}

log_error() {
	printf '[backup] ERRO: %s\n' "$*" >&2
}

# Configura um alias do mc lendo as credenciais por STDIN.
#
# Uso: mc_configurar_alias <alias> <endpoint> <access_key> <secret_key> [path]
#
# <path> é o `--path` do mc (auto|on|off), default `auto`. O off-site na OCI
# passa `on`: a S3 Compatibility API da Oracle não atende bucket em virtual-host
# (`<bucket>.<ns>.compat.objectstorage...` não existe no DNS deles), só em path.
# `auto` funciona por acidente hoje; explicitar remove a variável.
#
# Recebe por parâmetro (e não por global) porque existem DOIS destinos S3 com
# credenciais distintas: o MinIO local e o off-site da #86. Compartilhar
# credencial entre os dois anularia o ponto do off-site — a credencial do
# MinIO está no mesmo host que se assume comprometido.
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
	local alias="$1" endpoint="$2" access_key="$3" secret_key="$4" path_style="${5:-auto}"
	local saida

	# stderr capturado em vez de descartado: `mc alias set` recusa chave curta
	# ("Invalid secret key `...`") e endpoint malformado, e engolir isso
	# transformava um erro de digitação numa falha de upload genérica dez linhas
	# depois. Rodar dentro do `if` também evita que o ERR trap mate o script
	# antes de a mensagem ser logada.
	#
	# CUIDADO ao mexer: o mc ECOA a chave inválida na mensagem de erro. Por isso
	# só o access key pode aparecer aqui; a linha abaixo filtra qualquer eco do
	# secret antes de logar.
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

readonly OFFSITE_S3_ENDPOINT="${OFFSITE_S3_ENDPOINT:-}"
readonly OFFSITE_S3_ACCESS_KEY="${OFFSITE_S3_ACCESS_KEY:-}"
readonly OFFSITE_S3_SECRET_KEY="${OFFSITE_S3_SECRET_KEY:-}"
readonly OFFSITE_S3_BUCKET="${OFFSITE_S3_BUCKET:-iris-backups-offsite}"
readonly OFFSITE_AGE_RECIPIENT="${OFFSITE_AGE_RECIPIENT:-}"

# --- região de assinatura e estilo de path do off-site ------------------------
# Dois parafusos de dialeto S3, ambos DESLIGADOS por default. Existem porque a
# réplica off-site já falhou por autenticação com esta mensagem da OCI:
#
#   "The secret key required to complete authentication could not be found.
#    The region must be specified if this is not the home region for the
#    tenancy."
#
# A frase junta duas causas e a segunda é uma pista falsa convincente. Na
# ocasião a causa real foi a CREDENCIAL (par Customer Secret Key inválido); a
# réplica voltou a subir sem tocar em região nenhuma, com o mc assinando
# `us-east-1`. Registrado aqui porque a próxima pessoa a ler esse erro vai ter
# o mesmo impulso de mexer na região primeiro. Comece pela credencial.
#
# O que continua verdade, medido no mc RELEASE.2025-08-13: `alias set` não tem
# `--region`, o config.json v10 não guarda região, e sem configuração o mc
# assina `us-east-1`. A única alavanca é a env var MC_REGION, lida por
# invocação — daí os comandos off-site abaixo serem prefixados com ela em vez
# de a região morar no alias.
#
# Default vazio é deliberado: `us-east-1` é a configuração que está PROVADA
# funcionando contra a OCI em produção. Derivar a região do endpoint parecia
# defensivo e seria uma troca de comportamento funcionando por comportamento
# suposto — o tipo de mudança que só aparece na janela de backup seguinte.
readonly OFFSITE_REGION="${OFFSITE_S3_REGION:-}"
readonly OFFSITE_PATH_STYLE="${OFFSITE_S3_PATH_STYLE:-auto}"

if ! [[ "${OFFSITE_PATH_STYLE}" =~ ^(auto|on|off)$ ]]; then
	log_error "OFFSITE_S3_PATH_STYLE precisa ser auto, on ou off — recebido: ${OFFSITE_PATH_STYLE}"
	exit 1
fi
readonly OFFSITE_INTERVAL_DAYS="${OFFSITE_INTERVAL_DAYS:-1}"
readonly OFFSITE_MARCADOR="${BACKUP_DIR}/.ultimo-offsite"
readonly DEGRADADO_MARCADOR="${BACKUP_DIR}/.offsite-degradado"

if [[ -n "${S3_ENDPOINT}" ]]; then
	: "${S3_ACCESS_KEY:?S3_ACCESS_KEY é obrigatório quando S3_ENDPOINT está setado}"
	: "${S3_SECRET_KEY:?S3_SECRET_KEY é obrigatório quando S3_ENDPOINT está setado}"
fi

# A réplica off-site é tudo-ou-nada: sem a chave pública age não existe upload
# off-site, ponto. Falhar aqui (antes do dump) e não "subir em claro como
# fallback" é deliberado — um fallback silencioso para texto plano num
# provedor de terceiro é exatamente o tipo de degradação que ninguém percebe
# até virar incidente de vazamento.
if [[ -n "${OFFSITE_S3_ENDPOINT}" ]]; then
	: "${OFFSITE_S3_ACCESS_KEY:?OFFSITE_S3_ACCESS_KEY é obrigatório quando OFFSITE_S3_ENDPOINT está setado}"
	: "${OFFSITE_S3_SECRET_KEY:?OFFSITE_S3_SECRET_KEY é obrigatório quando OFFSITE_S3_ENDPOINT está setado}"
	: "${OFFSITE_AGE_RECIPIENT:?OFFSITE_AGE_RECIPIENT (chave pública age) é obrigatório quando OFFSITE_S3_ENDPOINT está setado — a réplica off-site nunca sobe em claro}"

	# Formato da chave pública age (bech32, prefixo age1). Validar aqui evita
	# descobrir um recipient mal colado só depois de um dump completo.
	if ! [[ "${OFFSITE_AGE_RECIPIENT}" =~ ^age1[0-9a-z]{58}$ ]]; then
		log_error "OFFSITE_AGE_RECIPIENT não parece uma chave pública age válida (esperado age1 + 58 caracteres [0-9a-z]). Valor não é logado."
		exit 1
	fi

	if ! command -v age >/dev/null 2>&1; then
		log_error "OFFSITE_S3_ENDPOINT está setado mas o binário 'age' não está na imagem — ver infra/backup/Dockerfile"
		exit 1
	fi
fi

if ! [[ "${OFFSITE_INTERVAL_DAYS}" =~ ^[0-9]+$ ]] || [[ "${OFFSITE_INTERVAL_DAYS}" -lt 1 ]]; then
	log_error "OFFSITE_INTERVAL_DAYS precisa ser inteiro >= 1, recebido: ${OFFSITE_INTERVAL_DAYS}"
	exit 1
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

# Diretório dos artefatos CIFRADOS do off-site. Fica DENTRO de BACKUP_DIR (e
# não em /tmp) de propósito: /tmp pode ser tmpfs — cifrar um dump de vários GB
# ali consumiria RAM do mesmo host que roda o Postgres. Aqui é o mesmo disco
# que já guarda o dump. O prefixo `.offsite.` é o que o sweep de lixo antigo
# procura; o trap EXIT apaga o desta execução.
OFFSITE_TMP_DIR="$(mktemp -d "${BACKUP_DIR}/.offsite.XXXXXX")"
readonly OFFSITE_TMP_DIR
chmod 700 -- "${OFFSITE_TMP_DIR}"

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
	# Os .age são cópia cifrada e descartável do que já está em BACKUP_DIR —
	# não têm valor após o upload e não podem ficar ocupando disco.
	if [[ -n "${OFFSITE_TMP_DIR:-}" && -d "${OFFSITE_TMP_DIR}" ]]; then
		rm -rf -- "${OFFSITE_TMP_DIR}"
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

# Declarado fora do bloco porque o prune remoto, lá embaixo, também depende de o
# alias existir — e com S3_ENDPOINT vazio o `set -u` mataria a leitura.
minio_ok=1

if [[ -z "${S3_ENDPOINT}" ]]; then
	log_info "S3_ENDPOINT vazio — pulando upload (esperado em dev local sem MinIO)"
else
	# Alias configurado por stdin — ver mc_configurar_alias() para o porquê de
	# não usar MC_HOST_* (URL, quebra com `/` no segredo) nem argv (vaza em ps).
	# Alias falhou => NÃO tenta o upload. Sem este gate o fluxo cai no `mc mb`
	# contra um alias que não existe e uma credencial errada vira três erros
	# empilhados, sendo o último ("upload pro MinIO falhou") o que aponta para a
	# camada errada. Mesmo gate que a réplica off-site já usa.
	if ! mc_configurar_alias "${MC_ALIAS}" "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"; then
		log_error "falha ao configurar o alias do mc — conferir S3_ENDPOINT/credenciais (valores não são logados). Upload pro MinIO pulado."
		EXIT_CODE="${EXIT_REPLICACAO_PARCIAL}"
		minio_ok=0
	fi

	if [[ "${minio_ok}" -eq 1 ]]; then
		log_info "subindo ${FINAL_NAME} e ${GLOBALS_NAME} para ${MC_ALIAS}/${S3_BACKUP_BUCKET} (endpoint mascarado)"

		if mc mb --ignore-existing "${MC_ALIAS}/${S3_BACKUP_BUCKET}" >/dev/null 2>&1 \
			&& mc cp --quiet "${FINAL_PATH}" "${MC_ALIAS}/${S3_BACKUP_BUCKET}/${FINAL_NAME}" >/dev/null \
			&& mc cp --quiet "${GLOBALS_PATH}" "${MC_ALIAS}/${S3_BACKUP_BUCKET}/${GLOBALS_NAME}" >/dev/null; then
			log_info "upload concluído (dump + globals)"
		else
			log_error "upload pro MinIO falhou (dump ou globals) — backup local existe, mas a cópia no MinIO não está completa. Marcando replicação parcial."
			EXIT_CODE="${EXIT_REPLICACAO_PARCIAL}"
		fi
	fi
fi

# --- réplica off-site cifrada (issue #86) ------------------------------------
# Terceira cópia, em provedor e conta distintos do VPS. Ver a seção "off-site"
# no cabeçalho para o porquê da cifra e da credencial sem delete.
readonly MC_ALIAS_OFFSITE="irisoffsite"
readonly OFFSITE_NAME="${FINAL_NAME}.age"
readonly OFFSITE_GLOBALS_NAME="${GLOBALS_NAME}.age"

# Decide se a réplica é devida nesta execução. Marcador ausente => devida (é o
# caso da primeira execução e o caso de a última ter falhado, já que o marcador
# só é escrito em sucesso).
offsite_devido=1
offsite_motivo="intervalo=${OFFSITE_INTERVAL_DAYS}d"

if [[ -n "${OFFSITE_S3_ENDPOINT}" && "${OFFSITE_INTERVAL_DAYS}" -gt 1 && -f "${OFFSITE_MARCADOR}" ]]; then
	AGORA_EPOCH="$(date +%s)"
	ULTIMO_EPOCH="$(stat -c %Y "${OFFSITE_MARCADOR}")"
	DECORRIDO_S=$((AGORA_EPOCH - ULTIMO_EPOCH))
	INTERVALO_S=$((OFFSITE_INTERVAL_DAYS * 86400))

	# Margem de 1h: a janela do scheduler tem jitter (reavalia a cada 10min), e
	# sem margem uma execução que caísse alguns minutos antes do intervalo exato
	# empurraria a réplica para o dia seguinte, e o seguinte, acumulando atraso.
	if [[ "${DECORRIDO_S}" -lt $((INTERVALO_S - 3600)) ]]; then
		offsite_devido=0
		offsite_motivo="última há $((DECORRIDO_S / 3600))h, intervalo ${OFFSITE_INTERVAL_DAYS}d"
	fi
fi

if [[ -z "${OFFSITE_S3_ENDPOINT}" ]]; then
	log_info "OFFSITE_S3_ENDPOINT vazio — pulando réplica off-site (esperado em dev local)"
elif [[ "${offsite_devido}" -eq 0 ]]; then
	# Não é falha: é a cadência configurada. Exit code não muda.
	log_info "réplica off-site não é devida nesta execução (${offsite_motivo}) — dump local e MinIO seguem normalmente"
else
	# O recipient é chave PÚBLICA: logar é seguro e é a única forma de provar,
	# depois, com QUAL chave um artefato foi cifrado. Sem isso, descobrir que a
	# réplica foi cifrada com uma chave cuja privada ninguém tem só aconteceria
	# no dia do desastre.
	log_info "réplica off-site: cifrando com age recipient=${OFFSITE_AGE_RECIPIENT}"

	offsite_ok=1

	# `age -r` cifra para a chave pública. O VPS não tem a privada e portanto
	# não consegue reverter isto — por design.
	if ! age -r "${OFFSITE_AGE_RECIPIENT}" -o "${OFFSITE_TMP_DIR}/${OFFSITE_NAME}" "${FINAL_PATH}" \
		|| ! age -r "${OFFSITE_AGE_RECIPIENT}" -o "${OFFSITE_TMP_DIR}/${OFFSITE_GLOBALS_NAME}" "${GLOBALS_PATH}"; then
		log_error "falha ao cifrar os artefatos para o off-site — nada é enviado. Marcando replicação parcial."
		offsite_ok=0
	fi

	# Verificação de que o que vai subir é REALMENTE um arquivo age. Barato, e
	# a única barreira contra o pior desfecho possível deste passo: dado
	# clínico em claro num bucket de terceiro por um `age` que falhou de forma
	# silenciosa. O header é texto fixo definido pelo formato ("age-encryption.org/v1").
	if [[ "${offsite_ok}" -eq 1 ]]; then
		for artefato in "${OFFSITE_TMP_DIR}/${OFFSITE_NAME}" "${OFFSITE_TMP_DIR}/${OFFSITE_GLOBALS_NAME}"; do
			if [[ ! -s "${artefato}" ]] || ! head -c 21 "${artefato}" | grep -q 'age-encryption.org'; then
				log_error "artefato off-site $(basename "${artefato}") não tem header age válido — ABORTANDO o envio (jamais subir em claro)."
				offsite_ok=0
			fi
		done
	fi

	if [[ "${offsite_ok}" -eq 1 ]]; then
		if ! mc_configurar_alias "${MC_ALIAS_OFFSITE}" "${OFFSITE_S3_ENDPOINT}" \
			"${OFFSITE_S3_ACCESS_KEY}" "${OFFSITE_S3_SECRET_KEY}" "${OFFSITE_PATH_STYLE}"; then
			log_error "falha ao configurar o alias off-site do mc — conferir OFFSITE_S3_ENDPOINT/credenciais (valores não são logados)"
			offsite_ok=0
		fi
	fi

	# Região é dado de configuração, não segredo: logar é o que permite ler o
	# log de uma falha futura e saber com QUAL região o mc assinou.
	if [[ "${offsite_ok}" -eq 1 ]]; then
		log_info "off-site: assinando SigV4 na região '${OFFSITE_REGION:-us-east-1 (default do mc)}' (path-style=${OFFSITE_PATH_STYLE})"
	fi

	# Sonda antes do upload. Não é redundante com o `mc cp`: quando o cp falha
	# sozinho, o erro não diz se o problema é a credencial, a região de
	# assinatura ou a permissão naquele bucket. Rodando `mc ls` na raiz e no
	# bucket, a combinação de resultados responde isso no próprio log.
	#
	# Deliberadamente NÃO fatal: a credencial off-site é restrita de propósito e
	# pode não ter ListBucket. Falha aqui vira diagnóstico, não bloqueio — quem
	# decide é o cp.
	if [[ "${offsite_ok}" -eq 1 ]]; then
		if sonda="$(MC_REGION="${OFFSITE_REGION}" mc ls "${MC_ALIAS_OFFSITE}/" 2>&1)"; then
			log_info "off-site: sonda OK — credencial autentica e a região de assinatura é aceita"
			if ! sonda="$(MC_REGION="${OFFSITE_REGION}" mc ls "${MC_ALIAS_OFFSITE}/${OFFSITE_S3_BUCKET}/" 2>&1)"; then
				log_error "off-site: autenticação OK, mas o bucket '${OFFSITE_S3_BUCKET}' não respondeu — nome errado ou credencial sem permissão nele. Resposta: ${sonda}"
			fi
		else
			log_error "off-site: sonda de autenticação falhou ANTES do upload. Comece pela CREDENCIAL — já foi ela uma vez, e a mensagem da OCI aponta para região. (1) OFFSITE_S3_ACCESS_KEY/SECRET precisam ser um par Customer Secret Key da OCI (não Auth Token, não chave de API); (2) só depois, região — usada '${OFFSITE_REGION:-us-east-1}', ajustável em OFFSITE_S3_REGION; (3) estilo de path (OFFSITE_S3_PATH_STYLE=on). Resposta: ${sonda}"
		fi
	fi

	if [[ "${offsite_ok}" -eq 1 ]]; then
		log_info "subindo ${OFFSITE_NAME} e ${OFFSITE_GLOBALS_NAME} para ${MC_ALIAS_OFFSITE}/${OFFSITE_S3_BUCKET} (endpoint mascarado)"

		# Sem `mc mb` aqui, ao contrário do MinIO: a credencial off-site é
		# deliberadamente restrita (sem CreateBucket, sem DeleteObject), então
		# criar bucket falharia e mascararia o erro real. O bucket é
		# provisionado uma vez, à mão, junto com a regra de lifecycle que faz
		# a retenção — ver o runbook em infra/README.md.
		if MC_REGION="${OFFSITE_REGION}" mc cp --quiet "${OFFSITE_TMP_DIR}/${OFFSITE_NAME}" "${MC_ALIAS_OFFSITE}/${OFFSITE_S3_BUCKET}/${OFFSITE_NAME}" >/dev/null \
			&& MC_REGION="${OFFSITE_REGION}" mc cp --quiet "${OFFSITE_TMP_DIR}/${OFFSITE_GLOBALS_NAME}" "${MC_ALIAS_OFFSITE}/${OFFSITE_S3_BUCKET}/${OFFSITE_GLOBALS_NAME}" >/dev/null; then
			# Marcador SÓ aqui, no sucesso: uma réplica que falhou continua
			# devida e tenta de novo amanhã, independente do intervalo.
			date -u '+%Y-%m-%dT%H:%M:%SZ' >"${OFFSITE_MARCADOR}"
			log_info "réplica off-site concluída (dump + globals, cifrados)"
		else
			log_error "upload off-site falhou (dump ou globals) — backup local e MinIO existem, mas NÃO há cópia fora do host. Marcando replicação parcial."
			offsite_ok=0
		fi
	fi

	if [[ "${offsite_ok}" -eq 0 ]]; then
		EXIT_CODE="${EXIT_REPLICACAO_PARCIAL}"
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

# Sweep de diretórios `.offsite.*` órfãos: o trap EXIT limpa o desta execução,
# mas um SIGKILL (OOM, `docker kill`, reboot do VPS no meio do upload) não
# dispara trap nenhum. Sem este sweep, cada morte violenta deixaria uma cópia
# CIFRADA do dump ocupando disco para sempre. `-mtime +1` não toca no
# diretório de uma execução em andamento.
while IFS= read -r -d '' orfao; do
	log_info "removendo diretório off-site órfão de execução anterior: $(basename "${orfao}")"
	rm -rf -- "${orfao}"
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type d -name '.offsite.*' -mtime +1 -print0)

# --- prune remoto -------------------------------------------------------------
if [[ -n "${S3_ENDPOINT}" && "${minio_ok}" -eq 1 ]]; then
	log_info "prune remoto: removendo objetos com mais de ${RETENTION_DAYS}d em ${MC_ALIAS}/${S3_BACKUP_BUCKET}"
	if ! mc rm --recursive --force --older-than "${RETENTION_DAYS}d" "${MC_ALIAS}/${S3_BACKUP_BUCKET}/" >/dev/null 2>&1; then
		log_error "prune remoto falhou (não fatal para o backup do dia, mas fica registrado)"
		EXIT_CODE="${EXIT_REPLICACAO_PARCIAL}"
	fi
	# O config do mc (com credencial em texto plano) é apagado no trap EXIT.
fi

# O off-site NÃO é podado aqui — de propósito. Ver a seção "off-site" no
# cabeçalho: a credencial não tem DeleteObject e a retenção é uma regra de
# lifecycle no bucket. Se este log aparecer e o bucket estiver crescendo sem
# limite, a regra de lifecycle não foi criada — ver runbook em infra/README.md.
if [[ -n "${OFFSITE_S3_ENDPOINT}" ]]; then
	log_info "prune off-site: NÃO executado pelo script (por design) — retenção é regra de lifecycle do bucket ${OFFSITE_S3_BUCKET}"
fi

if [[ "${EXIT_CODE}" -eq 0 ]]; then
	rm -f -- "${DEGRADADO_MARCADOR}" 2>/dev/null || true
	log_info "concluído com sucesso"
else
	printf 'timestamp=%s\nexit_code=%d\nstatus=degraded\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "${EXIT_CODE}" >"${DEGRADADO_MARCADOR}"
	log_error "backup do dia ÍNTEGRO em ${BACKUP_DIR}, mas houve falha de REPLICAÇÃO (exit ${EXIT_CODE}) — ver mensagens acima. O dump NÃO será refeito; corrija o destino e a próxima janela replica."
fi

exit "${EXIT_CODE}"
