import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A-02 (#559, fatia F5): quebra do ciclo `src/lib/email` ⇄ `src/lib/billing`.
 *
 * A aresta que existia: `src/lib/email/templates.ts` importava `formatarBRL`
 * de `@/lib/billing/calculator`, enquanto `src/lib/billing/notificacao-cancelamento.ts`
 * importa `@/lib/email/templates` e `@/lib/email/transacional` — dois módulos
 * de domínios irmãos se importando um ao outro. A correção (nesta fatia) foi
 * mover `formatarBRL` — formatador puro de moeda, sem regra de billing — para
 * `src/lib/moeda.ts`. Este arquivo é o guard que impede a aresta
 * `email → billing` de voltar por qualquer porta.
 *
 * Varredura de texto (regex), não regra de ESLint: o escopo aqui é UM
 * diretório (`src/lib/email`) contra UM alvo (`src/lib/billing`), não a
 * fronteira geral `lib ↛ app` da F1 (que precisou de uma regra de ESLint
 * própria para não colidir com o bloco `no-restricted-syntax` vizinho em
 * `src/lib/**`). Não há esse risco de colisão aqui.
 *
 * Cobre as MESMAS três formas que escapam de `no-restricted-imports`
 * (precedente da F1, #603):
 * 1. `import … from "@/lib/billing/…"` (estático, inclusive `import type` e
 *    `export … from`/`export * from`).
 * 2. `import "@/lib/billing/…"` (efeito colateral, sem `from`).
 * 3. `import(...)` dinâmico e `require(...)`.
 *
 * Cobre também o especificador RELATIVO (`../billing/...`), resolvido no
 * filesystem a partir do arquivo que o escreveu — não a string crua — para
 * que `../billing`, `./../billing` etc. caiam todos no mesmo veredito.
 *
 * O que este guard NÃO cobre: um `await import(x)` com `x` uma variável (o
 * especificador não é um literal de string). Medido no momento em que este
 * guard nasceu (03/09/2026): `src/lib/email` só tem dois dynamic imports —
 * `resend.ts:65` (`import("resend")`) e `transacional.ts:37`
 * (`import("resend")`) — nenhum deles aponta para `@/lib/billing`, e nenhum
 * import dinâmico no diretório usa especificador computado.
 */
const RAIZ = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const DIR_EMAIL = "src/lib/email";
export const DIR_BILLING_ALVO = "src/lib/billing";

/** `@/lib/billing` exato ou `@/lib/billing/…`. */
const ALIAS_BILLING = /^@\/lib\/billing(?:[^\w-]|$)/;

/**
 * Extrai todo especificador de módulo importado/exportado/requerido do texto
 * de um arquivo TS/TSX. Não é um parser completo — é regex deliberadamente
 * simples, suficiente para os quatro formatos que a sintaxe de import/export
 * do JS/TS admite (ver comentário do módulo).
 */
export function extrairEspecificadores(codigo) {
  const especificadores = new Set();
  const padroes = [
    // `import … from "x"` / `export … from "x"` (estático, tipo, re-export)
    /\b(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g,
    // `import "x"` — efeito colateral, sem `from`
    /^\s*import\s+["']([^"']+)["']/gm,
    // `import("x")` dinâmico
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    // `require("x")`
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const padrao of padroes) {
    for (const m of codigo.matchAll(padrao)) {
      especificadores.add(m[1]);
    }
  }
  return [...especificadores];
}

/**
 * Resolve o especificador relativo contra o arquivo que o escreveu e
 * pergunta se o destino cai em `src/lib/billing`. Mesma técnica da F1
 * (`regra-fronteira-lib-app.mjs`): resolver no filesystem, não casar a
 * string por regex, é o que faz `../billing`, `./../billing` e
 * `../lib/../billing` caírem todos no mesmo veredito.
 */
function relativoAlcancaBilling(especificador, arquivoAbsoluto) {
  if (!especificador.startsWith(".")) return false;
  const destino = path.resolve(path.dirname(arquivoAbsoluto), especificador);
  const rel = path.relative(RAIZ, destino).split(path.sep).join("/");
  return rel === DIR_BILLING_ALVO || rel.startsWith(DIR_BILLING_ALVO + "/");
}

/**
 * Devolve os especificadores de `codigo` (arquivo em `arquivoAbsoluto`) que
 * violam a fronteira `email ↛ billing`.
 */
export function especificadoresProibidos(codigo, arquivoAbsoluto) {
  return extrairEspecificadores(codigo).filter(
    (esp) =>
      ALIAS_BILLING.test(esp) || relativoAlcancaBilling(esp, arquivoAbsoluto),
  );
}
