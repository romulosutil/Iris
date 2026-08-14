import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

/**
 * Guard da fronteira Server/Client Component.
 *
 * `pnpm build` NÃO pega esta classe de erro: toda rota do app é `ƒ` (dinâmica,
 * renderizada por requisição), então o build nunca executa o componente. E o
 * teste de a11y também não pega, porque chama o `layout()` como função async
 * comum e renderiza o resultado no jsdom — ou seja, com o React *cliente*, onde
 * `useState` existe.
 *
 * No bundle de servidor o `react` é resolvido pela condição de exportação
 * `react-server`, onde `React.useState` é literalmente `undefined`. Um módulo
 * com hook de cliente e sem a diretiva `"use client"`, importado por um Server
 * Component, quebra em `TypeError` na primeira requisição da rota — em
 * produção, não no CI.
 *
 * Reproduzir a condição:
 *   node --conditions=react-server -e "console.log(typeof require('react').useState)"
 *   → undefined
 */
const RAIZ_SRC = resolve(__dirname, "..");

const HOOKS_SOMENTE_CLIENTE =
  /\buse(State|Reducer|Effect|LayoutEffect|Transition|DeferredValue|Optimistic|ActionState|FormStatus|Ref|Callback|Memo|Context|ImperativeHandle|SyncExternalStore)\s*\(/;

function temDiretivaUseClient(codigo: string): boolean {
  // A diretiva só vale na primeira instrução do módulo.
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*["']use client["']/.test(
    codigo,
  );
}

function arquivosDeRota(dir: string, acumulador: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      arquivosDeRota(caminho, acumulador);
    } else if (
      /^(layout|page|template|default|error|loading|not-found)\.tsx$/.test(
        entrada,
      )
    ) {
      acumulador.push(caminho);
    }
  }
  return acumulador;
}

function resolverAlias(especificador: string): string | null {
  if (!especificador.startsWith("@/")) return null;
  const base = join(RAIZ_SRC, especificador.slice(2));
  for (const sufixo of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + sufixo) && statSync(base + sufixo).isFile())
      return base + sufixo;
  }
  return null;
}

test("Server Component não importa módulo com hook de cliente sem 'use client'", () => {
  const infracoes: string[] = [];

  for (const rota of arquivosDeRota(join(RAIZ_SRC, "app"))) {
    const codigoRota = readFileSync(rota, "utf8");
    if (temDiretivaUseClient(codigoRota)) continue; // é Client Component: fronteira já declarada

    for (const encontro of codigoRota.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
      const especificador = encontro[1];
      if (!especificador) continue;
      const alvo = resolverAlias(especificador);
      if (!alvo) continue;
      const codigoAlvo = readFileSync(alvo, "utf8");
      if (!HOOKS_SOMENTE_CLIENTE.test(codigoAlvo)) continue;
      if (temDiretivaUseClient(codigoAlvo)) continue;
      infracoes.push(
        `${rota.replace(RAIZ_SRC, "src")} importa ${especificador} ` +
          `(${alvo.replace(RAIZ_SRC, "src")}) que usa hook de cliente sem "use client"`,
      );
    }
  }

  expect(infracoes).toEqual([]);
});
