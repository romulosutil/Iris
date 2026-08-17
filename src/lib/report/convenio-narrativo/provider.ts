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
  ...d.evolucaoPorDominio.map((e) => e.dominio),
  ...d.objetivosProximoPeriodo,
];

/**
 * Contagens estruturadas do dossiê que legitimamente podem aparecer como
 * números numa narrativa: presença, total de sessões/evidências e a
 * contagem de evidências por domínio (as mesmas tally que o stub emite).
 * Propositalmente NÃO inclui datas, anos, ou qualquer outro dígito da
 * serialização bruta do dossiê — um "12" vindo de "2026-12-05" não pode
 * validar uma alegação de "12 sessões".
 */
function contagensPermitidas(dossie: PayloadConvenioBruto): Set<string> {
  const porDominio = new Map<string, number>();
  for (const e of dossie.evidencias) {
    porDominio.set(e.metaOuDominio, (porDominio.get(e.metaOuDominio) ?? 0) + 1);
  }
  return new Set(
    [
      dossie.presenca.sessoesRealizadas,
      dossie.presenca.faltasJustificadas,
      dossie.presenca.faltasNaoJustificadas,
      dossie.evidencias.length,
      dossie.sessoes.length,
      ...porDominio.values(),
    ].map(String),
  );
}

/**
 * LIMITAÇÃO RESIDUAL: este guard é um backstop de token numérico — ele NÃO
 * captura números por extenso ("oito sessões") nem decimais partidos em
 * dois tokens. Isto é aceitável só porque, no fluxo real, o prompt do
 * ClaudeProvider já instrui "números só do dossiê"; este guard endurece a
 * costura para quando o provider real for ligado (ainda não está — o
 * skeleton do ClaudeProvider lança erro), não é a única linha de defesa.
 */
export function validarDraftContraDossie(
  draft: ConvenioNarrativoDraft,
  dossie: PayloadConvenioBruto,
): { ok: true } | { ok: false; numeroOrfao: string } {
  const permitidos = contagensPermitidas(dossie);
  for (const campo of CAMPOS_LIVRES(draft)) {
    const campoSemDatas = campo
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
      .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, "");
    for (const num of campoSemDatas.match(/\d+/g) ?? []) {
      if (!permitidos.has(num)) return { ok: false, numeroOrfao: num };
    }
  }
  return { ok: true };
}

export function resolveConvenioNarrativoProvider(clinic: {
  isDemo: boolean;
}): ConvenioNarrativoProvider {
  if (clinic.isDemo) return new StubConvenioNarrativoProvider();
  if (
    process.env.CONVENIO_REPORT_LLM_ENABLED === "true" &&
    process.env.ANTHROPIC_API_KEY
  ) {
    return new ClaudeConvenioNarrativoProvider();
  }
  return new StubConvenioNarrativoProvider();
}
