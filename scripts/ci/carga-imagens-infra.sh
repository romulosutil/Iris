#!/usr/bin/env bash
#
# Teste de CARGA das imagens de infra que NÃO compartilham o node_modules nem a
# árvore de arquivos do app (#157).
#
# O buraco que isto fecha: `infra/escalonamento/Dockerfile` e
# `infra/backup/Dockerfile` listam o que copiam e instalam as dependências à
# mão, de propósito, para não arrastar Next/React/Playwright para processos que
# rodam uma chamada SQL por minuto. Consequência: `pnpm test`, `pnpm typecheck`
# e `pnpm lint` rodam contra a árvore do REPO, onde o arquivo importado existe e
# a dependência está no node_modules da raiz — e ficam VERDES com a imagem
# quebrada. Foi assim que a #126 adicionou um `import` e uma dependência, passou
# por review e CI verdes, e derrubou o motor de escalonamento em produção por
# ~20 minutos com ERR_MODULE_NOT_FOUND (PR #156). Import de topo não cai em
# try/catch: não há degradação graciosa possível.
#
# O teste não INSPECIONA o Dockerfile — ele constrói a imagem e CARREGA o
# código lá dentro, que é a única coisa que prova que o que o processo importa
# chegou na imagem.
#
# Regra de leitura de cada asserção (vale para os dois serviços):
#   - exit != 0 com a mensagem de guarda ESPERADA  -> VERDE. O módulo carregou
#     inteiro e o programa morreu onde deveria: na env que falta.
#   - exit == 0                                    -> VERMELHO. Significa que a
#     guarda de execução parou de rodar (foi o defeito da #153) e um "sucesso"
#     aqui não prova nada.
#   - qualquer outra falha                         -> VERMELHO. Em especial
#     ERR_MODULE_NOT_FOUND / "command not found": é exatamente o arquivo ou a
#     dependência que não chegou na imagem.
#
# Uso:
#   scripts/ci/carga-imagens-infra.sh                 # os dois serviços
#   scripts/ci/carga-imagens-infra.sh escalonamento
#   scripts/ci/carga-imagens-infra.sh backup
#
# Roda igual no CI e na máquina do dev — de propósito. Um teste que só existe
# no workflow é um teste que ninguém roda antes de abrir o PR.

set -Eeuo pipefail
IFS=$'\n\t'

# Git Bash (Windows): sem isto o MSYS reescreve `/app/scripts/...` para um
# caminho do Windows ANTES do docker ver o argumento, e o erro resultante
# parece vir de dentro do container. Exportar aqui em vez de exigir do operador.
export MSYS_NO_PATHCONV=1

# Roda sempre a partir da RAIZ do repo: o contexto de build é a raiz (é o que o
# Easypanel faz em produção) e os dois Dockerfiles têm COPY relativo a ela.
# Caminhos RELATIVOS daqui para frente, não absolutos: com MSYS_NO_PATHCONV
# ligado, um caminho absoluto do Git Bash (`/c/Users/...`) chega cru no
# docker.exe, que é um binário Windows e não o entende.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
readonly TAG_ESCALONAMENTO="iris-escalonamento-ci:local"
readonly TAG_BACKUP="iris-backup-ci:local"
readonly TAG_BILLING="iris-billing-ci:local"

log_info() { printf '[carga-imagens] %s\n' "$*"; }
log_ok() { printf '[carga-imagens] OK: %s\n' "$*"; }
log_error() { printf '[carga-imagens] ERRO: %s\n' "$*" >&2; }

FALHAS=0

# Padrões que, se aparecerem na saída, significam "não chegou na imagem" —
# independentemente de o processo ter morrido com a mensagem esperada depois.
readonly PADROES_PROIBIDOS=(
	'ERR_MODULE_NOT_FOUND'
	'Cannot find module'
	'Cannot find package'
	'command not found'
	'No such file or directory'
	'not found' # busybox/ash para binário ausente
)

