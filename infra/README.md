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

| Segredo                    | Como rotacionar                    | Efeito colateral                                                                                |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GLITCHTIP_WEBHOOK_SECRET` | `openssl rand -hex 24`             | trocar nos **dois** lados (env do app + URL do webhook no GlitchTip), senão o relay passa a 401 |
| `BETTER_AUTH_SECRET`       | `openssl rand -base64 32`          | **invalida toda sessão ativa** — todo mundo reloga                                              |
| `GITHUB_TOKEN`             | novo PAT fine-grained (ver abaixo) | validar o relay ANTES de revogar o antigo                                                       |
| senha das roles Postgres   | `ALTER ROLE ... PASSWORD`          | atualizar `DATABASE_URL`, `AUTH_DATABASE_URL` e `MIGRATION_DATABASE_URL`                        |

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
-- O usuário de app_role (iris_app) já existe desde a Fase 1a; mesma receita.
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

## Teste de carga das imagens de infra (#157)

`infra/escalonamento/Dockerfile` e `infra/backup/Dockerfile` **não compartilham
o `node_modules` nem a árvore de arquivos do app** — copiam arquivo/diretório a
arquivo e instalam as dependências à mão, para não arrastar Next/React/
Playwright a processos que rodam uma chamada SQL por minuto. O preço disso é um
ponto cego: `pnpm test`, `pnpm typecheck` e `pnpm lint` rodam contra a árvore do
REPO, onde o arquivo importado existe e a dependência está no node_modules da
raiz. **Os três ficam verdes com a imagem quebrada** — foi assim que a #126
subiu um `import` novo com review e CI verdes e derrubou o motor de
escalonamento em produção por ~20 minutos (`ERR_MODULE_NOT_FOUND`, PR #156).

O fechamento é `scripts/ci/carga-imagens-infra.sh`, que **constrói a imagem e
carrega o código lá dentro** em vez de inspecionar o Dockerfile. Roda no CI
(`.github/workflows/carga-imagens-infra.yml`) e igual na sua máquina:

```bash
scripts/ci/carga-imagens-infra.sh                 # os três serviços
scripts/ci/carga-imagens-infra.sh escalonamento   # só um
scripts/ci/carga-imagens-infra.sh billing         # só a imagem do job de faturamento
```

`infra/billing/Dockerfile` (#288) entra na mesma varredura por um motivo
**diferente**: ele não instala dependência nenhuma, de propósito — o job é um
gatilho magro que só faz um POST, e toda a lógica de faturamento mora na rota do
app, onde ela compartilha o `node_modules`. O que se prova nessa imagem, então,
não é resolução de pacote: é que os `COPY` acertaram o caminho (o contexto de
build é a raiz do repo), que o `bash` do agendador continua lá, e que a guarda
de execução do `.mjs` dispara nas duas formas de invocação. Nessa imagem, um
`exit 0` silencioso significaria "o faturamento rodou" quando nada rodou.

Como ler o resultado — vale para os três serviços:

| resultado                                       | leitura                                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| exit != 0 **com a mensagem de guarda esperada** | ✅ o módulo carregou inteiro e morreu na env que falta   |
| **exit 0**                                      | ❌ a guarda de execução parou de rodar (defeito da #153) |
| qualquer outra falha                            | ❌ arquivo/dependência não chegou na imagem              |

O escalonamento é exercitado nas **duas** formas de invocação — caminho
absoluto e caminho relativo (a forma documentada no `docker-compose.yml`) —
porque foi a relativa que a #153 quebrou.

Um passo separado resolve **todo specifier importado, inclusive os dinâmicos**
(`scripts/ci/verificar-deps-imagem.mjs`, injetado por stdin para não virar
arquivo dentro da imagem de produção). Sem ele, uma dependência ausente que só
é usada em `await import()` dentro de `try/catch` — o caso do `resend` em
`scripts/lib/resend-rt.mjs` — passaria verde no teste de carga e o e-mail ao RT
falharia **em silêncio** em produção.

Esse passo distingue dois casos que antes ele confundia (corrigido na #288):
**zero arquivos varridos** continua sendo erro (o `COPY` mudou de caminho e o
serviço subiria vazio), mas **arquivos varridos com zero specifier externo**
é verde legítimo — é exatamente o estado desejado da imagem de billing, que não
tem dependência npm nenhuma por desenho.

> Se uma dependência npm nova entrar no caminho destes serviços, ela precisa ir
> na linha de instalação do Dockerfile do serviço. Adicionar no `package.json`
> da raiz **não alcança** estas imagens.

**Windows/Git Bash:** o script já exporta `MSYS_NO_PATHCONV=1`. Sem isso o MSYS
reescreve `/app/...` para caminho do Windows antes do docker ver o argumento, e
o erro parece vir de dentro do container.

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

|                              | só `.dump` (errado) | `.globals.sql` + `.dump` (hoje) |
| ---------------------------- | ------------------- | ------------------------------- |
| Tabelas                      | 37                  | 37                              |
| **Policies de RLS**          | **0**               | **85**                          |
| Tabelas com `relrowsecurity` | 0                   | 33                              |
| Roles `app_role`/`iris_auth` | 0                   | 2                               |

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

| #   | Destino              | Onde roda       | Cifrado?      | Cobre                                           |
| --- | -------------------- | --------------- | ------------- | ----------------------------------------------- |
| 1   | Volume `/backups`    | **no VPS**      | não           | corrupção lógica, `DROP` acidental, erro humano |
| 2   | MinIO `iris-backups` | **no VPS**      | não           | perda do volume do Postgres                     |
| 3   | Bucket off-site      | **fora do VPS** | **sim (age)** | **perda total do host**                         |

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
design)` toda execução justamente para esse esquecimento não ficar silencioso.

#### Cadência do off-site — quanto se perde no pior dia

`OFFSITE_INTERVAL_DAYS` controla **só** a réplica off-site. O dump local e a
cópia no MinIO rodam **todo dia** de qualquer forma: são baratos e ficam no
mesmo disco.

| Valor         | Perda máxima no desastre de host | Volume no bucket (ret. 30d) |
| ------------- | -------------------------------- | --------------------------- |
| `1` (default) | até 1 dia                        | ~30 pares                   |
| `7`           | **até 7 dias**                   | ~4 pares                    |

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

| Exit | Significado                                                          | O que o `scheduler.sh` faz                                                                               |
| ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0    | sucesso completo                                                     | grava marcador do dia                                                                                    |
| 1    | **dump ou globals falharam** — não existe backup do dia              | **não** grava marcador; tenta de novo em 10min                                                           |
| 2    | uso incorreto (argumento passado)                                    | idem                                                                                                     |
| 3    | backup do dia **íntegro em disco**, mas alguma **replicação** falhou | **grava** marcador + cria arquivo-sinal `/backups/.offsite-degradado` + loga `ATENÇÃO`; não refaz o dump |

