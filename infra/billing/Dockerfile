# Imagem do job de fechamento de ciclo de faturamento (Iris, #36).
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

# SEM `npm install`: NENHUMA dependência, de propósito. O script usa só o
# `fetch` nativo do Node 22 — não fala com o Postgres, não usa SDK de gateway e
# não calcula preço. Essa é a decisão de arquitetura inteira da #36: toda a
# lógica de billing mora na rota interna do Next, onde ela COMPARTILHA o
# node_modules do app.
#
# Foi exatamente o contrário que derrubou o motor de escalonamento em produção
# (#156): a imagem lista COPY e deps à mão, um import novo não chegou nela e o
# processo morreu em ERR_MODULE_NOT_FOUND com test/typecheck/lint verdes. Uma
# imagem sem dependência nenhuma não tem essa classe de falha — e é por isso que
# a regra "zero lógica de preço no .mjs" precisa continuar valendo: no dia em
# que este arquivo ganhar um `npm install`, a #156 pode se repetir aqui, só que
# gerando cobrança errada.

# Caminhos relativos à RAIZ DO REPO, não a este diretório: o Easypanel builda
# com o contexto na raiz, igual ao `infra/escalonamento/Dockerfile`. Um
# `COPY agendador.sh` bare funcionaria no compose local e quebraria em produção
# com "not found" — o compose usa o mesmo contexto (raiz) justamente para o
# teste local pegar isso.
COPY scripts/fechamento-ciclo-billing.mjs ./scripts/fechamento-ciclo-billing.mjs
COPY infra/billing/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT: com ENTRYPOINT em exec-form, um
# `docker compose run billing node scripts/fechamento-ciclo-billing.mjs --dry-run`
# passaria tudo como ARGUMENTO do agendador, que ignoraria e entraria no laço
# normal — e o operador leria o resultado de uma coisa achando que leu o de
# outra. Com CMD, o argumento SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
