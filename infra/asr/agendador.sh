#!/usr/bin/env bash
# agendador.sh — consumidor da fila de jobs (Iris, #72 / D73).
#
# O QUE MUDOU EM RELAÇÃO AO LAÇO ANTIGO: não há mais `while :; do ... sleep 20`.
# Este script agora só sobe UM processo Node que fica de pé consumindo a fila
# `pgboss` no Postgres, com concorrência 1 imposta do lado do banco. O laço de
# shell resolvia o agendamento e NÃO resolvia a sobreposição de ticks (#494/T19,
# comentário longo na versão anterior deste arquivo): o cliente abortava em
# 120 s, a rota seguia processando por ~215 s, e o próximo tick disparava contra
# um tick vivo. Com a fila, o segundo tick simplesmente não sai de `created`
# enquanto o primeiro estiver `active`.
#
# O QUE CONTINUA IGUAL: o processamento de verdade NÃO mora aqui. O consumidor
# só faz POST em `ASR_JOB_URL` (rota interna do Next, T07) — reserva do lote,
# download do bucket efêmero, chamada ao serviço `iris-asr` e conclusão/falha
# moram INTEIRAMENTE em `src/app/api/internal/jobs/asr-transcrever/route.ts`.
# Mesmo desenho, mesma razão do #156: a imagem deste job não herda o
# `node_modules` do app.
#
# O QUE RODA: `/app/scripts/queue-worker.mjs`, o BUNDLE gerado por esbuild no
# estágio de build da imagem (ver Dockerfile.agendador). NÃO é TypeScript e não
# usa `tsx` — `tsx` é `devDependency` e não existe no artefato de produção.
#
# CADÊNCIA: quem agenda o tick periódico é o cron do próprio pg-boss
# (`CRON_TICK_ASR`, 1 min, em `src/lib/queue/config.ts`), não uma env deste
# script. Não existe mais `INTERVALO_S`. O caminho de baixa latência é outro: o
# app enfileira o tick DENTRO da transação que promove os clipes a `na_fila`,
# então o ditado não espera o cron.
#
# Env:
#   DATABASE_URL          conexão da fila (papel `app_role`). NUNCA logada.
#   ASR_JOB_URL           rota interna do Next que reserva e processa o lote.
#   ASR_JOB_TOKEN         segredo do disparo. NUNCA logado por este script.
#   ASR_HEARTBEAT_DIR     default /heartbeat. Só o lockfile mora aqui — o sinal
#                         de vida lido pelo alarme é `job_heartbeat` no banco
#                         (#536), escrito pela ROTA a cada tick.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[queue-worker] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly HEARTBEAT_DIR="${ASR_HEARTBEAT_DIR:-/heartbeat}"
readonly WORKER="/app/scripts/queue-worker.mjs"

if [[ ! -f "${WORKER}" ]]; then
	log "ERRO: ${WORKER} não encontrado na imagem — o estágio de bundle do Dockerfile não rodou. Não subir assim."
	exit 1
fi

