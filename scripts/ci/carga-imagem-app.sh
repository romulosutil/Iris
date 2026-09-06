#!/usr/bin/env bash
#
# Teste de CARGA das duas imagens do DEPLOY DA APLICAÇÃO — `infra/Dockerfile`
# (Next.js standalone, serviço `iris-app`) e `infra/Dockerfile.migrate` (job
# `iris-migrate`, gate de schema). Fecha o D69.
#
# O buraco que isto fecha: `scripts/ci/carga-imagens-infra.sh` cobre 8 imagens
# de JOB (escalonamento, backup, billing, retenção, alarme, exportação,
# arquivamento, expurgo-audit-log) e nenhuma delas é a imagem do app. Os dois
# Dockerfiles daqui também não estão sob nenhum dos `paths` do
# `carga-imagens-infra.yml`, então até hoje mudar qualquer um dos dois
# disparava ZERO CI: a primeira execução era o deploy em produção.
#
# Já mordeu duas vezes, por caminhos diferentes:
#
#   - `@swc/helpers` 0.5.23 (next 16.3.1) passou a declarar a condição
#     `module-sync` no `exports`. O tracing do Next copia só `cjs/`, o Node
#     >= 22.10 procura `esm/` em runtime, e o diretório do pacote existe
#     meio-copiado — então o `docker build` sai VERDE e quem morre é o
#     `node server.js` no boot, já em produção.
#
#   - o `RUN pnpm build` da imagem depende de rede externa e de `patches/`
#     estar no contexto do build. Nada disso é alcançável por `pnpm test`,
#     `pnpm typecheck` ou `pnpm lint`, que rodam contra a ÁRVORE DO REPO, com
#     o `node_modules` completo e sem `.dockerignore` no caminho.
#
# O job `build` do `ci.yml` é vizinho, não substituto: ele prova só que a
# aplicação COMPILA SEM BANCO. Não prova COPY, não prova o trace do
# standalone, não prova o reparo do `@swc/helpers` na imagem FINAL, não prova
# que o `esbuild` do seed resolveu no musl, e não prova que o processo SOBE.
#
# Regra de leitura das asserções (mesma do carga-imagens-infra.sh):
#   - o que se exige do app é BOOT + resposta HTTP. Um `docker build` verde
#     não é evidência nenhuma: os dois incidentes acima tinham build verde.
#   - ERR_MODULE_NOT_FOUND / "Cannot find module" na saída -> VERMELHO, é
#     exatamente o arquivo ou a dependência que não chegou na imagem.
#   - no migrate, exit 0 SEM banco seria VERMELHO: significaria que a guarda
#     de env parou de rodar e o gate de schema virou no-op.
#
# Uso:
#   scripts/ci/carga-imagem-app.sh              # app + migrate
#   scripts/ci/carga-imagem-app.sh app
#   scripts/ci/carga-imagem-app.sh migrate
#
# Env opcional:
#   MIGRATION_DATABASE_URL_CARGA  se definida, o migrate é rodado DE VERDADE
#                                 contra esse Postgres (exit 0 esperado) além
#                                 do teste da guarda. É o que o CI faz, com o
#                                 serviço `postgres` do job.
#   PORTA_CARGA_APP               porta do host para o probe (default 3999).
#   TIMEOUT_BOOT_S                teto do probe de boot em segundos (default 15).
#   ARGS_BUILD_EXTRA              flags extras repassadas ao `docker buildx
#                                 build` (é assim que o CI liga o cache do
#                                 GitHub Actions sem que este script precise
#                                 saber que existe um GitHub Actions).
#   PULAR_BUILD                   se `1`, usa a imagem JÁ tagueada em vez de
#                                 construir. Existe para poder MUTAR a imagem
#                                 (quebrar o `@swc/helpers` de propósito) e
#                                 verificar que as asserções ficam vermelhas —
#                                 um probe de boot que nunca reprova não é
#                                 probe. Nunca usado no CI.

set -Eeuo pipefail

# Git Bash no Windows converte `/app` em `C:/Program Files/Git/app` nos
# argumentos passados ao docker. Mesma linha do carga-imagens-infra.sh.
export MSYS_NO_PATHCONV=1

readonly TAG_APP="iris-app-ci:local"
readonly TAG_MIGRATE="iris-migrate-ci:local"
readonly NOME_CONTAINER_APP="iris-app-carga-ci"

