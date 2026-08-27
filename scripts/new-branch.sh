#!/usr/bin/env bash
# Cria branch nova sempre a partir de origin/main atualizado.
# Uso: pnpm branch nome-da-branch
set -euo pipefail

name="${1:-}"
if [ -z "$name" ]; then
  echo "Uso: pnpm branch <nome-da-branch>" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree sujo. Commit ou stash antes de criar branch." >&2
  exit 1
fi

git fetch origin main --quiet
git checkout -B "$name" origin/main
echo "Branch '$name' criada a partir de origin/main ($(git rev-parse --short origin/main))."
