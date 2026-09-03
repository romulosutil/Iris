/**
 * Redaction por chave do logger estruturado (#560, achado `DA-04`).
 *
 * A #546 (S-03) fechou a metade "perigoso" do achado provando UMA coisa: o
 * caminho do erro nunca carrega `message`/`stack`/`params`. Ela não cobre o
 * **contexto** que o chamador anexa ao registro — e é por ali que a nota
 * clínica entra num log estruturado ("é só um campo a mais pra debugar").
 *
 * Este módulo é a fronteira: nenhuma chave classificada como PII/PHI sai do
 * logger com valor, em nenhum nível, em nenhuma profundidade. A garantia é
 * por **chave**, não por inspeção de valor — inspecionar valor é heurística e
 * falha em silêncio; recusar a chave é decidível.
 *
 * ## De onde a lista saiu
 *
 * Três fontes, todas do próprio repositório — nada foi inventado:
 *
 * 1. **`src/db/schema.ts`** — colunas de texto livre e identificadores
 *    diretos das 25 entidades (`nome`, `cpf`, `cpf_hash`, `email`,
 *    `nascimento`, `endereco_*`, `observacoes`, `descricao`, `justificativa`,
 *    `transcricao_texto`, `instrumento_item_texto`, `resposta_texto`,
 *    `motivo_descarte`, `diagnostico`, `responsavel_contato`, `*_token`).
 * 2. **`docs/agente/output-schema.json`** — a saída do agente de extração, que
 *    é PHI por construção (`trecho_fonte`, `producao_literal`,
 *    `resumo_sessao`, `contexto`, `antecedente`, `comportamento`,
 *    `evidencia`, `justificativa_confianca`). É o que a issue nomeia como
 *    `texto` e `trecho_fonte`.
 * 3. **`logar-erro.ts` / `sentry-sem-pii.ts` (#546)** — `message`, `stack` e
 *    `params` já eram proibidos no caminho do erro; passam a ser proibidos
 *    também no contexto, porque `DrizzleQueryError.message` é o SQL + os
 *    VALORES vinculados, não a exceção do Postgres.
 *
 * ## O que NÃO entra na lista, de propósito
 *
 * - `tokens_entrada` / `tokens_saida` — contadores de billing do provider
 *   (#555, W7). São a primeira métrica real do sistema; redigi-los mataria o
 *   F5. Por isso a família de credencial casa por **sufixo** `token`
 *   (`access_token`, `refresh_token`, `id_token`) e não por substring.
 * - `id`, `clinic_id`, `patient_id`, códigos de conjunto fechado, contagens —
 *   identificadores opacos são o que torna o log útil.
 */

/** O que substitui o valor. Mesma palavra usada por `semParams` (#546). */
export const VALOR_REDIGIDO = "[redigido]";

/**
 * Normaliza a chave para comparar `snake_case`, `camelCase` e `kebab-case`
 * com uma lista só: `trecho_fonte`, `trechoFonte` e `trecho-fonte` viram
 * `trechofonte`. Sem isso a lista precisaria de três entradas por campo e a
 * que faltasse vazaria em silêncio.
 */
export function normalizarChave(chave: string): string {
  return chave.toLowerCase().replace(/[-_\s]/g, "");
}

/**
 * Chaves proibidas, na forma normalizada. Cada entrada tem origem declarada
 * no bloco acima — não adicionar nada aqui sem uma coluna, um campo do
 * schema do agente ou um achado que a justifique.
 */
export const CHAVES_PII: readonly string[] = [
  // — identificadores diretos (schema.ts) —
  "nome",
  "cpf",
  "email",
  "nascimento",
  "telefone",
  "celular",
  "responsavelcontato",
  // — texto livre clínico (schema.ts) —
  "texto",
  "observacoes",
  "descricao",
  "justificativa",
  "motivo",
  "motivodescarte",
  "diagnostico",
  "queixa",
  // — saída do agente de extração (output-schema.json): PHI por construção —
  "trechofonte",
  "producaoliteral",
  "resumosessao",
  "contexto",
  "antecedente",
  "comportamento",
  "evidencia",
  "justificativaconfianca",
  // — herdadas da #546: o caminho do erro já as proibia —
  "message",
  "mensagem",
  "stack",
  "params",
];

const CONJUNTO_PII = new Set(CHAVES_PII);

