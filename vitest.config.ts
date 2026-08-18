import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Next resolve isto pra `empty.js` no bundle de servidor (condição
      // "react-server"); vitest não aplica essa condição, então sem o alias
      // todo módulo com "import server-only" lança ao ser importado num
      // teste unitário, mesmo sendo puro (#126).
      "server-only": path.resolve(
        import.meta.dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          // `db/tests/**/*.test.ts` (sem `.int.`) são guards ESTÁTICOS: leem
          // arquivo, não banco. Rodam no `pnpm test` de propósito — se só
          // rodassem no `test:rls`, dependeriam do ambiente que eles protegem.
          include: [
            "src/**/*.test.{ts,tsx}",
            "scripts/**/*.test.mjs",
            "db/tests/**/*.test.ts",
          ],
          exclude: [
            "**/node_modules/**",
            "**/*.int.test.ts",
            // #395 — chama o Gemini de verdade (custo real + tempo real de
            // parede). Isolada em vitest.llm.config.ts / `pnpm test:llm`,
            // nunca no `pnpm test` padrão nem em CI, mesmo padrão de
            // `**/*.int.test.ts` acima.
            "**/*.llm.test.ts",
            "**/*a11y*.test.{ts,tsx}",
            "**/a11y.test.{ts,tsx}",
          ],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: "a11y",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*a11y*.test.{ts,tsx}", "src/**/a11y.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "**/*.int.test.ts"],
          testTimeout: 20000,
          hookTimeout: 20000,
          // Evita contenção de CPU entre varreduras pesadas do axe (#332):
          // executa a suíte de a11y em série mantendo a suíte unitária rápida
          // em paralelo completo.
          fileParallelism: false,
          css: false,
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(import.meta.dirname, ".storybook"),
          }),
        ],
        test: {
          name:
            "storybook:" +
            path.join(import.meta.dirname, ".storybook").replace(/\\/g, "/"),
          environment: "jsdom",
          globals: true,
          setupFiles: ["./.storybook/vitest.setup.ts"],
          testTimeout: 20000,
          hookTimeout: 20000,
          css: false,
        },
      },
    ],
  },
});
