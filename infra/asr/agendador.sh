#!/usr/bin/env bash
# agendador.sh — consumidor gerenciado de fila para o pipeline de ASR e jobs.
# Substitui o laço antigo com sleep por worker nativo com concorrência controlada.

set -Eeuo pipefail

log() { printf '[queue-worker] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

log "Iniciando worker gerenciado PostgreSQL (pg-boss)..."

exec node --import=tsx/esm scripts/queue-worker.ts