O 3 existe por um motivo operacional concreto: o marcador só era escrito em
`exit 0`, então uma falha **persistente** de replicação (conta off-site
suspensa, MinIO fora) faria o scheduler disparar um `pg_dump` completo contra o
banco de produção **a cada 10 minutos, o dia inteiro** — carga real e contínua
por um problema que refazer o dump não conserta. Com o 3, o dia é dado por
resolvido, o alerta fica alto no log, e a próxima janela replica.

> Ao configurar alerta em cima do log do painel ou do volume: **exit 3 grava o arquivo-sinal passivo `/backups/.offsite-degradado`** com timestamp e exit code 3 (removido automaticamente na primeira execução com sucesso, exit 0). Isso permite que verificações externas detectem a degradação sem depender de parse de logs ou interrupção do container. **exit 3 é acionável no mesmo dia** (pode não haver cópia fora do host), mas **não é emergência de dado perdido**. Exit 1 é.

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
   OFFSITE_S3_REGION=              # VAZIO. Só mexer com evidência — ver abaixo
   OFFSITE_S3_PATH_STYLE=          # vazio = auto. idem
   OFFSITE_AGE_RECIPIENT=age1...   # chave PÚBLICA. A privada nunca entra aqui.
   OFFSITE_INTERVAL_DAYS=1         # 1 = diário · 7 = semanal (ver abaixo)
   ```

   **Se a autenticação off-site falhar, comece pela credencial.** A OCI responde
   assim quando o `mc` não consegue autenticar:

   ```
   The secret key required to complete authentication could not be found.
   The region must be specified if this is not the home region for the tenancy.
   ```

   A frase junta duas causas e a segunda é uma pista falsa convincente — dá
   vontade de mexer em região antes de conferir a chave. **Em 28/07/2026 a causa
   foi a credencial**: o par `OFFSITE_S3_ACCESS_KEY`/`OFFSITE_S3_SECRET_KEY`
   precisa ser uma **Customer Secret Key** da OCI (Identity → usuário → _Customer
   Secret Keys_) — não um Auth Token, não uma chave de API com PEM. Trocada a
   chave, a réplica voltou a subir **sem tocar em região nenhuma**.

   Isso é o que o `backup.sh` loga hoje a cada execução, e é a configuração
   **provada** funcionando contra a OCI:

   ```
   [backup] off-site: assinando SigV4 na região 'us-east-1 (default do mc)' (path-style=auto)
   [backup] off-site: sonda OK — credencial autentica e a região de assinatura é aceita
   ```

   A **sonda roda antes do upload** e não é fatal. `sonda OK` = credencial e
   região aceitas, e qualquer problema restante está no bucket ou na permissão
   dele — o que o log diz na linha seguinte.

   **Os dois parafusos de dialeto, se um dia precisarem.** `OFFSITE_S3_REGION` e
   `OFFSITE_S3_PATH_STYLE` (`auto`|`on`|`off`) existem porque, medido no
   `mc RELEASE.2025-08-13`: `alias set` não tem `--region`, o `config.json` v10
   não guarda região, e sem configuração o `mc` assina `us-east-1`. A única
   alavanca é a env var `MC_REGION`, lida por invocação — o `backup.sh` a aplica
   só nos comandos off-site, para não mexer no MinIO local. **Ambos vêm vazios de
   propósito**: trocar um comportamento que funciona por um que parece mais
   correto é o tipo de mudança que só aparece na janela de backup seguinte.

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

5. **Conferir a primeira execução**: rodar o serviço à mão uma vez e checar que
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
2. **Criar o bucket** `iris-backups-offsite`. Anotar o _namespace_ — ele entra
   no endpoint: `https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com`.
3. **Regra de lifecycle no bucket** com a mesma janela do `RETENTION_DAYS`
   (hoje 30 dias). **Isto não é opcional** — o `backup.sh` não poda o off-site
   por design, então sem a regra o bucket cresce até estourar os 10 GiB e os
   uploads passam a falhar (`exit 3` todo dia).
   > A janela de retenção do off-site é **a mesma discussão da issue #89**
   > (retenção de backup × direito ao expurgo da Fase 6). Um titular expurgado
   > continua existindo nos backups pela janela de retenção — agora em três
   > lugares, um deles fora do host. Alinhar com a decisão da #89.
4. **Criar credencial dedicada** (na Oracle: _Customer Secret Key_) com política
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

6. **Preencher as env vars** `OFFSITE_*` no serviço de backup do Easypanel e
   redeployar (**Implantar**, não restart — restart mantém a imagem antiga).
   Conferir no log da primeira execução:
   `réplica off-site concluída (dump + globals, cifrados)`.

7. **PROVA OBRIGATÓRIA antes de considerar pronto — decifrar de verdade.** Não
   pule, e não considere o provisionamento concluído sem ela: uma réplica
   cifrada com uma chave cuja privada ninguém tem é indistinguível de uma
   réplica boa — mesmo tamanho, mesmo header, mesmo log de sucesso — até o dia
   do desastre. O procedimento inteiro está na seção própria logo abaixo,
   **«Runbook — provar que a réplica off-site é restaurável»**, porque ele se
   repete (a cada rotação de chave e no ensaio trimestral) e não é um passo de
   provisionamento.

   Critério para fechar este passo 7: aquele runbook terminando em **exit 0**,
   com o banner `RÉPLICA OFF-SITE VERIFICADA`. **Exit 2 não fecha** — ver a
   tabela de exit codes lá.

### Runbook — provar que a réplica off-site é restaurável (repetir sempre)

Esta é a verificação que fecha a issue #105. Ela não é one-shot: rodar **a cada
rotação da chave `age`**, sempre que o destino off-site mudar, e no **ensaio
trimestral** de DR.

O que `verify-offsite.sh` faz contra o bucket de **produção**: baixa o par mais
recente, confirma que está cifrado, **decifra**, valida o dump com
`pg_restore --list`, confere que os globals trazem `app_role` e `iris_auth`, e
— este é o ponto da #105 — **compara** o sha256 do dump decifrado com o valor
que você informa em `OFFSITE_EXPECTED_SHA256`. Antes ele só _imprimia_ o hash e
mandava você conferir de olho, imprimindo o banner de aceite de qualquer jeito:
um verificador que sai 0 sem ter comparado nada prova exatamente nada.

#### O comando

```bash
OFFSITE_EXPECTED_SHA256=<sha256 do dump, do log do backup> \
OFFSITE_EXPECTED_SHA256_GLOBALS=<sha256 dos globals, opcional> \
OFFSITE_MIN_CARIMBO=20260728T040000Z \
docker compose -f infra/docker-compose.yml --profile backup run --rm --no-deps -T backup ./verify-offsite.sh < /caminho/chave-privada-age.txt
```

As `OFFSITE_S3_*` vêm do ambiente do shell (o compose repassa). Rodar **na
máquina que guarda a chave privada**, nunca no VPS — o VPS tem só a pública, e
levar a privada para lá anularia o desenho inteiro da #86. A chave entra por
**stdin**: não é argumento (apareceria em `ps`), não é env var (`docker inspect`
mostra o env de qualquer container) e não é volume montado. O script recusa a
chave por `AGE_IDENTITY` justamente por isso.

As três variáveis novas são **do operador, de uma execução só**. Não são env
vars do serviço de backup: **não** as coloque no Easypanel. O VPS não tem nada
a fazer com elas.

#### Como pegar o `OFFSITE_EXPECTED_SHA256`

É o hash que o `backup.sh` calculou **no VPS, antes de cifrar**, para o mesmo
carimbo que o verificador for baixar. Ele sai no log do serviço de backup:

1. Abrir o Easypanel e entrar no **serviço de backup** (o mesmo em que você
   preencheu as `OFFSITE_*` no passo 6).
2. Abrir a visualização de **logs** do serviço (a aba/painel que mostra a saída
   das execuções; no Easypanel v2.31 ela fica junto das abas do serviço, ao lado
   de Console e Ambiente).
3. Procurar no texto por `sha256=`. As duas linhas que interessam começam com
   `[backup]` e têm esta forma:

   ```
   [backup] arquivo=iris-20260807T030000Z.dump tamanho_bytes=... duracao_s=... sha256=<64 hexas>
   [backup] arquivo=iris-20260807T030000Z.globals.sql tamanho_bytes=... sha256=<64 hexas>
   ```

4. Conferir que o `iris-<carimbo>` dessas linhas é **o mesmo carimbo** que o
   verificador vai baixar (ele baixa o **mais recente** do bucket). Se o off-site
   está em `OFFSITE_INTERVAL_DAYS=1`, é o do último backup; se não, é o da última
   execução que replicou.
5. Copiar o valor depois de `sha256=` da linha do `.dump` (64 caracteres
   hexadecimais, sem espaço) para `OFFSITE_EXPECTED_SHA256`; e o da linha do
   `.globals.sql` para `OFFSITE_EXPECTED_SHA256_GLOBALS`, se quiser cruzar os
   dois.

**Como saber que deu certo:** o valor tem exatamente 64 caracteres, só
`0-9a-f`, e o carimbo da linha bate com o que o verificador imprime ao baixar.
No fim, exit 0 e o banner `RÉPLICA OFF-SITE VERIFICADA: <carimbo> é
restaurável.`

**Se der errado:**

- **Não acho `sha256=` no log** — o painel costuma mostrar só a janela recente.
  Alternativa que não depende do painel: Easypanel → serviço de backup →
  **Console**, e rodar `sha256sum /backups/iris-<carimbo>.dump` (o dump local
  ainda está lá dentro da janela de `RETENTION_DAYS`). É o mesmo arquivo, logo o
  mesmo hash.
- **O hash não bate** — **não** trate como detalhe. Ou você pegou o carimbo
  errado (o mais comum: copiou o `sha256` de outro dia), ou o objeto no bucket
  não é o que o VPS gerou. Confira o carimbo primeiro; persistindo, é incidente.
- **Copiei e o script recusa o formato** — provavelmente veio espaço, quebra de
  linha ou o `sha256=` junto. O valor é só o hexa.

#### Exit codes — só 0 é aprovação

| Exit | Significado                                                                                             | O que fazer                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `0`  | Decifrou, é restaurável, os globals trazem as roles **e** o sha256 do dump bateu com o esperado.        | Aprovado. É o único desfecho que imprime `RÉPLICA OFF-SITE VERIFICADA` e o único que fecha a #105.                  |
| `1`  | Falha de qualquer checagem — inclusive **sha divergente** e carimbo abaixo do `OFFSITE_MIN_CARIMBO`.    | Parar e diagnosticar (ver os dois modos de falha abaixo). Nunca "tentar de novo e seguir".                          |
| `2`  | Decifrou e é restaurável, mas **procedência não provada**: `OFFSITE_EXPECTED_SHA256` não foi informado. | Imprime `VERIFICAÇÃO PARCIAL:` e **não** imprime o banner. **Exit 2 não é aprovação** — repetir com o sha esperado. |

O motivo de `2` existir em vez de virar `0`: rodar sem o hash ainda tem valor
(prova que a chave decifra), mas não prova que o artefato é _aquele_ que o VPS
gerou — pode ser uma cópia antiga ou de outro banco. Verde parcial reportado
como verde é justamente o que a #105 existe para matar.

#### `OFFSITE_MIN_CARIMBO` — corte de época

Formato `YYYYMMDDTHHMMSSZ`, **sem** o prefixo `iris-`. Objeto com carimbo
anterior ao corte é recusado com exit 1 **antes do download**.

Hoje o valor relevante é **`20260728T040000Z`**: as réplicas escritas antes da
rotação da chave `age` de 28/07/2026 ~04:00 UTC foram cifradas com uma privada
que **não existe mais** e são lixo permanente. Verificar uma delas não diz nada
— falharia por um motivo já conhecido e gastaria o tempo do ensaio. O corte
transforma isso em recusa imediata e explícita.

O corte é **opcional, mas recomendado em toda execução**. Procedência provada
não é recência provada: um objeto de meses atrás, conferido contra o `sha256`
que o `backup.sh` logou naquele dia, passa em todas as outras checagens e sai 0.
Sem o corte o script imprime uma linha `ATENÇÃO: OFFSITE_MIN_CARIMBO não foi
informado` antes do banner, dizendo em voz alta o que não checou — mas quem
confere que o carimbo é do ciclo esperado é você.

#### Os dois modos de falha, que são problemas diferentes

- **Não conseguir listar o bucket** = credencial de leitura. A credencial de
  produção é **write-only por design**; gerar uma de leitura só para a
  verificação e revogar depois.
- **Não conseguir decifrar** = o desastre silencioso: a réplica existe, ocupa
  espaço, loga sucesso todo dia — e é inútil. É exatamente o cenário que esta
  verificação existe para descobrir enquanto ainda dá tempo.

O próprio `verify-offsite.sh` é coberto pelo `test-offsite.sh` (seção 10),
inclusive a asserção de que ele **falha** com a chave errada e com sha
divergente — um verificador que passa com qualquer chave não prova nada.

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

## Motor de escalonamento de alerta de risco (#122)

Um alerta de risco clínico tem prazo de reconhecimento (15, 60 ou 240 minutos,
conforme a severidade — tabela §4.1 da spec). Vencido o prazo sem ninguém
reconhecer, ele **escala sozinho**, em dois estágios:

| de                   | condição                      | para                 |
| -------------------- | ----------------------------- | -------------------- |
| `aberto`             | prazo vencido                 | `escalado_estagio_1` |
| `escalado_estagio_1` | mais um prazo inteiro vencido | `escalado_estagio_2` |

Quem faz isso é um **serviço separado** (`infra/escalonamento/`) que roda uma
varredura por minuto.

> **O escalonamento é INTERNO À CLÍNICA.** Estágio 1 = todos os coordenadores.
> Estágio 2 = banner para toda a clínica + responsável técnico + exibição do
> protocolo de emergência da própria clínica. Em nenhum estágio o Iris avisa
> família, contato de emergência, SAMU, polícia ou Conselho Tutelar — decisão
> travada no parecer da #110. Não há webhook nem chamada HTTP para terceiros, e
> adicionar um seria reverter essa decisão.
>
> A **única** saída de rede do serviço, fora o Postgres, é o e-mail ao
> responsável técnico da própria clínica no estágio 2 (#126, via Resend). Ele
> não é exceção à regra acima: o RT é interno à clínica, e o corpo do e-mail é
> fixo — só um link para o painel autenticado, sem paciente, categoria ou
> trecho clínico (§4.2.1). Ver `scripts/lib/resend-rt.mjs`.

### Canal de e-mail ao RT: até 3 tentativas, não uma (#154)

O envio ao RT não tem fila própria — a retentativa é derivada do estado do
alerta, e é a mesma consulta que já fazia a reconciliação:

| resultado do envio                       | marcador em `canais_notificados`    | ainda na fila? |
| ---------------------------------------- | ----------------------------------- | -------------- |
| sucesso                                  | `email_responsavel_tecnico_enviado` | não            |
| falha **transitória** (429/5xx, timeout) | `email_responsavel_tecnico_adiado`  | **sim**        |
| falha **permanente** (endereço inválido) | `email_responsavel_tecnico_falhou`  | não            |
| transitória após o teto de 3 tentativas  | `email_responsavel_tecnico_falhou`  | não            |

`app_alertas_estagio2_sem_email()` exclui só `_enviado` e `_falhou`. Um alerta
`_adiado` continua elegível, então a varredura seguinte (1 min depois) o retenta
sozinha. O contador fica em `alerta_risco_clinico.email_rt_tentativas`.

**Como ler isso num incidente:**

- `_adiado` repetido e nunca virando `_enviado` → o provedor está fora do ar há
  mais de 3 minutos, ou a chave está inválida. Verifique a Resend antes de mexer
  no motor.
- `_falhou` na **primeira** tentativa → não foi rede: é endereço inválido, RT
  sem papel vigente na clínica, ou `EMAIL_PROVIDER_API_KEY`/`NEXT_PUBLIC_APP_URL`
  ausentes no serviço. O motivo exato está no `audit_log`, ação
  `alerta_risco_email_rt`, campo `detalhe`.
- Um alerta que estoure exceção **não** derruba mais a varredura: cada alerta é
  isolado, o erro completo vai para **stderr** (com stack e `cause`) e a fila
  segue. Se o log mostra `erro não tratado no alerta_id=...`, os demais alertas
  daquela passada foram processados normalmente.

### Por que serviço separado e não um `setInterval` dentro do Next.js

- **O app roda com mais de uma réplica.** Um `setInterval` no processo Next
  existiria em cada réplica: duas réplicas = duas varreduras simultâneas, e
  duas linhas de trilha para o mesmo escalonamento.
- **Ou nenhuma.** Se a instância que "tinha o timer" cair ou reciclar (deploy,
  OOM, escala a zero), o escalonamento simplesmente para — e para em silêncio,
  porque a ausência de escalonamento é indistinguível de "nenhum alerta
  venceu". É a pior falha possível justamente nesta funcionalidade.
- **Não há lock distribuído neste projeto.** Não existe Redis nem advisory-lock
  no caminho do app, então não há como eleger uma réplica. Um serviço com
  `Réplicas = 1` resolve o mesmo problema sem introduzir infraestrutura nova.
- **Bônus de segurança:** o serviço separado roda com uma role de banco própria
  que não tem SELECT em tabela nenhuma (ver abaixo). O app não consegue rodar
  assim, porque precisa ler tudo.

### Passo 1 — criar a role de login em produção (uma vez)

A migração `0049` cria a role `iris_escalonamento` como **NOLOGIN**: ela é só o
porta-privilégios (EXECUTE em `app_escalonar_risco_vencidos()` e nada mais). A
role que de fato se conecta é criada **fora das migrações**, mesmo padrão de
`app_role`/`iris_app`.

1. Gere uma senha forte **com CSPRNG**, no seu terminal. No PowerShell:

   ```powershell
   [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```

   > `Get-Random` **não** é CSPRNG. Não use.
   > **A senha nunca é colada em chat, em issue, em PR ou aqui.** Ela vai
   > direto do seu terminal para o campo do Easypanel.

2. Abra o console do Postgres (Easypanel → serviço do Postgres → Console) e
   rode, **substituindo `COLE_A_SENHA_AQUI`**:

   ```sql
   CREATE ROLE iris_escalonamento_login LOGIN PASSWORD 'COLE_A_SENHA_AQUI' IN ROLE iris_escalonamento;
   ```

3. Confirme que a role herdou o privilégio certo — e **só** ele:

   ```sql
   -- deve retornar t (true)
   SELECT has_function_privilege('iris_escalonamento_login', 'app_escalonar_risco_vencidos()', 'EXECUTE');

   -- deve retornar f (false). Se retornar t, PARE: a role está podendo ler
   -- dado clínico e o desenho de segurança se perdeu em algum lugar.
   SELECT has_table_privilege('iris_escalonamento_login', 'alerta_risco_clinico', 'SELECT');
   ```

4. Monte a URL de conexão (é isto que vai na env var do serviço):

   ```
   postgres://iris_escalonamento_login:<senha>@espectro-mvp-iris-postgres:5432/iris
   ```

   **Hífen, não underscore, no host** — mesma regra da seção de backup.

### Passo 2 — criar o serviço no Easypanel

Mesmo desenho do serviço de backup. Os nomes de aba abaixo são os que a seção
de backup deste arquivo já usa; **se o painel tiver mudado e você não achar um
campo, procure pelo objetivo descrito e confira antes de prosseguir — não
adivinhe o nome do botão.**

1. **Novo serviço** → tipo **Aplicativo** → Code Source `romulosutil/Iris` →
   Builder **Dockerfile**, path `infra/escalonamento/Dockerfile`, build context
   na **raiz**, branch `main`.
2. **Volume persistente** (aba `Armazenamento`) montado em **`/heartbeat`**.
   Sem ele, o arquivo de heartbeat some a cada restart e "heartbeat parado"
   passa a significar "container reiniciou", que é ruído — o sinal de
   monitoração deixa de valer.
3. **Env vars** (aba `Ambiente`):

   ```
   ESCALONAMENTO_DATABASE_URL=postgres://iris_escalonamento_login:<senha>@espectro-mvp-iris-postgres:5432/iris
   ESCALONAMENTO_HEARTBEAT_DIR=/heartbeat
   INTERVALO_S=60
   ```

4. **Comando** (aba `Avançado` → campo **Comando**):

   ```
   /app/agendador.sh
   ```

   **Este Easypanel (v2.31.0) não tem cron para serviço de app** — não existe
   campo "Schedule", não existe tipo de serviço "Cron". Por isso o laço é o
   `agendador.sh` do repo: o container fica de pé dormindo (poucos MB de RSS) e
   acorda a cada `INTERVALO_S`.

5. **`Réplicas` = 1.** Não é opcional: duas réplicas produzem duas linhas de
   trilha de auditoria para o mesmo escalonamento.
   Não ligar `Tempo de inatividade zero` (não é serviço web).

**Por que 60 segundos e não 5 minutos:** o menor prazo é de 15 minutos. Um tick
de 5 minutos adicionaria até 5 minutos de atraso sobre 15 — até um terço do
prazo inteiro, gasto depois que ele já venceu. Com 1 minuto o atraso máximo é
~7%. O custo é uma consulta indexada por minuto que, quase sempre, não retorna
nada.

### Como saber que deu certo

Logo depois do primeiro deploy, olhe os **Logs** do serviço no painel. A
primeira linha esperada é:

```
[agendador-escalonamento] 2026-07-28T12:00:00Z ativo. intervalo=60s · heartbeat=/heartbeat/.ultima-varredura
```

E, a cada minuto:

```
[escalonamento] 2026-07-28T12:01:00.123Z varredura concluída: 0 alerta(s) escalado(s).
```

`0 alerta(s)` é o resultado normal e saudável — significa que nada venceu.

Agora confirme o **heartbeat**. Easypanel → serviço `escalonamento` → Console:

```bash
cat /heartbeat/.ultima-varredura
```

Deve sair um timestamp ISO **de menos de um minuto atrás**. Rode duas vezes com
um minuto de intervalo: o valor tem que avançar.

### O heartbeat é o alarme — e ele é o alarme sobre o alarme

O arquivo `/heartbeat/.ultima-varredura` é reescrito **só depois de uma
varredura bem-sucedida**. Se ele parar de avançar, o motor parou.

**Isso importa mais aqui do que em qualquer outro serviço.** Um motor de
escalonamento parado não gera erro visível dentro do produto: a tela continua
mostrando alertas em aberto, sem nada indicando que eles deveriam ter escalado
há vinte minutos. De dentro do Iris, "o motor morreu" e "nada venceu" são
idênticos. O heartbeat é o único sinal que separa os dois.

**Regra operacional: heartbeat com mais de ~5 minutos de idade é incidente.**
Cinco minutos = quatro ticks perdidos — folga suficiente para um redeploy
normal e curta o bastante para não queimar um prazo de 15 minutos inteiro.

### O que fazer se der errado

1. **Leia os logs do serviço no painel.** Uma varredura que falha imprime o
   erro completo (com stack) em stderr, seguido de:

   ```
   [agendador-escalonamento] ... ATENÇÃO: varredura FALHOU (exit 1) — N falha(s) seguida(s).
   ```

   O laço **não morre** numa falha; ele tenta de novo no tick seguinte. Se o
   problema era transitório (banco reiniciando, deploy do Postgres), você verá
   `recuperado após N falha(s) seguida(s)` e o heartbeat volta a andar sozinho.

2. **Se o log estiver vazio ou o container parado**, o serviço caiu. Reinicie-o
   pelo painel e confira o heartbeat de novo.

3. **Se a falha se repete**, as causas prováveis, em ordem:
   - **Credencial.** Mensagem de `password authentication failed` ou
     `role ... does not exist`. Reveja o Passo 1 e o valor de
     `ESCALONAMENTO_DATABASE_URL` **no painel** — abra o campo e olhe, não
     confie em "eu já configurei".
   - **Host errado.** `could not translate host name`. Use hífen, não
     underscore.
   - **`permission denied for function app_escalonar_risco_vencidos`.** A role
     de login não está `IN ROLE iris_escalonamento`. Rode a verificação do
     Passo 1.3.
   - **`function app_escalonar_risco_vencidos() does not exist`.** A migração
     `0049` não foi aplicada neste banco. Ver §Gate de schema no deploy.

4. **Enquanto o motor está parado, o escalonamento automático não acontece.**
   Nada é perdido: assim que ele voltar, a varredura pega tudo que venceu no
   intervalo (a query olha o estado atual, não um cursor). Mas o atraso é real
   e é clínico — trate como incidente, não como manutenção.

### Teste de fumaça com alerta sintético

Confirma as **duas** transições de ponta a ponta. Há uma verificação
automatizada em `scripts/smoke-alerta-risco.mjs` — **em ambiente de teste**,
não em produção com dado real:

```bash
SMOKE_AMBIENTE_TESTE=1 \
SMOKE_DATABASE_URL=postgres://iris:...@localhost:5433/iris \
node scripts/smoke-alerta-risco.mjs
```

Duas coisas sobre esse script, porque as duas são consequência direta do
desenho de permissões da `0049`:

- **A URL tem que ser a da role dona**, não a da aplicação. `app_role` não tem
  INSERT em `alerta_risco_clinico` (criar alerta é privilégio do caminho do
  agente), a tabela é `FORCE ROW LEVEL SECURITY` e `app_escalonar_risco_vencidos()`
  só tem EXECUTE para `iris_escalonamento`. O script ignora `DATABASE_URL` de
  propósito — é a role errada e é a variável que aponta para produção na
  `.env.local`.
- **Nada é commitado.** Tudo roda numa transação que termina em `ROLLBACK`,
  inclusive as linhas de `audit_log`. O teste não precisa (e não tenta) deletar
  da trilha imutável para se limpar.

`--dry-run` para logo depois do INSERT sintético: valida conexão, permissões e
schema sem exercitar o motor.

Ou execute manualmente no console do Postgres com a role dona — **em ambiente de teste**, não em produção com dado real:

```sql
-- 1) Cria um alerta JÁ VENCIDO a partir de uma sessão de teste existente.
--    Troque o UUID por uma sessão real do ambiente de teste.
INSERT INTO alerta_risco_clinico (
  clinic_id, patient_id, session_id,
  categoria, severidade, certeza, trecho_fonte, detalhe,
  prazo_minutos, prazo_reconhecimento
)
SELECT s.clinic_id, s.patient_id, s.id,
       'ideacao_suicida', 'ideacao_ativa_com_plano', 'explicito',
       '[alerta sintetico de teste - #122]', '[teste de fumaca do motor]',
       15, now() - interval '1 minute'
  FROM session s
 WHERE s.id = '<UUID_DE_UMA_SESSAO_DE_TESTE>'
