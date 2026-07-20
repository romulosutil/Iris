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
RUN pnpm build

# --- migrate: job de deploy, roda ANTES do app (gate de schema) ---------------
# Easypanel roda esta imagem como serviço/pre-deploy separado, com
# MIGRATION_DATABASE_URL (role dona/DDL) — NÃO o DATABASE_URL do app (RLS, sem
# DDL). Sai != 0 se falhar, bloqueando o deploy do app à frente do schema.
# Precisa de node_modules + scripts + db/migrations (o standalone não os tem).
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY scripts ./scripts
COPY db/migrations ./db/migrations
COPY src ./src
CMD ["node", "scripts/migrate.mjs"]

# --- runner: imagem final enxuta ---------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
