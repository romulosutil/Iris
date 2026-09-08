/**
 * Aparência compartilhada para `<select>` NATIVO (fora do Radix `Select` de
 * `select.tsx`). Existe porque alguns formulários são Server Component com
 * `<form method="GET">`/`action` — o `Select` do DS é Radix, roda só no
 * cliente e nem submete valor nativo, então não serve ali.
 *
 * Ficou de propósito FORA de `select.tsx`: aquele arquivo é `"use client"`,
 * e módulo cliente importado por um Server Component vira client reference —
 * seguro só para os componentes que ele exporta, não para reaproveitar um
 * valor simples daqui em uma page/server action (armadilha já documentada:
 * "use client" quebra chamada do servidor). Este arquivo não tem diretiva,
 * então serve os dois lados sem esse risco.
 *
 * Espelha as classes de aparência (borda, raio, fundo, texto, foco) do
 * `SelectTrigger` — não a largura/layout, que cada consumidor decide
 * (w-full, flex-1, min-w-0 etc conforme o contexto do formulário).
 */
export const NATIVE_SELECT_CLASSNAME =
  "min-h-[var(--control-sm)] rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]";
