import next from "eslint-config-next";
import prettier from "eslint-config-prettier";
import storybook from "eslint-plugin-storybook";

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "storybook-static/**",
      "src/db/migrations/**",
      // Worktrees de agente são CÓPIAS do repo (com node_modules e bundles
      // minificados dentro). Sem isto o lint varre o projeto inteiro de novo,
      // uma vez por worktree, e devolve centenas de erros em código gerado que
      // ninguém escreveu — ruído que esconde erro real.
      ".claude/**",
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
];

export default config;
