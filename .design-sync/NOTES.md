# design-sync — notas do repo Iris

Contexto: o Iris **não é uma lib publicada** — é um app Next.js cujo design
system vive em `src/components/ui/`. Quase toda a configuração existe para
fabricar, a partir do app, as duas coisas que o conversor espera de um
pacote: uma **entrada de bundle** e uma **árvore de `.d.ts`**.

## Como o repo foi adaptado ao conversor

- `src/design-system.ts` — barril gerado que reexporta todo `src/components/ui/*`.
  É a `cfg.entry`. **Exclui** `agenda-calendar-grid` e `governanca-nav`: ambos
  importam de `@/app/(app)/agenda/*` (server actions), que arrasta código
  server-only para dentro do bundle do browser. Nenhum dos dois tem story.
- `EpistemicState` é declarado **duas vezes** (`card.tsx` e `interactive-card.tsx`,
  mesma união literal). `export *` duplo é erro TS2308 — o barril termina com um
  `export type { EpistemicState } from "./components/ui/card"` explícito para
  desambiguar. Se um dos dois arquivos mudar a união, isso silencia a divergência.
- `.design-sync/tsconfig.dts.json` + `cfg.buildCmd` emitem `.d.ts` para
  `.design-sync/dts/` (gitignored, regenerado a cada sync). O conversor acha essa
  árvore via **`publishConfig.types`** no `package.json` da raiz — campo escolhido
  de propósito: o pacote é `private`, nunca é publicado, então `publishConfig` é
  metadado inerte para o app e é o campo que `findTypesRoot` prefere. Sem ele o
  scan de exports volta a 0 componentes (o fallback acha `lib/`, que é do app).

## CSS e fontes

- **Não** existe `cfg.cssEntry`. `src/styles/globals.css` é fonte Tailwind v4
  (`@import "tailwindcss"`), não CSS compilado. O CSS que vai para os designs é
  raspado do build do Storybook (`[CSS_FROM_STORYBOOK]`) — esse é o único lugar
  do repo onde o Tailwind já saiu compilado.
- `.storybook/preview.tsx` importa `globals.css`, então o **bundle de decorators
  falha** (`Could not resolve "tailwindcss"`). Por isso `cfg.provider` aponta para
  `.design-sync/preview-provider.tsx` (`IrisPreviewProvider`), que replica o que o
  decorator fazia de fato: setar `data-mode` / `data-theme` no `<html>`.
  Se o decorator do Storybook ganhar responsabilidade nova, **o provider não
  acompanha sozinho** — atualizar os dois juntos.
- `next/font/google` não produz arquivo de fonte nem no build do Storybook: o
  Storybook de referência renderizava com fallback do sistema. As fontes da marca
  (Space Grotesk, Plus Jakarta Sans, Space Mono — todas OFL) foram baixadas do
  Google Fonts para `.design-sync/fonts/` e declaradas em `.design-sync/ds-fonts.css`
  (`cfg.extraFonts`). Os mesmos `@font-face` foram injetados em
  `.design-sync/sb-reference/iframe.html` (bloco `<style id="ds-sync-fonts">`) para
  que o oráculo compare com a fonte real dos **dois** lados.
  **Consequência:** rebuildar o `sb-reference` apaga a injeção — reinjetar antes de
  comparar, senão o lado de referência volta a usar fallback e todo grade de
  tipografia fica inválido.

## [GENERAL] Vars de fonte indefinidas derrubavam TODA a tipografia

Sintoma: todo preview renderizava em **serif**, com cor/borda/espaçamento corretos.
Causa: `globals.css` tem `html { font-family: var(--font-body) }` e
`--font-body: var(--font-jakarta), "Plus Jakarta Sans", …`. Quem define
`--font-jakarta` é o `next/font` em runtime — fora do Next ela não existe, e um
`var()` sem fallback **invalida a declaração inteira no computed value** (não cai
para o próximo item da lista). Sem `font-family` válida, o browser usa serif.
Fix: `@layer ds-font-fallback { :root { … } }` no próprio `src/styles/globals.css`
(commit deste sync). Fica numa camada, então as classes do `next/font` — que são
unlayered — continuam vencendo no app; só o consumo fora do Next usa o fallback.
Tentativa que **não** funciona: `cfg.tokensGlob`. O `copyTokens` retorna cedo se
`cfg.tokensPkg` não estiver setado, então um glob solto é ignorado em silêncio.
`cfg.extraFonts` também não serve para isso: o parser extrai só as regras
`@font-face` e descarta qualquer `:root` do arquivo.

