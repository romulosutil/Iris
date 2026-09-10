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
 *
 * Inclui a densidade desktop do `Input`/`SelectTrigger`: a partir de `md` o
 * repouso fica no grafite suave sem sombra e o peso brutalista (borda cheia +
 * sombra dura) volta no foco. Sem isso o select nativo ficava sempre pesado
 * ao lado de `Input`s em repouso — na anamnese, cinco selects pretos com
 * sombra entre campos cinzas liam como formulário meio sem estilo.
 */
export const NATIVE_SELECT_CLASSNAME =
  "min-h-[var(--control-sm)] rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)] md:border-[var(--border-muted)] md:focus-visible:border-[var(--border-brutal)] md:focus-visible:shadow-[var(--shadow-brutal)] md:aria-[invalid=true]:border-[var(--status-error-border)] md:aria-[invalid=true]:shadow-[var(--shadow-brutal)]";
