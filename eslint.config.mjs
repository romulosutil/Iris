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
  ESCOPO_FRONTEIRA,
  pluginFronteira,
} from "./scripts/lint/regra-fronteira-lib-app.mjs";
import {
  ESCOPO_SEM_CONSOLE,
  ESCOPO_SEM_CONSOLE_JOBS,
  FORA_DO_ESCOPO_SEM_CONSOLE,
  pluginObservabilidade,
} from "./scripts/lint/regra-sem-console-em-lib.mjs";
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
    //
    // Regra própria (plugin inline, como `ds/` e `rsc/`) em vez de
    // `no-restricted-imports`: aquela regra só visita import/export ESTÁTICO e
    // casa a string do especificador, então `await import("@/app/...")`,
    // `require("@/app/...")` e o relativo `"../../app/..."` passavam livres —
    // medido. E fechar com `no-restricted-syntax` num bloco novo apagaria o
    // guard de PHI/PII do `console.error`, que já usa essa regra em
    // `src/lib/**` (flat config não soma opções da mesma regra entre blocos).
    files: ESCOPO_FRONTEIRA,
    // `(app)` e `[id]` dos caminhos de rota precisam de escape num glob.
    ignores: Object.keys(baselineFronteira).map(comoGlobLiteral),
    plugins: { fronteira: pluginFronteira },
    rules: { "fronteira/sem-import-de-app": "error" },
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
  {
    // DA-04 (#560, fatia F2): nenhum `console.*` cru em `src/lib/**`. A F1
    // entregou o logger estruturado (JSON, `requestId`, redaction por chave
    // dentro de `registrar()`); esta fatia migrou os 31 sítios de `lib/` e
    // esta regra é o que impede o 32º de nascer.
    //
    // O ponto que a regra guarda não é formatação: `redigirContexto` roda no
    // NÚCLEO do logger, não no transporte. Um objeto solto no `console` passa
    // ao lado dela — foi assim que `err: e.message` (SQL + params do
    // `DrizzleQueryError`, corpo do gateway) saiu em 4 dos sítios medidos.
    //
    // Regra própria em plugin inline (como `ds/`, `fronteira/` e `rsc/`), e
    // NÃO `no-restricted-syntax`: aquela regra já é usada pelo guard de PHI do
    // `console.error` (#531) num bloco cujo `files` cobre `src/app/**` E
    // `src/lib/**`, e em flat config as opções da MESMA regra não se somam
    // entre blocos — um bloco novo apagaria aquele guard nos arquivos de lib,
    // em silêncio, sem erro de config.
    //
    // Piso é ZERO, sem baseline: a varredura desta fatia fechou em zero.
    // `scripts/lint/sem-console-em-lib.test.ts` (roda no `pnpm test`) mede
    // ESTE arquivo pela API do ESLint e fica vermelho se a regra sair do
    // config ou parar de acusar.
    files: ESCOPO_SEM_CONSOLE,
    ignores: FORA_DO_ESCOPO_SEM_CONSOLE,
    plugins: { obs: pluginObservabilidade },
    rules: { "obs/sem-console-cru": "error" },
  },
  {
    // F3b (#560): os `.mjs` copiados para imagens de infra. Bloco separado do
    // de cima por causa dos `ignores`: a lista de fora daquele bloco fala de
    // `.test.{ts,tsx}` e do sink da app, que não descrevem esta população —
    // aqui o que fica de fora é `*.test.mjs`, e o "sink" escreve em
    // `process.stdout`, não no `console`, então não precisa de exceção.
    files: ESCOPO_SEM_CONSOLE_JOBS,
    ignores: ["**/*.test.mjs"],
    plugins: { obs: pluginObservabilidade },
    rules: { "obs/sem-console-cru": "error" },
  },
];

export default config;
