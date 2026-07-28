# Infra — Iris (VPS Hostinger + Easypanel)

Stack self-hosted decidida em `docs/arquitetura/plano-bootstrap-e-stack-vps.md`:
Postgres puro + Better-Auth (in-app) + MinIO, num VPS Hostinger São Paulo (LGPD)
rodando Easypanel (Docker Swarm).

## Dev local

Sobe Postgres + MinIO com paridade de produção; o app roda fora do compose.

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres:5433, MinIO:9000/9001
cp .env.example .env                               # e preencher DATABASE_URL etc.
pnpm dev
```

`DATABASE_URL=postgres://iris:iris@localhost:5433/iris` (ver compose para MinIO).

Teste de integração da réplica off-site cifrada (sobe o ambiente, roda o
`backup.sh` real, decifra o artefato e derruba tudo no final):

```bash
./infra/backup/test-offsite.sh
```

## Deploy no Easypanel (provisionamento — via única do Rômulo)

1. **VPS Hostinger** KVM 4 (16 GB), **região São Paulo** (bloqueador LGPD —
   confirmar no checkout). Ubuntu 22.04+.
2. **Easypanel**: `curl -sSL https://get.easypanel.io | sh`; abrir `https://<IP>:3000`.
3. **Serviços** (templates Easypanel): **Postgres** e **MinIO**. Guardar
   credenciais.
4. **Domínio**: `irisclinica.ia.br` (A record → IP). Let's Encrypt automático.
5. **App**: novo serviço App → Code Source `romulosutil/Iris` → Builder
   **Dockerfile** com path `infra/Dockerfile` e build context na raiz →
   branch `main`, autodeploy on push.
6. **Env vars do App**: `DATABASE_URL`, `BETTER_AUTH_SECRET`
   (`openssl rand -base64 32`), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`.
   `ANTHROPIC_API_KEY` só na Fase 3.
7. **Segurança do SO** (responsabilidade nossa): SSH só por chave, firewall
   (80/443/SSH), `unattended-upgrades`. Backup + restore testado: ver
   [§Backup e restore (LGPD)](#backup-e-restore-lgpd) — **item LGPD, bloqueia
   dado real**.

### CRÍTICO — o log de build do Easypanel contém TODOS os segredos em texto plano

O Easypanel repassa **toda** env var do serviço como `--build-arg` para o
`docker build`. Confirmado no log de deploy do `iris-backup` (auditoria da #93).
Consequência: o log de build guardado no painel expõe, em texto plano,
`DATABASE_URL`, `AUTH_DATABASE_URL` (com senha das roles),
`BETTER_AUTH_SECRET`, `GLITCHTIP_WEBHOOK_SECRET` e `GITHUB_TOKEN`.

**Nunca cole log de deploy em issue, PR, Discord ou chat de IA.** Ele não tem
aparência de segredo — parece saída de build inócua — e é exatamente por isso
que vaza. Se precisar compartilhar, recorte só a linha do erro.

Mitigação que já existe: nenhum Dockerfile declara `ARG` para essas variáveis,
então elas **não viram camada da imagem** nem aparecem em `docker history`. O
vazamento é só no log.

**Decisão (25/07/2026, #93) — risco aceito.** O Easypanel v2.31 **não** oferece
como evitar isso: a tela `Ambiente` do serviço é um único campo de texto livre
`CHAVE=valor`, sem toggle de secret, sem separação build-time/runtime, sem seção
"Secrets" apartada, e sem nem mascarar o valor na tela. Verificado no painel, não
deduzido da documentação. Restariam duas saídas — segredo por arquivo em volume
(existe um toggle `Create env file` de semântica não testada) ou aceitar. Aceito,
com base neste modelo de ameaça:

- repositório privado, um único mantenedor;
- acesso ao painel restrito ao mesmo mantenedor;
- log de deploy não sai do painel — não vai para issue, PR, Discord, fórum.

**Gatilhos que invalidam a aceitação e obrigam a reabrir a discussão:**

1. qualquer segunda pessoa com acesso ao painel ou ao repositório (piloto com
   clínica, contratação, agência);
2. qualquer log de deploy compartilhado com terceiro — **inclusive colado em chat
   de IA**, que é o caminho mais fácil de esquecer que conta;
3. o repositório deixar de ser privado.

**Ação combinada ao disparar um gatilho:** revisar **todas** as variáveis de
ambiente de **todos** os serviços do projeto — rotacionar cada segredo, reavaliar
se ainda precisa existir como env var, e reabrir a decisão de segredo-por-arquivo.
Não é revisar só a variável relacionada ao evento: se o log vazou, vazou inteiro.

Enquanto isso valer, o controle real é **rotação**: qualquer segredo que saia do
painel é considerado comprometido e trocado pela tabela abaixo. Não é defesa em
profundidade, é contenção — e depende de disciplina, não de plataforma.

Se um segredo passou por log compartilhado, trate como comprometido e rotacione:

| Segredo | Como rotacionar | Efeito colateral |
| --- | --- | --- |
| `GLITCHTIP_WEBHOOK_SECRET` | `openssl rand -hex 24` | trocar nos **dois** lados (env do app + URL do webhook no GlitchTip), senão o relay passa a 401 |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | **invalida toda sessão ativa** — todo mundo reloga |
| `GITHUB_TOKEN` | novo PAT fine-grained (ver abaixo) | validar o relay ANTES de revogar o antigo |
| senha das roles Postgres | `ALTER ROLE ... PASSWORD` | atualizar `DATABASE_URL`, `AUTH_DATABASE_URL` e `MIGRATION_DATABASE_URL` |

`GITHUB_TOKEN` é **PAT fine-grained**, escopado só a `romulosutil/Iris` com
`Issues: read+write` — e nada mais. PAT classic (`ghp_`) com scope `repo` dá
leitura e escrita em **todos** os repositórios da conta; não use. Para validar
uma troca de token sem quebrar a automação, dispare o relay manualmente
(`POST /api/hooks/glitchtip?token=<GLITCHTIP_WEBHOOK_SECRET>` com o payload do
GlitchTip), confirme que a issue abriu, e só então revogue o token velho.

## Banco — role de runtime (CRÍTICO para o RLS)

O RLS **só se aplica a roles não-superuser e não-donos da tabela**. Um superuser
(o usuário default do Postgres do Easypanel) **bypassa o RLS silenciosamente**.

- **Migrations** rodam como o dono/superuser (via `MIGRATION_DATABASE_URL`).
  A migração cria `app_role` como role de **privilégio, NOLOGIN** (alvo das
  policies + grants).
- **O app** deve conectar via `DATABASE_URL` com um **usuário de login dedicado,
  membro de `app_role`, NÃO superuser**. Criar uma vez, por ambiente:

  ```sql
  CREATE ROLE iris_app LOGIN PASSWORD '<senha forte>' IN ROLE app_role;
  ```

  Depois `DATABASE_URL=postgres://iris_app:<senha>@<host>:5432/iris`. Conferir
  que ele NÃO tem `SUPERUSER`/`BYPASSRLS` (`\du iris_app`), senão o isolamento
  multi-tenant não vale.

