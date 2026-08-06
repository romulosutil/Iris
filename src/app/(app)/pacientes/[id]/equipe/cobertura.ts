/**
 * Cobertura da carga prescrita — agregação pura (#203, fatia 4).
 *
 * Este módulo responde UMA pergunta: "a prescrição está sendo entregue?".
 * Ele não fala com o banco e não renderiza nada — recebe as duas listas já
 * lidas (prescrições vigentes e vínculos vigentes) e devolve o resumo por
 * disciplina. Três motivos para ele existir separado:
 *
 *   1. A MESMA conta alimenta a validação de saldo do servidor e a barra da
 *      tela. Duplicar a agregação faria a tela e a validação discordarem sobre
 *      o mesmo número — o coordenador veria "restam 8h" e receberia recusa ao
 *      alocar 8h.
 *   2. Sobrealocação é estado DERIVADO, nunca coluna (plano §MV4). Calcular na
 *      leitura é o que impede a flag persistida de mentir depois que alguém
 *      encerra um vínculo por outro caminho.
 *   3. Sendo puro, dá para testar os quatro estados (0% / 1-99% / 100% / >100%)
 *      sem Postgres — e a fatia 5 renderiza esta saída sem recalcular nada.
 *
 * ⚠️ Filtro de vigência é responsabilidade de QUEM CHAMA, nos DOIS lados
 * (plano §4.5). Passar vínculos encerrados aqui soma histórico e produz
 * sobrealocação fantasma — o bug mais provável desta feature, porque só
 * aparece em paciente com histórico e nunca em dado de teste novo.
 */

import { papelConsomeSaldo, parseHoras } from "@/lib/horas";

export type PrescricaoParaCobertura = {
  disciplina: string;
  horasAlvoSemana: number | string | null;
};

export type VinculoParaCobertura = {
  disciplina: string;
  papelNaEquipe: string;
  horasSemana: number | string | null;
};

/** Os quatro estados da tabela de MV3, na ordem em que a tela os lê. */
export type EstadoCobertura =
  | "vazio" // 0% — nenhum terapeuta consumindo
  | "parcial" // 1-99% — em construção
  | "completa" // 100% — a prescrição está sendo entregue
  | "sobrealocada"; // >100% — legítimo e transitório, grita mas não trava

export type CoberturaDisciplina = {
  disciplina: string;
  /** Teto prescrito vigente, em horas. */
  horasAlvo: number;
  /** Soma das horas dos vínculos vigentes em papel que CONSOME (D-B/D-C). */
  horasAlocadas: number;
  /** `horasAlvo - horasAlocadas`, nunca negativo — veja `horasExcedentes`. */
  horasRestantes: number;
  /** Quanto passou do teto. Zero quando não há sobrealocação. */
  horasExcedentes: number;
  /** Arredondado para inteiro; só para exibição, nunca para decisão. */
  percentual: number;
  estado: EstadoCobertura;
  /**
   * Vínculos vigentes que consomem mas estão SEM horas (legado). A barra não
   * pode afirmar "8h de 20h" enquanto cinco terapeutas atendem sem carga
   * registrada — o número mentiria. A tela usa isto para o chip
   * `Horas não definidas` (plano §4.2).
   */
  vinculosSemHoras: number;
};

/**
 * Chave de comparação de disciplina. Case-insensitive e sem espaço nas bordas
 * porque a disciplina é `text` livre no banco: `"fonoaudiologia"` digitado numa
 * tela e `"Fonoaudiologia"` na outra são a MESMA disciplina clínica, e tratá-las
 * como distintas partiria o saldo em dois silenciosamente.
 */
export function chaveDisciplina(disciplina: string): string {
  return disciplina.trim().toLowerCase();
}

/** Soma das horas vigentes que consomem saldo numa disciplina. */
export function somarHorasAlocadas(
  vinculos: readonly VinculoParaCobertura[],
  disciplina: string,
): number {
  const alvo = chaveDisciplina(disciplina);
  return vinculos.reduce((total, v) => {
    if (chaveDisciplina(v.disciplina) !== alvo) return total;
    if (!papelConsomeSaldo(v.papelNaEquipe)) return total;
    // `numeric` chega como STRING pelo driver `postgres`: somar direto
    // concatenaria ("8" + "12" = "812"). `parseHoras` devolve null, nunca NaN.
    return total + (parseHoras(v.horasSemana) ?? 0);
  }, 0);
}

function classificar(alvo: number, alocado: number): EstadoCobertura {
  if (alocado <= 0) return "vazio";
  if (alocado > alvo) return "sobrealocada";
  if (alocado >= alvo) return "completa";
  return "parcial";
}

/**
 * Resumo de cobertura por disciplina prescrita, em ordem alfabética.
 *
 * Toda disciplina prescrita aparece — inclusive com 0h alocadas. É justamente a
 * linha em 0% que diz ao coordenador o que falta fazer; escondê-la deixaria o
 * buraco invisível.
 */
export function calcularCobertura(
  prescricoes: readonly PrescricaoParaCobertura[],
  vinculos: readonly VinculoParaCobertura[],
): CoberturaDisciplina[] {
  return prescricoes
    .map((p) => {
      const horasAlvo = parseHoras(p.horasAlvoSemana) ?? 0;
      const horasAlocadas = somarHorasAlocadas(vinculos, p.disciplina);
      const diff = horasAlvo - horasAlocadas;
      const chave = chaveDisciplina(p.disciplina);
      return {
        disciplina: p.disciplina,
        horasAlvo,
        horasAlocadas,
        horasRestantes: Math.max(0, diff),
        horasExcedentes: Math.max(0, -diff),
        percentual:
          horasAlvo > 0 ? Math.round((horasAlocadas / horasAlvo) * 100) : 0,
        estado: classificar(horasAlvo, horasAlocadas),
        vinculosSemHoras: vinculos.filter(
          (v) =>
            chaveDisciplina(v.disciplina) === chave &&
            papelConsomeSaldo(v.papelNaEquipe) &&
            parseHoras(v.horasSemana) === null,
        ).length,
      };
    })
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR"));
}

/**
 * Vínculos vigentes cuja disciplina NÃO está prescrita hoje.
 *
 * Não são erro nem lixo: são o legado de quem alocou antes de a prescrição
 * virar o pilar mestre. Precisam de bloco próprio na lista porque, sem ele,
 * aparecem entre os demais, não somam em barra nenhuma, e o coordenador não
 * entende por quê (plano §3.1).
 */
export function vinculosForaDaPrescricao<T extends VinculoParaCobertura>(
  vinculos: readonly T[],
  prescricoes: readonly PrescricaoParaCobertura[],
): T[] {
  const prescritas = new Set(
    prescricoes.map((p) => chaveDisciplina(p.disciplina)),
  );
  return vinculos.filter(
    (v) =>
      papelConsomeSaldo(v.papelNaEquipe) &&
      !prescritas.has(chaveDisciplina(v.disciplina)),
  );
}
