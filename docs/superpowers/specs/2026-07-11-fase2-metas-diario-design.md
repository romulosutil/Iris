# Fase 2 — Metas Clínicas + Diário Clínico + Fila de Pendências

> **Spec de design** · Issue #5 · branch `fase-2-metas-diario` · 2026-07-11
> Aprovado em brainstorming; segue para plano de implementação (writing-plans).

## 1. Objetivo e escopo

Entregar o **loop do dia do terapeuta** (captura de diário → consolidação → fila
de pendências) e a **fundação de metas clínicas** (Goal/Milestone e critério de
domínio estruturado), assentando o modelo de dados de metas de uma vez, sem
arrastar o agente de extração real (Fase 3).

A extração é isolada atrás de uma **costura (`ExtractionProvider`)**: clínicas de
demonstração recebem um stub que gera sugestões fake plausíveis (demos ponta a
ponta), clínicas de produção ficam em "pendente de reprocessamento" até a Fase 3
plugar o provider real do Claude.

### 1.1 Fora de escopo (deliberado)

| Item | Onde vai |
| --- | --- |
| Chamada real ao Claude, regras R1–R19, hardening prompt-injection | Fase 3 |
| Tabelas `evidence`/`evidence_revision`/`evidence_query` + tela de Revisão completa | Fase 3 |
| Jobs de candidatura (goal/milestone) — cálculo determinístico | Fase 3 (dependem de `evidence`) |
| `session_snapshot` (linha do tempo, decisão 2.5) | Fase 4 |
| Upload de áudio para object storage (MinIO/S3), fila de reenvio confirmada | Fase 6 (Ditado de Voz) — depende da infra |
| `appointment` (recorrência) | Fase futura |

## 2. Decisões travadas (brainstorming 2026-07-11)

1. **Linha de corte = fundação de metas completa.** Todo o DDL de metas/marcos
   nasce agora numa migração coerente, mesmo com lógica de candidatura dormente.
2. **Áudio local, upload adiado.** Grava e guarda no device; sem backend MinIO.
3. **Seed de demonstração de alta fidelidade** para as 4 famílias, gated por
   `clinic.is_demo`. Fidelidade clínica **pendente de revisão de especialista**
   antes de uso em demo real (ver §8).
4. **Costura de extração seam + stub agora, Claude na Fase 3.** `is_demo=true` →
   `DemoStubProvider`; `is_demo=false` → `NullProvider` (pendente).
5. **`session_snapshot` adiado para a Fase 4.**
6. **Tabela `extraction` real criada já na Fase 2** — o stub escreve no contrato
   real, a tela de Revisão da Fase 3 não retrabalha.

## 3. Modelo de dados

Padrão do projeto: tabelas via Drizzle em `src/db/schema.ts`; RLS/GRANT/REVOKE/seed
em migração SQL escrita à mão. Duas migrações novas:

- `0005_fase2_metas_diario` (Drizzle-gerada) — CREATE TABLE + enums + índices.
- `0006_fase2_rls.sql` (à mão) — ENABLE RLS, policies, GRANT explícito por tabela.

### 3.1 Tabelas e estado na Fase 2

| Tabela | Papel | Estado F2 |
| --- | --- | --- |
| `session_note` | `captura_rapida` + `nota_consolidada` por sessão | ativa |
| `audio_capture` | ref do áudio + `status_upload` | criada; só `rascunho_local`/`pendente` |
| `session_protocol_scope` | protocolos que a sessão alimenta (chip) | ativa |
| `goal` | meta + `criterio_dominio` JSONB | ativa (CRUD + ciclo) |
| `goal_milestone_mapping` | meta↔marco M:N (opcional) | ativa |
| `milestone` | marcos por protocolo (JSONB heterogêneo) | ativa (via seed) |
| `extraction` | saída da extração, estado `sugerida` | ativa (stub grava) |
| `goal_candidacy` | materialização "candidata a dominada" | dormente (schema só) |
| `milestone_candidacy` | materialização "candidato a avaliação" | dormente (schema só) |
| `clinic.is_demo` | flag de clínica de demonstração (coluna nova) | ativa |

`session_snapshot` **não** é criada nesta fase (adiada F4).

### 3.2 DDL de referência (do modelo-de-dados.md, com ajustes da fase)

Enums novos:

