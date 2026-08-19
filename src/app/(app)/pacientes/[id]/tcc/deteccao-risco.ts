/**
 * #391 — varredura determinística (por PALAVRA-CHAVE, não semântica/LLM) dos
 * campos de texto livre do RPD, em busca de sinais de risco.
 *
 * O RPD é preenchido diretamente pelo terapeuta e nunca passa pelo agente de
 * extração — não existe `alerta_risco` do LLM para ler aqui, diferente do
 * caminho do diário. A decisão de resolver isso com um scanner de
 * substring (case-insensitive, sem acento) é um JULGAMENTO DE ENGENHARIA
 * desta issue, não uma citação literal do doc normativo
 * (`docs/agente/regra-alerta-risco.md`) — ver
 * `.specs/features/391-alerta-risco-rpd-instrumento/spec.md`, seção
 * "Decisão de design: deteccao de risco no RPD (scope item 3)".
 *
 * Princípio (mesmo de R5-TC/R20): casamento por substring, não regex de
 * fronteira de palavra rigorosa — falso positivo é aceitável, falso negativo
 * não é. `certeza` do alerta criado por este scanner é SEMPRE
 * `ambiguo_citado` (nunca `explicito` — é deteccão textual bruta, não juízo
 * semântico de LLM ou de terapeuta). `severidade` usa o nível mais grave
 * dentro da categoria que casou, por ausência de contexto estruturado para
 * diferenciar (regra do empate, §1.3 do doc normativo).
 */

export type SinalRiscoRPDCategoria = "ideacao_suicida" | "autolesao";

export type SinalRiscoRPD = {
  categoria: SinalRiscoRPDCategoria;
  severidade: "ideacao_ativa_sem_plano" | "autolesao_recente";
  certeza: "ambiguo_citado";
  /** Trecho ORIGINAL (não normalizado) do campo do RPD onde o termo casou,
   * com contexto ao redor (máx. ~200 chars). Nunca vazio — a função
   * SECURITY DEFINER `app_criar_alerta_risco` rejeita `trecho_fonte` vazio. */
  trechoFonte: string;
  detalhe: string;
};

export type CamposRPDParaDeteccao = {
  situacao?: string | null;
  pensamentoAutomatico?: string | null;
  evidenciasFavor?: string | null;
  evidenciasContra?: string | null;
  respostaRacional?: string | null;
  comportamentoResultante?: string | null;
};

// Listas literais do spec #391 — não hardcoda instrumento nenhum, é varredura
// genérica de texto livre.
const TERMOS_IDEACAO_SUICIDA = [
  "suicid",
  "me matar",
  "tirar minha vida",
  "acabar com tudo",
  "nao aguento mais viver",
  "quero morrer",
  "sumir de vez",
];

const TERMOS_AUTOLESAO = [
  "automutil",
  "me cortar",
  "me machucar",
  "cortar meus",
  "queimar minha pele",
  "bater em mim mesm",
];

const CONTEXTO_MAX_CHARS = 200;
const CONTEXTO_MARGEM_CHARS = 90;

/** Normalização simples: minúsculo + remoção de diacríticos via NFD. */
const REGEX_MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(REGEX_MARCAS_DIACRITICAS, "")
    .toLowerCase();
}

type Achado = {
  /** Texto a partir do qual o trecho é extraído. É o campo ORIGINAL sempre
   * que a normalização preservar o comprimento em código UTF-16 (verdade
   * para acentuação padrão PT-BR — 1 caractere original decompõe em 1 base +
   * 1 marca combinante, que some ao remover). Se não preservar (caractere
   * fora do padrão), cai para a própria string normalizada — ainda um
   * trecho real do conteúdo, nunca uma string fixa/genérica. */
  fonte: string;
  index: number;
  termoLen: number;
};

function buscarTermo(
  camposEmOrdem: Array<string | null | undefined>,
  termos: string[],
): Achado | null {
  for (const campo of camposEmOrdem) {
    if (!campo) continue;
    const normalizado = normalizar(campo);
    for (const termo of termos) {
      const index = normalizado.indexOf(termo);
      if (index !== -1) {
        const fonte =
          campo.length === normalizado.length ? campo : normalizado;
        return { fonte, index, termoLen: termo.length };
      }
    }
  }
  return null;
}

function extrairTrecho(achado: Achado): string {
  const inicio = Math.max(0, achado.index - CONTEXTO_MARGEM_CHARS);
  const fim = Math.min(
    achado.fonte.length,
    achado.index + achado.termoLen + CONTEXTO_MARGEM_CHARS,
  );
  let trecho = achado.fonte.slice(inicio, fim).trim();
  if (trecho.length > CONTEXTO_MAX_CHARS) {
    trecho = trecho.slice(0, CONTEXTO_MAX_CHARS).trim();
  }
  return trecho;
}

/**
 * Varre os campos de texto livre do RPD em busca de termos associados a
 * ideação suicida e/ou autolesão. Retorna zero, um ou dois sinais — se as
 * duas categorias casarem (mesmo campo ou campos diferentes), os DOIS
 * entram, nunca só o "pior".
 */
export function detectarSinaisDeRiscoRPD(
  campos: CamposRPDParaDeteccao,
): SinalRiscoRPD[] {
  const camposEmOrdem: Array<string | null | undefined> = [
    campos.situacao,
    campos.pensamentoAutomatico,
    campos.evidenciasFavor,
    campos.evidenciasContra,
    campos.respostaRacional,
    campos.comportamentoResultante,
  ];

  const sinais: SinalRiscoRPD[] = [];

  const achadoIdeacao = buscarTermo(camposEmOrdem, TERMOS_IDEACAO_SUICIDA);
  if (achadoIdeacao) {
    sinais.push({
      categoria: "ideacao_suicida",
      severidade: "ideacao_ativa_sem_plano",
      certeza: "ambiguo_citado",
      trechoFonte: extrairTrecho(achadoIdeacao),
      detalhe:
        "Varredura determinística do RPD encontrou termo associado a ideação suicida.",
    });
  }

  const achadoAutolesao = buscarTermo(camposEmOrdem, TERMOS_AUTOLESAO);
  if (achadoAutolesao) {
    sinais.push({
      categoria: "autolesao",
      severidade: "autolesao_recente",
      certeza: "ambiguo_citado",
      trechoFonte: extrairTrecho(achadoAutolesao),
      detalhe:
        "Varredura determinística do RPD encontrou termo associado a autolesão.",
    });
  }

  return sinais;
}
