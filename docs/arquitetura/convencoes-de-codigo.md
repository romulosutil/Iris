# Convenções de código

Status: **proposto por Claude em 10/07/2026, pendente de confirmação do
Rômulo antes de iniciar a Fase 0.5.** Nenhuma destas decisões existia nos
4 documentos de especificação — `stack-e-plano-de-construcao.md` cobre
arquitetura de sistema (framework, banco, hospedagem, o que não usar), não
convenções de código no dia a dia (gerenciador de pacotes, lint, testes,
commits). Este documento preenche esse gap, encontrado ao revisar o que
faltava antes de uma sessão de Claude Code CLI poder começar a codar sem
tomar essas decisões sozinha no meio do caminho.

Qualquer item aqui pode ser trocado por decisão do Rômulo sem precisar de
justificativa adicional — são convenções, não princípios inegociáveis do
produto (esses estão em `README.md`).

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
- **RLS (crítico para LGPD, não opcional):** `pgTAP` via
  `supabase test db` — testa as policies diretamente no Postgres,
  simulando cada papel (`admin_recepcao`, `terapeuta`, `coordenador`)
  tentando acessar dado fora do escopo dele. Ver checklist LGPD mínimo
  viável em `stack-e-plano-de-construcao.md` §4 e em `AGENTS.md` §8 — "RLS
  habilitado e testado" não é satisfeito só por policies existirem no
  schema.

## Commits

**Conventional Commits em inglês** (`feat:`, `fix:`, `docs:`, `chore:`,
`refactor:`, `test:`) — convenção amplamente suportada por tooling
(changelog automático, integração com agentes de código). O corpo do
commit pode ser em português quando o contexto for de produto/negócio, já
que toda a documentação do projeto é pt-BR.

**Esta é a decisão menos óbvia deste documento — confirmar ou trocar
explicitamente antes da Fase 0.5** (ex.: trocar para português se fizer
mais sentido para um projeto solo com toda a documentação em pt-BR).

## Branches

Trunk-based simplificado: `main` sempre deployável, uma branch por fase ou
por fatia de escopo dentro da fase (ex.: `fase-0.5-design-system`,
`fase-1-cadastro-paciente`). Abrir PR mesmo em revisão solo, para manter
um histórico de diffs revisável — importante porque boa parte do código
deste projeto vai ser gerado por agentes de código, não só escrito à mão.

## Estrutura de pastas (sugestão inicial, não travada)

Ponto de partida razoável para um Next.js App Router, a ajustar livremente
na Fase 0.5:

```
app/                    # rotas (App Router)
components/              # design system (Espectro Brutal) + componentes específicos de tela
lib/                     # clientes Supabase, utils, helpers de RLS
supabase/migrations/     # DDL versionado (fonte: docs/dados/modelo-de-dados.md)
```

## Deploy

`git push` para `main` → deploy automático no Vercel (`gru1`). Migrations
de banco via Supabase CLI contra o projeto em `sa-east-1`. Sem CI/CD
elaborado, feature flags, ou infra-as-code neste momento — decisão
deliberada, ver "o que não usar agora" em
`stack-e-plano-de-construcao.md` §2.