# Imagens DERIVADAS, com um /run/secrets/env de mentira assado dentro. Existem
# para exercitar o item 5 da #93 — segredo de runtime por ARQUIVO em vez da aba
# `Ambiente` do Easypanel — sem depender de bind mount: `-v <host>:<container>`
# não se comporta igual no runner Linux e no Docker Desktop do Windows (o mesmo
# motivo que levou o teste do migrate a usar `--add-host ...:host-gateway` em
# vez de `--network host`). Assar num layer descartável roda igual nos dois.
readonly TAG_APP_SEGREDO="iris-app-segredo-ci:local"
readonly TAG_MIGRATE_SEGREDO="iris-migrate-segredo-ci:local"
readonly NOME_CONTAINER_APP_SEGREDO="iris-app-carga-segredo-ci"
readonly CAMINHO_SEGREDO="/run/secrets/env"

PORTA_CARGA_APP="${PORTA_CARGA_APP:-3999}"
TIMEOUT_BOOT_S="${TIMEOUT_BOOT_S:-15}"

log_info() { printf '[carga-imagem-app] %s\n' "$*"; }
log_ok() { printf '[carga-imagem-app] OK: %s\n' "$*"; }
log_error() { printf '[carga-imagem-app] ERRO: %s\n' "$*" >&2; }

FALHAS=0

# Padrões que, se aparecerem na saída, significam "não chegou na imagem" —
# independentemente de o processo ter respondido depois.
readonly PADROES_PROIBIDOS=(
	'ERR_MODULE_NOT_FOUND'
	'Cannot find module'
	'Cannot find package'
	'MODULE_NOT_FOUND'
	'command not found'
)

# esperar_sucesso <rótulo> -- <comando...>
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

# esperar_falha_com <rótulo> <trecho-esperado-na-saída> -- <comando...>
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
		log_error "${rotulo}: saiu 0. Esperado FALHA na guarda de env — exit 0 aqui significa que a guarda parou de rodar e o gate de schema virou no-op."
		printf '%s\n' "${saida}" | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
		return
	fi

	local padrao
	for padrao in "${PADROES_PROIBIDOS[@]}"; do
		if [[ "${saida}" == *"${padrao}"* ]]; then
			log_error "${rotulo}: saída contém \"${padrao}\" — arquivo ou dependência NÃO chegou na imagem. Conferir a lista de COPY do Dockerfile."
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

# esperar_falha_sem <rótulo> <trecho-que-NÃO-pode-aparecer> -- <comando...>
#
# Espelho do `esperar_falha_com`: usado quando o que se prova é o
# DESAPARECIMENTO de um erro (a guarda de env do migrator, uma vez que a env
# passou a vir do arquivo montado). Continua exigindo falha — o comando roda
# contra um Postgres inexistente de propósito — mas por OUTRO motivo, e nunca
# por módulo ausente.
esperar_falha_sem() {
	local rotulo="$1"
	local proibido="$2"
	shift 2
	[[ "${1:-}" == "--" ]] && shift

	local saida rc
	set +e
	saida="$("$@" 2>&1)"
	rc=$?
	set -e

	if [[ ${rc} -eq 0 ]]; then
		log_error "${rotulo}: saiu 0. Sem banco alcançável, o migrator TEM de falhar — exit 0 aqui significa que ele não chegou a tentar conectar."
		printf '%s
' "${saida}" | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
		return
	fi

	local padrao
	for padrao in "${PADROES_PROIBIDOS[@]}"; do
		if [[ "${saida}" == *"${padrao}"* ]]; then
			log_error "${rotulo}: saída contém \"${padrao}\" — arquivo ou dependência NÃO chegou na imagem."
			printf '%s
' "${saida}" | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			return
		fi
	done

	if [[ "${saida}" == *"${proibido}"* ]]; then
		log_error "${rotulo}: a saída AINDA contém \"${proibido}\" — o CMD não está lendo ${CAMINHO_SEGREDO}. Conferir a flag --env-file-if-exists no Dockerfile."
		printf '%s
' "${saida}" | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
		return
	fi

	log_ok "${rotulo} (exit ${rc}, guarda de env já satisfeita pelo arquivo)"
}

