// Monta o contrato canônico que o agente recebe (protocolos-e-agente.md Parte 2)
// a partir de linhas já carregadas do banco. Função PURA (sem DB) → testável.
// O loader que consulta o Postgres vive em context-loader.ts (integração).

type CanonicalDominio = {
  dominio_id: string;
  nome: string;
  nivel: string | null;
};

// #393 — como o dado é coletado: sessão-a-sessão (ABA, comportamento atual)
// vs. escala padronizada aplicada em intervalos (PHQ-9/GAD-7). Sinal para o
// agente/prompt (TCC_SYSTEM_PROMPT cita a diferença, RQ4) — nenhum código
// consome este campo ainda nesta issue.
type TipoColeta = "por_sessao" | "escala_padronizada_intervalar";

type CanonicalProtocolo = {
  protocol_id: string; // = protocol.familia (slug do catálogo: "vbmapp", "pedi"...)
  nome: string;
  disciplina: string;
  taxonomia_ajuda: string[];
  dominios: CanonicalDominio[];
  tipo_coleta: TipoColeta;
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
  modo?: "terapia_convencional" | "protocol_driven" | "tcc";
  // #331 — só populado quando modo === "terapia_convencional" e o paciente
  // já tem o campo preenchido em `patient.familia_abordagem`. Ausente
  // (nunca `null`) nos outros modos e em paciente convencional legado sem
  // o campo — R9-TC funciona sem ele via fallback existente, então omitir
  // a chave é sempre seguro.
  familia_abordagem?: "psicodinamica" | "humanista_existencial" | "transpessoal_integrativa";
  protocolos_ativos: CanonicalProtocolo[];
  historico_relevante: Array<{
    dominio_id: string;
    protocol_id: string;
    resumo: string;
  }>;
};

export type AssemblerInput = {
  paciente: { idadeMeses: number | null };
  modo?: "terapia_convencional" | "protocol_driven" | "tcc";
  // #331 — mesma tipagem do campo de saída; ausente/omitida quando não se
  // aplica. A decisão de QUANDO mandar (modo convencional + valor não nulo
  // no banco) é do chamador (context-loader.ts), não desta função pura.
  familiaAbordagem?: "psicodinamica" | "humanista_existencial" | "transpessoal_integrativa";
  protocolos: Array<{
    familia: string;
    nome: string;
    disciplina: string;
    taxonomiaAjuda: string[];
    dominios: Array<{ dominioId: string; nome: string; nivel: string | null }>;
    // #393 — ausente = protocolo ABA existente, default explícito
    // "por_sessao" (não um gap silencioso). Instrumentos (PHQ-9/GAD-7)
    // passam "escala_padronizada_intervalar" explicitamente.
    tipoColeta?: TipoColeta;
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
      // Default explícito para protocolos ABA existentes — não deixar
      // indefinido (#393).
      tipo_coleta: p.tipoColeta ?? "por_sessao",
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
  if (input.familiaAbordagem) {
    ctx.familia_abordagem = input.familiaAbordagem;
  }

  return ctx;
}
