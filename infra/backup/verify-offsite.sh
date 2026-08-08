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
# ENV OPCIONAL — é o que separa "um artefato decifra" de "O NOSSO artefato
# decifra" (critérios de aceite da #105):
#
#   OFFSITE_EXPECTED_SHA256          sha256 esperado do DUMP decifrado, copiado
#                                    da linha `sha256=` que o backup.sh logou
#                                    para ESTE mesmo carimbo. Sem ele o script
#                                    não tem contra o que confrontar e não pode
#                                    afirmar procedência (ver exit 2).
#   OFFSITE_EXPECTED_SHA256_GLOBALS  idem para os globals. Se ausente, só o dump
#                                    é confrontado.
#   OFFSITE_MIN_CARIMBO              corte, no formato YYYYMMDDTHHMMSSZ. Objeto
#                                    com carimbo anterior é RECUSADO antes de
#                                    baixar. Existe porque as réplicas anteriores
#                                    à rotação da chave age de 2026-07-28 ~04:00
#                                    UTC foram cifradas com uma privada que não
#                                    existe mais: são lixo permanente, e verificar
#                                    uma delas não diz nada sobre a réplica viva.
#
# Exit code:
#   0 = VERIFICADA POR COMPLETO: decifra, restaura, traz as roles de RLS, e o
#       sha256 do dump confere com OFFSITE_EXPECTED_SHA256. Só neste caso a
#       linha de aceite `RÉPLICA OFF-SITE VERIFICADA` é impressa.
#   1 = falhou em algum ponto — a mensagem diz qual, e a distinção importa:
#       não conseguir LISTAR o bucket é problema de credencial de leitura;
#       não conseguir DECIFRAR é a chave errada, que é o desastre silencioso
#       que este script existe para encontrar antes do dia ruim.
#   2 = o artefato decifra e é restaurável, mas a PROCEDÊNCIA não foi provada
#       porque OFFSITE_EXPECTED_SHA256 não foi informado. Isto NÃO satisfaz o
#       critério de aceite da #105.
#
# POR QUE O EXIT 2 EXISTE: até a #105, este script imprimia o sha256 e mandava
# o operador conferir a olho contra o log — e imprimia `RÉPLICA OFF-SITE
# VERIFICADA` de qualquer jeito, tivesse a conferência acontecido ou não. Ou
# seja, o próprio script que existe para desmascarar o `exit 0` mentiroso do
# backup.sh tinha um `exit 0` mentiroso. Um verde que não checou o que promete
# checar é pior que vermelho: some do radar.

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

# `: "${VAR:?...}"` só pega vazio/não-setada. Não pega o defeito real da #105:
# o runbook mostra `OFFSITE_S3_ENDPOINT=https://<ns>.compat...oraclecloud.com`
# como exemplo, o operador exporta o placeholder literal sem substituir, a
# variável fica NÃO-vazia, o guard de ausência passa, e o `mc` falha lá na
# frente com um erro genérico de hostname — que a mensagem de `mc ls` (abaixo)
# lia como credencial sem permissão de leitura. Checar os dois defeitos aqui,
# na borda, fecha isso antes de chegar no `mc`.
#
# A mensagem do placeholder NUNCA ecoa o valor: OFFSITE_S3_SECRET_KEY é
# segredo, e um log de DR é o pior lugar para vazar credencial.
verificar_env_obrigatoria() {
	local nome="$1"
	local valor="${!nome:-}"
	if [[ -z "${valor}" ]]; then
		log_error "${nome} é obrigatório e não foi definido."
		exit 1
	fi
	if [[ "${valor}" == *'<'*'>'* ]]; then
		log_error "${nome} contém um placeholder não substituído (formato <...>). Conferir o valor exportado — provavelmente foi copiado do exemplo do runbook sem trocar pelo valor real. O valor não é logado por conter possível segredo."
		exit 1
	fi
}

verificar_env_obrigatoria OFFSITE_S3_ENDPOINT
verificar_env_obrigatoria OFFSITE_S3_ACCESS_KEY
verificar_env_obrigatoria OFFSITE_S3_SECRET_KEY
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