```sql
CREATE TYPE goal_estado AS ENUM ('rascunho','ativa','dominada','pausada','descontinuada');
CREATE TYPE session_protocol_scope_origem AS ENUM ('inferido_disciplina','ajustado_manualmente');
CREATE TYPE session_note_tipo AS ENUM ('captura_rapida','nota_consolidada');
CREATE TYPE audio_status_upload AS ENUM ('rascunho_local','pendente','confirmado','falhou');
CREATE TYPE extraction_estado AS ENUM ('sugerida','pendente_reprocessamento');
```

`session_note` (nasce nesta fase — só era referenciada):

```sql
CREATE TABLE session_note (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES session(id),
  clinic_id UUID NOT NULL REFERENCES clinic(id),
  tipo session_note_tipo NOT NULL,
  texto TEXT NOT NULL,
  autor_id UUID NOT NULL REFERENCES app_user(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, tipo)   -- 1 captura_rapida + 1 nota_consolidada por sessão
);
```

`goal`, `goal_milestone_mapping`, `milestone`, `goal_candidacy`,
`milestone_candidacy`, `session_protocol_scope`: conforme DDL de
`docs/dados/modelo-de-dados.md` §3. `extraction` conforme a mesma §3
(tabela `extraction`, ~linhas 654–674) no estado `sugerida`.

`clinic.is_demo`:

```sql
ALTER TABLE clinic ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
```

> ⚠️ `clinic` já tem dado de teste — a migração é **aditiva** (coluna com DEFAULT),
> mas por tocar tabela com dado, **confirmar antes de aplicar no remoto** (regra
> CLAUDE.md).

### 3.3 Reconciliações de nomenclatura

- A policy `therapist_edits_own_sessions` do modelo de dados referencia
  `session.profissional_id`; a coluna real em `session` é **`terapeuta_id`**
  (schema.ts). A RLS de `session_note` usa `terapeuta_id`.

### 3.4 `numero_sequencial_paciente`

Coluna já existe em `session` (nullable desde a 1d). É **populada na
consolidação** (`consolidarSessao`): na primeira `nota_consolidada` da sessão,
atribui o próximo inteiro sequencial por paciente. Base da linha do tempo e de
`evidence.session_numero` (F3/F4).

## 4. Costura de extração — `ExtractionProvider`

Interface fina, uma responsabilidade: dada uma sessão consolidada, produzir (ou
não) extrações no estado apropriado.

```
interface ExtractionProvider {
  extrair(sessionId, notaConsolidada, contexto): Promise<void>
}
```

- `DemoStubProvider` — gera N extrações fake plausíveis (subtipos variados do
  `output-schema.json`), grava linhas `extraction` estado `sugerida`, ligadas a
  metas ativas do paciente. Popula a Fila ("N sugestões prontas / Revisar").
- `NullProvider` — grava nada de sugestão; marca a extração como
  `pendente_reprocessamento` (mesmo estado do caminho de falha real dos
  wireframes). Nenhum LLM.

Roteamento em `consolidarSessao`:

```
provider = clinic.is_demo ? DemoStubProvider : NullProvider
```

Quando a Fase 3 chegar: adicionar `ClaudeProvider` (R1–R19 + hardening +
contexto de metas/protocolos) e trocar o roteamento de produção — mudança de uma
linha; Fila e tela de Revisão já exercitadas pelo stub.

**Guardrail #6 preservado:** nenhum código chama LLM nesta fase.

## 5. Fluxos de UI (Design System, mobile-first)

### 5.1 Diário / captura (a partir do check-in da agenda)

- Toggle **Texto / Áudio**; chip de protocolo **pré-preenchido pela disciplina**
  do profissional, tocável para corrigir → grava `session_protocol_scope`
  (`origem = ajustado_manualmente` quando editado).
- **Salvamento local primeiro** (rascunho), depois persiste `session_note`
  `captura_rapida`.
- **Áudio local:** `MediaRecorder` → blob em IndexedDB. Controles obrigatórios
  antes de confirmar: **ouvir**, **descartar** (apaga o rascunho local),
  **regravar**. Estado `audio_capture.status_upload = 'rascunho_local'`. Nota de
  privacidade ("ninguém ouve exceto você até a consolidação"). Sem upload.

### 5.2 Consolidação

- Formulário de **nota consolidada** (texto final revisado) → `consolidarSessao`:
  grava `session_note` `nota_consolidada`, popula `numero_sequencial_paciente`,
  chama o provider. Idempotente-seguro (reconsolidar não duplica sequencial).

### 5.3 Fila de pendências (`/pendencias` + banner no topo da agenda)

Itens da Fase 2:
- **capturas a consolidar** (captura_rapida sem nota_consolidada),
- **extração pendente de reprocessamento** (produção),
- **N sugestões prontas / Revisar** (só demo, do stub).

