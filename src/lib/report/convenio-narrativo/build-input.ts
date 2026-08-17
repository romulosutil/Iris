// Builder do input do relatório narrativo de convênio (Fase 5 · Fatia 5,
// Task 5). Reusa integralmente o dossiê factual já produzido por
// `buildConvenioBrutoPayload` (Fatia 3) — nenhum número é recalculado aqui;
// este módulo só agrupa o dossiê com o cabeçalho/período que o coordenador
// informou para a curadoria narrativa (ver docs/agente/agente-2-relatorio-familia.md).
import "server-only";
import type { Tx } from "../../../db/rls";
import { buildConvenioBrutoPayload } from "../convenio-bruto/build-payload";
import type { CabecalhoConvenio, ConvenioNarrativoInput } from "./types";

type Args = {
  patientId: string;
  nomePaciente: string;
  periodoInicio: string;
  periodoFim: string;
  cabecalho: CabecalhoConvenio;
};

export async function buildConvenioNarrativoInput(
  tx: Tx,
  args: Args,
): Promise<ConvenioNarrativoInput> {
  const { patientId, nomePaciente, periodoInicio, periodoFim, cabecalho } =
    args;

  const dossie = await buildConvenioBrutoPayload(tx, {
    patientId,
    nomePaciente,
    periodoInicio,
    periodoFim,
  });

  return {
    paciente: { nome: nomePaciente },
    periodo: { inicio: periodoInicio, fim: periodoFim },
    cabecalho,
    dossie,
  };
}
