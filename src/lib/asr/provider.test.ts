/**
 * `getAsrProvider()` — a chave que decide se um teste/CI faz rede (#494, T22).
 *
 * POR QUE ESTE ARQUIVO EXISTE: até aqui `getAsrProvider()` não tinha teste
 * nenhum. Inverter o predicado de `provider.ts` (`=== "self-hosted"` para
 * `!== "self-hosted"`) sobrevivia à suíte inteira — e nessa inversão TODO
 * ambiente sem `ASR_PROVIDER=self-hosted` (ou seja: CI, teste unitário, demo,
 * dev local) passaria a instanciar o adapter que faz `fetch` contra
 * `ASR_SERVICE_URL`. R22 ("CI/teste nunca faz rede") ficava sem guarda
 * executável.
 *
 * A asserção-chave é a do fallback (`describe` "default"): ela é o oráculo que
 * mata a inversão, porque o default é justamente o que o resto da suíte usa
 * sem nunca conferir.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAsrProvider } from "./provider";
import { StubAsrProvider } from "./stub";
import { SelfHostedAsrProvider } from "./self-hosted";

describe("getAsrProvider — seleção estática por env (#72/R22)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sem ASR_PROVIDER cai no stub (default de CI/teste/demo)", () => {
    vi.stubEnv("ASR_PROVIDER", undefined);
    expect(getAsrProvider()).toBeInstanceOf(StubAsrProvider);
  });

  it("ASR_PROVIDER='stub' resolve o stub", () => {
    vi.stubEnv("ASR_PROVIDER", "stub");
    expect(getAsrProvider()).toBeInstanceOf(StubAsrProvider);
  });

  it("valor desconhecido ou vazio ainda cai no stub — nunca 'liga rede porque não reconheceu'", () => {
    for (const valor of ["", "self_hosted", "selfhosted", "SELF-HOSTED", "1"]) {
      vi.stubEnv("ASR_PROVIDER", valor);
      expect(
        getAsrProvider(),
        `ASR_PROVIDER='${valor}' deveria cair no stub`,
      ).toBeInstanceOf(StubAsrProvider);
    }
  });

  it("SÓ o literal exato 'self-hosted' resolve o adapter que faz rede", () => {
    vi.stubEnv("ASR_PROVIDER", "self-hosted");
    expect(getAsrProvider()).toBeInstanceOf(SelfHostedAsrProvider);
  });

  it("R22 medido no COMPORTAMENTO: o provider default transcreve sem tocar em fetch", async () => {
    // Não basta afirmar a classe — o que R22 proíbe é a chamada de rede. Aqui
    // o `fetch` global é espionado e a transcrição roda de ponta a ponta: se
    // o default virar o self-hosted, `fetch` é chamado e este teste cai por
    // observar a rede, não por comparar um nome de classe.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("R22: teste não pode fazer rede"));
    vi.stubEnv("ASR_PROVIDER", undefined);

    const { texto } = await getAsrProvider().transcrever(
      new Uint8Array([1, 2, 3]),
      "audio/webm",
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(texto).toContain("stub");
  });

  it("não guarda cache em módulo: mudar a env entre chamadas muda o provider", () => {
    // `getBillingProvider()` documenta o mesmo cuidado — congelar a env no
    // module-load quebra `vi.stubEnv` entre testes e faria esta suíte medir
    // sempre o primeiro valor visto no processo.
    vi.stubEnv("ASR_PROVIDER", "self-hosted");
    expect(getAsrProvider()).toBeInstanceOf(SelfHostedAsrProvider);
    vi.stubEnv("ASR_PROVIDER", "stub");
    expect(getAsrProvider()).toBeInstanceOf(StubAsrProvider);
  });
});
