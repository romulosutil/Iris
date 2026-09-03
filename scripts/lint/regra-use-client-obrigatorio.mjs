/**
 * Guard da classe do achado #583: módulo que usa hook de cliente do React sem
 * declarar `"use client"`.
 *
 * Por que é uma regra e não uma revisão: a diretiva é do MÓDULO e propaga por
 * importação. Um componente sem ela funciona enquanto TODOS os importadores
 * forem client — blindagem acidental, não decidida. No dia em que alguém
 * converte uma `page.tsx` para Server Component (refactor natural e barato), o
 * erro estoura apontando para o componente, não para quem mexeu. O CI fica
 * verde até lá: o teste de componente roda em jsdom, onde `useState` sempre
 * funciona.
 *
 * A varredura da #583 achou dois módulos em `src/components/ui/`. Um deles,
 * `protocol-dashboard-charts.tsx`, já era falha VIVA: `ProtocolTrendChart` usa
 * `React.useState` e é renderizado direto por duas `page.tsx` `async` (Server
 * Components) — `pacientes/[id]/pei` e `pacientes/[id]/protocolos`.
 *
 * Piso é ZERO, sem baseline: a varredura fechou em 2 achados, ambos corrigidos
 * nesta mesma PR. Baseline com contagem (padrão `ds-paleta-crua.baseline.json`)
 * só se justifica quando o passivo é grande demais para zerar de uma vez; aqui
 * não é o caso.
 */

/**
 * Hooks que só existem no runtime de cliente. `use()` fica FORA de propósito:
 * é o único hook que funciona em Server Component.
 */
export const HOOKS_DE_CLIENTE = new Set([
  "useState",
  "useReducer",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useRef",
  "useCallback",
  "useMemo",
  "useContext",
  "useImperativeHandle",
  "useSyncExternalStore",
  "useTransition",
  "useDeferredValue",
  "useOptimistic",
  "useActionState",
  "useFormStatus",
  "useId",
]);

/**
 * `true` se o prólogo de diretivas do módulo contém `"use client"`.
 *
 * Só o PRÓLOGO conta: a diretiva precisa vir antes de qualquer instrução, e
 * uma string solta no meio do arquivo não liga o boundary. Comentários antes
 * dela são permitidos (não são nós do corpo).
 */
export function temDiretivaUseClient(program) {
  for (const no of program.body) {
    if (
      no.type !== "ExpressionStatement" ||
      no.expression?.type !== "Literal" ||
      typeof no.expression.value !== "string"
    ) {
      // Primeira instrução de verdade: o prólogo acabou.
      return false;
    }
    if (no.expression.value === "use client") return true;
  }
  return false;
}

/** Nome do hook chamado em `node.callee`, ou `null`. Cobre `React.useState`. */
export function nomeDoHookChamado(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property?.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
}

const MENSAGEM =
  '[#583] `{{hook}}` é hook de cliente e este módulo não declara `"use client"`. A diretiva é do MÓDULO: sem ela o arquivo só funciona enquanto todos os importadores forem client, e o primeiro Server Component que importar estoura em runtime com o erro apontando para cá. Acrescente `"use client";` na primeira linha.';

/** @type {import("eslint").Rule.RuleModule} */
export const useClientObrigatorio = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Exige a diretiva "use client" em módulos que usam hooks de cliente do React.',
    },
    schema: [],
    messages: { faltaUseClient: MENSAGEM },
  },
  create(context) {
    let declarado = false;
    return {
      Program(node) {
        declarado = temDiretivaUseClient(node);
      },
      CallExpression(node) {
        if (declarado) return;
        const hook = nomeDoHookChamado(node.callee);
        if (!hook || !HOOKS_DE_CLIENTE.has(hook)) return;
        context.report({ node, messageId: "faltaUseClient", data: { hook } });
      },
    };
  },
};

export const pluginRSC = {
  meta: { name: "rsc", version: "1.0.0" },
  rules: { "use-client-obrigatorio": useClientObrigatorio },
};

/**
 * Escopo do guard: todo o código de aplicação. A varredura da #583 mediu os
 * 555 módulos de `src/**` (fora `.test`/`.stories`) e achou 2 — os dois em
 * `src/components/ui/`. `src/components/app/`, `src/hooks/` e `src/lib/` já
 * estavam limpos, então não há motivo para escopo estreito.
 */
export const ESCOPO_RSC = ["src/**/*.{ts,tsx}"];

/**
 * Teste e story ficam de fora: rodam sempre em cliente (jsdom / Storybook), e
 * lá a diretiva não muda nada — é a mesma fronteira usada pela regra do DS.
 */
export const FORA_DO_ESCOPO_RSC = [
  "**/*.test.{ts,tsx}",
  "**/*.stories.{ts,tsx}",
];