# derivar_com_segredo <tag-base> <tag-derivada> <conteúdo> [usuário-final]
#
# Assa um CAMINHO_SEGREDO de mentira num layer descartável em cima da imagem
# recém-construída. <conteúdo> separa linhas com `\n` LITERAL (barra + n), não
# com quebra de verdade: o Dockerfile é montado como string e uma quebra viraria
# instrução nova. Quem expande é o `printf %b` de dentro do RUN.
#
# `chmod 644`: o stage `runner` roda como `nextjs` (não-root) e é essa a
# permissão que o infra/README.md manda usar no arquivo do host. Assar 600 aqui
# esconderia justamente o modo de falha que a documentação previne.
derivar_com_segredo() {
	local base="$1"
	local derivada="$2"
	local conteudo="$3"
	local usuario="${4:-}"

	# Resolvido AQUI, não dentro do heredoc: o delimitador é sem aspas, então
	# um `$(...)` lá dentro seria expandido pelo shell do HOST — funciona por
	# acidente e quebra no dia em que o caminho mudar.
	local dir_segredo
	dir_segredo="$(dirname "${CAMINHO_SEGREDO}")"

	local linha_usuario=""
	[[ -n "${usuario}" ]] && linha_usuario="USER ${usuario}"

	log_info "derivando ${derivada} a partir de ${base} (com ${CAMINHO_SEGREDO})..."
	docker build -q -t "${derivada}" - >/dev/null <<-DOCKERFILE
		FROM ${base}
		USER root
		RUN mkdir -p ${dir_segredo} && printf %b '${conteudo}' > ${CAMINHO_SEGREDO} && chmod 644 ${CAMINHO_SEGREDO}
		${linha_usuario}
	DOCKERFILE
}

derrubar_container_app() {
	docker rm -f "${NOME_CONTAINER_APP}" "${NOME_CONTAINER_APP_SEGREDO}" >/dev/null 2>&1 || true
}

# buildar <caminho-do-dockerfile> <tag>
#
# `buildx build --load`, e não `docker build`: só o driver `docker-container`
# do buildx aceita `--cache-to type=gha`, e `--load` é o que devolve a imagem
# ao daemon para os `docker run` das asserções. Sem `ARGS_BUILD_EXTRA` (uso
# local) o comportamento é o mesmo de um `docker build` comum.
buildar() {
	local arquivo="$1"
	local tag="$2"

	if [[ "${PULAR_BUILD:-}" == "1" ]]; then
		log_info "PULAR_BUILD=1 — usando a imagem ${tag} já presente no daemon."
		return
	fi

	# Split intencional: ARGS_BUILD_EXTRA é uma LISTA de flags, não um argumento.
	# shellcheck disable=SC2086
	docker buildx build --load ${ARGS_BUILD_EXTRA:-} -f "${arquivo}" -t "${tag}" .
}

