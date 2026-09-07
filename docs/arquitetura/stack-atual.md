# Stack do Iris — leitura em linguagem natural

> Documento descritivo, escrito a partir do que está **no repositório e nos
> arquivos de infra** (setembro/2026), não a partir do que os planos diziam que
> seria construído. Onde a documentação existente diverge do que o código faz, a
> divergência está registrada na última seção — e é a divergência, não este
> documento, que precisa de decisão.

---

## 1. O que o Iris é, antes de falar de tecnologia

O Iris é um SaaS para clínicas de terapia (intervenção comportamental para TEA,
TCC, Fonoaudiologia, Terapia Ocupacional). A terapeuta escreve um **diário de
sessão em texto livre**; uma IA lê esse texto e propõe **evidências
estruturadas** ligadas às metas do paciente; a terapeuta aprova uma a uma; o
coordenador valida por exceção. Nada é pontuado pela máquina.

Isso explica quase todas as escolhas técnicas adiante. O produto é
**multi-inquilino com dado clínico de menor de idade**, o que empurra o
isolamento para dentro do banco (RLS), obriga trilha de auditoria imutável, e
faz cada job de manutenção rodar com uma credencial própria e mínima em vez de
usar a credencial da aplicação.

---

## 2. A aplicação em si

É um **Next.js 16 com App Router**, rodando **React 19** sobre **Node 22**, em
TypeScript. O gerenciador de pacotes é o **pnpm 11.11.0**, fixado no
`packageManager` — invocar o binário errado quebra o boot do servidor de teste,
por isso o Playwright chama o binário do Next diretamente em vez de passar pelo
`pnpm start`.

A camada visual é **Tailwind CSS v4** com **Radix UI** para os primitivos
acessíveis (diálogo, select, tabs, slider, accordion, checkbox, progress,
avatar). O design system tem documentação própria e é exercitado no
**Storybook 10**, que roda com o addon de acessibilidade e com o runner de
testes do Vitest — ou seja, componente sem estado acessível quebra a suíte, não
só a revisão visual.

A aplicação também é instalável: há `manifest.ts`, service worker, página
`offline`, ícones gerados por script, e uma configuração de **TWA Android**
(`/.well-known/assetlinks.json`, com o pacote e os fingerprints vindo de env).
Existem specs E2E dedicados só ao viewport de 360px, num projeto Playwright
separado — se rodassem junto do desktop, passariam sempre e dariam falsa
sensação de cobertura mobile.

A estrutura de rotas é organizada por grupo: `(publico)` para landing e
cadastro, `(auth)` para login, `(app)` para o produto autenticado (agenda,
pacientes, diário, revisão, validação, supervisão, relatórios, alertas de risco,
equipe, clínica, assinatura, pendências) e `(admin)` para o super-admin.

---

## 3. O banco é o centro de gravidade

**Postgres 17**, puro — não é serviço gerenciado. O acesso é via **Drizzle ORM**
com **drizzle-kit** para migrações. Hoje são **156 migrações** aplicadas e
**52 tabelas** declaradas no schema.

O que torna esse banco incomum é que **a autorização mora nele**, não na
aplicação:

- Há **Row Level Security** em cima das tabelas de domínio, e as policies
  resolvem o inquilino por uma função (`app_clinic_id_exigido()`) em vez de ler
  `current_setting` cru — porque o cast cru estoura um erro que não nomeia o
  tenant, e um `NULL` silencioso esconderia a linha em vez de falhar.
- Escritas que precisam sair da RLS não ganham policy nova: viram função
  `SECURITY DEFINER` com o guard interno copiando o predicado exato da policy de
  leitura correspondente.
- Colunas novas quase sempre precisam de `GRANT` explícito, porque várias
  tabelas têm `UPDATE` revogado por tabela e concedido coluna a coluna.

Existem **múltiplas roles de conexão**, e a distinção não é cosmética:

