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
];

export default config;
