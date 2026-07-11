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

function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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
