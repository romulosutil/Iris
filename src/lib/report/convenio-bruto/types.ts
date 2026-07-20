export type PayloadConvenioBruto = {
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  geradoEm: string;
  sessoes: Array<{
    numeroSequencial: number | null;
    data: string;
    disciplina: string;
    modalidade: string;
    estado: string;
    justificada: boolean | null;
    terapeuta: string;
  }>;
  evidencias: Array<{
    data: string;
    metaOuDominio: string;
    classificacao: string;
    autor: string;
  }>;
  presenca: {
    sessoesRealizadas: number;
    faltasJustificadas: number;
    faltasNaoJustificadas: number;
  };
};
