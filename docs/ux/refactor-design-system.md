# Refactor do Design System — estrutura atômica pragmática

> Status: **proposta aprovada** (Rômulo, 12/07/2026) · branch `refactor-ds-atomico`.
> Objetivo declarado pelo Rômulo: **acelerar a UI da Fase 3** (tela de revisão de
> extrações). Este refactor é investimento de velocidade, não reescrita.

## Diagnóstico (o que "não está atômico" significa aqui)

O DS atual (`src/components/ui/`, 20 componentes) é **bem construído** — `cn`
consistente, tokens via CSS vars, a11y de primeira (pistas redundantes, focus
ortogonal), stories + gate axe. O problema não é qualidade, é **estrutura e
duplicação**:

1. **Superfície brutalista copiada** — a base `border-ink-anchor border-2
   shadow-[var(--ds-shadow)]` (sólida) e a variante tracejada se repetem à mão em
   `Button`, `Card`, `StatusBadge`, `Input`. Sem fonte única → deriva garantida.
2. **"Pílula de estado" duplicada** — `Card` tem um selo inline
   (conquistado/candidato) e `StatusBadge` tem outro, com **vocabulários de estado
   diferentes** (`StatusBadge`: sugerida/aprovada/reclassificada/devolvida; `Card`:
   conquistado/candidato).
3. **Três linguagens visuais para "tentativo"** — a incoerência mais perigosa
   para uma tela clínica de revisão:
   - `StatusBadge` sugerida → **violeta tracejado** (`--color-suggested`)
   - `Card` candidato → **graphite tracejado + hachura**
   - wireframe §3 candidato → **azul pontilhado**
4. **Pasta flat** — 20 arquivos num nível, átomos puros misturados com
   componentes de domínio (StatusBadge conhece estados clínicos).

## Decisões de design (Design Lead)

**D1 — Atômico pragmático, não dogmático.** 3 camadas, não 5:
- `ui/primitives/` — átomos sem domínio: `Surface`, `Pill`, `Text`, `VisuallyHidden`.
- `ui/` — átomos/moléculas de forma: Button, Input, Field, Checkbox, Select, Dialog…
- `ui/patterns/` (ou `components/domain/`) — organismos cientes de domínio:
  StatusBadge, e os novos cartões de revisão.
Sem churn de renomear tudo — mover só o que ganha clareza.

**D2 — `Surface` é a fonte única da superfície brutalista.** Um primitivo com
`variante`: `solida` (fill + borda âncora + sombra dura) | `sugerida` (violeta
tracejado, sem fill) | `candidata` (azul pontilhado). Button/Card/Badge/Input
compõem `Surface`, não recopiam classes.

**D3 — Duas linguagens "tentativas" distintas, cada uma com fonte única**
(são conceitos de domínio diferentes, a distinção é intencional):
- **Sugerido pela IA** = **violeta tracejado** (`--color-suggested`, já validado
  sob protanopia/deuteranopia). Usado por extração `sugerida` na tela de revisão.
- **Candidato a marco/dominada** = **azul pontilhado** (alinha ao wireframe §3;
  `Card` migra de graphite→azul). Conceito da Fase 4 (candidatura de goal/marco).
A hachura do Card candidato é **removida** (redundância visual desnecessária;
tracejado + selo textual já bastam).

**D4 — Vocabulário de estado único.** `StatusBadge.EstadoDado` alinha ao domínio
real (`extraction_estado`: sugerida/aprovada/editada/descartada + pendente) +
os estados de governança (reclassificada/devolvida) da Fase 5. `Card` para de
ter selo inline próprio — usa `Pill`/`StatusBadge`.

**D5 — Peças novas que a tela de revisão precisa** (a aceleração concreta),
construídas dos primitivos:
- `ConfidenceCard` — cartão de extração por nível de confiança/fricção (§3),
  compõe `Surface` + `Pill` + `avaliarFriccao` (já existe no backend).
- `CompareRow` — histórico anterior lado-a-lado (estado inconsistente).
- `BatchBar` — barra de aprovação em lote (só habilita p/ elegíveis).

## Guardrails (Tech Lead — inegociáveis)

- **Zero regressão visual**: cada componente mantém stories; revisar no Storybook
  antes de fechar. Comportamento idêntico para consumidores atuais (login,
  agenda, diário, cadastro, metas).
- **Gate axe verde** (`a11y.test.tsx`) o tempo todo.
- **typecheck + lint 0**.
- **Um PR** revisável; commits por incremento.

## Plano de incrementos

1. `Surface` + `Pill` primitivos (+ stories + axe). Migrar Button/Card para compor.
2. Unificar linguagem tentativa (D3): Card candidato graphite→azul; remover hachura.
3. `StatusBadge` vocabulário único (D4); Card usa Pill/StatusBadge.
4. Reorganizar pastas (primitives/ patterns/) — só movimentação + reexports.
5. Peças de revisão (D5): ConfidenceCard, CompareRow, BatchBar (já prontas p/ a UI da Fase 3).

Depois deste refactor: PR da UI de revisão (Plano 2 UI da Fase 3) sobre o DS novo.
