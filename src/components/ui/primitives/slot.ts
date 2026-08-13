import * as React from "react";
import { cn } from "@/lib/cn";

export type PropsSlot = Record<string, unknown>;

/**
 * Mescla de props no padrão Radix Slot, compartilhada pelos componentes com
 * `asChild` (Button, InteractiveCard): o filho vence em conflitos comuns,
 * `className` é combinada via `cn` (tailwind-merge resolve conflitos de
 * utilitário de forma determinística — o filho vence), `style` é combinado e
 * handlers `onX` são compostos — o do filho roda primeiro e
 * `event.preventDefault()` cancela o do slot.
 *
 * Diferente de um spread cru, um handler presente no filho com valor
 * `undefined` (ex.: `onClick={cond ? fn : undefined}`) não apaga o handler do
 * slot — o do slot é restaurado, como no Radix.
 */
export function mesclarPropsSlot(
  propsDoSlot: PropsSlot,
  propsDoFilho: PropsSlot,
): PropsSlot {
  const mescladas: PropsSlot = { ...propsDoSlot, ...propsDoFilho };
  for (const nome of Object.keys(propsDoSlot)) {
    const doSlot = propsDoSlot[nome];
    const doFilho = propsDoFilho[nome];
    if (/^on[A-Z]/.test(nome) && typeof doSlot === "function") {
      if (typeof doFilho === "function") {
        mescladas[nome] = (...args: unknown[]) => {
          (doFilho as (...a: unknown[]) => void)(...args);
          const evento = args[0] as { defaultPrevented?: boolean } | undefined;
          if (!evento?.defaultPrevented) {
            (doSlot as (...a: unknown[]) => void)(...args);
          }
        };
      } else if (doFilho == null) {
        mescladas[nome] = doSlot;
      }
    } else if (nome === "className") {
      mescladas.className = cn(doSlot as string, doFilho as string);
    } else if (nome === "style") {
      mescladas.style = {
        ...(doSlot as React.CSSProperties),
        ...(doFilho as React.CSSProperties),
      };
    }
  }
  return mescladas;
}

type LimpezaRef = (() => void) | undefined;

function atribuirRef<T>(
  ref: React.Ref<T> | undefined | null,
  node: T | null,
): LimpezaRef {
  if (typeof ref === "function") {
    const retorno = ref(node);
    return typeof retorno === "function" ? retorno : undefined;
  }
  if (ref != null) {
    (ref as React.MutableRefObject<T | null>).current = node;
  }
  return undefined;
}

/**
 * Compõe múltiplos refs num único callback ref, preservando o contrato de
 * limpeza do React 19: se algum callback ref retornar função de limpeza, o
 * callback composto também retorna uma — que executa cada limpeza e, para os
 * refs sem limpeza própria, faz o detach clássico com `null`.
 */
export function comporRefs<T>(
  ...refs: Array<React.Ref<T> | undefined | null>
): React.RefCallback<T> {
  return (node) => {
    let temLimpeza = false;
    const limpezas = refs.map((ref) => {
      const limpeza = atribuirRef(ref, node);
      if (limpeza) temLimpeza = true;
      return limpeza;
    });
    if (temLimpeza) {
      return () => {
        refs.forEach((ref, indice) => {
          const limpeza = limpezas[indice];
          if (limpeza) {
            limpeza();
          } else {
            atribuirRef(ref, null);
          }
        });
      };
    }
  };
}