/**
 * Famílias que não cabem numa lista fechada porque o schema cresce.
 * Deliberadamente conservadoras: preferem redigir demais a deixar passar.
 */
const PADROES_PII: readonly ((normalizada: string) => boolean)[] = [
  // `cpf`, `cpfcnpj`, `cpfhash`, `responsavelcpf`.
  (k) => k.includes("cpf"),
  // `senha`, `senhaatual`, `password`, `clientsecret`, `apikey`.
  (k) =>
    k.includes("senha") ||
    k.includes("password") ||
    k.includes("secret") ||
    k.includes("apikey"),
  // `accesstoken`, `refreshtoken`, `idtoken`, `tokenhash` — mas NÃO
  // `tokensentrada`/`tokenssaida`, que são métrica (#555).
  (k) => k.endsWith("token") || k.endsWith("tokenhash"),
  // `instrumentoitemtexto`, `respostatexto`, `transcricaotexto`.
  (k) => k.endsWith("texto"),
  // `enderecologradouro`, `enderecocep`, …
  (k) => k.startsWith("endereco"),
];

/** Verdadeiro quando a chave não pode sair do logger com valor. */
export function chaveEhPII(chave: string): boolean {
  const normalizada = normalizarChave(chave);
  if (CONJUNTO_PII.has(normalizada)) return true;
  return PADROES_PII.some((casa) => casa(normalizada));
}

const PROFUNDIDADE_MAXIMA = 8;

/**
 * Aplica a redaction em profundidade sobre o contexto do registro.
 *
 * Regras:
 * - chave proibida → valor vira `[redigido]`, independente do tipo (um objeto
 *   inteiro sob `paciente.nome` não é percorrido, é substituído);
 * - objeto simples e array são percorridos;
 * - instância de classe (um `Error`, um `Date`, o objeto do driver) NÃO é
 *   percorrida — vira o nome da classe. Percorrer um `Error` reabriria o
 *   caminho para `message`/`stack` por uma chave que não está na lista;
 * - acima de {@link PROFUNDIDADE_MAXIMA} corta, para não seguir ciclo.
 */
export function redigirContexto(valor: unknown, profundidade = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor !== "object") return valor;
  if (profundidade > PROFUNDIDADE_MAXIMA) return "[profundo]";

  if (Array.isArray(valor)) {
    return valor.map((v) => redigirContexto(v, profundidade + 1));
  }

  const prototipo = Object.getPrototypeOf(valor) as object | null;
  if (prototipo !== Object.prototype && prototipo !== null) {
    // Nunca serializa instância: `Error`, `DrizzleQueryError`, `Date`, o erro
    // do driver. Só a classe, que é categoria fechada.
    return `[${(valor as object).constructor?.name ?? "objeto"}]`;
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = chaveEhPII(chave)
      ? VALOR_REDIGIDO
      : redigirContexto(v, profundidade + 1);
  }
  return saida;
}

/**
 * Os mesmos nomes na sintaxe de `redact.paths` do `pino`, para o sink de
 * produção redigir no próprio serializador. O `pino` casa caminho literal,
 * então a lista aqui é a das chaves exatas — a varredura em profundidade de
 * {@link redigirContexto} continua sendo aplicada antes, e é ela que carrega
 * a garantia. Isto é cinto e suspensório de propósito: se o sink mudar, a
 * redaction não some junto.
 */
export function caminhosPinoRedact(): string[] {
  const nomes = new Set<string>();
  for (const chave of CHAVES_PII) nomes.add(chave);
  // Formas que aparecem de fato no código, além da normalizada.
  for (const chave of [
    "trecho_fonte",
    "producao_literal",
    "resumo_sessao",
    "justificativa_confianca",
    "motivo_descarte",
    "responsavel_contato",
    "cpf_hash",
    "cpf_cnpj",
    "access_token",
    "refresh_token",
    "id_token",
    "transcricao_texto",
    "resposta_texto",
    "instrumento_item_texto",
  ]) {
    nomes.add(chave);
  }
  // `chave` cobre a raiz e `*.chave` cobre **um** nível abaixo dela — o
  // `pino` não tem curinga de profundidade arbitrária (`**` não existe na
  // sintaxe de `redact.paths`). Profundidade maior é coberta por
  // `redigirContexto`, que roda antes do sink e carrega a garantia; esta
  // lista é redundância de transporte, não a fronteira.
  return [...nomes].flatMap((n) => [n, `*.${n}`]);
}
