/**
 * Régua ÚNICA de nível de ajuda (#558 · G-6 (a)).
 *
 * `nivel_ajuda` é string LIVRE do agente, e a taxonomia é POR PROTOCOLO
 * (`protocol.taxonomia_ajuda`) — não existe enum global. A conversão a ordinal
 * é `taxonomia.indexOf(nivel)`, e `indexOf` devolve `-1` para nível que a
 * régua do protocolo não conhece.
 *
 * O ponto da regra: **`-1` nunca vira `0`**. `0` é o primeiro item da
 * taxonomia — tipicamente "independente", o MELHOR resultado possível. Deixar
 * o `-1` cair em `0` transformaria "o agente escreveu um nível que este
 * protocolo não usa" em "o paciente fez sozinho": progresso inventado por
 * dedução.
 *
 * `naoClassificado` diz POR QUE não há ordinal, e por isso as duas ausências
 * não se confundem:
 *
 * - nível ausente (`null`/vazio)  → `{ ordinal: null, naoClassificado: false }`
 *   — não havia o que classificar; nada a exibir.
 * - nível declarado e desconhecido → `{ ordinal: null, naoClassificado: true }`
 *   — havia um nível e a régua não soube lê-lo; isto é **contado e exibido**
 *   (na contagem `naoClassificados` do espectro e no bloco de rotinas),
 *   em vez de sumir junto com o caso acima.
 *
 * Mora em `lib/` porque tem DOIS consumidores que precisam concordar: a
 * materialização do snapshot (`materializar.ts`) e a leitura do bloco de
 * rotinas da aba Evolução (#558 · T5). Duplicar o `indexOf` nos dois lados
 * seria a porta pela qual a régua se separa do que a tela afirma.
 */
export interface ClassificacaoNivelAjuda {
  /** Índice na `taxonomia_ajuda` do protocolo; `null` quando não classifica. */
  ordinal: number | null;
  /** `true` só quando havia nível declarado e a taxonomia não o conhece. */
  naoClassificado: boolean;
}

export function classificarNivelAjuda(
  protocolId: string | null,
  nivelAjuda: string | null,
  taxonomia: readonly string[],
): ClassificacaoNivelAjuda {
  if (!nivelAjuda) return { ordinal: null, naoClassificado: false };
  // Sem protocolo resolvido não existe régua: o nível declarado continua sendo
  // um nível que ninguém classificou — e é assim que ele deve aparecer.
  if (!protocolId) return { ordinal: null, naoClassificado: true };
  const idx = taxonomia.indexOf(nivelAjuda);
  if (idx >= 0) return { ordinal: idx, naoClassificado: false };
  return { ordinal: null, naoClassificado: true };
}
