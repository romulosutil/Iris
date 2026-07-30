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
log "1/10 · subindo Postgres + MinIO"
"${COMPOSE[@]}" up -d postgres minio >/dev/null
"${COMPOSE[@]}" build backup >/dev/null

# ---------------------------------------------------------------------------
log "2/10 · gerando par de chaves age efêmero (a privada NUNCA entra no container de backup)"

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
log "3/10 · semeando dado reconhecível no banco"

# A role app_role precisa existir porque backup.sh aborta se os globals não
# tiverem nenhum CREATE ROLE — comportamento correto (é o furo do PR #85), mas
# que faria este teste falhar por um motivo que não é o que ele investiga.
CMD="export PGURL='postgres://iris:iris@postgres:5432/iris'
psql \"\${PGURL}\" -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS canario_offsite (id int primary key, segredo text)'
psql \"\${PGURL}\" -v ON_ERROR_STOP=1 -c \"INSERT INTO canario_offsite VALUES (1, '${MARCADOR}') ON CONFLICT DO NOTHING\"
psql \"\${PGURL}\" -c 'CREATE ROLE app_role' 2>/dev/null || true
psql \"\${PGURL}\" -c 'CREATE ROLE iris_auth' 2>/dev/null || true
echo semeado"
no_container >/dev/null
ok "tabela canario_offsite + roles de RLS (app_role, iris_auth) criadas"

# ---------------------------------------------------------------------------
log "4/10 · provisionando o bucket off-site (simula o provisionamento manual do runbook)"

CMD="printf 'iris\niris123456\n' | mc alias set off http://minio:9000 --api S3v4 >/dev/null \
	&& mc mb --ignore-existing off/${BUCKET_OFFSITE} >/dev/null && echo criado"
no_container >/dev/null
ok "bucket ${BUCKET_OFFSITE} provisionado"

# ---------------------------------------------------------------------------
log "5/10 · CAMINHO FELIZ — rodando backup.sh com off-site habilitado"

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
log "6/10 · ASSERÇÕES sobre o que efetivamente chegou no bucket off-site"

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
log "7/10 · CAMINHOS DE ERRO"

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

CMD="grep -q 'exit_code=3' /backups/.offsite-degradado 2>/dev/null && grep -q 'date=' /backups/.offsite-degradado 2>/dev/null && echo ASSERT_DEGRADADO:ok || echo ASSERT_DEGRADADO:FALHOU"
if "${COMPOSE[@]}" run --rm -T --no-deps -e MC_CONFIG_DIR=/tmp/mc backup bash -c "${CMD}" 2>&1 | grep -q 'ASSERT_DEGRADADO:ok'; then
	ok "marcador .offsite-degradado criado (com exit_code e date) quando a replicação falha (exit 3)"
else
	fail "marcador .offsite-degradado não foi criado ou não tem schema completo em exit 3"
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
log "8/10 · CADÊNCIA (OFFSITE_INTERVAL_DAYS) — réplica semanal sem depender de ninguém lembrar"

# Quantos artefatos existem no bucket agora. O marcador .ultimo-offsite foi
# escrito no passo 5 (único que teve sucesso de upload até aqui).
contar_no_bucket() {
	CMD="printf 'iris\niris123456\n' | mc alias set off http://minio:9000 --api S3v4 >/dev/null
mc ls off/${BUCKET_OFFSITE}/ | grep -c 'dump.age' || true"
	no_container 2>/dev/null | tr -d '\r' | tail -1
}

ANTES="$(contar_no_bucket)"

# a) intervalo 7d com marcador fresco => réplica NÃO é devida. Sai 0 (não é
#    falha, é a cadência), e nada novo sobe.
set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	-e OFFSITE_INTERVAL_DAYS=7 \
	backup >/tmp/iris-offsite-semanal.log 2>&1
EXIT_SEMANAL=$?
set -e

DEPOIS="$(contar_no_bucket)"

if [[ "${EXIT_SEMANAL}" -eq 0 ]] && grep -q 'não é devida' /tmp/iris-offsite-semanal.log; then
	ok "intervalo 7d + marcador fresco => réplica pulada, exit 0 (pular por cadência não é falha)"
else
	fail "intervalo 7d => exit ${EXIT_SEMANAL} e log sem 'não é devida'"
fi

