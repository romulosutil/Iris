#!/usr/bin/env bash
# aplicar-cotas.sh — aplica as cotas de CPU/memória do §Cotas de CPU e memória
# (infra/README.md) diretamente nos serviços Swarm da VPS. Roda NO HOST, por SSH.
#
# POR QUE ESTE SCRIPT EXISTE, E NÃO "clicar Implantar no painel":
# a aba `Recursos` do Easypanel tem um botão `Salvar` que **grava a configuração
# e não toca no container em execução** — o próprio painel avisa ("Certifique-se
# de clicar em 'Implantar' assim que estiver pronto para enviar as alterações").
# Isso foi MEDIDO em 06/09/2026: depois de salvar `iris-alarme` no painel, o
# Console do container mostrava `memory.max=max` e `cpu.max=max 100000`, ou seja
# cota nenhuma. Ver a nota na §Provisionamento.
#
# A outra saída seria `Implantar`, mas ele **reconstrói a imagem a partir do HEAD
# de `main`** — um deploy de código para aplicar um número de memória. Este
# script faz só o que precisa ser feito: `docker service update` ajusta o
# recurso da task in-place, sem build, sem tocar em código.
#
# O `Salvar` no painel continua sendo necessário, e é COMPLEMENTAR a este script:
# ele é o que faz a cota sobreviver ao próximo deploy. Este script é o que a
# torna efetiva AGORA. Fazer os dois é o estado consistente.
#
# ⚠️ A regra do `Salvar` NÃO é a mesma para todo serviço — medido em 06/09/2026:
#   • tipo APP (13 dos 14, construídos do git): `Salvar` só grava. Precisam deste
#     script (ou de `Implantar`). Medido em `iris-asr`: `memory.max=max`.
#   • tipo POSTGRES (`iris-postgres`): não tem etapa de build, e o `Salvar` JÁ
#     aplica — o banco reiniciou sozinho ao ser salvo. Medido: 6442450944 bytes e
#     `cpu.max=200000 100000`, sem este script ter rodado.
# Por isso o laço abaixo PULA quem já está na cota certa: sem isso, rodar o
# script derrubaria o banco por alguns segundos para reaplicar o que já vale.
#
# ⚠️ `docker service update` REINICIA a task do serviço. É esperado (é assim que
# o cgroup novo passa a valer). O `iris-postgres` vem por último de propósito.
#
# Uso:
#   ./aplicar-cotas.sh --conferir   # só lista o estado atual, não muda nada
#   ./aplicar-cotas.sh              # aplica e depois confere
#   ./aplicar-cotas.sh --reverter   # remove as cotas (volta a "ilimitado")

set -Eeuo pipefail
IFS=$'\n\t'

readonly PREFIXO="espectro-mvp"

# serviço|limite-memória|limite-cpu|reserva-memória  ("0" = não definir reserva)
# Mesma ordem e mesmos números da tabela do infra/README.md. Divergir daqui faz o
# painel e o host discordarem, que é o defeito que este arquivo existe para evitar.
readonly COTAS=(
	"iris-alarme|256M|0.25|0"
	"iris-billing|256M|0.25|0"
	"iris-escalonamento|256M|0.25|0"
	"iris-exportacao|256M|0.25|0"
	"iris-arquivamento|256M|0.25|0"
	"iris-retencao|256M|0.25|0"
	"iris-expurgo-audit-log|256M|0.25|0"
	"asr-agendador|256M|0.25|0"
	"asr-sweeper|256M|0.25|0"
	"iris-backup|1G|0.5|0"
	"iris-minio|1536M|0.5|512M"
	"iris-asr|3G|1|512M"
	"iris-app|4G|1.5|1G"
	# Por último: reiniciar o banco derruba tudo que depende dele por alguns segundos.
	"iris-postgres|6G|2|2G"
)

log() { printf '[cotas] %s\n' "$*"; }

