# Design Spec: Color Token Restructuring and Core Component Evolution

**Date:** 2026-07-13  
**Status:** Approved  
**Topic:** Reorganize the color system of Espectro Brutal into a 3-tier atomized architecture (Primitives and Semantics), and implement uncreated/missing components (Banner, InteractiveCard, Indicator).

---

## 1. Architectural Decisions

1. **Pragmatic 3-Tier Hierarchy:**
   - **Primitives (Tier 1):** Define only active colors with a 4-step ramp: `100` (Light/Bg), `500` (Base), `700` (Hover/Dark), `900` / `950` (Extreme contrast).
   - **Semantics (Tier 2):** Connect colors to system roles (`action-primary`, `bg-canvas`, `status-success`). Components consume these roles directly.
   - **Aliases (Compatibility):** Keep legacy tokens (`--color-gold`, `--color-mint`, `--color-blue`) pointing to semantic values to prevent runtime breaking changes.
2. **Missing Components (Tier 4):**
   - **`<Banner>`:** Prominent alert boxes for coordenação actions.
   - **`<InteractiveCard>`:** Native card wrappers combining layout and mechanical click states.
   - **`<Indicator>`:** Solid semantic dots for compact clinical statuses.

---

## 2. Token Layout (globals.css)

```css
@theme {
  /* Primitives */
  --color-raw-gold-100: #fff9e6;
  --color-raw-gold-500: #f2b705;
  --color-raw-gold-700: #d29e04;
  --color-raw-gold-900: #664d00;

  --color-raw-mint-100: #e0f2f1;
  --color-raw-mint-500: #b2dfdb;
  --color-raw-mint-700: #80cbc4;
  --color-raw-mint-900: #004d40;

  --color-raw-blue-100: #e3f2fd;
  --color-raw-blue-500: #90caf9;
  --color-raw-blue-700: #2274a5;
  --color-raw-blue-900: #0d47a1;

  --color-raw-violet-100: #f3e5f5;
  --color-raw-violet-500: #6a4c93;
  --color-raw-violet-900: #4a148c;

  --color-raw-terracotta-100: #ffebee;
  --color-raw-terracotta-500: #ef9a9a;
  --color-raw-terracotta-900: #b71c1c;

  --color-raw-gray-50: #f8f9fa;
  --color-raw-gray-100: #f1f3f5;
  --color-raw-gray-800: #2b2b2b;
  --color-raw-gray-900: #1a1a1a;
  --color-raw-gray-950: #000000;

  /* Semantics */
  --color-brand-primary: var(--color-raw-gold-500);
  --color-brand-primary-hover: var(--color-raw-gold-700);
  --color-brand-primary-text: var(--color-raw-gray-950);

  --color-bg-canvas: var(--color-raw-gray-50);
  --color-bg-surface: #ffffff;
  --color-border-brutal: var(--color-raw-gray-900);

  --color-text-body: var(--color-raw-gray-800);
  --color-text-heading: var(--color-raw-gray-950);

  --color-status-success-bg: var(--color-raw-mint-500);
  --color-status-success-text: var(--color-raw-mint-900);
  --color-status-ia-bg: var(--color-raw-violet-100);
  --color-status-ia-border: var(--color-raw-violet-500);
  --color-status-ia-text: var(--color-raw-violet-900);
  --color-status-info-bg: var(--color-raw-blue-100);
  --color-status-info-text: var(--color-raw-blue-900);
  --color-status-error-bg: var(--color-raw-terracotta-500);
  --color-status-error-text: var(--color-raw-terracotta-900);

  --color-focus-ring: var(--color-raw-blue-700);
}
```

---

## 3. Component Specification & Interfaces

### A. `<Banner>`

- **Props:** `variant?: "info" | "alerta" | "sucesso"`, `titulo?: ReactNode`, `children?: ReactNode`.
- **Design:** Styled with thick borders and a top-accent bar corresponding to the status.

### B. `<InteractiveCard>`

- **Props:** Standard `HTMLAttributes<HTMLAnchorElement | HTMLButtonElement>` depending on whether a URL/action is provided.
- **Design:** Embedded mechanical hover transition and active collapse.

### C. `<Indicator>`

- **Props:** `variant?: "conquistado" | "sugerido" | "erro" | "info"`.
- **Design:** Compact 3D solid sphere with black outline.
