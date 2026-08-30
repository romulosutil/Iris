// Porta (interface) do provider de transcrição de áudio (ASR) — issue #72.
//
// Regra de ouro (mesmo critério de src/lib/billing/provider/types.ts): nenhum
// vocabulário do serviço `iris-asr` (infra/asr/) vaza para cá. O contrato de
// recusa está documentado em `infra/asr/runbook.md` §0 e no design.md §5/§6.
//
// Seleção do provider é ESTÁTICA por env, nunca `await import()` dinâmico —
// memória do repo `carga-nao-cobre-import-dinamico`: import dinâmico em
// try/catch degrada em silêncio, e a carga passa verde com dependência
// ausente na imagem.
import { SelfHostedAsrProvider } from "./self-hosted";
import { StubAsrProvider } from "./stub";

export interface AsrProvider {
  transcrever(audio: Uint8Array, mime: string): Promise<{ texto: string }>;
}

/**
 * Classificação da recusa do serviço ASR — tabela canônica em
 * `infra/asr/runbook.md` §0.
 *
 * - `saturacao` (503): o serviço atingiu `ASR_MAX_CONCORRENTES`. Não é falha
 *   do clipe — quem consome (T07/worker) devolve para `na_fila` **revertendo**
 *   a tentativa (`app_asr_falhar(..., p_reverter_tentativa = true)`).
 * - `definitiva` (400/413): corpo ausente/malformado/truncado ou acima do
 *   teto (`ASR_MAX_BYTES`). Reenviar o MESMO áudio dá o mesmo erro — o worker
 *   marca o clipe como falho sem gastar nova tentativa em retry.
 * - `transitoria` (408/500): falha momentânea do serviço ou timeout de
 *   conexão. Conta tentativa; pode reenviar depois.
 */
export type AsrClassificacaoErro = "saturacao" | "definitiva" | "transitoria";

/**
 * Erro tipado por classificação — o chamador faz `if (err instanceof
 * AsrProviderError)` e olha `err.classificacao`, sem parsear mensagem de
 * string. Segue o precedente de `BillingProviderError`
 * (src/lib/billing/provider/types.ts): uma classe só, discriminada por campo,
 * em vez de N subclasses — o chamador testa um switch sobre
 * `classificacao`, não `instanceof` por tipo.
 */
export class AsrProviderError extends Error {
  readonly classificacao: AsrClassificacaoErro;
  readonly status?: number;
  readonly corpo?: unknown;

  constructor(
    mensagem: string,
    classificacao: AsrClassificacaoErro,
    opcoes?: { status?: number; corpo?: unknown },
  ) {
    super(mensagem);
    this.name = "AsrProviderError";
    this.classificacao = classificacao;
    this.status = opcoes?.status;
    this.corpo = opcoes?.corpo;
  }
}

/**
 * Resolve o provider ativo a partir de `ASR_PROVIDER`.
 *
 * Sem cache em módulo — resolve a cada chamada, para não congelar a env no
 * momento em que o módulo é avaliado (o mesmo cuidado de
 * `getBillingProvider()`, que documenta por que isso quebra `vi.stubEnv`
 * entre testes).
 *
 * `ASR_PROVIDER !== "self-hosted"` cai no stub por padrão — CI/teste/demo
 * nunca fazem rede (R22). Só produção liga o self-hosted, explicitamente.
 */
export function getAsrProvider(): AsrProvider {
  if (process.env.ASR_PROVIDER === "self-hosted") {
    return new SelfHostedAsrProvider();
  }
  return new StubAsrProvider();
}
