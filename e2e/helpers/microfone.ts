import type { Page } from "@playwright/test";

/**
 * Dublê de `MediaRecorder` + `getUserMedia` para os specs que exercitam
 * gravação de áudio (`ditado-voz.spec.ts`, #494/T13).
 *
 * Mora num helper, e não dentro do spec, por dois motivos: o gravador de 1
 * clipe (`AudioLocal`) usa o MESMO `usarGravador`, então um spec futuro dele
 * reaproveita este dublê em vez de escrever um segundo que diverge em silêncio;
 * e um dublê isolável é um dublê verificável fora do fluxo inteiro.
 *
 * ## Por que `function`, nunca arrow
 *
 * `usarGravador` (src/lib/audio/usar-gravador.ts) faz `new MediaRecorder(...)`.
 * `new` sobre arrow function estoura "X is not a constructor" — e o `try/catch`
 * do hook engole a exceção e mostra a mensagem de "não foi possível acessar o
 * microfone". O teste então segue verde por um caminho que não é o do produto
 * (memória do repo `duble-arrow-nao-e-construtor`).
 *
 * ## Fidelidade que importa
 *
 * - `stop()` entrega o blob de forma ASSÍNCRONA (`setTimeout`), como o
 *   `MediaRecorder` real: o componente monta a lista de clipes no `onstop`, não
 *   no retorno do `stop()`.
 * - `stop()` num recorder já parado LANÇA. `usarGravador` chama `stop()` pelo
 *   botão e pelo timer do teto, e conta com o throw para o `catch` vazio dele.
 * - `isTypeSupported` só aceita `audio/webm;codecs=opus` — o ramo que
 *   `escolherCodec()` (R7) escolhe em Chromium. Fixá-lo mantém o `mimeType` do
 *   blob (e portanto o texto do `StubAsrProvider`) determinístico.
 * - `navigator.mediaDevices` entra por `defineProperty`: em contexto seguro
 *   (localhost é um) a propriedade é somente-leitura e a atribuição direta é
 *   ignorada EM SILÊNCIO — o spec cairia no ramo de permissão negada.
 *
 * @param bytes tamanho do clipe falso. Precisa ser > 0: `ondataavailable` só
 * empurra chunk com `size > 0`, e um blob vazio faria o lote subir 0 byte.
 */
export async function dublarMicrofone(
  page: Page,
  bytes: number,
): Promise<void> {
  await page.addInitScript((tamanho: number) => {
    function GravadorFalso(
      this: Record<string, unknown>,
      stream: unknown,
      opcoes?: { mimeType?: string },
    ) {
      this.stream = stream;
      this.mimeType = opcoes?.mimeType ?? "audio/webm";
      this.state = "inactive";
      this.ondataavailable = null;
      this.onstop = null;
    }

    GravadorFalso.prototype.start = function start(this: {
      state: string;
    }): void {
      this.state = "recording";
    };

    GravadorFalso.prototype.stop = function stop(this: {
      state: string;
      mimeType: string;
      ondataavailable: ((e: { data: Blob }) => void) | null;
      onstop: (() => void) | null;
    }): void {
      if (this.state === "inactive") throw new Error("InvalidStateError");
      this.state = "inactive";
      const recorder = this;
      setTimeout(() => {
        const dados = new Blob([new Uint8Array(tamanho)], {
          type: recorder.mimeType,
        });
        recorder.ondataavailable?.({ data: dados });
        recorder.onstop?.();
      }, 0);
    };

    GravadorFalso.isTypeSupported = (tipo: string): boolean =>
      tipo === "audio/webm;codecs=opus";

    (window as unknown as Record<string, unknown>).MediaRecorder =
      GravadorFalso;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }],
        }),
      },
    });
  }, bytes);
}