| Papel                   | Variável                     | Para que serve                           |
| ----------------------- | ---------------------------- | ---------------------------------------- |
| Dona (BYPASSRLS)        | `MIGRATION_DATABASE_URL`     | só drizzle-kit e o dump de backup        |
| Aplicação (NOBYPASSRLS) | `DATABASE_URL`               | tudo que atende requisição               |
| Auth                    | `AUTH_DATABASE_URL`          | só as tabelas `auth_*`                   |
| Worker de ASR           | `ASR_WORKER_DATABASE_URL`    | 5 funções de transcrição, nenhuma tabela |
| Arquivamento            | `ARQUIVAMENTO_DATABASE_URL`  | 1 função, `SELECT` em nada               |
| Retenção                | `RETENCAO_DATABASE_URL`      | 1 função de aviso; **não** pode purgar   |
| Escalonamento           | `ESCALONAMENTO_DATABASE_URL` | motor de alerta de risco                 |
| Expurgo de trilha       | `EXPURGO_DATABASE_URL`       | funções de pseudonimização               |
| Sweeper de ASR          | `ASR_SWEEPER_DATABASE_URL`   | pergunta se o objeto pode morrer         |

A regra por trás disso é simples de enunciar: **credencial vazada de job não
pode ler prontuário**. Um job que só precisa de datas recebe uma role que só
enxerga datas.

### A fila

Desde o débito D73 existe **pg-boss** (fila transacional dentro do próprio
Postgres, schema criado na migração `0154`). O processo do Next é **apenas
produtor**: enfileira no mesmo `COMMIT` que muda o estado do domínio. Quem
consome é um container separado.

Hoje há duas filas: `asr-transcrever` (concorrência 1, 3 tentativas, DLQ) e
`dlq`. O caminho quente é o evento — o job nasce junto com o upload dos clipes.
O cron de 1 minuto existe como **rede de segurança**, por dois motivos que o
evento não cobre: clipe devolvido à fila depois que o job daquele lote já
terminou, e o heartbeat que o alarme mede (fila puramente orientada a evento
ficaria muda em clínica parada e dispararia alarme falso).

---

## 4. Autenticação e papéis

**Better-Auth 1.7.1**, in-app, falando com o Postgres pela role de auth. Tem
**MFA obrigatório para papéis clínicos** — a sessão só existe depois do segundo
fator, e o enforcement acontece em `getTenantContext`, não na tela. Em
desenvolvimento dá para desligar com `BYPASS_MFA_FOR_DEV`, nunca em produção.

Há throttle de tentativas de login (`auth_throttle`) e rate limit em rotas
sensíveis. O CPF é armazenado como hash com salt obrigatório (`CPF_HASH_SALT`) —
sem fallback no código, de propósito.

---

## 5. A parte de IA

**O Gemini (Google) é o único provedor de IA do produto.** Nenhum caminho usa
Anthropic ou OpenAI. A chave é uma só (`GOOGLE_API_KEY`), mas os três usos têm
**flags independentes**, todas `false` por padrão:

1. **Agente 1 — extração de evidências** (`src/lib/extraction`).
   Flag: `EXTRACTION_LLM_ENABLED`. É o coração do produto: lê o diário, devolve
   JSON validado contra um schema (`agent-output-schema.ts` + Zod), e o
   terapeuta aprova item a item. Sem a flag, cai num provider nulo ou num stub
   de demonstração.
2. **Agente 2 — relatório para a família** (`src/lib/report/familia`).
   Flag: `FAMILY_REPORT_LLM_ENABLED`.
3. **Agente 3 — relatório narrativo para convênio**
   (`src/lib/report/convenio-narrativo`). Flag: `CONVENIO_REPORT_LLM_ENABLED`.

A flag da extração é explicitamente um **gate de LGPD/DPA** — a chamada real com
dado de paciente só acontece quando o contrato com o Google está resolvido.

### Ditado de voz (ASR) — e é aqui que o MinIO aparece

O ASR **não** usa provedor externo. Roda **faster-whisper em Python, num
container na própria VPS** (`infra/asr/`), servindo `POST /transcrever` com um
bearer token. O motor está no mesmo host que o banco, então não há transferência
internacional de dado — a flag `FEATURE_FLAG_ASR_ENABLED` é uma **trava de
maturidade do serviço**, não um gate jurídico.

O ciclo do áudio é deliberadamente curto:

