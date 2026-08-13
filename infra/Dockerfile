# Next.js standalone multi-stage para deploy no Easypanel (VPS).
# Build context = raiz do repositório; Dockerfile path = infra/Dockerfile.
# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- deps: instala com lockfile congelado -------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- build: gera o standalone -------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* é inline no bundle client em build time — Easypanel só injeta
# env var no runtime do container por padrão. Sem ARG+ENV aqui, `pnpm build`
# compila com estas vars undefined e os componentes client (GoogleAnalytics,
# Clarity, Sentry) nunca emitem o script, mesmo com a var setada no painel.
ARG NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID}
ARG NEXT_PUBLIC_CLARITY_PROJECT_ID
ENV NEXT_PUBLIC_CLARITY_PROJECT_ID=${NEXT_PUBLIC_CLARITY_PROJECT_ID}
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
RUN pnpm build
# pnpm exec (não npx): esbuild agora é devDependency pinada — npx baixava
# esbuild@latest do registry em build time e quebrou no musl (bin nativo em
# optionalDependency não instalado → "esbuild: not found", exit 127).
RUN pnpm exec esbuild scripts/seed-local.ts --bundle --platform=node --target=node22 --conditions=react-server --outfile=scripts/seed-local.js

# --- migrate: job de deploy, roda ANTES do app (gate de schema) ---------------
# Easypanel roda esta imagem como serviço/pre-deploy separado, com
# MIGRATION_DATABASE_URL (role dona/DDL) — NÃO o DATABASE_URL do app (RLS, sem
# DDL). Sai != 0 se falhar, bloqueando o deploy do app à frente do schema.
# Precisa de node_modules + scripts + db/migrations (o standalone não os tem).
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY db/migrations ./db/migrations
CMD ["node", "scripts/migrate.mjs"]

# --- runner: imagem final ------------------------------------------------------
# Base trocada de node:22-alpine (musl) p/ node:22-slim (glibc/Debian): o
# PlaywrightPdfRenderer (src/lib/report/playwright-renderer.ts) lança Chromium
# em runtime, e o Playwright não dá suporte oficial a musl/Alpine. Custo:
# +~300MB de imagem (aceito — ver task-8-brief.md, INFRA-GATE/sign-off Rômulo).
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Cache de browsers fora do node_modules, path idêntico em build e runtime
# (aqui os dois acontecem na mesma etapa, mas fixar o path evita depender de
# onde o Playwright resolveria o default e facilita mover a instalação depois).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN groupadd --system nodejs && useradd --system --gid nodejs --create-home nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/scripts/seed-local.js ./scripts/seed-local.js

# Garante playwright + o browser Chromium. Instala em /opt/playwright (fora
# de /app) porque o node_modules copiado do standalone é gerenciado pelo
# pnpm (layout .pnpm/symlinks) e o npm trava
# ("Cannot read properties of null (reading 'isDescendantOf')") ao instalar
# dentro dele. Em seguida SUBSTITUI o playwright/playwright-core que o
# tracing do Next já copiou para /app/node_modules — o tracing captura só os
# requires estáticos, não o browsers.json (asset lido em runtime), então o
# pacote traçado sozinho não basta; a cópia completa de /opt/playwright
# resolve primeiro por estar mais perto na cadeia de node_modules.
# --with-deps instala só as libs de sistema do Chromium (não baixa
# firefox/webkit), mantendo a imagem enxuta.
RUN mkdir -p /opt/playwright \
    && cd /opt/playwright \
    && npm init -y >/dev/null \
    && npm install --no-save playwright@1.61.1 \
    && npx playwright install --with-deps chromium \
    && rm -rf /app/node_modules/playwright /app/node_modules/playwright-core \
    && cp -r /opt/playwright/node_modules/playwright /app/node_modules/playwright \
    && cp -r /opt/playwright/node_modules/playwright-core /app/node_modules/playwright-core \
    && chown -R nextjs:nodejs /ms-playwright /app/node_modules/playwright /app/node_modules/playwright-core

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
