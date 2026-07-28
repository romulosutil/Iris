#!/usr/bin/env bash
# test-offsite.sh — teste de integração da réplica off-site cifrada (issue #86).
#
# POR QUE ISTO EXISTE: o off-site é a cópia que só vai ser usada no pior dia da
# vida do produto — perda total do VPS. É a que ninguém exercita e a que
# ninguém percebe estar quebrada. "backup.sh saiu 0" não prova nada aqui: prova
# que o upload não deu erro, não que o que subiu é restaurável. Este script
# fecha o laço inteiro, contra Postgres e MinIO de verdade:
#
#   gera par de chaves age -> semeia dado reconhecível no banco -> roda o
#   backup.sh real -> baixa o artefato do bucket -> confirma que está cifrado
#   -> DECIFRA com a chave privada -> confirma que o dump decifrado é um dump
#   Postgres válido e que contém o dado semeado.
#
# Sem o passo de decifrar, um `age` que produzisse lixo bem-formado passaria.
#
# Cobre também os dois caminhos de erro que importam operacionalmente:
#   - off-site não configurado         -> exit 0, nada sobe (dev local);
#   - off-site configurado mas fora do ar -> exit 3 (replicação parcial), NUNCA
#     exit 1, e o backup local continua íntegro. É essa distinção que impede o
#     scheduler de refazer o pg_dump a cada 10min quando só o destino caiu.
#
# Uso (Docker precisa estar rodando):
#   ./infra/backup/test-offsite.sh
#
# Não recebe env, não toca em nada fora do compose local, e derruba o que subiu
# ao final. NUNCA aponte para o MinIO ou o bucket off-site de produção.

set -Eeuo pipefail
IFS=$'\n\t'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT
readonly COMPOSE=(docker compose -f "${REPO_ROOT}/infra/docker-compose.yml" --profile backup)
readonly BUCKET_OFFSITE="iris-backups-offsite-test"
readonly MARCADOR="MARCADOR_CANARIO_OFFSITE_86"

TESTES_OK=0
TESTES_FALHOS=0

log() { printf '\n[test-offsite] %s\n' "$*"; }
ok() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; TESTES_OK=$((TESTES_OK + 1)); }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; TESTES_FALHOS=$((TESTES_FALHOS + 1)); }

# Roda um comando arbitrário dentro da imagem de backup (que já tem mc + age +
# client do Postgres) na rede do compose. `run --rm backup <cmd>` substitui o
# CMD porque o Dockerfile usa CMD e não ENTRYPOINT — o mesmo motivo
# documentado lá.
no_container() {
	"${COMPOSE[@]}" run --rm --no-deps -T \
		-e MC_CONFIG_DIR=/tmp/mc \
		backup bash -c "${CMD}"
}

limpar() {
	log "derrubando o ambiente de teste"
	"${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
}
trap limpar EXIT

# ---------------------------------------------------------------------------
log "1/7 · subindo Postgres + MinIO"
"${COMPOSE[@]}" up -d postgres minio >/dev/null
"${COMPOSE[@]}" build backup >/dev/null

# ---------------------------------------------------------------------------
log "2/7 · gerando par de chaves age efêmero (a privada NUNCA entra no container de backup)"

KEYPAIR="$("${COMPOSE[@]}" run --rm --no-deps -T backup bash -c '
	age-keygen 2>/dev/null
')"
AGE_IDENTITY="$(printf '%s' "${KEYPAIR}" | grep -E '^AGE-SECRET-KEY-' | head -1)"
AGE_RECIPIENT="$(printf '%s' "${KEYPAIR}" | grep -oE 'age1[0-9a-z]{58}' | head -1)"

if [[ -z "${AGE_IDENTITY}" || -z "${AGE_RECIPIENT}" ]]; then
	fail "não consegui gerar o par de chaves age"
	exit 1
fi
ok "par de chaves gerado (recipient=${AGE_RECIPIENT:0:16}...)"

# ---------------------------------------------------------------------------
log "3/7 · semeando dado reconhecível no banco"

# A role app_role precisa existir porque backup.sh aborta se os globals não
# tiverem nenhum CREATE ROLE — comportamento correto (é o furo do PR #85), mas
# que faria este teste falhar por um motivo que não é o que ele investiga.
CMD="export PGURL='postgres://iris:iris@postgres:5432/iris'
psql \"\${PGURL}\" -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS canario_offsite (id int primary key, segredo text)'
psql \"\${PGURL}\" -v ON_ERROR_STOP=1 -c \"INSERT INTO canario_offsite VALUES (1, '${MARCADOR}') ON CONFLICT DO NOTHING\"
psql \"\${PGURL}\" -c 'CREATE ROLE app_role' 2>/dev/null || true
echo semeado"
no_container >/dev/null
ok "tabela canario_offsite + role app_role criadas"

