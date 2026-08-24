# Spec — #277 · Postura de segurança da equipe da clínica

> **Origem**: `/tlc-spec-driven` sobre a #277, sessão de Design (Claude/Opus, 24/08/2026).
> **Status**: ratificada pelo Rômulo no comentário de 24/08/2026 04:34 UTC da [issue #277](https://github.com/romulosutil/Iris/issues/277); registro em `BACKLOG.md:2330`.
> **Rota**: `/(app)/clinica/seguranca`
> **Desdobramentos**: #453 (trilha de auditoria, A5) e #454 (Termo de Governança, A6).

Transcrição literal da spec aprovada. Esta é a Definição de Pronto do PR #448 — o que estava antes neste diretório era uma spec paralela, escrita durante a execução, que contradizia a ratificada.

---

# `/tlc-spec-driven` — Spec de execução (Design fechado)

Sessão de Design (Claude/Opus, 24/08/2026). Leitura de código feita: `src/app/(app)/clinica/*`, `src/app/(app)/equipe/*`, `src/auth/tenant.ts`, `src/auth/mfa-gate.ts`, `db/migrations/0001,0002,0046,0047,0057,0072,0085`. Escopo **Medium** (spec + tarefas explícitas abaixo; sem `design.md` separado).

O levantamento derrubou duas das três entregas propostas e mudou o significado da terceira. Leia os achados antes das tarefas — sem eles a implementação afirma uma coisa falsa na tela.

---

## 1. Achados que reescrevem a issue

### A1 — A rota proposta não existe, e o lugar certo já é coordenador-only

Não há `/(app)/configuracoes/*` no repo. O agrupamento equivalente é `/(app)/clinica/*` (`dados`, `feriados`, `emergencia`), cujo `layout.tsx` já faz `requireRole(ctx, "coordenador")` com `notFound()` no catch e já renderiza um `TabsNav`.

**Decisão:** a tela nasce como **`/(app)/clinica/seguranca`**, quarta aba do `TabsNav` existente. Não criar grupo `configuracoes`. Não repetir o `requireRole` na página — o layout é o dono da autorização (mas ver T5: o teste não pode depender disso para provar isolamento).

### A2 — MFA é hard-enforced; "quantos ativaram 2FA" é sempre 100%

`src/auth/tenant.ts:170`:

```ts
const clinico = r.ctx.role === "terapeuta" || r.ctx.role === "coordenador";
if (clinico && !r.ctx.mfaEnrolled && !bypass) redirect("/mfa/setup");
```

Papel clínico sem 2FA **não entra no app** — é desviado ao setup. Logo, entre terapeutas que usam o sistema, a métrica "ativaram 2FA" é estruturalmente constante em 100%. Um painel escrito como `7 de 9 terapeutas ativaram 2FA` afirmaria um risco que não existe.

O que `app_user.two_factor_enabled = false` realmente identifica: **convite provisionado que nunca foi ativado**. `src/app/(app)/equipe/convidar/logic.ts` chama `provisionUser` e cria o `user_role` na hora, com senha temporária enviada por e-mail. Até o primeiro login + setup de MFA, a linha existe com a flag em `false`.

É um sinal melhor que o proposto, e acionável pelo coordenador — mas é **outro** sinal. A copy tem que dizer *ativação pendente*, não *terapeuta sem segundo fator*.

### A3 — `admin_recepcao` é a exceção real, e a query existente a exclui

O gate de MFA cobre só `terapeuta` e `coordenador`. **`admin_recepcao` usa o app sem MFA obrigatório.** Para esse papel, `two_factor_enabled = false` significa literalmente "está operando sem segundo fator" — categoria distinta de "convite pendente".

E `listarTerapeutas` (`src/app/(app)/equipe/[id]/queries.ts:8`) filtra `inArray(userRole.papel, ["terapeuta","coordenador"])` — recepção fica de fora. A query nova **não** pode reusar essa.

### A4 — O ponto 2 da issue original cai: não há `SECURITY DEFINER` a escrever

A issue supôs que ler o estado de 2FA obrigaria a tocar a tabela `two_factor`. Não obriga. `two_factor` é credencial (`REVOKE ALL ON two_factor FROM app_role`, `0047:23`) e continua intocada. O sinal está na coluna `app_user.two_factor_enabled` (`0047:8`), e a policy `app_user_read` (`0002:35`, reescrita em `0085:113`) já entrega ao `app_role` as linhas dos colegas da clínica ativa:

```sql
USING (EXISTS (SELECT 1 FROM user_role r
  WHERE r.user_id = app_user.id AND r.clinic_id = app_clinic_id_exigido()))
```

É exatamente o que `listarTerapeutas` usa hoje para ler `name`/`email` dos colegas. **Nenhuma função `SECURITY DEFINER` nova. Nenhuma migração de policy.** O critério "nenhuma leitura nova fora da fronteira de tenant sem guard verificado em `pg_proc`" é satisfeito por não haver leitura fora da fronteira.

O único fato de infra que faltava — se o `app_role` tem privilégio na coluna nova — foi **medido nesta sessão**, não deduzido. Ver T0: passa. **Nenhuma migração nesta issue.**

### A5 — O atalho para auditoria não tem destino

`audit_log` tem policy de leitura coordenador-only (`0046:11`) e a view `audit_log_mascarado` para recepção. Mas a varredura de `src/` mostra **apenas escrita** — nenhuma leitura, nenhuma tela. O "atalho" da proposta apontaria para o vazio.

**Decisão: fora do escopo desta issue.** Construir a tela de trilha é trabalho próprio (query paginada, mascaramento por papel, tradução de `acao`/`entidade` para linguagem humana, retenção). Abrir issue separada. **Não** renderizar link morto nem "em breve".

### A6 — O "Termo de Governança e Criptografia" não existe

`docs/legal/` tem 16 documentos; nenhum é esse. Criar documento jurídico exige confirmação do Rômulo (`CLAUDE.md`, seção de permissões).

**Decisão: fora do escopo.** Sem artefato, não há download.

### Escopo final

O painel entrega **uma** coisa: o estado de ativação de segurança da equipe da clínica. As outras duas entregas viram issues separadas. Melhor que três cards em que dois não fazem nada.

---

## 2. Decisões fechadas (checklist `AGENTS.md` §5.2)

**1. Limites e condição de parada.** Não há polling, retry, timeout nem loop. A página é um Server Component com uma leitura por render. Sem paginação: a equipe de uma clínica cabe numa tela; se passar de 50 linhas, ainda renderiza tudo — não introduzir paginação nesta issue.

**2. Dono único de cada leitura.** `page.tsx` é o único que lê. Chama `carregarPosturaSeguranca(ctx)` uma vez e passa o resultado por prop aos componentes de apresentação. Nenhum componente filho busca dado próprio.

**3. Decisões de produto/UX, fechadas.**

- **Granularidade: nominal**, não agregada. O coordenador precisa saber a quem cobrar. Confirma o recomendado da issue.
- A tela mostra **três grupos**, nesta ordem, e cada um só aparece se tiver ao menos um membro:
  1. **`Sem segundo fator`** — papel `admin_recepcao` com `two_factor_enabled = false`. Severidade de atenção. Copy: *"Opera o sistema sem segundo fator. O MFA não é obrigatório para recepção."*
  2. **`Ativação pendente`** — papel `terapeuta`/`coordenador` com `two_factor_enabled = false`. Copy: *"Convidado, mas ainda não fez o primeiro acesso. A senha temporária continua válida."* **Não** escrever "não ativou o 2FA" — ver A2.
  3. **`Protegidos`** — `two_factor_enabled = true`, qualquer papel. Renderizado como **contagem apenas** (`6 membros com segundo fator ativo`), sem lista nominal. Listar nominalmente quem está em conformidade não serve a nenhuma ação do coordenador e amplia a exposição de estado de segurança alheio sem ganho.
- **Cabeçalho da tela:** linha de resumo com a contagem total (`N de M membros com segundo fator ativo`). É o número que o coordenador copia quando um convênio pergunta.
- **O estado de sucesso é permanente, não transiente.** Se os grupos 1 e 2 estiverem vazios, renderizar `Alert` de sucesso: *"Toda a equipe está com segundo fator ativo."* Não é toast; é o estado da tela.
- **Nada nesta tela muda estado.** Sem botão de "forçar MFA", sem reenvio de convite, sem revogação. Somente leitura. Ação é outra issue e outra decisão de produto.

**4. Casos de borda, por nome.**

- **Clínica com um único membro (o próprio coordenador).** Renderiza normalmente: `1 de 1`, grupo Protegidos. Sem tratamento especial.
- **Lista vazia.** Impossível por construção (o coordenador que abre a tela é membro e aparece nela). Se a query voltar vazia, é falha — ver o item seguinte, não empty state.
- **Falha na leitura.** **Não** capturar a exceção e renderizar lista vazia. Uma tela de postura de segurança que mostra "tudo certo" porque a query estourou é afirmação falsa. Deixar a exceção propagar para o `error.tsx` do App Router; se o arquivo-alvo exigir tratamento local, renderizar `Alert` de erro explícito. (Memória `erro-renderizado-como-empty-state`.)
- **`BYPASS_MFA_FOR_DEV=true`.** Em dev, papéis clínicos com a flag em `false` entram no app sem setup — a tela vai listá-los em "Ativação pendente", e isso está correto (o estado do banco é esse). Não ler a env var na tela nem tentar compensar.
- **Membro com dois papéis na mesma clínica.** `user_role` permite. Agregar por `app_user.id` (mesmo idioma do `selectDistinct` de `listarTerapeutas`) e classificar pelo papel **mais restritivo em MFA**: se algum papel for clínico, cai em "Ativação pendente", não em "Sem segundo fator".
- **Usuário `is_super_admin`.** Sem tratamento distinto; se tiver `user_role` na clínica, aparece como qualquer outro.

**5. Régua de mutação, por comportamento.** Cada um destes tem um teste cuja remoção do código correspondente derruba o teste — não basta "um teste cobre a feature":

- (a) Membro `admin_recepcao` com flag `false` aparece no grupo **Sem segundo fator** — remover a classificação de recepção derruba.
- (b) Membro `terapeuta` com flag `false` aparece em **Ativação pendente** e **não** em "Sem segundo fator" — trocar os grupos derruba.
- (c) Membro com flag `true` **não** aparece nominalmente em lugar nenhum, só na contagem — passar a listá-lo derruba.
- (d) Papel não-coordenador recebe `notFound()` — remover o gate derruba (T5).
- (e) A query **não** enxerga membro de outra clínica — remover o escopo de tenant derruba (T5).

**6. Convenção de estilo do arquivo-alvo.** Os comentários deste repo explicam **o porquê**, não o o quê — ver `src/app/(app)/equipe/[id]/queries.ts:60-64` (`salvarJanelas`), onde o comentário justifica a escolha de guardar por exceção em vez de descrever o `await`. Escreva no mesmo registro. UI: **nunca** hardcodar cor/espaçamento — usar tokens `var(--...)`, como em `src/app/(app)/equipe/lista-terapeutas.tsx`. Reusar `PageHeader`, `Alert`, `DataRow`, `Button` de `@/components/ui/*`. Copy em pt-BR; commits em inglês (Conventional Commits).

**7. Formatação.** CI **não** valida Prettier. Rodar `pnpm format` **apenas nos arquivos tocados** antes do push (`pnpm format` sem alvo reformata o repo inteiro, inclusive `.agents/` e worktrees aninhados). Depois: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls`.

---

## 3. Tarefas

### T0 — Privilégio de coluna: **já medido, passa. Nada a fazer.**

Medido nesta sessão contra o Postgres local (`infra-postgres-1`), porque a leitura das migrações não decide o caso sozinha: a `0001:21` deu `GRANT SELECT ... ON ALL TABLES` ao `app_role` **antes** de a coluna existir, e a `0057` ainda assim sentiu necessidade de conceder colunas de `app_user` explicitamente.

```
SELECT has_column_privilege('app_role','app_user','two_factor_enabled','SELECT');
→ t
```

O grant do `app_role` em `app_user` é de **tabela** (`SELECT, INSERT, UPDATE, DELETE` em `information_schema.table_privileges`), e privilégio de tabela alcança coluna criada depois — por isso a coluna da `0047` já está coberta.

Confirmado também ponta-a-ponta como `app_role` (não só o grant): com `app.clinic_id`/`app.user_role` setados, a query do T1 devolve `name` + `two_factor_enabled` dos colegas da clínica através da policy `app_user_read`.

**Consequência: esta issue não tem migração.** Se o seu diff tiver `.sql`, algo saiu do trilho.

### T1 — Query (primeira tarefa de código)

**Onde:** `src/app/(app)/clinica/seguranca/queries.ts` (novo).

**O quê:** `carregarPosturaSeguranca(ctx: TenantContext)`. Roda dentro de `withTenant` — nunca `authDb` (memória `fixture-com-authdb-esconde-defeito-real`). Lê `app_user.id`, `name`, `email`, `twoFactorEnabled` e os papéis, via `innerJoin` de `userRole` em `appUser`, filtrando `eq(userRole.clinicId, ctx.clinicId)` e `inArray(userRole.papel, ["terapeuta","coordenador","admin_recepcao"])`, ordenado por `asc(appUser.name)`, agregando por usuário (ver caso de borda de papel duplo).

**Reusa:** o formato de `listarTerapeutas` em `src/app/(app)/equipe/[id]/queries.ts:8-25`. **Não** reusar a função — ela exclui `admin_recepcao` (A3).

**Nunca:** `SELECT` em `two_factor`. Se `two_factor` aparecer no diff, o desenho saiu do trilho.

**Feito quando:** devolve os três grupos já classificados. A classificação é lógica pura — extrair para `logic.ts` com `logic.test.ts` (par usado no repo) para que (a), (b) e (c) da régua de mutação sejam testáveis sem banco.

### T2 — Página

**Onde:** `src/app/(app)/clinica/seguranca/page.tsx` (novo).

Server Component. `getTenantContext()` → `carregarPosturaSeguranca(ctx)` → passa por prop. `PageHeader` com título "Segurança & Governança" e a linha de resumo. Grupos conforme a decisão 3.

### T3 — Aba

**Onde:** `src/app/(app)/clinica/layout.tsx:8-12`.

Acrescentar `{ href: "/clinica/seguranca", rotulo: "Segurança" }` ao array `abas`, como último item.

### T4 — Testes de componente e a11y

`page.test.tsx` cobrindo (a), (b) e (c) da régua de mutação. Padrão de a11y: `src/app/(app)/equipe/a11y.test.tsx`. Atenção: `axe` sob jsdom **não** verifica contraste — não conclua conformidade de cor a partir do teste verde.

### T5 — Teste de RLS

**Onde:** `db/tests/` (arquivo novo, no idioma dos existentes).

Roda com `pnpm test:rls`. Cobre (d) e (e): o `app_role` de outra clínica não enxerga os membros desta; papel não-coordenador não alcança a tela. Não arranje dado via `authDb` na fixture — ver a memória citada em T1.

**Execução:** arquivos `*.int.test.ts` precisam de `--config vitest.integration.config.ts`; `vitest run` sozinho coleta zero e sai verde. Confira a **contagem** de testes, não o verde.

### T6 — Issues de desdobramento

Abrir duas, referenciando esta:

1. **Tela de trilha de auditoria para o coordenador** (A5) — `audit_log` já tem policy e view; falta superfície de leitura.
2. **Termo de Governança e Criptografia** (A6) — documento em `docs/legal/`, exige decisão do Rômulo antes de qualquer redação.

---

## 4. Definição de pronto

- [ ] `/clinica/seguranca` renderiza os três grupos conforme a decisão 3
- [ ] Nenhum `SELECT` em `two_factor` no diff
- [ ] Nenhum arquivo `.sql` no diff (T0 já provou que não há migração)
- [ ] Nenhuma função `SECURITY DEFINER` nova
- [ ] Papel não-coordenador recebe `notFound()`, coberto por teste
- [ ] Isolamento de tenant coberto em `pnpm test:rls`
- [ ] Os 5 comportamentos da régua de mutação têm teste que morre ao remover o código
- [ ] `pnpm format` nos arquivos tocados; `typecheck`, `lint`, `test`, `test:rls` verdes com contagem conferida
- [ ] PR em Draft, descrição em pt-BR com contexto e decisões (Jules só vê o diff)

## 5. O que mudou nos critérios de aceite originais

| Critério original | Estado |
|---|---|
| Spec aprovada antes de qualquer código | Este comentário. Falta o aceite do Rômulo. |
| Acesso restrito ao coordenador, validado por teste de RLS | Mantido (T5). |
| Decisão registrada sobre granularidade (agregado vs. nominal) | **Fechado: nominal para pendências, agregado para conformes** (decisão 3). |
| Nenhuma leitura nova fora da fronteira de tenant sem guard em `pg_proc` | Satisfeito por não haver leitura fora da fronteira (A4). Nada a verificar em `pg_proc`. |
| Cobertura em `pnpm test:rls` | Mantido (T5). |

Os pontos de projeto 2 e 3 da descrição original estão respondidos por A4 e A5 e não precisam mais ser resolvidos antes de implementar.

