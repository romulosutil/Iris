# Fase 4 — Evidências Acumuladas & Gráficos — Spec Mestre (design)

> Status: **rascunho para aprovação** (gate de modelo de dados / RLS — CLAUDE.md).
> Issue: [#7](https://github.com/romulosutil/Iris/issues/7). Branch: `feat/fase-4-evidencias-graficos`.
> Data: 2026-07-13. Autor: sessão Claude Code (Opus 4.8), revisão adversarial + protocolar pendente.

---

## 1. Objetivo da fase

Entregar as três capacidades do Issue #7:

1. **Evidências Acumuladas** — linha do tempo estruturada do paciente com *scrubber* temporal
   e visualização de deltas por sessão.
2. **Gráficos de Progresso** — trajetória por meta/protocolo com comparador entre 2 pontos temporais.
3. **Briefing Pré-Sessão** — painel consolidado (última sessão, metas de hoje, alerta de manejo,
   reforçadores atuais) lido em pé, escaneável em 30s.

Infra que o Issue #7 exige e que **ainda não existe no schema**: `SessionSnapshot` materializado
(event-sourcing), `evidence` real, `reinforcer_profile`, e a lógica de "devolver com dúvida"
(`EvidenceQuery`).

---

## 2. Estado atual (o que já existe / o que falta)

| Item | Estado | Fonte |
| --- | --- | --- |
| `extraction` (extração aprovada = registro oficial) | ✅ existe | `src/db/schema.ts:436` |
| `goal_candidacy`, `milestone_candidacy` | ⚠️ existem mas **dormentes** | `schema.ts:526,534` / BACKLOG:135 |
| `session`, `sessionNote`, `sessionProtocolScope`, `protocol`, `milestone`, `goal`, `patientProtocol` | ✅ existem | `schema.ts` |
| `evidence`, `evidence_revision`, `evidence_query`, view `evidence_current` | ❌ não existem | BACKLOG:69/146/158 |
| `session_snapshot` | ❌ não existe | modelo-de-dados §2.5 |
| `reinforcer_profile` | ❌ não existe | modelo-de-dados §1.4 (necessário p/ Briefing) |
| `milestone_assessment`, `milestone_assessment_evidence` | ❌ não existem (só descrição textual) | modelo-de-dados §1.5 |
| Landing `/pacientes/[id]` (perfil) | ❌ não existe | BACKLOG:134 |
| Infra de job assíncrono (fila/worker) | ❌ não existe no stack | BACKLOG:167 |

**Consequência central:** a Fase 3 decidiu conscientemente adiar a tabela `evidence`
("evidência revisada = estender `extraction_estado`"). A Fase 4 **precisa introduzir `evidence`
de verdade**, e tudo o mais (snapshot, candidatura, timeline, briefing) depende dela. Essa é a
raiz da cadeia de dependências.

---

## 3. Guardrails que restringem esta fase (inegociáveis)

Da regra de 3 camadas (AGENTS.md) + princípios do produto:

- **G1 — Dado de menor / LGPD.** Toda tabela nova carrega `clinic_id` (ou herda via FK a paciente)
  e entra no RLS por tenant. Nenhum PII novo além do estritamente necessário; sem texto livre
  cru exposto em snapshot.
- **G2 — Isolamento multi-tenant.** RLS obrigatório em `evidence`, `evidence_revision`,
  `evidence_query`, `session_snapshot`, `reinforcer_profile`. Teste de RLS (integration) é
  Definição de Pronto, não opcional.
- **G3 — Imutabilidade da evidência.** `evidence` é append-only: `REVOKE UPDATE, DELETE ON evidence
  FROM app_role`. "Classificação atual" **nunca** é armazenada — resolvida pela view
  `evidence_current`. Correções nascem como `evidence_revision`.
- **G4 — Segmentação é código determinístico, NUNCA IA.** Evolução/estagnação/regressão é regra
  SQL/TS. A IA não decide trajetória.
- **G5 — `nivel_ajuda` não tem escala ordinal global.** Comparação de ordinal só **dentro da
  `protocol.taxonomia_ajuda` do mesmo protocolo**. Nunca cruzar ordinais entre protocolos/famílias.
  ⚠️ **Correção pós-revisão:** `evidence` **não tem coluna `protocol_id`** — o protocolo vive no
  `classificacao_original` JSONB (`alvos[].protocol_id`) e uma extração pode ter **múltiplos alvos
  em múltiplos protocolos**. Logo o *fold* evidência→snapshot opera em **grão de alvo**, não de
  linha de evidência. `segmentacao` é chaveada por **`(goal_id, protocol_id)`**.
- **G5b — Segmentação despacha por `tipo_estrutura`, não por eixo único de ajuda.** (Achado
  clínico crítico.) O ordinal de `nivel_ajuda` só é válido para `marco_simples`. Para os demais a
  função de segmentação lê `Milestone.estrutura` (JSONB) e usa a métrica-alvo correta:
  `marco_com_barreira` → escore de barreira, **direção invertida** (menor = melhor);
  `escore_composto` → escore composto do marco (subir = evolução); `faixa_normativa` (Denver) →
  delta de idade-equivalente **relativo à idade cronológica** (ganho < passagem de tempo =
  estagnação/regressão relativa). Sem isso, 3 dos 4 tipos geram gráfico clinicamente errado.
- **G6b — `repertorio_state`/`segmentacao` são estritamente numéricos/enum.** (LGPD.) Nenhum texto
  livre (trecho_fonte, narrativa ABC, PII de menor) é materializado nessas tabelas de alto tráfego;
  narrativa ABC é lida de `evidence` no momento do render.
- **G7 — Comparação e delta só dentro do mesmo `protocol_id`/taxonomia.** Quando sessão N e M (ou
  n e n-1 no delta) caem sob protocolos/famílias diferentes (`PatientProtocol` tem vigência;
  `SessionProtocolScope` separa famílias), a UI **desabilita a subtração de nível de ajuda** e
  mostra "protocolo mudou entre N e M — níveis não comparáveis", exibindo as duas leituras lado a
  lado. Nunca um diff numérico entre taxonomias.
- **G6 — Contrato do agente.** Nada nesta fase altera `docs/agente/output-schema.json`. `evidence`
  consome o payload de extração aprovada; não muda o schema de saída do agente.

---

## 4. Decomposição em sub-projetos

Fase 4 é grande demais para uma spec/plano único. Decomposta em 4 sub-projetos com cadeia de
dependência dura. Cada um terá seu próprio ciclo spec → plano → implementação → revisão, e vira
um `feat(fase-4): ... (Plano N — …)` atômico, no padrão da Fase 3.

```
4A Evidence layer ──▶ 4B Snapshot & candidatura ──┬─▶ 4C ReinforcerProfile + Briefing
   (fundação)            (materialização)          └─▶ 4D Timeline/Scrubber + Gráficos
```

### 4A — Fundação de Evidência (Evidence layer)

**Entrega:** as três tabelas de evidência + a view de classificação atual + migração da extração
aprovada para `evidence`.

- DDL: `evidence` (append-only), `evidence_revision` (confirmar|reclassificar|invalidar),
  `evidence_query` (devolver com dúvida — governança V2).
- View `evidence_current`: resolve última `evidence_revision` `acao=reclassificar` ou a original;
  expõe flag `invalidada`.
- Migração SQL à mão para `REVOKE UPDATE, DELETE ON evidence FROM app_role` (padrão
  `db/migrations/*_rls.sql`).
- **Backfill:** toda `extraction.estado ∈ {aprovada, editada}` existente vira uma `evidence`
  (idempotente, com `extraction_id` como origem). ⚠️ *Decisão aberta D2 abaixo.*
- Testes: RLS integration (isolamento por clinic), tentativa de UPDATE/DELETE deve falhar,
  `evidence_current` resolve reclassificação corretamente.

**Definição de pronto 4A:** tabelas + view migradas local; RLS testado; backfill idempotente
rodando em seed; `historico_relevante` passa a apontar para `evidence` (destrava R14 real).

### 4B — Materialização (SessionSnapshot) & Candidatura

**Entrega:** `session_snapshot` materializado + reativação das máquinas de candidatura +
segmentação determinística.

- DDL `session_snapshot` (PK `(patient_id, session_numero)`, `repertorio_state` JSONB,
  `segmentacao` JSONB **por `protocol_id`**, índice `(patient_id, session_numero DESC)`).
- Cômputo incremental: `snapshot(n) = snapshot(n-1) + evidences(sessão n)`.
- Leitura: as-of = linha direta; **delta = diff on-read** entre `snapshot(n)` e `snapshot(n-1)`
  (não armazenado).
- Recomputação retroativa: edição de `evidence` antiga invalida e recomputa **só de
  `session_numero` afetado em diante**; log de eventos nunca é tocado.
- Segmentação determinística (G4/G5): EVOLUÇÃO (1ª ocorrência ou melhora de ordinal no próprio
  protocolo), ESTAGNAÇÃO (janela W=5 sem evidência nova, mesma família), REGRESSÃO (piora
  sustentada ≥2 sessões no ordinal, mesmo protocolo).
- Reativação de `milestone_candidacy` (N=3 evid / M=2 sessões, default por Protocol) e
  `goal_candidacy` (últimas N evidences por `session_numero` satisfazem `Goal.criterio_dominio`,
  sem interrupção por negativa).
- ⚠️ **Infra do job — decisão aberta D1** (fila / cron / trigger+outbox / síncrono-na-aprovação).

**Definição de pronto 4B:** snapshot recomputa incrementalmente + retroativamente; segmentação
com teste unitário por protocolo (nunca cruza ordinais); candidatura acende flag lida pela UI,
nunca recalculada no cliente.

### 4C — ReinforcerProfile + Briefing Pré-Sessão

**Entrega:** `reinforcer_profile` (alimentado por extrações `preferencia_reforcador`, R17) +
tela de Briefing.

- DDL `reinforcer_profile` (por paciente, com vigência/atualização).
- Briefing = Server Component lendo `session_snapshot` (última sessão + delta), `goal` (estado
  ativa), `reinforcer_profile`, episódios ABC das `evidence`. Layout do wireframe §1.1
  (header · ÚLTIMA SESSÃO · METAS DE HOJE · ⚠ ALERTA DE MANEJO isolado · 🎯 REFORÇADORES ·
  Iniciar sessão). Escaneável em 30s.

**Definição de pronto 4C:** briefing carrega < 300ms (lê snapshot materializado, não recomputa);
componentes do DS; a11y (compromisso core do produto).

### 4D — Timeline/Scrubber + Gráficos + Comparação

**Entrega:** landing `/pacientes/[id]` + scrubber + delta + trajetória + gráfico de protocolo +
comparação de 2 pontos.

- Landing perfil do paciente (ponto de entrada que hoje não existe).
- **Scrubber** (slider horizontal com marcadores de sessão) → `session_snapshot` as-of; banner
  fixo "📍 Vendo sessão N de M — [Voltar ao presente]".
- **Delta da sessão** (painel lateral compacto).
- **Trajetória** (faixa horizontal por meta/domínio, cor por trecho evolução/estagnação/regressão,
  clicável → `evidence` do trecho). Cores = cálculo determinístico, nunca julgamento de IA.
- **Gráfico do protocolo** (§1.3: barras por domínio; candidato a avaliação em losango pontilhado
  azul vs. marco confirmado sólido verde).
- **Comparação** (2 colunas sessão N | sessão M, diferença de nível de ajuda destacada).

**Definição de pronto 4D:** todos os gráficos leem materialização; drill-down abre `evidence`
correta; componentes do DS; a11y (gráficos com alternativa textual/tabela acessível).

---

## 5. Decisões de arquitetura ABERTAS (precisam do Rômulo)

Marcadas como propostas pendentes — nenhuma DDL antes de resolvê-las.

- **D1 — Infra do job de materialização.** `session_snapshot`, `milestone_candidacy`,
  `goal_candidacy` são materializações que o modelo assume rodarem em job assíncrono. Não há
  fila/worker no stack, e o pivô VPS (Easypanel + Postgres puro) está em avaliação.
  ⚠️ **Revisado (BLOCKER):** a opção "síncrona inline" NÃO funciona como estava — `evidence` nasce
  na aprovação (role `terapeuta`), mas `milestone_candidacy_write`/`goal_candidacy_write` são
  RLS-restritos a `coordenador` (`0006_fase2_rls.sql:305,336`). Escrever candidatura na transação
  do terapeuta é filtrado pelo RLS (0 linhas) ou falha no WITH CHECK. Portanto a materialização
  tem de rodar via **função `SECURITY DEFINER`** (padrão já usado no repo: `app_patient_in_clinic`
  etc.), tratada como "escrita de sistema" que contorna o gate de papel de forma controlada.
  Opções reais: (a) **`SECURITY DEFINER` chamada síncrona após a aprovação** (sem infra nova,
  contorna o RLS corretamente, recompute com `pg_advisory_xact_lock(patient_id)` fora da tx do
  usuário); (b) **trigger + outbox** (Postgres puro); (c) **cron**. Recomendação: **(a)** — mas a
  decisão-chave a travar é "materialização = escrita de sistema via definer", não a-vs-b-vs-c.
- **D2 — Backfill de `evidence`.** Migrar todas as extrações aprovadas existentes para `evidence`,
  ou só passar a gerar `evidence` daqui pra frente? Recomendação: **backfill idempotente** (sem
  ele, timeline/snapshot nascem vazios e sem história). É DDL que toca dado existente → "confirmar
  antes" (CLAUDE.md).
- **D3 — Escopo de `EvidenceQuery` UI.** A tabela `evidence_query` é dependência estrutural (nasce
  em 4A). Mas a **fila de validação do coordenador** (wireframes §4.5) pertence ao módulo do
  coordenador/exportação = **Fase 5**. Recomendação: **tabela + fluxo de dados em 4A; UI da fila
  fica na Fase 5.**
- **D4 — `MilestoneAssessment` real.** `goal_candidacy` "depende de `MilestoneAssessment`"
  (BACKLOG:135), que não tem DDL. ⚠️ **Revisado — recomendação invertida: DEFERIR para a Fase 5.**
  Ambas as revisões convergem: (adversarial) infla o sub-projeto mais arriscado — `goal_candidacy`
  já modela `is_candidate_dominada` e pode acender por contagem de evidência sem a série formal; a
  "série formal de avaliações" é preocupação de relatório/coordenador = Fase 5. (protocolar) a
  imutabilidade V3 exige que `MilestoneAssessmentEvidence` **congele** a classificação as-of o
  fechamento (não referenciar `evidence_current`), e que a recompute retroativa **nunca** toque a
  série realizada — complexidade que não deve entrar junto com o fold+segmentação. **Decisão
  proposta:** 4B acende candidatura por evidência; `MilestoneAssessment` formal fica na Fase 5.

---

## 6. Ordem de execução e commits

Padrão Fase 3 (`feat(fase-3): … (Plano N — DDL/backend/UI)`):

1. `4A DDL` → `4A backend/migração/backfill` → `4A testes RLS`
2. `4B DDL snapshot+assessment` → `4B cômputo/segmentação/candidatura` → `4B testes`
3. `4C DDL reinforcer` → `4C Briefing`
4. `4D landing + scrubber + delta` → `4D trajetória + gráfico + comparação`

Cada sub-projeto: spec própria (curta) → aprovação se tocar dado com registro → implementação →
`/code-review` + verificação → atualizar `BACKLOG.md`.

---

## 7. Riscos conhecidos (entrada para a revisão adversarial)

- R-a: recomputação retroativa de snapshot pode ser cara se a edição for na sessão 1 de 500.
- R-b: backfill de `evidence` a partir de `extraction` precisa mapear `payload`/`payloadEditado`
  para `classificacao_original` sem perder a semântica editada/aprovada.
- R-c: `criterio_dominio` (JSONB por goal) precisa de um avaliador genérico; risco de acoplar a UI
  à forma do JSON.
- R-d: gráficos acessíveis (a11y core) — trajetória colorida precisa de alternativa não-cromática.
- R-e: síncrono-na-aprovação (D1-a) coloca custo de materialização no caminho crítico da aprovação
  do coordenador; medir latência.

---

## 8. Achados das revisões (adversarial + protocolar) e resoluções

Duas revisões Opus independentes rodaram sobre o rascunho `93c5ced`. Consolidação (BLOCKER =
trava DDL; CONCERN = corrigir antes de implementar o sub-projeto; verificado contra schema real).

### 8.1 Adversarial (tech lead)

| # | Achado | Resolução na spec |
| --- | --- | --- |
| B1 | **Materialização síncrona morre no RLS** — candidatura é `coordenador`-only (`0006:305,336`); tx do terapeuta não escreve. | §5 D1 revisado → `SECURITY DEFINER`. |
| B2 | **`evidence_current` VIEW vaza entre tenants** sem `security_invoker=true` (repo nunca criou view). | §9 item 3; teste RLS *através da view* na DoD. |
| B3 | **G5 contradiz a DDL canônica** — `evidence` sem `protocol_id`; `segmentacao` DDL chaveada só por `goal_id`. Grão real = alvo; chave = `(goal_id, protocol_id)`. | G5 corrigido; §9 item 1. |
| B4 | **Backfill sem chave de idempotência** — sem `UNIQUE(extraction_id,…)`; explosão 1:N multi-alvo indefinida. | §9 item 2; §8.3. |
| C5 | Backfill: `classificacao_original = payloadEditado ?? payload`; `session_numero NOT NULL` vs `numero_sequencial` nullable. | §8.3. |
| C6 | Recompute retroativo sem lock → lost update/deadlock com 2 coordenadores. | `pg_advisory_xact_lock(patient_id)`; teste de concorrência na DoD 4B. |
| C7 | Ciclo suave 4A↔4B — 4A congela contrato que 4B define. | §9: DDL de 4A e 4B revisadas **juntas** no gate. |
| C8 | `session_snapshot` sem `clinic_id` é OK (padrão FK-a-paciente, igual `milestone_candidacy`); o gap real é a **política de escrita**. | Política de escrita via definer (B1); leitura espelha `milestone_candidacy_select`. |
| C10 | LGPD: não materializar texto livre/ABC em tabela de alto tráfego. | G6b adicionado. |
| C11 | DoD faltando: `audit_log` em reclassificação/invalidação, teste RLS de view, teste de concorrência, história de rollback do backfill. | §8.4. |

### 8.2 Protocolar (especialista clínico) — por protocolo/regra

| Item | Veredicto | Resolução |
| --- | --- | --- |
| Segmentação `marco_simples` | PASS | mantém ordinal de ajuda. |
| `marco_com_barreira` | **WRONG** (escala de severidade, direção invertida) | G5b: escore de barreira, menor = melhor. |
| `escore_composto` | **WRONG** (mede ajuda, não o escore) | G5b: escore composto sobe = evolução. |
| `faixa_normativa` (Denver) | **WRONG** (linha plana falsa) | G5b: delta idade-equiv. relativo à idade cronológica. |
| Candidatura `N=3/M=2` global | GAP/WRONG por família | §8.3: critério **por Milestone/família**; VB-MAPP puxa de `Milestone.estrutura`; naturalista inclui generalização (R12); PROC **não** usa candidatura por acúmulo. |
| R14 ↔ `segmentacao=REGRESSÃO` | **WRONG** (sinais diferentes) | §8.3: `historico_relevante` projetado de `repertorio_state` (baseline, ambas direções, evento único), **não** de `segmentacao`. Remover a afirmação "destrava R14" acoplada à segmentação. |
| R17 → `reinforcer_profile` | GAP (perde recência/saciação) | §8.3: série ordenada por recência + `valencia`; Briefing rebaixa `saciado`. |
| V2 EvidenceQuery | PASS | tabela separada, `evidence` intocada. |
| V3 MilestoneAssessment | GAP (recompute/dossiê não congelados) | D4 deferido; quando vier: recompute **nunca** toca série realizada; `MilestoneAssessmentEvidence` congela `classificacao_original` as-of. |
| Candidatura vs. query aberta | GAP menor | §8.3: evidência com `EvidenceQuery` aberta não conta em candidatura. |
| Comparação 2 pontos | **WRONG** (troca de protocolo) | G7 adicionado. |

### 8.3 Correções incorporadas ao contrato de dados/lógica

- **Grão de alvo:** fold e segmentação operam sobre `alvos[]` do `classificacao_original`, resolvendo
  `protocol_id` do JSONB. `segmentacao` = `{goal_id: {protocol_id: {tipo_estrutura, metrica, rótulo}}}`.
- **Backfill:** `classificacao_original = payloadEditado ?? payload`; rejeitar `editada` com
  `payloadEditado` nulo; pular `numero_sequencial_paciente IS NULL`; excluir `descartada`;
  chave de idempotência `UNIQUE(extraction_id, goal_id, milestone_id)` (por alvo).
- **`historico_relevante` (R14)** ← `repertorio_state` (baseline as-of), não `segmentacao`.
- **`reinforcer_profile`** = série por recência com `valencia`; `saciado` rebaixa.
- **Candidatura** = por Milestone/família (não default global); exclui evidência com query aberta;
  PROC/observação fora da candidatura por acúmulo.

### 8.4 Definição de Pronto — adendos (todos os sub-projetos)

- Teste de RLS **através da view** `evidence_current` (cross-tenant → 0 linhas), além do teste na
  tabela base.
- `audit_log` gravado em reclassificação/invalidação (ação `'reclassificacao'` já existe no modelo).
- Teste de concorrência do recompute retroativo (2 coordenadores, mesmo paciente).
- História de rollback/re-run idempotente do backfill (DDL toca dado existente → "confirmar antes").
- Teste de segmentação **por `tipo_estrutura`** (os 4 tipos), garantindo que nenhum cruza ordinais.

---

## 9. O que precisa ser reconciliado em `modelo-de-dados.md` ANTES de qualquer DDL

Três achados são **contradições dentro da própria DDL canônica** — não dá para escrever migração
correta sem fechá-las com o Rômulo primeiro (gate de modelo de dados):

1. **Forma de `segmentacao`.** DDL atual (`modelo:746`) comenta `{goal_id: 'evolucao'|…}` (eixo
   único), mas a prosa (`modelo:303-306`) e G5b exigem `{goal_id: {protocol_id: {tipo_estrutura,
   metrica, rótulo}}}`. A forma gravada muda. **Reconciliar a DDL de `session_snapshot.segmentacao`.**
2. **`evidence` e grão de alvo.** DDL (`modelo:682-694`) tem colunas escalares `goal_id`/
   `milestone_id` (1 alvo), mas uma extração aprovada carrega N alvos. Definir explicitamente: 1
   evidência por alvo + `UNIQUE(extraction_id, goal_id, milestone_id)`.
3. **`evidence_current` como view segura.** Adicionar `WITH (security_invoker = true,
   security_barrier = true)` à definição (`modelo:725`), senão vaza entre clínicas.

DDL de **4A e 4B são desenhadas e aprovadas juntas** no gate (evitam o ciclo suave C7).