# "256M"/"1G" -> bytes. Só para comparar com o que o Swarm já tem: sem isso o
# script reaplicaria cota idêntica e REINICIARIA o serviço à toa — e um deles é
# o Postgres.
em_bytes() {
	case "$1" in
	*M) echo $((${1%M} * 1024 * 1024)) ;;
	*G) echo $((${1%G} * 1024 * 1024 * 1024)) ;;
	*) echo "$1" ;;
	esac
}

# "0.25" -> 250000000. `awk` porque bash não faz aritmética de ponto flutuante.
em_nanocpu() { awk -v c="$1" 'BEGIN{printf "%d", c*1000000000}'; }

# Estado REAL da task no Swarm — é isto que decide, não o que o painel mostra.
conferir() {
	log "estado atual (Limits do serviço no Swarm):"
	local linha servico svc
	for linha in "${COTAS[@]}"; do
		servico="${linha%%|*}"
		svc="${PREFIXO}_${servico}"
		if ! docker service inspect "$svc" >/dev/null 2>&1; then
			printf '  %-32s NÃO EXISTE\n' "$servico"
			continue
		fi
		printf '  %-32s %s\n' "$servico" "$(docker service inspect "$svc" \
			--format '{{with .Spec.TaskTemplate.Resources.Limits}}mem={{.MemoryBytes}} nanocpu={{.NanoCPUs}}{{else}}SEM COTA{{end}}')"
	done
}

aplicar() {
	local linha servico mem cpu resmem svc atual
	local -a args
	for linha in "${COTAS[@]}"; do
		IFS='|' read -r servico mem cpu resmem <<<"$linha"
		svc="${PREFIXO}_${servico}"

		if ! docker service inspect "$svc" >/dev/null 2>&1; then
			log "PULADO — serviço não existe no Swarm: ${svc}"
			continue
		fi

		# IDEMPOTÊNCIA — não é luxo. Serviço do tipo POSTGRES no Easypanel não tem
		# etapa de build, e nele o `Salvar` do painel JÁ aplica a cota (medido em
		# 06/09/2026: `iris-postgres` estava com `memory.max=6442450944` e
		# `cpu.max=200000 100000` sem ninguém ter rodado este script). Reaplicar
		# valor idêntico faria `docker service update` recriar a task e derrubar o
		# banco por alguns segundos — sem mudar nada.
		atual="$(docker service inspect "$svc" \
			--format '{{with .Spec.TaskTemplate.Resources.Limits}}{{.MemoryBytes}} {{.NanoCPUs}}{{else}}0 0{{end}}')"
		if [[ "$atual" == "$(em_bytes "$mem") $(em_nanocpu "$cpu")" ]]; then
			log "JÁ NA COTA, pulando (não reinicia): ${servico}"
			continue
		fi

		args=(--limit-memory "$mem" --limit-cpu "$cpu")
		if [[ "$resmem" != "0" ]]; then
			args+=(--reserve-memory "$resmem")
		fi
		# Reserva de CPU NUNCA entra: no Swarm ela é critério de agendamento, e
		# reservas somando acima dos 4 vCPU do host deixam serviço sem subir.

		log "aplicando ${servico}: mem=${mem} cpu=${cpu} reserva-mem=${resmem}"
		# `|| true` NÃO: se um update falhar, é para parar e o operador ver qual.
		docker service update "${args[@]}" "$svc" >/dev/null
	done
}

reverter() {
	local linha servico svc
	for linha in "${COTAS[@]}"; do
		servico="${linha%%|*}"
		svc="${PREFIXO}_${servico}"
		docker service inspect "$svc" >/dev/null 2>&1 || continue
		log "revertendo ${servico} para ilimitado"
		docker service update --limit-memory 0 --limit-cpu 0 --reserve-memory 0 "$svc" >/dev/null
	done
}

case "${1:-}" in
"--conferir")
	conferir
	;;
"--reverter")
	reverter
	echo
	conferir
	;;
"")
	aplicar
	echo
	conferir
	echo
	log "pronto. 'mem=0 nanocpu=0' ou 'SEM COTA' em alguma linha = aquele serviço NÃO recebeu a cota."
	;;
*)
	echo "uso: $0 [--conferir|--reverter]" >&2
	exit 2
	;;
esac
