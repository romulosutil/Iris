import "fake-indexeddb/auto";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  apagarAudioLocal,
  chaveClipe,
  escolherCodec,
  lerAudioLocal,
  listarClipesDoLote,
  purgarLote,
  purgarTudo,
  registrarFlushOnline,
  salvarAudioLocal,
} from "./local-store";

describe("audio local store (IndexedDB)", () => {
  test("salvar → ler → apagar um blob", async () => {
    const blob = new Blob(["fake-audio"], { type: "audio/webm" });
    await salvarAudioLocal("cap-1", blob);
    const lido = await lerAudioLocal("cap-1");
    expect(lido).not.toBeNull();
    await apagarAudioLocal("cap-1");
    expect(await lerAudioLocal("cap-1")).toBeNull();
  });

  test("purgarTudo esvazia o store", async () => {
    await salvarAudioLocal("cap-2", new Blob(["a"]));
    await salvarAudioLocal("cap-3", new Blob(["b"]));
    await purgarTudo();
    expect(await lerAudioLocal("cap-2")).toBeNull();
    expect(await lerAudioLocal("cap-3")).toBeNull();
  });

  test("purgarTudo não lança quando IndexedDB falha (degradação R23)", async () => {
    const original = indexedDB.open;
    indexedDB.open = ((): IDBOpenDBRequest => {
      const req = {
        error: null as DOMException | null,
        onerror: null as ((ev: Event) => unknown) | null,
        onsuccess: null as ((ev: Event) => unknown) | null,
        onupgradeneeded: null as ((ev: Event) => unknown) | null,
      };
      queueMicrotask(() => {
        req.error = new DOMException("boom");
        req.onerror?.(new Event("error"));
      });
      return req as unknown as IDBOpenDBRequest;
    }) as typeof indexedDB.open;
    await expect(purgarTudo()).resolves.toBeUndefined();
    indexedDB.open = original;
  });

  test("listarClipesDoLote / purgarLote não misturam lotes", async () => {
    await salvarAudioLocal(chaveClipe("lote-a", 0), new Blob(["1"]));
    await salvarAudioLocal(chaveClipe("lote-a", 1), new Blob(["2"]));
    await salvarAudioLocal(chaveClipe("lote-b", 0), new Blob(["3"]));

    const doLoteA = await listarClipesDoLote("lote-a");
    const doLoteB = await listarClipesDoLote("lote-b");
    expect(doLoteA.sort()).toEqual(
      [chaveClipe("lote-a", 0), chaveClipe("lote-a", 1)].sort(),
    );
    expect(doLoteB).toEqual([chaveClipe("lote-b", 0)]);

    await purgarLote("lote-a");
    expect(await listarClipesDoLote("lote-a")).toEqual([]);
    // lote-b intacto
    expect(await lerAudioLocal(chaveClipe("lote-b", 0))).not.toBeNull();
    await purgarLote("lote-b");
  });

  test("listarClipesDoLote não lança quando IndexedDB falha (degradação R23)", async () => {
    const original = indexedDB.open;
    indexedDB.open = (() => {
      throw new Error("boom");
    }) as typeof indexedDB.open;
    await expect(listarClipesDoLote("lote-x")).resolves.toEqual([]);
    indexedDB.open = original;
  });
});

describe("registrarFlushOnline", () => {
  test("dispara o callback quando a conexão volta", () => {
    const cb = vi.fn();
    const limpar = registrarFlushOnline(cb);
    window.dispatchEvent(new Event("online"));
    expect(cb).toHaveBeenCalledTimes(1);
    limpar();
    window.dispatchEvent(new Event("online"));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("escolherCodec", () => {
  const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown })
    .MediaRecorder;

  afterEach(() => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder =
      originalMediaRecorder;
  });

  test("prefere webm/opus quando suportado", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: (tipo: string) => tipo === "audio/webm;codecs=opus",
    };
    expect(escolherCodec()).toBe("audio/webm;codecs=opus");
  });

  test("cai para mp4 (AAC) quando webm/opus não é suportado", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: () => false,
    };
    expect(escolherCodec()).toBe("audio/mp4");
  });

  test("cai para mp4 quando MediaRecorder não existe", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = undefined;
    expect(escolherCodec()).toBe("audio/mp4");
  });
});
