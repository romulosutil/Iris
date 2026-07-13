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

**D2 — `Surface`/`control` são o MECANISMO de enforcement (P1/Q3 da crítica).**
Evidência: `--border-brutal` e `--control-md/lg` têm **0 consumidores**; 17×
`border-2` + 9× `min-h-11` crus furam os tokens; e Tailwind v4 `@theme` **não
emite** `--border-*`/control como utilitário → o token é comentário, não
constraint. Logo a "fonte única" tem que ser um **util TS**: `surface(variante)`
(solida-levanta | sugerida-afunda | candidata-afunda) + `control(sm|md|lg)`. Os
componentes COMPÕEM esses utils; o review vê a composição, não classe recopiada —
é isso que impede o próximo `border-2` cru.

**D3 (revisado pós-crítica `/impeccable`, 35/40) — UM eixo ESTRUTURAL de estado,
tipo por hue+ícone+label.** A crítica alertou: formalizar dois tipos de
"ainda-não-fato" (violeta vs azul) pode reabrir a ambiguidade que o produto
existe pra fechar. Decisão melhor:
- **Fato (aprovado)** = fill sólido + borda cheia + **sombra que LEVANTA** (`--ds-shadow`).
- **Ainda-não-fato** = sem fill + tracejado + **sombra INSET que AFUNDA** (`--ds-shadow-inset`).
O eixo profundidade (levanta/afunda) é o aprendizado ÚNICO e daltônico-seguro. O
*tipo* de não-fato é leitura secundária: **IA-sugerido = violeta + Sparkle**;
**marco-candidato = azul + Layers**. Hachura do Card removida (o inset já carrega
"tentativo"). Isto resolve P0 (fork) + P1 (sink vaporware) juntos.

**D3b — Construir o "sink" (P1 da crítica).** `--shadow-brutal-inset`
("sugerido afunda / aprovado levanta", `globals.css:56-59`) hoje tem **0
consumidores** — é a codificação mais literal do princípio e não existe em pixel.
Vira saída de primeira classe do `surface()`.

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

## Bugs de a11y achados pela crítica (corrigir no refactor)
- **[P2] Casey** — `Chip` (`chip.tsx:14`) tem `min-h-11` mas **sem `min-w-11`** →
  toggle curto fura 44px em largura. `Dialog` close (`dialog.tsx:51`) = 36px no
  canto hostil ao polegar → ≥44px + reconsiderar posição p/ uma mão.
- **[P3] Sam** — Chip removível+selecionável: dois `<button>` aninhados em `<span>`
  sem rótulo de grupo → SR anuncia dois botões ambíguos. Agrupar/rotular.
- **Gate**: `a11y.test.tsx` roda axe mas **desliga `color-contrast`** (jsdom não
  renderiza cor) → contraste NÃO é gated automaticamente. Registrar como dívida
  (validação de contraste é manual/CVD-script hoje).

## Plano de incrementos (revisado pós-crítica)

1. **`surface(variante)` + `control(tam)` utils** (fonte única + enforcement) +
   `Pill`. Migrar Button/Card/Input/Dialog/etc. para compor — **de-dup
   behavior-preserving**, zero mudança visual. Gates automáticos (typecheck/axe).
2. **Construir o eixo de profundidade (D3+D3b)** — `surface("sugerida")` afunda
   (inset), `solida` levanta; Card candidato graphite→azul+inset, remove hachura.
   **Mudança visual — revisar no Storybook (olho do Rômulo)**.
3. `StatusBadge` vocabulário único (D4) alinhado a `extraction_estado`; Card usa Pill.
4. Fixes a11y (Casey/Sam acima) + reorganizar pastas (primitives/ patterns/).
5. Peças de revisão (D5): ConfidenceCard, CompareRow, BatchBar — aceleração da UI da Fase 3.

Depois deste refactor: PR da UI de revisão (Plano 2 UI da Fase 3) sobre o DS novo.
