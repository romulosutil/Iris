# Imagem do detector de alarme automático de jobs de infra (Iris, #294).
#
# syntax=docker/dockerfile:1
FROM node:22-alpine

# bash: o agendador usa `set -Eeuo pipefail` e `[[ ]]`, que não são POSIX sh.
# mc: MinIO Client, para ler a data do dump off-site mais recente (mesma
# ferramenta de infra/backup/verify-offsite.sh).
RUN apk add --no-cache bash curl && \
    curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && \
    chmod +x /usr/local/bin/mc && \
    apk del curl

WORKDIR /app

# ARMADILHA COM INCIDENTE NO HISTÓRICO (#156/#157/#126): esta imagem NÃO enxerga
# o node_modules do app. Toda dependência importada por scripts/alarme-jobs.mjs
# e por scripts/lib/resend-alarme.mjs precisa estar NESTA linha — inclusive
# `resend`, que entra por `await import()` dentro de um try/catch e degradaria
# em silêncio como "falha de envio" se faltasse. Versões pinadas iguais às do
# pnpm-lock.yaml. `npm install` e não `pnpm install` pelo mesmo motivo do
# infra/retencao/Dockerfile: o lockfile do repo puxaria Next/React/Playwright.
RUN npm install --no-package-lock --no-audit --no-fund postgres@3.4.9 resend@6.18.1

# Caminhos relativos à RAIZ DO REPO: o Easypanel builda com o contexto na raiz.
# COPY do arquivo específico, não de `scripts/lib/` inteiro — o diretório tem
# `.ts` de seed que não têm nada que fazer nesta imagem.
COPY scripts/alarme-jobs.mjs ./scripts/alarme-jobs.mjs
COPY scripts/lib/resend-alarme.mjs ./scripts/lib/resend-alarme.mjs
# #536 — alarme-jobs.mjs importa `detalheDoErro` daqui.
COPY scripts/lib/heartbeat.mjs ./scripts/lib/heartbeat.mjs

# #560/F3b — o log estruturado dos jobs. Módulo Node PURO (só `node:crypto`):
# não é `pino`, não é `src/lib`, e por isso não muda a regra de dependência
# desta imagem. Precisa do COPY porque é um import RELATIVO novo — a classe de
# falha da #156 é exatamente esta: o import entra no script, não entra no
# Dockerfile, e o processo morre em ERR_MODULE_NOT_FOUND com CI verde.
COPY scripts/lib/log-estruturado.mjs ./scripts/lib/log-estruturado.mjs
COPY infra/alarme/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT: com ENTRYPOINT em exec-form, um `docker run ... node
# scripts/alarme-jobs.mjs` viraria argumento do agendador, que entraria no laço
# normal — e o operador leria o resultado de uma coisa achando que leu o de
# outra. Com CMD, o argumento SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
