/**
 * WebMCP TypeScript Definitions & Helpers
 * Exposes site tools to AI agents via browser navigator.modelContext
 */

export interface WebMCPToolInputSchema {
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

export interface ModelContext {
  provideContext: (options: { tools: WebMCPTool[] }) => void;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

export function registerWebMCPTools(tools: WebMCPTool[]) {
  if (typeof window === "undefined") return;

  if ("navigator" in window && window.navigator.modelContext) {
    try {
      window.navigator.modelContext.provideContext({ tools });
      console.log("[WebMCP] Registered tools with navigator.modelContext:", tools.map((t) => t.name));
    } catch (err) {
      console.warn("[WebMCP] Failed to register tools with navigator.modelContext:", err);
    }
  } else {
    // Polyfill / fallback event broadcast for browser extensions supporting WebMCP
    window.dispatchEvent(
      new CustomEvent("webmcp:register", {
        detail: { tools },
      })
    );
  }
}
