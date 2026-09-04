import { logarAvisoSemPII } from "@/lib/observabilidade/logar-erro";

/**
 * WebMCP TypeScript Definitions & Helpers
 * Exposes site tools to AI agents via browser navigator.modelContext
 */

interface WebMCPToolInputSchema {
  type: string;
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: WebMCPToolInputSchema;
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface ModelContext {
  provideContext: (options: { tools: WebMCPTool[] }) => void;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

/**
 * Sem `console.log` de produção (S-08, #530): a lista de tools ia para o
 * console de todo visitante. Falha de registro continua sendo registrada, em
 * nível `warn`, porque é diagnóstico e não telemetria.
 *
 * Este módulo roda no BROWSER, e `logarAvisoSemPII` foi feito para isso: não
 * depende de nada de Node (#546). O `err` inteiro ia para o console antes —
 * `message` e `stack` de uma extensão de terceiro no console do visitante.
 * Agora sai a classe do erro, e só.
 */
export function registerWebMCPTools(tools: WebMCPTool[]) {
  if (typeof window === "undefined") return;

  if ("navigator" in window && window.navigator.modelContext) {
    try {
      window.navigator.modelContext.provideContext({ tools });
    } catch (err) {
      logarAvisoSemPII("webmcp.registro-de-tools-falhou", err, {
        quantidadeTools: tools.length,
      });
    }
  } else {
    // Polyfill / fallback event broadcast for browser extensions supporting WebMCP
    window.dispatchEvent(
      new CustomEvent("webmcp:register", {
        detail: { tools },
      }),
    );
  }
}

/**
 * Zera o contexto: `provideContext({ tools: [] })` (ou o evento equivalente).
 * Chamado no unmount do provider ao sair do grupo público — a navegação do
 * Next é client-side, e um registro feito na landing sobreviveria até o
 * prontuário.
 */
export function limparWebMCPTools() {
  registerWebMCPTools([]);
}