# --- sha256 esperado ------------------------------------------------------------
# O operador copia a linha do log do backup.sh, e o que ele copia costuma vir com
# o prefixo `sha256=` junto e/ou em caixa alta. Aceitar as três formas aqui é
# ergonomia barata; o que NÃO se pode aceitar é um valor que não é um sha256 —
# esse cai no ramo de "não confere" lá no fim e o operador conclui que a réplica
# está corrompida quando na verdade colou a linha errada. Validar na borda faz o
# diagnóstico ser sobre o que de fato aconteceu.
# Escreve o valor normalizado na variável `$2` via `printf -v`, em vez de
# imprimir para ser capturado com `$(...)`. A diferença não é estilo: dentro de
# uma substituição de comando o `exit 1` da validação abaixo mataria só o
# SUBSHELL. O script principal seguiria com a variável vazia — ou seja, um sha
# esperado malformado cairia no ramo "não informado" e sairia 2 (procedência não
# provada) em vez de 1 (valor errado), com a mensagem errada. Escrever direto no
# escopo do chamador deixa o `exit` abortar de verdade.
normalizar_sha_esperado() {
	local nome="$1"
	local destino="$2"
	local valor="${!nome:-}"

	# `if` em vez de `[[ ... ]] && return 0`: com `set -e` a forma curta deixa a
	# função com status 1 sempre que a variável ESTÁ preenchida, o que dispara o
	# trap ERR e derruba o script no caminho normal.
	if [[ -z "${valor}" ]]; then
		printf -v "${destino}" '%s' ''
		return 0
	fi

	valor="${valor#sha256=}"
	valor="${valor,,}"

	if ! [[ "${valor}" =~ ^[0-9a-f]{64}$ ]]; then
		log_error "${nome} não parece um sha256 (esperado 64 dígitos hexadecimais, com ou sem o prefixo 'sha256='). Conferir o que foi copiado do log do backup.sh — provavelmente veio a linha inteira em vez de só o hash. O valor recebido não é logado."
		exit 1
	fi

	printf -v "${destino}" '%s' "${valor}"
}

normalizar_sha_esperado OFFSITE_EXPECTED_SHA256 SHA_ESPERADO_DUMP
readonly SHA_ESPERADO_DUMP
normalizar_sha_esperado OFFSITE_EXPECTED_SHA256_GLOBALS SHA_ESPERADO_GLOBALS
readonly SHA_ESPERADO_GLOBALS

# --- corte de carimbo -------------------------------------------------------------
readonly MIN_CARIMBO="${OFFSITE_MIN_CARIMBO:-}"
if [[ -n "${MIN_CARIMBO}" ]] && ! [[ "${MIN_CARIMBO}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
	log_error "OFFSITE_MIN_CARIMBO inválido: '${MIN_CARIMBO}'. Esperado YYYYMMDDTHHMMSSZ, sem o prefixo 'iris-' (ex.: 20260728T040000Z). Um corte malformado seria comparado como texto e deixaria passar exatamente o objeto que ele deveria barrar."
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
	log_error "não foi possível LISTAR ${OFFSITE_S3_BUCKET}. Resposta do mc: ${listagem//${OFFSITE_S3_SECRET_KEY}/***}
Hipóteses, sem ordem de probabilidade — não afirmar qual é a causa antes de checar:
  1) OFFSITE_S3_ENDPOINT malformado (placeholder do runbook não substituído, typo, protocolo/host errado).
  2) credencial sem permissão de LEITURA (a de produção é write-only por design, sem ListBucket/GetObject) — gerar uma credencial de LEITURA só para esta verificação e revogá-la depois.
  3) OFFSITE_S3_BUCKET ou OFFSITE_S3_REGION errados para este endpoint."
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

# Corte de carimbo, ANTES de baixar: réplica anterior à última rotação da chave
# age foi cifrada com uma privada que não existe mais. Ela decifra? Não. Então o
# script sairia 1 com "NÃO FOI POSSÍVEL DECIFRAR" — a mesma mensagem que o
# desastre de verdade produz. Barrar aqui, com a causa correta no texto, evita
# que o operador leia um objeto sabidamente lixo como perda de chave nova.
# Comparação lexicográfica é cronológica: o carimbo é ISO-8601 básico UTC.
if [[ -n "${MIN_CARIMBO}" ]]; then
	CARIMBO_NU="${CARIMBO#iris-}"
	if [[ "${CARIMBO_NU}" < "${MIN_CARIMBO}" ]]; then
		log_error "o objeto mais recente do bucket é ${CARIMBO}, ANTERIOR ao corte OFFSITE_MIN_CARIMBO=${MIN_CARIMBO}. Objeto anterior ao corte foi cifrado com uma chave age cuja privada não existe mais — é irrecuperável por desenho e não há o que verificar nele. O que isto revela NÃO é uma réplica corrompida: é que NENHUMA réplica nova subiu desde o corte. Investigar o serviço de backup (o scheduler.sh loga a falha e continua o laço — o painel não reflete replicação quebrada) e a cadência OFFSITE_INTERVAL_DAYS antes de qualquer outra coisa."
		exit 1
	fi
