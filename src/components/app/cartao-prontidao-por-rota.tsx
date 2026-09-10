"use client";

import { usePathname } from "next/navigation";
import { CartaoProntidao, type CartaoProntidaoProps } from "./cartao-prontidao";

/**
 * Escolhe a forma do cartão da escada pela rota ATUAL do prontuário.
 *
 * O cartão mora no `layout.tsx` do paciente — e por isso aparecia inteiro
 * (seis degraus + gesto, ~400px) em TODAS as abas: Briefing, Horas, Metas…
 * Cada troca de aba empurrava o título da tela para baixo da dobra, e o
 * operador que já leu a escada uma vez lia de novo a cada clique. A escada
 * completa só faz sentido na aba que fala dela ("veja o cartão no topo desta
 * página", em `evolucao-vazia.tsx`); nas outras, uma linha com o próximo passo
 * basta e devolve a tela à aba.
 *
 * `usePathname`, não `useSelectedLayoutSegment`: a rota "completa" depende da
 * modalidade (a base redireciona para `Temas` em `conventional`), então quem
 * sabe qual é a aba de origem é o layout — ele passa o caminho, aqui só se
 * compara. A comparação ignora a barra final.
 */
export function CartaoProntidaoPorRota({
  rotaCompleta,
  ...props
}: CartaoProntidaoProps & {
  /** Caminho em que o cartão aparece inteiro; nos demais, compacto. */
  rotaCompleta: string;
}) {
  const pathname = usePathname();
  const normalizar = (p: string) => p.replace(/\/+$/, "");
  const compacto = normalizar(pathname ?? "") !== normalizar(rotaCompleta);
  return <CartaoProntidao {...props} compacto={compacto} />;
}
