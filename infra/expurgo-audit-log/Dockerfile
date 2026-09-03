# Imagem do job de EXPURGO E RETENÇÃO DO AUDIT_LOG (Iris, #116/#536).
#
# POR QUE ELA NASCEU AGORA, e não junto com a 0145/0146: em 03/09/2026 a
# medição de produção mostrou que o serviço `iris-expurgo-audit-log` NUNCA
# existiu no Easypanel — o detector `iris-alarme` acusou "nenhum heartbeat
# registrado para expurgo-audit-log", e a enumeração dos serviços do projeto
# `espectro-mvp` confirmou a ausência. O script (`scripts/expurgo-audit-log.mjs`)
# e a role (`iris_expurgo_audit_log`, migração 0145) já existiam; faltava a
# imagem. Sem ela, a obrigação legal de retenção de 180 dias de log de acesso
# (Marco Civil Art. 15) nunca foi cumprida em produção.
#
# Base node:22-alpine: o `package.json` do repo fixa `engines.node >= 22` e o
# script é Node puro (`.mjs`), sem TypeScript e sem build. Não há nada de
# Next.js aqui — este serviço não serve HTTP e não deve conseguir.
#
# syntax=docker/dockerfile:1
FROM node:22-alpine

# bash: o agendador usa `set -Eeuo pipefail` e `[[ ]]`, que não são POSIX sh.
# A alpine só traz `ash`. Mesma razão do infra/retencao/Dockerfile.
RUN apk add --no-cache bash

WORKDIR /app

# DEPENDÊNCIAS: SÓ `postgres`, pinado na MESMA versão do pnpm-lock.yaml (3.4.9;
# o package.json declara ^3.4.7 e o lock resolve 3.4.9).
#
# NENHUM cliente HTTP entra aqui, e a ausência é uma PROIBIÇÃO ESTRUTURAL, não
# esquecimento: este job APAGA trilha de auditoria. O único canal de saída dele
# é o heartbeat no próprio banco (números, nunca id/ator/detalhe) e o log do
# container. Sem `resend`, sem `node-fetch` e sem `curl` na imagem, "só mandar
# um resumo do que foi apagado por e-mail" para de ser um `npm install` de
# distância — e um resumo desses cruzaria clínicas.
#
# ARMADILHA COM INCIDENTE NO HISTÓRICO (#126/#156/#157): esta imagem NÃO
# enxerga o node_modules do app nem a árvore do repo. Toda dependência e todo
# arquivo que `scripts/expurgo-audit-log.mjs` importar precisa estar NESTE
# Dockerfile, senão o job morre em produção com ERR_MODULE_NOT_FOUND na carga
# do módulo — enquanto test, lint e typecheck ficam verdes, porque rodam contra
# o node_modules da raiz. Import de topo não cai em try/catch: não há
# degradação graciosa possível.
#
# Hoje o script importa `postgres`, `node:url` (builtin) e
# `./lib/heartbeat.mjs` — que por sua vez não importa nada. Importou outra
# coisa? Adicione aqui na MESMA mudança, e o
# `scripts/ci/carga-imagens-infra.sh expurgo-audit-log` prova que chegou.
#
# Por que `npm install` e não `pnpm install` como o resto do repo: `pnpm install`
# a partir do lockfile do repo instalaria o grafo inteiro — Next, React,
# Storybook, Playwright — numa imagem cuja única necessidade é um driver de
# Postgres. `--no-package-lock` porque não existe lockfile próprio deste
# diretório para manter; a reprodutibilidade vem da versão EXATA fixada aqui.
RUN npm install --no-package-lock --no-audit --no-fund postgres@3.4.9

# Caminhos relativos à RAIZ DO REPO, não a este diretório: o Easypanel builda
# com o contexto na raiz, igual ao `infra/retencao/Dockerfile` e ao
# `infra/Dockerfile` do app. Um `COPY agendador.sh` bare funcionaria no compose
# local e quebraria em produção com "not found".
#
# COPY do ARQUIVO de `scripts/lib/`, não do diretório inteiro (ele tem `.ts` de
# seed que não têm nada que fazer aqui).
COPY scripts/expurgo-audit-log.mjs ./scripts/expurgo-audit-log.mjs
COPY scripts/lib/heartbeat.mjs ./scripts/lib/heartbeat.mjs
COPY infra/expurgo-audit-log/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT, pela mesma lição do backup, do escalonamento, do
# arquivamento e da retenção: com ENTRYPOINT em exec-form, um
# `docker run ... node scripts/expurgo-audit-log.mjs` passaria tudo como
# ARGUMENTO do agendador, que ignoraria e entraria no laço normal — e o
# operador leria o resultado de uma coisa achando que leu o de outra. Com CMD,
# o argumento SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