# esperar_falha_com <rótulo> <trecho-esperado-na-saída> -- <comando docker...>
#
# Roda o comando, captura stdout+stderr juntos (a mensagem de guarda vai para
# stderr, mas o log do processo vai para stdout — queremos os dois no
# diagnóstico) e aplica as três asserções.
esperar_falha_com() {
	local rotulo="$1"
	local esperado="$2"
	shift 2
	[[ "${1:-}" == "--" ]] && shift

	local saida rc
	set +e
	saida="$("$@" 2>&1)"
	rc=$?
	set -e

	if [[ ${rc} -eq 0 ]]; then
		log_error "${rotulo}: saiu 0. Esperado FALHA na guarda de env — exit 0 aqui significa que a guarda de execução não rodou (defeito da #153) e o teste de carga não provou nada."
		printf '%s\n' "${saida}" | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
		return
	fi

	local padrao
	for padrao in "${PADROES_PROIBIDOS[@]}"; do
		if [[ "${saida}" == *"${padrao}"* ]]; then
			log_error "${rotulo}: saída contém \"${padrao}\" — arquivo ou dependência NÃO chegou na imagem. Conferir a lista de COPY / a linha de instalação no Dockerfile."
			printf '%s\n' "${saida}" | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			return
		fi
	done

	if [[ "${saida}" != *"${esperado}"* ]]; then
		log_error "${rotulo}: falhou (exit ${rc}), mas com erro DIFERENTE do esperado. Esperado conter: \"${esperado}\"."
		printf '%s\n' "${saida}" | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
		return
	fi

	log_ok "${rotulo} (exit ${rc}, guarda esperada)"
}

# esperar_sucesso <rótulo> -- <comando docker...>
# Para checagens em que exit 0 é o resultado correto (sintaxe, binário presente).
esperar_sucesso() {
	local rotulo="$1"
	shift
	[[ "${1:-}" == "--" ]] && shift

	local saida rc
	set +e
	saida="$("$@" 2>&1)"
	rc=$?
	set -e

	if [[ ${rc} -ne 0 ]]; then
		log_error "${rotulo}: exit ${rc} (esperado 0)."
		printf '%s\n' "${saida}" | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
		return
	fi
	log_ok "${rotulo}"
}

# --- escalonamento -----------------------------------------------------------
carga_escalonamento() {
	log_info "buildando ${TAG_ESCALONAMENTO}..."
	docker build -f infra/escalonamento/Dockerfile -t "${TAG_ESCALONAMENTO}" .

	# `--dry-run` de propósito: é o único modo que NÃO muta nada e NÃO grava
	# heartbeat. Sem ESCALONAMENTO_DATABASE_URL o script falha antes de abrir
	# conexão — e é exatamente essa falha que se exige aqui.
	esperar_falha_com \
		"escalonamento: carga por caminho ABSOLUTO" \
		"ESCALONAMENTO_DATABASE_URL não definida" \
		-- docker run --rm "${TAG_ESCALONAMENTO}" \
		node /app/scripts/escalonamento-risco.mjs --dry-run

	# Caminho RELATIVO é um caso separado, não redundante: é a forma documentada
	# em infra/docker-compose.yml, e foi a que a #153 quebrou (argv[1] relativo
	# não bate com import.meta.url sem pathToFileURL — o processo saía 0 sem
	# varrer nada). Se essa guarda regredir, esta asserção pega o exit 0.
	esperar_falha_com \
		"escalonamento: carga por caminho RELATIVO (forma do compose)" \
		"ESCALONAMENTO_DATABASE_URL não definida" \
		-- docker run --rm -w /app "${TAG_ESCALONAMENTO}" \
		node scripts/escalonamento-risco.mjs --dry-run

	# Carregar o script só prova que os imports de TOPO resolveram. `resend` entra
	# por `await import("resend")` DENTRO de um try/catch em scripts/lib/
	# resend-rt.mjs: numa imagem sem essa dependência o dry-run acima passa
	# VERDE, o motor sobe, escalona — e o e-mail ao RT falha em silêncio. Este
	# passo resolve TODO specifier encontrado nos arquivos copiados, dinâmico
	# incluído. O verificador entra por stdin de propósito: não vira arquivo
	# dentro de uma imagem de produção.
	esperar_sucesso \
		"escalonamento: todo import resolve na imagem (inclusive os dinâmicos)" \
		-- bash -c "docker run --rm -i -w /app -e ALVO=/app/scripts '${TAG_ESCALONAMENTO}' node --input-type=module < scripts/ci/verificar-deps-imagem.mjs"

	# O agendador é bash com `set -Eeuo pipefail` e `[[ ]]` — se o `apk add bash`
	# sair do Dockerfile, a imagem sobe e o laço morre na primeira execução.
	esperar_sucesso \
		"escalonamento: sintaxe do agendador.sh (bash presente)" \
		-- docker run --rm "${TAG_ESCALONAMENTO}" bash -n /app/agendador.sh
}

