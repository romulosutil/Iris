import localFont from "next/font/local";

/**
 * Fonte única dos loaders de fonte do app. `layout.tsx` e `global-error.tsx`
 * precisam declarar o MESMO par de famílias/pesos/variáveis — duplicar a
 * chamada de loader em dois módulos gera dois módulos CSS e duas listas de
 * pesos para sincronizar à mão (drift só aparece na página de crash, em
 * produção). Importar daqui torna o drift impossível.
 *
 * `next/font/local` (não `next/font/google`): o loader do Google BAIXA os
 * .woff2 de fonts.gstatic.com em build time. Quando a VPS não alcançou o
 * host (deploy de 17/08/2026), o fetch falhou e o Turbopack derrubou o build
 * com 25× `Module not found: Can't resolve
 * '@vercel/turbopack-next/internal/font/google/font'` — sem nenhuma mudança
 * de código. Com os arquivos versionados aqui, `pnpm build` não toca a rede.
 *
 * Ambas as famílias são variable fonts: um arquivo cobre toda a faixa de
 * peso declarada em `weight`. Subset: apenas `latin` (U+0000-00FF), que
 * cobre 100% do português — acentos, cedilha e til inclusos. Para atualizar,
 * pegar a URL do subset latin em
 * https://fonts.googleapis.com/css2?family=... com User-Agent de navegador
 * moderno (a API serve .woff2 só nesse caso).
 */
export const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  weight: "500 700",
  style: "normal",
  variable: "--font-space-grotesk",
  display: "swap",
});

export const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-jakarta",
  display: "swap",
});

/** Classes de variável CSS das duas famílias, prontas para o `<html>`. */
export const fontVariables = `${spaceGrotesk.variable} ${jakarta.variable}`;
