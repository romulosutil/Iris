# Imagem do serviço de backup do Postgres (Iris).
#
# Base postgres:17-alpine: client (pg_dump/pg_restore/psql) na MESMA major
# version do servidor (PG 17 no Easypanel) — pg_dump/pg_restore precisam ser
# >= a versão do servidor. Não roda `postgres` (servidor) aqui, só o client;
# a imagem fica enxuta e sem superfície de ataque de um Postgres ocioso.
#
# syntax=docker/dockerfile:1
FROM postgres:17-alpine

# bash: os scripts usam `set -Eeuo pipefail` e recursos de bash (arrays,
# process substitution) — não são POSIX sh puro.
# curl + ca-certificates: baixar o binário do mc (MinIO client) via HTTPS.
# findutils: `find` completo (o busybox find da alpine não tem -printf/-mtime
# em todas as variações; findutils garante o `find -mtime` usado em backup.sh).
RUN apk add --no-cache bash curl ca-certificates findutils

# MinIO Client (mc) — binário estático oficial. Não existe pacote apk; segue
# a distribuição oficial da MinIO. TARGETARCH é setado automaticamente pelo
# BuildKit (amd64 no VPS Hostinger; arm64 cobre Mac Apple Silicon em dev).
ARG TARGETARCH
RUN curl -fsSL -o /usr/local/bin/mc \
	"https://dl.min.io/client/mc/release/linux-${TARGETARCH}/mc" \
	&& chmod +x /usr/local/bin/mc \
	&& mc --version

WORKDIR /app

# Caminhos relativos à RAIZ DO REPO, não a este diretório: o Easypanel builda
# com o contexto na raiz (`docker buildx build -f .../infra/backup/Dockerfile
# .../code/`), igual ao `infra/Dockerfile` do app. Um `COPY backup.sh` bare
# funciona no compose local (se o contexto for ./backup) e QUEBRA em produção
# com "not found" — foi o que aconteceu no primeiro deploy. O compose agora usa
# o mesmo contexto (raiz) justamente para o teste local pegar isso.
COPY infra/backup/backup.sh infra/backup/restore.sh infra/backup/verify-restore.sh infra/backup/scheduler.sh ./
RUN chmod +x backup.sh restore.sh verify-restore.sh scheduler.sh

# Comando default = dump agendado (o caso de uso do serviço rodando via
# schedule do Easypanel). restore.sh e verify-restore.sh rodam sob demanda.
#
# CMD, não ENTRYPOINT, de propósito: com ENTRYPOINT em exec-form, um
# `docker compose run backup ./verify-restore.sh` passaria o script como
# ARGUMENTO do backup.sh — que o ignoraria e rodaria mais um backup, saindo 0.
# O operador leria "exit 0" e marcaria o teste de restore como feito sem que
# ele jamais tivesse rodado. Com CMD, o argumento SUBSTITUI o comando.
CMD ["/app/backup.sh"]
