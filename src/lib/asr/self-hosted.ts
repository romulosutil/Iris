// SelfHostedAsrProvider — adapter real do serviço `iris-asr` (infra/asr/,
// runbook em infra/asr/runbook.md). POST de bytes crus, nunca stream: o
// servidor real exige `Content-Length` explícito e recusa 400 em
// `Transfer-Encoding: chunked` (runbook §0). O áudio não atravessa a
// internet — só o host interno do Swarm.
import { AsrProviderError, type AsrProvider } from "./provider";

/** `infra/asr/runbook.md` §0 — tabela canônica de códigos de recusa. */
function classificar(
  status: number,
): "saturacao" | "definitiva" | "transitoria" {
  switch (status) {
    case 503:
      return "saturacao";
    case 400:
    case 413:
      return "definitiva";
    case 408:
    case 500:
    default:
      return "transitoria";
  }
}

export class SelfHostedAsrProvider implements AsrProvider {
  private get url(): string {
    const url = process.env.ASR_SERVICE_URL;
    if (!url) {
      throw new Error(
        "ASR_SERVICE_URL não configurada — necessária para ASR_PROVIDER=self-hosted",
      );
    }
    return url;
  }

  private get token(): string {
    const token = process.env.ASR_SERVICE_TOKEN;
    if (!token) {
      throw new Error(
        "ASR_SERVICE_TOKEN não configurada — necessária para ASR_PROVIDER=self-hosted",
      );
    }
    return token;
  }

  private get timeoutMs(): number {
    const raw = process.env.ASR_SERVICE_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
  }

  async transcrever(
    audio: Uint8Array,
    mime: string,
  ): Promise<{ texto: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let resposta: Response;
    try {
      // Corpo como Buffer/Uint8Array — NUNCA stream. O servidor real exige
      // Content-Length explícito (runbook §0); passar um ReadableStream faz o
      // runtime emitir Transfer-Encoding: chunked, que o serviço recusa com 400.
      resposta = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": mime,
          "Content-Length": String(audio.byteLength),
        },
        // Buffer.from em vez do Uint8Array cru: o lib.dom.d.ts deste projeto
        // tipa BodyInit como Uint8Array<ArrayBuffer>, e um Uint8Array vindo de
        // fora pode carregar um ArrayBufferLike genérico (ex. SharedArrayBuffer)
        // que o overload de `fetch` rejeita em compile-time.
        body: Buffer.from(audio),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => undefined);
      throw new AsrProviderError(
        `Serviço ASR recusou a transcrição (status ${resposta.status})`,
        classificar(resposta.status),
        { status: resposta.status, corpo },
      );
    }

    const json = (await resposta.json()) as { texto?: unknown };
    if (typeof json.texto !== "string") {
      throw new AsrProviderError(
        "Serviço ASR devolveu 200 sem `texto` string",
        "transitoria",
        { status: resposta.status, corpo: json },
      );
    }

    return { texto: json.texto };
  }
}
