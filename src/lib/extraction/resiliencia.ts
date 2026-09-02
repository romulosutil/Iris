/**
 * A-03 (#535, auditoria 360): timeout explícito + 1 retry para a chamada ao
 * modelo de extração.
 *
 * Antes, `consolidarSessaoCore` chamava `provider.extrair()` inline sem
 * limite: uma requisição pendurada no Gemini segurava a action (e o
 * terapeuta) indefinidamente, e uma falha transitória (503 "overloaded",
 * socket resetado) virava `pendente_reprocessamento` na primeira tentativa,
 * que só saía dali por clique humano.
 *
 * Política, fechada no Design da issue (não reabrir aqui):
 *  - timeout de 45 s por tentativa, com `AbortSignal` repassado ao SDK para
 *    a requisição HTTP ser cancelada de verdade (não só a promessa abandonada);
 *  - UM retry, após 2 s, SÓ para erro transitório: timeout, rede ou 5xx;
 *  - 4xx NUNCA re-tenta (400 schema, 401/403 chave, 404 modelo aposentado,
 *    429 cota): é erro nosso ou de configuração — repetir dobra custo e
 *    latência sem mudar o resultado;
 *  - qualquer outro erro (saída fora do schema, modo desconhecido) também não.
 */

export const EXTRACAO_TIMEOUT_MS = 45_000;
export const EXTRACAO_RETRY_BACKOFF_MS = 2_000;
/** Tentativas no total (1 chamada + 1 retry). */
export const EXTRACAO_MAX_TENTATIVAS = 2;

export class ExtracaoTimeoutError extends Error {
  override readonly name = "EXTRACAO_TIMEOUT";
  readonly code = "EXTRACAO_TIMEOUT";
  constructor(readonly timeoutMs: number) {
    super(`Extração excedeu ${timeoutMs} ms sem resposta do modelo.`);
  }
}

const CODIGOS_DE_REDE = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

type ErroComCampos = {
  status?: unknown;
  code?: unknown;
  cause?: unknown;
  message?: unknown;
};

/** Status HTTP do erro: `status` numérico do SDK (`ApiError` do @google/genai)
 * ou, na falta dele, o `"code": NNN` que o Gemini embute na message. */
export function statusHttpDoErro(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as ErroComCampos;
  if (typeof e.status === "number" && e.status >= 100 && e.status <= 599) {
    return e.status;
  }
  if (typeof e.message === "string") {
    const m = /"code"\s*:\s*(\d{3})\b/.exec(e.message);
    if (m) return Number(m[1]);
  }
  return null;
}

function ehErroDeRede(err: unknown, profundidade = 0): boolean {
  if (!err || typeof err !== "object" || profundidade > 3) return false;
  const e = err as ErroComCampos;
  if (typeof e.code === "string" && CODIGOS_DE_REDE.has(e.code)) return true;
  if (
    err instanceof TypeError &&
    typeof e.message === "string" &&
    /fetch failed|network/i.test(e.message)
  ) {
    return true;
  }
  return ehErroDeRede(e.cause, profundidade + 1);
}

/** Transitório = vale UM retry: timeout nosso, 5xx do provedor ou falha de
 * rede. 4xx e qualquer erro sem forma reconhecida NÃO são transitórios. */
export function erroEhTransitorio(err: unknown): boolean {
  if (err instanceof ExtracaoTimeoutError) return true;
  const status = statusHttpDoErro(err);
  if (status !== null) return status >= 500;
  return ehErroDeRede(err);
}

function comTimeout<T>(
  tentar: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controle = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controle.abort();
      reject(new ExtracaoTimeoutError(timeoutMs));
    }, timeoutMs);
    tentar(controle.signal).then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (erro: unknown) => {
        clearTimeout(timer);
        reject(erro);
      },
    );
  });
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type ResultadoResiliente<T> = {
  resultado: T;
  /** Tempo de parede TOTAL: todas as tentativas + backoff. É o que o
   * terapeuta esperou — é isso que `extraction.latencia_ms` guarda. */
  latenciaMs: number;
  tentativas: number;
};

export async function invocarComResiliencia<T>(
  tentar: (signal: AbortSignal) => Promise<T>,
  opcoes: {
    timeoutMs?: number;
    backoffMs?: number;
    maxTentativas?: number;
  } = {},
): Promise<ResultadoResiliente<T>> {
  const timeoutMs = opcoes.timeoutMs ?? EXTRACAO_TIMEOUT_MS;
  const backoffMs = opcoes.backoffMs ?? EXTRACAO_RETRY_BACKOFF_MS;
  const maxTentativas = opcoes.maxTentativas ?? EXTRACAO_MAX_TENTATIVAS;
  const inicio = Date.now();
  let tentativas = 0;
  for (;;) {
    tentativas += 1;
    try {
      const resultado = await comTimeout(tentar, timeoutMs);
      return { resultado, latenciaMs: Date.now() - inicio, tentativas };
    } catch (err) {
      if (tentativas >= maxTentativas || !erroEhTransitorio(err)) throw err;
      await esperar(backoffMs);
    }
  }
}
