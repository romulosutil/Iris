# Convenções de código

Status: **CONFIRMADAS pelo Rômulo em 09/07/2026** (commits em pt-BR; pnpm/
corepack, TS strict, ESLint+Prettier+Husky, Vitest+Playwright+pgTAP). Estrutura
de pastas e camada de deploy/dados foram substituídas pelo
`plano-bootstrap-e-stack-vps.md` (feature-first + Postgres puro + Easypanel). Nenhuma destas decisões existia nos
4 documentos de especificação — `stack-e-plano-de-construcao.md` cobre
arquitetura de sistema (framework, banco, hospedagem, o que não usar), não
convenções de código no dia a dia (gerenciador de pacotes, lint, testes,
commits). Este documento preenche esse gap, encontrado ao revisar o que
faltava antes de uma sessão de Claude Code CLI poder começar a codar sem
tomar essas decisões sozinha no meio do caminho.

Qualquer item aqui pode ser trocado por decisão do Rômulo sem precisar de
justificativa adicional — são convenções, não princípios inegociáveis do
produto (esses estão em `README.md`).

> ⚠️ **Atualização 09/07/2026 (CONFIRMADA & INCORPORADA):** o pivô de hospedagem para **VPS/Easypanel**
> (ver [`plano-bootstrap-e-stack-vps.md`](plano-bootstrap-e-stack-vps.md))
> **adiciona Docker ao escopo** e uma pasta `infra/` (Dockerfile,
> docker-compose, `.dockerignore`) + `.claudeignore` à estrutura de pastas
> implementada. Deploy deixa de ser Vercel-automático e passa a Easypanel
> (GitHub source + Dockerfile builder).

## Gerenciador de pacotes

**pnpm** (via `corepack`). Motivo: compatibilidade nativa com Vercel,
instalação mais rápida, menor uso de disco, lockfile determinístico.
Alternativa aceitável sem custo real: **npm**, se preferir zero-config.
Não introduzir yarn — não há motivo para um terceiro gerenciador no
projeto.

## TypeScript

Modo **strict** (`"strict": true` no `tsconfig.json`), sem `any`
implícito. Motivo específico deste projeto: o modelo de dados tem 25
entidades e RLS multi-tenant (`docs/dados/modelo-de-dados.md`) — um erro
de tipo em campos como `clinic_id`/`patient_id` é exatamente a classe de
bug que vaza dado entre clínicas diferentes.

## Lint e formatação

ESLint com `eslint-config-next` (já inclui regras de React, Next.js e
acessibilidade — reforça os critérios de acessibilidade do próprio design
system) + Prettier para formatação. Rodar em pre-commit via Husky +
lint-staged, para nunca commitar código quebrando lint.

## Testes

- **Unitário / componente:** Vitest — nativo ESM, rápido, integra bem com
  Next.js e com o Storybook da Fase 0.5.
- **E2E:** Playwright — necessário de qualquer forma para validar o fluxo
  completo do `addon-a11y` do Storybook (Fase 0.5) e para os fluxos
  críticos ponta a ponta (Fase 1: cadastro administrativo → clínico →
  protocolo → agenda).
- **RLS (crítico para LGPD, não opcional):** `pnpm test:rls` (via
  Vitest contra banco PostgreSQL real, simulando papéis restritos `iris_app`
  sob `app_clinic_id_exigido()` e `user_role`). Ver checklist LGPD mínimo
  viável em `stack-e-plano-de-construcao.md` §4 e em `AGENTS.md` §2 — "RLS
  habilitado e testado" não é satisfeito só por policies existirem no
  schema.

## Commits

**Conventional Commits em português** (decidido 09/07/2026). Prefixos padrão
mantidos (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`) pela
compatibilidade com tooling (changelog automático), mas o texto é em pt-BR —
alinhado com toda a documentação do projeto e com o dono solo.
Ex.: `feat: adiciona cadastro clínico de paciente`,
`fix: corrige política RLS de acesso do coordenador`.

## Branches

Trunk-based simplificado: `main` sempre deployável, uma branch por fase ou
por fatia de escopo dentro da fase (ex.: `fase-0.5-design-system`,
`fase-1-cadastro-paciente`). Abrir PR mesmo em revisão solo, para manter
um histórico de diffs revisável — importante porque boa parte do código
deste projeto vai ser gerado por agentes de código, não só escrito à mão.

## Estrutura de pastas (sugestão inicial, não travada)

> ⚠️ **SUPERSEDED (09/07/2026):** esta estrutura flat foi substituída pela
> estrutura **feature-first** de `plano-bootstrap-e-stack-vps.md` §4 (com
> `src/`, `features/`, `db/`, `infra/`, e `components/ui/` para o design
> system). Não há mais `supabase/` nem "clientes Supabase" — é Postgres puro
> (§2 daquele plano). Use a estrutura do plano como fonte.

Estrutura antiga (histórica), substituída:

```
app/                    # rotas (App Router)
components/              # design system + componentes de tela
lib/                     # utils, helpers de RLS
supabase/migrations/     # (obsoleto — ver db/migrations no plano)
```

## Deploy

> ⚠️ **SUPERSEDED (09/07/2026):** não é mais Vercel/Supabase CLI. Deploy passa a
> ser **Easypanel** (GitHub source + Dockerfile builder) e migrations via
> Drizzle/dbmate contra o Postgres do VPS. Fonte: `plano-bootstrap-e-stack-vps.md`
> §5. Texto antigo abaixo mantido só como histórico.

`git push` para `main` → deploy automático no Vercel (`gru1`). Migrations
de banco via Supabase CLI contra o projeto em `sa-east-1`. Sem CI/CD
elaborado, feature flags, ou infra-as-code neste momento — decisão
deliberada, ver "o que não usar agora" em
`stack-e-plano-de-construcao.md` §2.