if [[ "${ANTES}" == "${DEPOIS}" ]]; then
	ok "nada novo subiu quando a réplica não era devida (${ANTES} => ${DEPOIS})"
else
	fail "subiu artefato fora da cadência (${ANTES} => ${DEPOIS})"
fi

# b) envelhecendo o marcador para 8 dias atrás, a réplica volta a ser devida.
#    Prova que o gate é temporal e não um "desligado" disfarçado.
#
#    O timestamp é calculado AQUI no host e passado absoluto: a imagem é Alpine
#    e o `touch` do busybox NÃO aceita data relativa — `touch -d '8 days ago'`
#    responde `invalid date`. Só o `-t YYYYMMDDhhmm` é portável entre o busybox
#    do container e o GNU coreutils da máquina de dev.
STAMP_8D="$(date -u -d '8 days ago' +%Y%m%d%H%M)"
CMD="touch -t ${STAMP_8D} /backups/.ultimo-offsite && echo envelhecido"
no_container >/dev/null

set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	-e OFFSITE_INTERVAL_DAYS=7 \
	backup >/tmp/iris-offsite-vencido.log 2>&1
EXIT_VENCIDO=$?
set -e

VENCIDO="$(contar_no_bucket)"

if [[ "${EXIT_VENCIDO}" -eq 0 && "${VENCIDO}" -gt "${DEPOIS}" ]]; then
	ok "marcador vencido (8d > 7d) => réplica volta a subir (${DEPOIS} => ${VENCIDO})"
else
	fail "marcador vencido não disparou a réplica (exit ${EXIT_VENCIDO}, ${DEPOIS} => ${VENCIDO})"
fi

CMD="[ ! -f /backups/.offsite-degradado ] && echo ASSERT_LIMPO:ok || echo ASSERT_LIMPO:FALHOU"
if "${COMPOSE[@]}" run --rm -T --no-deps -e MC_CONFIG_DIR=/tmp/mc backup bash -c "${CMD}" 2>&1 | grep -q 'ASSERT_LIMPO:ok'; then
	ok "marcador .offsite-degradado removido após replicação bem-sucedida"
else
	fail "marcador .offsite-degradado permaneceu após replicação bem-sucedida"
fi

# c) intervalo inválido é rejeitado na validação de env, antes do dump.
set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	-e OFFSITE_INTERVAL_DAYS=0 \
	backup >/tmp/iris-offsite-intervalo.log 2>&1
EXIT_INTERVALO=$?
set -e

if [[ "${EXIT_INTERVALO}" -eq 1 ]]; then
	ok "OFFSITE_INTERVAL_DAYS=0 => exit 1 na validação (não vira 'nunca replicar' silencioso)"
else
	fail "OFFSITE_INTERVAL_DAYS=0 => exit ${EXIT_INTERVALO}, esperado 1"
fi

# ---------------------------------------------------------------------------
log "9/10 · REGIÃO DE ASSINATURA SigV4 — o dialeto S3 que o MinIO perdoa e a OCI não"

# POR QUE ESTA SEÇÃO EXISTE: os 18 testes acima passaram verdes enquanto a
# réplica off-site de PRODUÇÃO não subia nada. O teste fala MinIO; o destino
# real é a Oracle Cloud, e MinIO perdoa dois desvios de dialeto que a OCI não:
# região de assinatura SigV4 e estilo de path. Sem cobrir isso, essa classe de
# bug fica invisível justamente na cópia que ninguém exercita.
#
# ATENÇÃO ao que esta seção NÃO afirma. A falha real em produção foi de
# CREDENCIAL, não de região — a réplica voltou a subir com o mc assinando
# `us-east-1`, sem nenhuma configuração de região. Por isso os dois parafusos
# são opt-in e o default testado aqui é o que está PROVADO em produção. Testar
# o default é metade do ponto: garante que ninguém "conserte" preventivamente o
# que está funcionando.
#
# O endpoint abaixo usa uma região INEXISTENTE de propósito: o formato casa com
# o da OCI (é o que se quer exercitar) mas o DNS não resolve, então o teste não
# depende de rede nem manda tráfego para a Oracle.
readonly ENDPOINT_OCI_FALSO="https://nsfake.compat.objectstorage.regiao-inexistente-9.oraclecloud.com"

