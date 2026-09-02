import { processarProximo, expirarVencidos } from "@/lib/export/acervo/motor";
import { autorizarBearer } from "@/lib/security/autorizar-bearer";

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

    // Expira bundles com retenção vencida (> 72h)
    const { expirados } = await expirarVencidos();

    return Response.json({
      ok: true,
      processados,
      totalProcessados: processados.length,
      expirados,
    });
  } catch (err: any) {
    console.error("[job-exportacao-integral] falha no processamento", err);
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
