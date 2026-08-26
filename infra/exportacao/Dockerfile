# Imagem do job de exportação integral do acervo (Iris, #374 ∪ #353, D62).
#
# Base node:22-alpine: o `package.json` do repo fixa `engines.node >= 22` e o
# script é Node puro (`.mjs`), sem TypeScript e sem build. Não há nada de
# Next.js aqui — este serviço não serve HTTP e não deve conseguir.
#
# syntax=docker/dockerfile:1
FROM node:22-alpine

# bash: o agendador usa `set -Eeuo pipefail` e `[[ ]]`, que não são POSIX sh.
# A alpine só traz `ash`. Mesma razão do infra/billing/Dockerfile.
RUN apk add --no-cache bash

WORKDIR /app

# SEM `npm install`: NENHUMA dependência, de propósito — mesma decisão de
# arquitetura do infra/billing/Dockerfile. O script usa só o `fetch` nativo do
# Node 22; quem coleta o acervo, monta o ZIP (via `fflate`, que só existe no
# app) e calcula os SHA-256 é a rota interna do Next, onde essa dependência
# COMPARTILHA o node_modules do app.
#
# Foi exatamente o contrário que derrubou o motor de escalonamento em produção
# (#156): a imagem lista COPY e deps à mão, um import novo não chegou nela e o
# processo morreu em ERR_MODULE_NOT_FOUND com test/typecheck/lint verdes. Uma
# imagem sem dependência nenhuma não tem essa classe de falha.

# Caminhos relativos à RAIZ DO REPO, não a este diretório: o Easypanel builda
# com o contexto na raiz, igual ao `infra/billing/Dockerfile`. Um
# `COPY agendador.sh` bare funcionaria no compose local e quebraria em produção
# com "not found" — o compose usa o mesmo contexto (raiz) justamente para o
# teste local pegar isso.
COPY scripts/exportacao-acervo.mjs ./scripts/exportacao-acervo.mjs
COPY infra/exportacao/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT: com ENTRYPOINT em exec-form, um
# `docker compose run exportacao node scripts/exportacao-acervo.mjs` passaria
# tudo como ARGUMENTO do agendador, que ignoraria e entraria no laço normal —
# e o operador leria o resultado de uma coisa achando que leu o de outra. Com
# CMD, o argumento SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