RETURNING id, status;   -- anote o id; status deve vir 'aberto'
```

```sql
-- 2) Espere ~1 minuto e confira que o motor pegou.
--    Esperado: status = escalado_estagio_1, escalado_em preenchido.
SELECT id, status, escalado_em, escalado_estagio_2_em, canais_notificados
  FROM alerta_risco_clinico WHERE id = '<ID_ANOTADO>';
```

```sql
-- 3) Força o SEGUNDO estágio empurrando o prazo para trás
--    (2x prazo_minutos = 30 min neste exemplo).
UPDATE alerta_risco_clinico
   SET prazo_reconhecimento = now() - interval '31 minutes'
 WHERE id = '<ID_ANOTADO>';
```

```sql
-- 4) Espere mais ~1 minuto. Esperado: status = escalado_estagio_2.
SELECT id, status, escalado_estagio_2_em, canais_notificados
  FROM alerta_risco_clinico WHERE id = '<ID_ANOTADO>';

-- 5) A trilha imutável tem que ter DUAS linhas, uma por estágio.
SELECT acao, detalhe, criado_em
  FROM audit_log
 WHERE entidade = 'alerta_risco_clinico' AND entidade_id = '<ID_ANOTADO>'
 ORDER BY criado_em;
```

```sql
-- 6) Limpeza (só em ambiente de teste).
DELETE FROM alerta_risco_clinico WHERE id = '<ID_ANOTADO>';
```

Se o passo 2 não mudar o status, o problema está no motor — volte para «O que
fazer se der errado». Se mudar, mas o passo 5 não trouxer as duas linhas, o
problema está na migração, não no serviço.

> **Ensaio sem mutação.** Para só _contar_ quantos alertas escalariam agora,
> sem escalar nada:
>
> ```bash
> ESCALONAMENTO_DATABASE_URL='postgres://iris:<senha da role dona>@...' \
>   node /app/scripts/escalonamento-risco.mjs --dry-run
> ```
>
> Isso exige **SELECT na tabela**, que a role do job propositalmente não tem —
> então o `--dry-run` só funciona com a role dona, à mão. O serviço em produção
> nunca roda com essa flag, e o `--dry-run` **não** atualiza o heartbeat (para
> uma inspeção manual jamais mascarar um motor parado).

---

### Job de Expurgo e Retenção do AuditLog (Marco Civil Art. 15 — #116)

Varredura diária para cumprimento da obrigação legal de retenção de 6 meses (180 dias):

```bash
DATABASE_URL='postgres://...' node /app/scripts/expurgo-audit-log.mjs
```

1. **Pseudonimização de logs órfãos:** invoca `app_pseudonimizar_audit_log_orfao()`, tratando logs onde `ator_id IS NULL` devido ao `ON DELETE SET NULL` no apagamento da conta de um usuário.
2. **Expurgo físico:** invoca `app_expurgar_audit_log_expirado()`, removendo do banco apenas registros com `criado_em < NOW() - INTERVAL '180 days'`.

---

## Auto-arquivamento por inatividade (#174)

Paciente sem **nenhum registro clínico** há 90 dias sai da contagem de ativos da
fatura (`arquivado_em = now()`). No 83º dia sai um **aviso prévio**, dando 7 dias
para a clínica reagir antes de o status mudar sozinho.

| dias sem atividade | o que acontece                                                 |
| ------------------ | -------------------------------------------------------------- |
| 83 a 89            | aviso prévio in-app (`audit_log`, `arquivamento_aviso_previo`) |
| 90 ou mais         | arquivamento comercial (`paciente_arquivado_automaticamente`)  |

Quem faz isso é um **serviço separado** (`infra/arquivamento/`) que roda **uma
varredura por dia**. A regra vive na função de banco
`app_auto_arquivar_pacientes()` (migração `0080`); o `.mjs` é gatilho magro, pelo
mesmo motivo do motor de escalonamento: a varredura **cruza clínicas**, então o
predicado não pode depender de um contexto de tenant montado em JS.

> **O aviso é IN-APP e só isso.** Uma linha em `audit_log` que a faixa da clínica
> lê. Nada de e-mail nem SMS: arquivamento é ato administrativo sobre **cobrança**,
> não evento clínico, e o Iris não fala com o mundo externo sobre paciente. Por
> isso a imagem deste serviço instala **apenas** `postgres` — sem `resend`, sem
> cliente HTTP. A ausência é o guardrail.

**A régua 83/90 está escrita em dois lugares** (`REGUA_ARQUIVAMENTO` em
`src/lib/jobs/auto-arquivamento.ts` e `REGUA` em `scripts/auto-arquivamento.mjs`,
porque `.mjs` não importa `.ts`). Quem impede a divergência é o teste de paridade
em `scripts/auto-arquivamento.test.mjs` — mudou um número, mude nos dois, e os
defaults da função de banco junto.

### Variáveis do serviço

| variável                     | obrigatória | default      |
| ---------------------------- | ----------- | ------------ |
| `ARQUIVAMENTO_DATABASE_URL`  | **sim**     | —            |
| `ARQUIVAMENTO_HEARTBEAT_DIR` | não         | `/heartbeat` |
| `INTERVALO_S`                | não         | `86400`      |

A role de login herda `iris_arquivamento`, que tem **EXECUTE só na função de
varredura e SELECT em nenhuma tabela** — credencial vazada não lê paciente nem
diário. Criada fora das migrações, mesmo padrão de `iris_escalonamento`
(ver §Motor de escalonamento, Passo 1; a senha vai do seu terminal direto para o
campo do Easypanel, nunca por chat/issue/PR).

`ARQUIVAMENTO_DATABASE_URL` é validada **antes** do laço: sem ela o container sai
com erro nomeando a variável, em vez de ficar de pé falhando em silêncio — o que
com tick de 24h só apareceria no dia seguinte.

### Por que 1x/dia e não 1x/min como o escalonamento

Não há prazo clínico aqui. Os limiares são 83 e 90 **dias**, com 7 dias de folga,
e a régua conta em dias civis. Varrer de minuto em minuto não antecipa nada e só
produziria 1440x mais chamadas que não mudam linha nenhuma.

### Heartbeat

`${ARQUIVAMENTO_HEARTBEAT_DIR}/.ultima-varredura`, escrito **só** após varredura
bem-sucedida — nunca em `--dry-run`, nunca em falha. Um job de arquivamento
parado é indistinguível, de dentro do produto, de "ninguém passou dos 90 dias":
a fatura continua cobrando paciente inativo e ninguém percebe. Se o arquivo
parar de avançar, é isso que está acontecendo.

### Ensaio sem gravar (`--dry-run`)

```bash
docker compose run --rm arquivamento node /app/scripts/auto-arquivamento.mjs --dry-run
```

O dry-run roda `app_auto_arquivar_pacientes()` **de verdade**, dentro de uma
transação, e faz `ROLLBACK` no fim — de propósito não reimplementa o predicado em
JS, porque um dry-run que reescreve a regra só testa a cópia. Ele **não** atualiza
o heartbeat, para uma inspeção manual jamais mascarar um job parado.

## Job de fechamento de ciclo de faturamento (#36, #288)

Quem transforma "cliente usou o produto" em "cliente foi cobrado" é este
serviço. Ele **não** apura consumo, **não** calcula preço e **não** fala com o
Asaas: faz um POST autenticado em `/api/internal/billing/fechar-ciclos`, e é
essa rota, dentro do app, que faz as três coisas. A razão está em
`infra/billing/Dockerfile` — a imagem de job não herda o `node_modules` do app,
e duplicar a tabela de preços num `.mjs` paralelo geraria **cobrança errada em
silêncio**: a mesma classe de bug da #156, com dinheiro no lugar de processo
morto.

> **Por que isto é P1.** Sem este serviço no ar, um ciclo vencido simplesmente
> não fecha: `pacientes_contados` fica em 0, nenhuma cobrança é emitida e o
> cliente ativo nunca é faturado — **sem erro em lugar nenhum**, porque o job
> que falharia é o job que não existe. Medido em produção em 13/08/2026: existe
> um ciclo real de um cliente real vencendo em **12/09/2026**.

### Passo 1 — o segredo do disparo, nos DOIS serviços

Gere o token (no seu terminal, nunca em chat):

```bash
openssl rand -hex 32
```

Esse valor vai, **idêntico**, em dois lugares:

| Serviço no painel | Variável            | Papel                          |
| ----------------- | ------------------- | ------------------------------ |
| `App` (o Next)    | `BILLING_JOB_TOKEN` | **valida** o header do disparo |
| `billing`         | `BILLING_JOB_TOKEN` | **envia** o header             |

Configurar só um dos dois dá 401 em 100% dos ticks, para sempre — e o log do job
vai dizer `HTTP 401`, não "faltou o token no App". Antes de criar o serviço,
abra `App` → aba `Ambiente` e **olhe** se `BILLING_JOB_TOKEN` já está lá; se
estiver, use o mesmo valor em vez de gerar outro.

> ⚠️ A aba `Ambiente` do Easypanel mostra todos os segredos em texto claro, e o
> painel roda em HTTP sem TLS. Não tire screenshot dessa tela.

> Salvar env **não aplica sozinho**: é preciso clicar em `Implantar`, e isso
> reconstrói o serviço a partir do HEAD de `main`.

### Passo 2 — criar o serviço

Mesmo desenho dos serviços de backup e escalonamento. Os nomes de aba abaixo são
os que aquelas seções já usam e que já foram executados com sucesso; **se o
painel tiver mudado e você não achar um campo, procure pelo objetivo descrito e
confira antes de prosseguir — não adivinhe o nome do botão.**

1. **Novo serviço** → tipo **Aplicativo** → nome `billing` → Code Source
   `romulosutil/Iris` → Builder **Dockerfile**, path `infra/billing/Dockerfile`,
   build context na **raiz**, branch `main`.
2. **Volume persistente** (aba `Armazenamento`) montado em **`/heartbeat`**. Sem
   ele o heartbeat some a cada restart, e "heartbeat parado" passa a significar
   "o container reiniciou" — ruído que apaga o sinal.
3. **Env vars** (aba `Ambiente`) — estas quatro, e **só** estas:

   ```
   BILLING_JOB_URL=https://irisclinica.ia.br/api/internal/billing/fechar-ciclos
   BILLING_JOB_TOKEN=<o mesmo valor do serviço App>
   INTERVALO_S=3600
   BILLING_HEARTBEAT_DIR=/heartbeat
   ```

   **`BILLING_PROVIDER`, `BILLING_PROVIDER_API_KEY`, `ASAAS_BASE_URL` e
   `ASAAS_WEBHOOK_TOKEN` NÃO entram aqui.** Elas pertencem ao serviço `App`, que
   é quem fala com o gateway — e já estão lá desde a virada de chave de
   10/08/2026. Copiar a chave da API do Asaas para este container espalharia o
   segredo por mais um lugar sem que nada a usasse.

4. **Comando** (aba `Avançado` → campo **Comando**):

   ```
   /app/agendador.sh
   ```

   **Este Easypanel (v2.31.0) não tem cron para serviço de app** — não existe
   campo "Schedule" nem tipo de serviço "Cron". Por isso o laço é o
   `agendador.sh` do repo: o container fica de pé dormindo (poucos MB de RSS) e
   acorda a cada `INTERVALO_S`.

5. **`Réplicas` = 1.** Não é opcional: duas réplicas disparam dois POST no mesmo
   instante. O `UNIQUE (clinic_id, inicio)` de `billing_cycle` e a guarda de
   idempotência da emissão protegem contra cobrança duplicada, mas duas réplicas
   transformam essa proteção em corrida de rotina em vez de barreira de última
   instância. Não ligar `Tempo de inatividade zero` (não é serviço web).

**Por que 3600s e não 60s como o escalonamento:** aqui não há prazo clínico. A
apuração roda depois do fim do ciclo, o ciclo é de 30 dias e o disparo é
idempotente do lado da rota — até uma hora de atraso não muda nada para o
cliente. Mas **não aumente** esse intervalo: a folga entre o fim do ciclo e a
apuração é a janela do defeito da #216 (a varredura de auto-arquivamento caindo
nessa fresta tira do ciclo um paciente que ficou ativo o ciclo inteiro).
Aumentar aqui aumenta a janela; encurtar não fecha o furo — quem fecha é a #216.

### Como saber que deu certo

Logo depois do primeiro deploy, **Logs** do serviço. Primeira linha esperada:

```
[agendador-billing] 2026-08-13T20:00:00Z ativo. intervalo=3600s · heartbeat=/heartbeat/.ultimo-fechamento
```

E, a cada hora, uma linha JSON única do disparo (aqui quebrada em várias linhas
para caber na página; no log ela é uma só):

```json
{
  "job": "fechamento-ciclo-billing",
  "quando": "2026-08-13T20:00:01.123Z",
  "dryRun": false,
  "ok": true,
  "status": 200,
  "falha": null,
  "erro": null,
  "corpo": "{\"ok\":true,\"ciclosProcessados\":0,\"falhas\":[],\"resultados\":[]}"
}
```

`"ciclosProcessados":0` é o resultado normal e saudável quando nenhum ciclo
venceu. **Cuidado com a leitura:** `ok:true` com `ciclosProcessados:0` prova que
o disparo chegou na rota e foi autorizado — **não** prova que a apuração conta
certo, nem que o preço sai certo, nem que a cobrança é emitida, porque com zero
ciclos vencidos nada disso executou. A prova das três é o ensaio mais abaixo.

Confirme o **heartbeat**. Easypanel → serviço `billing` → Console:

```bash
cat /heartbeat/.ultimo-fechamento
```

Timestamp ISO de menos de uma hora atrás. Repita depois do tick seguinte: o
valor tem que avançar.

### O detector de falha — e por que o heartbeat não basta

O heartbeat só avança em disparo bem-sucedido, então ele pega "o job está
falhando". Ele **não** pega o modo de falha que originou a #288: **o serviço não
existir**. Um serviço que nunca foi criado não tem heartbeat para congelar nem
log para ficar vazio — foi assim que a pendência atravessou de 04/08 a 13/08 sem
ninguém notar.

O detector que pega os dois casos olha o **efeito**, não o processo. Rode no
Postgres de produção:

```sql
-- Qualquer linha aqui = faturamento parado. Zero linhas = saudável.
SELECT bc.id, bc.clinic_id, bc.status, bc.fim, now() - bc.fim AS atraso, bc.erro
  FROM billing_cycle bc
 WHERE bc.status = 'aberto'
   AND bc.fim <= now() - interval '2 hours'
 ORDER BY bc.fim;