fi

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
		log_error "falha ao baixar ${objeto}. Resposta do mc: ${saida_cp//${OFFSITE_S3_SECRET_KEY}/***}
Hipóteses, sem ordem de probabilidade — não afirmar qual é a causa antes de checar:
  1) OFFSITE_S3_ENDPOINT malformado (placeholder do runbook não substituído, typo, protocolo/host errado).
  2) negação de acesso: a credencial de produção é write-only por design (sem GetObject) — gerar uma de LEITURA temporária.
  3) objeto inexistente: se o outro do par tiver baixado, o par está INCOMPLETO no bucket — um restore com esse artefato recria as tabelas e nenhuma policy de RLS (ver PR #85)."
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
# Carimbo do objeto em formato legível, para o operador comparar direto com a
# data da última rotação da chave age sem fazer aritmética mental sob pressão
# de DR. CARIMBO é iris-YYYYMMDDTHHMMSSZ; extrai a parte da data.
formatar_carimbo_legivel() {
	local carimbo="$1"
	if [[ "${carimbo}" =~ ^iris-([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$ ]]; then
		printf '%s-%s-%s %s:%s:%s UTC' \
			"${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" \
			"${BASH_REMATCH[4]}" "${BASH_REMATCH[5]}" "${BASH_REMATCH[6]}"
	else
		printf '%s (formato de carimbo não reconhecido)' "${carimbo}"
	fi
}
readonly CARIMBO_LEGIVEL="$(formatar_carimbo_legivel "${CARIMBO}")"

# É AQUI que mora o desastre silencioso que este script existe para achar: uma
# réplica cifrada com uma chave pública cuja privada ninguém guardou passa por
# todas as verificações anteriores e falha só nesta.
if ! age -d -i "${IDENTITY_FILE}" -o "${TMP_DIR}/${CARIMBO}.dump" "${TMP_DIR}/${NOME_DUMP}" 2>"${TMP_DIR}/age.err"; then
	# Checagem barata e determinística: a pública derivada da privada recebida
	# por stdin bate com OFFSITE_AGE_RECIPIENT (configurada no VPS)? Se bater,
	# as hipóteses (b)/(c) abaixo caem e sobra só a (a) — objeto pré-rotação.
	# NUNCA logar a privada; `age-keygen -y` só imprime a pública (age1...).
	verificacao_chave=""
	if [[ -n "${OFFSITE_AGE_RECIPIENT:-}" ]]; then
		if publica_derivada="$(age-keygen -y "${IDENTITY_FILE}" 2>/dev/null)"; then
			if [[ "${publica_derivada}" == "${OFFSITE_AGE_RECIPIENT}" ]]; then
				verificacao_chave="A pública derivada da chave fornecida (${publica_derivada}) BATE com OFFSITE_AGE_RECIPIENT — a chave é o par certo do recipient atual. Hipóteses (b) e (c) descartadas: sobra (a)."
			else
				verificacao_chave="A pública derivada da chave fornecida (${publica_derivada}) NÃO bate com OFFSITE_AGE_RECIPIENT (${OFFSITE_AGE_RECIPIENT}) — hipótese (b) ou (c) confirmada, não é problema de rotação."
			fi
		else
			verificacao_chave="não foi possível derivar a pública da chave fornecida com 'age-keygen -y' (chave malformada?) — checagem automática inconclusiva."
		fi
	else
		verificacao_chave="OFFSITE_AGE_RECIPIENT não está definida neste ambiente — rodar manualmente 'age-keygen -y' na chave privada fornecida e comparar o age1... resultante com o OFFSITE_AGE_RECIPIENT configurado no VPS."
	fi

	log_error "NÃO FOI POSSÍVEL DECIFRAR ${NOME_DUMP} com a chave fornecida (carimbo do objeto: ${CARIMBO_LEGIVEL}). A réplica off-site existe e é INÚTIL até isto ser resolvido. Detalhe do age: $(tr -d '\n' <"${TMP_DIR}/age.err")
Hipóteses, sem ordem de probabilidade — não afirmar qual é a causa antes de checar:
  a) o objeto é ANTERIOR à última rotação da chave age e foi cifrado com uma chave cuja privada não existe mais — comparar ${CARIMBO_LEGIVEL} com a data da última rotação; se o objeto for anterior, é IRRECUPERÁVEL POR DESENHO e não há o que consertar (coberto pela regra de lifecycle de 30 dias).
  b) a chave privada fornecida não é o par de OFFSITE_AGE_RECIPIENT configurado no VPS atualmente.
  c) a chave passada por stdin é de outra geração/outro ambiente (ex.: staging em vez de produção).
