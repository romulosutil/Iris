/**
 * globalSetup de `pnpm test:llm` (#395).
 *
 * Roda ANTES de qualquer teste do arquivo `*.llm.test.ts`. Segue o mesmo
 * princípio do gate de `pnpm test:rls` (db/tests/global-setup.ts, #132):
 * FALHAR ALTO quando falta o que a suíte precisa, nunca pular em silêncio e
 * sair verde. Esta suíte custa dinheiro e tempo de parede a cada chamada —
 * "verde" sem ter chamado a Anthropic de verdade seria pior que vermelho.
 *
 * Diferente de `test:rls`, não existe flag de ALLOW_SKIP aqui: esta suíte
 * NUNCA roda em CI nem em `pnpm test` (ver include em vitest.llm.config.ts,
 * exclude em vitest.config.ts) — é sempre invocação manual e consciente
 * (`pnpm test:llm`), então não há "esquecer de setar a flag" a proteger.
 *
 * Checa GOOGLE_API_KEY: mesma chave que produção usa (D57 — Gemini é o
 * único provedor de extração desde 25/08/26). A suíte chama `createGeminiInvoker`
 * (gemini-invoker.ts) com o modelo default mais barato, não o de produção —
 * ver o cabeçalho de `casos-clinicos.llm.test.ts` para o tradeoff.
 */
export default function setup(): void {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error(
      [
        "[llm] GOOGLE_API_KEY ausente — a suíte pnpm test:llm chama o",
        "Gemini de verdade e precisa da chave real (não a chave de outro",
        "provedor, não um placeholder). Configure GOOGLE_API_KEY no",
        ".env.local (nunca versionado) e rode de novo.",
        "",
        "Esta suíte é cara (chamadas reais) e lenta (latência de LLM) de",
        "propósito — por isso não faz parte de `pnpm test` nem de CI. Ver",
        "docs/agente/casos-de-teste-tcc.md e",
        "docs/agente/casos-de-teste-terapia-convencional.md para o que ela",
        "cobre.",
      ].join("\n"),
    );
  }
}
