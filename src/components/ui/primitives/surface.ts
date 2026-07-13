import { cn } from "@/lib/cn";

/**
 * Fonte ÚNICA da superfície brutalista (Espectro Brutal). Antes cada componente
 * recopiava `border-ink-anchor border-2 shadow-[var(--ds-shadow)]` à mão (17×
 * `border-2` soltos, tokens `--border-brutal`/`--shadow-brutal-inset` com zero
 * consumidores — achado da crítica /impeccable). Agora o valor mora AQUI; os
 * componentes COMPÕEM `surface()`, e o review vê a composição, não classe crua.
 *
 * O PESO (anti-"wireframe gigante") é estrutural, não opcional: `solida` carrega
 * a sombra dura que LEVANTA da superfície; os estados tentativos usam a sombra
 * INSET que AFUNDA — o eixo de profundidade É a honestidade epistêmica
 * (aprovado levanta = fato; sugerido afunda = candidato). Daltônico-seguro.
 */
export type SurfaceVariante =
  | "solida" // fato/conquistado — borda cheia + eleva (peso cheio)
  | "sugerida" // sugerido pela IA — tracejado violeta + afunda (tentativo)
  | "candidata"; // candidato a marco (Fase 4) — pontilhado azul + afunda

const variantes: Record<SurfaceVariante, string> = {
  solida: "border-ink-anchor border-2 shadow-[var(--ds-shadow)]",
  sugerida:
    "border-2 border-dashed border-[color:var(--color-suggested)] shadow-[var(--ds-shadow-inset)]",
  candidata:
    "border-2 border-dotted border-[color:var(--color-blue)] shadow-[var(--ds-shadow-inset)]",
};

export function surface(variante: SurfaceVariante = "solida", className?: string) {
  return cn(variantes[variante], className);
}

/**
 * Fonte única da altura de controle (piso de toque 44px do Modo Clínico —
 * alvo de Casey, terapeuta de uma mão). Antes `min-h-11` cru bypassava
 * `--control-sm/md/lg` (0 consumidores). Inclui `min-w-11` no piso: a crítica
 * flagrou o Chip furando 44px em LARGURA (só `min-h`), quebrando o alvo de toque.
 */
export type ControlTam = "sm" | "md" | "lg";

const alturas: Record<ControlTam, string> = {
  sm: "min-h-11", // 44px
  md: "min-h-12", // 48px
  lg: "min-h-14", // 56px
};

export function control(tam: ControlTam = "sm", className?: string) {
  return cn(alturas[tam], className);
}