1. A terapeuta grava; o clipe sobe para um **bucket S3 efêmero no MinIO**
   (`iris-asr-efemero`), com credencial e bucket separados de tudo mais.
2. O upload promove os clipes a `na_fila` e enfileira o job no mesmo commit.
3. O consumidor (container `asr-agendador`) faz POST numa rota interna do Next.
4. A rota reserva o lote no banco, baixa o objeto, chama o `iris-asr`, grava a
   transcrição e **apaga o objeto no `finally`**.
5. Um `asr-sweeper` varre órfãos do bucket como backstop — e antes de apagar
   qualquer coisa **pergunta ao banco** se aquele objeto pode morrer.

A transcrição é efêmera por decisão de produto: o que sobrevive no prontuário é
a nota que a terapeuta aceitou, não o áudio nem o texto bruto.

Dois detalhes que custaram caro e estão fixados no código: o cliente S3 precisa
de `forcePathStyle: true` e de `requestChecksumCalculation: "WHEN_REQUIRED"`
(versões recentes do SDK anexam CRC32 e o MinIO devolve `400 InvalidRequest`,
deixando o sweeper cego); e o endpoint **não pode ter underscore no host**, o
que obriga usar o alias com hífen do Swarm.

---

## 6. Armazenamento de objetos: MinIO, em dois papéis distintos

Vale separar, porque a confusão entre os dois é fácil:

- **MinIO como storage efêmero de ASR** — bucket `iris-asr-efemero`, escrito e
  apagado pela aplicação, vida útil de minutos. Variáveis `ASR_S3_*`.
- **MinIO como réplica de backup** — bucket `iris-backups`, escrito pelo `mc`
  dentro do serviço de backup, retenção de 30 dias. Variáveis `S3_*` +
  `S3_BACKUP_BUCKET`.

Há ainda uma **terceira cópia off-site**, fora da VPS (Oracle Cloud São Paulo,
compatível com S3), cifrada com **age** — a chave privada nunca entra no host.
Essa é a única cópia que sobrevive à perda do VPS inteiro.

O backup não é só `pg_dump`: são **dois artefatos por rodada** — o dump e o
`pg_dumpall --globals-only`. Sem os globals, o restore volta sem as roles, e sem
as roles a RLS simplesmente não existe no banco restaurado. A prova de que o
restore prestou é rodar a suíte de RLS contra ele, não olhar o exit code.

---

## 7. Os jobs de manutenção

São **containers separados**, um por responsabilidade, todos magros. Cada um tem
`Dockerfile` + `agendador.sh` em `infra/<nome>/`:

| Serviço                  | O que faz                                               |
| ------------------------ | ------------------------------------------------------- |
| `iris-billing`           | dispara o fechamento de ciclos por POST em rota interna |
| `iris-exportacao`        | monta bundles de exportação integral do acervo          |
| `iris-arquivamento`      | arquiva paciente inativo há 90 dias                     |
| `iris-retencao`          | avisa sobre prazo de retenção (**avisa, nunca purga**)  |
| `iris-escalonamento`     | motor de escalonamento de alerta de risco               |
| `iris-expurgo-audit-log` | pseudonimiza a trilha no expurgo (não deleta)           |
| `iris-backup`            | dump, verificação, réplica local e off-site, prune      |
| `asr-agendador`          | consumidor da fila pg-boss                              |
| `asr-sweeper`            | backstop de órfãos do bucket efêmero                    |
| `iris-alarme`            | olha o heartbeat dos outros e avisa por e-mail          |

O padrão que se repete: **o job é um gatilho magro**. Ele não carrega a lógica de
negócio nem as dependências do app — faz um POST autenticado numa rota interna
do Next (`/api/internal/...`), com um token dedicado por domínio
(`BILLING_JOB_TOKEN`, `EXPORT_JOB_TOKEN`, `ASR_JOB_TOKEN`). A razão é concreta: a
imagem de um job não herda as dependências do app, e já houve caso de motor
caindo em produção com CI verde por causa disso.

