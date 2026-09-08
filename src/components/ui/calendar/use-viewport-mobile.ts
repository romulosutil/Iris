"use client";

import * as React from "react";

/**
 * Corte do R-30 (#512): abaixo de `md` (768px, convenção Tailwind do repo) a
 * escala "Dia" deixa de ser grade de N colunas. O valor vive aqui, e não em
 * cada consumidor, porque agora DUAS decisões dependem do mesmo corte: o
 * `CalendarGrid` troca grade por lista cronológica, e `/agenda` escolhe a
 * visão padrão (#283 — em tela estreita o default do coordenador é "Por
 * Horário", não "Matriz Geral"). Duas cópias do número dessincronizariam em
 * silêncio: a grade viraria lista numa largura e o default mudaria noutra.
 */
export const MOBILE_BREAKPOINT_PX = 768;

/**
 * `true` quando o viewport está abaixo do breakpoint mobile.
 *
 * Começa `false` e só decide depois da montagem: no servidor não há
 * `matchMedia`, e chutar `true` no primeiro render faria o desktop piscar a
 * variante mobile antes de se corrigir.
 */
export function useViewportMobile(): boolean {
  const [mobile, setMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const atualizar = () => setMobile(mql.matches);
    atualizar();
    mql.addEventListener("change", atualizar);
    return () => mql.removeEventListener("change", atualizar);
  }, []);

  return mobile;
}