# ---------------------------------------------------------------------------
log "4/7 · provisionando o bucket off-site (simula o provisionamento manual do runbook)"

CMD="printf 'iris\niris123456\n' | mc alias set off http://minio:9000 --api S3v4 >/dev/null \
	&& mc mb --ignore-existing off/${BUCKET_OFFSITE} >/dev/null && echo criado"
no_container >/dev/null
ok "bucket ${BUCKET_OFFSITE} provisionado"

# ---------------------------------------------------------------------------
log "5/7 · CAMINHO FELIZ — rodando backup.sh com off-site habilitado"

set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	backup >/tmp/iris-offsite-run.log 2>&1
EXIT_FELIZ=$?
set -e

if [[ "${EXIT_FELIZ}" -eq 0 ]]; then
	ok "backup.sh saiu 0 com off-site habilitado"
else
	fail "backup.sh saiu ${EXIT_FELIZ}, esperado 0 — log:"
	tail -25 /tmp/iris-offsite-run.log
fi

# ---------------------------------------------------------------------------
log "6/7 · ASSERÇÕES sobre o que efetivamente chegou no bucket off-site"

CMD="set -e
printf 'iris\niris123456\n' | mc alias set off http://minio:9000 --api S3v4 >/dev/null

# a) o par (dump + globals) subiu, os DOIS, e só cifrados
n_dump=\$(mc ls off/${BUCKET_OFFSITE}/ | grep -c '\.dump\.age\$' || true)
n_glob=\$(mc ls off/${BUCKET_OFFSITE}/ | grep -c '\.globals\.sql\.age\$' || true)
n_claro=\$(mc ls off/${BUCKET_OFFSITE}/ | grep -cE '\.(dump|sql)\$' || true)
echo \"ASSERT_PAR:\${n_dump}:\${n_glob}:\${n_claro}\"

obj=\$(mc ls off/${BUCKET_OFFSITE}/ | grep -oE 'iris-[0-9TZ]+\.dump\.age' | head -1)
mc cp --quiet off/${BUCKET_OFFSITE}/\${obj} /tmp/baixado.age >/dev/null

# b) o que está no bucket tem header age
head -c 21 /tmp/baixado.age | grep -q 'age-encryption.org' && echo ASSERT_HEADER:ok || echo ASSERT_HEADER:FALHOU

# c) TESTE DE VAZAMENTO — e por que o canário é o globals, não o dump.
#
# ARMADILHA JA PISADA: grepar um marcador de texto dentro do artefato .dump.age
# e um teste VACUO. O pg_dump -Fc comprime os blocos de dado com zlib, entao a
# string nao aparece em claro NEM no dump original — o grep nao acha nada com
# ou sem cifra, e a assercao passa mesmo que o upload suba tudo em claro.
# Medido: dump de 1293 bytes com o marcador inserido, grep -a nao encontra.
#
# O arquivo .globals.sql vem de pg_dumpall --globals-only: SQL puro, sem
# compressao. Ali um grep significa alguma coisa. O teste e em dois lados, e e
# o segundo que prova que o primeiro nao e decorativo:
#   c1 — a string EXISTE em claro no artefato de origem (o canário é detectável);
#   c2 — a string NÃO existe no artefato que foi para o bucket (a cifra agiu).
origem_globals=\$(ls /backups/iris-*.globals.sql | tail -1)
grep -q 'CREATE ROLE' \"\${origem_globals}\" && echo ASSERT_CANARIO_VIVO:ok || echo ASSERT_CANARIO_VIVO:FALHOU

objg_leak=\$(mc ls off/${BUCKET_OFFSITE}/ | grep -oE 'iris-[0-9TZ]+\.globals\.sql\.age' | head -1)
mc cp --quiet off/${BUCKET_OFFSITE}/\${objg_leak} /tmp/leak.age >/dev/null
if grep -qa 'CREATE ROLE' /tmp/leak.age; then echo ASSERT_VAZAMENTO:VAZOU; else echo ASSERT_VAZAMENTO:ok; fi

# d) round-trip: decifra com a privada e o resultado é um dump Postgres VÁLIDO
printf '%s\n' \"\${AGE_IDENTITY}\" > /tmp/id.txt
age -d -i /tmp/id.txt -o /tmp/baixado.dump /tmp/baixado.age
pg_restore --list /tmp/baixado.dump >/dev/null 2>&1 && echo ASSERT_RESTORE_LIST:ok || echo ASSERT_RESTORE_LIST:FALHOU

# e) o dump decifrado contém MESMO o dado semeado (não é um dump vazio válido)
pg_restore --list /tmp/baixado.dump | grep -q 'canario_offsite' && echo ASSERT_CONTEUDO:ok || echo ASSERT_CONTEUDO:FALHOU

