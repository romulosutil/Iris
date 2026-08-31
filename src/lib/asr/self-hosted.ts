// SelfHostedAsrProvider — adapter real do serviço `iris-asr` (infra/asr/,
// runbook em infra/asr/runbook.md). POST de bytes crus, nunca stream: o
// servidor real exige `Content-Length` explícito e recusa 400 em
// `Transfer-Encoding: chunked` (runbook §0). O áudio não atravessa a
// internet — só o host interno do Swarm.
import { AsrProviderError, type AsrProvider } from "./provider";

/**
 * `infra/asr/runbook.md` §0 — tabela canônica de códigos de recusa.
 *
 * `saturacao` é a categoria "**não é culpa do clipe**": o worker devolve a
 * linha para `na_fila` SEM gastar tentativa. O nome nasceu do 503 e ficou, mas
 * o critério é mais amplo — ver `AsrClassificacaoErro` em `provider.ts`.
 *
 * Toda recusa de INFRAESTRUTURA entra aqui (T14, #494). Antes, 401/403/404/
 * 502/504 caíam no `default: "transitoria"` e gastavam tentativa: com
 * `ASR_SERVICE_TOKEN` rotacionado só na app, o serviço responde 401 a tudo, o
 * agendador tica a cada 20s e em ~60s a fila inteira ia a `falhou` — e
 * `falhou` zera `objeto_ref` (`0136`), o que faz o worker apagar o áudio
 * clínico do MinIO para sempre. Reenviar o MESMO clipe depois do token
 * corrigido funciona, então nada disso pode contar contra o teto de 3.
 *
 * Só sobra contra o teto o que é do clipe (400/413) ou erro da aplicação
 * (500, 408, 200 sem `texto`).
 */
function classificar(
  status: number,
): "saturacao" | "definitiva" | "transitoria" {
  switch (status) {
    // 503: teto de ASR_MAX_CONCORRENTES. 401/403: token divergente entre app e
    // serviço. 404: ASR_SERVICE_URL apontando para rota/host errado. 502/504:
    // proxy do Easypanel reiniciando ou sem upstream.
    case 401:
    case 403:
    case 404:
    case 502:
    case 503:
    case 504:
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
    // 120s, não 30s (T15, #494): a mediana MEDIDA na VPS de produção para um
    // clipe de ~2 min no modelo `small` é 43,31s (43,17 / 43,31 / 46,13 —
    // runbook §2). O padrão anterior abortava ANTES da mediana, e o abort
    // resultante ainda por cima não chega ao servidor: `servidor.py` segura o
    // semáforo `_vagas` durante a transcrição inteira, então trabalho
    // abandonado ocupava as vagas e fazia todo o resto tomar 503. 120s dá ~2,8x
    // de folga sobre a mediana, cobrindo VPS sob carga concorrente sem esperar
    // indefinidamente.
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
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
    } catch (err) {
      // Abort do timeout e falha de rede (DNS, conexão recusada, TLS) escapavam
      // daqui como `DOMException`/`TypeError` crus — o worker não reconhecia
      // `AsrProviderError`, calculava `reverter = false` e gastava tentativa do
      // clipe (T14, #494). São a mesma categoria dos 5xx de infraestrutura: o
      // áudio está íntegro, o serviço é que não atendeu.
      //
      // O `ASR_SERVICE_URL`/`ASR_SERVICE_TOKEN` ausente também cai aqui (os
      // getters são avaliados dentro do `try`) — e é o desfecho certo: env não
      // aplicada é problema de infraestrutura, não motivo para apagar áudio.
      // A mensagem NÃO afirma causa única (memória
      // `mensagem-de-erro-que-afirma-causa`): o log do worker é a única pista
      // que sobra, e chutar "timeout" onde foi DNS custa o diagnóstico.
      throw new AsrProviderError(
        `Falha ao chamar o serviço ASR (timeout de ${this.timeoutMs} ms, rede ou configuração ausente): ${
          err instanceof Error ? err.message : String(err)
        }`,
        "saturacao",
        { corpo: err },
      );
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
