import {
  META_SEM_MODELO,
  type ExtractionContext,
  type ExtractionProvider,
  type ExtractionResult,
} from "./provider";

// Produção sem agente real ainda (Fase 3). Registra uma linha marcando que a
// extração ficou pendente de reprocessamento — mesmo estado do caminho de falha
// dos wireframes. NENHUM LLM é chamado (guardrail #6).
export class NullProvider implements ExtractionProvider {
  readonly modelo = null;

  async extrair(ctx: ExtractionContext): Promise<ExtractionResult> {
    return {
      drafts: [
        {
          subtipo: "pendente",
          trechoFonte: "",
          confianca: "baixa",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          payload: { motivo: "extracao_pendente_fase3" },
          estado: "pendente_reprocessamento",
        },
      ],
      // Sem LLM não há detecção de risco. `null` é honesto: significa "não
      // avaliado", e a nota fica `pendente_reprocessamento` — ou seja, o texto
      // volta para a fila. Não é um "nenhum risco encontrado".
      alertaRisco: null,
      // DA-02: nenhum modelo chamado → tudo `null` (não medido), inclusive
      // latência: 0 ms seria uma "chamada instantânea" que não aconteceu.
      meta: META_SEM_MODELO,
    };
  }
}
