/**
 * Regra 0 do design system (AGENTS.md): nunca estilizar ad hoc. Enforcement
 * da auditoria 360 (DS-05, #538).
 *
 * Acusa, em literais de classe (atributo `className`, argumentos de
 * `cn`/`clsx`/`cva`/`twMerge`/`surface`/`control` e valores de objeto), a
 * paleta crua do Tailwind (`bg-slate-900`, `text-gray-400`, `border-black`,
 * `bg-white`, …) e tamanhos de fonte abaixo do piso de 12px (`text-[10px]`).
 * O caminho certo é sempre um token de `src/styles/globals.css`
 * (`text-[var(--text-secondary)]`, `bg-status-success-bg`, …) ou um
 * componente de `src/components/ui/**`.
 *
 * É um plugin inline (não `no-restricted-syntax`) de propósito: blocos
 * posteriores do flat config SUBSTITUEM as opções de uma mesma regra, e
 * `no-restricted-syntax` já é usada por outro bloco em `src/app/**` — as duas
 * listas de seletores se apagariam mutuamente no merge.
 */

const CORES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PROPRIEDADES =
  "bg|text|border|border-[trblxyse]|ring|ring-offset|fill|stroke|from|via|to|divide|outline|decoration|placeholder|caret|accent|shadow";

/** `bg-slate-900`, `text-gray-400/80`, `border-black`, `bg-white`, com ou sem prefixo de variante (`hover:`, `dark:`). */
export const PALETA_CRUA = new RegExp(
  `(?:^|[\\s"'\`:!])(?:${PROPRIEDADES})-(?:(?:${CORES})-(?:50|[1-9]00|950)|black|white)(?:/\\d{1,3})?(?=$|[\\s"'\`])`,
);

/** `text-[10px]`, `text-[11.5px]` — qualquer tamanho arbitrário abaixo de 12px. */
export const FONTE_ABAIXO_DO_PISO = new RegExp(
  `(?:^|[\\s"'\`:!])text-\\[(?:[0-9]|1[01])(?:\\.\\d+)?px\\](?=$|[\\s"'\`])`,
);

const CHAMADAS_DE_CLASSE = new Set([
  "cn",
  "clsx",
  "cva",
  "twMerge",
  "surface",
  "control",
]);

function contextoDeClasse(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (
      n.type === "JSXAttribute" &&
      (n.name?.name === "className" || n.name?.name === "class")
    ) {
      return true;
    }
    if (
      n.type === "CallExpression" &&
      n.callee.type === "Identifier" &&
      CHAMADAS_DE_CLASSE.has(n.callee.name)
    ) {
      return true;
    }
    if (n.type === "Property" && n.value === node) return true;
    if (n.type === "Property" && n.key !== node) return true;
    if (
      n.type === "FunctionDeclaration" ||
      n.type === "FunctionExpression" ||
      n.type === "ArrowFunctionExpression" ||
      n.type === "Program"
    ) {
      return false;
    }
  }
  return false;
}

const SEPARADOR_INICIAL = /^[\s"'`:!]+/;

/** Um achado por ocorrência (o baseline conta ocorrências, não literais). */
export function achadosNoTexto(texto) {
  const achados = [];
  for (const [tipo, regex] of [
    ["paleta", PALETA_CRUA],
    ["fonte", FONTE_ABAIXO_DO_PISO],
  ]) {
    const global = new RegExp(regex.source, "g");
    for (const m of texto.matchAll(global)) {
      achados.push({ tipo, trecho: m[0].replace(SEPARADOR_INICIAL, "") });
    }
  }
  return achados;
}

const MENSAGENS = {
  paleta:
    "[DS-05] Paleta crua do Tailwind (`{{trecho}}`) em classe: use um token de globals.css (ex.: text-[var(--text-secondary)], bg-status-success-bg, border-[var(--border-brutal)]) ou um componente de src/components/ui.",
  fonte:
    "[DS-05] `{{trecho}}` está abaixo do piso tipográfico de 12px do DS (U-04): use text-xs ou maior.",
};

/** @type {import("eslint").Rule.RuleModule} */
export const semPaletaCrua = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe paleta crua do Tailwind e fonte abaixo de 12px em literais de classe (Regra 0 do DS).",
    },
    schema: [],
    messages: MENSAGENS,
  },
  create(context) {
    function verificar(node, texto) {
      if (typeof texto !== "string" || !texto) return;
      if (!contextoDeClasse(node)) return;
      for (const achado of achadosNoTexto(texto)) {
        context.report({
          node,
          messageId: achado.tipo,
          data: { trecho: achado.trecho },
        });
      }
    }
    return {
      Literal(node) {
        verificar(node, node.value);
      },
      TemplateElement(node) {
        verificar(node, node.value.raw);
      },
    };
  },
};

export const pluginDS = {
  meta: { name: "ds", version: "1.0.0" },
  rules: { "sem-paleta-crua": semPaletaCrua },
};

/** Escopo da Regra 0 com enforcement (DS-05). Landing/admin ficam fora por ora. */
export const ESCOPO_DS = [
  "src/app/(app)/**/*.{ts,tsx}",
  "src/components/ui/**/*.{ts,tsx}",
  "src/components/app/**/*.{ts,tsx}",
];

export const FORA_DO_ESCOPO_DS = [
  "**/*.test.{ts,tsx}",
  "**/*.stories.{ts,tsx}",
];

/**
 * Caminho literal → glob que casa SÓ aquele caminho. Rotas do App Router têm
 * `[id]`, que num glob é classe de caracteres ("i" ou "d") — sem escapar, o
 * baseline não ignora `pacientes/[id]/equipe/page.tsx` e o teste de config
 * acusa. Parênteses de `(app)` não são especiais fora de extglob.
 */
export function comoGlobLiteral(caminho) {
  // Escape completo (CodeQL js/incomplete-sanitization): colchetes E barra
  // invertida, mais os demais metacaracteres — minimatch aceita `\x` para
  // qualquer `x`, então escapar a mais é inócuo.
  return caminho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
