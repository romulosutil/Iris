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
          exclude: ["**/node_modules/**", "**/*.int.test.ts"],
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
          css: false,
        },
      },
    ],
  },
});
