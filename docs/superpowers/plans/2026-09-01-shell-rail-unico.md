# Shell de navegação única — plano de implementação

> **Para executores autônomos:** SUB-SKILL OBRIGATÓRIA — usar
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans`. Os passos usam checkbox (`- [ ]`).

**Goal:** Eliminar a faixa de navegação horizontal do header. Toda navegação
diária, administração, troca de clínica, troca de papel e o `Sair` passam a
viver no rail lateral; abaixo do rail, na `BottomNav` e no drawer que já
existem. Substituir os monogramas de duas letras do rail por ícones.

**Architecture:** `Header` não é deletado — ele monta a `BottomNav` e o drawer
do mobile. O que sai é a **Faixa 2** (nav horizontal) e os controles duplicados
da Faixa 1 nas larguras em que o rail existe.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4,
Vitest, Testing Library.

---

## O achado que decide o plano — medir antes de mexer

Breakpoints atuais, lidos do código:

| Superfície                  | Arquivo                          | Visível em |
| --------------------------- | -------------------------------- | ---------- |
| `Rail` lateral              | `rail.tsx:301` — `lg:flex`       | ≥ 1024px   |
| Faixa 2 (nav horizontal)    | `header.tsx:419` — `hidden sm:block` | ≥ 640px |
| `BottomNav`                 | `bottom-nav.tsx:120` — `sm:hidden`   | < 640px |

**Entre 640px e 1023px, a Faixa 2 é a ÚNICA navegação.** Removê-la sem mexer nos
breakpoints deixa toda essa faixa — tablets em retrato, janela de desktop pela
metade — sem nenhum menu. Não é hipótese: é o que os três seletores acima dizem.

**Decisão deste plano:** rail desce para `md` (≥768px), `BottomNav` sobe para
`md:hidden` (<768px). A faixa some sem buraco. É a Task 1, e vem antes de
qualquer remoção.

---

### Task 1: Fechar o buraco de 640–1023px

**Files:**

- Modify: `src/components/ui/rail.tsx` (linha do `<nav>`: `lg:flex` → `md:flex`)
- Modify: `src/components/ui/bottom-nav.tsx` (`sm:hidden` → `md:hidden`)
- Test: `src/components/ui/rail.test.tsx` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/components/ui/rail.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Rail } from "./rail";

const ITENS = [
  { href: "/agenda", label: "Agenda" },
  { href: "/pacientes", label: "Pacientes" },
];

describe("Rail — breakpoint", () => {
  it("aparece a partir de md, não de lg: entre 768 e 1023 não pode haver tela sem menu", () => {
    const { container } = render(<Rail itemsNav={ITENS} />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("md:flex");
    expect(nav?.className).not.toContain("lg:flex");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/components/ui/rail.test.tsx`
Expected: FAIL — a classe é `lg:flex`.

- [ ] **Step 3: Implementar**

Em `rail.tsx`, no `className` do `<nav>`, trocar `lg:flex` por `md:flex` e
acrescentar o comentário:

```tsx
      // O rail desce de `lg` para `md` porque a faixa de nav horizontal do
      // header (que servia 640–1023px sozinha) foi removida. Sem esta
      // mudança, tablet em retrato e janela de desktop pela metade ficariam
      // sem nenhuma navegação.
      "hidden shrink-0 flex-col border-r-2 ... md:flex",
```

Em `bottom-nav.tsx`, trocar `"sm:hidden"` por `"md:hidden"` com comentário
espelhado apontando para a mesma razão.

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/components/ui/`
Expected: PASS. Se algum teste existente afirmava `lg:flex` ou `sm:hidden`,
atualizá-lo — a afirmação antiga descrevia o layout antigo.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/rail.tsx src/components/ui/bottom-nav.tsx src/components/ui/rail.test.tsx
git commit -m "refactor(shell): lower rail breakpoint to md so no viewport is left without nav"
```

---

### Task 2: Ícones de navegação

15 ícones existem em `icon.tsx`; nenhum serve para os destinos de nav. O rail
usa monograma de duas letras (`AG`, `SE`, `PA`) — é o que aparece no shell hoje.

**Files:**

- Modify: `src/components/ui/icon.tsx`
- Test: `src/components/ui/icon.test.tsx` (criar)

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CalendarIcon,
  ClipboardIcon,
  UsersIcon,
  FileTextIcon,
  BuildingIcon,
  DownloadIcon,
  CreditCardIcon,
  HelpCircleIcon,
  UserIcon,
  LogOutIcon,
} from "./icon";

