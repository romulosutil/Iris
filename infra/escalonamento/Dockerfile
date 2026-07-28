# Imagem do motor de escalonamento de alerta de risco clínico (Iris, #122/H1).
#
# Base node:22-alpine: o `package.json` do repo fixa `engines.node >= 22` e o
# script é Node puro (`.mjs`), sem TypeScript e sem build. Não há nada de
# Next.js aqui — este serviço não serve HTTP e não deve conseguir.
#
# syntax=docker/dockerfile:1
FROM node:22-alpine

# bash: o agendador usa `set -Eeuo pipefail` e `[[ ]]`, que não são POSIX sh.
# A alpine só traz `ash`. Mesma razão do infra/backup/Dockerfile.
RUN apk add --no-cache bash

WORKDIR /app

# DEPENDÊNCIA: só `postgres`, pinada na MESMA versão do pnpm-lock.yaml (3.4.9).
#
# Por que `npm install` e não `pnpm install` como o resto do repo, apesar do
# `packageManager: pnpm@11.11.0`: `pnpm install` a partir do lockfile do repo
# instalaria o grafo inteiro — Next, React, Storybook, Playwright — numa imagem
# cuja única necessidade é um driver de Postgres. Seriam centenas de MB e uma
# superfície de atualização de segurança inteira, para um processo que roda
# uma chamada de função SQL por minuto. `--no-package-lock` porque não existe
# lockfile próprio deste diretório para manter; a garantia de reprodutibilidade
# vem da versão EXATA fixada aqui.
#
# Se algum dia o `postgres` subir de versão no pnpm-lock.yaml, esta linha
# precisa subir junto — é o preço explícito de não compartilhar o lockfile.
RUN npm install --no-package-lock --no-audit --no-fund postgres@3.4.9

# Caminhos relativos à RAIZ DO REPO, não a este diretório: o Easypanel builda
# com o contexto na raiz, igual ao `infra/backup/Dockerfile` e ao
# `infra/Dockerfile` do app. Um `COPY agendador.sh` bare funcionaria no compose
# local e quebraria em produção com "not found" — o compose usa o mesmo
# contexto (raiz) justamente para o teste local pegar isso.
COPY scripts/escalonamento-risco.mjs ./scripts/escalonamento-risco.mjs
COPY infra/escalonamento/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT, pela mesma lição do serviço de backup: com ENTRYPOINT em
# exec-form, um `docker compose run escalonamento node scripts/escalonamento-
# risco.mjs --dry-run` passaria tudo como ARGUMENTO do agendador, que ignoraria
# e entraria no laço normal — e o operador leria o resultado de uma coisa
# achando que leu o de outra. Com CMD, o argumento SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
