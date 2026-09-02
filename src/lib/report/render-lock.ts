const parsed = Number(process.env.RENDER_MAX_CONCURRENCY ?? "1");
const MAX = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;

const timeoutParsed = Number(process.env.RENDER_LOCK_TIMEOUT_MS ?? "20000");
/** Espera máxima na fila do semáforo (PF-02, #538). 0 desliga o teto. */
export const RENDER_LOCK_TIMEOUT_MS =
  Number.isFinite(timeoutParsed) && timeoutParsed >= 0
    ? Math.floor(timeoutParsed)
    : 20_000;

/**
 * Fila cheia por mais tempo que o teto: o caller devolve 503 + Retry-After
 * (ou a copy de `message` na UI) em vez de segurar a requisição HTTP por
 * N × 30 s. `code` é estável para quem mapeia erro → resposta; `message` é
 * a copy para o usuário (literal, sem culpa — DS §4.C).
 */
export class RenderOcupadoError extends Error {
  readonly code = "RENDER_OCUPADO" as const;
  readonly status = 503 as const;
  /** Sugestão de espera, em segundos, para `Retry-After`. */
  readonly retryAfterSegundos: number;
  constructor(esperouMs: number) {
    super(
      "A geração do PDF está ocupada agora. Nada foi gerado — tente de novo em alguns instantes.",
    );
    this.name = "RenderOcupadoError";
    this.retryAfterSegundos = Math.max(5, Math.ceil(esperouMs / 1000));
  }
}

let emUso = 0;
const fila: Array<() => void> = [];

function adquirir(timeoutMs: number): Promise<void> {
  if (emUso < MAX) {
    emUso++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const entrar = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    fila.push(entrar);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        // Sai da fila sem consumir o slot: quem estiver atrás sobe uma posição.
        const i = fila.indexOf(entrar);
        if (i >= 0) fila.splice(i, 1);
        reject(new RenderOcupadoError(timeoutMs));
      }, timeoutMs);
    }
  });
}

function liberar(): void {
  const proximo = fila.shift();
  if (proximo) proximo();
  else emUso--;
}

export interface RenderLockOpcoes {
  /** Sobrescreve `RENDER_LOCK_TIMEOUT_MS` (0 = espera ilimitada). */
  timeoutMs?: number;
}

export async function withRenderLock<T>(
  fn: () => Promise<T>,
  opcoes: RenderLockOpcoes = {},
): Promise<T> {
  await adquirir(opcoes.timeoutMs ?? RENDER_LOCK_TIMEOUT_MS);
  try {
    return await fn();
  } finally {
    liberar();
  }
}

/**
 * Contrato de Server Action (`{ error }`) para "render ocupado": as três
 * exportações de relatório (`export-logic`, `familia-logic`,
 * `convenio-narrativo-logic`) devolvem isto em vez de estourar — a copy já é
 * a de `message`; `retryAfterSegundos` deixa a UI sugerir quando tentar.
 */
export function erroDeActionSeRenderOcupado(err: unknown): {
  error: string;
  codigo: "RENDER_OCUPADO";
  retryAfterSegundos: number;
} | null {
  if (!(err instanceof RenderOcupadoError)) return null;
  return {
    error: err.message,
    codigo: err.code,
    retryAfterSegundos: err.retryAfterSegundos,
  };
}

/** Para rotas HTTP (`route.ts`): 503 + `Retry-After` + a mesma copy, em texto. */
export function respostaHttpSeRenderOcupado(err: unknown): Response | null {
  if (!(err instanceof RenderOcupadoError)) return null;
  return new Response(err.message, {
    status: err.status,
    headers: {
      "Retry-After": String(err.retryAfterSegundos),
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
