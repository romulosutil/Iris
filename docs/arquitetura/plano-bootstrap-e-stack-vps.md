# Plano de Bootstrap + Redefinição de Stack (VPS/Easypanel)

> **STATUS: CONFIRMADO & EXECUTADO.** Este documento
> redefine decisões de infraestrutura a partir da mudança de premissa
> "VPS no Easypanel (Hostinger)" no lugar de Vercel + Supabase gerenciado.
> Não substitui `stack-e-plano-de-construcao.md`; **corrige** a camada de
> hospedagem/deploy dele. As fatias verticais (Fases 0.5→6) e o modelo de
> dados permanecem intactos.

Criado: 09/07/2026. Contexto: init do impeccable + leitura completa da doc.

---

## 0. O que muda e o que NÃO muda com o pivô

**NÃO muda (permanece exatamente como spec'd):**

- Modelo de dados, DDL, event-sourcing da timeline (`modelo-de-dados.md`).
- **RLS multi-tenant** — é Postgres nativo, roda em qualquer Postgres,
  gerenciado ou self-hosted. Sobrevive ao pivô — só troca a origem do
  identificador de tenant de `auth.uid()` (GoTrue) para uma session variable
  setada pela app (`app.user_id`), ver seção 2. Custo zero: é greenfield.
- Plano de fases 0.5→6, escopo por fase, definição de pronto.
- Design system (Fase 0.5) — não toca infra de dados; pode ser construído
  local enquanto o VPS é provisionado em paralelo.
- Agente de extração (Claude API externa), schema de saída.

**Muda (camada de infra):**

- Hospedagem: Vercel `gru1` serverless → **1 VPS Hostinger + Easypanel**.
- Deploy: git-push→Vercel → git-push→Easypanel (GitHub integration).
- **Docker volta ao escopo** (Easypanel é Docker Swarm; Next precisa de
  Dockerfile). Reverte a decisão "sem containers" do `stack §2`.
- Banco/Auth/Storage: Supabase gerenciado → **Postgres puro + Better-Auth in-app
  - MinIO** (seção 2).
- Backup/restore, segurança do SO, TLS: agora **responsabilidade nossa**.
- Observabilidade: Sentry SaaS → avaliar GlitchTip self-host (LGPD).

---

## 1. Stack redefinida (decisões de tech lead)

| Camada          | Antes (serverless)       | Agora (VPS/Easypanel)                                 | Nota                                       |
| --------------- | ------------------------ | ----------------------------------------------------- | ------------------------------------------ |
| Host            | Vercel `gru1`            | VPS Hostinger + Easypanel (Docker Swarm)              | Região SP **medida** (27/07/26 — ver §Stack) |
| App web         | Next.js (serverless)     | Next.js `output: 'standalone'` em container           | Multi-stage Dockerfile                     |
| Build/deploy    | Vercel auto              | Easypanel GitHub source + **Dockerfile builder**      | Dockerfile > Nixpacks (reprodutível)       |
| Banco           | Supabase Postgres        | **Postgres puro** (template Easypanel)                | RLS nativo via session GUC (`app.user_id`) |
| Auth            | Supabase Auth (GoTrue)   | **Better-Auth in-app** (lib, sem container) + MFA/2FA | decidido                                   |
| Storage áudio   | Supabase Storage         | **MinIO** (S3-compatível, template Easypanel)         | swappável p/ S3 real                       |
| Migrations/ORM  | Supabase CLI → sa-east-1 | **Drizzle** (schema TS + migrações SQL) → Postgres    | pgTAP via `pg_prove`                       |
| TLS/domínio     | Vercel                   | Traefik interno do Easypanel + Let's Encrypt          | `irisclinica.ia.br` → IP do VPS            |
| Observabilidade | Sentry free              | **GlitchTip self-host** (recomendado) ou Sentry free  | traces podem ter dado de menor             |
| LLM extração    | Claude API               | Claude API (inalterado)                               | DPA Anthropic ainda necessário             |

### VPS — dimensionamento

Com Postgres puro (decisão da seção 2), a stack é enxuta: **Postgres + MinIO +
App Next** (+ Storybook estático + GlitchTip opcional). Sem os ~10 containers do
Supabase self-hosted. Recomendo **mínimo KVM 2 (2 vCPU / 8 GB)**; **KVM 4
(16 GB)** confortável se GlitchTip self-host entrar. (Se um dia optarmos pelo
Supabase self-hosted completo, aí sim KVM 4/8 seriam obrigatórios.)

---

## 2. Decisão-chave: Postgres puro vs. Supabase self-hosted — RESOLVIDO

**Decisão (09/07/2026): Postgres puro.** "Supabase" não é um banco — é Postgres

- ~9 serviços (GoTrue/Auth, PostgREST, Realtime, Storage, Kong, Studio, meta,
  imgproxy). Iris usa Postgres+RLS de verdade; o resto é opcional ou peso morto
  num monólito Next.js.

**Ponto de arquitetura decisivo:** Iris é monólito Next.js — o navegador nunca
fala com o Postgres direto, fala com o Next (Server Actions/Components). Todo o
valor que o Supabase otimiza (PostgREST, JWT no cliente, `auth.uid()` avaliado
no DB para acesso client-direto) **não é usado** aqui. Subir 10 containers para
usar 1 contraria "poucas peças móveis".

O argumento que antes favorecia Supabase self-hosted ("não reescrever as
políticas RLS que usam `auth.uid()`") **não se aplica: é greenfield, não há RLS
escrito.** Escrevemos do jeito certo desde o dia 1, custo zero.

### Como o RLS funciona sem GoTrue

Em vez de `auth.uid()` (função do GoTrue), a app seta o contexto de tenant na
conexão antes de cada query, e as políticas leem uma session variable:

```sql
-- app (server-side), por requisição autenticada:
SET LOCAL app.user_id   = '<uuid do usuário>';
SET LOCAL app.clinic_id = '<uuid da clínica>';

-- política RLS:
USING (clinic_id = current_setting('app.clinic_id')::uuid)
```

Enforced no banco, igual ao modelo original. Só troca a origem do identificador.
Encapsulado num helper único (`src/db/rls.ts`) que abre a conexão e seta o GUC —
nenhuma query de produto roda sem passar por ele.

### Componentes que substituem o Supabase

- **Auth (DECIDIDO):** **Better-Auth** — TS-native, plugin de MFA/2FA e de
  organização multi-tenant, adapter Postgres, roda dentro do Next (zero
  container). Não hand-rollar cripto em app de saúde.
- **Storage áudio:** **MinIO** (S3-compatível, template Easypanel), swappável
  para S3/R2 real depois sem trocar código de aplicação.
- **Migrations/ORM (DECIDIDO):** **Drizzle** — schema TS type-safe + migrações
  SQL versionadas (casa com TS strict + RLS multi-tenant). RLS, triggers e
  event-sourcing escritos em SQL cru dentro das migrações.
- **pgTAP:** roda via `pg_prove` num container/CI, sem depender do Supabase CLI.

### Custo honesto assumido

Auth com MFA passa a ser nossa responsabilidade (o GoTrue daria pronto). Mitigado
por usar biblioteca madura, não implementação própria. É superfície de segurança
a tratar com cuidado (revisão + testes), aceitável para o ganho de simplicidade.

**Escape hatch:** se um dia precisarmos de Realtime ou de expor API de dados a um
cliente externo, dá pra adicionar PostgREST/Realtime como containers avulsos
contra o mesmo Postgres — sem virar Supabase inteiro.

---

## 3. Impactos LGPD do pivô (bloqueadores de dado real)

O checklist LGPD (`stack §4`) muda de dono em vários pontos:

1. **Residência BR — BLOQUEADOR.** "Hospedagem BR confirmada" agora depende do
   VPS estar fisicamente em SP. Hostinger cobre América do Sul mas a página não
   garante SP nominalmente. **Confirmar no checkout antes de comprar.** Sem SP,
   o pivô inteiro fica inviável para dado real de menor.
2. **Backup/restore — agora nosso.** Era gerenciado pela Supabase. Precisa:
   `pg_dump` agendado (cron/container), destino do backup **também em BR**,
   e **restore testado de verdade** (já era exigência do checklist, agora com
   mais superfície). Vira item de infra novo.
3. **DPA:** cai o DPA da Supabase (deixa de ser sub-processadora — nós
   hospedamos). Somam DPA Hostinger + DPA Anthropic. Simplifica de um lado.
4. **Segurança do SO agora é nossa:** firewall, SSH hardening (sem senha, só
   chave), updates de kernel/pacotes, fail2ban. Easypanel ajuda no app, não no SO.
5. **Single VPS = SPOF.** Sem HA/réplica. Aceitável para piloto; flag para
   pós-MVP escalar.

---

## 4. Arquitetura de arquivos/pastas (proposta de arquiteto)

A proposta flat de `convencoes-de-codigo.md` (`app/ components/ lib/`) não escala
para 28 componentes × 6 fases + RLS multi-tenant + 3 tipos de teste. Estrutura
**feature-first** (organiza por domínio, não por tipo de arquivo), com o design
system e a camada de dados isolados:

```
iris/
├─ src/
│  ├─ app/                     # App Router: rotas, layouts, server actions
│  │  ├─ (auth)/               # login, MFA — grupo sem app-shell
│  │  ├─ (clinico)/            # terapeuta + coordenador (app-shell)
│  │  └─ api/                  # route handlers (webhook de extração, etc.)
│  ├─ components/
│  │  └─ ui/                   # DESIGN SYSTEM "Espectro Brutal" — Botão, Card,
│  │                          #   Alerta... Storybook aponta aqui. Regra
│  │                          #   anti-hardcode (HANDOFF §0) mora nesta fronteira.
│  ├─ features/               # 1 pasta por domínio: pacientes, agenda, metas,
│  │  └─ <feature>/           #   diario, extracao, evidencias, coordenador...
│  │     ├─ actions.ts        #   server actions
│  │     ├─ queries.ts        #   leitura (via db/rls)
│  │     ├─ schema.ts         #   validação Zod da feature
│  │     └─ components/       #   componentes de tela compostos (consomem ui/)
│  ├─ db/
│  │  ├─ schema/              # schema das entidades (Drizzle, se adotado)
│  │  ├─ client.ts           # pool de conexão Postgres
│  │  └─ rls.ts              # helper ÚNICO que seta app.user_id/clinic_id (GUC)
│  ├─ auth/                   # config Better-Auth, middleware, MFA
│  ├─ lib/                    # utils puros, sem estado nem I/O
│  └─ styles/                 # tailwind globals + tokens CSS (data-mode)
├─ db/
│  ├─ migrations/             # SQL versionado: DDL + policies RLS + triggers
│  │                         #   (fonte: docs/dados/modelo-de-dados.md)
│  └─ tests/                  # pgTAP (RLS por papel — pg_prove)
├─ infra/
│  ├─ Dockerfile              # Next standalone, multi-stage
│  ├─ docker-compose.yml      # dev local: postgres + minio + app (paridade)
│  └─ easypanel/              # notas de config dos serviços (não-secreto)
├─ .storybook/                # config Storybook
├─ tests/e2e/                 # Playwright
├─ public/
├─ tailwind.config.ts         # fonte única dos tokens
├─ .env.example               # expandir: DATABASE_URL, MINIO_*, AUTH_SECRET...
├─ .gitignore  .dockerignore  .claudeignore
```

**Decisões de arquitetura embutidas:**

- **`src/`** mantém a raiz limpa (só config + infra).
- **`features/`** feature-first > type-first: cada domínio é uma fatia coesa,
  fecha bem com o plano de fases (cada fase entrega 1-2 features).
- **`components/ui/` isolado** é a fronteira que faz cumprir "toda tela consome
  o design system, nunca estiliza direto" (HANDOFF §0). Storybook vive só aqui.
- **`db/rls.ts` como gargalo único** do contexto de tenant: nenhuma query roda
  sem passar por ele → o isolamento multi-tenant vira invariante estrutural, não
  disciplina caso a caso.
- **`db/migrations` e `db/tests` na raiz** (não em `src/`): não são runtime da
  app, são rodados por CLI/CI.
- **`infra/` concentra tudo de container**, fora do código de aplicação.

**Ignores (resumo):**

- `.gitignore`: `node_modules/`, `.next/`, `.env*` (menos `.env.example`),
  `*.log`, dumps/backups locais, `.DS_Store`, `*.original.md` (backups caveman).
- `.dockerignore`: tudo do `.gitignore` + `docs/`, `.claude/`, `.git/`, `*.md`,
  `tests/`, `.storybook/` — imagem enxuta (só o runtime da app).
- `.claudeignore`: `node_modules/`, `.next/`, `dist/`, `*.original.md`,
  `db/backups/`, dumps — não gastar contexto lendo lixo gerado.

---

## 5. Pipeline de deploy (Easypanel)

1. `git push` → GitHub → Easypanel GitHub integration (auto-deploy on push
   na branch `main`).
2. Easypanel builda via **Dockerfile** → troca o container (rolling via Swarm).
3. Migrations: rodadas via a ferramenta de migração (Drizzle/dbmate) apontando
   pro Postgres do VPS via `DATABASE_URL` — passo manual controlado, **não**
   automático no deploy (dado clínico não migra sozinho).
4. Storybook: serviço estático separado no Easypanel (`storybook build` →
   pasta estática) com Password Protection.
5. **Preview por PR:** Easypanel não tem preview-per-PR nativo (Vercel tinha).
   Mitigação: um serviço `staging` fixo apontando pra branch de fase, ou build
   manual. Flag — é uma perda de DX real do pivô.

---

## 6. Checklist de revisão — TRAVAR antes da Fase 0.5

Estado da revisão (atualizado 09/07/2026):

**Stack — TODAS RESOLVIDAS (09/07/2026):**

- [x] VPS Hostinger região **SP** — CONFIRMADO (residência LGPD ok).
      **Evidência medida em 27/07/2026** (antes disso o `[x]` não tinha prova
      registrada em lugar nenhum do repo, e a linha 45 desta mesma tabela ainda
      dizia "a confirmar" — contradição resolvida aqui):
      - `irisclinica.ia.br` → `31.97.170.105`; geolocalização por duas fontes
        independentes: São Paulo/BR, AS47583 Hostinger International Limited.
      - **RTT 33 ms** do Brasil. Baseline São Paulo (NIC.br) 24 ms; baseline
        Europa (Hetzner/DE) **231 ms**. Brasil↔Europa tem piso físico de
        ~210 ms em fibra — 33 ms exclui qualquer datacenter fora da América do
        Sul. Latência é a única prova que geolocalização de IP não falsifica.
      - `tracert`: último salto via `200.25.x` (backbone BR), ~30 ms constante.
      > ⚠️ **Não confundir com o domicílio societário.** A *Hostinger
      > International Ltd* é pessoa jurídica estrangeira (aparece como
      > Lituânia/Chipre em fatura e no DPA). O **dado** está em São Paulo; a
      > **empresa** não é brasileira. São coisas distintas e só a primeira está
      > provada aqui — ver a issue de DPA da Hostinger no GitHub.
- [x] Banco: **Postgres puro** (não Supabase) — ver seção 2.
- [x] Estrutura de pastas feature-first (seção 4).
- [x] Tier do VPS: **KVM 4 (4 vCPU / 16 GB)** — confortável, comporta GlitchTip.
      Piso absoluto KVM 2 (8 GB).
- [x] Auth: **Better-Auth** (MFA/2FA + org multi-tenant in-app, adapter Postgres).
- [x] Migrations/ORM: **Drizzle** (schema TS type-safe + migrações SQL; RLS em
      SQL cru dentro das migrações).
- [x] Observabilidade: **GlitchTip self-host** (LGPD — traces com dado de menor).
- [x] Preview-per-PR: **aceitar a perda** no MVP; montar serviço `staging` fixo
      no Easypanel só se/quando a necessidade aparecer.

**Convenções — TODAS RESOLVIDAS:**

- [x] Commits: **Conventional Commits em português** (`feat: adiciona cadastro
de paciente`).
- [x] Estrutura de pastas — feature-first (seção 4).
- [x] **pnpm via corepack.**
- [x] **TypeScript strict + ESLint + Prettier + Husky + lint-staged.**
- [x] Testes: **Vitest** (unit/componente) + **Playwright** (E2E) + **pgTAP**
      via `pg_prove` (RLS por papel).

---

## 7. Sequência de execução (revisada)

1. **Revisar+travar** seção 6 (este passo).
2. **Provisionar** (via única, Rômulo): comprar VPS Hostinger SP → instalar
   Easypanel → subir templates **Postgres + MinIO** (+ GlitchTip opcional). Pode
   rodar em **paralelo** ao passo 3.
3. **Bootstrap local:** `git init` (se ainda não), scaffold Next.js, tailwind,
   tsconfig strict, ESLint/Prettier/Husky, Dockerfile, os 3 ignores, expandir
   `.env.example`.
4. **Fase 0.5 (DS):** Storybook + tokens no `tailwind.config.ts` + 3 componentes
   base. **Não precisa do VPS** — feito local, publicado depois.
5. **Deploy pipeline:** conectar GitHub↔Easypanel, primeiro deploy do app +
   Storybook.
6. **Fase 1:** DDL das 10 tabelas + RLS testado + telas de cadastro.

DS (passo 4) e provisionamento (passo 2) são paralelizáveis — o caminho crítico
não espera o VPS pra começar a codar o design system.
