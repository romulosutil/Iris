/**
 * Chave de agrupamento de tema (#645, G-3) — módulo PURO, sem DB.
 *
 * `temas[]` é texto livre do agente (`agent-output-schema.ts`, modo
 * convencional): "luto do pai" numa sessão e "luto pelo pai" na seguinte são o
 * MESMO tema clínico, e sem uma regra de identidade o `historico_relevante`
 * vira uma lista de variações da mesma coisa — que é justamente o ruído que o
 * R14 não consegue usar.
 *
 * A regra é determinística e barata de propósito: nada de IA, nada de
 * similaridade difusa. Um agrupamento que muda de resposta entre duas execuções
 * iguais faria o prompt de extração mudar sem que nada no prontuário mudasse.
 *
 * O texto CRU do agente é preservado ao lado da chave na tabela (`session_tema.tema`):
 * a chave só agrupa, quem a pessoa lê na tela é o texto original.
 */

/**
 * Conectivos removidos antes de comparar. Lista FECHADA e curta: só palavras
 * gramaticais que ligam, nunca palavra que carregue conteúdo clínico. Deixar
 * "sem" e "não" DE FORA desta lista é deliberado — "medo de dirigir" e "medo
 * sem dirigir" não são o mesmo tema, e negação nunca pode virar ruído
 * descartável.
 *
 * Todas as entradas são escritas SEM acento: a lista é consultada depois da
 * remoção de diacrítico, então "à" aqui nunca casaria com nada ("à" já chegou
 * como "a").
 */
const CONECTIVOS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "pela",
  "pelas",
  "pelo",
  "pelos",
  "por",
  "um",
  "uma",
]);

/**
 * Chave canônica de um tema. Pipeline, nesta ordem:
 *
 * 1. minúsculas;
 * 2. decomposição NFD + remoção de diacrítico ("luto" == "lúto" de um typo);
 * 3. tudo que não é letra/dígito vira espaço (pontuação, hífen, emoji);
 * 4. conectivos fora;
 * 5. tokens ÚNICOS, ordenados alfabeticamente, unidos por espaço.
 *
 * A ordenação é o que casa "luto do pai" com "pai, luto" — a ordem em que o
 * modelo escreveu as palavras não é sinal clínico.
 *
 * Devolve `""` quando não sobra token (tema vazio, só pontuação, só conectivo).
 * O caller trata string vazia como "não é tema" e descarta — nunca grava linha
 * com chave vazia, que colapsaria temas distintos num balde só.
 */
export function normalizarTema(tema: string): string {
  const tokens = tema
    .toLowerCase()
    .normalize("NFD")
    // \p{Diacritic} cobre os acentos separados pelo NFD sem tocar em ç → c,
    // que o próprio NFD já resolve (ç = c + U+0327, e U+0327 é Diacritic).
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .split(" ")
    .filter((t) => t !== "" && !CONECTIVOS.has(t));
  return [...new Set(tokens)].sort().join(" ");
}

/**
 * Teto de temas gravados por sessão. O contrato não limita o tamanho de
 * `temas[]` (`agent-output-schema.ts`), e um modelo degenerado devolvendo
 * dezenas de rótulos encheria o prontuário e o prompt da próxima extração —
 * `historico_relevante` volta para DENTRO do prompt, então cada tema custa
 * token em toda chamada seguinte. 20 é folgado para uma sessão real (o
 * protocolo do modo convencional fala em poucos temas por sessão) e fecha a
 * porta do patológico.
 */
export const MAX_TEMAS_POR_SESSAO = 20;

/**
 * Prepara os `temas[]` crus do agente para gravação: descarta o que não vira
 * chave, deduplica POR CHAVE (primeira grafia vence — é a que o terapeuta
 * acabou de ler no texto) e corta no teto.
 *
 * Ordena por chave: a ordem em que o modelo listou não é sinal, e ordem
 * estável mantém o INSERT determinístico entre duas execuções iguais.
 */
export function deduplicarTemas(
  temas: readonly string[],
): Array<{ tema: string; temaChave: string }> {
  const porChave = new Map<string, string>();
  for (const bruto of temas) {
    const tema = bruto.trim();
    const temaChave = normalizarTema(tema);
    if (temaChave === "" || porChave.has(temaChave)) continue;
    porChave.set(temaChave, tema);
    if (porChave.size === MAX_TEMAS_POR_SESSAO) break;
  }
  return [...porChave.entries()]
    .map(([temaChave, tema]) => ({ tema, temaChave }))
    .sort((a, b) => a.temaChave.localeCompare(b.temaChave));
}
