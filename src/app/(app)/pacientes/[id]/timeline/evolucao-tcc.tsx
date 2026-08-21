import { GraficoEscoreInstrumento } from "./grafico-escore-instrumento";
import { GraficoEvolucaoCrencas } from "../tcc/grafico-evolucao-crencas";
import type { InstrumentoAplicacaoLinha } from "../tcc/instrumento-lista";
import type { RpdGraficoEntry } from "../tcc/grafico-evolucao-crencas";

/**
 * Aba Evolução de um paciente `cognitive_behavioral`.
 *
 * A regra que este arquivo materializa: **a aba da modalidade é onde se
 * ESCREVE, a aba Evolução é onde se LÊ.** O gráfico de crenças estava dentro
 * de `../tcc/page.tsx`, junto do formulário de RPD — leitura misturada com
 * registro, e ao lado de uma aba "Evolução" que mostrava eixos VB-MAPP para
 * um paciente que não tem nenhum marco ABA.
 *
 * As três leituras ficam separadas de propósito, uma escala por painel: PHQ-9
 * (0-27), GAD-7 (0-21) e intensidade emocional do RPD (0-100%) não são
 * comparáveis entre si, e sobrepô-las num eixo comum inventaria uma relação
 * que nenhum dos três instrumentos mede.
 */
export function EvolucaoTcc({
  aplicacoes,
  entriesRpd,
}: {
  aplicacoes: InstrumentoAplicacaoLinha[];
  entriesRpd: RpdGraficoEntry[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <GraficoEscoreInstrumento
        tipoInstrumento="phq9"
        aplicacoes={aplicacoes}
      />
      <GraficoEscoreInstrumento
        tipoInstrumento="gad7"
        aplicacoes={aplicacoes}
      />
      <GraficoEvolucaoCrencas entries={entriesRpd} />
    </div>
  );
}
