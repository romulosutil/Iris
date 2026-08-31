import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StubAsrProvider } from "./stub";

describe("StubAsrProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devolve texto determinístico sem chamar fetch", async () => {
    const provider = new StubAsrProvider();
    const audio = new Uint8Array([1, 2, 3, 4]);

    const resultado = await provider.transcrever(audio, "audio/webm");

    expect(resultado.texto).toContain("4 bytes");
    expect(resultado.texto).toContain("audio/webm");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("é determinístico para a mesma entrada", async () => {
    const provider = new StubAsrProvider();
    const audio = new Uint8Array(10);

    const r1 = await provider.transcrever(audio, "audio/webm");
    const r2 = await provider.transcrever(audio, "audio/webm");

    expect(r1.texto).toBe(r2.texto);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
