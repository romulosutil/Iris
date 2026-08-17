# Especificação de Design: Acessibilidade de Tipografia e Escala Fluida

**Data:** 2026-07-21
**Objetivo:** Calibrar a escala de tipografia do design system "Espectro Brutal" para atender plenamente a WCAG 1.4.12 (altura de linha entre 1.4 e 1.5 para corpo de texto) e implementar Fluid Typography via `clamp()` para os títulos Hero e H1 para evitar quebras agressivas em viewports mobile estreitos (320px–360px).

---

## 1. Altura de Linha (WCAG 1.4.12)

Para satisfazer o critério WCAG 1.4.12 (Text Spacing) que exige que a altura de linha seja de pelo menos 1.5 vezes o tamanho da fonte, as variáveis globais de tamanho de fonte do Tailwind v4 (`--font-size-*`) para corpo de texto receberão uma definição explícita de `1.5` para o line-height.

### Tokens Modificados:

- `text-xs` (12px / 0.75rem): Altura de linha ajustada de 16px (1.33) para 18px (1.5).
- `text-sm` (14px / 0.875rem): Altura de linha ajustada de 20px (1.43) para 21px (1.5).
- `text-base` (16px / 1rem): Altura de linha ajustada de 24px (1.5) para 24px (1.5) (explicitado).
- `text-lg` (18px / 1.125rem): Altura de linha ajustada de 28px (1.55) para 27px (1.5).

---

## 2. Escala Fluida (Fluid Typography)

Telas móveis estreitas (ex: 320px a 360px de largura) quebravam títulos longos em caixa alta de forma indesejada devido ao tamanho estático de 48px (`text-5xl`). Usando `clamp()`, o tamanho do título se ajustará suavemente conforme a largura da viewport.

### Equações Fluidas Globais via Tailwind v4 Theme:

- **Display Hero (`text-5xl`)**:
  - Mínimo: `2rem` (32px) em `320px`
  - Máximo: `3rem` (48px) em `768px` (e superiores)
  - CSS: `clamp(2rem, 8vw, 3rem)`
- **Heading 1 (`text-4xl`)**:
  - Mínimo: `1.75rem` (28px) em `320px`
  - Máximo: `2.25rem` (36px) em `768px` (e superiores)
  - CSS: `clamp(1.75rem, 6vw, 2.25rem)`

---

## 3. Plano de Verificação

### Storybook

1. Validar a rampa visual em `Foundations/Typography` do Storybook.
2. Utilizar o addon de acessibilidade (`addon-a11y`) para auditar as regras aplicadas.

### Testes Automatizados

1. Rodar `pnpm lint` e `pnpm typecheck` para garantir que o projeto não possui erros de compilação.
2. Rodar os testes existentes de acessibilidade (`pnpm test` ou `a11y.test.tsx` relevantes).
