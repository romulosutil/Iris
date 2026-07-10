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
    ],
  },
  ...next,
  ...storybook.configs["flat/recommended"],
  prettier,
];

export default config;
