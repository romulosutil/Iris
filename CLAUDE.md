# CLAUDE.md — Iris

> Leia `AGENTS.md` primeiro — é o contrato operacional completo (a regra
> de 3 camadas, guardrails inegociáveis, checklist LGPD, definição de
> pronto por fase, quando parar e perguntar). Este arquivo cobre só o que
> é específico de sessões Claude Code — não duplica o que já está lá.

## Stack Tecnológica & Comandos

### Stack do Projeto

- **Framework**: Next.js 16 (App Router)
- **Runtime & UI**: Node.js >= 22, React 19, React DOM 19, TypeScript
- **Estilização**: Tailwind CSS v4, PostCSS
- **Banco de Dados**: Postgres, Drizzle ORM, drizzle-kit
- **Autenticação**: Better Auth
- **Qualidade & Testes**: ESLint, Prettier, Vitest, Playwright (E2E), Storybook

### Comandos de Desenvolvimento e Build

- Servidor de Desenvolvimento: `pnpm dev`
- Storybook local: `pnpm storybook`
- Formatar código: `pnpm format`
- Build do projeto: `pnpm build`

### Comandos de Testes e Linting

- Rodar ESLint: `pnpm lint`
- Rodar Typecheck: `pnpm typecheck`
- Rodar Testes unitários/integração: `pnpm test`
- Rodar Testes RLS: `pnpm test:rls`
- Rodar Testes E2E (Playwright): `pnpm test:e2e`

### Comandos de Banco de Dados

- Aplicar migrações locais: `pnpm db:migrate`
- Seed local limpo (clínica + 1º coordenador): `pnpm seed:local`
- Gerar migrações: `pnpm db:generate` — **⚠️ leia o bloco abaixo antes de usar.**

#### ⚠️ Migrações: como escrever sem derrubar o banco

Armadilhas reais deste repo, com incidente no histórico. Não são teoria:
a primeira era o débito **D1**, fechado pela issue #186 (o que sobrou é a
regra de quando gerar e quando escrever à mão); a segunda segue aberta
como **D2** em `BACKLOG.md`.

