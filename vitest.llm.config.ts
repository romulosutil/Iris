import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Config ISOLADA para a suíte que chama o Gemini de verdade (#395; decisão
// de custo do Rômulo, 18/08/26 — ver cabeçalho de casos-clinicos.llm.test.ts).
// Análoga a vitest.integration.config.ts (memória
// `vitest-int-test-coleta-zero`: `*.int.test.ts` fica fora de `pnpm test` e só
// roda com --config próprio) — aqui o padrão de exclusão é `*.llm.test.ts`,
// nunca incluído no `pnpm test` padrão (ver exclude em vitest.config.ts) nem
// no `pnpm test:rls` (include de vitest.integration.config.ts não casa este
// sufixo). Só roda via `pnpm test:llm`, disparado manualmente — CUSTO REAL de
// API e tempo de parede real por chamada.
//
// Carrega .env e .env.local manualmente (vitest não lê nenhum dos dois
// sozinho) — mesmo motivo do vitest.integration.config.ts: sem isto,
// GOOGLE_API_KEY não chega a process.env e a suíte falha achando que a
// chave está ausente. GOOGLE_API_KEY (#395) vive em .env.local.
//
// Precedência: ambiente da INVOCAÇÃO (shell) sempre vence sobre os
// arquivos (mesma regra do vitest.integration.config.ts); entre os dois
// arquivos, .env.local vence .env quando as duas definem a mesma chave —
// convenção do Next.js. Por isso o merge acontece num mapa em memória
// ANTES de tocar process.env, na ordem .env → .env.local (a leitura mais
// recente sobrescreve), e só então aplicamos ao process.env respeitando o
// que já veio do shell.
const SHELL_KEYS = new Set(Object.keys(process.env));
const valoresDeArquivo = new Map<string, string>();

function lerEnvFile(nomeArquivo: string): void {
  const envPath = path.resolve(import.meta.dirname, nomeArquivo);
  try {
    const env = readFileSync(envPath, "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      const key = m?.[1];
      if (!key) continue;
      const value = m?.[2] ?? "";
      if (value === "") continue; // vazio == ausente, mesma regra do config de integração
      valoresDeArquivo.set(key, value); // arquivo lido depois vence (.env.local > .env)
    }
  } catch (err) {
    console.warn(
      `[llm] não consegui ler ${envPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
lerEnvFile(".env");
lerEnvFile(".env.local");
for (const [key, value] of valoresDeArquivo) {
  if (!SHELL_KEYS.has(key)) process.env[key] = value;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // MESMO alias de vitest.config.ts, e pelo MESMO motivo (#126): Next
      // resolve `server-only` para `empty.js` no bundle de servidor (condição
      // "react-server"); vitest não aplica essa condição, então sem o alias
      // todo módulo com `import "server-only"` lança ao ser importado.
      //
      // Faltar aqui não era teórico: o smoke da #510 NUNCA coletou. O run
      // `34066802330` (06/09/2026, o primeiro com `GOOGLE_API_KEY` no repo)
      // morreu em 525 ms com `Tests: no tests` e "This module cannot be
      // imported from a Client Component module" apontando para
      // `server-only/index.js:1:7` — a cadeia `provider.ts` → `llm-provider.ts`
      // atravessa um módulo com essa diretiva. Enquanto o segredo esteve
      // ausente, o smoke morria ANTES deste ponto e o defeito ficou coberto
      // por outro defeito (#524).
      "server-only": path.resolve(
        import.meta.dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.llm.test.ts"],
    globalSetup: ["./src/lib/extraction/llm-suite-global-setup.ts"],
    // Chamada de LLM real não é instantânea — timeout generoso por teste.
    testTimeout: 60000,
    hookTimeout: 30000,
    fileParallelism: false, // não martelar a API em paralelo por engano
  },
});
