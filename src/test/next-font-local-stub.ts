/**
 * Stub de `next/font/local` para Vitest.
 *
 * O loader real faz transformação em build-time via SWC (carrega o .woff2,
 * gera hash, escreve CSS) — fora do alcance do Vite/esbuild que roda os
 * testes. Sem este alias, qualquer teste que importe (direta ou
 * transitivamente) `src/app/fonts.ts` quebra com `TypeError: default is not
 * a function`, mesmo sem nada relacionado a fonte no que está sendo testado.
 */
export default function localFont(options: { variable?: string }) {
  return {
    className: "",
    variable: options.variable ?? "",
    style: { fontFamily: "" },
  };
}