**1. `pnpm db:generate` voltou a funcionar — e é o caminho para mudança de
schema.** O snapshot foi reconciliado na `0078` (issue #186): hoje
`db:generate` responde `No schema changes, nothing to migrate`. Ele só
continua limpo se **toda** mudança de schema passar por ele.

A regra que separa os dois caminhos é _o que_ está sendo mudado:

- **Está em `src/db/schema.ts`** (tabela, coluna, enum, índice, FK,
  constraint) → mude o `schema.ts` e rode `pnpm db:generate`. Commite o
  `.sql` **e** o `meta/NNNN_snapshot.json` juntos. Nunca escreva esse
  tipo de DDL à mão: foi exatamente isso que dessincronizou o snapshot
  entre a `0042` e a `0077` e fez o `db:generate` propor 128 linhas
  recriando `two_factor`, `auth_throttle` e os enums de `alerta_risco`.
- **Não está no `schema.ts`** (policy de RLS, `GRANT`, função
  `SECURITY DEFINER`, trigger, view, backfill de dados) → o Drizzle não
  modela isso, então **escreva à mão** em `db/migrations/NNNN_nome.sql`,
  no estilo dos arquivos vizinhos (comentário explicando o _porquê_,
  `--> statement-breakpoint` entre statements). Isso **não** dessincroniza
  o snapshot, porque o snapshot só descreve o que vem do `schema.ts`.

Uma migração pode misturar as duas coisas: gere a parte de schema com
`db:generate` e edite o `.sql` gerado para acrescentar policies/grants —
sem tocar no snapshot.

Nota da reconciliação: as constraints criadas sem nome pelas migrações
manuais receberam o nome do Postgres (`_fkey`/`_pkey`/`_key`) e foram
renomeadas na `0078` para o padrão do Drizzle (`_fk`/`_pk`/`_unique`).
Ao escrever DDL à mão que mexa em constraint, **nomeie explicitamente**
no padrão do Drizzle, senão a divergência volta.

**2. Migração à mão exige entrada manual no `_journal.json`, com o
`when` correto.** Se o `when` for **menor ou igual** ao da última migração
já aplicada, o Drizzle **pula o arquivo em silêncio** — sem erro, sem
aviso. Use `when` = o da migração anterior **+ 1000**. Foi exatamente
assim que a `0055` (fix de isolamento cross-tenant, #128) nunca rodou em
produção e a issue foi fechada olhando o diff (#165).

**3. Verifique medindo, não lendo.** Depois de `pnpm db:migrate`, confirme
no Postgres que o objeto existe e faz o que promete — `information_schema`
para coluna/grant, `pg_proc` para função (incluindo `prosecdef`),
`pg_trigger` para trigger, e um `BEGIN … ROLLBACK` exercitando a regra.
"Está no `git log`" não é prova de que rodou.

**4. Coluna nova quase sempre precisa de `GRANT` explícito.** Várias
tabelas (`patient` na `0044`, `app_user`/`clinic` na `0057`) tiveram o
`UPDATE` de tabela revogado e recebem privilégio **coluna a coluna**. Um
grant faltando aparece como `permission denied for table X`, que não diz
qual coluna — diagnóstico caro.

**5. Escrita fora do que a RLS permite vai de `SECURITY DEFINER`, não de
policy nova.** Afrouxar uma policy abre todas as colunas mutáveis de uma
vez. E lembre: um `UPDATE` barrado por RLS **afeta 0 linhas em silêncio**,
não estoura — o código parece funcionar. Sendo DEFINER, o guard interno
**é** a fronteira de autorização: copie o predicado _exato_ da policy de
leitura correspondente (precedentes: `0048`, `0064`, `0067`).

## Onboarding de uma sessão nova (sem memória desta conversa)

Ordem de leitura recomendada para uma sessão Claude Code CLI começando do
zero — é literalmente o desenho do `HANDOFF-FASE1.md`, formalizado aqui:

1. Este arquivo + `AGENTS.md`.
2. `HANDOFF-FASE1.md` — briefing de início de construção, decisões de
   arquitetura já travadas, escopo exato da fase em construção agora.
3. `README.md` — os 8 princípios inegociáveis do produto + mapa completo
   de toda a documentação (`docs/**`).
4. `docs/arquitetura/stack-e-plano-de-construcao.md` — stack, plano de
   fases (0.5 a 6), checklist LGPD mínimo viável.
5. Os documentos específicos da fase em construção (ver mapa em
   `README.md` — ex.: `docs/dados/modelo-de-dados.md` +
   `docs/ux/fluxos-e-wireframes.md` para a Fase 1).

Se uma dúvida já tem resposta em algum desses documentos, a resposta é
ler o documento — não pedir para o Rômulo reexplicar.

## Como esta sessão deve operar

- Use o task list (todo) para qualquer trabalho de mais de 2-3 passos.
  Trate a "Definição de pronto por fase" (`AGENTS.md` §6) como checklist
  de verificação antes de marcar uma fase como concluída, não como
  opinião.
- Use plan mode antes de qualquer mudança que toque modelo de dados, RLS,
  ou o schema de saída do agente de extração
  (`docs/agente/output-schema.json`) — são as três coisas mais caras de
  errar retroativamente neste projeto: dado de menor, isolamento
  multi-tenant, contrato do agente de IA.
- Ao final de qualquer sessão de trabalho com decisão nova, gap
  encontrado, ou item resolvido: atualizar `BACKLOG.md` antes de encerrar
  (regra permanente do projeto, ver `AGENTS.md` §10) — não deixar o
  backlog defasado em relação ao que foi decidido na sessão.
- Documentação e copy de produto sempre em pt-BR (todo o projeto já é
  escrito assim). Convenção de commits proposta em inglês — ver
  `docs/arquitetura/convencoes-de-codigo.md` (ainda não confirmada pelo
  Rômulo).
- Ao propor uma decisão nova de arquitetura ou produto (como este próprio
  arquivo fez com convenções de código), marcá-la explicitamente como
  proposta pendente de confirmação — nunca apresentar como travada sem
  ter sido validada com o Rômulo.

## Permissões — o que rodar livremente vs. o que confirmar antes

**Rodar livremente:** lint, testes, build local, Storybook, criar branch,
rodar/ler migrations locais (Drizzle/dbmate contra Postgres local), `pnpm install`.

**Confirmar com o Rômulo antes:** `supabase db push` contra o projeto
remoto; qualquer DDL que altere tabela que já tenha dado (mesmo que seja
só dado de teste — para criar o hábito certo desde já); qualquer mudança
em `docs/legal/`; deletar ou reescrever migrations já commitadas; qualquer
chamada real à API da Anthropic/Google antes da Fase 3; renomear a
pasta/repositório (`xpect` → `iris`) ou criar os projetos
Supabase/Vercel — são decisões de infraestrutura de uma via só.

> ⚠️ **Pivô de infra em avaliação (09/07/2026):** a hospedagem pode migrar de
> Vercel/Supabase gerenciado para **VPS Hostinger + Easypanel + Postgres puro**
> (não Supabase; auth in-app + MinIO). Antes de qualquer ação de infra, ler
> `docs/arquitetura/plano-bootstrap-e-stack-vps.md` (proposta). "Provisionar
> VPS + Easypanel" entra na mesma categoria "confirmar antes / via única".

## Onde procurar o quê (atalho — mapa completo está em README.md)

| Preciso de...                                              | Arquivo                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Escopo exato da fase atual                                 | `HANDOFF-FASE1.md`                                                     |
| DDL / modelo de dados (25 entidades)                       | `docs/dados/modelo-de-dados.md`                                        |
| Telas e wireframes da fase                                 | `docs/ux/fluxos-e-wireframes.md`                                       |
| Tokens e os 3 componentes do design system                 | `docs/ux/design-system-espectro-brutal.md`                             |
| Regras do agente de extração (R1-R19)                      | `docs/agente/system-instructions.md`, `docs/agente/output-schema.json` |
| Regras do agente de relatório à família (F1-F9)            | `docs/agente/agente-2-relatorio-familia.md`                            |
| Regras de validação/reclassificação do coordenador (V1-V5) | `docs/governanca/validacao-coordenador.md`                             |
| O que ainda falta / decisões abertas                       | `BACKLOG.md`                                                           |
| Convenções de código (proposta, a confirmar)               | `docs/arquitetura/convencoes-de-codigo.md`                             |
| Variáveis de ambiente                                      | `.env.example`                                                         |
