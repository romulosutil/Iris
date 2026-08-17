# Iris — Espectro Brutal

Design system de um produto clínico brasileiro (acompanhamento de terapia para
TEA). Toda a copy é **pt-BR** e as props/enums dos componentes também são em
português (`variante`, `estado`, `severidade`, `conteudo`, `posicao`). Não
traduza nomes de props nem invente equivalentes em inglês.

## Setup: dois atributos no `<html>`, e nada mais

Não existe React Provider obrigatório. O tema é dirigido por **dois atributos
no elemento raiz**, lidos por `styles.css`:

```html
<html data-mode="clinico">
  <!-- claro (default) -->
  <html data-mode="familia" data-theme="dark">
    <!-- modo família, escuro -->
  </html>
</html>
```

- `data-mode="clinico"` (padrão) — sombra brutalista cheia (`--ds-offset: 4px`),
  cantos duros. É o modo do app para terapeuta/coordenador.
- `data-mode="familia"` — mesma paleta, sombra e offset reduzidos
  (`--ds-offset: 2px`), cantos mais macios. Use para telas voltadas à família.
- Escuro é ligado por **qualquer um** de `data-theme="dark"`, `data-mode="dark"`
  ou a classe `.dark` no mesmo elemento — o CSS agrupa os três no mesmo seletor.
  Claro é o default, sem atributo.

Sem esses atributos os componentes ainda renderizam, mas com os valores default
do `:root` — que é o modo clínico claro. Definir explicitamente é o correto.

`IrisPreviewProvider` existe no bundle e seta esses atributos por você
(`<IrisPreviewProvider modo="familia" tema="escuro">` — ele traduz `escuro` para
a classe `.dark`), mas é um utilitário de preview: em uma tela real, prefira os
atributos no `<html>`.

## Idioma de estilo: Tailwind + `var()` em valor arbitrário

Este DS **não** expõe classes utilitárias próprias e **não** estiliza por props
de layout. O idioma real, usado em todos os 34 componentes, é Tailwind com o
token do design system dentro de um valor arbitrário:

```
bg-[var(--surface-card)]      text-[var(--text-primary)]
border-2 border-[var(--border-brutal)]
shadow-[var(--ds-shadow)]     rounded-[var(--radius-control)]
```

Escreva o seu layout com o mesmo vocabulário. **Nunca** use cores literais do
Tailwind (`bg-slate-100`, `text-gray-700`) — elas ignoram tema e modo.

Tokens que você vai usar de fato:

| Papel          | Tokens                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Superfície     | `--bg-app`, `--surface-card`, `--surface-elevated`                                              |
| Texto          | `--text-primary`, `--text-secondary`                                                            |
| Borda / sombra | `--border-brutal`, `--ds-shadow`, `--ds-shadow-hover`, `--ds-shadow-inset`, `--ds-offset`       |
| Ação           | `--action-primary`, `--action-primary-fg`, `--action-secondary-bg`, `--action-secondary-fg`     |
| Estado         | `--status-{success,warning,error,info,ia}-{bg,fg,border}`                                       |
| Raio           | `--radius-xs`, `--radius-sm`, `--radius-control`, `--radius-md`, `--radius-lg`, `--radius-pill` |

`--status-ia-*` é o estado **sugerido pela IA** — sempre violeta e sempre com
borda tracejada (`border-dashed`). Essa distinção é semântica, não decorativa:
o produto separa o que a IA sugeriu do que um humano aprovou. Não use a
paleta de IA para nada que já foi confirmado por pessoa.

### Tipografia

Três famílias, expostas como utilitárias do Tailwind:

- `font-display` — Space Grotesk. Títulos, rótulos de botão, headings de card.
- `font-body` — Plus Jakarta Sans. Texto corrido (é o default do `<html>`).
- `font-mono` — Space Mono. Badges, chips, cabeçalho de tabela, timestamps,
  qualquer coisa em CAIXA ALTA curta. É uma marca visual forte do DS, não um
  detalhe: chips e status badges são sempre mono/uppercase.

### Duas convenções de API que se repetem

- **`como`** — prop polimórfica dos componentes de layout e de vários átomos:
  troca a tag renderizada (`<Stack como="section">`, `<Container como="main">`).
  É o equivalente do `as` de outras libs; o nome é esse.
- Enums aceitam **alias em inglês** além do valor canônico em português
  (`variante="primaria"` e `"primary"` valem). Escreva sempre o **português** —
  é o valor documentado e o que aparece nas stories.

## Onde está a verdade

- `_ds/<pasta>/styles.css` e o que ele `@import`a (`_ds_bundle.css`,
  `fonts/fonts.css`) — todos os tokens, os blocos `[data-mode]` / `[data-theme]`
  e os `@font-face` da marca. Leia antes de estilizar qualquer coisa.
- `components/<grupo>/<Nome>/<Nome>.d.ts` — a API real, com os nomes de prop em
  português.
- `components/<grupo>/<Nome>/<Nome>.prompt.md` — exemplos de uso por componente.

Os grupos são `atoms`, `molecules`, `organisms`, `layout`, `templates`,
`foundations` — e correspondem a como o time organiza o DS.

## Exemplo idiomático

```jsx
<Container>
  <Stack gap="lg">
    <Alert severidade="info" titulo="Primeira revisão desta sessão">
      Aprove ou ajuste cada sugestão antes de virar registro.
    </Alert>

    <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
      <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
        Evidências pendentes
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        3 candidatas aguardando validação.
      </p>
      <Cluster gap="sm" className="mt-4">
        <StatusBadge estado="sugerida" />
        <Button variante="primaria">Aprovar sessão</Button>
        <Button variante="terciaria">Cancelar</Button>
      </Cluster>
    </div>
  </Stack>
</Container>
```

O `<div>` acima é _sua_ cola de layout, escrita no idioma do DS. O `Container`,
`Stack`, `Cluster`, `Alert`, `StatusBadge` e `Button` vêm da biblioteca — para
qualquer controle que exista como componente, use o componente.
