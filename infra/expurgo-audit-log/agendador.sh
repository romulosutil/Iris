#!/usr/bin/env bash
# agendador.sh — laço do job de EXPURGO E RETENÇÃO DO AUDIT_LOG (#116/#536).
#
# POR QUE ISTO EXISTE: o Easypanel (v2.31.0) não tem cron para serviços de app.
# Não há campo "Schedule" e não existe tipo de serviço "Cron". Mesmas três
# alternativas do backup, do escalonamento, do arquivamento e da retenção,
# mesma escolha:
#
#   a) lógica de laço inline no campo "Comando" do painel  -> conhecimento
#      tribal fora do repo;
#   b) crontab no SO do VPS                                -> idem, e fora dos
#      logs do painel;
#   c) este script, versionado, com o painel só apontando  -> escolhido.
#
# O serviço roda com Comando = `/app/agendador.sh`. O container fica de pé
# dormindo e acorda a cada tick.
#
# Env:
#   INTERVALO_S           segundos entre varreduras. Default 86400 (1x/dia).
#   EXPURGO_DATABASE_URL  role de login que herda `iris_expurgo_audit_log`
#                         (migração 0145). OBRIGATÓRIA, sem fallback.
#
# POR QUE 86400s: a régua legal é de 180 DIAS (Marco Civil Art. 15). Varrer de
# minuto em minuto não apagaria uma linha a mais — só produziria 1440x mais
# chamadas que não mudam nada. Uma varredura por dia é a granularidade da regra,
# e é a cadência que `LIMITES_HEARTBEAT` em `scripts/alarme-jobs.mjs` assume
# para `expurgo-audit-log` (limite de 36h). Mudar aqui sem mudar lá cega o
# detector.
#
# POR QUE NÃO HÁ FALLBACK PARA `DATABASE_URL`: `app_role` NUNCA teve EXECUTE
# nas funções do expurgo — a 0070 revogou de PUBLIC e não concedeu a ninguém.
# Um fallback só trocaria "não roda" por "roda e estoura 42501 a cada tick",
# com o agravante de a falha parecer transitória. Fail-closed: sem a variável,
# o laço nem começa.
#
# POR QUE NÃO HÁ HEARTBEAT_DIR: diferente do escalonamento/retenção/
# arquivamento, este job não escreve sinal de vida em arquivo. Ele grava em
# `job_heartbeat` (migração 0146) pelo próprio script Node, e é essa linha que
# o detector `iris-alarme` lê. Não há volume a montar neste serviço.
#
# ESTE SERVIÇO APAGA TRILHA — mas só a que a allowlist da
# `app_expurgar_audit_log_expirado_por_acao()` (0145) autoriza: log de ACESSO
# com mais de 180 dias. Trilha clínica e de governança acompanha o prontuário e
# nunca é apagada por idade; ação fora das listas também não é (fail-closed no
# SQL, não aqui).

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-expurgo-audit-log] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-86400}"
readonly SCRIPT="/app/scripts/expurgo-audit-log.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

# Validado ANTES do laço, não dentro (mesma disciplina da retenção e do
# arquivamento): sem env o job falha em 100% dos ticks, e um laço que falha
# para sempre é ruído que esconde a falha real. Com tick de 24h seria pior
# ainda — a primeira evidência só apareceria no dia seguinte. Só o NOME da
# variável ausente aparece — nunca o valor, que é uma credencial de banco.
faltando=()
[[ -n "${EXPURGO_DATABASE_URL:-}" ]] || faltando+=("EXPURGO_DATABASE_URL")
if [[ ${#faltando[@]} -gt 0 ]]; then
	log "ERRO: variável(is) de ambiente ausente(s): ${faltando[*]}"
	log "ERRO: use a role de login que herda \`iris_expurgo_audit_log\` (0145) — NUNCA a DATABASE_URL do app."
	log "ERRO: ver §Job de Expurgo e Retenção do AuditLog em infra/README.md."
	exit 1
fi

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=job_heartbeat/expurgo-audit-log (banco)"

falhas_seguidas=0

while :; do
	# Uma falha NÃO derruba o laço: a primeira falha transitória (banco
	# reiniciando, deploy do Postgres, rede) desligaria o expurgo para SEMPRE, e
	# expurgo desligado é indistinguível, de dentro do produto, de "nenhum log
	# passou dos 180 dias" — o descumprimento do Marco Civil se acumula em
	# silêncio.
	#
	# Quem percebe a parada NÃO é este log: é o heartbeat em `job_heartbeat`,
	# gravado pelo próprio script Node só em varredura completa. Enquanto as
	# varreduras falham, `ultimo_ok` para de avançar e o detector `iris-alarme`
	# dispara (limite de 36h). Este log só explica o porquê depois.
	saida=0
	node "${SCRIPT}" || saida=$?

	if [[ "${saida}" -eq 0 ]]; then
		if [[ "${falhas_seguidas}" -gt 0 ]]; then
			log "recuperado após ${falhas_seguidas} falha(s) seguida(s)."
		fi
		falhas_seguidas=0
	else
		falhas_seguidas=$((falhas_seguidas + 1))
		log "ATENÇÃO: varredura FALHOU (exit ${saida}) — ${falhas_seguidas} falha(s) seguida(s)."
		log "ATENÇÃO: enquanto isso durar, NENHUM log de acesso vencido está sendo expurgado."
		log "ATENÇÃO: a retenção de 180 dias do Marco Civil Art. 15 deixa de ser cumprida,"
		log "ATENÇÃO: e os logs órfãos de contas deletadas deixam de ser pseudonimizados (LGPD)."
		log "ATENÇÃO: o heartbeat em job_heartbeat parou de avançar — o iris-alarme vai acusar."
		log "ATENÇÃO: o erro completo está nas linhas de stderr acima desta."
	fi

	sleep "${INTERVALO_S}"
done
