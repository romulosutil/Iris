// Monta o contrato canônico que o agente recebe (protocolos-e-agente.md Parte 2)
// a partir de linhas já carregadas do banco. Função PURA (sem DB) → testável.
// O loader que consulta o Postgres vive em context-loader.ts (integração).

type CanonicalDominio = {
  dominio_id: string;
  nome: string;
  nivel: string | null;
};

type CanonicalProtocolo = {
  protocol_id: string; // = protocol.familia (slug do catálogo: "vbmapp", "pedi"...)
  nome: string;
  disciplina: string;
  taxonomia_ajuda: string[];
  dominios: CanonicalDominio[];
};

type CanonicalMeta = {
  goal_id: string;
  descricao: string;
  disciplina: string | null;
  mapeamentos: Array<{
    protocol_id: string;
    dominio_id: string;
    nivel: string | null;
  }>;
};

export type CanonicalContext = {
  paciente: {
    idade_meses: number | null;
    metas_ativas: CanonicalMeta[];
  };
  modo?: "terapia_convencional" | "protocol_driven";
  protocolos_ativos: CanonicalProtocolo[];
  historico_relevante: Array<{
    dominio_id: string;
    protocol_id: string;
    resumo: string;
  }>;
};

export type AssemblerInput = {
  paciente: { idadeMeses: number | null };
  modo?: "terapia_convencional" | "protocol_driven";
  protocolos: Array<{
    familia: string;
    nome: string;
    disciplina: string;
    taxonomiaAjuda: string[];
    dominios: Array<{ dominioId: string; nome: string; nivel: string | null }>;
  }>;
  metas: Array<{
    id: string;
    descricao: string;
    disciplina: string | null;
    mapeamentos: Array<{
      familia: string;
      dominioId: string;
      nivel: string | null;
    }>;
  }>;
  historico: Array<{
    dominioId: string;
    protocolFamilia: string;
    resumo: string;
  }>;
};

export function buildCanonicalContext(input: AssemblerInput): CanonicalContext {
  const ctx: CanonicalContext = {
    paciente: {
      idade_meses: input.paciente.idadeMeses,
      metas_ativas: input.metas.map((m) => ({
        goal_id: m.id,
        descricao: m.descricao,
        disciplina: m.disciplina,
        mapeamentos: m.mapeamentos.map((mp) => ({
          protocol_id: mp.familia,
          dominio_id: mp.dominioId,
          nivel: mp.nivel,
        })),
      })),
    },
    protocolos_ativos: input.protocolos.map((p) => ({
      protocol_id: p.familia,
      nome: p.nome,
      disciplina: p.disciplina,
      taxonomia_ajuda: p.taxonomiaAjuda,
      dominios: p.dominios.map((d) => ({
        dominio_id: d.dominioId,
        nome: d.nome,
        nivel: d.nivel,
      })),
    })),
    historico_relevante: input.historico.map((h) => ({
      dominio_id: h.dominioId,
      protocol_id: h.protocolFamilia,
      resumo: h.resumo,
    })),
  };

  if (input.modo) {
    ctx.modo = input.modo;
  }

  return ctx;
}
