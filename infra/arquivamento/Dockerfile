# Imagem do job de auto-arquivamento comercial por inatividade (Iris, #174/D4).
#
# Base node:22-alpine: o `package.json` do repo fixa `engines.node >= 22` e o
# script é Node puro (`.mjs`), sem TypeScript e sem build. Não há nada de
# Next.js aqui — este serviço não serve HTTP e não deve conseguir.
#
# syntax=docker/dockerfile:1
FROM node:22-alpine

# bash: o agendador usa `set -Eeuo pipefail` e `[[ ]]`, que não são POSIX sh.
# A alpine só traz `ash`. Mesma razão do infra/escalonamento/Dockerfile.
RUN apk add --no-cache bash

WORKDIR /app

# DEPENDÊNCIAS: SÓ `postgres`, pinado na MESMA versão do pnpm-lock.yaml (3.4.9;
# o package.json declara ^3.4.7 e o lock resolve 3.4.9).
#
# `resend` NÃO entra aqui, e a ausência é deliberada, não esquecimento: este job
# não fala com o mundo externo. O aviso prévio dos 83 dias é IN-APP (linha em
# `audit_log`), porque arquivamento é ato administrativo sobre cobrança e o Iris
# não notifica ninguém fora do painel sobre paciente. Sem cliente de e-mail na
# imagem, "só mandar um e-mailzinho" para de ser um `npm install` de distância.
#
# ARMADILHA COM INCIDENTE NO HISTÓRICO (#156/#157): esta imagem NÃO enxerga o
# node_modules do app. Toda dependência que `scripts/auto-arquivamento.mjs`
# importar precisa estar NESTA linha, senão o job morre em produção com
# ERR_MODULE_NOT_FOUND na carga do módulo — enquanto test, lint e typecheck
# ficam verdes, porque eles rodam contra o node_modules da raiz. Hoje o script
# importa `node:fs/promises`, `node:path`, `node:url` (todos builtin) e
# `postgres`. Importou outra coisa? Adicione aqui na mesma mudança.
#
# Por que `npm install` e não `pnpm install` como o resto do repo: `pnpm install`
# a partir do lockfile do repo instalaria o grafo inteiro — Next, React,
# Storybook, Playwright — numa imagem cuja única necessidade é um driver de
# Postgres. `--no-package-lock` porque não existe lockfile próprio deste
# diretório para manter; a reprodutibilidade vem da versão EXATA fixada aqui.
RUN npm install --no-package-lock --no-audit --no-fund postgres@3.4.9

# Caminhos relativos à RAIZ DO REPO, não a este diretório: o Easypanel builda
# com o contexto na raiz, igual ao `infra/escalonamento/Dockerfile` e ao
# `infra/Dockerfile` do app. Um `COPY agendador.sh` bare funcionaria no compose
# local e quebraria em produção com "not found".
#
# COPY do ARQUIVO de `scripts/lib/`, não do diretório inteiro (ele tem `.ts` de
# seed que não têm nada que fazer aqui). `heartbeat.mjs` entrou na #536: o
# script importa dele, e uma lista de COPY incompleta foi exatamente o que
# derrubou o motor de escalonamento em produção na #126. A carga de imagem
# (`scripts/ci/carga-imagens-infra.sh`) é o que pega a falta dele.
COPY scripts/auto-arquivamento.mjs ./scripts/auto-arquivamento.mjs
COPY scripts/lib/heartbeat.mjs ./scripts/lib/heartbeat.mjs
COPY infra/arquivamento/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT, pela mesma lição do serviço de backup e do escalonamento:
# com ENTRYPOINT em exec-form, um `docker compose run arquivamento node
# scripts/auto-arquivamento.mjs --dry-run` passaria tudo como ARGUMENTO do
# agendador, que ignoraria e entraria no laço normal — e o operador leria o
# resultado de uma coisa achando que leu o de outra. Com CMD, o argumento
# SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
