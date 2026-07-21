import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
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
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "**/*.int.test.ts"],
          css: false,
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") }),
        ],
        test: {
          name: "storybook:" + path.join(import.meta.dirname, ".storybook").replace(/\\/g, "/"),
          environment: "jsdom",
          globals: true,
          setupFiles: ["./.storybook/vitest.setup.ts"],
          css: false,
        },
      },
    ],
  },
});
