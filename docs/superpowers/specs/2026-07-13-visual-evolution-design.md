# Design Spec: Visual Evolution of Internal Views

**Date:** 2026-07-13  
**Status:** Under Review  
**Topic:** Transition authenticated routes `/agenda` and `/pendencias` from wireframe appearance to dynamic editorial Neo-brutalist layouts.

---

## 1. Objectives & Guidelines

1. **Hierarchy & Spacing (Editorial Rhythm):** Break visual symmetry with generous, asymmetric spacing around main headings and empty states.
2. **Visual Contrast:** Add a configurable `destacado` state to containers (like `Card` and pending extraction items) to inject identity without causing visual clutter.
3. **Smooth Mechanical Interactions:** Standardize quick, physical hover pop-outs and active click flattening across all buttons/actionable links. Prevent visual layout jumps by timing transition states (`transform` and `box-shadow`) in unison.

---

## 2. Proposed Changes

### A. Core Styling Configuration

#### [MODIFY] [globals.css](file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/styles/globals.css)

- Add keyframes and classes for staggered entrance animations:
  ```css
  @keyframes fade-in-up {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in-up {
    animation: fade-in-up 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .animate-delay-75 {
    animation-delay: 75ms;
  }
  .animate-delay-150 {
    animation-delay: 150ms;
  }
  .animate-delay-225 {
    animation-delay: 225ms;
  }
  ```

### B. UI Components

#### [MODIFY] [card.tsx](file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/components/ui/card.tsx)

- Add `destacado?: boolean` to `CardProps`.
- When `destacado={true}`:
  - Render a top absolute bar: `<span aria-hidden className="bg-gold absolute inset-x-0 top-0 h-2" />`
  - Add the `relative pt-8` layout styles.
  - Internal badge text and states remain dynamic and unaffected.

#### [MODIFY] [button.tsx](file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/components/ui/button.tsx)

- Update classes to implement pop-out hover and click transitions:
  - Transition style: `transition-[transform,box-shadow,background-color] duration-100 ease-out`
  - Hover state (when `temPeso` is active): `hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]`
  - Active state (when `temPeso` is active): `active:translate-x-0 active:translate-y-0 active:shadow-none`

### C. Shell & Navigation

#### [MODIFY] [layout.tsx](<file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/app/(app)/layout.tsx>)

- Apply a subtle, clean text hover effect to Navbar text links: `transition-transform duration-100 ease-out hover:-translate-y-0.5 hover:text-ink-anchor`.

### B. Routable Views

#### [MODIFY] [page.tsx (Agenda)](<file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/app/(app)/agenda/page.tsx>)

- Increase top/bottom spacing around headings using container-level classes: `pt-8 md:pt-12 pb-4 md:pb-6` on the heading stack.
- Update `abrirSessaoClasses` with the new standardized hover pop-out and active click transitions to align with the Button component.
- Restyle empty state `<Alert>` to stand out with a thick black border and shadow, without hardcoding margins on the component itself:
  - `className="border-4 border-ink-anchor shadow-[var(--ds-shadow)] p-8 md:p-12 text-lg font-medium"`
- Wrap sessions in the staggered `animate-fade-in-up` classes.

#### [MODIFY] [page.tsx (Pendências)](<file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/app/(app)/pendencias/page.tsx>)

- Increase padding of the main heading stack: `pt-8 md:pt-12 pb-4 md:pb-6`.

#### [MODIFY] [pendencias-list.tsx](<file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/app/(app)/pendencias/pendencias-list.tsx>)

- Update `acaoClasses` to match standard hover/active button behavior.
- Highlight "Capturas a consolidar" cards by setting `destacado={true}`.
- Restyle empty state `<Alert>` with thick border and shadow:
  - `className="border-4 border-ink-anchor shadow-[var(--ds-shadow)] p-8 md:p-12 text-lg font-medium"`
- Add staggered `animate-fade-in-up` class entries to the main sections.

#### [MODIFY] [item-pendente.tsx](<file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/app/(app)/pendencias/item-pendente.tsx>)

- Update `linkClasses` to match standard hover/active button behavior.
- Redesign container block to mirror a highlighted card with a top gold accent bar:
  - Class: `relative border-ink-anchor bg-surface flex flex-col gap-3 border-2 p-5 pt-8 shadow-[var(--ds-shadow)]`
  - Add the top gold bar: `<span aria-hidden className="bg-gold absolute inset-x-0 top-0 h-2" />`

---

## 3. Verification Plan

- Validate component styling under Storybook:
  - Ensure `<Card destacado>` renders correctly.
  - Verify buttons transition smoothly without layout jumps.
- Run a11y tests and type checks: `pnpm typecheck` & `pnpm test`.
