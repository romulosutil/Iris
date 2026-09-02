import { timingSafeEqual } from "node:crypto";
import { processarProximo, expirarVencidos } from "@/lib/export/acervo/motor";
import {
  detalheDoErro,
  detalheSemPii,
  registrarHeartbeat,
} from "@/lib/jobs/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Validação de token Bearer em tempo constante.
 */
function autorizado(header: string | null): boolean {
  const esperado =
    process.env.EXPORT_JOB_TOKEN ??
    process.env.INTERNAL_JOB_TOKEN ??
    process.env.BILLING_JOB_TOKEN;

  if (!esperado || !header) return false;
  const prefixo = "Bearer ";
  if (!header.startsWith(prefixo)) return false;
  const recebido = header.slice(prefixo.length);
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!autorizado(request.headers.get("authorization"))) {
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

    // #536 — sinal de vida no banco (o `.mjs` deste job é fetch-only). Só
    // contagens; `bundleId`/`erro` dos itens NÃO entram.
    await registrarHeartbeat(
      "exportacao",
      true,
      detalheSemPii({ processados: processados.length, expirados }),
    );

    return Response.json({
      ok: true,
      processados,
      totalProcessados: processados.length,
      expirados,
    });
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