# boot_e_probe <rótulo> <tag> <nome-container> <porta-do-host> -- <args do docker run>
#
# Extraído de `carga_app` para rodar contra DUAS imagens: a normal e a
# derivada com ${CAMINHO_SEGREDO} assado dentro (#93 item 5). Sem a extração, o
# segundo boot seria uma cópia do primeiro — e cópia é onde a asserção envelhece
# só de um lado.
boot_e_probe() {
	local rotulo="$1"
	local tag="$2"
	local nome="$3"
	local porta="$4"
	shift 4
	[[ "${1:-}" == "--" ]] && shift

	log_info "subindo ${nome} (${tag}) na porta ${porta} (teto de ${TIMEOUT_BOOT_S}s)..."
	docker rm -f "${nome}" >/dev/null 2>&1 || true

	# NÃO confiar no `set -e` aqui. `carga_app` instala um `trap ... RETURN` cujo
	# corpo termina em `|| true`, e um trap RETURN bem-sucedido SOBRESCREVE o $?
	# da saída abortada: o script inteiro sai 0 com o boot nunca tendo
	# acontecido. Medido — um `docker run` que morreu ao alocar a porta do host
	# não contou falha nenhuma e a carga passou "verde".
	local saida_run rc_run
	set +e
	saida_run="$(docker run -d --name "${nome}" -p "127.0.0.1:${porta}:3000" "$@" "${tag}" 2>&1)"
	rc_run=$?
	set -e
	if [[ ${rc_run} -ne 0 ]]; then
		log_error "${rotulo}: docker run falhou (exit ${rc_run}) — o container nem chegou a subir."
		printf '%s\n' "${saida_run}" | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
		return
	fi

	# `/termos` é `force-static`: foi prerenderizado no `pnpm build` DA IMAGEM e
	# é servido do cache, sem tocar no Postgres. Um 200 aqui isola o que se quer
	# medir — servidor de pé + assets do standalone no lugar — de qualquer
	# indisponibilidade de banco. É também a rota que depende da cadeia de
	# desexclusão de `docs/legal/` no `.dockerignore`.
	local status=""
	local inicio agora
	inicio=$(date +%s)
	while :; do
		status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${porta}/termos" || true)"
		if [[ -n "${status}" && "${status}" != "000" ]]; then
			break
		fi

		if ! docker inspect -f '{{.State.Running}}' "${nome}" 2>/dev/null | grep -q true; then
			log_error "${rotulo}: o container MORREU antes de responder — é o boot quebrado (o modo de falha do @swc/helpers). Log:"
			docker logs "${nome}" 2>&1 | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			return
		fi

		agora=$(date +%s)
		if ((agora - inicio >= TIMEOUT_BOOT_S)); then
			log_error "${rotulo}: sem resposta HTTP em ${TIMEOUT_BOOT_S}s. Log do container:"
			docker logs "${nome}" 2>&1 | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			return
		fi
		sleep 1
	done

	if [[ "${status}" != "200" ]]; then
		log_error "${rotulo}: /termos respondeu ${status} (esperado 200). É rota force-static, prerenderizada no build — status != 200 aponta para asset do standalone ausente ou para a cadeia de desexclusão de docs/legal/ no .dockerignore."
		docker logs "${nome}" 2>&1 | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
	else
		log_ok "${rotulo}: boot + GET /termos = 200 em menos de ${TIMEOUT_BOOT_S}s"
	fi

	# O log do boot é lido À PARTE do status: o Next responde 200 em rota
	# estática mesmo com um require quebrado em outro ponto do processo, e é
	# justamente esse "verde por fora" que este bloco recusa.
	local log_boot padrao
	log_boot="$(docker logs "${nome}" 2>&1 || true)"
	for padrao in "${PADROES_PROIBIDOS[@]}"; do
		if [[ "${log_boot}" == *"${padrao}"* ]]; then
			log_error "${rotulo}: log do boot contém \"${padrao}\" — módulo faltando na imagem, mesmo com o servidor respondendo."
			printf '%s\n' "${log_boot}" | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			break
		fi
	done
}

