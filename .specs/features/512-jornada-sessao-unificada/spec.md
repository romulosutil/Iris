# Jornada unificada da sessão — Especificação

> Issue [#512](https://github.com/romulosutil/Iris/issues/512) · Origem: `docs/ux/jornada-sessao-unificada.md` (brief ratificado pelo Rômulo em 01/09/2026, mergeado em `af46489e`).
>
> **O brief é o `design.md` desta feature.** Este arquivo não o repete: registra o que a **medição no código** confirmou, o que ela **contradisse**, e traduz o brief em requisitos rastreáveis. Ler o brief antes.
>
> ⚠️ **Uma correção é bloqueante** (A1) e reabre a premissa de uma decisão já ratificada. Ver §4.

## Problem Statement

O funil clínico é linear (`agendar → atender → documentar → aprovar → acervo`), a interface não. Onze superfícies, duas árvores de navegação concorrentes, e uma aprovação duplicada que em clínica solo é a mesma pessoa carimbando duas vezes. A issue #512 (coordenador sem link para `/pendencias`) é um sintoma de `D-a`, não um bug isolado — corrigir só a nav reencena o defeito no próximo contador.

## Goals

- [x] **G1** Uma sessão tem **um** estado exibido e **um** gesto primário, idênticos em toda superfície onde ela aparece. → T01 (`deriveEstadoSessao`), reusado literalmente por T04/T06 (`ROTULO_ESTADO`, `resultado.gesto`).
- [x] **G2** A máquina de estados é função pura sobre linhas existentes — zero migração, zero coluna, zero policy nova. → `git diff --stat db/migrations/` vazio (T15).
- [x] **G3** Uma evidência exige **uma** aprovação humana consciente. A segunda só existe quando existe uma segunda pessoa. → T07 (`resolverColapso`, 1 `evidence_revision` por evidência, idempotente).
- [x] **G4** A régua de colapso da aprovação é **por sessão** (`session.terapeutaId`), **nunca** por clínica. → T05 (`podeAutoValidar`), guardado pelo teste E2 (mutação confirmada).
- [x] **G5** Um contador só, com o mesmo predicado da lista que ele conta. → T02/T03 (`fila.ts` → `contarTravadas`/`listarTravadas` compartilham `coletarTravadas`).
- [x] **G6** A nav tem a mesma estrutura para os dois papéis clínicos; só o escopo difere, e o escopo é dito por extenso. → T09 (`nav.ts`/`montarNav`), T03 (`escopoTexto`).

## Out of Scope

| Item                                            | Razão                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Múltiplos coordenadores por clínica (D76, #520) | Lacuna de modelo, issue própria (#520). Esta jornada **não depende** dela: `podeAutoValidar` (G4/R-07) já está correto nos dois cenários. A fila (R-09) **não** está — muda com D76, ver correção em R-09. |
| Desenho do bloco de estagnação em `/pacientes`  | O brief decide que Supervisão **sai da governança e continua empurrando** (C2); onde o bloco encosta e qual é o predicado de "estagnou" é issue separada (brief §7.3). |
| `/alertas-risco`                                | Escopo é paciente e clínica, não sessão. Semiótica de cor exclusiva (terracota) e faixa global própria. Fica onde está.                                                |
| Rename de `admin_recepcao` na UI                | Descartado ao decidir a #517.                                                                                                                                          |
| Qualquer migração de schema                     | Consequência de G2. Se uma task precisar de migração, ela está fora desta feature — ver R-08 e a decisão pendente P2.                                                  |

## 3. Achados de medição (o que mudou em relação ao brief)

Todos verificados no código em 01/09/2026, com `file:line`. **Não deduzidos.**

### A1 · 🔴 BLOQUEANTE — `admin_recepcao` **já pode** criar sessão

O brief §4 (E4) afirma: _"A recepção não pode marcar sessão e não enxerga a semana — (…) é permissão no lugar errado."_ **A primeira metade é falsa.**

```
src/auth/require-role.ts:61  requireAgendar(ctx) → requireRole(ctx, "coordenador", "admin_recepcao")
```

O próprio comentário da guarda diz: _"coordenador e recepção (`admin_recepcao`) podem agendar — só as ações estruturais (encerrar regra, editar regra, config de disponibilidade) seguem coordenador-only"_. E `requireAgendar` guarda **as duas** ações de criação:

- `criarRegra` — `src/app/(app)/agenda/queries.ts:327` (guarda em `:331`)
- `criarAvulsa` — `src/app/(app)/agenda/queries.ts:556` (guarda em `:560`)

O que é coordenador-only é **a tela**, não a permissão: `src/app/(app)/agenda/semana/page.tsx:41` — `requireRole(ctx, "coordenador")`.

**Consequência:** a decisão C5 / issue #517 ("recepção não agenda, fica como está") foi tomada sobre a premissa de que a autorização nega. A autorização **concede**; o que nega é o alcance de UI. Isso não decide sozinho o que fazer — decide que **a decisão precisa ser retomada com o fato correto**. Ver §4 (P1).

### A2 · ✅ Confirmado — o motor único de calendário existe

`src/components/ui/calendar/` — 7 arquivos, **1.112 linhas** (`calendar-grid.tsx` 538, `calendar-event-sidebar.tsx` 175, `calendar-event-card.tsx` 152, `calendar-header.tsx` 118, `calendar-slot-dialog.tsx` 68, `calendar-root.tsx` 40, `index.ts` 21).

Importadores reais (fora de `.stories`/`.test`): **exatamente dois** — `src/components/ui/schedule-grid.tsx:4` e `src/components/ui/availability-grid.tsx:5`.

`src/components/ui/agenda-calendar-grid.tsx` — **307 linhas**, não usa o motor, importado só por `src/app/(app)/agenda/agenda-view-cliente.tsx`. O brief §3.6 está correto: é o componente a remover, e tem **um único** ponto de montagem.

### A3 · ✅ O gesto "Registrar sessão" já existe — não é código novo

`marcarEstado` (`src/app/(app)/agenda/logic.ts:246`, core em `:163`) já faz a transição pós-atendimento, com **CAS otimista** (`WHERE estado = 'agendada'`, `logic.ts:211`) contra lost-update, `transicaoPermitida` como guarda, justificativa obrigatória por desfecho, e trilha em `audit_log` (`logic.ts:221`). Guarda: `requireRole(ctx, "coordenador", "admin_recepcao", "terapeuta")` (`logic.ts:168`) — os três papéis.

Confirma também a derivação do brief §3.1: check-in **não** é estado (`src/db/schema.ts:74-76`), presença mora em `checkInEm`, e `estado` só sai de `agendada` na consolidação. Logo `realizada` **sem** `nota_consolidada` é alcançável — o estado "Realizada" do brief não é vazio por construção.

**O que falta não é a ação, é o posicionamento**: hoje ela vive dentro de `gerir-sessao.tsx` na agenda; o brief quer que ela caia direto na documentação, sem tela intermediária vazia.

### A4 · ✅ "Aprovação é reversível" **não** era derivável sem migração — resolvido em P2 (opção a, cortar)

O brief §3.8 afirma: _"a evidência aprovada oferece `Reabrir revisão`. `evidence_revision` é append-only — reabrir é natural no modelo de dados, não é exceção."_ Medido:

```
src/db/schema.ts:164-168  evidenceRevisionAcao = pgEnum(..., ["confirmar","reclassificar","invalidar"])
```

Não existe `reabrir`. E o predicado da fila (A5) tira o item da lista justamente **porque** existe linha em `evidence_revision`; como `evidence` é append-only com `UPDATE`/`DELETE` revogados de `app_role` (`src/db/schema.ts:1343-1344`), **não há caminho** que devolva o item à fila sem valor de enum novo (ou mecanismo novo).

Contradiz o brief §6 (_"Não toca: modelo de dados"_). Ver §4 (P2).

> Se a saída for valor novo de enum: atenção à armadilha já paga neste repo — enum novo + `CHECK` na mesma migração exige `tipo::text`, e expressão `NULL` em `CHECK` **satisfaz** (memória `enum-novo-e-check-numa-migracao`).

### A5 · ✅ Predicado único da fila — texto exato a reusar

`src/app/(app)/validacao/queries.ts:17-19` (documentado) e implementado idêntico em `contarFilaValidacao` (`:85-104`, criado em `a0e7563`) e `listarFilaValidacao` (`:106-200`):

```sql
FROM evidence_current ec
JOIN extraction x ON x.id = ec.extraction_id
WHERE ec.invalidada = false
  AND (x.confianca = 'baixa' OR x.inconsistente_com_historico = true)
  AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
  AND NOT EXISTS (SELECT 1 FROM evidence_query q WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL)
```

`evidence_current` é **VIEW**, não tabela do Drizzle (`db/migrations/0014_fase4_evidence_rls.sql:139-151`), com `security_barrier = true`.

> ⚠️ `security_barrier` bloqueia o push-down do `LIMIT` através da view (memória `security-barrier-view-bloqueia-limit`). Paginação real (brief §7.1) tem que medir plano, não presumir.

### A6 · ✅ Os contadores divergentes têm endereço

`src/app/(app)/layout.tsx` faz **três leituras diretas e independentes**: `contarFilaValidacao` (`:10`, chamada em `:35`), `listarPendencias` (`:9`, `:33`) e `estadoEstagio2` (`:8`, `:40`). Existe `obterContadoresGovernanca` (`src/lib/governanca/contadores.ts:14`) que **não é chamada pelo layout**. É exatamente o risco §7.4 do brief, já materializado.

### A7 · 🟡 `session_note` é uma linha por tipo, não N

`unique("uq_session_note_tipo").on(t.sessionId, t.tipo)` — `src/db/schema.ts:1122`, com comentário _"1 captura_rapida + 1 nota_consolidada por sessão"_.

O brief §3.4 diz _"Capturar (texto ou áudio, **várias vezes**)"_. No modelo atual isso é `UPDATE` de **uma** linha `captura_rapida`, não `INSERT` de várias. A UI pode oferecer captura incremental; a persistência é acúmulo no mesmo registro. O requisito precisa dizer isso, ou o executor inventa `INSERT` e colide com `23505`.

### A8 · ✅ `avaliarFriccao` é fonte única e já é

`src/lib/extraction/review-policy.ts:5-19`. `inconsistenteComHistorico` → `alto` (vence confiança, nunca vai a lote); `confianca alta` → `baixo` (lote liberado); `media`/`baixa` → `medio`. Consumidores: `validacao/queries.ts:174`, `validacao/logic.ts:241`, `revisao/[sessionId]/queries.ts:130`.

### A9 · ✅ Inventário confirmado do que sai e do que nasce

| Alvo                        | Endereço                                               | Pontos de montagem                                                              |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `GovernancaNav` (5 abas)    | `src/components/ui/governanca-nav.tsx`, 152 linhas     | 5 páginas: `validacao`, `excecoes`, `supervisao`, `pendencias`, `alertas-risco` |
| `agenda-calendar-grid`      | `src/components/ui/agenda-calendar-grid.tsx`, 307 lin. | 1: `agenda/agenda-view-cliente.tsx`                                             |
| `/agenda/semana`            | `src/app/(app)/agenda/semana/`                         | rota; `requireRole(ctx,"coordenador")` em `page.tsx:41`                         |
| `/sessoes`, `/sessoes/[id]` | —                                                      | **NOT FOUND** — rotas novas                                                     |
| `src/lib/sessao/`           | —                                                      | **NOT FOUND** — diretório novo                                                  |

Nav atual por papel (`src/app/(app)/layout.tsx:69-118`), medida:

- `coordenador` (`:71-89`): `/validacao`(badge) · `/agenda` · `/pacientes` · `/equipe` · `/relatorios` · `/clinica/dados` · `/clinica/exportacao` · `/duvidas` · `/perfil` — **9 itens, sem `/pendencias`** (é a #512)
- `terapeuta` (`:90-106`): `/agenda` · `/pacientes` · `/pendencias`(badge) · `/relatorios` · `/duvidas` · `/perfil` — 6 itens
- `admin_recepcao` (`:107-112`): `/agenda` · `/pacientes` · `/perfil` — 3 itens

## 4. Decisões pendentes (bloqueiam tasks nomeadas)

`AGENTS.md` §5.2: nenhuma delas pode chegar ao executor como "a validar".

### P1 · ✅ [issue #521] A premissa de C5 (#517) estava factualmente errada — resolvido, opção a

**Decisão (Rômulo, 01/09/2026, issue #521):** opção **a**. `requireAgendar` **não muda**. A decisão da #517 (recepção não agenda, fica como está) é **ratificada** — o erro era a premissa registrada no doc (§4 E4 dizia "recepção não pode marcar sessão"; o correto é "recepção não tem tela para marcar"), não a decisão em si. Rômulo: "foi falha minha, se o produto já dizia de uma forma, vamos mantê-la."

**Fato (A1):** `requireAgendar` já concede criação de sessão a `admin_recepcao` — código correto, doc que estava errada. `/agenda/semana` é coordenador-only e é lá que a UI de criação mora.

**O que a jornada nova precisa fazer:** ao trazer a semana para dentro de `/agenda` (R-29), a tela de criação de sessão continua gateada por papel — só `coordenador` vê o gesto de criar. Isso preserva a decisão da #517 na prática sem mexer em `requireAgendar`.

**Bloqueava:** T09 (nav por papel), T13 (toggle de escala). **Desbloqueadas.**

### P2 · ✅ [issue #522] `Reabrir revisão` (brief §3.8) exige mecanismo novo — resolvido, opção a

**Decisão (Rômulo, 01/09/2026, issue #522):** opção **a**. Cortar `Reabrir revisão` desta feature. Motivo: o caso de uso real é erro de clique, não erro de julgamento clínico — não justifica quebrar o zero-migração da #512 agora. Esperar erros reais acontecerem em produção antes de desenhar reabertura, com dado real em vez de hipótese.

**Fato (A4):** não há valor `reabrir` em `evidence_revision.acao`, e `evidence` é append-only com `UPDATE`/`DELETE` revogados. Reabrir não é derivável sem migração.

**Consequência:** brief §3.8 e §3.5 corrigidos (promessa de reabertura removida; colapso da aprovação revisitado — se sustenta sem a rede). G2 (zero migração) sobrevive intacto.

**Opções:**

| #     | Opção                                               | Efeito                                                                                                                             |
| ----- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **a** | Cortar `Reabrir revisão` desta feature              | G2 (zero migração) sobrevive intacto. Custo: "1 gesto" vira "1 chance", que é exatamente o que o brief §3.8 quis evitar.           |
| **b** | Valor novo de enum `reabrir` + migração             | Fecha o buraco. Custo: quebra o "não toca modelo de dados" do brief §6, e a feature deixa de ser reversível por `git revert` puro. |
| **c** | Modelar reabertura como `invalidar` + nova extração | Sem migração, usa enum existente. Custo: polui a trilha com `invalidar` que não foi invalidação clínica — falseia auditoria.       |

**Bloqueava:** só a parte de reabertura de T07. **Desbloqueada** — T07 passa a ser só o colapso da aprovação, sem gesto de reabrir.

### P3 · 🟢 [T01, já implementado] `Revisada` seria inalcançável pela leitura literal do §3.1

**Não bloqueia nada** — T01 tomou a decisão e a documentou no código. Registrado aqui para o Rômulo confirmar ou reverter, não para travar trabalho.

A tabela do brief §3.1 define, com o **mesmo campo**:

- `Revisada` = toda `extraction` da sessão em `aprovada`/`editada`/`descartada`
- `No acervo` = Revisada **e** sem item da sessão pendente na fila de validação
- `Precisa de atenção` = (…) **ou** item na fila de validação

Combinado com R-02 (`precisa_atencao` vence tudo), a leitura literal torna `Revisada` **matematicamente inalcançável**: com a fila vazia o estado é `no_acervo`; com item na fila o estado é `precisa_atencao`. Não sobra caso para `Revisada` — e ela é um dos **cinco** estados canônicos que o brief §3.1 promete ("Agendada → Realizada → Documentada → Revisada → No acervo").

**Decisão tomada em T01:** `na_fila_validacao` só é exceção **enquanto a revisão das extrações ainda não terminou**. Uma vez toda extração decidida, estar na fila é o caminho normal rumo a `no_acervo`, não uma pendência. Ancorada no próprio texto do brief — _"a sessão trava e **volta** para a fila"_ descreve algo que regride, não a espera esperada do pós-revisão.

Efeito: a escada de 5 estados fica íntegra, e `Revisada` = "eu já fiz a minha parte, falta o coordenador".

**Alternativa, se o Rômulo discordar:** aceitar que a escada tem 4 estados visíveis e remover `Revisada` do vocabulário do §3.1. É mudança de doc, não de código.

## 5. Requisitos

Rastreáveis. `→` aponta a seção do brief que os origina.

### Máquina de estados

| ID       | Requisito                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-01** | Existe `src/lib/sessao/estado.ts`: função **pura**, sem I/O, sem import de `db`, que recebe um registro de leitura e devolve um dos 8 estados: `agendada`, `realizada`, `documentada`, `revisada`, `no_acervo`, `falta`, `cancelada`, `precisa_atencao`. → §3.1                     |
| **R-02** | A derivação é **exatamente** a tabela do brief §3.1. `precisa_atencao` **vence** qualquer outro estado quando aplicável — é ramo de exceção, não posição na fila.                                                                                                                   |
| **R-03** | `precisa_atencao` tem **motivo tipado**, não booleano: `extracao_travada` (`extraction.estado ∈ {pendente_reprocessamento, erro_validacao}`), `sem_nota_apos_24h` (realizada, sem `nota_consolidada`, há mais de 24h), `na_fila_validacao`. O motivo vira o rótulo do gesto (§3.3). |
| **R-04** | A "hora atual" entra por **parâmetro**, nunca `new Date()` interno — senão o teste de `sem_nota_apos_24h` não é determinístico.                                                                                                                                                     |
| **R-05** | Cada estado tem **um** gesto primário, definido na mesma função (tabela §3.3). Nenhuma tela redefine gesto por conta própria. → G1                                                                                                                                                  |
| **R-06** | Zero migração, zero coluna, zero policy. Nenhum import de `src/db/schema.ts` além de **tipos**. → G2                                                                                                                                                                                |

### Aprovação

| ID       | Requisito                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-07** | `podeAutoValidar` deriva **só** de `ctx.role === "coordenador" && ctx.userId === session.terapeutaId`. Nenhuma contagem de membros da clínica entra na conta. → §3.5, §7.5       |
| **R-08** | 🚫 Qualquer helper do tipo `ehClinicaSolo()`, `contarCoordenadores()`, ou predicado de colapso que leia mais de uma sessão é **rejeição em revisão de PR**, não sugestão. → §7.5 |
| **R-09** | A fila do coordenador é `sessões da clínica cujo terapeuta ≠ eu` ∪ `minhas sessões travadas` — nunca "todas, porque sou coordenador". Vale **hoje**, 1 coordenador/clínica. Com D76 (#520) resolvido, muda para `sessões de pacientes onde eu sou coordenador_referencia vigente em care_team_membership, cujo terapeuta ≠ eu` — decisão do Rômulo em 01/09/2026, não implementar aqui. → §3.5 |
| **R-10** | `avaliarFriccao` (A8) continua fonte única. Fricção alta exige justificativa escrita **sempre**, e nunca aprova em lote.                                                         |
| **R-11** | `evidence_revision` continua append-only, com autor, ação e justificativa. O que muda é **não** registrar duas vezes o mesmo julgamento da mesma pessoa. → §3.5                  |

### Contadores e fila

| ID       | Requisito                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R-12** | Existe **uma** função `contarTravadas` com o **mesmo predicado** da lista de `/sessoes`. Contador e lista compartilham o predicado por construção (mesmo módulo), não por disciplina. → §7.4, A6 |
| **R-13** | `src/app/(app)/layout.tsx` passa a chamar **uma** leitura de contagem, não três (A6).                                                                                                            |
| **R-14** | `/sessoes` diz o escopo **por extenso**: _"7 sessões da clínica"_ / _"7 sessões suas"_. → C6                                                                                                     |
| **R-15** | Ordenação **visível e trocável**. Default por papel (coordenador: tempo travado; terapeuta: por dia), mas o controle é o mesmo e está à vista. → C8                                              |
| **R-16** | Filtro por terapeuta, **persistente**, valendo para a fila e para a grade semanal. → C3                                                                                                          |
| **R-17** | O item declara o custo: `Revisar 3 evidências · ~4 min` vs `Reprocessar · instantâneo`.                                                                                                          |
| **R-18** | Estado **nunca** aparece sozinho: o selo diz o estado, a linha ao lado diz a dívida (_Documentada · 3 evidências esperando você_).                                                               |
| **R-19** | Paginação real, com plano **medido** — `evidence_current` é `security_barrier` e não deixa o `LIMIT` descer (A5). Ordenação por **tempo travado**, não por data da sessão. → §7.1                |

### Navegação

| ID       | Requisito                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-20** | `GovernancaNav` é removida, e os 5 pontos de montagem (A9) com ela. → §3.2                                                                                                                                           |
| **R-21** | Menu diário: `Agenda · Sessões(badge) · Pacientes · Relatórios` — mesma estrutura para `coordenador` e `terapeuta`. → §3.2                                                                                           |
| **R-22** | Administração (`Dados da Clínica`, `Exportar Acervo`, `Equipe`, `Assinatura`, `Dúvidas`, `Meu Perfil`) sai do menu diário para o menu do usuário no rodapé do rail. → C1                                             |
| **R-23** | `admin_recepcao` **não** recebe `Sessões`. Um badge que ela nunca consegue zerar é ansiedade permanente. → C4                                                                                                        |
| **R-24** | Papel ativo **visível e trocável** na faixa superior. Deixa de existir cookie invisível decidindo o que os botões fazem. → C7                                                                                        |
| **R-25** | Rail lateral: 236px expandido ↔ 68px colapsado. Estado persiste por navegador em `localStorage`, **com `try/catch`** — a leitura estoura em janela anônima e a UI precisa renderizar certo com valor ausente. → §3.7 |
| **R-26** | Colapsado não degrada a11y: alvo ≥44px, `aria-label` + tooltip por ícone, **badge continua visível**. Ícone sozinho nunca é o único portador de significado.                                                         |
| **R-27** | Mobile: barra **inferior** (o polegar alcança a base), não gaveta superior.                                                                                                                                          |

### Calendário

| ID       | Requisito                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| **R-28** | `agenda-calendar-grid` (307 linhas) é removido; a escala "Dia" vira escala do motor `ui/calendar`. → §3.6, A2      |
| **R-29** | `/agenda/semana` deixa de ser rota e vira toggle `Dia \| Semana` dentro de `/agenda`, para **todo papel clínico**. |
| **R-30** | No mobile, a escala Dia é **lista cronológica**, não grade. Grade de 7 colunas em 375px é ilegível por construção. |

### Estados de tela e migração de expectativa

| ID       | Requisito                                                                                                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-31** | Nenhuma tela entra sem os sete estados: `default`, `vazio`, `carregando` (skeleton, nunca spinner no meio do conteúdo), `erro`, `primeira vez`, `volume alto`, `sem permissão`. → §5                                                   |
| **R-32** | Falha de extração **nunca** é renderizada como vazio. Todo estado derivado da IA distingue _não há_ de _não deu certo_, e o segundo sempre oferece `Reprocessar`. → §5, memória `erro-renderizado-como-empty-state`                    |
| **R-33** | Fila com zero elegíveis é **empty-state**, não bug: "Nada travado" é desfecho legítimo e é dito com essas palavras. → memória `fila-validacao-lote-zero-elegiveis`                                                                     |
| **R-34** | Rotas antigas (`/pendencias`, `/excecoes`, `/validacao`, `/diario/[id]`, `/revisao/[id]`, `/agenda/semana`) viram `redirect()` permanente para o ponto equivalente — link salvo e teste E2E que navega por URL não podem quebrar. → §6 |
| **R-35** | "Central de Validação" é o item primário do coordenador hoje. Sumir com o nome sem aviso é ruim: redirect **+ dica na primeira visita**. → §7.2                                                                                        |

### Captura

| ID       | Requisito                                                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-36** | "Capturar várias vezes" (§3.4) é **acúmulo na mesma linha** `captura_rapida`, não `INSERT` de N linhas — `UNIQUE(session_id, tipo)` (A7). Escrita é `UPDATE`; `INSERT` repetido colide com `23505`. |
| **R-37** | O estado "salvo localmente" é **componente fixo, nunca toast** — princípio "a informação nunca se perde implicitamente". → §3.4                                                                     |
| **R-38** | `Consolidar` só habilita quando existe captura; até lá **explica o que falta**, em vez de ficar cinza mudo. → §3.4                                                                                  |

## 6. Definição de Pronto (feature)

- [ ] Todos os R-01..R-38 rastreados a uma task, e cada task a um teste.
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:rls` verdes, com a **contagem** conferida (verde com "skipped" é vermelho disfarçado — memória `suite-rls-rodando-como-superusuario`).
- [ ] `git diff --stat db/migrations/` **vazio** — G2 é verificável, não aspiracional.
- [ ] `grep -rn "ehClinicaSolo\|clinicaSolo\|contarCoordenadores" src/` devolve **zero** (R-08).
- [x] P1 (§4) fechada pelo Rômulo — issue #521, opção a.
- [x] P2 (§4) fechada pelo Rômulo — issue #522, opção a. `Reabrir revisão` fora de escopo.
- [ ] `npx prettier --write` nos arquivos tocados — **nunca** `pnpm format` (reformata o repo inteiro).