Verificação automática: ${verificacao_chave}"
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

# Tudo acima prova que ALGUM artefato do bucket decifra e restaura. O que ainda
# não está provado é que ele é O NOSSO — o que o VPS gerou naquele ciclo, e não
# uma cópia antiga, um dump de outro banco, ou um objeto de outro ambiente. O
# único fecho é confrontar com o sha256 que o backup.sh logou no momento da
# geração. Enquanto isso não acontecer, o script NÃO tem direito de imprimir a
# linha de aceite.
if [[ -z "${SHA_ESPERADO_DUMP}" ]]; then
	log_info "VERIFICAÇÃO PARCIAL: ${CARIMBO} decifra, restaura e traz as roles de RLS — mas a PROCEDÊNCIA não foi provada, porque OFFSITE_EXPECTED_SHA256 não foi informado."
	log_info "Provado até aqui: existe no bucket um artefato restaurável. NÃO provado: que ele é o que o VPS gerou em ${CARIMBO_LEGIVEL}."
	log_info "Para fechar: pegar a linha 'sha256=' do dump no log do backup.sh deste mesmo carimbo, exportar OFFSITE_EXPECTED_SHA256 e rodar de novo. Isto NÃO satisfaz o critério de aceite da #105."
	exit 2
fi

if [[ "${SHA_DUMP}" != "${SHA_ESPERADO_DUMP}" ]]; then
	log_error "o dump decifra e é restaurável, mas o sha256 NÃO confere com o esperado.
  esperado (OFFSITE_EXPECTED_SHA256) = ${SHA_ESPERADO_DUMP}
  obtido   (dump decifrado do bucket) = ${SHA_DUMP}
Hipóteses, sem ordem de probabilidade — não afirmar qual é a causa antes de checar:
  1) o sha esperado foi copiado do log de OUTRO carimbo (o objeto verificado é ${CARIMBO}) — é o erro mais comum e o mais barato de descartar.
  2) o objeto no bucket não é o que o VPS gerou naquele ciclo: cópia antiga, sobrescrita, ou upload de outro ambiente apontando para o mesmo bucket.
  3) corrupção em trânsito ou no armazenamento — neste caso o dump normalmente já teria falhado no pg_restore --list, o que não aconteceu."
	exit 1
fi

log_info "sha256 do dump CONFERE com o esperado — o artefato restaurável é o que o VPS gerou."

if [[ -n "${SHA_ESPERADO_GLOBALS}" ]]; then
	if [[ "${SHA_GLOBALS}" != "${SHA_ESPERADO_GLOBALS}" ]]; then
		log_error "o dump confere, mas os GLOBALS não.
  esperado (OFFSITE_EXPECTED_SHA256_GLOBALS) = ${SHA_ESPERADO_GLOBALS}
  obtido   (globals decifrados do bucket)     = ${SHA_GLOBALS}
Par descasado: o dump é do ciclo ${CARIMBO} e os globals não. Restaurar assim recria as tabelas com as roles erradas — ou sem elas, que é o furo do PR #85 (banco com dado clínico e ZERO policy de RLS)."
		exit 1
	fi
	log_info "sha256 dos globals CONFERE com o esperado."
fi

log_info "RÉPLICA OFF-SITE VERIFICADA: ${CARIMBO} é restaurável."
