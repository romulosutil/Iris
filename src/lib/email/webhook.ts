import { Webhook, WebhookVerificationError } from "svix";

export type ResendWebhookInput = {
  corpoBruto: string;
  cabecalhos: Headers;
};

export type ResendWebhookResult = {
  status: 200 | 400 | 401 | 500;
  body: Record<string, unknown>;
};

/**
 * Processador central de webhooks do Resend (#383).
 *
 * Regras de Governança & LGPD:
 * 1. Respostas 401 nunca logam o payload para evitar poluição de dados não autenticados.
 * 2. Eventos válidos sempre retornam 200 para evitar retentativas desnecessárias do Resend.
 * 3. Log estruturado NUNCA inclui dados clínicos, destinatário (`to`), remetente (`from`)
 *    ou assunto (`subject`) — apenas identificadores operacionais (`email_id`, `type`, timestamps).
 * 4. `bounce.message` NÃO é logado: é texto livre do MTA de destino (diagnóstico SMTP) e
 *    costuma embutir o endereço do destinatário (ex.: `550 5.1.1 <alguem@dominio> User unknown`).
 *    Apenas `bounce.type` (categoria fechada e operacional) é registrado.
 */
export async function processarWebhookResend(
  input: ResendWebhookInput,
): Promise<ResendWebhookResult> {
  const { corpoBruto, cabecalhos } = input;
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    return {
      status: 401,
      body: { error: "não autorizado" },
    };
  }

  const svixId = cabecalhos.get("svix-id");
  const svixTimestamp = cabecalhos.get("svix-timestamp");
  const svixSignature = cabecalhos.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return {
      status: 401,
      body: { error: "não autorizado" },
    };
  }

  let payload: Record<string, unknown>;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(corpoBruto, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return {
        status: 401,
        body: { error: "não autorizado" },
      };
    }
    if (err instanceof SyntaxError) {
      return {
        status: 400,
        body: { error: "corpo inválido (JSON esperado)" },
      };
    }
    return {
      status: 401,
      body: { error: "não autorizado" },
    };
  }

  const tipo = typeof payload.type === "string" ? payload.type : "desconhecido";
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const emailId =
    typeof data.email_id === "string"
      ? data.email_id
      : typeof payload.email_id === "string"
        ? payload.email_id
        : null;

  const createdAt =
    typeof payload.created_at === "string"
      ? payload.created_at
      : typeof data.created_at === "string"
        ? data.created_at
        : new Date().toISOString();

  if (tipo === "email.bounced") {
    const bounceObj = (data.bounce ?? {}) as Record<string, unknown>;
    const bounceType =
      typeof bounceObj.type === "string" ? bounceObj.type : undefined;
    console.warn("[resend-webhook] email.bounced", {
      type: "email.bounced",
      emailId,
      createdAt,
      bounceType,
    });
  } else if (tipo === "email.complained") {
    console.warn("[resend-webhook] email.complained", {
      type: "email.complained",
      emailId,
      createdAt,
    });
  } else {
    console.info("[resend-webhook] evento recebido", {
      type: tipo,
      emailId,
      createdAt,
    });
  }

  return {
    status: 200,
    body: { received: true },
  };
}