```

Duas horas de folga = dois ticks perdidos, o bastante para absorver um redeploy
normal e curto o bastante para não deixar um mês passar. **Uma linha retornada é
incidente**, não manutenção: um ciclo venceu e ninguém foi cobrado.

> **Não existe alarme automático para isto hoje.** Não há monitor externo em
> nenhum serviço deste projeto — backup, escalonamento e arquivamento têm o
> mesmo buraco, e todos dependem de alguém abrir o painel. Enquanto não houver,
> a consulta acima é responsabilidade humana, com cadência mínima **mensal, na
> semana do vencimento do ciclo**. Dizer "o job avisa se falhar" seria falso:
> ele avisa no log de um painel que ninguém abre por hábito.

### Ensaio manual (é isto que fecha o checkbox da #288)

Não espere o vencimento real. No Console do serviço `billing`:

```bash
# 1. Ensaio SEM emitir cobrança: apura, calcula preço, NÃO chama o gateway e
#    NÃO avança o ciclo.
node /app/scripts/fechamento-ciclo-billing.mjs --once --dry-run

# 2. Disparo real (só depois de o dry-run sair ok:true)
node /app/scripts/fechamento-ciclo-billing.mjs --once
```

> **`--dry-run` não é read-only.** Ele pula a emissão da cobrança e o avanço do
> ciclo, mas a apuração (`billing_apurar_ciclo`) apaga e reinsere
> `billing_cycle_patient` do ciclo. É recomputação idempotente, não mutação de
> estado de cobrança — mas não o chame de "consulta".

Depois do disparo real, **meça no banco** (`git log` não prova execução):

```sql
SELECT bc.status,
       bc.pacientes_contados,
       bc.valor_centavos,
       bc.provider_charge_id IS NOT NULL AS tem_charge,
       bc.apurado_em, bc.cobranca_emitida_em, bc.cobrado_em, bc.erro,
       bc.inicio, bc.fim
  FROM billing_cycle bc
 ORDER BY bc.fim DESC
 LIMIT 5;