# f) os globals decifram e trazem CREATE ROLE (o furo do PR #85 não pode voltar pelo off-site)
objg=\$(mc ls off/${BUCKET_OFFSITE}/ | grep -oE 'iris-[0-9TZ]+\.globals\.sql\.age' | head -1)
mc cp --quiet off/${BUCKET_OFFSITE}/\${objg} /tmp/baixado.globals.age >/dev/null
age -d -i /tmp/id.txt -o /tmp/baixado.globals.sql /tmp/baixado.globals.age
grep -q 'CREATE ROLE' /tmp/baixado.globals.sql && echo ASSERT_GLOBALS:ok || echo ASSERT_GLOBALS:FALHOU
"
SAIDA="$("${COMPOSE[@]}" run --rm -T --no-deps -e AGE_IDENTITY="${AGE_IDENTITY}" -e MC_CONFIG_DIR=/tmp/mc backup bash -c "${CMD}" 2>&1)"

verificar() {
	local marca="$1" esperado="$2" descricao="$3"
	if printf '%s' "${SAIDA}" | grep -q "${marca}:${esperado}"; then
		ok "${descricao}"
	else
		fail "${descricao} — saída: $(printf '%s' "${SAIDA}" | grep "${marca}" || echo '(marca ausente)')"
	fi
}

verificar ASSERT_PAR "1:1:0" "par dump+globals subiu cifrado, e NADA em claro no bucket"
verificar ASSERT_HEADER "ok" "artefato no bucket tem header age"
verificar ASSERT_CANARIO_VIVO "ok" "canário é detectável em claro na ORIGEM (prova que o teste seguinte não é vácuo)"
verificar ASSERT_VAZAMENTO "ok" "canário NÃO aparece em claro no artefato que foi para o bucket"
verificar ASSERT_RESTORE_LIST "ok" "round-trip: decifra e pg_restore --list aceita o dump"
verificar ASSERT_CONTEUDO "ok" "dump decifrado contém o dado semeado (não é dump vazio)"
verificar ASSERT_GLOBALS "ok" "globals decifram e contêm CREATE ROLE"

# ---------------------------------------------------------------------------
log "7/7 · CAMINHOS DE ERRO"

# off-site fora do ar: exit 3 (replicação parcial), NUNCA 1, e dump local íntegro.
set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT=http://destino-que-nao-existe:9000 \
	-e OFFSITE_S3_ACCESS_KEY=x \
	-e OFFSITE_S3_SECRET_KEY=y \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	backup >/tmp/iris-offsite-fora.log 2>&1
EXIT_FORA=$?
set -e

if [[ "${EXIT_FORA}" -eq 3 ]]; then
	ok "off-site fora do ar => exit 3 (replicação parcial), não 1"
else
	fail "off-site fora do ar => exit ${EXIT_FORA}, esperado 3 — log:"
	tail -15 /tmp/iris-offsite-fora.log
fi

CMD="ls /backups/iris-*.dump >/dev/null 2>&1 && echo ASSERT_LOCAL:ok || echo ASSERT_LOCAL:FALHOU"
if "${COMPOSE[@]}" run --rm -T --no-deps -e MC_CONFIG_DIR=/tmp/mc backup bash -c "${CMD}" 2>&1 | grep -q 'ASSERT_LOCAL:ok'; then
	ok "backup local continua íntegro mesmo com off-site fora"
else
	fail "backup local sumiu quando o off-site falhou"
fi

# recipient inválido: falha ANTES do dump, não sobe nada em claro.
set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="chave-colada-errado" \
	backup >/tmp/iris-offsite-chave.log 2>&1
EXIT_CHAVE=$?
set -e

if [[ "${EXIT_CHAVE}" -eq 1 ]]; then
	ok "recipient age inválido => exit 1 antes do dump (nunca sobe em claro)"
else
	fail "recipient inválido => exit ${EXIT_CHAVE}, esperado 1"
fi

# off-site desabilitado (default do dev local): exit 0 e nenhum .age novo.
set +e
"${COMPOSE[@]}" run --rm -T backup >/tmp/iris-offsite-off.log 2>&1
EXIT_OFF=$?
set -e

if [[ "${EXIT_OFF}" -eq 0 ]]; then
	ok "off-site desabilitado => exit 0 (dev local não quebra)"
else
	fail "off-site desabilitado => exit ${EXIT_OFF}, esperado 0"
fi

# ---------------------------------------------------------------------------
printf '\n[test-offsite] %d passaram, %d falharam\n\n' "${TESTES_OK}" "${TESTES_FALHOS}"
[[ "${TESTES_FALHOS}" -eq 0 ]]