## Roles de banco (Fase 1b)

Além de `iris_app` (acima), a Fase 1b introduz a role de privilégio `iris_auth`
(criada pela migração `0002`, NOBYPASSRLS) para isolar o acesso do Better-Auth
e do bootstrap de identidade das tabelas de dado de paciente. Depois de aplicar
a migração `0002`, criar **uma vez** por ambiente, como superuser, o usuário de
login membro dela:

```sql
-- Cria o usuário de LOGIN membro de iris_auth (senha por ambiente, nunca versionada).
CREATE ROLE iris_auth_login LOGIN PASSWORD :'authpwd' IN ROLE iris_auth;
-- O usuário de app_role (app_login) já existe desde a Fase 1a; mesma receita.
```

Em dev local (docker-compose) o superuser é `iris`; rodar o SQL acima com
`psql` apontando pro container. Em produção (Easypanel `iris-postgres`), idem
via console SQL do serviço.

## Migrations e seed

```bash
pnpm db:generate   # gera SQL a partir de src/db/schema.ts (offline)
pnpm db:migrate    # aplica em db/migrations (usa MIGRATION_DATABASE_URL)
pnpm test:rls      # prova o isolamento contra o Postgres (5 casos por papel)
pnpm seed:clinic   # dados clínicos base (papéis, protocolos)
pnpm seed:demo     # dados de demonstração para navegar as telas
```

`seed:demo` popula dado sintético para o smoke de navegação por papel.

## Gotchas de dev local

- **Porta do Postgres:** o compose mapeia o host em **5433** (evita conflito com
  outros Postgres locais) → `DATABASE_URL=...@localhost:5433/iris`. Usar 5432 no
  host não conecta.
- **`BYPASS_MFA_FOR_DEV=true`:** destrava navegar como papel clínico (coordenador/
  terapeuta/recepção) sem enrollment de MFA em dev. Só em dev — em produção o boot
  falha de propósito (fail-closed). Ver `.env.example` e `src/auth/mfa-gate.ts`.
- **Drizzle desync (`db:migrate` falha):** se o tracking do drizzle ficar atrás do
  schema, `pnpm db:migrate` aborta. Workaround: aplicar o SQL da migração à mão via
  `psql` apontando pro container (`psql postgres://iris:iris@localhost:5433/iris -f
db/migrations/<arquivo>.sql`) e seguir.

## Gate de schema no deploy (autodeploy on push ligado)

O app faz **autodeploy on push** (§Deploy passo 5), mas migração é gate humano.
Sem uma barreira, um push que assume schema novo sobe o app à frente do banco e
quebra em prod — foi o que aconteceu com a Agenda 2.0 (`bloqueio` / `clinic.
passo_grade_min` inexistentes). A barreira é o stage **`migrate`** do Dockerfile:

- `stage migrate` = job de deploy que roda `node scripts/migrate.mjs` com
  `MIGRATION_DATABASE_URL` (role dona, DDL) e **sai != 0 se falhar**.
- **Ordem no Easypanel:** rodar o serviço `migrate` (build target `migrate`) e
  esperar sucesso **ANTES** de promover o app. Se migrate falhar, abortar o
  deploy do app — o app velho continua no ar contra o schema velho (consistente),
  em vez do app novo contra schema velho (quebrado).
