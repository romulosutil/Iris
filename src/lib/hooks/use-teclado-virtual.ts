"use client";

import { useEffect, useState } from "react";

/**
 * Diferença mínima, em px, entre a altura da janela e a do viewport visual
 * para considerar que o teclado virtual está aberto.
 *
 * 150px separa os dois casos que importam: a barra de endereço do Chrome no
 * Android recolhe ~60px ao rolar (não é teclado), enquanto o menor teclado de
 * celular ocupa ~250px. Um limiar baixo demais faz a BottomNav piscar a cada
 * rolagem da página.
 */
const LIMIAR_PX = 150;

/**
 * Diz se o teclado virtual está ocupando a tela (#185, Etapa 1).
 *
 * Não existe API de "teclado aberto" portável. O sinal disponível é o
 * `visualViewport`: quando o teclado sobe, o viewport VISUAL encolhe enquanto
 * `window.innerHeight` (o viewport de layout) fica igual. A diferença entre os
 * dois é a altura do teclado.
 *
 * Fora do navegador, sem `visualViewport`, o retorno é `false` — o padrão
 * seguro, porque significa "mostre a barra", que é o comportamento de sempre.
 */
export function useTecladoVirtualAberto(): boolean {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const avaliar = () => {
      setAberto(window.innerHeight - vv.height > LIMIAR_PX);
    };

    avaliar();
    vv.addEventListener("resize", avaliar);
    return () => vv.removeEventListener("resize", avaliar);
  }, []);

  return aberto;
}
