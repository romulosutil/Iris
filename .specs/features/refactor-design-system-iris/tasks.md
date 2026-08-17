# Refatoração do Design System "Iris" — Tarefas de Implementação

> **For agentic workers:** Execute task-by-task. Ao fim de cada tarefa: rode o gate declarado, atualize o Status neste arquivo e faça um commit atômico com a mensagem sugerida.
> **Instrução de Qualidade:** Respeite a regra de não omissão: gere código 100% completo, sem placeholders ou `// ...`.

**Goal:** Refatorar e expandir o Design System "Iris" (Espectro Brutal) com estrutura atômica pragmática (`primitives/`, `ui/`, `patterns/`), utilitários `surface()`/`control()`, eixo de profundidade (fato levanta / sugestão afunda com inset), vocabulário clínico único em `StatusBadge`/`Card`, correções de a11y (≥44px touch targets), e implementação de `AgendaCalendarGrid` e `ProtocolDashboardCharts` com estórias e testes no Storybook.

**Architecture:**

- `primitives/`: `surface()`, `control()`, `Pill`, `Text`, `VisuallyHidden`.
- `ui/`: `Button`, `Card`, `Input`, `Dialog`, `Chip`, `Select`, etc.
- `patterns/`: `StatusBadge`, `ConfidenceCard`, `CompareRow`, `BatchBar`.
- `organisms/`: `AgendaCalendarGrid`, `ProtocolDashboardCharts` (`ProtocolProgressBarChart` + `ProtocolTrendChart`).

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, PostCSS, Radix UI Primitives, Vitest, Axe-core, Storybook.

---

### Task 1: Governança, Arquitetura e Registro de Inventário

**Files:**

- Modify: `docs/ux/inventario-componentes.md`
- Modify: `src/components/ui/*.stories.tsx` / `src/stories/**/*.stories.tsx`

**Status:** `[x]`

- [x] **Step 1: Atualizar o inventário de componentes**
  - Em `docs/ux/inventario-componentes.md`, adicionar a entrada formal de `AgendaCalendarGrid` na tabela da Fase 1 (`src/components/ui/agenda-calendar-grid.tsx`, status: _Em implementação / Formalizado em ui/_).
  - Adicionar a família `ProtocolDashboardCharts` (`ProtocolProgressBarChart` + `ProtocolTrendChart`) na tabela das Fases 4 & 5 (`src/components/ui/protocol-dashboard-charts.tsx`, status: _Em implementação / Formalizado em ui/_).

- [x] **Step 2: Alinhar taxonomia de títulos no Storybook**
  - Auditar e alinhar as estórias em `src/components/ui/*.stories.tsx` e `src/stories/` para a árvore padronizada:
    - `FOUNDATIONS/*` (Tokens, Cores, Tipografia, Sombras, Ícones)
    - `ATOMS/*` (Button, Badge, Chip, Input, StatusIndicator, VisuallyHidden)
    - `MOLECULES/*` (Card, AppointmentCard, SearchInput, KpiCard, Pill, Banner, Alert)
    - `ORGANISMS/*` (Header, AgendaCalendarGrid, ProtocolDashboardCharts, ConfidenceCard, CompareRow, BatchBar)
    - `LAYOUT/*` (PageHeader, Container, Layout)
    - `PAGES/*` (Visualizações completas)

- [x] **Step 3: Gate de verificação**
  - Rodar `pnpm typecheck`
  - Expected: PASS (0 erros).

- [x] **Step 4: Commit**
  ```bash
  git add docs/ux/inventario-componentes.md src/components/ui/*.stories.tsx src/stories/ .specs/features/refactor-design-system-iris/
  git commit -m "docs(ds): atualiza inventário de componentes e alinha taxonomia do Storybook (#236)"
  ```

---

### Task 2: Refatoração da Base Atômica, Utilitários e Acessibilidade (D1, D2, D3, D4)

**Files:**