- O migrate usa a role dona (`MIGRATION_DATABASE_URL`), nunca a `DATABASE_URL`
  do app (app_role não tem DDL) — mesma separação de role do `pnpm db:migrate`.

`MIGRATION_DATABASE_URL` entra como env var do serviço `migrate` (não do app).

## Backup e restore (LGPD)

Iris guarda **dado clínico de menor de idade**. A LGPD (art. 46) exige medida de
segurança que cubra perda e alteração acidental — na prática, backup **com
restore comprovado**. Backup que nunca foi restaurado não conta como plano de
recuperação. Este é o item "`pg_dump` agendado + restore testado" da **Etapa 5
da issue #75**, e ele **bloqueia o piloto com dado real**.

Scripts em `infra/backup/`: `backup.sh` (dump + globals + verificação + cópia
MinIO + prune), `restore.sh` (aplica os globals e restaura um dump num alvo),
`verify-restore.sh` (restaura o dump mais recente num banco descartável, no
mesmo cluster, e valida).

### CRÍTICO — o backup são DOIS arquivos, não um (`.dump` + `.globals.sql`)

`pg_dump` dumpa **um banco**. As roles `app_role` e `iris_auth` — as mesmas que
todo `CREATE POLICY ... TO` e todo `GRANT` referenciam — são objetos de
**cluster**, e **nunca entram no dump**. Restaurando num cluster Postgres novo
(o cenário real de desastre), o `pg_restore` recria as tabelas e depois **falha
todos os GRANTs/policies com `role does not exist` — emitindo só warning, exit
0**. O resultado medido, num PG17 vazio, antes da correção:

| | só `.dump` (errado) | `.globals.sql` + `.dump` (hoje) |
| --- | --- | --- |
| Tabelas | 37 | 37 |
| **Policies de RLS** | **0** | **85** |
| Tabelas com `relrowsecurity` | 0 | 33 |
| Roles `app_role`/`iris_auth` | 0 | 2 |

Ou seja: banco com dado clínico de menor e **zero isolamento multi-tenant**, sem
nenhum erro fatal visível. É por isso que `backup.sh` gera **dois artefatos por
ciclo, com o mesmo timestamp**:

- `iris-<ts>.dump` — `pg_dump -Fc` (o banco);
- `iris-<ts>.globals.sql` — `pg_dumpall --globals-only --no-role-passwords`
  (roles e grants de cluster).

Os dois são um **par indivisível**: `backup.sh` valida os dois **antes** de
qualquer rename (se um falhar, nenhum vira "o backup do dia"), sobe os dois pro
MinIO, e prune os dois pela mesma retenção.

**`--no-role-passwords` é deliberado:** hash de senha é credencial e o arquivo
vai pro MinIO. A consequência operacional é real e está nos dois runbooks
abaixo: **depois de restaurar num cluster novo, o operador precisa re-setar as
senhas das roles de login** (`ALTER ROLE ... PASSWORD '...'`), com os valores do
provisionamento. Policies e GRANTs **não** dependem de senha — só o login
depende.

### CRÍTICO — o dump roda com a role dona (`iris`), nunca com `iris_app`

`iris_app` é **NOBYPASSRLS** (§Banco — role de runtime). O `pg_dump` faz `SELECT`
nas tabelas como o usuário conectado: rodando como `iris_app`, **a RLS filtra as
linhas e o dump sai incompleto — sem erro, sem aviso, exit 0**. Você só descobre
no dia do restore, com o banco de prod já perdido.

- `PGUSER` do serviço de backup = a **role dona** (`iris`, a mesma de
  `MIGRATION_DATABASE_URL`).
- Nunca reaproveitar a `DATABASE_URL` do app aqui.
- O `verify-restore.sh` compara **contagem de linhas por tabela** com a origem
  justamente para pegar esse erro; um dump feito com `iris_app` falha o verify.

### Onde o backup fica — três destinos, dois domínios de falha

| # | Destino | Onde roda | Cifrado? | Cobre |
| --- | --- | --- | --- | --- |
| 1 | Volume `/backups` | **no VPS** | não | corrupção lógica, `DROP` acidental, erro humano |
| 2 | MinIO `iris-backups` | **no VPS** | não | perda do volume do Postgres |
| 3 | Bucket off-site | **fora do VPS** | **sim (age)** | **perda total do host** |

