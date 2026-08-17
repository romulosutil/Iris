# Design Técnico: Refatoração do Design System "Iris" (Espectro Brutal)

> **Issue:** #236  
> **Status:** 🟢 Design Consolidado  
> **Camadas:** `primitives/`, `ui/`, `patterns/`  
> **Data:** 11/08/2026

---

## 1. Arquitetura de Primitivos e Utilitários

### 1.1 Utilitários `surface()` e `control()`

Localização: `src/components/ui/primitives/surface.ts` e exportado em `src/lib/design-system.ts`.

#### `surface(variante, opts)`

Garante a consistência de bordas, sombras e raios sem repetição manual de classes:

```typescript
export type SurfaceVariante = "solida" | "sugerida" | "candidata";
export type ElevationNivel =
  "flat" | "raise" | "base" | "hover" | "inset" | "overlay";
export type RadiusNivel =
  "none" | "xs" | "sm" | "control" | "md" | "lg" | "xl" | "2xl" | "pill";

export interface SurfaceOpts {
  elevation?: ElevationNivel;
  radius?: RadiusNivel;
  className?: string;
}

export function surface(
  variante: SurfaceVariante = "solida",
  opts: SurfaceOpts | string = {},
): string;
```

**Comportamento do Eixo de Profundidade:**

- `solida` (Fato / Aprovado):
  - Borda: `border-[length:var(--border-brutal-width)] border-border-brutal` (sólida `#1A1A1A`)
  - Elevação Default: `base` (`shadow-[var(--ds-shadow)]` — **LEVANTA**)
  - Raio Default: `md` (`rounded-[var(--radius-md)]`)
- `sugerida` (Sugerido por IA):
  - Borda: `border-[length:var(--border-brutal-width)] border-dashed border-status-ia-border` (tracejado violeta)
  - Elevação Default: `inset` (`shadow-[var(--elevation-inset)]` — **AFUNDA**)
  - Raio Default: `md`
- `candidata` (Marco Candidato):
  - Borda: `border-[length:var(--border-brutal-width)] border-dotted border-status-info-bg` (pontilhado azul)
  - Elevação Default: `inset` (`shadow-[var(--elevation-inset)]` — **AFUNDA**)
  - Raio Default: `md`

#### `control(tamanho, opts)`

Garante áreas mínimas de toque (≥44px / `min-h-11 min-w-11`), foco ortogonal e tipografia:

```typescript
export type ControlTamanho = "sm" | "md" | "lg";

export interface ControlOpts {
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

export function control(
  tamanho: ControlTamanho = "md",
  opts: ControlOpts = {},
): string;
```

---

### 1.2 Componente Primitivo `Pill`

Localização: `src/components/ui/primitives/pill.tsx`.

Átomo visual sem acoplamento a regras de negócio. Usado como base para tags, selos e contêineres arredondados.

```typescript
export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "solid" | "outline" | "ghost" | "inset";
  colorScheme?:
    "neutral" | "brand" | "menta" | "ouro" | "violeta" | "azul" | "coral";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  children: React.ReactNode;
}
```

---

## 2. Refatoração da Base Atômica & Acessibilidade

### 2.1 `Button` (`src/components/ui/button.tsx`)

- Compor `surface()` e `control()` em todas as variantes (`primary`, `secondary`, `destructive`, `ghost`, `link`).
- Manter o foco ortogonal brutalista (`focus-visible:outline-3 focus-visible:outline-ink-anchor focus-visible:outline-offset-2`).

### 2.2 `Card` (`src/components/ui/card.tsx`)

- Compor `surface("solida")` ou `surface("sugerida")` / `surface("candidata")`.
- Remover a antiga hachura manual do Card para o estado candidato; aplicar a borda tracejada + sombra inset + ícone `LayersIcon`.
- Substituir o selo inline antigo por `Pill` ou `StatusBadge`.

### 2.3 `Input` (`src/components/ui/input.tsx`) & `Dialog` (`src/components/ui/dialog.tsx`)

- `Input`: compor `control()` para garantir altura mínima `min-h-11` e foco consistente.
- `Dialog`: compor `surface("solida", { elevation: "overlay", radius: "lg" })`.
- Botão de fechar do `Dialog`: garantir `min-h-11 min-w-11` (44×44px) e posicionamento acessível ao polegar.

### 2.4 `Chip` (`src/components/ui/chip.tsx`)

- Adicionar `min-w-11` garantindo a dimensão mínima de toque de 44×44px.
- Tratar acessibilidade para chips duplos (selecionável + botão de remoção) usando agrupamento semântico com rótulos `aria-label` descritivos para leitores de tela.

---

## 3. Padrões Clínicos e Domínio (`patterns/`)

### 3.1 `StatusBadge` (`src/components/ui/patterns/status-badge.tsx`)

