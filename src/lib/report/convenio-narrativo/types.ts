import type { PayloadConvenioBruto } from "../convenio-bruto/types";

export type CabecalhoConvenio = {
  operadora: string;
  cid: string | null; // conforme prescrição médica assistente (C5)
  finalidade: string;
};

export type ConvenioNarrativoInput = {
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  cabecalho: CabecalhoConvenio;
  dossie: PayloadConvenioBruto; // factual verbatim (C2)
};

export type ConvenioNarrativoDraft = {
  resumoClinico: string;
  evolucaoPorDominio: Array<{ dominio: string; narrativa: string }>;
  justificativaContinuidade: string;
  objetivosProximoPeriodo: string[]; // max 5
  periodoSemAvancoVisivel: boolean; // C4
  notaHonestidade: string | null; // C4, só quando true
  status: "rascunho_para_revisao"; // C7
};

export type PayloadConvenioNarrativo = {
  versao: 1;
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  cabecalho: CabecalhoConvenio;
  geradoEm: string; // ISO — data de extração do snapshot (D10)
  provider: "stub" | "gemini";
  dossie: PayloadConvenioBruto; // snapshot congelado (D10) — não re-buscado no export
  iaOriginal: ConvenioNarrativoDraft; // imutável (auditoria)
  curado: ConvenioNarrativoDraft | null; // null até curar
};
