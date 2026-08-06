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

import { formatarHoras, papelConsomeSaldo, parseHoras } from "@/lib/horas";

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

/**
 * `id` do bloco da barra desta disciplina na tela de equipe (#203, fatia 6).
 *
 * A represcrição que sobrealoca leva o coordenador de uma tela para outra
 * (§MV4) e precisa apontar para a disciplina afetada, não para o topo da
 * página. Mora aqui junto de `chaveDisciplina` para que quem gera o link e quem
 * renderiza a âncora derivem o mesmo texto da mesma normalização — âncora
 * montada em dois lugares diverge no primeiro acento.
 */
export function ancoraCobertura(disciplina: string): string {
  return `cobertura-${encodeURIComponent(chaveDisciplina(disciplina))}`;
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
 * Rótulo curto do estado, para o selo ao lado da barra (#203, fatia 5).
 *
 * O selo é REFORÇO: quem só vê a cor da barra lê o estado aqui, e quem usa
 * leitor de tela recebe a frase inteira de `textoCobertura`. Nenhum dos dois
 * depende de matiz — cor sozinha nunca carrega significado (§MV3).
 */
export const ROTULO_ESTADO: Record<EstadoCobertura, string> = {
  vazio: "Sem alocação",
  parcial: "Em construção",
  completa: "Cobertura completa",
  sobrealocada: "Sobrealocada",
};

/**
 * A frase da tabela de MV3, por extenso. É simultaneamente o texto visível e o
 * `aria-valuetext` da barra — um texto só, para o que o leitor de tela anuncia
 * e o que está na tela nunca divergirem.
 *
 * Mora aqui, e não no componente, porque é regra de copy testável sem DOM: a
 * diferença entre "restam 8h" e "sobrealocação de 5h" é clínica, não visual.
 * Toda hora passa por `formatarHoras` (D-E): `1h30`, nunca `1,5h`.
 */
export function textoCobertura(c: CoberturaDisciplina): string {
  const alvo = formatarHoras(c.horasAlvo);
  const alocadas = formatarHoras(c.horasAlocadas);
  const base = `${alocadas} de ${alvo} alocadas`;

  switch (c.estado) {
    case "vazio":
      // Sem percentual: "0%" não acrescenta nada a "nenhum terapeuta vinculado"
      // e a frase precisa dizer o que FALTA, não repetir o número.
      return `${base} — nenhum terapeuta vinculado`;
    case "completa":
      return `${base} — cobertura completa`;
    case "sobrealocada":
      // A instrução faz parte da frase: sobrealocação não trava a tela (§MV3),
      // então o único caminho de saída precisa estar escrito onde o problema
      // aparece — inclusive para quem só ouve a barra.
      return `${base} (${c.percentual}%) — sobrealocação de ${formatarHoras(
        c.horasExcedentes,
      )}. Reduza as horas de um membro ou aumente a prescrição.`;
    case "parcial":
      return `${base} (${c.percentual}%) — restam ${formatarHoras(
        c.horasRestantes,
      )}`;
  }
}

/**
 * Aviso de que a conta acima está incompleta.
 *
 * Vínculo vigente que consome mas não tem horas registradas (legado) faz a
 * barra afirmar `8h de 20h` enquanto cinco terapeutas atendem. O número não
 * está errado — está incompleto, e a diferença precisa estar escrita.
 * Devolve `null` quando não há o que avisar, para a tela não renderizar caixa
 * vazia.
 */
export function textoVinculosSemHoras(c: CoberturaDisciplina): string | null {
  if (c.vinculosSemHoras <= 0) return null;
  const plural = c.vinculosSemHoras === 1 ? "vínculo" : "vínculos";
  return `${c.vinculosSemHoras} ${plural} sem horas definidas — a conta acima está incompleta até você defini-las.`;
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