- Create: `src/components/ui/primitives/pill.tsx`
- Create / Modify: `src/components/ui/primitives/surface.ts`
- Create: `src/components/ui/primitives/control.ts`
- Create / Modify: `src/lib/design-system.ts`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/chip.tsx`
- Modify: `src/components/ui/status-badge.tsx`
- Modify: `src/components/ui/a11y.test.tsx`

**Status:** `[x]`

- [x] **Step 1: Utilitários `surface()` e `control()`**
  - Implementar `surface()` em `src/components/ui/primitives/surface.ts` com variantes `solida` (levanta com `--ds-shadow`), `sugerida` (tracejada + afunda com `--elevation-inset`), `candidata` (pontilhada + afunda com `--elevation-inset`).
  - Implementar `control()` em `src/components/ui/primitives/control.ts` garantindo `min-h-11 min-w-11` (≥44px), foco visível ortogonal e bordas.
  - Re-exportar em `src/lib/design-system.ts` para fácil consumo.

- [x] **Step 2: Componente Primitivo `Pill`**
  - Criar `src/components/ui/primitives/pill.tsx` com variantes `solid | outline | ghost | inset`, suporte a ícones e children.

- [x] **Step 3: Migração de `Button`, `Card`, `Input`, `Dialog`**
  - `Button`: compor `surface()` e `control()`.
  - `Card`: compor `surface("solida")` e `surface("sugerida" | "candidata")`, remover hachura antiga do Card, usar borda tracejada + inset + ícone `LayersIcon`, substituir selo inline por `Pill`/`StatusBadge`.
  - `Input`: compor `control()`.
  - `Dialog`: compor `surface()`, ajustar botão fechar para `min-h-11 min-w-11` (≥44px) e posição confortável.

- [x] **Step 4: Vocabulário Único em `StatusBadge` e Regra Espectro Brutal §4C**
  - Atualizar `StatusBadge` para usar `extraction_estado` (`sugerida`, `aprovada`, `editada`, `descartada`, `pendente`, `reclassificada`, `devolvida`).
  - Garantir obrigatoriamente o par **Ícone Redundante + Rótulo Textual**.

- [x] **Step 5: Correções de Acessibilidade (a11y)**
  - Em `src/components/ui/chip.tsx`: adicionar `min-w-11` garantindo alvo de toque ≥44px.
  - Agrupar e rotular botões em chips de ação dupla (selecionável + remoção) para leitores de tela.
  - Atualizar `a11y.test.tsx` com testes de regressão para `Pill`, `Chip`, `Card`, `Dialog`, `Button`.

- [x] **Step 6: Gate de verificação**
  - Rodar `pnpm typecheck`
  - Rodar `pnpm vitest run src/components/ui/a11y.test.tsx`
  - Expected: PASS.

- [x] **Step 7: Commit**
  ```bash
  git add src/components/ui/primitives/ src/lib/design-system.ts src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/input.tsx src/components/ui/dialog.tsx src/components/ui/chip.tsx src/components/ui/status-badge.tsx src/components/ui/a11y.test.tsx
  git commit -m "feat(ui): implementa surface/control, Pill, refatora Card/Button/Input e corrige a11y (#236)"
  ```

---

### Task 3: Componentes de Padrão e Revisão da Fase 3 (D5: ConfidenceCard, CompareRow, BatchBar)

**Files:**

- Create: `src/components/ui/patterns/confidence-card.tsx`
- Create: `src/components/ui/patterns/confidence-card.stories.tsx`
- Create: `src/components/ui/patterns/compare-row.tsx`
- Create: `src/components/ui/patterns/compare-row.stories.tsx`
- Create: `src/components/ui/patterns/batch-bar.tsx`
- Create: `src/components/ui/patterns/batch-bar.stories.tsx`
- Modify: `src/components/ui/a11y.test.tsx`

**Status:** `[x]`

- [x] **Step 1: Implementar `ConfidenceCard`**
  - Criar `src/components/ui/patterns/confidence-card.tsx` compondo `Surface` + `Pill` + indicador de fricção/confiança + ações rápidas.
  - Criar `src/components/ui/patterns/confidence-card.stories.tsx` sob `ORGANISMS/ConfidenceCard`.

- [x] **Step 2: Implementar `CompareRow`**
  - Criar `src/components/ui/patterns/compare-row.tsx` para exibição lado a lado de inconsistências/histórico anterior.
  - Criar `src/components/ui/patterns/compare-row.stories.tsx` sob `ORGANISMS/CompareRow`.

- [x] **Step 3: Implementar `BatchBar`**
  - Criar `src/components/ui/patterns/batch-bar.tsx` para aprovação em lote de itens elegíveis com contadores e proteção.
  - Criar `src/components/ui/patterns/batch-bar.stories.tsx` sob `ORGANISMS/BatchBar`.

- [x] **Step 4: Adicionar testes de a11y**
  - Em `src/components/ui/a11y.test.tsx`, adicionar testes para `ConfidenceCard`, `CompareRow` e `BatchBar`.

- [x] **Step 5: Gate de verificação**
  - Rodar `pnpm typecheck`
  - Rodar `pnpm vitest run src/components/ui/a11y.test.tsx`
  - Expected: PASS.

- [x] **Step 6: Commit**
  ```bash
  git add src/components/ui/patterns/ src/components/ui/a11y.test.tsx
  git commit -m "feat(ui): implementa componentes de padrão ConfidenceCard, CompareRow e BatchBar (#236)"
  ```

---

### Task 4: Implementação e Stories de `AgendaCalendarGrid`

**Files:**

- Modify / Rewrite: `src/components/ui/agenda-calendar-grid.tsx`
- Create / Modify: `src/components/ui/agenda-calendar-grid.stories.tsx`
- Modify: `src/components/ui/a11y.test.tsx`

**Status:** `[x]`

- [x] **Step 1: Implementar `AgendaCalendarGrid`**
  - Criar componente com prop `view: 'day' | 'week'`, suporte a terapeutas e disciplinas.
  - Implementar truncamento de texto em nomes longos e disciplinas (`truncate` + atributo `title`/tooltip nativo).
  - Implementar tratamento de slots curtos (<30min) com layout compacto `flex-row`.
  - Implementar visualização de colisão/sobreposição de horários em sub-colunas paralelas.
  - Implementar blocos de evento `AppointmentSlot` com estados semânticos:
    - _Concluído_: Fundo Menta (`#B2DFDB`) com borda sólida `#1A1A1A`.
    - _Em andamento / Próximo_: Fundo Amarelo Ouro (`#F2B705`) com sombra destacada `3px 3px 0px #1A1A1A`.
    - _Sugerido por IA / Encaixe_: Fundo suave, borda tracejada Violeta (`#6A4C93`).
  - Garantir alvos de toque ≥44×44px (`min-h-11 min-w-11`) e foco ortogonal visível (`outline: 3px solid #2274A5`).
  - Usar ícones nativos de `src/components/ui/icon.tsx` e datas com `Intl.DateTimeFormat`.

