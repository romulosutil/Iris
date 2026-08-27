import { describe, expect, it } from "vitest";
import { viewport } from "./layout";

describe("viewport do documento", () => {
  it("declara viewport-fit=cover para habilitar env(safe-area-inset-*)", () => {
    // Sem `viewportFit: "cover"` o Chrome no Android reserva a barra de gestos
    // e `env(safe-area-inset-bottom)` resolve para 0px — a Bottom Bar de #185
    // ficaria por baixo da barra do sistema sem nenhum sinal em teste de
    // componente (jsdom não emula safe-area).
    expect(viewport.viewportFit).toBe("cover");
  });

  it("usa o dourado da marca como theme-color", () => {
    // Mesmo valor que o `manifest.ts` da Etapa 2 declara. Divergir entre os
    // dois faz a barra de status do TWA piscar de cor na primeira navegação.
    expect(viewport.themeColor).toBe("#f2b705");
  });

  it("não trava o zoom do usuário", () => {
    // `maximumScale`/`userScalable` bloqueados reprovam WCAG 1.4.4 e são o
    // atalho mais comum para "resolver" estouro horizontal.
    expect(viewport.maximumScale).toBeUndefined();
    expect(viewport.userScalable).toBeUndefined();
  });
});
