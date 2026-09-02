import next from "eslint-config-next";
import prettier from "eslint-config-prettier";
import storybook from "eslint-plugin-storybook";

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
];

export default config;
