export type EixoEspectro =
  | "comunicacao_expressiva"
  | "comunicacao_receptiva"
  | "social_brincar"
  | "cognicao_aprendizado"
  | "autonomia_motor"
  | "regulacao_barreiras";

export interface DadosEixoRadar {
  eixo: EixoEspectro;
  rotulo: string;
  valor: number; // 0 a 100
  contagemEvidencias: number;
}

export interface MilestoneMetadata {
  dominioId: string;
  protocolId: string;
  tipoEstrutura: "marco_simples" | "marco_com_barreira" | "escore_composto" | "faixa_normativa";
  totalNiveisAjuda: number; // máximo ordinal configurado na taxonomia do protocolo
}

export interface GoalMetadata {
  id: string;
  disciplina: string | null; // 'ABA' | 'Fono' | 'TO'
}

/**
 * Mapeia um dominioId do milestone (ou disciplina de meta) para um eixo do Espectro.
 */
export function mapearEixo(
  dominioId: string,
  disciplina: string | null
): EixoEspectro {
  const dom = dominioId.toLowerCase().trim();

  // 1. VB-MAPP e eixos comportamentais clássicos
  if (["mando", "tato", "ecoico", "vocal", "intraverbal"].includes(dom)) {
    return "comunicacao_expressiva";
  }
  if (["ouvinte", "instrucao_grupo", "instrução em grupo"].includes(dom)) {
    return "comunicacao_receptiva";
  }
  if (["social", "brincar", "jogo", "interação social"].includes(dom)) {
    return "social_brincar";
  }
  if (["pareamento", "leitura", "escrita", "matematica", "linguagem_social", "cognitivo"].includes(dom)) {
    return "cognicao_aprendizado";
  }
  if (["imitacao", "motora", "motor", "independencia", "autonomia"].includes(dom)) {
    return "autonomia_motor";
  }
  if (["barreiras", "regulacao", "comportamento", "cooperacao", "cooperação"].includes(dom)) {
    return "regulacao_barreiras";
  }

  // 2. Fallback por disciplina de meta (Fono/TO/ABA)
  const disc = disciplina?.toUpperCase().trim();
  if (disc === "FONOAUDIOLOGIA" || disc === "FONOTERAPIA" || disc === "FONO") {
    return "comunicacao_expressiva";
  }
  if (disc === "TO" || disc === "TERAPIA_OCUPACIONAL") {
    return "autonomia_motor";
  }

  return "cognicao_aprendizado"; // Fallback geral padrão
}

/**
 * Computa os dados do radar chart "Espectro" (6 pontas, 0-100%) a partir do repertorioState
 * materializado no session_snapshot.
 * Tratamento rigoroso de divisão por zero (NaN) e inversão do eixo de regulação/barreiras.
 */
export function computarDadosEspectro(
  repertorioState: Record<string, { nivel_ajuda_recente?: number | null; contagem: number; is_candidata?: boolean }>,
  mapeamentoMilestones: Record<string, MilestoneMetadata>,
  metas: GoalMetadata[]
): DadosEixoRadar[] {
  // Inicializa acumuladores para os 6 eixos
  const eixos: Record<EixoEspectro, { somaProgresso: number; pesoTotal: number; totalEvidencias: number }> = {
    comunicacao_expressiva: { somaProgresso: 0, pesoTotal: 0, totalEvidencias: 0 },
    comunicacao_receptiva: { somaProgresso: 0, pesoTotal: 0, totalEvidencias: 0 },
    social_brincar: { somaProgresso: 0, pesoTotal: 0, totalEvidencias: 0 },
    cognicao_aprendizado: { somaProgresso: 0, pesoTotal: 0, totalEvidencias: 0 },
    autonomia_motor: { somaProgresso: 0, pesoTotal: 0, totalEvidencias: 0 },
    regulacao_barreiras: { somaProgresso: 0, pesoTotal: 0, totalEvidencias: 0 },
  };

  const metasMap = new Map(metas.map((m) => [m.id, m]));

  for (const [id, estado] of Object.entries(repertorioState)) {
    let eixo: EixoEspectro | null = null;
    let progresso = 0;
    let temProgressoValido = false;

    const milestone = mapeamentoMilestones[id];
    const meta = metasMap.get(id);

    if (milestone) {
      eixo = mapearEixo(milestone.dominioId, null);
      eixos[eixo].totalEvidencias += estado.contagem;

      if (milestone.tipoEstrutura === "marco_simples") {
        const ord = estado.nivel_ajuda_recente;
        if (ord !== undefined && ord !== null && milestone.totalNiveisAjuda > 0) {
          // Nível de ajuda: menor ordinal = mais independente (melhor).
          // Se totalNiveisAjuda = 4, ordinais [0, 1, 2, 3, 4]
          // Independente (0) -> progresso 100%
          // Nível 4 (4) -> progresso 0%
          const total = milestone.totalNiveisAjuda;
          progresso = (total - ord) / total;
          temProgressoValido = true;
        }
      } else if (milestone.tipoEstrutura === "marco_com_barreira") {
        // Eixo de barreiras: escala invertida.
        // No VB-MAPP Barreiras, escore menor = melhor (menos barreiras).
        // Se ord = 4 (grave) -> progresso 0%
        // Se ord = 0 (sem barreira) -> progresso 100%
        const ord = estado.nivel_ajuda_recente;
        if (ord !== undefined && ord !== null) {
          // Assume escala de 0 a 4 por padrão se totalNiveisAjuda não fornecido
          const maxEscala = milestone.totalNiveisAjuda || 4;
          progresso = (maxEscala - ord) / maxEscala;
          temProgressoValido = true;
        }
      }
    } else if (meta) {
      eixo = mapearEixo("", meta.disciplina);
      eixos[eixo].totalEvidencias += estado.contagem;

      // Meta: se is_candidata (candidata a dominada) ou dominada, progresso é 1.
      // Caso contrário, calcula proporcional à contagem de acertos (limite de 3 para 100%)
      if (estado.is_candidata) {
        progresso = 1.0;
        temProgressoValido = true;
      } else {
        progresso = Math.min(estado.contagem / 3, 1.0);
        temProgressoValido = true;
      }
    }

    if (eixo && temProgressoValido) {
      eixos[eixo].somaProgresso += progresso;
      eixos[eixo].pesoTotal += 1;
    }
  }

  // Mapeia para o formato de retorno, tratando divisão por zero de forma segura (NaN -> 0)
  const deparaRotulo: Record<EixoEspectro, string> = {
    comunicacao_expressiva: "Comunicação Expressiva",
    comunicacao_receptiva: "Comunicação Receptiva",
    social_brincar: "Social & Brincar",
    cognicao_aprendizado: "Cognição & Aprendizado",
    autonomia_motor: "Autonomia & Motor",
    regulacao_barreiras: "Regulação & Barreiras",
  };

  return (Object.keys(eixos) as EixoEspectro[]).map((e) => {
    const { somaProgresso, pesoTotal, totalEvidencias } = eixos[e];
    const valorRaw = pesoTotal > 0 ? (somaProgresso / pesoTotal) * 100 : 0;
    
    // Tratamento estrito contra NaN ou estouro de limites
    const valor = isNaN(valorRaw) ? 0 : Math.max(0, Math.min(100, Math.round(valorRaw)));

    return {
      eixo: e,
      rotulo: deparaRotulo[e],
      valor,
      contagemEvidencias: totalEvidencias,
    };
  });
}
