// Provider stub (demo / fallback) do Agente-3 — determinístico, deriva tudo
// do dossiê factual (PayloadConvenioBruto). Nunca inventa número: satisfaz
// C2 por construção (só emite contagens já presentes no dossiê).
import type { ConvenioNarrativoProvider } from "./provider";
import type { ConvenioNarrativoDraft, ConvenioNarrativoInput } from "./types";

// Valores reais de `classificacao` (evidence.classificacao_original ->
// `taxonomia_ajuda`, docs/agente/system-instructions.md R-taxonomia):
// independente, dica_verbal, dica_ecoica, dica_gestual, dica_entonacao,
// modelacao, dica_fisica. Só "independente" indica desempenho sem suporte —
// tratado aqui como sinal de avanço para fins do platô C4.
const POSITIVA = new Set(["independente"]);

export class StubConvenioNarrativoProvider implements ConvenioNarrativoProvider {
  async gerar(input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft> {
    const { dossie } = input;

    const porDominio = new Map<string, number>();
    for (const e of dossie.evidencias) {
      porDominio.set(
        e.metaOuDominio,
        (porDominio.get(e.metaOuDominio) ?? 0) + 1,
      );
    }
    const evolucaoPorDominio = [...porDominio.entries()].map(
      ([dominio, n]) => ({
        dominio,
        narrativa: `No período, foram registradas ${n} evidência(s) clínica(s) aprovada(s) no domínio ${dominio}, extraídas do prontuário.`,
      }),
    );

    const temAvanco = dossie.evidencias.some((e) =>
      POSITIVA.has(e.classificacao.toLowerCase()),
    );
    const periodoSemAvancoVisivel =
      evolucaoPorDominio.length === 0 || !temAvanco;

    const p = dossie.presenca;
    const resumoClinico = `Paciente em acompanhamento terapêutico no período de ${input.periodo.inicio} a ${input.periodo.fim}. Foram realizadas ${p.sessoesRealizadas} sessão(ões), com ${p.faltasJustificadas} falta(s) justificada(s) e ${p.faltasNaoJustificadas} não justificada(s). Os dados quantitativos constam do dossiê factual anexo.`;

    const justificativaContinuidade = periodoSemAvancoVisivel
      ? `A ausência de avanço mensurável no período justifica a manutenção do acompanhamento com revisão de conduta, conforme dados do dossiê.`
      : `A evolução registrada no dossiê fundamenta a continuidade do acompanhamento para consolidação dos ganhos.`;

    return {
      resumoClinico,
      evolucaoPorDominio,
      justificativaContinuidade,
      objetivosProximoPeriodo: dossie.evidencias.length
        ? [
            "Consolidar os ganhos registrados no período.",
            "Reavaliar metas ativas na próxima janela.",
          ]
        : ["Reavaliar plano terapêutico e conduta na próxima janela."],
      periodoSemAvancoVisivel,
      notaHonestidade: periodoSemAvancoVisivel
        ? "Não houve avanço clinicamente mensurável no período; o acompanhamento é mantido para revisão de conduta."
        : null,
      status: "rascunho_para_revisao",
    };
  }
}