O **alarme** merece destaque porque é o que fecha o laço: cada job escreve um
arquivo de heartbeat num volume compartilhado, **só em varredura completa e sem
erro** — nunca em dry-run, nunca em falha. O `iris-alarme` lê esses arquivos e
manda e-mail quando um para de avançar. Ele também vigia CPU, memória e disco do
host desde que as cotas foram aplicadas.

---

## 8. Integrações externas

| Serviço                            | Para que                                     | Como entra                                                           |
| ---------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| **Asaas**                          | pagamento e assinatura                       | API + webhook em `/api/hooks/asaas`, autenticado por token de header |
| **Resend**                         | e-mail (alerta de risco e transacional)      | API key; webhooks de bounce/entrega validados por **Svix**           |
| **GlitchTip**                      | erros (self-host, SDK compatível com Sentry) | `@sentry/nextjs` apontado para DSN próprio                           |
| **GitHub**                         | GlitchTip → issue automática                 | webhook em `/api/hooks/glitchtip`, PAT restrito ao repo              |
| **Clarity** / **Google Analytics** | comportamento e métricas                     | no-op se a env estiver ausente                                       |
| **Web Push (VAPID)**               | notificação push                             | a presença da chave pública é o que liga a feature                   |

O provedor de billing é uma **porta** (`BillingProvider`) com nome de variável
neutro. Mercado Pago existiu e saiu em agosto/2026 — não por infra, mas porque o
adapter nunca implementou Pix. A abstração ficou, e é ela que permite um segundo
gateway voltar sem cirurgia.

Detalhe não óbvio: o **PDF dos relatórios é renderizado por um Chromium
in-process via Playwright**, com CSP `default-src 'none'` injetada e todas as
requisições de rede abortadas. Ou seja, o Playwright neste projeto **não é só
ferramenta de teste — é dependência de produção**.

---

## 9. Testes e CI

Quatro suítes, com propósitos distintos:

- `pnpm test` — Vitest unitário/componente (jsdom, Testing Library, Storybook).
  Piso no CI: 1300 testes, 180 arquivos.
- `pnpm test:rls` — Vitest com `vitest.integration.config.ts`, contra Postgres
  real. Piso no CI: 800 testes, 95 arquivos.
- `pnpm test:e2e` — Playwright. Piso no CI: 17 testes, 10 arquivos.
- `pnpm test:llm` — chama o Gemini de verdade; fora do CI normal.

Os **pisos de cobertura** são a parte interessante: `verificar-cobertura-*.mjs`
reprova se a contagem cair, o que impede alguém apagar um teste incômodo sem que
nada acuse. O gate de E2E também **reprova com qualquer `skipped`** — a premissa
é que ambiente de CI nunca deveria disparar skip.

O `ci.yml` tem 8 jobs: `typecheck`, `lint`, `test`, `test-rls`, `test-e2e`,
`build`, `imagens-do-app-alteradas` e `carga-imagem-app`. O job `build` parece
duplicado do `test-e2e` e não é: ele roda `pnpm build` **sem banco nenhum**, e é
o único gate que segura o invariante "a aplicação compila sem Postgres" — que é
exatamente a condição do `docker build` no deploy.

Há ainda workflows separados para carga das imagens de infra, revisão de PR,
auditoria de segurança e smoke do provedor de extração.

---

## 10. Deploy

**VPS Hostinger KVM 4 (16 GB), São Paulo, com Easypanel sobre Docker Swarm.** O
domínio é `irisclinica.ia.br`, com Let's Encrypt automático e autodeploy no push
para `main`.

A imagem do app é multi-stage (`infra/Dockerfile`), com um **estágio de migração
separado** (`infra/Dockerfile.migrate`) — porque autodeploy com migração manual é
receita de drift de schema.

Dois pontos de operação que valem estar aqui:

- **Segredos não vão na aba `Ambiente` do Easypanel.** O painel é servido em
  HTTP puro e o log de build repassa toda env var como `--build-arg` em texto
  plano. As sensíveis moram num arquivo em `/etc/iris/production.env`, montado em
  `/run/secrets/env` e lido no runtime pelo `--env-file-if-exists` do Node.
- **Cotas de CPU e memória** estão aplicadas nos 14 serviços via
  `infra/aplicar-cotas.sh`, que lê a mesma tabela do `infra/README.md`. Fora do
  Swarm, `reservations.cpus` é aceito pelo parser e descartado em silêncio — quem
  dá peso relativo é `cpu_shares`.

