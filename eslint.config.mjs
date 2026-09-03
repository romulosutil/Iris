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

// A-02 (#559, F1): imports de `@/app/**` que ainda existem em `src/lib` e
// `src/components/ui`, com a contagem atual por arquivo. Só pode CAIR — as
// fatias F2–F5 da issue zeram cada entrada movendo o módulo. Ver o bloco da
// regra no fim deste arquivo e `scripts/lint/fronteira-lib-app.test.ts`.
const baselineFronteira = JSON.parse(
  readFileSync(
    new URL("./scripts/lint/fronteira-lib-app.baseline.json", import.meta.url),
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
    // A-02 (#559, fatia F1): fronteira `lib` ↛ `app`. `src/lib` e
    // `src/components/ui` são os bounded contexts e o design system — eles não
    // podem importar de `src/app`, que é a camada de rota. A inversão já
    // existe (`lib/billing/rotulos-*` importa `@/app/(app)/assinatura/queries`)
    // e é o que a auditoria 360 chamou de "lib dependendo de app".
    //
    // Esta regra é o degrau barato: PARA A SANGRIA antes do refactor grande
    // (fatias F2–F5 movem o passivo). O baseline abaixo congela o que já
    // existe; `scripts/lint/fronteira-lib-app.test.ts` (roda no `pnpm test`)
    // reativa a regra sobre esses arquivos e falha se a contagem SUBIR — e
    // pede para abaixar o baseline quando ela cai.
    //
    // Import de TIPO conta: `import type { X } from "@/app/..."` amarra o
    // módulo de lib ao arquivo de rota em tempo de compilação e é exatamente
    // o que impede mover o módulo depois.
    files: ["src/lib/**/*.{ts,tsx}", "src/components/ui/**/*.{ts,tsx}"],
    // `(app)` e `[id]` dos caminhos de rota precisam de escape num glob.
    ignores: Object.keys(baselineFronteira).map(comoGlobLiteral),
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*", "@/app/**"],
              message:
                "Fronteira lib ↛ app (A-02, #559): src/lib e src/components/ui não podem importar de src/app — é o domínio dependendo da rota. Mova o que for compartilhado (tipo, query ou regra) para src/lib e importe de lá; a rota importa de lib, nunca o contrário.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
