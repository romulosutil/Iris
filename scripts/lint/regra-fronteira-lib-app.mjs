import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A-02 (#559, fatia F1): fronteira `lib` ↛ `app`. `src/lib` e
 * `src/components/ui` são os bounded contexts e o design system — eles não
 * podem importar de `src/app`, que é a camada de rota.
 *
 * Regra própria em vez de `no-restricted-imports` por DOIS motivos medidos:
 *
 * 1. `no-restricted-imports` só visita `ImportDeclaration`,
 *    `ExportNamedDeclaration` e `ExportAllDeclaration`, e casa a STRING do
 *    especificador. Três formas de amarrar lib à rota passam livres por ela:
 *    `await import("@/app/…")`, `require("@/app/…")` e o relativo
 *    `import … from "../../app/…"` (que nunca casa o padrão `@/app`).
 * 2. Fechar isso com `no-restricted-syntax` num bloco novo APAGARIA o guard
 *    vizinho: `src/lib/**` já usa essa regra para barrar PHI/PII no
 *    `console.error`, e o flat config não soma opções da mesma regra entre
 *    blocos — vence o último que casa o arquivo. Nome de regra próprio não
 *    colide com nada.
 *
 * Import de TIPO conta: `import type { X } from "@/app/…"` amarra o módulo de
 * lib ao arquivo de rota em tempo de compilação e é precisamente o que impede
 * mover o módulo depois.
 */
const RAIZ = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const ESCOPO_FRONTEIRA = [
  "src/lib/**/*.{ts,tsx}",
  "src/components/ui/**/*.{ts,tsx}",
];

const MSG =
  "Fronteira lib ↛ app (A-02, #559): src/lib e src/components/ui não podem " +
  "importar de src/app — é o domínio dependendo da rota. Mova o que for " +
  "compartilhado (tipo, query ou regra) para src/lib e importe de lá; a rota " +
  "importa de lib, nunca o contrário.";

/**
 * `@/app` exato ou `@/app/…`. O `[^\w-]` depois de `app` é o que impede casar
 * `@/apphelper` — âncora só no prefixo daria falso positivo.
 */
const ALIAS = /^@\/app(?:[^\w-]|$)/;

/**
 * Resolve o especificador relativo contra o arquivo que o escreveu e pergunta
 * se o destino cai em `src/app`. Resolver no filesystem (e não casar o texto
 * por regex) é o que faz `../../app`, `./../app` e `../lib/../app` caírem
 * todos no mesmo veredito, sem enumerar formas de escrever o mesmo caminho.
 */
function relativoAlcancaApp(especificador, arquivo) {
  if (!especificador.startsWith(".")) return false;
  const destino = path.resolve(path.dirname(arquivo), especificador);
  const rel = path.relative(RAIZ, destino).split(path.sep).join("/");
  return rel === "src/app" || rel.startsWith("src/app/");
}

/** @type {import("eslint").Rule.RuleModule} */
const regraSemImportDeApp = {
  meta: {
    type: "problem",
    schema: [],
    docs: { description: MSG },
  },
  create(context) {
    const arquivo = context.filename;
    const proibido = (valor) =>
      typeof valor === "string" &&
      (ALIAS.test(valor) || relativoAlcancaApp(valor, arquivo));
    /** @param {import("estree").Node | null | undefined} no */
    const checar = (no, valor) => {
      if (no && proibido(valor)) context.report({ node: no, message: MSG });
    };
    return {
      // estático, `export … from`, `export * from`
      ImportDeclaration: (n) => checar(n.source, n.source.value),
      ExportNamedDeclaration: (n) => checar(n.source, n.source?.value),
      ExportAllDeclaration: (n) => checar(n.source, n.source?.value),
      // `import()` dinâmico — invisível para `no-restricted-imports`
      ImportExpression: (n) =>
        n.source.type === "Literal" && checar(n.source, n.source.value),
      // `require()` — idem
      "CallExpression[callee.name='require']": (n) => {
        const a = n.arguments[0];
        if (a && a.type === "Literal") checar(a, a.value);
      },
    };
  },
};

export const pluginFronteira = {
  meta: { name: "fronteira", version: "1.0.0" },
  rules: { "sem-import-de-app": regraSemImportDeApp },
};