# a) DEFAULT: sem OFFSITE_S3_REGION, o mc assina us-east-1 e o path-style fica
#    em `auto`. É a configuração que sobe para a OCI hoje — qualquer mudança
#    aqui é mudança de comportamento em produção e tem que ser deliberada.
set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT="${ENDPOINT_OCI_FALSO}" \
	-e OFFSITE_S3_ACCESS_KEY=chavedeacessofalsa \
	-e OFFSITE_S3_SECRET_KEY=segredofalsocomtamanhosuficiente \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	backup >/tmp/iris-offsite-regiao-derivada.log 2>&1
EXIT_DERIVADA=$?
set -e

if grep -q "assinando SigV4 na região 'us-east-1 (default do mc)' (path-style=auto)" /tmp/iris-offsite-regiao-derivada.log; then
	ok "default preservado: us-east-1 + path-style=auto (o que a OCI aceita hoje)"
else
	fail "default de região/path-style mudou — log: $(grep -i 'sigv4' /tmp/iris-offsite-regiao-derivada.log || echo '(linha ausente)')"
fi

if [[ "${EXIT_DERIVADA}" -eq 3 ]]; then
	ok "destino off-site inalcançável => exit 3, backup local preservado"
else
	fail "destino inalcançável => exit ${EXIT_DERIVADA}, esperado 3"
fi

# b) os dois parafusos existem e chegam mesmo até o mc. São a saída se a OCI
#    mudar de exigência ou se o destino trocar de provedor.
set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT="${ENDPOINT_OCI_FALSO}" \
	-e OFFSITE_S3_REGION="eu-frankfurt-1" \
	-e OFFSITE_S3_PATH_STYLE="on" \
	-e OFFSITE_S3_ACCESS_KEY=chavedeacessofalsa \
	-e OFFSITE_S3_SECRET_KEY=segredofalsocomtamanhosuficiente \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	backup >/tmp/iris-offsite-regiao-override.log 2>&1
set -e

if grep -q "assinando SigV4 na região 'eu-frankfurt-1' (path-style=on)" /tmp/iris-offsite-regiao-override.log; then
	ok "OFFSITE_S3_REGION e OFFSITE_S3_PATH_STYLE chegam até o mc quando setados"
else
	fail "override ignorado — log: $(grep -i 'sigv4' /tmp/iris-offsite-regiao-override.log || echo '(linha ausente)')"
fi

# b2) valor inválido de path-style falha na validação, antes do dump.
set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT="${ENDPOINT_OCI_FALSO}" \
	-e OFFSITE_S3_PATH_STYLE="talvez" \
	-e OFFSITE_S3_ACCESS_KEY=chavedeacessofalsa \
	-e OFFSITE_S3_SECRET_KEY=segredofalsocomtamanhosuficiente \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	backup >/tmp/iris-offsite-pathstyle-invalido.log 2>&1
EXIT_PATH_INVALIDO=$?
set -e

if [[ "${EXIT_PATH_INVALIDO}" -eq 1 ]]; then
	ok "OFFSITE_S3_PATH_STYLE inválido => exit 1 na validação (não vira 'auto' silencioso)"
else
	fail "path-style inválido => exit ${EXIT_PATH_INVALIDO}, esperado 1"
fi

# c) região explícita num destino que NÃO é OCI não pode quebrar o upload. Esta
#    é a asserção de não-regressão: o MinIO local continua recebendo a réplica
#    com a variável nova em jogo.
ANTES_REGIAO="$(contar_no_bucket)"

set +e
"${COMPOSE[@]}" run --rm -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_REGION="sa-saopaulo-1" \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_AGE_RECIPIENT="${AGE_RECIPIENT}" \
	backup >/tmp/iris-offsite-regiao-minio.log 2>&1
EXIT_REGIAO_MINIO=$?
set -e

DEPOIS_REGIAO="$(contar_no_bucket)"

if [[ "${EXIT_REGIAO_MINIO}" -eq 0 && "${DEPOIS_REGIAO}" -gt "${ANTES_REGIAO}" ]]; then
	ok "upload segue funcionando com região explícita (${ANTES_REGIAO} => ${DEPOIS_REGIAO})"
else
	fail "região explícita quebrou o upload (exit ${EXIT_REGIAO_MINIO}, ${ANTES_REGIAO} => ${DEPOIS_REGIAO})"
fi