# --- backup ------------------------------------------------------------------
# Mesmo desenho, mesmo ponto cego: COPY arquivo por arquivo + dependências
# instaladas à mão (mc baixado por curl, age via apk, client do Postgres da
# imagem base). "Carregar" um script bash = rodá-lo até a guarda de env, que é
# onde ele para sem tocar em banco nem em bucket.
carga_backup() {
	log_info "buildando ${TAG_BACKUP}..."
	docker build -f infra/backup/Dockerfile -t "${TAG_BACKUP}" .

	# Binários instalados à mão. Um `command -v` só falha se o binário sumiu da
	# imagem — que é o defeito equivalente ao ERR_MODULE_NOT_FOUND do Node.
	local bin
	for bin in bash pg_dump pg_restore psql mc age find curl; do
		esperar_sucesso \
			"backup: binário '${bin}' presente" \
			-- docker run --rm "${TAG_BACKUP}" bash -c "command -v ${bin}"
	done

	# Sintaxe de todos os scripts copiados, inclusive o scheduler — que NÃO pode
	# ser executado aqui porque entra em laço infinito por desenho.
	local script
	for script in backup.sh restore.sh verify-restore.sh verify-offsite.sh scheduler.sh; do
		esperar_sucesso \
			"backup: sintaxe de ${script} (existe na imagem e é bash válido)" \
			-- docker run --rm "${TAG_BACKUP}" bash -n "/app/${script}"
	done

	# O scheduler invoca /app/backup.sh por caminho ABSOLUTO fixo; se o COPY
	# mudar de lugar, o laço quebra só em produção.
	esperar_sucesso \
		"backup: /app/backup.sh executável (caminho fixo do scheduler.sh)" \
		-- docker run --rm "${TAG_BACKUP}" test -x /app/backup.sh

	# O restore.sh recusa seguir sem este .sql (é onde mora a reaplicação de
	# expurgos, #89). Se o COPY esquecer dele, o furo só apareceria no dia do
	# desastre — e o sintoma seria um restore abortado, não um aviso.
	esperar_sucesso \
		"backup: /app/reaplicar-tombstones.sql presente (restore.sh aborta sem ele)" \
		-- docker run --rm "${TAG_BACKUP}" test -f /app/reaplicar-tombstones.sql

	# ... e presente não basta: o arquivo tem de ser ACEITO pelo psql. Os dois
	# únicos defeitos que este passo já teve moravam aqui, nenhum deles visível
	# em leitura nem no teste de integração (que executa só o bloco DO):
	#
	#   1. `\copy ... FROM :'ledger'` — o \copy NÃO interpola variável do psql;
	#      o `:'ledger'` chega literal e vira "No such file or directory".
	#   2. `\copy ... FROM STDIN` num script rodado com `-f` — lê as linhas
	#      SEGUINTES DO PRÓPRIO SCRIPT como dados (é como o pg_dump embute COPY),
	#      e a primeira linha do bloco DO virou "valor": `invalid input syntax
	#      for type uuid: "DO $reaplicar$"`. O keyword certo é PSTDIN.
	#
	# Um ledger só com cabeçalho (0 purgas) é suficiente e não precisa do schema
	# do Iris: o corpo do laço nunca executa, então nenhuma tabela da aplicação é
	# referenciada, e o que fica sob teste é exatamente a camada que quebrou —
	# temp table, \copy, bloco DO e COMMIT.
	local rede_pg="carga-tombstone-net" host_pg="carga-tombstone-pg"
	docker rm -f "${host_pg}" >/dev/null 2>&1 || true
	docker network rm "${rede_pg}" >/dev/null 2>&1 || true
	docker network create "${rede_pg}" >/dev/null
	docker run -d --name "${host_pg}" --network "${rede_pg}" \
		-e POSTGRES_PASSWORD=carga postgres:17-alpine >/dev/null

	local tentativa=0
	until docker exec "${host_pg}" pg_isready -U postgres >/dev/null 2>&1; do
		tentativa=$((tentativa + 1))
		if [[ "${tentativa}" -ge 30 ]]; then
			log_error "postgres de apoio não ficou pronto em 30s — checagem do reaplicar-tombstones.sql pulada"
			FALHAS=$((FALHAS + 1))
			break
		fi
		sleep 1
	done

	esperar_sucesso \
		"backup: reaplicar-tombstones.sql é aceito pelo psql (\\copy PSTDIN + bloco DO)" \
		-- docker run --rm --network "${rede_pg}" -e PGPASSWORD=carga "${TAG_BACKUP}" \
		bash -c "printf 'patient_id,clinic_id,ator_id,criado_em\n' | psql -v ON_ERROR_STOP=1 --no-psqlrc -h ${host_pg} -U postgres -d postgres -f /app/reaplicar-tombstones.sql"

	docker rm -f "${host_pg}" >/dev/null 2>&1 || true
	docker network rm "${rede_pg}" >/dev/null 2>&1 || true

	# Carga de verdade: cada script até a própria guarda de env obrigatória.
	# Nenhum deles toca banco ou bucket antes disso.
	esperar_falha_com \
		"backup: carga de backup.sh" \
		"PGHOST é obrigatório" \
		-- docker run --rm "${TAG_BACKUP}" ./backup.sh

	esperar_falha_com \
		"backup: carga de verify-restore.sh" \
		"PGHOST é obrigatório" \
		-- docker run --rm "${TAG_BACKUP}" ./verify-restore.sh

	# restore.sh exige exatamente um argumento ANTES da env; passar `latest`
	# leva a execução até a guarda de TARGET_DATABASE_URL sem restaurar nada.
	esperar_falha_com \
		"backup: carga de restore.sh" \
		"TARGET_DATABASE_URL é obrigatório" \
		-- docker run --rm "${TAG_BACKUP}" ./restore.sh latest

	esperar_falha_com \
		"backup: carga de verify-offsite.sh" \
		"OFFSITE_S3_ENDPOINT é obrigatório" \
		-- docker run --rm "${TAG_BACKUP}" ./verify-offsite.sh
}