# --- app (infra/Dockerfile) ---------------------------------------------------
carga_app() {
	log_info "buildando ${TAG_APP} (infra/Dockerfile, contexto = raiz do repo)..."
	buildar infra/Dockerfile "${TAG_APP}"

	# --- asserções ESTÁTICAS sobre a imagem final -----------------------------
	#
	# O reparo do `@swc/helpers` já falha fechado DENTRO do stage `build`. O que
	# se prova aqui é diferente e é o que faltava: que o reparo SOBREVIVEU ao
	# `COPY --from=build /app/.next/standalone ./` do stage `runner`. Foi o
	# arquivo ausente na imagem FINAL que derrubou o boot em produção.
	esperar_sucesso \
		"app: esm/_interop_require_default.js presente na imagem FINAL (@swc/helpers)" \
		-- docker run --rm --entrypoint sh "${TAG_APP}" -c \
		'ls node_modules/.pnpm/next@*/node_modules/@swc/helpers/esm/_interop_require_default.js'

	# `scripts/seed-local.js` é gerado por `pnpm exec esbuild` dentro do stage
	# `build` (alpine/musl), onde o `npx esbuild@latest` já quebrou com o binário
	# nativo ausente ("esbuild: not found", exit 127). Se o bundle não for
	# gerado, o `COPY` do runner falha — mas se ele for gerado truncado, o build
	# passa e o seed morre no console do Easypanel. `node --check` custa
	# milissegundos e não executa nada do bundle.
	esperar_sucesso \
		"app: bundle do seed-local existe e é sintaticamente válido (esbuild no musl)" \
		-- docker run --rm --entrypoint node "${TAG_APP}" --check /app/scripts/seed-local.js

	# --- probe de BOOT --------------------------------------------------------
	#
	# É esta a asserção que os dois incidentes exigiam: subir o processo. As env
	# abaixo são valores de teste, nunca usados fora de CI/dev — o boot não abre
	# conexão com o banco, mas uma guarda lida no import (CPF_HASH_SALT não tem
	# fallback por design, ver src/lib/security/cpf-hash.ts) derrubaria o
	# processo por um motivo que não é o que estamos medindo.
	# --- probe de BOOT --------------------------------------------------------
	#
	# É esta a asserção que os dois incidentes exigiam: subir o processo. As env
	# abaixo são valores de teste, nunca usados fora de CI/dev.
	#
	# Este container NÃO tem ${CAMINHO_SEGREDO}: é o que prova a metade
	# `-if-exists` da flag — arquivo AUSENTE não pode derrubar o boot, que é a
	# situação do CI, do `infra/docker-compose.yml` e da máquina do dev.
	derrubar_container_app
	trap derrubar_container_app RETURN

	boot_e_probe "app" "${TAG_APP}" "${NOME_CONTAINER_APP}" "${PORTA_CARGA_APP}" -- \
		-e NODE_ENV=production \
		-e DATABASE_URL="postgres://carga:carga@127.0.0.1:5432/carga" \
		-e AUTH_DATABASE_URL="postgres://carga:carga@127.0.0.1:5432/carga" \
		-e BETTER_AUTH_SECRET="ci-carga-better-auth-secret-nao-usar-em-producao" \
		-e CPF_HASH_SALT="ci-carga-salt-nao-usar-em-producao"

	# --- segredo de runtime por ARQUIVO (#93, item 5) -------------------------
	#
	# Na VPS os segredos sensíveis não moram mais na aba `Ambiente` do Easypanel
	# (que os repassa como `--build-arg` e os imprime em texto plano no log de
	# build): moram em /etc/iris/production.env no host, montado em
	# ${CAMINHO_SEGREDO}. Três asserções, porque três coisas independentes podem
	# quebrar.

	# (1) a flag na imagem CONSTRUÍDA, não no Dockerfile do repo. O teste
	# estático de `scripts/segredo-por-arquivo.test.mjs` lê o arquivo do repo;
	# este lê o `Config.Cmd` da imagem que o deploy vai rodar.
	esperar_sucesso \
		"app: CMD da imagem CONSTRUÍDA carrega --env-file-if-exists=${CAMINHO_SEGREDO}" \
		-- bash -c "docker inspect -f '{{json .Config.Cmd}}' '${TAG_APP}' | grep -q -- '--env-file-if-exists=${CAMINHO_SEGREDO}'"

	derivar_com_segredo "${TAG_APP}" "${TAG_APP_SEGREDO}" \
		'SEGREDO_MONTADO_CARGA="valor-vindo-do-arquivo"\nCPF_HASH_SALT="ci-carga-salt-nao-usar-em-producao"\nDATABASE_URL="postgres://carga:carga@127.0.0.1:5432/carga"\nAUTH_DATABASE_URL="postgres://carga:carga@127.0.0.1:5432/carga"\nBETTER_AUTH_SECRET="ci-carga-better-auth-secret-nao-usar-em-producao"\n' nextjs

	# (2) o Node do runner é `node:22-slim` (glibc) — base DIFERENTE da do
	# migrate (`node:22-alpine`). Ler o arquivo aqui, já como `nextjs`, prova a
	# flag NESTA base e prova que um não-root enxerga o arquivo `chmod 644` que
	# o infra/README.md manda criar no host. Medido, não suposto.
	esperar_sucesso \
		"app: node:22-slim lê ${CAMINHO_SEGREDO} como usuário não-root" \
		-- docker run --rm --entrypoint node "${TAG_APP_SEGREDO}" \
		"--env-file-if-exists=${CAMINHO_SEGREDO}" -e \
		'if (process.env.SEGREDO_MONTADO_CARGA !== "valor-vindo-do-arquivo") { console.error("nao leu o arquivo montado:", process.env.SEGREDO_MONTADO_CARGA); process.exit(1) }'

	# (3) e o boot REAL, pelo CMD de verdade, com o arquivo presente: NENHUMA
	# env pelo `-e` além de NODE_ENV. Um parse que abortasse, ou um EACCES do
	# não-root, mata o processo aqui — que é exatamente como isso apareceria em
	# produção, onde o arquivo existe.
	# Derruba o primeiro container ANTES de subir o segundo, para reusar a MESMA
	# porta. A alternativa (`PORTA_CARGA_APP + 1`) inventa uma porta que ninguém
	# configurou: no Windows ela caiu numa faixa reservada pelo Hyper-V e o
	# `docker run` morreu em "failed programming external connectivity" — medido.
	# Porta configurável é contrato; porta+1 é chute.
	docker rm -f "${NOME_CONTAINER_APP}" >/dev/null 2>&1 || true

	boot_e_probe "app (segredo montado)" "${TAG_APP_SEGREDO}" "${NOME_CONTAINER_APP_SEGREDO}" "${PORTA_CARGA_APP}" -- \
		-e NODE_ENV=production
}