Os destinos 1 e 2 são um **único domínio de falha**: os dois morrem junto com o
VPS. O destino 3 (issue #86) existe só para o cenário que eles não cobrem —
host destruído, conta do provedor suspensa, ransomware no host.

> **Se o destino 3 não estiver configurado** (`OFFSITE_S3_ENDPOINT` vazio), o
> `backup.sh` pula o passo e loga isso. Esse é o default do dev local e era o
> estado de produção antes da #86. Em produção com dado real, **off-site vazio
> é risco aceito e precisa estar registrado como tal** — não é configuração
> neutra.

#### Por que o off-site é cifrado no cliente

O bucket off-site é conta de **terceiro**, fora do seu controle. O dump vai
cifrado com `age` usando uma chave **pública**; o VPS carrega só a pública e
**não consegue decifrar o que ele mesmo enviou**. Duas consequências, ambas
desejadas:

- o provedor off-site nunca vê dado clínico legível;
- quem tomar o VPS não consegue ler a réplica.

E uma consequência que **custa**: não dá para testar o restore do off-site
automaticamente no VPS. Esse drill é manual, com a chave privada, e está no
runbook «DR a partir do off-site» abaixo.

> **A chave privada não fica no VPS e não fica no repo.** Perder a chave
> privada = perder a réplica off-site. As cópias 1 e 2 continuam em claro e
> restauráveis, então não é perda total — mas é a perda exatamente da cópia que
> existe para o pior dia. Guardar em gerenciador de senhas **e** em papel.

#### Por que a credencial off-site não apaga nada

A credencial do destino 3 é dedicada e **só escreve** (sem `DeleteObject`, sem
`CreateBucket`). Backup que o host comprometido consegue apagar não é backup.

Por isso **o `backup.sh` não poda o off-site**. A retenção lá é uma **regra de
lifecycle do bucket**, do lado do provedor. Prune disparado pelo host confiaria
no relógio e nas permissões do host — exatamente o que se assume perdido no
cenário que o off-site cobre.

> ⚠️ Se o bucket off-site crescer sem limite, **a regra de lifecycle não foi
> criada**. O `backup.sh` loga `prune off-site: NÃO executado pelo script (por
> design)` toda execução justamente para esse esquecimento não ficar silencioso.

#### Cadência do off-site — quanto se perde no pior dia

`OFFSITE_INTERVAL_DAYS` controla **só** a réplica off-site. O dump local e a
cópia no MinIO rodam **todo dia** de qualquer forma: são baratos e ficam no
mesmo disco.

| Valor | Perda máxima no desastre de host | Volume no bucket (ret. 30d) |
| --- | --- | --- |
| `1` (default) | até 1 dia | ~30 pares |
| `7` | **até 7 dias** | ~4 pares |

Traduzindo "7 dias" para o que o usuário sente: uma terapeuta que escreveu 40
evoluções naquela semana **perde as 40**. Ela não reconstrói — a sessão
aconteceu, a memória já não está fresca. É uma decisão de produto, não de
infra: escolha o número olhando para isso, não para o custo de storage (que é
zero nos dois casos, dentro dos 10 GiB do plano gratuito).

**O controle é por marcador de tempo (`.ultimo-offsite`), não por dia da
semana.** A diferença aparece quando o container está parado no dia marcado
(deploy, reboot, OOM): a regra por dia-da-semana **pula a semana inteira** e
ninguém percebe; o marcador faz a réplica sair na próxima execução em que o
tempo já venceu — atrasada, nunca perdida. E o marcador só é gravado em
sucesso: réplica que falhou continua devida e tenta de novo no dia seguinte,
independente do intervalo.

> Pular por cadência **não** é falha e **não** muda o exit code — o log diz
> `réplica off-site não é devida nesta execução`. Não confundir com o `exit 3`
> da tabela abaixo, que é replicação que deveria ter acontecido e falhou.

#### Exit codes do `backup.sh` — 1 e 3 não são a mesma coisa

| Exit | Significado | O que o `scheduler.sh` faz |
| --- | --- | --- |
| 0 | sucesso completo | grava marcador do dia |
| 1 | **dump ou globals falharam** — não existe backup do dia | **não** grava marcador; tenta de novo em 10min |
| 2 | uso incorreto (argumento passado) | idem |
| 3 | backup do dia **íntegro em disco**, mas alguma **replicação** falhou | **grava** marcador + loga `ATENÇÃO`; não refaz o dump |

O 3 existe por um motivo operacional concreto: o marcador só era escrito em
`exit 0`, então uma falha **persistente** de replicação (conta off-site
suspensa, MinIO fora) faria o scheduler disparar um `pg_dump` completo contra o
banco de produção **a cada 10 minutos, o dia inteiro** — carga real e contínua
por um problema que refazer o dump não conserta. Com o 3, o dia é dado por
resolvido, o alerta fica alto no log, e a próxima janela replica.

> Ao configurar alerta em cima do log do painel: **exit 3 é acionável no mesmo
> dia** (pode não haver cópia fora do host), mas **não é emergência de dado
> perdido**. Exit 1 é.

### Provisionamento no Easypanel

O runner é um **serviço Easypanel dedicado com schedule**, não cron do SO: fica
versionado no repo e com log no painel.

> O bucket `iris-backups` **não** precisa ser criado à mão — o `backup.sh` roda
> `mc mb --ignore-existing` antes do upload.

1. **Novo serviço** → tipo **Aplicativo** → Code Source `romulosutil/Iris` →
   Builder **Dockerfile**, path `infra/backup/Dockerfile`, build context na raiz,
   branch `main`.
2. **Volume persistente** (aba `Armazenamento`) montado em **`/backups`** (senão
   o dump some a cada restart do container).
3. **Env vars** do serviço (aba `Ambiente`):

   ```
   PGHOST=espectro-mvp-iris-postgres    PGPORT=5432
   PGUSER=iris               # role DONA — ver aviso acima
   PGPASSWORD=<senha da role dona>
   PGDATABASE=iris
   BACKUP_DIR=/backups       RETENTION_DAYS=30
   S3_ENDPOINT=http://espectro-mvp-iris-minio:9000
   S3_ACCESS_KEY=<...>       S3_SECRET_KEY=<...>
   S3_BACKUP_BUCKET=iris-backups

   # réplica off-site (#86) — ver «Provisionar o destino off-site» abaixo.
   # Deixar OFFSITE_S3_ENDPOINT vazio DESLIGA o passo (e é risco aceito).
   OFFSITE_S3_ENDPOINT=https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com
   OFFSITE_S3_ACCESS_KEY=<...>   OFFSITE_S3_SECRET_KEY=<...>
   OFFSITE_S3_BUCKET=iris-backups-offsite
   OFFSITE_AGE_RECIPIENT=age1...   # chave PÚBLICA. A privada nunca entra aqui.
   OFFSITE_INTERVAL_DAYS=1         # 1 = diário · 7 = semanal (ver abaixo)
   ```

   **Atenção ao nome de host interno — use HÍFEN, não underscore.** O Easypanel
   registra o serviço em duas formas: `espectro-mvp_iris-minio` (a canônica, com
   underscore) e `espectro-mvp-iris-minio` (com hífen). As duas resolvem pro
   mesmo IP, mas:

   - `libpq` (`pg_dump`/`psql`) aceita underscore → o dump funciona com as duas.
   - **o `mc` (MinIO/S3) rejeita:** underscore é ilegal em hostname por RFC 1123,
     e o SDK valida. Com `espectro-mvp_iris-minio` o upload falha com
     `Invalid Request (invalid hostname)` — erro que não menciona underscore e
     parece problema de credencial. Foi o que quebrou o primeiro deploy.

   Por isso **hífen nas duas** env vars: uma regra só, válida pros dois clientes.
   Para descobrir o nome do projeto/serviço, conferir a env var
   `MIGRATION_DATABASE_URL` do serviço `iris-migrate` (mesmo Postgres, mesma role
   dona) e trocar `_` por `-`.

4. **Agendamento** (aba `Avançado` → campo **Comando**):

   ```
   /app/scheduler.sh
   ```

   **Este Easypanel (v2.31.0) não tem cron para serviço de app** — não existe
   campo "Schedule", não existe tipo de serviço "Cron", e o backup nativo do
   serviço Postgres é manual (e faria `pg_dump` sem globals, o furo documentado
   acima). Por isso o agendador é o `scheduler.sh` do repo: o container fica de
   pé dormindo (poucos MB de RSS, 0% de CPU) e dispara o `backup.sh` na janela.

   Default: **06:00 UTC = 03:00 de Brasília** (UTC−3, sem horário de verão desde
   2019). Para mudar, `BACKUP_AT_HOUR_UTC` (0-23). Ele marca
   `.ultimo-backup-<data>` no volume e **não roda duas vezes no mesmo dia UTC** —
   então um redeploy ou reboot do VPS no meio do dia não dispara backup extra, e
   uma falha transitória é retentada na volta seguinte sem matar o agendador.

   `Réplicas` = 1. Não ligar `Tempo de inatividade zero` (não é serviço web).

6. **Conferir a primeira execução**: rodar o serviço à mão uma vez e checar que
   apareceram **os dois arquivos do par**, com o mesmo timestamp, em `/backups`
   **e** no bucket:

   ```
   iris-<YYYYmmddTHHMMSSZ>.dump
   iris-<YYYYmmddTHHMMSSZ>.globals.sql
   ```

   Só um dos dois = backup quebrado, mesmo que o exit tenha sido 0 (não deveria
   acontecer: o rename é atômico e só ocorre depois dos dois validarem — se você
   vir isso, investigue antes de confiar no backup). `backup.sh` sai != 0 se o
   `pg_restore --list` do dump falhar **ou** se o `.globals.sql` sair vazio / sem
   `CREATE ROLE`, e só faz o prune por `RETENTION_DAYS` **depois** que o par
   passou.

> `backup.sh` **não aceita argumento** e sai 2 se receber um. É proposital: o
> `Dockerfile` usa `CMD` (não `ENTRYPOINT`), então
> `docker compose run --rm backup ./verify-restore.sh` **substitui** o comando.
> Com o `ENTRYPOINT` antigo o script vinha como argv do `backup.sh`, que o
> ignorava e rodava mais um backup saindo 0 — o operador lia "exit 0" e marcava
> o teste de restore como feito sem ele jamais ter rodado.

### Runbook — teste de restore (é isto que fecha o checkbox)

Rodar dentro do container do serviço de backup (Easypanel → Console):

```bash
# 1. Gera um backup fresco e confirma exit 0
./backup.sh; echo "exit=$?"

# 2. Restaura o dump mais recente num banco descartável e valida
./verify-restore.sh; echo "exit=$?"
```

> `verify-restore.sh` precisa de um servidor **PG17** (o client da imagem é 17 e
> emite `SET transaction_timeout`, que o PG16 rejeita). Em produção isso é o caso.
> **Em dev local não** — o compose ainda roda PG16, então o verify falha ali no
> `pg_restore` por versão, não por backup ruim. Para exercitar localmente, aponte
> `PGHOST` para um Postgres 17. Rastreado na issue de paridade do compose.

`verify-restore.sh` sai **0** só se, no banco restaurado: contagem de tabelas
bate, **RLS continua ativo e o número de policies é igual ao da origem**, os
row counts batem, roles/grants foram preservados **e existe o `.globals.sql`
irmão do dump escolhido, contendo `CREATE ROLE` para `app_role` e `iris_auth`**.
Ele dropa o banco descartável no fim.

> **Limitação deliberada — e é ela que deixou o furo passar antes:**
> `verify-restore.sh` restaura no **mesmo cluster** da origem, onde `app_role` e
> `iris_auth` **já existem**. Nesse cenário até um restore sem globals
> "funcionaria". Por isso ele agora assere o par `.globals.sql`, mas isso **não
> substitui** o teste de cluster novo — esse é o runbook de DR abaixo, e é
> manual, porque exige um segundo cluster Postgres vazio.

Se sair != 0, **o backup não vale** — não subir dado real até resolver. Falha
mais provável, na ordem: `PGUSER` não é a role dona (row counts menores),
`.globals.sql` ausente ou sem as roles, policies faltando, ou volume `/backups`
não persistente.

Registrar o resultado (data + exit code) no `BACKLOG.md` — é a evidência que
fecha o item da Etapa 5 da #75.

### Runbook — restore real em incidente

Banco de produção corrompido ou perdido. **A ordem importa:**

1. **Parar o app primeiro** (Easypanel → serviço do app → Stop). Restaurar com o
   app escrevendo em cima gera dado meio-velho meio-novo, pior que a perda.
2. **Restaurar** o dump escolhido (ou `latest`) no alvo:

   ```bash
   TARGET_DATABASE_URL=postgres://iris:<senha>@iris-postgres:5432/iris \
   I_UNDERSTAND_THIS_OVERWRITES=yes \
   ./restore.sh latest
   ```

   `restore.sh` é **destrutivo** e exige `I_UNDERSTAND_THIS_OVERWRITES=yes` para
   alvo de produção — é de propósito, não contornar.

   O script resolve sozinho o `.globals.sql` irmão do dump escolhido e o aplica
   **antes** do `pg_restore`. Se não achar o irmão, **aborta** — restaurar sem
   globals produz banco sem RLS. Os globals são aplicados com
   `psql -v ON_ERROR_STOP=0`: erro de role já existente (`role "iris" already
   exists`) é **esperado e benigno** quando o cluster já é o antigo.

3. **Re-setar as senhas das roles de login.** Os globals vieram sem senha
   (`--no-role-passwords`), então quem autentica precisa de senha de volta,
   com os valores do provisionamento:

   ```sql
   ALTER ROLE iris_app        PASSWORD '<senha do provisionamento>';
   ALTER ROLE iris_auth_login PASSWORD '<senha do provisionamento>';
   ```

   Num restore no cluster que já existia, as senhas antigas continuam lá e este
   passo é no-op — mas confira, em vez de assumir. Policies e GRANTs **não**
   dependem disso; só o login depende.
4. **Validar o isolamento antes de religar**: rodar `pnpm test:rls` apontando
   pro banco restaurado. Restore que perdeu policy vira vazamento entre
   clínicas no minuto em que o app voltar. Sem `test:rls` verde, **não religar**.
5. **Religar o app** e conferir login + uma leitura por papel.
6. Registrar o incidente (janela de dado perdida = do último backup até a falha)
   — dado de paciente perdido é comunicação ao titular, não só nota técnica.

### Runbook — DR em cluster novo (o VPS morreu, subiu outro)

Cenário diferente do anterior: **o cluster Postgres é novo e vazio**. Nada de
`app_role`, `iris_auth` ou grants existe ali. É exatamente o cenário que o
`verify-restore.sh` **NÃO cobre** (ele testa no mesmo cluster, onde as roles já
existem) — este runbook é manual e não tem atalho.

Pré-requisito: ter em mãos **o par completo** (`iris-<ts>.dump` +
`iris-<ts>.globals.sql`) e as senhas do provisionamento das roles de login.

1. **Subir Postgres novo** (mesma major version, PG 17) e o serviço de backup
   com o par de arquivos acessível em `/backups`.
2. **Restaurar o par** — `restore.sh` aplica os globals primeiro e só então o
   `pg_restore`:

   ```bash
   TARGET_DATABASE_URL=postgres://iris:<senha>@iris-postgres:5432/iris \
   I_UNDERSTAND_THIS_OVERWRITES=yes \
   ./restore.sh /backups/iris-<ts>.dump
   ```

   Erros benignos de `CREATE ROLE` ao aplicar globals são esperados (o cluster
   novo já tem `iris`). Erro **fatal** aqui é abortar e investigar.
3. **Re-setar as senhas das roles de login** (obrigatório aqui — no cluster novo
   elas nascem sem senha e **nada autentica**):

   ```sql
   ALTER ROLE iris_app        PASSWORD '<senha do provisionamento>';
   ALTER ROLE iris_auth_login PASSWORD '<senha do provisionamento>';
   ```

4. **Conferir que o isolamento veio junto**, antes de qualquer app tocar o
   banco. Rodar `pnpm test:rls` contra o banco restaurado; e olhar os números
   à mão, comparando com a tabela do topo desta seção:

   ```sql
   SELECT count(*) FROM pg_policies;                          -- espera-se 85
   SELECT count(*) FROM pg_class WHERE relrowsecurity;         -- espera-se 33
   SELECT rolname FROM pg_roles WHERE rolname IN ('app_role','iris_auth');
   ```

   **`0` policies = os globals não foram aplicados.** Parar, não religar nada,
   voltar ao passo 2.
5. **Só então religar o app**, apontado pro cluster novo, e conferir login +
   uma leitura por papel.
6. Registrar tudo no `BACKLOG.md` (data, timestamp do par usado, exit codes,
   números do passo 4).

### Runbook — provisionar o destino off-site (uma vez, o Rômulo executa)

Passos que **não** dá para automatizar do VPS: criar conta em provedor, gerar
chave, definir lifecycle. Ordem importa — o passo 5 é o que impede o pior
desfecho (réplica cifrada com chave que ninguém tem).

**Provedor recomendado: Oracle Cloud Object Storage, região Brazil East (São
Paulo, `sa-saopaulo-1`).** Always Free: 10 GiB de Object Storage permanentes
(+10 GiB de Archive, cota combinada de 20 GiB — o que serve para o backup é a
cota de 10 GiB do tier Standard; medido no console em 27/07/2026, não é trial de 12
meses), 50k requisições/mês, API S3-compatível — o `mc` que já está na imagem
fala com ela sem ferramenta nova. O dado fica em São Paulo, mesmo país do VPS.

> ⚠️ **A região de origem (home region) trava no cadastro e não muda depois.**
> Escolher **Brazil East (São Paulo)** no signup. Errar aqui = refazer a conta.
>
> Alternativa 100% nacional: **Magalu Cloud** (empresa brasileira). Não tem
> camada gratuita — Cold Instant a R$ 0,06/GiB/mês, ou seja ~R$ 0,30/mês nesse
> volume. Se a exigência for "provedor nacional" e não só "dado no Brasil",
> é essa. A troca é só endpoint + credencial: os dois falam S3.

1. **Criar a conta** com home region São Paulo. Cartão é exigido no cadastro e
   não é cobrado no Always Free; cartão virtual descartável costuma ser
   rejeitado.
2. **Criar o bucket** `iris-backups-offsite`. Anotar o *namespace* — ele entra
   no endpoint: `https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com`.
3. **Regra de lifecycle no bucket** com a mesma janela do `RETENTION_DAYS`
   (hoje 30 dias). **Isto não é opcional** — o `backup.sh` não poda o off-site
   por design, então sem a regra o bucket cresce até estourar os 10 GiB e os
   uploads passam a falhar (`exit 3` todo dia).
   > A janela de retenção do off-site é **a mesma discussão da issue #89**
   > (retenção de backup × direito ao expurgo da Fase 6). Um titular expurgado
   > continua existindo nos backups pela janela de retenção — agora em três
   > lugares, um deles fora do host. Alinhar com a decisão da #89.
4. **Criar credencial dedicada** (na Oracle: *Customer Secret Key*) com política
   de **escrita apenas** — sem `DeleteObject`, sem `CreateBucket`. Não reusar a
   credencial do MinIO: ela vive no host que se assume comprometido.
5. **Gerar o par de chaves `age`** — numa máquina que **não é o VPS**:

   ```bash
   # a imagem de backup já tem o age instalado; --no-deps não sobe o Postgres
   docker compose -f infra/docker-compose.yml --profile backup \
     run --rm --no-deps backup age-keygen
   ```

   A saída tem as duas metades:

   ```
   # public key: age1xxxxxxxx...   <- vai para OFFSITE_AGE_RECIPIENT no Easypanel
   AGE-SECRET-KEY-1YYYYYYYY...     <- NUNCA no VPS, nunca no repo, nunca no chat
   ```

   Guardar a **privada** em gerenciador de senhas **e** impressa em papel, em
   local físico distinto. Ela é o único caminho de volta a partir do off-site.

6. **PROVA OBRIGATÓRIA antes de considerar pronto — decifrar de verdade.** Não
   pule: uma réplica cifrada com uma chave cuja privada ninguém tem é
   indistinguível de uma réplica boa, até o dia do desastre.

   ```bash
   # com a chave privada na máquina local (nunca no VPS)
   printf '%s\n' 'AGE-SECRET-KEY-1YYY...' > id.txt && chmod 600 id.txt
   mc cp offsite/iris-backups-offsite/iris-<ts>.dump.age .
   age -d -i id.txt -o iris-<ts>.dump iris-<ts>.dump.age
   pg_restore --list iris-<ts>.dump | head        # tem que listar objetos
   shred -u id.txt
   ```

   Se `pg_restore --list` reclamar, **a réplica não presta** — parar e
   investigar antes de marcar a #86 como fechada.

7. **Preencher as env vars** `OFFSITE_*` no serviço de backup do Easypanel e
   redeployar. Conferir no log da primeira execução:
   `réplica off-site concluída (dump + globals, cifrados)`.

### Runbook — DR a partir do off-site (o VPS não existe mais)

Pior cenário: host destruído, `/backups` e MinIO foram junto. A única cópia é a
do bucket off-site, cifrada.

Diferença crucial em relação ao runbook «DR em cluster novo»: **há um passo de
decifrar antes**, e ele exige a chave privada. Sem ela não há restore.

1. **Baixar o par** — os dois, sempre (`.dump.age` **e** `.globals.sql.age` do
   mesmo timestamp). Dump sem globals restaura 37 tabelas e **zero policies de
   RLS**, com exit 0 — ver a tabela no topo desta seção.

   ```bash
   printf '%s\n%s\n' "$ACCESS_KEY" "$SECRET_KEY" \
     | mc alias set offsite "https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com" --api S3v4
   mc ls offsite/iris-backups-offsite/ | tail -5      # escolher o timestamp
   mc cp offsite/iris-backups-offsite/iris-<ts>.dump.age .
   mc cp offsite/iris-backups-offsite/iris-<ts>.globals.sql.age .
   ```

2. **Decifrar os dois**, com a chave privada, numa máquina de confiança:

   ```bash
   printf '%s\n' 'AGE-SECRET-KEY-1YYY...' > id.txt && chmod 600 id.txt
   age -d -i id.txt -o iris-<ts>.dump        iris-<ts>.dump.age
   age -d -i id.txt -o iris-<ts>.globals.sql iris-<ts>.globals.sql.age
   shred -u id.txt
   ```

   > Os nomes decifrados **têm que ficar exatamente** `iris-<ts>.dump` e
   > `iris-<ts>.globals.sql`, com o mesmo `<ts>`: é trocando a extensão que o
   > `restore.sh` acha o irmão de globals. Nome fora do padrão faz ele abortar
   > dizendo que os globals não existem — o que, aqui, seria confuso.

3. **Seguir o runbook «DR em cluster novo»** a partir do passo 1, com esses
   dois arquivos em `/backups`. Ele já cobre restore, re-set de senhas das
   roles e a conferência de `pg_policies`.

4. **Prova de que deu certo é `pnpm test:rls` passando** no banco restaurado —
   não contagem de tabelas. 37 tabelas aparecem com ou sem RLS.

### `SKIP_GLOBALS=yes` — escape hatch, com o preço explícito

`restore.sh` **aborta** se não achar o `.globals.sql` irmão do dump. Para seguir
mesmo assim, só com a variável explícita:

```bash
SKIP_GLOBALS=yes ./restore.sh <dump>
```

O script loga aviso alto e segue. O que você perde:

- Num **cluster novo**: todo `GRANT`/`CREATE POLICY ... TO app_role` falha com
  `role does not exist` — banco com dado clínico e **RLS não-funcional**, sem
  erro fatal. É literalmente o furo 37 tabelas / **0 policies** da tabela lá em
  cima.
- Num **cluster onde as roles já existem**: normalmente inócuo — é o único caso
  em que usar isto é defensável (ex.: restaurar um dump antigo, anterior aos
  globals, num cluster já provisionado).

Regra: **nunca em DR de verdade.** Se você não tem certeza de que as roles já
existem no alvo, você não tem o direito de usar esta flag.

### Cadência — o teste de restore não é one-shot

Backup apodrece em silêncio: schema muda, role muda, volume enche. Reexecutar o
runbook de teste de restore:

- **Mensalmente**, como rotina de operação; e
- **após toda migração que mexa em RLS, policies, roles ou grants** — são
  exatamente as coisas que o `pg_dump` **não** carrega (roles são de cluster) e
  que o `verify` checa.

O runbook de **DR em cluster novo** tem cadência própria e mais folgada
(exige subir um segundo Postgres vazio): reexecutar **a cada mudança de role**
(`CREATE ROLE` novo na migração) e pelo menos **uma vez antes do go-live com
dado real**. `verify-restore.sh` verde não é evidência para este item.

O drill de **DR a partir do off-site** é o mais folgado e o mais fácil de
esquecer — justamente porque nada no VPS o executa nem o cobra. **Trimestral**,
e obrigatoriamente **toda vez que a chave `age` for rotacionada**. O que ele
verifica e nenhum outro verifica:

- a chave privada ainda existe e ainda é a que decifra o que está no bucket;
- a credencial off-site ainda autentica (conta gratuita não foi reclamada);
- a regra de lifecycle não comeu mais do que devia.

> Um `exit 0` diário do `backup.sh` **não** é evidência de que o off-site
> presta. Ele prova que o upload não deu erro — não que alguém consegue
> decifrar o que subiu. Só o drill prova isso.

Cada execução vai registrada no `BACKLOG.md` (data + exit code + o que mudou
desde a anterior). Sem registro, considerar não testado.

## Notas

- O `Dockerfile` usa Next standalone (`output: "standalone"` em `next.config.ts`)
  → imagem enxuta. `outputFileTracingRoot` fixa a raiz do trace.
- Storybook publica-se como serviço estático separado no Easypanel (`pnpm
build-storybook` → `storybook-static/`), com Password Protection.
- Migrations (Drizzle) usam `MIGRATION_DATABASE_URL` (role dona), nunca a
  `DATABASE_URL` do app (app_role, sem DDL). Não rodam dentro do container do
  app; rodam no stage `migrate`, gated ANTES do app (ver §Gate de schema). Dado
  clínico não migra sozinho — o gate é executado por release, não em cada boot.
