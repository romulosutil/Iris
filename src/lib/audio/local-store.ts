/**
 * Store de áudio local (IndexedDB puro — sem lib externa em runtime).
 * Guarda o blob gravado no navegador do terapeuta até o upload real (fase
 * posterior); ninguém além do dispositivo local acessa esse dado.
 *
 * LIMPEZA SEM CHAMADOR EXPLÍCITO (T23/#494): `purgarTudo()` só roda nos
 * botões de sign-out — expiração de sessão, fechar a aba ou crash do
 * navegador não passam por ali, e áudio clínico gravado ficaria no
 * IndexedDB indefinidamente. Não dá para resolver com um cron no cliente
 * (não sobrevive à aba fechada, que é justamente um dos casos). A decisão:
 * expirar por IDADE da chave, verificado no PRÓXIMO boot que tocar o store
 * (`abrir()`, chamado por toda operação exportada daqui) — cobre sessão
 * expirada e crash porque a limpeza roda na sessão SEGUINTE, não depende de
 * um evento de logout ter disparado na anterior. O carimbo de tempo mora em
 * `localStorage` (não no IndexedDB): objectStore atual guarda só o Blob por
 * chave (`s.put(blob, id)`), e comparar preferimos não bumpar `VERSAO`/mudar
 * o schema do IndexedDB para isso (mesma régua do design.md §11 já seguida
 * por `chaveClipe`). `localStorage` é síncrono e best-effort — coerente com
 * R23 (falha nunca trava o fluxo).
 */
const DB = "iris-audio";
const STORE = "iris-audio-rascunho";
const VERSAO = 1;
const CHAVE_CARIMBOS = "iris-audio-carimbos";
const TTL_HORAS_DEFAULT = 24;

type Carimbos = Record<string, number>;

function lerCarimbos(): Carimbos {
  try {
    const bruto = localStorage.getItem(CHAVE_CARIMBOS);
    return bruto ? (JSON.parse(bruto) as Carimbos) : {};
  } catch {
    return {}; // degradação R23: localStorage indisponível/corrompido não trava
  }
}

function gravarCarimbos(carimbos: Carimbos): void {
  try {
    localStorage.setItem(CHAVE_CARIMBOS, JSON.stringify(carimbos));
  } catch {
    // degradação R23
  }
}

function registrarCarimbo(id: string): void {
  const carimbos = lerCarimbos();
  carimbos[id] = Date.now();
  gravarCarimbos(carimbos);
}

function removerCarimbo(id: string): void {
  const carimbos = lerCarimbos();
  if (id in carimbos) {
    delete carimbos[id];
    gravarCarimbos(carimbos);
  }
}

// Roda no máximo uma vez por carregamento de página — não a cada
// `abrir()` — para não pagar o custo de varrer `localStorage` em toda
// operação de IndexedDB.
let limpezaJaExecutada = false;

/**
 * Apaga do IndexedDB (e do carimbo) toda chave com mais de `ttlHoras`. Nunca
 * lança (R23). Exportada para o teste poder forçar a execução sem esperar o
 * agendamento de `abrir()`.
 */
export async function purgarVencidos(
  ttlHoras: number = TTL_HORAS_DEFAULT,
): Promise<void> {
  try {
    const agora = Date.now();
    const limiteMs = ttlHoras * 60 * 60 * 1000;
    const carimbos = lerCarimbos();
    const vencidos = Object.entries(carimbos)
      .filter(([, gravadoEm]) => agora - gravadoEm > limiteMs)
      .map(([id]) => id);
    for (const id of vencidos) {
      await apagarAudioLocal(id);
    }
  } catch {
    // degradação R23
  }
}

function agendarLimpezaVencidos(): void {
  if (limpezaJaExecutada) return;
  limpezaJaExecutada = true;
  void purgarVencidos();
}

function abrir(): Promise<IDBDatabase> {
  agendarLimpezaVencidos();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSAO);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(db.transaction(STORE, modo).objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const salvarAudioLocal = (id: string, blob: Blob): Promise<void> =>
  tx("readwrite", (s) => s.put(blob, id))
    .then(() => undefined)
    .then(() => registrarCarimbo(id));

export const lerAudioLocal = (id: string): Promise<Blob | null> =>
  tx<Blob | undefined>("readonly", (s) => s.get(id)).then((b) => b ?? null);

export const apagarAudioLocal = (id: string): Promise<void> =>
  tx("readwrite", (s) => s.delete(id))
    .then(() => undefined)
    .then(() => removerCarimbo(id));

/**
 * Chave composta p/ multi-clipe (T11): `${loteId}:${ordem}`. Sem mudar o
 * schema do IndexedDB — a chave já era string livre, então listar/purgar por
 * lote é uma faixa de chaves, sem precisar de object store novo nem bump de
 * VERSAO (design.md §11: não renomeia/reestrutura o store existente).
 */
export const chaveClipe = (loteId: string, ordem: number): string =>
  `${loteId}:${ordem}`;

/** Lista as chaves de clipes salvos daquele lote (T11 decide como gerá-las). */
export const listarClipesDoLote = (loteId: string): Promise<string[]> =>
  tx<IDBValidKey[]>("readonly", (s) =>
    s.getAllKeys(IDBKeyRange.bound(`${loteId}:`, `${loteId}:￿`)),
  )
    .then((chaves) => chaves.map(String))
    // R23: falha de IndexedDB não pode travar o fluxo — lote "vazio" é degradação segura
    .catch(() => []);

/** Apaga todos os clipes de um lote. Nunca lança (R23). */
export const purgarLote = (loteId: string): Promise<void> =>
  listarClipesDoLote(loteId)
    .then((ids) => Promise.all(ids.map((id) => apagarAudioLocal(id))))
    .then(() => undefined)
    .catch(() => undefined);

/**
 * Apaga TODO o conteúdo do store — chamado no logout. Nunca lança (R23):
 * falha de IndexedDB não pode travar o fluxo de sair da conta.
 */
export const purgarTudo = (): Promise<void> =>
  tx("readwrite", (s) => s.clear())
    .then(() => gravarCarimbos({}))
    .then(() => undefined)
    .catch(() => undefined);

/**
 * Registra callback disparado quando a conexão volta (`window.online`).
 * Só entrega o mecanismo de detecção — a lógica de reenvio de lote pendente
 * é do T11/T09. Devolve função de cleanup; nunca lança (R23).
 */
export function registrarFlushOnline(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    window.addEventListener("online", cb);
    return () => {
      try {
        window.removeEventListener("online", cb);
      } catch {
        // degradação R23
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * Escolhe o codec de gravação (R7): prefere webm/opus, cai para mp4 (AAC)
 * em navegadores sem suporte (ex.: Safari). Só a escolha — o componente de
 * gravação (T11) integra depois.
 */
export function escolherCodec(): string {
  try {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ) {
      return "audio/webm;codecs=opus";
    }
  } catch {
    // degradação R23: API instável/ausente não pode lançar
  }
  return "audio/mp4";
}
