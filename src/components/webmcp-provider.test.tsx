/**
 * S-08 (auditoria 360, #530) — o WebMCPProvider registrava em
 * `navigator.modelContext` uma tool `search_clinical_evidence` cujo `execute`
 * devolvia evidência clínica FABRICADA ("Indicadores comportamentais
 * compilados de acordo com os critérios clínicos") — em todas as páginas,
 * inclusive no prontuário. Contradiz "IA nunca decide, nada é maquiado como
 * fato". Agora: só `get_iris_overview` (descrição institucional), só na
 * landing, sem `console.log` de produção, e o contexto é limpo ao desmontar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WebMCPProvider } from "./webmcp-provider";

type Tool = { name: string; execute: (i: Record<string, unknown>) => unknown };

describe("<WebMCPProvider/>", () => {
  const provideContext = vi.fn();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    provideContext.mockClear();
    log.mockClear();
    Object.defineProperty(window.navigator, "modelContext", {
      value: { provideContext },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    delete (window.navigator as unknown as { modelContext?: unknown })
      .modelContext;
  });

  it("registra SÓ `get_iris_overview` — nenhuma tool de evidência clínica", () => {
    render(<WebMCPProvider />);
    expect(provideContext).toHaveBeenCalledTimes(1);
    const { tools } = provideContext.mock.calls[0][0] as { tools: Tool[] };
    expect(tools.map((t) => t.name)).toEqual(["get_iris_overview"]);
  });

  it("a tool restante devolve descrição institucional, sem campo que pareça evidência", async () => {
    render(<WebMCPProvider />);
    const { tools } = provideContext.mock.calls[0][0] as { tools: Tool[] };
    const saida = (await tools[0].execute({})) as Record<string, unknown>;
    expect(saida.name).toBe("Iris");
    // O formato da tool fabricada: `results[].id = "ev-001"` + `summary`.
    expect(JSON.stringify(saida)).not.toMatch(/"results"|"summary"|ev-\d+/);
  });

  it("não escreve `console.log` em produção ao registrar", () => {
    render(<WebMCPProvider />);
    expect(log).not.toHaveBeenCalled();
  });

  it("ao desmontar (sair da rota pública) limpa o contexto: tools = []", () => {
    const { unmount } = render(<WebMCPProvider />);
    unmount();
    const ultima = provideContext.mock.calls.at(-1)?.[0] as { tools: Tool[] };
    expect(ultima.tools).toEqual([]);
  });
});
