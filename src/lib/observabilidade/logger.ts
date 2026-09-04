import { redigirContexto } from "./redacao";

/**
 * Núcleo do logger estruturado (#560, achado `DA-04` — fatia F1).
 *
 * A auditoria mediu 144 `console.*` fora de teste, sem prefixo consistente,
 * sem JSON e sem id de correlação. Este módulo é o caminho único de saída de
 * log da aplicação a partir de agora.
 *
 * ## Três invariantes
 *
 * 1. **Um caminho só.** `logarErroSemPII` e `logarAvisoSemPII` (#546) viraram
 *    fachadas finas sobre `registrar`. Dois caminhos de log é como se perde a
 *    garantia de redaction que a #546 comprou — o segundo sempre esquece.
 * 2. **Todo registro é JSON e tem `requestId`.** Não existe registro sem id
 *    de correlação: sem escopo ativo cai no id do processo
 *    (`proc-xxxxxxxx`), nunca em `undefined`. Um log sem correlação não
 *    responde "o que mais aconteceu nesta request".
 * 3. **Redaction por chave antes do sink.** {@link redigirContexto} roda
 *    aqui, no núcleo, e não no transporte. Se o sink do `pino` não estiver
 *    instalado (edge, browser, imagem de job sem a dependência), a garantia
 *    não some junto — só o transporte degrada.
 *
 * ## Por que o `pino` entra por um sink registrável, e não por `import`
 *
 * `logar-erro.ts` é importado por três componentes `"use client"`
 * (`popover-alocar.tsx`, `exportacao-view.tsx`, `timeline-client.tsx`), e o
 * `proxy.ts` roda no runtime edge. Um `import` estático de `pino` na cadeia
 * da fachada colocaria o pacote no bundle do cliente e no do edge. O sink é
 * instalado em `instrumentation.ts`, só sob `NEXT_RUNTIME === "nodejs"` —
 * ver `logger-node.ts`.
 *
 * **Risco de deploy registrado (F3):** a imagem dos jobs internos não herda
 * as dependências do app. Se um job passar a instalar este sink, `pino` vira
 * requisito do Dockerfile daquele serviço. Aqui a ausência é benigna (cai no
 * `console` com o mesmo JSON e a mesma redaction) e **ruidosa** — ver
 * `instalarSink`, que não engole falha de import.
 */

export type NivelLog = "debug" | "info" | "warn" | "error";

/** Um registro já pronto, redigido, na forma em que sai. */
export type RegistroLog = {
  nivel: NivelLog;
  /** Nome do evento — conjunto fechado e estável, nunca frase interpolada. */
  evento: string;
  /** Id de correlação da request. Sempre presente. */
  requestId: string;
  hora: string;
  [chave: string]: unknown;
};

export type ContextoLog = Record<string, unknown>;

export type SinkLog = (registro: RegistroLog) => void;

// ─── id de correlação ────────────────────────────────────────────────────────

/**
 * Nome do cabeçalho que carrega o id entre o proxy e o resto. `x-request-id`
 * é o de facto de proxies reversos (nginx, Traefik) — se o Easypanel já
 * injetar um, {@link normalizarRequestId} o adota em vez de gerar outro.
 */
export const CABECALHO_REQUEST_ID = "x-request-id";

/**
 * Id curto por chamada — o que o usuário vê ("código X") e o operador procura
 * no log.
 *
 * Mora aqui, e não em `logar-erro.ts`, porque a correlação é assunto do
 * logger e `logar-erro.ts` virou fachada sobre este módulo; deixá-lo lá
 * fecharia um ciclo de import. `logar-erro.ts` reexporta o nome, então a
 * assinatura pública que os 49 sítios enxergam não mudou.
 *
 * Sem `node:crypto` de propósito: roda também no edge e no browser.
 */
export function gerarCorrelacaoId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

/** Id estável do processo, usado quando não há request (job, boot, script). */
const ID_PROCESSO = `proc-${gerarCorrelacaoId()}`;

/**
 * Aceita um id vindo de fora só se for curto e alfanumérico. Um cabeçalho é
 * entrada de terceiro: sem esta poda, um cliente escolheria o que aparece em
 * toda linha de log (injeção de quebra de linha, campo gigante).
 */
export function normalizarRequestId(bruto: string | null | undefined): string {
  if (typeof bruto !== "string") return gerarCorrelacaoId();
  const limpo = bruto.trim().replace(/[^A-Za-z0-9._-]/g, "");
  if (limpo.length < 4 || limpo.length > 64) return gerarCorrelacaoId();
  return limpo;
}