- [x] **Step 2: Criar Stories do Storybook**
  - Criar `src/components/ui/agenda-calendar-grid.stories.tsx` sob `ORGANISMS/AgendaCalendarGrid`:
    - `DefaultDayView` (visão diária para terapeuta mobile)
    - `WeekViewCoordinator` (visão semanal multi-coluna desktop)
    - `WithAISuggestedSlots` (com sugestões de encaixe por IA)
    - `EmptyStateAgenda` (estado vazio)

- [x] **Step 3: Testes de Acessibilidade**
  - Adicionar teste axe em `src/components/ui/a11y.test.tsx`.

- [x] **Step 4: Gate de verificação**
  - Rodar `pnpm typecheck`
  - Rodar `pnpm vitest run src/components/ui/a11y.test.tsx`
  - Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add src/components/ui/agenda-calendar-grid.tsx src/components/ui/agenda-calendar-grid.stories.tsx src/components/ui/a11y.test.tsx
  git commit -m "feat(ui): implementa AgendaCalendarGrid com views dia/semana, colisão e stories (#236)"
  ```

---

### Task 5: Implementação e Stories dos Gráficos do Protocolo (`ProtocolDashboardCharts`)

**Files:**

- Create: `src/components/ui/protocol-dashboard-charts.tsx`
- Create: `src/components/ui/protocol-dashboard-charts.stories.tsx`
- Modify: `src/components/ui/a11y.test.tsx`

**Status:** `[x]`

- [x] **Step 1: Implementar `ProtocolDashboardCharts` em Soft Neubrutalism**
  - Em `src/components/ui/protocol-dashboard-charts.tsx`:
    - Implementar `ProtocolProgressBarChart`:
      - Barra horizontal dividida proporcionalmente com cantos arredondados de 8px e borda brutalista `#1A1A1A`.
      - Segmento Sólido (Menta `#B2DFDB`): Metas consolidadas.
      - Segmento Hachurado Denso (Violeta `#6A4C93`): Sugeridas por IA com CSS nativo (`repeating-linear-gradient` `3px/6px`).
      - Legenda com contagem exata e badge de tendência (`+3 esta semana`).
    - Implementar `ProtocolTrendChart`:
      - Trajetória temporal de sessões em SVG vetorial nativo + Tailwind v4.
      - Nós de conquista com ícones e tooltip interativo de evidências.

