import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Carrega .env manualmente (vitest não lê .env sozinho).
// NÃO engolir a falha (#132): antes daqui um `catch {}` vazio escondia ".env
// não existe", e o único efeito visível era a suíte inteira se auto-skipar
// saindo VERDE. Agora a falha de leitura é ruído explícito no stderr; quem
// decide se é fatal é db/tests/global-setup.ts.
//
// Precedência: o que veio do AMBIENTE DA INVOCAÇÃO vence SEMPRE, inclusive
// quando veio VAZIO (`DATABASE_URL= pnpm test:rls`). A condição antiga
// (`!process.env[key]`) tratava string vazia como ausente e deixava o `.env`
// sobrescrever — ou seja, era impossível VERIFICAR o hard-fail do gate a partir
// do shell, e um `ALLOW_SKIP_INTEGRATION=1` esquecido no `.env` (gitignored,
// invisível no review) viraria um opt-in permanente. Exatamente a classe de
// falha silenciosa que a #132 existe para matar.
const envPath = path.resolve(import.meta.dirname, ".env");

// Chaves presentes no ambiente ANTES de aplicar o .env. É esta lista — e não
// process.env depois — que decide o que é "flag de invocação".
const SHELL_KEYS = new Set(Object.keys(process.env));

// ALLOW_SKIP_INTEGRATION é flag de INVOCAÇÃO, não entrada de .env: só vale
// quando veio do ambiente real e com valor não-vazio.
const shellAllowSkip =
  SHELL_KEYS.has("ALLOW_SKIP_INTEGRATION") &&
  (process.env.ALLOW_SKIP_INTEGRATION ?? "").trim() !== "";
// Canal explícito lido por db/tests/integration-env.ts (herdado pelos workers).
process.env.__INT_ALLOW_SKIP_FROM_SHELL = shellAllowSkip ? "1" : "0";

try {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    const key = m?.[1];
    if (!key) continue;
    const value = m?.[2] ?? "";

    if (key === "ALLOW_SKIP_INTEGRATION") {
      if (value.trim() !== "") {
        console.warn(
          "[int] ALLOW_SKIP_INTEGRATION está definido no .env e foi IGNORADO.",
        );
        console.warn(
          "[int] É flag de INVOCAÇÃO consciente, não configuração persistente:",
        );
        console.warn("[int]   ALLOW_SKIP_INTEGRATION=1 pnpm test:rls");
        console.warn(
          "[int] No .env (gitignored) ela viraria um opt-in permanente e invisível — #132.",
        );
      }
      continue; // nunca chega em process.env a partir do .env
    }

    // Valor vazio no .env == ausente (coerente com missingDbEnv, que exige
    // não-vazio). Não criamos var vazia só para o gate ter que desfazer.
    if (value === "") continue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch (err) {
  console.warn(
    `[int] não consegui ler ${envPath}: ${err instanceof Error ? err.message : String(err)}`,
  );
  console.warn(
    "[int] as env de banco terão que vir do ambiente — ver o diagnóstico do globalSetup abaixo.",
  );
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@tests": path.resolve(import.meta.dirname, "db/tests"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.int.test.ts", "db/tests/**/*.int.test.ts"],
    // Gate único + checagem de identidade de role ANTES de qualquer teste.
    globalSetup: ["./db/tests/global-setup.ts"],
    testTimeout: 20000,
    fileParallelism: false, // uma conexão/DB por vez
  },
});
