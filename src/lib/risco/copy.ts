/**
 * Copy do alerta de risco clínico — §6 (e §5.2) de
 * `docs/agente/regra-alerta-risco.md`. Textos LITERAIS: transcritos da spec,
 * não reescritos. Qualquer alteração aqui é alteração de contrato de produto e
 * passa pela spec primeiro.
 *
 * Princípio: linguagem sempre hedged. O produto nunca emite veredito
 * diagnóstico — só sinalização. A interpretação e a decisão são humanas.
 */

import type { CategoriaRisco } from "./prazos";

/** Título do alerta na lista da fila (§6.1). */
export const TITULO_ALERTA =
  "Sinal identificado no relato requer revisão prioritária";

/** Categoria de risco em forma legível, para interpolação no corpo do alerta. */
export const CATEGORIA_LEGIVEL: Record<CategoriaRisco, string> = {
  ideacao_suicida: "menção a ideação suicida",
  autolesao: "relato de autolesão",
  violencia_sofrida: "relato de violência sofrida",
  violencia_praticada: "relato de violência praticada",
  risco_a_terceiro: "menção a risco a terceiro",
};

/** Corpo do alerta, visível ao abrir o detalhe (§6.1). */
export function corpoAlerta(categoriaLegivel: string): string {
  return `O relato de sessão contém um trecho que corresponde a um padrão de ${categoriaLegivel}. Esta sinalização é gerada automaticamente a partir de padrões no texto e não constitui avaliação clínica de risco — cabe a você revisar o trecho abaixo e decidir a conduta apropriada.`;
}

/**
 * Texto curto da notificação push/e-mail (§6.2).
 *
 * Deliberadamente SEM categoria de risco e SEM NOME DE PACIENTE (H3, §10): o
 * nome de alguém em atendimento clínico é, ele próprio, dado sensível de saúde
 * por associação — a existência do vínculo terapêutico é o dado — e a tela de
 * bloqueio do celular vaza para qualquer terceiro que olhe. Categoria e
 * identificação aparecem só dentro do app, após autenticação. A urgência é
 * carregada pelo CANAL, não pelo texto.
 */
export const TEXTO_PUSH =
  "Iris: sinal prioritário requer revisão imediata. Abrir agora.";

/**
 * Copy específica de `violencia_sofrida` em paciente MENOR DE IDADE (§5.2).
 * É a única exceção à copy hedged padrão — e ainda assim não afirma que houve
 * violência: informa uma obrigação legal que já existe e devolve a avaliação à
 * equipe.
 */
export const AVISO_ECA_MENOR =
  "Sinalização de risco: suspeita/registro de violência contra menor. Este registro contém elementos que indicam possível violência ou maus-tratos contra criança/adolescente. Lembramos que, nos termos do art. 13 do ECA e da Lei 13.431/2017, a comunicação ao Conselho Tutelar / autoridade competente é dever legal do profissional e do estabelecimento de saúde. A avaliação clínica e a tomada de providências cabem exclusivamente à equipe responsável.";

/**
 * Copy de `violencia_sofrida` quando a data de nascimento do paciente não está
 * cadastrada: não dá para afirmar que é menor, então o aviso é condicional.
 */
export const AVISO_ECA_IDADE_DESCONHECIDA =
  "Data de nascimento não cadastrada. Se o paciente for menor de idade, aplica-se o art. 13 do ECA e a Lei 13.431/2017 — a comunicação ao Conselho Tutelar / autoridade competente é dever legal do profissional e do estabelecimento de saúde.";

/**
 * Anos completos a partir da data de nascimento (ISO `YYYY-MM-DD`).
 *
 * Devolve `null` quando não há nascimento cadastrado: desconhecido NÃO é o
 * mesmo que maior de idade, e tratar ausência como "adulto" suprimiria o aviso
 * do ECA justamente no caso em que não se sabe.
 */
export function ehMenorDeIdade(
  nascimento: string | null | undefined,
  agora: Date,
): boolean | null {
  if (!nascimento) return null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimento);
  if (!partes) return null;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  let anosCompletos = agora.getFullYear() - ano;
  const mesAtual = agora.getMonth() + 1;
  const diaAtual = agora.getDate();
  // Ainda não fez aniversário neste ano → um ano completo a menos.
  if (mesAtual < mes || (mesAtual === mes && diaAtual < dia)) {
    anosCompletos -= 1;
  }
  return anosCompletos < 18;
}

/** Aviso legal aplicável, ou `null` quando não há nenhum (§5.2). */
export function avisoLegal(
  categoria: CategoriaRisco,
  nascimento: string | null | undefined,
  agora: Date,
): string | null {
  if (categoria !== "violencia_sofrida") return null;
  const menor = ehMenorDeIdade(nascimento, agora);
  if (menor === true) return AVISO_ECA_MENOR;
  if (menor === null) return AVISO_ECA_IDADE_DESCONHECIDA;
  return null;
}

/**
 * Lista negativa da §6.1: formulações proibidas, documentadas aqui para servir
 * de base de teste. O produto nunca emite veredito diagnóstico — só
 * sinalização; qualquer formulação que atribua ao sistema um veredito está
 * fora, mesmo que não conste literalmente desta lista.
 */
export const LISTA_NEGATIVA_COPY: string[] = [
  "A IA detectou risco de suicídio.",
  "Paciente em risco de",
  "Alerta de suicídio.",
  "Confirmado:",
];
