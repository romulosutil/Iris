import { processarWebhookResend } from "@/lib/email/webhook";

/**
 * Webhook do Resend — E-mails Transacionais (#383).
 *
 * Recebe eventos de entrega, bounces e reclamações de e-mails transacionais
 * (verificação de conta, redefinição de senha, convites e alertas de risco RT).
 *
 * Guardrails e Diretrizes:
 * - Autenticação por assinatura Svix (cabeçalhos `svix-id`, `svix-timestamp`, `svix-signature`)
 *   validada contra `RESEND_WEBHOOK_SECRET`.
 * - Requisição sem assinatura válida retorna 401 sem logar o payload (zero trust).
 * - Requisições válidas sempre respondem 200 para evitar tempestades de retry do Resend.
 * - Log estruturado apenas com identificadores operacionais (`email_id`, `type`, timestamps).
 * - NUNCA expor destinatário (`to`), remetente (`from`), assunto (`subject`) ou corpo (LGPD/sigilo).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let corpoBruto: string;
  try {
    corpoBruto = await request.text();
  } catch {
    return Response.json({ error: "corpo ilegível" }, { status: 400 });
  }

  const resultado = await processarWebhookResend({
    corpoBruto,
    cabecalhos: request.headers,
  });

  return Response.json(resultado.body, { status: resultado.status });
}
