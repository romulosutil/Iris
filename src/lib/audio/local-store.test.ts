import "fake-indexeddb/auto";
import { describe, expect, test } from "vitest";
import { apagarAudioLocal, lerAudioLocal, salvarAudioLocal } from "./local-store";

describe("audio local store (IndexedDB)", () => {
  test("salvar → ler → apagar um blob", async () => {
    const blob = new Blob(["fake-audio"], { type: "audio/webm" });
    await salvarAudioLocal("cap-1", blob);
    const lido = await lerAudioLocal("cap-1");
    expect(lido).not.toBeNull();
    await apagarAudioLocal("cap-1");
    expect(await lerAudioLocal("cap-1")).toBeNull();
  });
});