# d) a sonda pré-upload precisa dizer QUAL região usou quando falha. Sem isso a
#    próxima falha em produção volta a ser um chute entre credencial e região.
if grep -q "sonda de autenticação falhou" /tmp/iris-offsite-regiao-derivada.log \
	&& grep -q "Comece pela CREDENCIAL" /tmp/iris-offsite-regiao-derivada.log \
	&& grep -q "usada 'us-east-1'" /tmp/iris-offsite-regiao-derivada.log; then
	ok "sonda pré-upload manda olhar a credencial primeiro e nomeia a região usada"
else
	fail "sonda não reportou a região na falha — log: $(grep -i 'sonda' /tmp/iris-offsite-regiao-derivada.log || echo '(linha ausente)')"
fi

# ---------------------------------------------------------------------------
log "10/10 · verify-offsite.sh — a ferramenta que prova que a réplica é RESTAURÁVEL"

# O verify-offsite.sh é o que o operador roda contra o bucket de PRODUÇÃO, com a
# chave privada que só existe fora do VPS. Ou seja: é mais uma coisa que só seria
# exercitada no pior dia. Testá-lo aqui é o que impede que a ferramenta de
# verificação seja, ela mesma, o próximo item quebrado sem ninguém saber.

verify_offsite() {
	# A chave privada entra por STDIN, igual ao uso real documentado no
	# cabeçalho do verify-offsite.sh.
	"${COMPOSE[@]}" run --rm --no-deps -T \
		-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
		-e OFFSITE_S3_ACCESS_KEY=iris \
		-e OFFSITE_S3_SECRET_KEY=iris123456 \
		-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
		backup ./verify-offsite.sh
}

# a) caminho feliz: chave certa => decifra, restaura e sai 0.
set +e
printf '%s\n' "${AGE_IDENTITY}" | verify_offsite >/tmp/iris-verify-ok.log 2>&1
EXIT_VERIFY=$?
set -e

if [[ "${EXIT_VERIFY}" -eq 0 ]] && grep -q 'RÉPLICA OFF-SITE VERIFICADA' /tmp/iris-verify-ok.log; then
	ok "verify-offsite.sh com a chave certa => exit 0 e réplica verificada"
else
	fail "verify-offsite.sh falhou com a chave certa (exit ${EXIT_VERIFY}) — log:"
	tail -12 /tmp/iris-verify-ok.log
fi

if grep -q 'dump restaurável: [1-9]' /tmp/iris-verify-ok.log \
	&& grep -q 'globals contêm as roles de RLS' /tmp/iris-verify-ok.log; then
	ok "verificação inspeciona conteúdo (tabelas > 0 e roles de RLS presentes)"
else
	fail "verify-offsite.sh não reportou tabelas e roles — log: $(grep -E 'restaurável|roles' /tmp/iris-verify-ok.log || echo '(ausente)')"
fi

if grep -q 'sha256 do dump decifrado' /tmp/iris-verify-ok.log; then
	ok "sha256 do dump decifrado impresso (fecho contra o log do backup.sh)"
else
	fail "verify-offsite.sh não imprimiu o sha256 do dump decifrado"
fi

# b) ESTA é a asserção que impede o teste de ser decorativo: com a chave ERRADA
#    o script tem que FALHAR. Um verify que passa com qualquer chave não prova
#    nada — e o cenário que ele existe para pegar (réplica cifrada com chave
#    cuja privada ninguém tem) é exatamente esse.
OUTRO_PAR="$("${COMPOSE[@]}" run --rm --no-deps -T backup bash -c 'age-keygen 2>/dev/null')"
CHAVE_ERRADA="$(printf '%s' "${OUTRO_PAR}" | grep -E '^AGE-SECRET-KEY-' | head -1)"

set +e
printf '%s\n' "${CHAVE_ERRADA}" | verify_offsite >/tmp/iris-verify-chave-errada.log 2>&1
EXIT_ERRADA=$?
set -e

if [[ "${EXIT_ERRADA}" -ne 0 ]] && grep -q 'NÃO FOI POSSÍVEL DECIFRAR' /tmp/iris-verify-chave-errada.log; then
	ok "chave errada => verify-offsite.sh FALHA (o teste do caminho feliz não é vácuo)"
else
	fail "chave errada passou (exit ${EXIT_ERRADA}) — o verify não prova nada"
fi

# c) chave privada por env var é recusada: `docker inspect` mostra o env de
#    qualquer container, e o histórico fica no daemon.
set +e
printf '%s\n' "${AGE_IDENTITY}" | "${COMPOSE[@]}" run --rm --no-deps -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e AGE_IDENTITY="${AGE_IDENTITY}" \
	backup ./verify-offsite.sh >/tmp/iris-verify-env.log 2>&1