Ação `Consolidar →` abre a nota consolidada; `Revisar →` (demo) é o gancho para a
tela de Revisão que a Fase 3 completa.

### 5.4 Metas (`/pacientes/[id]/metas`)

- Lista por estado + **Nova meta** (coordenador + terapeuta): descrição em
  linguagem simples, disciplina, **mapear marco(s) opcional**, **critério de
  domínio = formulário N/M** ("N acertos independentes em M sessões
  consecutivas" — nunca texto livre), ciclo de revisão 8–12 semanas.
- Estados `rascunho → ativa → pausada/descontinuada`; transição para `dominada`
  é **manual pelo coordenador** na revisão de ciclo.
- `goal_candidacy` dormente → a UI **não** exibe "candidata a dominada" nesta
  fase (evita falsa sensação de progresso — princípio dos estados provisórios).

## 6. Autorização (requireRole) e RLS

- **`requireRole`** (guard de app já existente): criar meta = qualquer um dos
  papéis coordenador **ou** terapeuta (não exige os dois juntos); transição
  `dominada` = só coordenador; consolidar/capturar diário = terapeuta da sessão
  (recepção/coordenação não escrevem nota clínica, só enxergam a agenda).
- **RLS (migração à mão)**, espelhando os padrões da 1b/1c/1d:
  - `session_note`: leitura no tenant (prontuário integral); **UPDATE só das
    próprias notas** via `session.terapeuta_id` (policy `therapist_edits_own`).
  - `goal` / `goal_milestone_mapping`: escopo `clinic_id`/`patient_id`.
  - `milestone` / `protocol`: catálogo, leitura no tenant.
  - `session_protocol_scope`: herda escopo de `session`.
  - `extraction`: escopo do tenant; estado `sugerida`.
  - `audio_capture`: escopo da sessão/tenant.
  - **GRANT explícito** para o app role em cada tabela nova (o GRANT global da
    0001 é point-in-time).
- `extraction` **não** recebe `REVOKE UPDATE/DELETE` nesta fase (imutabilidade é
  de `evidence`, que nasce na F3); extração `sugerida` ainda é mutável/descartável.

## 7. Testes (padrão do projeto)

- **Integração RLS** contra Postgres, por tabela nova: isolamento cross-tenant;
  terapeuta edita só a própria nota; recepção não vê dado clínico onde não deve;
  criar meta barrado para papel errado.
- **Unit**: form de critério de domínio (N/M válidos, sem texto livre);
  roteamento do provider por `is_demo`; `consolidarSessao` idempotente
  (sequencial não duplica).
- **a11y (axe)**: gate zero-violação nas telas novas (diário, fila, metas).
- **E2E (Playwright)** contra servidor real: fluxo demo diário → consolidação →
  stub gera sugestões → aparecem na Fila.

## 8. Seed de demonstração (`clinic.is_demo = true`)

Fatia real, representativa e de **alta fidelidade** de cada uma das 4 famílias,
na estrutura JSONB heterogênea por `tipo_estrutura`:

- **VB-MAPP** (`aba_marcos_desenvolvimento`): marcos de mando, tato, ouvinte,
  intraverbal por nível.
- **Denver/ESDM** (`intervencao_naturalista`): itens de checklist por nível de
  desenvolvimento.
- **PROC** (`fonoaudiologia`): itens de avaliação de linguagem.
- **ABLLS-R** (`aba_marcos_desenvolvimento`): repertórios básicos.

O seed monta uma clínica demo completa: paciente + metas ativas (com mapeamento a
marcos) + protocolos + sessões com capturas → stub gera sugestões → Fila e
gancho de Revisão demonstráveis ponta a ponta.

> ⚠️ **Fidelidade clínica pendente de revisão** do Rômulo / especialista antes de
> uso em demo real de vendas. O conteúdo gerado é um rascunho de boa-fé, não
> validado clinicamente.

## 9. Riscos e pontos de atenção

- **Áudio no browser:** `MediaRecorder` + IndexedDB têm variação por
  navegador/permissão de microfone; a UI precisa de estados de erro (permissão
  negada, sem suporte) sem perder o rascunho de texto.
- **`is_demo` e vazamento de dado fake:** garantir que o stub **nunca** roda para
  `is_demo=false` (teste explícito do roteamento) — dado fake em prontuário real
  seria grave.
- **Migração toca `clinic`** (dado existente): confirmar antes de aplicar no
  remoto.
- **Conteúdo clínico do seed** não é validado — marcado como pendente.
