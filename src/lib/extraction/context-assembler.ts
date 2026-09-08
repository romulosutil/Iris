import type { HistoricoEntrada } from "./historico-relevante";

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

/**
 * #464 — a forma do item de `historico_relevante` DEPENDE DO MODO, e o tipo
 * anterior (`dominio_id` e `protocol_id` ambos obrigatórios) só conseguia
 * expressar o modo ABA. A união reflete o que os docs de protocolo já pediam:
 * TCC não tem domínio, e terapia convencional não tem protocolo — tem tema.
 * Ver `historico-relevante.ts` para as fontes de cada variante.
 */
export type CanonicalHistoricoItem =
  | { dominio_id: string; protocol_id: string; resumo: string }
  | { protocol_id: string; resumo: string }
  | { tema: string; resumo: string };

export type CanonicalContext = {
  paciente: {
    idade_meses: number | null;
    /**
     * #464 — DERIVADO em runtime, nunca uma coluna. Não há campo livre que
     * alguém escreva no cadastro: um resumo escrito à mão apodrece (ninguém
     * volta para atualizá-lo) e vira superfície de prompt-injection dentro do
     * contexto do agente. Carrega só o que NENHUM outro campo do contrato
     * carrega — idade legível e a posição desta sessão no acompanhamento;
     * protocolos, metas e abordagem já têm campo próprio, e repeti-los aqui
     * criaria duas fontes de verdade e custaria token em toda extração.
     */
    resumo_repertorio: string;
    metas_ativas: CanonicalMeta[];
  };
  modo?: "terapia_convencional" | "protocol_driven" | "tcc";
  // #331 — só populado quando modo === "terapia_convencional" e o paciente
  // já tem o campo preenchido em `patient.familia_abordagem`. Ausente
  // (nunca `null`) nos outros modos e em paciente convencional legado sem
  // o campo — R9-TC funciona sem ele via fallback existente, então omitir
  // a chave é sempre seguro.
  familia_abordagem?:
    "psicodinamica" | "humanista_existencial" | "transpessoal_integrativa";
  protocolos_ativos: CanonicalProtocolo[];
  historico_relevante: CanonicalHistoricoItem[];
};

export type AssemblerInput = {
  paciente: {
    idadeMeses: number | null;
    /**
     * #464 — `session.numero_sequencial_paciente` da sessão em extração ("esta
     * é a sessão 8 do acompanhamento"). O número já está atribuído quando o
     * loader roda: `diario-consolidacao.ts` chama
     * `app_session_definir_numero_sequencial` ANTES de montar o contexto.
     * `null` só em chamador que monte contexto fora desse fluxo.
     */
    sessaoNumero: number | null;
  };
  modo?: "terapia_convencional" | "protocol_driven" | "tcc";
  // #331 — mesma tipagem do campo de saída; ausente/omitida quando não se
  // aplica. A decisão de QUANDO mandar (modo convencional + valor não nulo
  // no banco) é do chamador (context-loader.ts), não desta função pura.
  familiaAbordagem?:
    "psicodinamica" | "humanista_existencial" | "transpessoal_integrativa";
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
  historico: HistoricoEntrada[];
};

/**
 * #464 — `resumo_repertorio` por regra determinística. Nada aqui é inferido:
 * idade desconhecida e sessão sem número são DITAS, nunca omitidas nem
 * colapsadas em zero (um "sessão 0" ou uma idade ausente lida como recém-nascido
 * seriam afirmações clínicas falsas dentro do contexto do agente).
 *
 * Abaixo de 24 meses a idade sai em meses: é a granularidade que a clínica
 * infantil usa. De 24 em diante, anos inteiros.
 */
function derivarResumoRepertorio(paciente: AssemblerInput["paciente"]): string {
  const meses = paciente.idadeMeses;
  const idade =
    meses === null
      ? "Idade não informada"
      : meses < 24
        ? `${meses} meses`
        : `${Math.floor(meses / 12)} anos`;
  const sessao =
    paciente.sessaoNumero === null
      ? "número de sessão ainda não atribuído"
      : `sessão ${paciente.sessaoNumero} do acompanhamento`;
  return `${idade}; ${sessao}.`;
}

/**
 * #464 — tira o discriminador `tipo` (detalhe interno da projeção) e entrega
 * a forma exata que cada modo promete no doc de protocolo. O `tipo` NUNCA
 * chega ao agente: não faz parte do contrato canônico.
 */
function paraItemCanonico(h: HistoricoEntrada): CanonicalHistoricoItem {
  switch (h.tipo) {
    case "protocolo":
      return {
        dominio_id: h.dominioId,
        protocol_id: h.protocolFamilia,
        resumo: h.resumo,
      };
    case "instrumento":
      return { protocol_id: h.protocolFamilia, resumo: h.resumo };
    case "tema":
      return { tema: h.tema, resumo: h.resumo };
  }
}

export function buildCanonicalContext(input: AssemblerInput): CanonicalContext {
  const ctx: CanonicalContext = {
    paciente: {
      idade_meses: input.paciente.idadeMeses,
      resumo_repertorio: derivarResumoRepertorio(input.paciente),
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
    historico_relevante: input.historico.map(paraItemCanonico),
  };

  if (input.modo) {
    ctx.modo = input.modo;
  }
  if (input.familiaAbordagem) {
    ctx.familia_abordagem = input.familiaAbordagem;
  }

  return ctx;
}
