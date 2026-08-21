/**
 * Espectro — os 6 eixos do hexágono do prontuário.
 *
 * O QUE O NÚMERO É
 * ----------------
 * `valor` é a **independência documentada** do eixo: a média simples, entre os
 * alvos do PEI daquele eixo, de quão pouco apoio o paciente precisou na última
 * vez que o alvo foi registrado — em evidência já aprovada por terapeuta e
 * validada na revisão. 100 = todos os alvos medidos saíram independentes.
 * 0 = todos saíram com o apoio máximo previsto pelo protocolo.
 *
 * Ler de dentro para fora: perto do centro, o repertório registrado ainda
 * depende de apoio; perto da borda, ele aparece independente. Não é
 * diagnóstico, não é prognóstico e não é escore de instrumento.
 *
 * O QUE O NÚMERO NÃO É — e por quê
 * --------------------------------
 * A versão anterior devolvia 0 para eixo sem dado, dava 100% a qualquer meta
 * com 3 evidências de qualquer polaridade e mandava toda meta sem marco para
 * `cognicao_aprendizado`. Um hexágono desenhado assim afirma três coisas que
 * ninguém mediu. As três regras que substituem isso:
 *
 * 1. **Ausência de dado é `null`, nunca 0.** Eixo sem alvo e eixo sem registro
 *    são estados nomeados na tela, não um vértice colado no centro.
 * 2. **Candidata não é dominada.** Critério de domínio atingido é candidatura
 *    aguardando o coordenador; entra em `candidatos`, nunca em `dominados`,
 *    e não pontua 100 por si só.
 * 3. **Alvo que não resolve eixo é contado à parte** (`naoClassificados`), não
 *    empurrado para um eixo qualquer.
 *
 * COMO UM GANHO NO PEI SOBE A PONTUAÇÃO
 * -------------------------------------
 * Terapeuta registra a sessão → extração vira evidência → evidência é aprovada
 * → a materialização atualiza `nivel_ajuda_recente` do alvo. Se o alvo saiu com
 * menos apoio que antes, o ordinal cai e a independência daquele alvo sobe;
 * a média do eixo sobe junto. Quando o coordenador marca a meta como
 * `dominada`, o alvo passa a valer 1 de forma estável.
 */

export type EixoEspectro =
  | "comunicacao_expressiva"
  | "comunicacao_receptiva"
  | "social_brincar"
  | "cognicao_aprendizado"
  | "autonomia_motor"
  | "regulacao_barreiras";

export const ROTULO_EIXO: Record<EixoEspectro, string> = {
  comunicacao_expressiva: "Comunicação Expressiva",
  comunicacao_receptiva: "Comunicação Receptiva",
  social_brincar: "Social & Brincar",
  cognicao_aprendizado: "Cognição & Aprendizado",
  autonomia_motor: "Autonomia & Motor",
  regulacao_barreiras: "Regulação & Barreiras",
};

/** Ordem fixa dos vértices — a forma do hexágono não pode variar por sessão. */
export const ORDEM_EIXOS: EixoEspectro[] = [
  "comunicacao_expressiva",
  "comunicacao_receptiva",
  "social_brincar",
  "cognicao_aprendizado",
  "autonomia_motor",
  "regulacao_barreiras",
];

export interface DadosEixoRadar {
  eixo: EixoEspectro;
  rotulo: string;
  /** 0 a 100, ou `null` quando nada foi medido. Ausência nunca vira 0. */
  valor: number | null;
  /** Alvos do PEI corrente (metas `ativa` ou `dominada`) neste eixo. */
  alvos: number;
  /** Quantos desses têm nível de ajuda registrado — denominador de `valor`. */
  medidos: number;
  /** Alvos que o coordenador marcou como dominados. */
  dominados: number;
  /** Critério de domínio atingido, aguardando validação. Não são dominados. */
  candidatos: number;
  /** Evidências aprovadas acumuladas até a sessão selecionada. */
  contagemEvidencias: number;
}

/** Um alvo do PEI, com o que é preciso para situá-lo num eixo e pontuá-lo. */
export interface AlvoEspectro {
  goalId: string;
  /** Domínio do marco mapeado à meta (`goal_milestone_mapping`), se houver. */
  dominioId: string | null;
  disciplina: string | null;
  estado: "rascunho" | "ativa" | "dominada" | "pausada" | "descontinuada";
  /** Maior ordinal da taxonomia de ajuda do protocolo. 0 = escala desconhecida. */
  totalNiveisAjuda: number;
  /** `goal_candidacy.is_candidate_dominada` — critério atingido, não validado. */
  isCandidata: boolean;
}

export interface EstadoRepertorio {
  nivel_ajuda_recente?: number | null;
  contagem?: number;
  is_candidata?: boolean;
  origem?: string;
  procedencia?: string;
}

export interface ResultadoEspectro {
  eixos: DadosEixoRadar[];
  /** Alvos que não resolvem eixo nenhum. Aparecem na tela como lacuna. */
  naoClassificados: number;
}