```

O que caracteriza um fechamento bem-sucedido:

| Coluna                         | Antes        | Depois                                               |
| ------------------------------ | ------------ | ---------------------------------------------------- |
| `status`                       | `aberto`     | `aguardando_pagamento` (ou `pago`, se o valor for 0) |
| `pacientes_contados`           | `0`          | a contagem real de fichas ativas                     |
| `valor_centavos`               | `0`          | o preço da faixa correspondente                      |
| `provider_charge_id`           | `NULL`       | preenchido — **só** se `valor_centavos > 0`          |
| `subscription.ciclo_atual_fim` | data vencida | +30 dias, encadeado pelo `fim` anterior              |

**Caso de borda que engana:** com `pacientes_contados = 0` o preço é 0, o ciclo é
marcado `pago` na hora e **nenhuma cobrança é emitida**. Esse é o comportamento
correto, mas um fechamento assim **não exercita o caminho do gateway** — verde
ali não é prova de que a emissão funciona. Para provar a emissão, o ciclo precisa
ter pelo menos uma ficha ativa.

### O que fazer se der errado

1. **`"status":401` na linha JSON.** O `BILLING_JOB_TOKEN` do serviço `App` está
   ausente ou diferente do deste serviço. Abra as duas abas `Ambiente` e **olhe**
   os valores — não confie em "eu já configurei". Depois de corrigir, clique em
   `Implantar` no serviço alterado.
2. **`"falha":"rede"`.** O container não alcança `BILLING_JOB_URL`. Confira a URL
   (é a pública, com `https://`, não host interno).
3. **`"falha":"timeout"`.** Sem resposta em 30s. **Não conclua que o fechamento
   não rodou** — a rota pode ter concluído do outro lado. Meça no banco antes de
   disparar de novo. O disparo é idempotente por ciclo, mas o diagnóstico não
   pode afirmar uma causa que a evidência não distingue.
4. **`"status":500`.** O corpo inteiro da resposta vem na linha JSON — leia-o. É
   a rota do app que falhou, não o job.
5. **`ok:true` com `falhas` não vazio no corpo.** Uma clínica falhou e as outras
   seguiram, por desenho. O `clinicId` e o erro estão no corpo, e
   `billing_cycle.erro` guarda o texto.
6. **Enquanto o job está parado, ninguém é cobrado — e nada é perdido.** O trilho
   falha aberto de propósito: a varredura olha o estado atual, não um cursor,
   então quando o serviço voltar ele pega tudo que venceu. Falta de cobrança é
   recuperável; cobrança errada não.