/**
 * Resolvedor do id da request em curso. Instalado por `logger-node.ts` com
 * `AsyncLocalStorage`; ausente no edge e no browser, onde não há escopo
 * assíncrono a propagar.
 */
let resolvedorRequestId: (() => string | undefined) | null = null;

export function instalarResolvedorRequestId(
  resolvedor: (() => string | undefined) | null,
): void {
  resolvedorRequestId = resolvedor;
}

/** Nunca devolve vazio: sem escopo ativo, o id do processo. */
export function requestIdAtual(): string {
  return resolvedorRequestId?.() ?? ID_PROCESSO;
}

// ─── sink ────────────────────────────────────────────────────────────────────

/**
 * Sink padrão: uma linha de JSON por registro no `console`. É o que roda no
 * edge, no browser, nos testes e em qualquer imagem sem `pino`. O formato é o
 * mesmo do `pino` no essencial (uma linha, JSON, `nivel`/`evento`/`requestId`),
 * então o mesmo `grep` serve.
 */
/**
 * `JSON.stringify` nativo lança `TypeError` em `bigint`. O schema tem colunas
 * `bigint` (`acervo.bytes_tamanho`, entre outras) e o driver as devolve como
 * `bigint` — um erro de banco que carregue esse valor no contexto derrubaria
 * o processo *pelo log*. O sink é a última linha antes da saída: nada aqui
 * pode lançar.
 */
export function substituirNaoSerializavel(
  _chave: string,
  valor: unknown,
): unknown {
  return typeof valor === "bigint" ? valor.toString() : valor;
}

export const sinkConsole: SinkLog = (registro) => {
  const linha = JSON.stringify(registro, substituirNaoSerializavel);
  if (registro.nivel === "error") console.error(linha);
  else if (registro.nivel === "warn") console.warn(linha);
  else if (registro.nivel === "debug") console.debug(linha);
  else console.info(linha);
};

let sinkAtivo: SinkLog = sinkConsole;

export function instalarSink(sink: SinkLog | null): void {
  sinkAtivo = sink ?? sinkConsole;
}

/** Só para teste: devolve o sink ao padrão. */
export function restaurarSinkPadrao(): void {
  sinkAtivo = sinkConsole;
}

// ─── emissão ─────────────────────────────────────────────────────────────────

const ORDEM: Record<NivelLog, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let nivelMinimoCache: NivelLog | null = null;

/**
 * Memoizado na **primeira chamada**, não no import: `registrar` roda em todo
 * evento e `process.env` no Node atravessa binding C++ a cada leitura. Ler no
 * topo do módulo é o erro conhecido do repo (env avaliada antes de o runtime
 * montar o ambiente passa local e falha no CI), então a leitura fica no
 * primeiro uso. Trocar `LOG_LEVEL` em runtime não tem efeito — em teste, usar
 * {@link recarregarNivelMinimo}.
 */
function nivelMinimo(): NivelLog {
  return (nivelMinimoCache ??= lerNivelMinimo());
}

/** Só para teste: descarta o nível memoizado para reler `LOG_LEVEL`. */
export function recarregarNivelMinimo(): void {
  nivelMinimoCache = null;
}

function lerNivelMinimo(): NivelLog {
  const bruto = process.env.LOG_LEVEL?.toLowerCase();
  if (
    bruto === "debug" ||
    bruto === "info" ||
    bruto === "warn" ||
    bruto === "error"
  ) {
    return bruto;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Monta o registro e entrega ao sink. Devolve o `requestId` para o chamador
 * poder mostrá-lo ao usuário ("código X") e o operador procurá-lo no log.
 *
 * `contexto` passa por {@link redigirContexto} sempre — inclusive o que vier
 * de `as any`. A fronteira é de runtime, não de tipo.
 */
export function registrar(
  nivel: NivelLog,
  evento: string,
  contexto?: ContextoLog,
): string {
  const requestId = requestIdAtual();
  if (ORDEM[nivel] < ORDEM[nivelMinimo()]) return requestId;

  const redigido = (contexto ? redigirContexto(contexto) : {}) as ContextoLog;
  sinkAtivo({
    ...redigido,
    nivel,
    evento,
    requestId,
    hora: new Date().toISOString(),
  });
  return requestId;
}

/** Fachada de conveniência — a forma que os sítios migrados (F2–F4) usam. */
export const logger = {
  debug: (evento: string, contexto?: ContextoLog) =>
    registrar("debug", evento, contexto),
  info: (evento: string, contexto?: ContextoLog) =>
    registrar("info", evento, contexto),
  warn: (evento: string, contexto?: ContextoLog) =>
    registrar("warn", evento, contexto),
  error: (evento: string, contexto?: ContextoLog) =>
    registrar("error", evento, contexto),
};