EXIT_ENV=$?
set -e

if [[ "${EXIT_ENV}" -ne 0 ]] && grep -q 'entra por STDIN' /tmp/iris-verify-env.log; then
	ok "chave privada em env var é recusada (só stdin)"
else
	fail "verify-offsite.sh aceitou a chave privada por env var (exit ${EXIT_ENV})"
fi

# d) bucket que responde mas está vazio tem mensagem própria — é o desfecho de
#    "a réplica nunca subiu", que não pode ser confundido com falha de chave.
CMD="printf 'iris\niris123456\n' | mc alias set off http://minio:9000 --api S3v4 >/dev/null \
	&& mc mb --ignore-existing off/bucket-vazio-teste >/dev/null && echo criado"
no_container >/dev/null

set +e
printf '%s\n' "${AGE_IDENTITY}" | "${COMPOSE[@]}" run --rm --no-deps -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET=bucket-vazio-teste \
	backup ./verify-offsite.sh >/tmp/iris-verify-vazio.log 2>&1
EXIT_VAZIO=$?
set -e

if [[ "${EXIT_VAZIO}" -ne 0 ]] && grep -q 'está VAZIO' /tmp/iris-verify-vazio.log; then
	ok "bucket vazio => mensagem própria ('a réplica nunca subiu'), não erro de chave"
else
	fail "bucket vazio não teve diagnóstico próprio (exit ${EXIT_VAZIO})"
fi

# e) argumento malformado tem diagnóstico próprio. Sem a validação, um nome
#    digitado pela metade (ou o nome do globals no lugar do dump) faz os DOIS
#    downloads darem 404 e o operador recebe "par INCOMPLETO no bucket" — um
#    incidente classe PR #85 — por causa de um erro de digitação, no meio de um
#    DR. O diagnóstico errado aqui custa mais caro do que em qualquer outro
#    ponto do script.
set +e
printf '%s\n' "${AGE_IDENTITY}" | "${COMPOSE[@]}" run --rm --no-deps -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	backup ./verify-offsite.sh iris-20260728T024929Z.globals.sql.age \
	>/tmp/iris-verify-arg.log 2>&1
EXIT_ARG=$?
set -e

if [[ "${EXIT_ARG}" -ne 0 ]] && grep -q 'argumento inválido' /tmp/iris-verify-arg.log; then
	ok "argumento fora do formato do dump => erro próprio, não 'par INCOMPLETO'"
else
	fail "verify-offsite.sh aceitou argumento malformado (exit ${EXIT_ARG}) — diagnóstico vira incidente falso"
fi

# f) mesmo guard de OFFSITE_S3_PATH_STYLE que o backup.sh tem. Sem ele o valor
#    cru chega no `mc alias set --path` e o erro sai como "mc alias set falhou",
#    que o runbook condiciona a ler como problema de CREDENCIAL.
set +e
printf '%s\n' "${AGE_IDENTITY}" | "${COMPOSE[@]}" run --rm --no-deps -T \
	-e OFFSITE_S3_ENDPOINT=http://minio:9000 \
	-e OFFSITE_S3_ACCESS_KEY=iris \
	-e OFFSITE_S3_SECRET_KEY=iris123456 \
	-e OFFSITE_S3_BUCKET="${BUCKET_OFFSITE}" \
	-e OFFSITE_S3_PATH_STYLE=onn \
	backup ./verify-offsite.sh >/tmp/iris-verify-path.log 2>&1
EXIT_PATH=$?
set -e

if [[ "${EXIT_PATH}" -ne 0 ]] && grep -q 'OFFSITE_S3_PATH_STYLE precisa ser' /tmp/iris-verify-path.log; then
	ok "OFFSITE_S3_PATH_STYLE inválido no verify => erro nomeado, não 'alias falhou'"
else
	fail "verify-offsite.sh não validou OFFSITE_S3_PATH_STYLE (exit ${EXIT_PATH})"
fi

# ---------------------------------------------------------------------------
printf '\n[test-offsite] %d passaram, %d falharam\n\n' "${TESTES_OK}" "${TESTES_FALHOS}"
[[ "${TESTES_FALHOS}" -eq 0 ]]
