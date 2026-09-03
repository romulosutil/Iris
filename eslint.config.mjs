import { readFileSync } from "node:fs";
import next from "eslint-config-next";
import prettier from "eslint-config-prettier";
import storybook from "eslint-plugin-storybook";
import {
  ESCOPO_DS,
  FORA_DO_ESCOPO_DS,
  comoGlobLiteral,
  pluginDS,
} from "./scripts/lint/regra-ds-paleta-crua.mjs";
import {
  ESCOPO_RSC,
  FORA_DO_ESCOPO_RSC,
  pluginRSC,
} from "./scripts/lint/regra-use-client-obrigatorio.mjs";

// DS-05 (#538): arquivos que ainda carregam paleta crua, com a contagem
// atual. A regra fica desligada neles aqui; `scripts/lint/ds-paleta-crua.test.ts`
// (roda no `pnpm test`) reativa a regra sobre eles e falha se a contagem
// subir — e pede para abaixar o baseline quando ela cai. Regenerar com
// `node scripts/lint/gerar-baseline-ds.mjs` só quando a contagem CAI.
const baselineDS = JSON.parse(
  readFileSync(
    new URL("./scripts/lint/ds-paleta-crua.baseline.json", import.meta.url),
    "utf8",
  ),
);

const config = [
  {
    ignores: [
      "node_modules/**",
      // Ancorado na raiz, ".next/**" casa só o build da raiz. O `next build`
      // rodado dentro de um worktree deixa um .next aninhado que o lint varria
      // como código-fonte — 39 erros vindos de bundle minificado. O
      // .gitignore já usa "**/.next/" pelo mesmo motivo.
      "**/.next/**",
      "storybook-static/**",
      "src/db/migrations/**",
      // Worktrees de agente são CÓPIAS do repo (com node_modules e bundles
      // minificados dentro). Sem isto o lint varre o projeto inteiro de novo,
      // uma vez por worktree, e devolve centenas de erros em código gerado que
      // ninguém escreveu — ruído que esconde erro real.
      ".claude/**",
      ".worktrees/**",
      "test-results/**",
      "playwright-report/**",
      // Artefatos do design-sync: Storybook de referência e bundles já
      // minificados (mesmos caminhos que ele acrescenta ao .gitignore).
      ".design-sync/**",
      ".ds-sync/**",
      "ds-bundle/**",
    ],
  },
  ...next,
  ...storybook.configs["flat/recommended"],
  prettier,
  {
    // #531 (S-03): `console.error(rotulo, err)` imprime a `message` do
    // `DrizzleQueryError` — "Failed query: <sql>\nparams: <params>" — no
    // stdout do container, e no diário os params são a nota clínica. O
    // helper `logarErroSemPII` registra só nome + SQLSTATE + hash. Testes e
    // stories ficam fora: lá o "erro" é dublê.
    //
    // Limite da regra (sintática, não de fluxo de dados): ela casa o
    // IDENTIFICADOR do erro como argumento direto ou como propriedade de
    // objeto literal. `console.error(rotulo, err.message)`,
    // `console.error(String(err))`, um alias (`const falha = err`) ou o erro
    // dentro de template string passam. A revisão de PR cobre esse resto; a
    // regra existe para o padrão que estava em 85 lugares.
    //
    // Os seletores casam uma FORMA de AST, e um seletor que deixa de casar não
    // vira erro de config — vira silêncio verde. `scripts/lint/
    // console-erro-sem-pii.test.ts` (roda no `pnpm test`) mede este arquivo
    // pela API do ESLint e fica vermelho se a regra parar de acusar.
    files: ["src/app/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.stories.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='console'][callee.property.name='error'] > Identifier.arguments[name=/^(err|e|error|erro|dbErr|exception)$/]",
          message:
            "Não passe o erro ao console.error: a message do DrizzleQueryError carrega SQL + params (PHI). Use logarErroSemPII(rotulo, err, extra?) de @/lib/observabilidade/logar-erro.",
        },
        {
          selector:
            "CallExpression[callee.object.name='console'][callee.property.name='error'] ObjectExpression > Property[value.name=/^(err|e|error|erro|dbErr|exception)$/]",
          message:
            "Não embuta o erro num objeto do console.error: a message do DrizzleQueryError carrega SQL + params (PHI). Use logarErroSemPII(rotulo, err, extra?) de @/lib/observabilidade/logar-erro.",
        },
      ],
    },
  },
  {
    // Regra 0 do DS (AGENTS.md) com enforcement — DS-05 (#538): paleta crua
    // do Tailwind e fonte < 12px em literais de classe viram erro de lint em
    // src/app/(app) e src/components/{ui,app}. Plugin inline de propósito:
    // `no-restricted-syntax` já é usada em src/app/** por outro bloco e as
    // opções não se somam entre blocos.
    files: ESCOPO_DS,
    // `[id]` das rotas precisa de escape: num glob é classe de caracteres.
    ignores: [
      ...FORA_DO_ESCOPO_DS,
      ...Object.keys(baselineDS).map(comoGlobLiteral),
    ],
    plugins: { ds: pluginDS },
    rules: { "ds/sem-paleta-crua": "error" },
  },
  {
    // #583: módulo que usa hook de cliente do React precisa declarar
    // `"use client"`. A diretiva é do MÓDULO e propaga por importação, então a
    // ausência dela não quebra enquanto todos os importadores forem client —
    // blindagem acidental, que some no primeiro refactor para RSC. Piso é ZERO
    // (sem baseline): a varredura de `src/**` fechou em 2 achados, ambos
    // corrigidos na mesma PR — e um deles, `protocol-dashboard-charts.tsx`,
    // era falha viva renderizada por duas `page.tsx` `async`.
    //
    // `scripts/lint/use-client-obrigatorio.test.ts` (roda no `pnpm test`) mede
    // ESTE arquivo pela API do ESLint: se a regra sair do config ou parar de
    // acusar, o teste fica vermelho em vez de o lint ficar verde em silêncio.
    files: ESCOPO_RSC,
    ignores: FORA_DO_ESCOPO_RSC,
    plugins: { rsc: pluginRSC },
    rules: { "rsc/use-client-obrigatorio": "error" },
  },
];

export default config;
