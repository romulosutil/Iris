import { processarProximo, expirarVencidos } from "@/lib/export/acervo/motor";
import { autorizarBearer } from "@/lib/security/autorizar-bearer";
import {
  detalheDoErro,
  detalheSemPii,
  registrarHeartbeat,
} from "@/lib/jobs/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Só `EXPORT_JOB_TOKEN` autoriza (A-05, #530). O fallback antigo para
 * `INTERNAL_JOB_TOKEN ?? BILLING_JOB_TOKEN` foi removido: vazar o segredo do
 * billing não pode dar poder sobre a exportação do acervo.
 */
export async function POST(request: Request): Promise<Response> {
  if (
    !autorizarBearer(
      request.headers.get("authorization"),
      process.env.EXPORT_JOB_TOKEN,
    )
  ) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    const processados: Array<{
      bundleId?: string;
      status?: string;
      erro?: string;
    }> = [];

    // Processa itens pendentes (até 5 por tick para evitar timeouts de requisição)
    for (let i = 0; i < 5; i++) {
      const res = await processarProximo();
      if (!res.processado) break;
      processados.push({
        bundleId: res.bundleId,
        status: res.status,
        erro: res.erro,
      });
    }

    // Expira bundles com retenção vencida (> 72h). Roda MESMO com bundle em
    // `falhou` acima: a falha de uma montagem não pode segurar a retenção das
    // outras.
    const { expirados } = await expirarVencidos();

    // Q-07 (#530): bundle `falhou` é falha da passada, e o sinal tem de subir
    // no status HTTP — o job (`scripts/exportacao-acervo.mjs`) só grava este
    // JSON e sai pelo `resposta.ok`. Um 200 `{ok:true}` com todo bundle em
    // `falhou` era o "exit 0 mentiroso" da #105 de novo: acervo pendente para
    // sempre, sem alarme. O corpo vai INTEIRO nos dois caminhos: o que montou,
    // o que falhou e por quê, e quantos expiraram.
    const bundlesFalhos = processados.filter(
      (p) => p.status === "falhou",
    ).length;
    const ok = bundlesFalhos === 0;

    // #536 — sinal de vida no banco (o `.mjs` deste job é fetch-only). Só
    // contagens; `bundleId`/`erro` dos itens NÃO entram. O heartbeat é gravado
    // DEPOIS do veredito da Q-07 e carrega o mesmo `ok`: passada com bundle em
    // `falhou` não pode carimbar sucesso no monitor enquanto devolve 500.
    await registrarHeartbeat(
      "exportacao",
      ok,
      detalheSemPii({
        processados: processados.length,
        bundlesFalhos,
        expirados,
      }),
    );

    return Response.json(
      {
        ok,
        processados,
        totalProcessados: processados.length,
        bundlesFalhos,
        expirados,
      },
      { status: ok ? 200 : 500 },
    );
  } catch (err: any) {
    console.error("[job-exportacao-integral] falha no processamento", err);
    await registrarHeartbeat("exportacao", false, detalheDoErro(err));
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