# Validado ANTES de subir o processo, não depois (mesma disciplina dos demais
# agendadores deste repo): sem env o consumidor reprova 100% dos jobs até a DLQ,
# e uma fila que só produz falha é indistinguível de uma fila parada. Só o NOME
# da variável ausente aparece — nunca o valor, que é credencial.
#
# O runner valida de novo, do lado do Node (`startQueueWorkers`). Redundância de
# propósito: esta camada dá a mensagem legível no painel, aquela garante o
# fail-closed mesmo se alguém trocar este script pelo binário direto.
faltando=()
[[ -n "${DATABASE_URL:-}" ]] || faltando+=("DATABASE_URL")
[[ -n "${ASR_JOB_URL:-}" ]] || faltando+=("ASR_JOB_URL")
[[ -n "${ASR_JOB_TOKEN:-}" ]] || faltando+=("ASR_JOB_TOKEN")
if [[ ${#faltando[@]} -gt 0 ]]; then
	# `IFS` deste script e' quebra-de-linha + tab, entao `${faltando[*]}` juntaria
	# por quebra de linha e o painel mostraria uma variavel por linha, como se
	# fossem erros distintos. Virgula explicita, num subshell para nao vazar o IFS.
	faltando_txt="$(IFS=","; printf '%s' "${faltando[*]}")"
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando_txt//,/, }"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

# ─── Guarda de instância única ───────────────────────────────────────────────
#
# AINDA NECESSÁRIA COM A FILA, e por um motivo mais direto que antes: a
# concorrência 1 de `asr-transcrever` é `localConcurrency` — teto POR PROCESSO.
# Dois runners no mesmo container são dois consumidores, e a fila entregaria um
# job a cada um: 2 ticks simultâneos contra o serviço `iris-asr`, exatamente a
# carga dobrada que este guard existe para impedir.
#
# `mkdir` e não `flock`: `mkdir` é atômico em qualquer filesystem e é builtin do
# coreutils/busybox que a imagem já tem garantidamente. `flock` é applet
# opcional do busybox nesta alpine — depender dele seria a mesma classe de bug
# das memórias `imagem-escalonamento-nao-herda-app` e `carga-nao-cobre-import-
# dinamico`: falta silenciosa numa imagem que sobe verde.
#
# Lock ENVELHECIDO é recuperado, não respeitado: um container morto por OOM
# deixa o diretório para trás, e um guard que respeita lock de dono morto
# desligaria a transcrição para sempre — exatamente o modo de falha que este
# serviço existe para evitar. Por isso o PID é gravado e conferido.
#
# ⚠️ PID SOZINHO NÃO PROVA IDENTIDADE ENTRE BOOTS DO CONTAINER (bug de
# produção, `asr-agendador`, 2026-09-03): dentro de um container o processo
# deste script É o pid 1. Se o HEARTBEAT_DIR sobrevive a um restart (mesmo
# caminho a cada boot) e a trap de EXIT não rodou no boot anterior (SIGKILL,
# OOM), o lock deixado para trás tem `pid=1` — e o NOVO processo, TAMBÉM pid 1
# no boot atual, faz `kill -0 1` contra SI MESMO. Isso nunca falha, então o
# ramo de "lock órfão" nunca é alcançado e o container entra em crash loop
# achando pra sempre que há um segundo agendador vivo, quando não há nenhum.
# Por isso a checagem abaixo primeiro descarta o caso em que o pid gravado é
# o NOSSO PRÓPRIO pid: isso só pode significar "lock de um boot anterior",
# nunca "outro processo vivo agora" — um segundo runner de verdade (ex.:
# `docker exec` manual) sempre nasce com um pid DIFERENTE do nosso, porque o
# nosso já está ocupado.
readonly LOCK_DIR="${HEARTBEAT_DIR}/.agendador-asr.lock"

if ! mkdir -- "${LOCK_DIR}" 2>/dev/null; then
	dono="$(cat -- "${LOCK_DIR}/pid" 2>/dev/null || true)"
	if [[ -n "${dono}" && "${dono}" != "$$" ]] && kill -0 "${dono}" 2>/dev/null; then
		log "ERRO: já existe um consumidor de fila vivo neste container (pid ${dono}). Não subindo um segundo — dois consumidores dobrariam a carga sobre o serviço iris-asr sem aparecer em lugar nenhum."
		exit 1
	fi
	log "ATENÇÃO: lock órfão em ${LOCK_DIR} (dono='${dono:-desconhecido}' não está vivo, ou é o nosso próprio pid $$ sobrevivendo a um restart) — provável container morto no meio de um tick, ou pid 1 reaproveitado entre boots. Retomando."
	rm -rf -- "${LOCK_DIR}"
	mkdir -- "${LOCK_DIR}"
fi
printf '%s\n' "$$" >"${LOCK_DIR}/pid"

# `INT TERM` explícitos além de `EXIT`: bash NÃO roda o trap de EXIT quando o
# processo morre por sinal não capturado, e `docker stop` manda SIGTERM. Sem
# eles todo restart do serviço deixaria lock órfão e todo boot pagaria o caminho
# de recuperação acima.
trap 'rm -rf -- "${LOCK_DIR}"' EXIT
trap 'rm -rf -- "${LOCK_DIR}"; exit 143' INT TERM

log "iniciando consumidor da fila. lock=${LOCK_DIR}"

# `exec` NÃO é usado aqui: ele substituiria o shell e as traps acima morreriam
# junto, deixando o lock para trás em todo `docker stop`. O `wait` propaga o
# sinal para o filho e ainda deixa a trap rodar.
node "${WORKER}" &
readonly WORKER_PID=$!
trap 'kill -TERM "${WORKER_PID}" 2>/dev/null || true; wait "${WORKER_PID}" 2>/dev/null || true; rm -rf -- "${LOCK_DIR}"; exit 143' INT TERM

wait "${WORKER_PID}"
