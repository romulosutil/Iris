import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Carrega .env manualmente (vitest não lê .env sozinho).
try {
  const env = readFileSync(path.resolve(import.meta.dirname, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    const key = m?.[1];
    if (key && !process.env[key]) process.env[key] = m?.[2] ?? "";
  }
} catch {
  // sem .env → os testes de integração se auto-skipam (ver skipIf).
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.int.test.ts", "db/tests/**/*.int.test.ts"],
    testTimeout: 20000,
    fileParallelism: false, // uma conexão/DB por vez
  },
});
