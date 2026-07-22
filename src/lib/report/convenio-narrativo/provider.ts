// Camada de provider do Agente-3 (relatório narrativo de convênio).
// Regra C2 (docs/agente/agente-2-relatorio-familia.md): IA nunca gera número —
// todo número no draft precisa vir do dossiê factual (PayloadConvenioBruto).
// `validarDraftContraDossie` é o numeric-guard que garante isso em runtime
// para o provider real; o stub garante por construção (nunca inventa número).
import type { PayloadConvenioBruto } from "../convenio-bruto/types";
import { ClaudeConvenioNarrativoProvider } from "./claude-provider";
import { StubConvenioNarrativoProvider } from "./stub-provider";
import type { ConvenioNarrativoDraft, ConvenioNarrativoInput } from "./types";

export interface ConvenioNarrativoProvider {
  gerar(input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft>;
}

const CAMPOS_LIVRES = (d: ConvenioNarrativoDraft): string[] => [
  d.resumoClinico,
  d.justificativaContinuidade,
  d.notaHonestidade ?? "",
  ...d.evolucaoPorDominio.map((e) => e.narrativa),
  ...d.objetivosProximoPeriodo,
];

export function validarDraftContraDossie(
  draft: ConvenioNarrativoDraft,
  dossie: PayloadConvenioBruto,
): { ok: true } | { ok: false; numeroOrfao: string } {
  const permitidos = new Set(JSON.stringify(dossie).match(/\d+/g) ?? []);
  for (const campo of CAMPOS_LIVRES(draft)) {
    for (const num of campo.match(/\d+/g) ?? []) {
      if (!permitidos.has(num)) return { ok: false, numeroOrfao: num };
    }
  }
  return { ok: true };
}

export function resolveConvenioNarrativoProvider(clinic: { isDemo: boolean }): ConvenioNarrativoProvider {
  if (clinic.isDemo) return new StubConvenioNarrativoProvider();
  if (process.env.CONVENIO_REPORT_LLM_ENABLED === "true" && process.env.ANTHROPIC_API_KEY) {
    return new ClaudeConvenioNarrativoProvider();
  }
  return new StubConvenioNarrativoProvider();
}