- Vocabulário unificado em `extraction_estado`:
  - `sugerida`: Violeta + `SparkleIcon` + rótulo "Sugerida"
  - `aprovada`: Menta + `CheckIcon` + rótulo "Aprovada"
  - `editada`: Ouro + `EditIcon` / `PencilIcon` + rótulo "Editada"
  - `descartada`: Neutro/Muted + `TrashIcon` / `XIcon` + rótulo "Descartada"
  - `pendente`: Amarelo/Ouro + `ClockIcon` + rótulo "Pendente"
  - `reclassificada`: Azul + `LayersIcon` + rótulo "Reclassificada"
  - `devolvida`: Coral + `AlertTriangleIcon` + rótulo "Devolvida"
- **Regra Espectro Brutal §4C:** É mandatório renderizar o par **Ícone + Texto**.

### 3.2 `ConfidenceCard` (`src/components/ui/patterns/confidence-card.tsx`)

- Compõe `Surface` + `Pill` + indicador de fricção.
- Níveis de fricção:
  - Baixa fricção: Verde/Menta (aprovação recomendada)
  - Média fricção: Amarelo/Ouro (necessita revisão atenta)
  - Alta fricção: Coral (inconsistência ou conflito de dados)
- Ações rápidas: Aprovar, Editar, Descartar.

### 3.3 `CompareRow` (`src/components/ui/patterns/compare-row.tsx`)

- Layout de comparação em duas colunas com contraste claro entre Dado Anterior vs. Novo Dado Extraído por IA.
- Indicador visual de discrepância e justificativa clínica.

### 3.4 `BatchBar` (`src/components/ui/patterns/batch-bar.tsx`)

- Barra fixa na base da tela com contagem de itens selecionados e botão de aprovação em lote com proteção para itens de alta fricção.

---

## 4. Novos Componentes de Domínio (Fases 1/3 e 4/5)

### 4.1 `AgendaCalendarGrid` (`src/components/ui/agenda-calendar-grid.tsx`)

#### Arquitetura de Layout

- **Prop `view: 'day' | 'week'`**:
  - `'day'`: Visão de 1 coluna em tela cheia otimizada para terapeuta em mobile.
  - `'week'`: Grade semanal com múltiplas colunas de terapeutas/disciplinas para coordenador em desktop.
- **Tratamento de Textos Longos**: Classes de truncamento (`truncate`) combinadas com atributo `title` nativo ou tooltip acessível.
- **Tratamento de Slots Curtos (<30min)**: Layout interno do bloco migra automaticamente para `flex-row items-center gap-1.5` compacto.
- **Colisão e Sobreposição**: Posicionamento com largura proporcional em sub-colunas paralelas (`calc(100% / N)`).
- **Semântica dos Estados do Bloco de Evento**:
  - _Concluído_: Fundo Menta (`#B2DFDB`) com borda sólida `#1A1A1A`.
  - _Em andamento / Próximo_: Fundo Amarelo Ouro (`#F2B705`) com sombra destacada `3px 3px 0px #1A1A1A`.
  - _Sugerido por IA / Encaixe_: Fundo suave, borda tracejada Violeta (`#6A4C93`).
- **Acessibilidade**: Alvo de toque ≥44px (`min-h-11 min-w-11`), foco ortogonal `outline: 3px solid #2274A5`.

---

### 4.2 `ProtocolDashboardCharts` (`src/components/ui/protocol-dashboard-charts.tsx`)

Construído puramente em CSS e SVG nativos com Tailwind v4 (sem dependências externas de gráficos).

#### 1. `ProtocolProgressBarChart`

- Barra horizontal proporcional com borda brutalista `#1A1A1A` e cantos arredondados de 8px.
- **Segmento Sólido (Metas Consolidadas)**: Fundo Menta `#B2DFDB`.
- **Segmento Hachurado Denso (Sugerido por IA / Candidatas)**:
  ```css
  background: repeating-linear-gradient(
    -45deg,
    var(--color-violet-ai-light, #f3e8ff),
    var(--color-violet-ai-light, #f3e8ff) 3px,
    var(--color-violet-ai, #6a4c93) 3px,
    var(--color-violet-ai, #6a4c93) 6px
  );
  ```
  Suporta faixas ultrafinas (2% a 5%) sem quebra visual.
- **Legenda e Métricas**: Exibição numérica precisa ("42 Evidências Aprovadas") e badge de tendência (`+3 esta semana`).

#### 2. `ProtocolTrendChart`

- Gráfico de linha temporal de evolução entre sessões (Eixo X: Sessão 1 a N).
- SVG vetorial nativo com linha contrastante, preenchimento suave de área e nós de conquista circulares com ícone e tooltip no hover/focus.

---

## 5. Taxonomia Storybook

Todas as estórias em `src/stories/` e `src/components/ui/*.stories.tsx` serão padronizadas estritamente:

- `FOUNDATIONS/*`: Cores, Tipografia, Sombras, Ícones, Eixo de Profundidade
- `ATOMS/*`: Button, Pill, Input, Checkbox, Select, Chip, VisuallyHidden
- `MOLECULES/*`: Card, AppointmentCard, SearchInput, KpiCard, MetricCard, Banner, Alert
- `ORGANISMS/*`: Header, AgendaCalendarGrid, ProtocolDashboardCharts, ConfidenceCard, CompareRow, BatchBar
- `LAYOUT/*`: PageHeader, Container, Split, Cluster, Stack
- `PAGES/*`: Telas e fluxos integrados
