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
- **G5 — `nivel_ajuda` não tem escala ordinal global.** Cada `evidence` carrega `protocol_id`;
  compara-se ordinal **apenas dentro da `protocol.taxonomia_ajuda` daquele protocolo**. Nunca
  cruzar ordinais entre protocolos/famílias. `segmentacao` é armazenada **por `protocol_id`**.
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
  Opções: (a) **síncrono na aprovação da evidência** (compute-on-write dentro da mesma transação —
  simples, sem infra nova, ok para volume atual); (b) **trigger + outbox** (Postgres puro, sem
  serviço externo); (c) **cron** (job periódico). Recomendação inicial: **(a) síncrono agora**,
  evoluir para (b) se volume exigir — evita introduzir infra de fila numa fase que já é grande, e
  o pivô VPS ainda não fechou.
- **D2 — Backfill de `evidence`.** Migrar todas as extrações aprovadas existentes para `evidence`,
  ou só passar a gerar `evidence` daqui pra frente? Recomendação: **backfill idempotente** (sem
  ele, timeline/snapshot nascem vazios e sem história). É DDL que toca dado existente → "confirmar
  antes" (CLAUDE.md).
- **D3 — Escopo de `EvidenceQuery` UI.** A tabela `evidence_query` é dependência estrutural (nasce
  em 4A). Mas a **fila de validação do coordenador** (wireframes §4.5) pertence ao módulo do
  coordenador/exportação = **Fase 5**. Recomendação: **tabela + fluxo de dados em 4A; UI da fila
  fica na Fase 5.**
- **D4 — `MilestoneAssessment` real.** `goal_candidacy` "depende de `MilestoneAssessment`"
  (BACKLOG:135), que não tem DDL. Entra na Fase 4 (para acender `goal_candidacy` de verdade) ou
  segue dormente? Recomendação: **criar DDL mínima de `MilestoneAssessment` +
  `MilestoneAssessmentEvidence` em 4B**, pois sem ela a candidatura de goal continua manual e o
  gráfico de progresso perde a série formal de avaliações. *Impacto: aumenta escopo de 4B.*

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
