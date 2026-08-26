// Contratos de tipo do Relatório de Família (Fase 5 · Fatia 4).
// Spec: docs/superpowers/specs/2026-07-21-fase5-fatia4-relatorio-familia-design.md
// Módulo puro (fora de "use server"): consumido por provider, build-input,
// build-html e actions.

/** Entrada factual que o provider (Agente 2) recebe. Sem PII além do nome. */
export type FamilyReportInput = {
  crianca: { nome: string };
  periodo: { inicio: string; fim: string }; // ISO date (YYYY-MM-DD)
  evidenciasAprovadas: Array<{
    data: string; // aprovadoEm ISO
    metaOuDominio: string; // nome curto, SEM jargão de protocolo (F1)
    nivelAjuda: string | null; // p/ detectar salto de independência (F3)
    polaridade: "positiva" | "negativa" | null;
  }>;
  metasAtivas: string[]; // nomes curtos (F4)
  reforcadoresAtuais: string[]; // p/ derivar apoio em casa (F5)
  avaliacoesFormais: string[]; // MilestoneAssessment concluídas (hoje: [])
};

/** Saída do Agente 2 = schema F1–F9 de agente-2-relatorio-familia.md. */
export type FamilyReportDraft = {
  conquistaDestaque: string; // F3 — 1 conquista, linguagem leiga, rastreável
  trabalhandoAgora: string[]; // F4 — metas ativas simples (max 4)
  comoApoiarEmCasa: string[]; // F5 — sugestões específicas (max 3)
  periodoSemAvancoVisivel: boolean; // F6 — true aciona nota de honestidade
  notaHonestidade: string | null; // F6 — só quando periodoSemAvancoVisivel = true
  anexoDados: {
    // F8 — números separados do resumo humano
    evidenciasPorMeta: Array<{ meta: string; contagemPeriodo: number }>;
    avaliacoesFormaisPeriodo: string[];
  };
  status: "rascunho_para_revisao"; // F9 — sempre rascunho
};

/** Forma persistida em report.payload (jsonb). Sem DDL (D2/D3). */
export type PayloadFamilia = {
  versao: 1;
  crianca: { nome: string };
  periodo: { inicio: string; fim: string };
  geradoEm: string; // ISO timestamp
  provider: "stub" | "gemini";
  iaOriginal: FamilyReportDraft; // imutável — rascunho da IA (auditoria F2)
  curado: FamilyReportDraft | null; // null até o coordenador revisar
};