## Achados que não são do sync (dívida do DS)

- 6 tokens são referenciados por componentes e **nunca definidos** em
  `src/styles/globals.css`: `--radius-card`, `--border-subtle`, `--color-purple`,
  `--surface-ground`, `--surface-muted`, `--ds-shadow-sm`. Usados por
  `collapsible-cluster.tsx`, `appointment-card.tsx`, `qr-code.tsx`,
  `governanca-nav.tsx` e por telas de `(auth)`. É o `[TOKENS_MISSING]` que sobra
  no validate — **warning conhecido e triado**, não é regressão. Nenhum deles está
  em componente com story, então o compare não os enxerga; quem usa esses
  componentes no app perde a propriedade silenciosamente (cai no fallback do
  `var()` ou invalida a declaração). Vale abrir issue separada no produto.

## Stories fora do escopo de componente

Excluídos via `cfg.titleMap: null` — são páginas de documentação/composição, não
exports do bundle: `Welcome`, `Colors`, `Icons`, `Spacing&Borders`, `Typography`,
`Overview` (Atoms/Molecules/Organisms/Layout/Pages), e as 4 de `Pages/`
(`Agenda`, `Pendências`, `Supervisão`, `Validação`).
Mapeados por nome divergente: `Toast` → `ToastProvider`, `Layout` → `Container`.

## Re-sync risks

- **`sb-reference` e as fontes**: ver acima — rebuildar a referência sem reinjetar
  o `<style id="ds-sync-fonts">` invalida silenciosamente os grades de tipografia.
- **`publishConfig.types` no `package.json` da raiz**: se alguém remover achando
  que é resto, o sync volta a 0 componentes sem erro óbvio (só `[TITLE_UNMAPPED]`).
- **`src/design-system.ts` é gerado, não curado**: um componente novo em
  `src/components/ui/` não entra sozinho. Regerar o barril a cada sync e conferir
  se o novo arquivo não importa de `@/app/`.
- **Fontes vendorizadas**: `.design-sync/fonts/*.woff2` são cópias do Google Fonts
  com dedupe por hash (as variáveis compartilham arquivo). Se o app trocar de
  família/peso em `layout.tsx`, o `ds-fonts.css` fica defasado sem avisar.
- **Verificação parcial por design das stories**: `Dialog`, `Drawer`,
  `ToastProvider` e `Tooltip` só renderizam o _gatilho_ — o conteúdo depende de
  clique/hover. Os dois lados mostram o mesmo estado fechado, então o grade
  `match` é honesto, mas **o corpo do overlay nunca foi comparado**. Se algum
  desses componentes regredir por dentro, esta suíte não pega. Uma story com
  `open` inicial resolveria (e provavelmente exigiria `cardMode: "single"`).
- **`[STORY_CAP]`**: `Button` (11 stories) e `Input` (9) foram capturados só nas
  6 primeiras. As demais nunca foram vistas individualmente — passam como
  verificadas por upload nos próximos syncs. Subir `--max-stories` se as variantes
  da cauda importarem.
- **`.design-sync/conventions.md` é escrito à mão** e vira o topo do README que o
  agente de design lê. Todos os tokens, classes, seletores, exports e props que
  ele cita foram conferidos contra `ds-bundle/` neste sync. Renomear token ou prop
  no DS sem revalidar esse arquivo faz o agente gerar código que não resolve.
- **Cardinalidade**: 34 componentes vieram de 44 títulos do Storybook. Se esse
  número cair sem explicação, suspeite do `publishConfig.types` ou do barril.
