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

derrubar_container_app() {
	docker rm -f "${NOME_CONTAINER_APP}" >/dev/null 2>&1 || true
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
	log_info "subindo ${NOME_CONTAINER_APP} na porta ${PORTA_CARGA_APP} (teto de ${TIMEOUT_BOOT_S}s)..."
	derrubar_container_app
	trap derrubar_container_app RETURN

	docker run -d --name "${NOME_CONTAINER_APP}" \
		-p "127.0.0.1:${PORTA_CARGA_APP}:3000" \
		-e NODE_ENV=production \
		-e DATABASE_URL="postgres://carga:carga@127.0.0.1:5432/carga" \
		-e AUTH_DATABASE_URL="postgres://carga:carga@127.0.0.1:5432/carga" \
		-e BETTER_AUTH_SECRET="ci-carga-better-auth-secret-nao-usar-em-producao" \
		-e CPF_HASH_SALT="ci-carga-salt-nao-usar-em-producao" \
		"${TAG_APP}" >/dev/null

	# `/termos` é `force-static`: foi prerenderizado no `pnpm build` DA IMAGEM e
	# é servido do cache, sem tocar no Postgres. Um 200 aqui isola o que se quer
	# medir — servidor de pé + assets do standalone no lugar — de qualquer
	# indisponibilidade de banco. É também a rota que depende da cadeia de
	# desexclusão de `docs/legal/` no `.dockerignore`.
	local status=""
	local inicio agora
	inicio=$(date +%s)
	while :; do
		status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORTA_CARGA_APP}/termos" || true)"
		if [[ -n "${status}" && "${status}" != "000" ]]; then
			break
		fi

		if ! docker inspect -f '{{.State.Running}}' "${NOME_CONTAINER_APP}" 2>/dev/null | grep -q true; then
			log_error "app: o container MORREU antes de responder — é o boot quebrado (o modo de falha do @swc/helpers). Log:"
			docker logs "${NOME_CONTAINER_APP}" 2>&1 | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			return
		fi

		agora=$(date +%s)
		if ((agora - inicio >= TIMEOUT_BOOT_S)); then
			log_error "app: sem resposta HTTP em ${TIMEOUT_BOOT_S}s. Log do container:"
			docker logs "${NOME_CONTAINER_APP}" 2>&1 | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			return
		fi
		sleep 1
	done

	if [[ "${status}" != "200" ]]; then
		log_error "app: /termos respondeu ${status} (esperado 200). É rota force-static, prerenderizada no build — status != 200 aponta para asset do standalone ausente ou para a cadeia de desexclusão de docs/legal/ no .dockerignore."
		docker logs "${NOME_CONTAINER_APP}" 2>&1 | sed 's/^/    | /'
		FALHAS=$((FALHAS + 1))
	else
		log_ok "app: boot + GET /termos = 200 em menos de ${TIMEOUT_BOOT_S}s"
	fi

	# O log do boot é lido À PARTE do status: o Next responde 200 em rota
	# estática mesmo com um require quebrado em outro ponto do processo, e é
	# justamente esse "verde por fora" que este bloco recusa.
	local log_boot padrao
	log_boot="$(docker logs "${NOME_CONTAINER_APP}" 2>&1 || true)"
	for padrao in "${PADROES_PROIBIDOS[@]}"; do
		if [[ "${log_boot}" == *"${padrao}"* ]]; then
			log_error "app: log do boot contém \"${padrao}\" — módulo faltando na imagem, mesmo com o servidor respondendo."
			printf '%s\n' "${log_boot}" | sed 's/^/    | /'
			FALHAS=$((FALHAS + 1))
			break
		fi
	done
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
