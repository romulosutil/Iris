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

/**
 * Eixo de profundidade (indexa a escala --elevation-* dos tokens). `base` usa
 * o ponteiro mode-aware --ds-shadow (Clínico eleva cheio, Família reduz sem
 * rebuild); os demais são fixos. `inset` é o AFUNDA violeta soft (fiel ao
 * reference e ao card sugerido pela IA), não a sombra reversa legada.
 */
export type ElevationNivel =
  | "flat" // rente — sem sombra
  | "raise" // levanta sutil (--elevation-1)
  | "base" // levanta cheio, mode-aware (--ds-shadow)
  | "hover" // pico de interação (+1 nível sobre --ds-shadow, mode-aware via --ds-shadow-hover)
  | "inset" // afunda (--elevation-inset)
  | "overlay"; // flutua acima do canvas — modal/popover (--elevation-overlay)

/** Rampa de raio (indexa --radius-* dos tokens). */
export type RadiusNivel =
  | "none"
  | "xs"
  | "sm"
  | "control"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "pill";

const bordas: Record<SurfaceVariante, string> = {
  solida: "border-[length:var(--border-brutal)] border-border-brutal",
  sugerida:
    "border-[length:var(--border-brutal)] border-dashed border-status-ia-border",
  candidata:
    "border-[length:var(--border-brutal)] border-dotted border-status-info-bg",
};

const elevacoes: Record<ElevationNivel, string> = {
  flat: "shadow-none",
  raise: "shadow-[var(--elevation-1)]",
  base: "shadow-[var(--ds-shadow)]",
  hover: "shadow-[var(--ds-shadow-hover)]",
  inset: "shadow-[var(--elevation-inset)]",
  overlay: "shadow-[var(--elevation-overlay)]",
};

const raios: Record<RadiusNivel, string> = {
  none: "rounded-none",
  xs: "rounded-[var(--radius-xs)]",
  sm: "rounded-[var(--radius-sm)]",
  control: "rounded-[var(--radius-control)]",
  md: "rounded-[var(--radius-md)]",
  lg: "rounded-[var(--radius-lg)]",
  xl: "rounded-[var(--radius-xl)]",
  "2xl": "rounded-[var(--radius-2xl)]",
  pill: "rounded-[var(--radius-pill)]",
};

/**
 * Defaults por variante — o eixo de profundidade É a honestidade epistêmica:
 * `solida` LEVANTA (fato), tentativos AFUNDAM. Todas nascem com raio macio
 * (`md` = 6px), coerente com o reference; sobrescreva por consumidor.
 */
const defaults: Record<
  SurfaceVariante,
  { elevation: ElevationNivel; radius: RadiusNivel }
> = {
  solida: { elevation: "base", radius: "md" },
  sugerida: { elevation: "inset", radius: "md" },
  candidata: { elevation: "inset", radius: "md" },
};

export interface SurfaceOpts {
  elevation?: ElevationNivel;
  radius?: RadiusNivel;
  className?: string;
}

/**
 * Fonte única da superfície: acopla borda + elevação + raio num só ponto.
 * Aceita `opts` como objeto {elevation, radius, className} ou, por
 * compatibilidade, uma string tratada como className (default de variante).
 */
export function surface(
  variante: SurfaceVariante = "solida",
  opts?: SurfaceOpts | string,
) {
  const o: SurfaceOpts =
    typeof opts === "string" ? { className: opts } : (opts ?? {});
  const d = defaults[variante];
  return cn(
    bordas[variante],
    elevacoes[o.elevation ?? d.elevation],
    raios[o.radius ?? d.radius],
    o.className,
  );
}

/**
 * Fonte única da altura de controle (piso de toque 44px do Modo Clínico —
 * alvo de Casey, terapeuta de uma mão). Antes `min-h-11` cru bypassava
 * `--control-sm/md/lg` (0 consumidores). Inclui `min-w-11` no piso: a crítica
 * flagrou o Chip furando 44px em LARGURA (só `min-h`), quebrando o alvo de toque.
 */
export type ControlTam = "sm" | "md" | "lg";

const alturas: Record<ControlTam, string> = {
  sm: "min-h-11 min-w-11", // 44px
  md: "min-h-12 min-w-12", // 48px
  lg: "min-h-14 min-w-14", // 56px
};

export function control(tam: ControlTam = "sm", className?: string) {
  return cn(alturas[tam], className);
}