---

## 11. O desenho em uma frase

O navegador fala com o Next; o Next fala com o Postgres sob RLS e enfileira
trabalho no próprio banco; containers magros consomem essa fila e disparam rotas
internas autenticadas por token; o MinIO segura só o que é efêmero (áudio) ou
frio (backup); a IA é sempre Gemini e sempre atrás de flag; e cada peça que roda
sozinha escreve um heartbeat que um alarme lê.

---

## 12. Auditoria: o que está inconsistente

Levantado ao escrever este documento. Cada item traz onde está, o que diz, o que
é, e por que importa. **A descrição de cada achado abaixo foi preservada como
levantada** — ela documenta o defeito, não o estado atual do repositório.

### 12.0 Status das correções (06/09/2026)

Doze dos treze achados foram corrigidos em três PRs:

| PR                                                  | Achados                          |
| --------------------------------------------------- | -------------------------------- |
| #634 — consistência do ledger e do README           | I1, I2, I3, I4, I5, I7, I10, I13 |
| #632 — dono único para `S3_*`, pino do Playwright   | I6, I8, I9                       |
| #633 — MinIO no job `test-e2e` (fecha [#501][i501]) | I12                              |

[i501]: https://github.com/romulosutil/Iris/issues/501

Nenhum outro achado tinha issue aberta — os doze saíram desta auditoria. A #501
já existia e é a única que fecha. A **#500** (provisionamento da role do worker
de ASR em produção) é adjacente e **continua aberta**: o PR #633 provisiona
`iris_asr_worker_login` apenas no CI, nada no VPS.

**I11 (`seed:local` = `seed:clinic`) não foi corrigido** — remover um alias de
`package.json` muda a interface de comando de quem já a usa, e a decisão é do
Rômulo. Segue aberto.

Duas coisas ficaram **pendentes de ratificação**, não de implementação:

- **I1** — a correção do README remove a afirmação de que o ASR é "gated por
  DPA". O fato técnico sustenta isso (motor self-hosted na própria VPS, sem
  terceiro), mas é afirmação de natureza jurídica e está marcada como tal no
  corpo do commit.
- **I9** — alinhar o container para `playwright@1.62.1` **troca a build do
  Chromium que renderiza PDF em produção**. É o comportamento correto, mas a
  renderização não foi validada (exige banco e dados de paciente). Vale validar
  antes do deploy.

Três descobertas feitas **durante** a correção, que não estavam no levantamento
original:

- O pino do Playwright foi introduzido como `ARG PLAYWRIGHT_VERSION`. Isso é uma
  superfície de override silencioso: o Easypanel repassa **toda** env var do
  serviço como `--build-arg` (`infra/README.md:50`), então uma variável de painel
  com esse nome sobrescreveria o pino, e o guard — que lê o arquivo — continuaria
  verde. Trocado por literal.
- Os pisos do gate de E2E (`--min-tests=17 --min-files=10`) estavam **mortos**: a
  suíte real coleta 63 testes em 20 arquivos. Dava para apagar 46 testes e 10
  arquivos sem o gate piscar. Subidos para a contagem exata (64/21).
- O E2E de ditado precisa de `ASR_WORKER_DATABASE_URL`, não só das 5 variáveis
  que a #501 lista: o `EXECUTE` das funções `app_asr_*` saiu de `app_role` na
  migração `0140`, e o `asrWorkerDb` é fail-closed (não cai para `DATABASE_URL`).
  Sem essa role provisionada, o tick do worker volta 500.

### 12.1 Contradição de sentido (duas fontes dizem coisas opostas)

**I1 — A flag do ASR é gate de DPA ou de maturidade?**
`README.md:85` diz: _"Próximos passos: Fase 6b (Iris Audio Companion / ASR —
fast-follow gated por DPA)"_. O `.env.example:53-55` diz o oposto, com todas as
letras: a flag é _"trava de MATURIDADE do serviço ASR self-hosted, **NÃO** gate
de LGPD/DPA (o motor roda na própria VPS, sem transferência)"_.
**Por que importa:** as duas leituras levam a decisões diferentes. Sob a leitura
do README, ligar o ASR espera assinatura de contrato com terceiro; sob a do
`.env.example`, espera medição de estabilidade. Uma das duas está bloqueando ou
liberando a feature pelo motivo errado.