- [x] **Step 2: Criar Stories do Storybook**
  - Criar `src/components/ui/protocol-dashboard-charts.stories.tsx` sob `ORGANISMS/ProtocolDashboardCharts`:
    - `ProgressByProtocol` (comparativo VB-MAPP, ABLLS-R, Denver)
    - `FactVsSuggestionComparison` (sólido menta vs. hachura violeta)
    - `DashboardExecutiveView` (composição com métricas, tendência e barra acumulada)

- [x] **Step 3: Testes de Acessibilidade**
  - Adicionar testes axe em `src/components/ui/a11y.test.tsx`.

- [x] **Step 4: Gate de verificação**
  - Rodar `pnpm typecheck`
  - Rodar `pnpm vitest run src/components/ui/a11y.test.tsx`
  - Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add src/components/ui/protocol-dashboard-charts.tsx src/components/ui/protocol-dashboard-charts.stories.tsx src/components/ui/a11y.test.tsx
  git commit -m "feat(ui): implementa ProtocolDashboardCharts com hachura densa de IA e stories (#236)"
  ```

---

### Task 6: Reorganização Física de Diretórios & Validação Final

**Files:**

- Create / Reorganize: `src/components/ui/primitives/`, `src/components/ui/patterns/`
- Re-exports / Index: `src/components/ui/index.ts`
- Modify: arquivos consumidores conforme necessário

**Status:** `[x]`

- [x] **Step 1: Consolidar estrutura física**
  - Garantir átomos puros em `src/components/ui/primitives/` (`surface.ts`, `control.ts`, `pill.tsx`, etc.).
  - Garantir organismos de domínio em `src/components/ui/patterns/` (`status-badge.tsx`, `confidence-card.tsx`, `compare-row.tsx`, `batch-bar.tsx`).
  - Manter re-exports em `src/components/ui/index.ts` e em arquivos de topo para garantir que nenhuma importação existente na aplicação seja quebrada.

- [x] **Step 2: Validação completa de qualidade**
  - Rodar `pnpm typecheck` (0 erros).
  - Rodar `pnpm vitest run src/components/ui/a11y.test.tsx` (todos os testes axe verdes).
  - Rodar `pnpm lint` (0 avisos/erros).

- [x] **Step 3: Atualizar BACKLOG.md e fechar checklist**
  - Atualizar entrada da Issue #236 no `BACKLOG.md`.

- [x] **Step 4: Commit final**
  ```bash
  git add src/components/ui/ BACKLOG.md .specs/features/refactor-design-system-iris/
  git commit -m "refactor(ds): conclui reorganização atômica do Design System Iris (#236)"
  ```
