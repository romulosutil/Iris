# Imagem do job de AVISO PRÉVIO de expurgo de prontuário expirado (Iris, #352).
#
# Base node:22-alpine: o `package.json` do repo fixa `engines.node >= 22` e o
# script é Node puro (`.mjs`), sem TypeScript e sem build. Não há nada de
# Next.js aqui — este serviço não serve HTTP e não deve conseguir.
#
# syntax=docker/dockerfile:1
FROM node:22-alpine

# bash: o agendador usa `set -Eeuo pipefail` e `[[ ]]`, que não são POSIX sh.
# A alpine só traz `ash`. Mesma razão do infra/arquivamento/Dockerfile.
RUN apk add --no-cache bash

WORKDIR /app

# DEPENDÊNCIAS: SÓ `postgres`, pinado na MESMA versão do pnpm-lock.yaml (3.4.9;
# o package.json declara ^3.4.7 e o lock resolve 3.4.9).
#
# NENHUM cliente HTTP entra aqui, e a ausência é uma PROIBIÇÃO ESTRUTURAL, não
# esquecimento: o aviso prévio dos 90 dias é IN-APP (linha em `audit_log` que a
# tela de retenção lê). O assunto deste job é a eliminação definitiva de um
# prontuário — o dado mais sensível que o produto guarda — e o Iris não fala com
# o mundo externo sobre paciente. Sem `resend`, sem `node-fetch` e sem `curl` na
# imagem, "só mandar um e-mailzinho avisando" para de ser um `npm install` de
# distância.
#
# ARMADILHA COM INCIDENTE NO HISTÓRICO (#156/#157): esta imagem NÃO enxerga o
# node_modules do app. Toda dependência que `scripts/retencao-aviso-previo.mjs`
# importar precisa estar NESTA linha, senão o job morre em produção com
# ERR_MODULE_NOT_FOUND na carga do módulo — enquanto test, lint e typecheck
# ficam verdes, porque eles rodam contra o node_modules da raiz. Hoje o script
# importa `node:fs/promises`, `node:path`, `node:url` (todos builtin) e
# `postgres`. Importou outra coisa? Adicione aqui na mesma mudança, e o
# `scripts/ci/carga-imagens-infra.sh retencao` prova que chegou.
#
# Por que `npm install` e não `pnpm install` como o resto do repo: `pnpm install`
# a partir do lockfile do repo instalaria o grafo inteiro — Next, React,
# Storybook, Playwright — numa imagem cuja única necessidade é um driver de
# Postgres. `--no-package-lock` porque não existe lockfile próprio deste
# diretório para manter; a reprodutibilidade vem da versão EXATA fixada aqui.
RUN npm install --no-package-lock --no-audit --no-fund postgres@3.4.9

# Caminhos relativos à RAIZ DO REPO, não a este diretório: o Easypanel builda
# com o contexto na raiz, igual ao `infra/arquivamento/Dockerfile` e ao
# `infra/Dockerfile` do app. Um `COPY agendador.sh` bare funcionaria no compose
# local e quebraria em produção com "not found".
#
# Não há `COPY scripts/lib/` porque o script não importa nada de lá. Se um dia
# importar, o COPY entra junto — foi exatamente essa lista incompleta que
# derrubou o motor de escalonamento em produção na #126.
COPY scripts/retencao-aviso-previo.mjs ./scripts/retencao-aviso-previo.mjs
COPY infra/retencao/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT, pela mesma lição do backup, do escalonamento e do
# arquivamento: com ENTRYPOINT em exec-form, um `docker compose run retencao
# node scripts/retencao-aviso-previo.mjs --dry-run` passaria tudo como ARGUMENTO
# do agendador, que ignoraria e entraria no laço normal — e o operador leria o
# resultado de uma coisa achando que leu o de outra. Com CMD, o argumento
# SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
