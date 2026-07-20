const MAX = Number(process.env.RENDER_MAX_CONCURRENCY ?? "1");

let emUso = 0;
const fila: Array<() => void> = [];

function adquirir(): Promise<void> {
  if (emUso < MAX) { emUso++; return Promise.resolve(); }
  return new Promise((resolve) => fila.push(resolve));
}

function liberar(): void {
  const proximo = fila.shift();
  if (proximo) proximo();
  else emUso--;
}

export async function withRenderLock<T>(fn: () => Promise<T>): Promise<T> {
  await adquirir();
  try {
    return await fn();
  } finally {
    liberar();
  }
}
