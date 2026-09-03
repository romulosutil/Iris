import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFINICOES } from "./prontidao";
import type { DegrauId } from "@/app/(app)/pacientes/[id]/modalidade";

/**
 * Alcance de rota (spec §6 · plano Task 10, Step 0).
 *
 * Um `href` de degrau que aponta para uma rota inexistente — ou para uma
 * página que só chama `redirect()` — é botão morto. O teste de componente
 * renderiza o link e fica verde: ele não sabe nada sobre `src/app`. A #512
 * transformou `/diario/[sessionId]` e `/revisao/[sessionId]` em redirects
 * puros exatamente assim; nada no repo impedia a escada de apontar para lá.
 *
 * Esta prova resolve cada rota contra o filesystem real de `src/app/(app)`,
 * respeitando segmento dinâmico (`[id]`) e route group (`(app)`, `(...)`), e
 * recusa página cujo corpo não renderiza JSX próprio.
 */

const RAIZ_APP = resolve(import.meta.dirname, "..", "..", "app", "(app)");

function ehDiretorio(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function subdirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/**
 * Mapeia os segmentos de URL para o `page.tsx` correspondente.
 * Ordem de tentativa: literal → segmento dinâmico (`[x]`) → route group
 * (consome zero segmentos de URL, por isso recursa com a mesma lista).
 */
function resolverPagina(dir: string, segmentos: string[]): string | null {
  if (segmentos.length === 0) {
    const arquivo = join(dir, "page.tsx");
    return existsSync(arquivo) ? arquivo : null;
  }

  const [cabeca, ...resto] = segmentos;
  const nomes = subdirs(dir);

  const literal = nomes.find((n) => n === cabeca);
  if (literal) {
    const achado = resolverPagina(join(dir, literal), resto);
    if (achado) return achado;
  }

  for (const dinamico of nomes.filter((n) => /^\[.+\]$/.test(n))) {
    const achado = resolverPagina(join(dir, dinamico), resto);
    if (achado) return achado;
  }

  for (const grupo of nomes.filter((n) => /^\(.+\)$/.test(n))) {
    const achado = resolverPagina(join(dir, grupo), segmentos);
    if (achado) return achado;
  }

  return null;
}

/**
 * Redirect puro = a página não renderiza JSX nenhum e chama `redirect(`.
 * Página que usa `redirect()`/`notFound()` só dentro de guarda de permissão
 * continua renderizando JSX e NÃO é botão morto — por isso o critério é a
 * ausência de JSX, não a presença de `redirect`.
 */
function ehRedirectPuro(arquivo: string): boolean {
  const corpo = readFileSync(arquivo, "utf-8");
  const chamaRedirect = /\bredirect\s*\(/.test(corpo);
  const renderizaJsx =
    /return\s*\(?\s*</.test(corpo) || /<\/[A-Za-z]/.test(corpo);
  return chamaRedirect && !renderizaJsx;
}

const IDS = Object.keys(DEFINICOES) as DegrauId[];

describe("alcance de rota dos degraus de prontidão", () => {
  it("a raiz de rotas do app existe (o teste falharia mudo se movessem a pasta)", () => {
    expect(ehDiretorio(RAIZ_APP)).toBe(true);
    expect(IDS.length).toBeGreaterThan(0);
  });

  it.each(IDS)("degrau %s: rota null ou página real, não-redirect", (id) => {
    const rota = DEFINICOES[id].rota("p1");
    if (rota === null) return;

    expect(rota.startsWith("/")).toBe(true);
    const segmentos = rota.split("/").filter(Boolean);
    const arquivo = resolverPagina(RAIZ_APP, segmentos);

    expect(
      arquivo,
      `degrau "${id}" aponta para "${rota}", que não resolve nenhum page.tsx em src/app/(app)`,
    ).not.toBeNull();

    expect(
      ehRedirectPuro(arquivo as string),
      `degrau "${id}" aponta para "${rota}", cuja página só faz redirect() — botão morto`,
    ).toBe(false);
  });

  // Guarda do próprio detector: se ele parasse de reconhecer redirect puro,
  // o teste acima ficaria verde para sempre. As duas páginas abaixo viraram
  // redirect na #512 e são o oráculo negativo.
  it.each(["diario/[sessionId]/page.tsx", "revisao/[sessionId]/page.tsx"])(
    "o detector reconhece %s como redirect puro",
    (rel) => {
      const arquivo = join(RAIZ_APP, ...rel.split("/"));
      expect(existsSync(arquivo)).toBe(true);
      expect(ehRedirectPuro(arquivo)).toBe(true);
    },
  );
});
