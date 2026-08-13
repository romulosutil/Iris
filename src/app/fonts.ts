import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Fonte única dos loaders de fonte do app. `layout.tsx` e `global-error.tsx`
 * precisam declarar o MESMO par de famílias/pesos/variáveis — duplicar a
 * chamada `Space_Grotesk({...})` em dois módulos gera dois módulos CSS e
 * duas listas de pesos para sincronizar à mão (drift só aparece na página
 * de crash, em produção). Importar daqui torna o drift impossível.
 */
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

/** Classes de variável CSS das duas famílias, prontas para o `<html>`. */
export const fontVariables = `${spaceGrotesk.variable} ${jakarta.variable}`;