# --- billing -----------------------------------------------------------------
# Ponto cego DIFERENTE do escalonamento e do backup: esta imagem não instala
# NADA de propósito (infra/billing/Dockerfile), então ERR_MODULE_NOT_FOUND por
# dependência ausente não é o risco de hoje. O risco aqui é COPY com caminho
# errado (o contexto de build é a RAIZ do repo, não infra/billing/), `apk add
# bash` sumindo, e a guarda de execução do .mjs não disparando na forma
# relativa — que foi exatamente o defeito da #153 no escalonamento: o processo
# saía 0 sem fazer nada, e "saiu 0" é indistinguível de "faturou".
carga_billing() {
	log_info "buildando ${TAG_BILLING}..."
	docker build -f infra/billing/Dockerfile -t "${TAG_BILLING}" .

	# Sem env, o script para na guarda ANTES de qualquer fetch — nenhuma rota de
	# produção é tocada por este teste. O texto esperado é o do próprio script
	# (scripts/fechamento-ciclo-billing.mjs), que NOMEIA as variáveis ausentes:
	# uma mensagem genérica aqui viraria caçada no painel.
	esperar_falha_com \
		"billing: carga por caminho ABSOLUTO" \
		"variável(is) de ambiente ausente(s): BILLING_JOB_URL, BILLING_JOB_TOKEN" \
		-- docker run --rm "${TAG_BILLING}" \
		node /app/scripts/fechamento-ciclo-billing.mjs --once

	# Forma RELATIVA: é a documentada em infra/docker-compose.yml e a que a #153
	# quebrou no gêmeo. Se a guarda `import.meta.url === process.argv[1]`
	# regredir, o processo sai 0 sem disparar nada — e esta asserção pega o
	# exit 0, porque `esperar_falha_com` trata exit 0 como falha do teste.
	esperar_falha_com \
		"billing: carga por caminho RELATIVO (forma do compose)" \
		"variável(is) de ambiente ausente(s): BILLING_JOB_URL, BILLING_JOB_TOKEN" \
		-- docker run --rm -w /app "${TAG_BILLING}" \
		node scripts/fechamento-ciclo-billing.mjs --once

	# Resolve TODO specifier dos arquivos copiados, dinâmico incluído. Hoje o
	# script importa só `node:url` — e é justamente por isso que este passo entra
	# agora: ele é o guarda-corpo do dia em que alguém acrescentar um import aqui
	# (o que só é seguro se a dependência chegar na imagem, e nesta imagem NADA
	# chega). O verificador entra por stdin para não virar arquivo na imagem.
	esperar_sucesso \
		"billing: todo import resolve na imagem (inclusive os dinâmicos)" \
		-- bash -c "docker run --rm -i -w /app -e ALVO=/app/scripts '${TAG_BILLING}' node --input-type=module < scripts/ci/verificar-deps-imagem.mjs"

	# O agendador usa `set -Eeuo pipefail` e `[[ ]]`: sem o `apk add bash` do
	# Dockerfile a imagem sobe e o laço morre na primeira linha.
	esperar_sucesso \
		"billing: sintaxe do agendador.sh (bash presente)" \
		-- docker run --rm "${TAG_BILLING}" bash -n /app/agendador.sh

	# O CMD do Dockerfile aponta /app/agendador.sh por caminho absoluto fixo. Se
	# o COPY mudar de lugar, o container só falha em produção.
	esperar_sucesso \
		"billing: /app/agendador.sh executável (caminho fixo do CMD)" \
		-- docker run --rm "${TAG_BILLING}" test -x /app/agendador.sh

	# O agendador valida env ANTES de entrar no laço e sai 1. Rodá-lo sem env
	# prova as duas coisas: que a guarda nomeia a variável, e que este teste não
	# trava — um agendador que entrasse no laço aqui penduraria o CI.
	esperar_falha_com \
		"billing: agendador para na guarda de env (não entra em laço)" \
		"variável(is) de ambiente ausente(s)" \
		-- docker run --rm "${TAG_BILLING}" /app/agendador.sh
}

# --- main --------------------------------------------------------------------
alvo="${1:-todos}"
case "${alvo}" in
escalonamento) carga_escalonamento ;;
backup) carga_backup ;;
billing) carga_billing ;;
todos)
	carga_escalonamento
	carga_backup
	carga_billing
	;;
*)
	log_error "alvo desconhecido: ${alvo} — use 'escalonamento', 'backup', 'billing' ou nenhum (todos)."
	exit 2
	;;
esac

if [[ ${FALHAS} -gt 0 ]]; then
	log_error "${FALHAS} asserção(ões) de carga falharam."
	exit 1
fi

log_info "todas as asserções de carga passaram."