**I2 — O pivô de infra está "em avaliação" ou consolidado?**
`CLAUDE.md:122` traz um aviso ativo: _"⚠️ Pivô de infra em avaliação
(09/07/2026): migração potencial para VPS Hostinger + Easypanel + Postgres puro.
Confirmar antes de agir."_ Já `docs/arquitetura/stack-e-plano-de-construcao.md:3`
diz que a arquitetura _"migrou definitivamente"_, e `infra/README.md:1` documenta
a coisa rodando em produção.
**Por que importa:** o `CLAUDE.md` é o ledger de instruções. Uma sessão nova lê
"potencial" e "confirmar antes de agir" sobre uma infra que está no ar há meses.

**I3 — Permissões que apontam para ferramentas que o projeto não usa.**
`CLAUDE.md:120` lista, entre as ações que exigem confirmação: `supabase db push`
remoto e _"criar projetos Supabase/Vercel"_ — nenhum dos dois existe na stack — e
_"provisionar VPS + Easypanel"_, que já foi feito. Na mesma linha, _"renomear
pasta/repositório (`xpect` → `iris`)"_, também já concluído.
**Por que importa:** regra de permissão que descreve operação inexistente treina
o leitor a ignorar a lista inteira.

### 12.2 Números e referências que envelheceram

**I4 — "25 entidades" × 52 tabelas.**
`CLAUDE.md:130` aponta `docs/dados/modelo-de-dados.md` como _"DDL / modelo de
dados (25 entidades)"_. O `src/db/schema.ts` declara **52** `pgTable`.
**Por que importa:** quem for planejar mudança de modelo dimensiona o impacto
pela metade.