const TODOS = {
  CalendarIcon,
  ClipboardIcon,
  UsersIcon,
  FileTextIcon,
  BuildingIcon,
  DownloadIcon,
  CreditCardIcon,
  HelpCircleIcon,
  UserIcon,
  LogOutIcon,
};

describe("ícones de navegação", () => {
  it.each(Object.entries(TODOS))(
    "%s usa currentColor e viewBox 24, para herdar cor e alinhar com o resto",
    (_nome, Componente) => {
      const { container } = render(<Componente aria-hidden />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(container.innerHTML).toContain("currentColor");
    },
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/components/ui/icon.test.tsx`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Implementar**

Em `icon.tsx`, acrescentar os dez ícones seguindo **exatamente** o traço dos que
já existem (`strokeWidth={2}`, `strokeLinecap="square"`, `strokeLinejoin="miter"`
— é a assinatura brutalista do sistema; arredondar aqui quebraria a coerência
com `AlertTriangleIcon` e `ShieldIcon`). Exemplo do primeiro, para o executor
seguir o padrão nos nove restantes:

```tsx
export const CalendarIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M3 6h18v15H3V6zM8 3v4M16 3v4M3 11h18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  </svg>
);
```

Os demais: `ClipboardIcon` (Sessões), `UsersIcon` (Pacientes), `FileTextIcon`
(Relatórios), `BuildingIcon` (Dados da Clínica), `DownloadIcon` (Exportar
Acervo), `CreditCardIcon` (Assinatura), `HelpCircleIcon` (Dúvidas), `UserIcon`
(Meu Perfil), `LogOutIcon` (Sair). Reusar `UsersIcon` para Equipe.

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/components/ui/icon.test.tsx`
Expected: PASS, 10 casos.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/icon.tsx src/components/ui/icon.test.tsx
git commit -m "feat(ui): add navigation icon set matching the existing stroke signature"
```

---

### Task 3: `nav.ts` declara o ícone de cada destino

`nav.ts` é uma função pura sem JSX, e precisa continuar assim para seguir
testável sem render. Ela declara uma **chave**; quem resolve a chave em
componente é o rail.

**Files:**

- Modify: `src/app/(app)/nav.ts`
- Modify: `src/app/(app)/app-header.tsx` (tipo `NavItem`)
- Test: `src/app/(app)/nav.test.ts` (já existe)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `nav.test.ts`:

```ts
it("todo item de nav e de admin declara um ícone — nenhum cai no monograma", () => {
  for (const role of ["coordenador", "terapeuta", "admin_recepcao"]) {
    const { itemsNav, itemsAdmin } = montarNav({ role, totalTravadas: 0 });
    for (const item of [...itemsNav, ...itemsAdmin]) {
      expect(item.icone, `${role} · ${item.href}`).toBeDefined();
    }
  }
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/app/(app)/nav.test.ts`
Expected: FAIL — `icone` é `undefined`.

- [ ] **Step 3: Implementar**

Em `app-header.tsx`, estender `NavItem`:

```ts
/** Chave do ícone, não o componente: `nav.ts` é uma função pura sem JSX e
 * precisa continuar testável sem render. Quem resolve chave → componente é
 * `rail.tsx`. */
export type IconeNav =
  | "agenda"
  | "sessoes"
  | "pacientes"
  | "relatorios"
  | "equipe"
  | "clinica"
  | "exportacao"
  | "assinatura"
  | "duvidas"
  | "perfil";

export interface NavItem {
  href: string;
  label: string;
  labelCurto?: string;
  badge?: number;
  badgeTom?: NavBadgeTom;
  icone?: IconeNav;
}
```

Em `nav.ts`, acrescentar `icone` a cada item já declarado — sem mudar href,
label, badge ou a estrutura por papel (R-21/R-22/R-23 continuam intactas).

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/app/(app)/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/nav.ts" "src/app/(app)/app-header.tsx" "src/app/(app)/nav.test.ts"
git commit -m "feat(shell): declare an icon key per navigation destination"
```

---

### Task 4: Rail renderiza ícone no lugar do monograma

**Files:**

- Modify: `src/components/ui/rail.tsx`
- Test: `src/components/ui/rail.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it("renderiza ícone, não monograma, quando o item declara um", () => {
  const { container } = render(
    <Rail itemsNav={[{ href: "/agenda", label: "Agenda", icone: "agenda" }]} />,
  );
  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.textContent).not.toContain("AG");
});

it("cai no monograma quando o item não declara ícone — nunca fica sem marca", () => {
  const { container } = render(
    <Rail itemsNav={[{ href: "/x", label: "Coisa Nova" }]} />,
  );
  expect(container.textContent).toContain("CN");
});

it("o rótulo acessível continua sendo o texto, nunca o ícone", () => {
  render(
    <Rail itemsNav={[{ href: "/agenda", label: "Agenda", icone: "agenda" }]} />,
  );
  expect(screen.getByRole("link", { name: "Agenda" })).not.toBeNull();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/components/ui/rail.test.tsx`
Expected: FAIL — sem `svg`.

- [ ] **Step 3: Implementar**

Em `rail.tsx`, acrescentar o mapa e trocar o corpo do `conteudoItem`:

```tsx
/**
 * Chave → componente. O mapa vive AQUI, não em `nav.ts`: aquele módulo é uma
 * função pura sem JSX e é essa pureza que o deixa testável sem render.
 *
 * O ícone é `aria-hidden` sempre. Quem nomeia o link continua sendo
 * `aria-label`/`title` (R-26) — colapsado, o texto visível some, e um ícone
 * como único portador de significado deixaria o rail ilegível para leitor de
 * tela e para quem não decodifica pictogramas.
 */
const ICONES: Record<IconeNav, React.ComponentType<{ size?: number | string; className?: string }>> = {
  agenda: CalendarIcon,
  sessoes: ClipboardIcon,
  pacientes: UsersIcon,
  relatorios: FileTextIcon,
  equipe: UsersIcon,
  clinica: BuildingIcon,
  exportacao: DownloadIcon,
  assinatura: CreditCardIcon,
  duvidas: HelpCircleIcon,
  perfil: UserIcon,
};
```

No `conteudoItem`, substituir o `<span>` do monograma por:

```tsx
        {item.icone && ICONES[item.icone] ? (
          React.createElement(ICONES[item.icone], {
            size: 20,
            className: "shrink-0",
            // @ts-expect-error — `aria-hidden` é prop de SVG, não do tipo mínimo
            "aria-hidden": true,
          })
        ) : (
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border-2 border-current/30 font-mono text-[10px] font-bold"
          >
            {monograma(item.label)}
          </span>
        )}
```

Preferir tipar o mapa com `React.ComponentType<IconProps>` importando `IconProps`
de `icon.tsx` a usar `@ts-expect-error` — se `IconProps` for exportado, usá-lo e
remover o supressor.

Manter `monograma()` e seus testes: é o fallback de um item novo que ainda não
ganhou ícone.

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/components/ui/rail.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/rail.tsx src/components/ui/rail.test.tsx
git commit -m "feat(shell): render navigation icons in the rail, keeping monogram as fallback"
```

---

### Task 5: Sair, clínica e papel migram para o rodapé do rail

**Files:**

- Modify: `src/components/ui/rail.tsx` (`MenuUsuario`)
- Modify: `src/app/(app)/app-header.tsx` (passar clínica/papel ao `Rail`)
- Test: `src/components/ui/rail.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it("o rodapé do rail carrega clínica ativa, papel ativo e o Sair", async () => {
  const user = userEvent.setup();
  render(
    <Rail
      itemsNav={ITENS}
      itemsAdmin={[{ href: "/perfil", label: "Meu Perfil", icone: "perfil" }]}
      clinicaAtivaNome="Clínica Teste"
      papelAtivoRotulo="Coordenação"
      signOutSlot={<button type="button">Sair</button>}
    />,
  );
  await user.click(screen.getByRole("button", { name: /menu do usuário/i }));
  expect(screen.queryByText("Clínica Teste")).not.toBeNull();
  expect(screen.queryByText("Coordenação")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Sair" })).not.toBeNull();
});

it("Sair fica DENTRO do menu do usuário, não solto no rodapé", () => {
  const { container } = render(
    <Rail itemsNav={ITENS} signOutSlot={<button type="button">Sair</button>} />,
  );
  // Sem itemsAdmin não há menu; o Sair também não aparece solto.
  expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
  expect(container).toBeTruthy();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/components/ui/rail.test.tsx`
Expected: FAIL — props inexistentes; `Sair` renderiza solto no rodapé.

- [ ] **Step 3: Implementar**

Em `RailProps`, acrescentar `clinicaAtivaNome`, `outrasClinicas`,
`onTrocarClinica`, `papelAtivoRotulo`, `papeisAlternativos`, `onTrocarPapel` —
mesmos tipos já declarados em `HeaderProps`.

Em `MenuUsuario`, acrescentar, acima da lista de `itemsAdmin`, dois blocos
(clínica ativa + trocas, papel ativo + trocas) e, ao final do painel, o
`signOutSlot`. Mover o `signOutSlot` de fora do `MenuUsuario` para dentro dele.

Em `app-header.tsx`, repassar as mesmas props ao `<Rail>` que já vão para o
`<Header>`.

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/components/ui/rail.test.tsx src/app/(app)/app-header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/rail.tsx "src/app/(app)/app-header.tsx" src/components/ui/rail.test.tsx
git commit -m "feat(shell): move sign-out, clinic and role switching into the rail footer"
```

---

### Task 6: Remover a faixa de navegação do header

Só agora — com o rail cobrindo ≥768px, a `BottomNav` cobrindo <768px e os
controles já migrados. Remover antes deixaria buraco.

**Files:**

- Modify: `src/components/ui/header.tsx`
- Test: `src/components/ui/header.test.tsx` (já existe)

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it("não renderiza mais a faixa de navegação horizontal", () => {
  render(<Header itemsNav={ITENS} clinicaAtivaNome="X" />);
  expect(screen.queryByRole("navigation", { name: "Navegação principal" })).toBeNull();
});

it("continua montando o drawer e a BottomNav — mobile depende deles", () => {
  const { container } = render(<Header itemsNav={ITENS} clinicaAtivaNome="X" />);
  expect(container.querySelector("[data-bottom-nav]")).not.toBeNull();
});

it("a faixa de identidade some a partir de md, onde o rail assume", () => {
  const { container } = render(<Header itemsNav={ITENS} clinicaAtivaNome="X" />);
  expect(container.querySelector("header")?.className).toContain("md:hidden");
});
```

Ajustar o seletor da segunda asserção ao atributo que `BottomNav` de fato expõe;
se não houver, acrescentar `data-bottom-nav` ao `<nav>` dela nesta tarefa.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/components/ui/header.test.tsx`
Expected: FAIL — a nav horizontal ainda existe.

- [ ] **Step 3: Implementar**

Em `header.tsx`:

1. Remover o bloco inteiro da **Faixa 2** (o `{itemsNav.length > 0 ? (<div className="hidden bg-... sm:block">…)}`), junto com `rotuloComBadge`, que fica sem uso.
2. Acrescentar `md:hidden` ao `className` do `<header>`: acima de 768px quem
   carrega marca, clínica, papel e conta é o rail.
3. **Não** tocar em `drawerNavegacao` nem na `BottomNav` — são a navegação de
   <768px. Ambas continuam recebendo `itemsNav` e `itemsAdmin`.
4. Comentar a razão no topo do componente:

```tsx
/**
 * A Faixa 2 (nav horizontal) foi removida: a navegação vive no rail
 * (`rail.tsx`, ≥768px) e na `BottomNav` + drawer (<768px). O componente
 * SOBREVIVE porque é ele que monta as duas superfícies do mobile — deletá-lo
 * levaria o menu do celular junto.
 */
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/components/ui/header.test.tsx "src/app/(app)/app-header.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Provar que nenhum destino sumiu**

Escrever a verificação como teste, não como inspeção visual:

```tsx
it("todo destino da nav do coordenador está alcançável pelo rail", () => {
  const { itemsNav, itemsAdmin } = montarNav({
    role: "coordenador",
    totalTravadas: 0,
  });
  render(<Rail itemsNav={itemsNav} itemsAdmin={itemsAdmin} />);
  for (const item of itemsNav) {
    expect(
      screen.getByRole("link", { name: item.label }).getAttribute("href"),
    ).toBe(item.href);
  }
});
```

Repetir para `terapeuta` e `admin_recepcao`. Este é o teste que prova a
exigência "certificando que os itens dele estão no menu sidebar".

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/header.tsx src/components/ui/header.test.tsx src/components/ui/rail.test.tsx
git commit -m "refactor(shell): drop the horizontal nav band, rail is the single menu"
```

---

### Task 7: Verificação no navegador

Testes de componente não veem `position: fixed` nem media query — jsdom não
resolve layout. Os buracos de breakpoint só aparecem medindo.

- [ ] **Step 1: Subir o preview**

Usar a ferramenta de preview do harness (não `pnpm dev` via shell).

- [ ] **Step 2: Medir cada largura**

Em 375px, 768px, 1024px e 1440px, confirmar em cada uma:

- existe exatamente **uma** superfície de navegação visível;
- todos os destinos do papel ativo estão alcançáveis;
- o `Sair` existe e é clicável;
- nada da página fica escondido atrás de barra fixa.

O caso de 768px é o que este plano existe para não quebrar.

- [ ] **Step 3: Registrar a evidência**

Screenshot de cada largura. Sem screenshot, a verificação não aconteceu.

- [ ] **Step 4: Suíte completa**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: verde.

- [ ] **Step 5: Commit de ajustes, se houver**

```bash
git add -A && git commit -m "fix(shell): adjust rail layout after cross-viewport verification"
```
