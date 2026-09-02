import {
  META_SEM_MODELO,
  type ExtractionContext,
  type ExtractionDraft,
  type ExtractionProvider,
  type ExtractionResult,
} from "./provider";

// Gera extrações fake plausíveis para clínicas de demonstração, de forma
// DETERMINÍSTICA (sem Math.random) — pega frases reais da nota consolidada como
// trecho_fonte e alterna confiança/subtipo. NÃO chama LLM (guardrail #6).
export class DemoStubProvider implements ExtractionProvider {
  readonly modelo = "stub";

  async extrair(ctx: ExtractionContext): Promise<ExtractionResult> {
    const inicio = Date.now();
    const frases = ctx.notaConsolidada
      .split(/(?<=[.!?])\s+/)
      .map((f) => f.trim())
      .filter((f) => f.length >= 8);
    const confs: ExtractionDraft["confianca"][] = ["alta", "media", "baixa"];
    const meta = ctx.metasAtivas[0]?.id ?? null;
    return {
      drafts: frases.slice(0, 6).map((frase, i) => ({
        subtipo: "evidencia",
        trechoFonte: frase,
        confianca: confs[i % 3]!,
        justificativaConfianca: "Sugestão de demonstração (dados fictícios).",
        inconsistenteComHistorico: false,
        parContrasteId: null,
        payload: {
          alvos: meta ? [{ goal_id: meta }] : [],
          polaridade: i % 2 === 0 ? "positiva" : "negativa",
        },
        estado: "sugerida",
      })),
      // O stub de demonstração NUNCA fabrica alerta de risco. Um alerta de risco
      // sintético numa clínica de demo treinaria a equipe a ignorá-lo — que é
      // exatamente a fadiga de alarme que a §2 da spec combate.
      alertaRisco: null,
      // DA-02: 'stub' identifica dado de demonstração nas métricas — nunca
      // se mistura com um modelo real. Tokens `null`: não houve chamada.
      meta: {
        ...META_SEM_MODELO,
        modelo: this.modelo,
        latenciaMs: Date.now() - inicio,
      },
    };
  }
}