**I5 — "R1-R19" × existe R20, e R20 é a regra de segurança.**
`CLAUDE.md:133` descreve as regras do agente de extração como _"R1-R19"_. O
`docs/agente/system-instructions.md:116` tem **R20 — ALERTA DE RISCO
OBRIGATÓRIO** (ideação suicida, autolesão, violência; _"falso positivo é
aceitável, falso negativo não"_).
**Por que importa:** de todas as regras para ficar fora do índice, essa é a pior.
Quem só ler o `CLAUDE.md` não sabe que ela existe.

**I6 — `.env.example` aponta para um arquivo que mudou de lugar.**
`.env.example:2` manda ver _"checklist de setup em `HANDOFF-FASE1.md` §5"_. O
arquivo hoje é `docs/archive/handoff-fase1.md` — não há `HANDOFF-FASE1.md` na
raiz.

**I7 — "Estado atual" do README parou em 21/08/2026.**
`README.md:74-85` descreve o estado do projeto sem mencionar nada do que veio
depois: fila pg-boss (D73), cotas de CPU/memória (#631), o pipeline de ASR
efetivamente construído (#494, migrações até a `0155`), alta clínica na
modalidade convencional (D65), expurgo off-site. E lista o ASR como "próximo
passo" quando ele tem worker, storage, sweeper, migrações e spec E2E no repo.

### 12.3 Configuração ambígua ou contraditória

**I8 — `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` significam duas coisas
no mesmo arquivo.**
Em `.env.example:47-51` esses três nomes aparecem sob o título _"Storage de áudio
(MinIO / S3) — só entra na Fase 6"_, com `S3_BUCKET=iris-audio`. Em
`.env.example:157-160` **os mesmos três nomes** reaparecem para o MinIO de
backup, com `S3_BACKUP_BUCKET=iris-backups`.
Pior: o bloco de "storage de áudio" está **morto** — o ditado usa `ASR_S3_*`, que
é outro conjunto de variáveis, com outro bucket e outra credencial.
**Por que importa:** alguém que preencher o primeiro bloco acreditando estar
configurando áudio vai, na prática, apontar o **backup** para o lugar errado. É o
tipo de erro que só aparece no dia do restore.

**I9 — A versão do Playwright em produção não é a que o repositório declara.**
`package.json` traz `"playwright": "^1.62.1"` como dependência de produção (ela é
mesmo de produção: `src/lib/report/playwright-renderer.ts` renderiza os PDFs).
Mas `infra/Dockerfile:139-143` instala **`playwright@1.61.1`** num diretório
separado e depois **substitui** `node_modules/playwright` e
`node_modules/playwright-core` por essa cópia — junto com o Chromium baixado para
a 1.61.1.
**Por que importa:** subir a versão no `package.json` não chega em produção, e o
par biblioteca↔Chromium do container é definido por um número escrito à mão no
Dockerfile. A divergência é silenciosa: CI verde, produção rodando outra coisa.

**I10 — `pnpm test:rls` não roda só RLS.**
O script é `vitest run --config vitest.integration.config.ts`, que coleta toda a
suíte de integração — no CI o piso é de **800 testes** com o rótulo _"integração"_.
O `CLAUDE.md` o apresenta como _"Testes RLS"_.
**Por que importa:** um verde nesse comando é lido como "isolamento está
provado", quando a maior parte do que rodou é outra coisa. E o inverso também:
uma falha de integração qualquer parece regressão de RLS.

**I11 — `seed:local` e `seed:clinic` são o mesmo comando.**
Ambos executam `scripts/seed-local.ts`, byte a byte. O comentário de
`playwright.config.ts` os trata como se fossem cenários diferentes.

**I12 — O E2E de ditado de voz nunca roda no CI (é a issue #501).**
O job `test-e2e` (`.github/workflows/ci.yml:216-229`) sobe **só Postgres**. Sem
MinIO e sem as envs de ASR, a condição `asrE2ePronto` do `playwright.config.ts` é
falsa, o projeto `ditado-voz` não é criado, e o `testIgnore` do projeto chromium
já exclui o spec. Resultado: **coletado zero vez**. E os pisos do gate
(`--min-tests=17 --min-files=10`, contra 20 arquivos que rodam hoje) não reprovam
se alguém apagar o spec.
**Nota sobre a própria issue #501:** o texto pede `ASR_PROVIDER=stub`, mas esse
valor não existe no domínio — qualquer coisa diferente de `self-hosted` cai no
stub. Melhor omitir a variável do que gravar um valor fictício. E o bloco
`services:` do GitHub Actions não roda comando pós-boot: criar o bucket
`iris-asr-efemero` exige um step próprio, que a issue não menciona.

### 12.4 Lacuna, não erro

**I13 — A seção "Stack Tecnológica" do `CLAUDE.md` cobre menos de metade do que
roda.** Ela lista framework, runtime, estilização, banco, auth, testes. Não
menciona: a fila (pg-boss), o MinIO, o Gemini, o ASR self-hosted, o Asaas, o
Resend, o GlitchTip, nem o fato de o Playwright ser dependência de produção. Quem
fizer onboarding só por ali não sabe que existem 14 serviços em produção.

---

## 13. O que ainda depende de decisão

As correções estão escritas e verificadas; o que sobra não é implementação.

1. **Mergear as três branches** (nenhuma foi enviada). A de CI é a única cujo
   critério de aceite só o runner do GitHub fecha: o que se mediu localmente é
   que o spec passa a ser **coletado** (`playwright test --list`, com as envs
   extraídas do próprio `ci.yml`), não que o job passe.
2. **Ratificar I1** — se a remoção do "ASR gated por DPA" reflete a posição
   jurídica pretendida.
3. **Validar a renderização de PDF** antes do deploy que carrega a mudança do
   Playwright (I9) — o Chromium muda junto.
4. **Decidir I11** — manter os dois aliases de seed ou remover um.

### Como não voltar a acumular isto

Três dos treze achados eram números escritos à mão que envelheceram em silêncio
(52 tabelas, R20, os pisos de cobertura). Os que hoje têm guard automatizado —
migrações, versão do Playwright, contagem de testes — não voltam. Os que ainda
dependem de alguém reler, voltam. Sempre que um documento afirmar um número que o
repositório também conhece, o barato é um teste que compara os dois.
