import type { Page } from "@playwright/test";

/**
 * Piso de viewport do gate mobile (#185, decisão de 27/08/2026).
 *
 * 360×740 é o menor Android relevante em uso (linha Galaxy A). O corpo da issue
 * #185 falava em 320px; a spec falava em 360px. O 360 venceu porque nenhum
 * aparelho em circulação entrega 320px CSS, e cada pixel a menos no piso cobra
 * ajuste de layout em tabela clínica densa sem público que o justifique.
 */
export const VIEWPORT_MOBILE = { width: 360, height: 740 } as const;

export interface Culpado {
  /** `tag#id.classe` — o suficiente para achar o elemento no código. */
  descricao: string;
  /** Borda direita do elemento, em px, relativa à origem do documento. */
  direita: number;
  largura: number;
}

export interface ResultadoOverflow {
  larguraViewport: number;
  larguraDocumento: number;
  culpados: Culpado[];
}

/**
 * Mede estouro horizontal da PÁGINA, não de contêineres internos.
 *
 * O oráculo é `documentElement.scrollWidth > clientWidth`: é exatamente isso
 * que o usuário sente como "a tela desliza para o lado". Uma tabela larga
 * dentro de um `overflow-x-auto` NÃO estoura o documento — e é um padrão
 * legítimo que o repo já usa em `agenda-calendar-grid` e `comparative-matrix`.
 * Assertar elemento a elemento reprovaria esses casos.
 *
 * A lista de `culpados` é diagnóstico, não oráculo: serve para a mensagem de
 * falha apontar o que consertar. Ela existe porque o modo de falha mais caro
 * aqui é invisível — um `sr-only` dentro de `<table>` não limita a largura da
 * tabela e produz rolagem horizontal que ninguém vê na tela (memória
 * `sr-only-em-table-nao-limita-largura`).
 */
export async function medirOverflowHorizontal(
  page: Page,
): Promise<ResultadoOverflow> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const larguraViewport = doc.clientWidth;
    const culpados: {
      descricao: string;
      direita: number;
      largura: number;
    }[] = [];

    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    )) {
      const estilo = getComputedStyle(el);
      if (estilo.display === "none" || estilo.visibility === "hidden") continue;

      const retangulo = el.getBoundingClientRect();
      if (retangulo.width === 0 && retangulo.height === 0) continue;

      const direita = Math.round(retangulo.right + window.scrollX);
      // Tolerância de 1px: arredondamento sub-pixel de layout não é defeito.
      if (direita <= larguraViewport + 1) continue;

      // Elemento dentro de um contêiner que rola na horizontal de propósito
      // não é culpado — o pai absorve o transbordo.
      let pai = el.parentElement;
      let absorvido = false;
      while (pai && pai !== document.body) {
        const estiloPai = getComputedStyle(pai);
        if (
          estiloPai.overflowX === "auto" ||
          estiloPai.overflowX === "scroll"
        ) {
          absorvido = true;
          break;
        }
        pai = pai.parentElement;
      }
      if (absorvido) continue;

      const id = el.id ? `#${el.id}` : "";
      const classe = el.className
        ? `.${String(el.className).trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
      culpados.push({
        descricao: `${el.tagName.toLowerCase()}${id}${classe}`,
        direita,
        largura: Math.round(retangulo.width),
      });
    }

    return {
      larguraViewport,
      larguraDocumento: doc.scrollWidth,
      culpados: culpados.slice(0, 12),
    };
  });
}
