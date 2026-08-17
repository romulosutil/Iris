/**
 * Vigência de consentimento — ESPELHO em TypeScript das funções SQL
 * `app_prontuario_somente_leitura` e `app_finalidade_consentida`.
 *
 * ⚠️ ESTE MÓDULO NÃO É A FRONTEIRA DE AUTORIZAÇÃO. A fronteira é a RLS
 * (policies de INSERT/UPDATE/DELETE que chamam as funções SECURITY DEFINER) e
 * os guards internos das funções definer. O que existe aqui serve só para
 * ANTECIPAR a decisão do banco e devolver ao operador uma mensagem legível em
 * vez de um erro de constraint. Se este arquivo divergir do SQL, o banco vence
 * — e o sintoma será uma mensagem feia, nunca um dado gravado indevidamente.
 * Nunca usar como única verificação antes de uma escrita.
 *
 * Funções puras, sem acesso a banco: recebem as linhas de `consent` já lidas.
 */

/** Subconjunto de `consent` de que estas funções precisam. */
export type LinhaConsent = {
  id: string;
  tipo: string;
  assinadoEm: Date;
  consentRevogadoId?: string | null;
};

/**
 * Tipos de REGIME sob representação: alguém assina PELO titular. A existência
 * histórica de um deles é o que torna o prontuário travável — é o caso em que
 * a base legal do tratamento dependia inteiramente do representante.
 */
const TIPOS_REGIME_REPRESENTADO = [
  "tratamento_dados_menor",
  "representacao_curador",
] as const;

/** Tipos de REGIME por autoconsentimento: o próprio titular assina. */
const TIPOS_AUTOCONSENTIMENTO = [
  "autoconsentimento_titular_adulto",
  "autoconsentimento_titular_emancipado",
] as const;

/**
 * Os 4 tipos que constituem REGIME de admissão (base legal para existir
 * prontuário). Os tipos de finalidade NÃO entram aqui: consentir uso de IA não
 * é base para tratar o paciente.
 */
const TIPOS_REGIME = [
  ...TIPOS_REGIME_REPRESENTADO,
  ...TIPOS_AUTOCONSENTIMENTO,
] as const;

/** Tipos de FINALIDADE específica, concedidos/revogados independentemente. */
const TIPOS_FINALIDADE = [
  "uso_ia_processamento",
  "exportacao_relatorios",
] as const;

type TipoFinalidade = (typeof TIPOS_FINALIDADE)[number];

/** `true` se alguma linha de revogação aponta para `id`. */
function foiRevogada(linhas: readonly LinhaConsent[], id: string): boolean {
  return linhas.some(
    (r) => r.tipo === "revogacao_consentimento" && r.consentRevogadoId === id,
  );
}

/**
 * Ordena por `assinadoEm DESC, id DESC` — espelha o `ORDER BY` do SQL.
 *
 * O desempate por `id` é OBRIGATÓRIO, não cosmético: `assinadoEm` usa
 * `defaultNow()`, e `now()` é fixo pela duração da transação. Duas linhas
 * inseridas na mesma transação nascem com timestamp IDÊNTICO, e sem o segundo
 * critério "a última" seria indefinida — o TS e o SQL poderiam escolher linhas
 * diferentes e divergir sobre o que está vigente.
 */
function maisRecentePrimeiro(a: LinhaConsent, b: LinhaConsent): number {
  const delta = b.assinadoEm.getTime() - a.assinadoEm.getTime();
  if (delta !== 0) return delta;
  return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

/**
 * Última linha do `tipo` pedido que não tenha revogação apontando para ela, ou
 * `null`. "Última" = maior (`assinadoEm`, `id`) — ver `maisRecentePrimeiro`.
 *
 * Só a ÚLTIMA linha do tipo é candidata (espelha o `LIMIT 1` do SQL): se a
 * mais recente foi revogada, uma concessão antiga do mesmo tipo NÃO ressuscita
 * — reconsentir exige linha nova.
 */
function consentimentoVigentePorTipo(
  linhas: readonly LinhaConsent[],
  tipo: string,
): LinhaConsent | null {
  const doTipo = linhas.filter((c) => c.tipo === tipo);
  if (doTipo.length === 0) return null;
  const ultima = [...doTipo].sort(maisRecentePrimeiro)[0]!;
  return foiRevogada(linhas, ultima.id) ? null : ultima;
}

/** Existe alguma concessão de REGIME vigente (qualquer um dos 4 tipos)? */
export function regimeVigente(
  linhas: readonly LinhaConsent[],
): LinhaConsent | null {
  for (const tipo of TIPOS_REGIME) {
    const vigente = consentimentoVigentePorTipo(linhas, tipo);
    if (vigente) return vigente;
  }
  return null;
}

/**
 * Espelha `app_prontuario_somente_leitura`: `true` sse
 *   (a) existe alguma concessão HISTÓRICA de regime representado
 *       (`tratamento_dados_menor` ou `representacao_curador`), revogada ou não;
 *   E
 *   (b) NÃO existe NENHUMA concessão de regime VIGENTE, de nenhum dos 4 tipos.
 *
 * O (a) é o que faz o adulto que revoga o próprio autoconsentimento, sem
 * histórico de representação, NÃO travar o prontuário: §13 do termo mantém o
 * registro clínico do adulto. O (b) é o que torna a trava REVERSÍVEL — a
 * família reassinar, ou o paciente completar 18 e autoconsentir, destrava.
 *
 * ATENÇÃO ao (b): usa `regimeVigente` sobre os 4 tipos, e não o teste "a linha
 * de regime representado foi revogada". São diferentes, e a diferença é
 * exatamente o fluxo da #135 (menor revogado → paciente faz 18 e autoconsente).
 */
function prontuarioSomenteLeitura(linhas: readonly LinhaConsent[]): boolean {
  const houveRepresentacao = linhas.some((c) =>
    (TIPOS_REGIME_REPRESENTADO as readonly string[]).includes(c.tipo),
  );
  if (!houveRepresentacao) return false;
  return regimeVigente(linhas) === null;
}

/**
 * Espelha `app_finalidade_consentida`: a última linha da finalidade existe e
 * não foi revogada. Finalidade é independente do regime — revogar o uso de IA
 * não trava o prontuário, só cessa aquela finalidade.
 */
function finalidadeConsentida(
  linhas: readonly LinhaConsent[],
  finalidade: TipoFinalidade,
): boolean {
  return consentimentoVigentePorTipo(linhas, finalidade) !== null;
}