const DOMINIO_PARA_EIXO: Record<string, EixoEspectro> = {
  mando: "comunicacao_expressiva",
  tato: "comunicacao_expressiva",
  ecoico: "comunicacao_expressiva",
  vocal: "comunicacao_expressiva",
  intraverbal: "comunicacao_expressiva",

  ouvinte: "comunicacao_receptiva",
  instrucao_grupo: "comunicacao_receptiva",
  "instrução em grupo": "comunicacao_receptiva",

  social: "social_brincar",
  brincar: "social_brincar",
  jogo: "social_brincar",
  "interação social": "social_brincar",
  linguagem_social: "social_brincar",

  pareamento: "cognicao_aprendizado",
  leitura: "cognicao_aprendizado",
  escrita: "cognicao_aprendizado",
  matematica: "cognicao_aprendizado",
  cognitivo: "cognicao_aprendizado",

  imitacao: "autonomia_motor",
  motora: "autonomia_motor",
  motor: "autonomia_motor",
  independencia: "autonomia_motor",
  autonomia: "autonomia_motor",

  barreiras: "regulacao_barreiras",
  regulacao: "regulacao_barreiras",
  comportamento: "regulacao_barreiras",
  cooperacao: "regulacao_barreiras",
  cooperação: "regulacao_barreiras",
};

const DISCIPLINA_PARA_EIXO: Record<string, EixoEspectro> = {
  FONO: "comunicacao_expressiva",
  FONOAUDIOLOGIA: "comunicacao_expressiva",
  FONOTERAPIA: "comunicacao_expressiva",
  TO: "autonomia_motor",
  TERAPIA_OCUPACIONAL: "autonomia_motor",
};

/**
 * Resolve o eixo de um alvo. Domínio do marco primeiro; disciplina só como
 * segunda tentativa. Devolve `null` quando nenhum dos dois resolve — a
 * ausência de eixo é um fato sobre o cadastro, e a tela mostra esse fato em
 * vez de inventar um vértice.
 */
export function mapearEixo(
  dominioId: string | null | undefined,
  disciplina: string | null | undefined,
): EixoEspectro | null {
  const dom = dominioId?.toLowerCase().trim();
  if (dom) {
    const porDominio = DOMINIO_PARA_EIXO[dom];
    if (porDominio) return porDominio;
  }

  const disc = disciplina?.toUpperCase().trim();
  if (disc) {
    const porDisciplina = DISCIPLINA_PARA_EIXO[disc];
    if (porDisciplina) return porDisciplina;
  }

  return null;
}

/**
 * Independência documentada de um alvo, em 0 a 1, ou `null` se não há o que
 * medir. Vale para os dois tipos de escala do modelo — nível de ajuda e escore
 * de barreira — porque em ambos o ordinal menor é o melhor.
 */
export function progressoDoAlvo(
  alvo: AlvoEspectro,
  estado: EstadoRepertorio | undefined,
): number | null {
  // O valor sai SÓ do registro da sessão, nunca do estado atual da meta.
  // `goal.estado` não tem data: usá-lo como atalho para 100 reescreveria as
  // sessões passadas com uma conquista que só aconteceu depois delas. Meta
  // dominada de verdade já chega aqui com ordinal 0 — o critério de domínio
  // exige N sessões consecutivas independentes.
  const ordinal = estado?.nivel_ajuda_recente;
  if (ordinal === undefined || ordinal === null || !Number.isFinite(ordinal)) {
    return null;
  }

  // Sem taxonomia de ajuda não existe denominador. A versão anterior assumia
  // uma escala de 0 a 4 nesse caso — um número inventado com cara de medida.
  const total = alvo.totalNiveisAjuda;
  if (!Number.isFinite(total) || total <= 0) return null;

  const ord = Math.max(0, Math.min(total, ordinal));
  return (total - ord) / total;
}

/** Alvos que compõem o PEI corrente. Rascunho e meta encerrada ficam fora. */
function contaComoAlvo(alvo: AlvoEspectro): boolean {
  return alvo.estado === "ativa" || alvo.estado === "dominada";
}

interface AcumuladorEixo {
  soma: number;
  medidos: number;
  alvos: number;
  dominados: number;
  candidatos: number;
  evidencias: number;
}

export function computarDadosEspectro(
  repertorioState: Record<string, EstadoRepertorio>,
  alvos: AlvoEspectro[],
): ResultadoEspectro {
  const acumulado = {} as Record<EixoEspectro, AcumuladorEixo>;
  for (const eixo of ORDEM_EIXOS) {
    acumulado[eixo] = {
      soma: 0,
      medidos: 0,
      alvos: 0,
      dominados: 0,
      candidatos: 0,
      evidencias: 0,
    };
  }

  let naoClassificados = 0;

  for (const alvo of alvos) {
    if (!contaComoAlvo(alvo)) continue;

    const eixo = mapearEixo(alvo.dominioId, alvo.disciplina);
    if (!eixo) {
      naoClassificados += 1;
      continue;
    }

    const bucket = acumulado[eixo];
    const estado = repertorioState[alvo.goalId];

    bucket.alvos += 1;
    bucket.evidencias += Math.max(0, estado?.contagem ?? 0);
    if (alvo.estado === "dominada") bucket.dominados += 1;
    else if (alvo.isCandidata) bucket.candidatos += 1;

    const progresso = progressoDoAlvo(alvo, estado);
    if (progresso !== null) {
      bucket.soma += progresso;
      bucket.medidos += 1;
    }
  }

  const eixos: DadosEixoRadar[] = ORDEM_EIXOS.map((eixo) => {
    const b = acumulado[eixo];
    return {
      eixo,
      rotulo: ROTULO_EIXO[eixo],
      valor: b.medidos > 0 ? Math.round((b.soma / b.medidos) * 100) : null,
      alvos: b.alvos,
      medidos: b.medidos,
      dominados: b.dominados,
      candidatos: b.candidatos,
      contagemEvidencias: b.evidencias,
    };
  });

  return { eixos, naoClassificados };
}
