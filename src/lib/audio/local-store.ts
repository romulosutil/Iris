/**
 * Store de áudio local (IndexedDB puro — sem lib externa em runtime).
 * Guarda o blob gravado no navegador do terapeuta até o upload real (fase
 * posterior); ninguém além do dispositivo local acessa esse dado.
 */
const DB = "iris-audio";
const STORE = "iris-audio-rascunho";
const VERSAO = 1;

function abrir(): Promise<IDBDatabase> {
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
  tx("readwrite", (s) => s.put(blob, id)).then(() => undefined);

export const lerAudioLocal = (id: string): Promise<Blob | null> =>
  tx<Blob | undefined>("readonly", (s) => s.get(id)).then((b) => b ?? null);

export const apagarAudioLocal = (id: string): Promise<void> =>
  tx("readwrite", (s) => s.delete(id)).then(() => undefined);

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