# --- migrate (infra/Dockerfile.migrate) --------------------------------------
carga_migrate() {
	log_info "buildando ${TAG_MIGRATE} (infra/Dockerfile.migrate)..."
	buildar infra/Dockerfile.migrate "${TAG_MIGRATE}"

	# Sem env, `scripts/migrate.mjs` morre na guarda ANTES de abrir conexão. É a
	# asserção de carga: o módulo inteiro (drizzle-orm, postgres,
	# verificar-hash-migracoes.mjs) precisou resolver para o programa chegar até
	# essa linha. Exit 0 aqui seria a guarda tendo virado no-op.
	esperar_falha_com \
		"migrate: carga do migrator (guarda de env, sem banco)" \
		"MIGRATION_DATABASE_URL (ou DATABASE_URL em dev) não definida" \
		-- docker run --rm "${TAG_MIGRATE}"

	# `db/migrations` é COPY separado do `scripts`: se ele sair do Dockerfile, o
	# teste da guarda acima continua verde (o programa morre antes de olhar a
	# pasta) e o deploy aplica ZERO migração sem reclamar.
	esperar_sucesso \
		"migrate: db/migrations chegou na imagem (COPY separado do scripts)" \
		-- docker run --rm --entrypoint sh "${TAG_MIGRATE}" -c \
		'ls db/migrations/meta/_journal.json >/dev/null && ls db/migrations/0001_*.sql >/dev/null'

	# Execução REAL contra um Postgres vazio, quando o chamador oferece um. É o
	# único passo que prova o gate de schema inteiro de dentro da imagem:
	# conexão, guard de hash (D17) e aplicação das migrações. O CI passa o
	# serviço `postgres` do job aqui; localmente é opcional.
	#
	# `--add-host ...:host-gateway` em vez de `--network host`: o Postgres mora no
	# HOST (serviço do job no CI, container com porta publicada no dev), e host
	# networking não se comporta igual no Docker Desktop e no runner Linux. O
	# gateway resolve nos dois, então a URL é a mesma nas duas máquinas.
	if [[ -n "${MIGRATION_DATABASE_URL_CARGA:-}" ]]; then
		esperar_sucesso \
			"migrate: aplica db/migrations DE VERDADE (Postgres do job)" \
			-- docker run --rm --add-host host.docker.internal:host-gateway \
			-e MIGRATION_DATABASE_URL="${MIGRATION_DATABASE_URL_CARGA}" \
			"${TAG_MIGRATE}"
	else
		log_info "MIGRATION_DATABASE_URL_CARGA não definida — pulando a execução real do migrator (só a carga foi exercitada)."
	fi

	# --- segredo de runtime por ARQUIVO (#93, item 5) -------------------------
	#
	# Aqui a prova é END-TO-END e não depende de inspecionar nada:
	# `MIGRATION_DATABASE_URL` NÃO é passada por `-e`, só existe dentro de
	# ${CAMINHO_SEGREDO}. Se o CMD perder a flag, o programa volta a morrer na
	# guarda de env — e é a AUSÊNCIA dessa mensagem que se exige aqui.
	#
	# A porta 1 é inalcançável de propósito: o migrator TEM de falhar, só que na
	# CONEXÃO, não na guarda. Não se casa o texto do erro de conexão (varia com a
	# versão do driver); casa-se o que a saída não pode mais conter.
	derivar_com_segredo "${TAG_MIGRATE}" "${TAG_MIGRATE_SEGREDO}" \
		'MIGRATION_DATABASE_URL="postgres://carga:carga@127.0.0.1:1/carga"\n'

	esperar_falha_sem \
		"migrate: CMD lê MIGRATION_DATABASE_URL de ${CAMINHO_SEGREDO} (a guarda de env não dispara mais)" \
		"MIGRATION_DATABASE_URL (ou DATABASE_URL em dev) não definida" \
		-- docker run --rm "${TAG_MIGRATE_SEGREDO}"
}

# --- main --------------------------------------------------------------------
alvo="${1:-todos}"
case "${alvo}" in
app) carga_app ;;
migrate) carga_migrate ;;
todos)
	carga_app
	carga_migrate
	;;
*)
	log_error "alvo desconhecido: ${alvo} — use 'app', 'migrate' ou nenhum (todos)."
	exit 2
	;;
esac

if [[ ${FALHAS} -gt 0 ]]; then
	log_error "${FALHAS} asserção(ões) de carga falharam."
	exit 1
fi

log_info "todas as asserções de carga passaram."
