import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Webhook } from "svix";
import { processarWebhookResend, type ResendWebhookResult } from "./webhook";
import { capturarLog } from "@/lib/observabilidade/captura-de-log";

describe("Webhook Resend - processarWebhookResend", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const wh = new Webhook(secret);

  beforeEach(() => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("processarWebhookResend", () => {
    it("devolve 401 quando a assinatura não é válida", async () => {
      const res: ResendWebhookResult = await processarWebhookResend({
        corpoBruto: '{"type":"email.bounced"}',
        cabecalhos: new Headers(),
      });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "não autorizado" });
    });

    it("devolve 400 quando o corpo assinado não é um JSON válido", async () => {
      const payload = "corpo-invalido-nao-json";
      const timestamp = new Date();
      const sig = wh.sign("msg_err", timestamp, payload);
      const headers = new Headers({
        "svix-id": "msg_err",
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": sig,
      });

      const res = await processarWebhookResend({
        corpoBruto: payload,
        cabecalhos: headers,
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "corpo inválido (JSON esperado)" });
    });

    it("devolve 200 e emite log estruturado para email.bounced sem vazar PII/dados sensíveis", async () => {
      const payload = JSON.stringify({
        type: "email.bounced",
        created_at: "2026-08-22T04:00:00.000Z",
        data: {
          email_id: "5ef73628-99b3-406e-8a5e-653198031548",
          from: "notificacoes@irisclinica.ia.br",
          to: ["paciente.menor@familia.com"],
          subject: "Alerta de Risco Clínico do Paciente João",
          bounce: {
            message: "Mailbox does not exist",
            type: "hard_bounce",
          },
        },
      });
      const timestamp = new Date();
      const sig = wh.sign("msg_bounced", timestamp, payload);
      const headers = new Headers({
        "svix-id": "msg_bounced",
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": sig,
      });

      const log = capturarLog();

      try {
        const res = await processarWebhookResend({
          corpoBruto: payload,
          cabecalhos: headers,
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });

        expect(log.evento("resend-webhook.email-bounced")).toMatchObject({
          tipoEvento: "email.bounced",
          emailId: "5ef73628-99b3-406e-8a5e-653198031548",
          createdAt: "2026-08-22T04:00:00.000Z",
          bounceType: "hard_bounce",
        });

        // Guardrail LGPD: nenhum dado identificável (destinatário, assunto, corpo) nos logs
        expect(log.bruto()).not.toContain("paciente.menor@familia.com");
        expect(log.bruto()).not.toContain("Alerta de Risco Clínico");
        expect(log.bruto()).not.toContain("João");
      } finally {
        log.restaurar();
      }
    });

    it("não loga bounce.message: diagnóstico SMTP do MTA embute o destinatário", async () => {
      const payload = JSON.stringify({
        type: "email.bounced",
        created_at: "2026-08-22T04:00:00.000Z",
        data: {
          email_id: "5ef73628-99b3-406e-8a5e-653198031548",
          to: ["paciente.menor@familia.com"],
          bounce: {
            type: "hard_bounce",
            // Formato real de diagnóstico devolvido pelo MTA de destino.
            message:
              "550 5.1.1 <paciente.menor@familia.com>: Recipient address rejected: User unknown",
          },
        },
      });
      const timestamp = new Date();
      const sig = wh.sign("msg_bounce_diag", timestamp, payload);
      const headers = new Headers({
        "svix-id": "msg_bounce_diag",
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": sig,
      });

      const log = capturarLog();

      try {
        const res = await processarWebhookResend({
          corpoBruto: payload,
          cabecalhos: headers,
        });

        expect(res.status).toBe(200);

        expect(log.bruto()).not.toContain("paciente.menor@familia.com");
        expect(log.bruto()).not.toContain("Recipient address rejected");
        // O identificador operacional continua presente.
        expect(log.bruto()).toContain("hard_bounce");
      } finally {
        log.restaurar();
      }
    });

    it("devolve 200 e emite log estruturado para email.complained sem vazar PII", async () => {
      const payload = JSON.stringify({
        type: "email.complained",
        created_at: "2026-08-22T04:05:00.000Z",
        data: {
          email_id: "complaint-id-999",
          from: "notificacoes@irisclinica.ia.br",
          to: ["usuario@exemplo.com"],
          subject: "Convite de equipe",
        },
      });
      const timestamp = new Date();
      const sig = wh.sign("msg_complaint", timestamp, payload);
      const headers = new Headers({
        "svix-id": "msg_complaint",
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": sig,
      });

      const log = capturarLog();

      try {
        const res = await processarWebhookResend({
          corpoBruto: payload,
          cabecalhos: headers,
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });

        expect(log.evento("resend-webhook.email-complained")).toMatchObject({
          tipoEvento: "email.complained",
          emailId: "complaint-id-999",
          createdAt: "2026-08-22T04:05:00.000Z",
        });

        expect(log.bruto()).not.toContain("usuario@exemplo.com");
        expect(log.bruto()).not.toContain("Convite de equipe");
      } finally {
        log.restaurar();
      }
    });

    it("devolve 200 e loga info para outros eventos (ex: email.delivered, email.sent)", async () => {
      const payload = JSON.stringify({
        type: "email.delivered",
        created_at: "2026-08-22T04:10:00.000Z",
        data: {
          email_id: "deliv-id-123",
          to: ["outro@exemplo.com"],
        },
      });
      const timestamp = new Date();
      const sig = wh.sign("msg_deliv", timestamp, payload);
      const headers = new Headers({
        "svix-id": "msg_deliv",
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": sig,
      });

      const log = capturarLog();

      try {
        const res = await processarWebhookResend({
          corpoBruto: payload,
          cabecalhos: headers,
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
        expect(log.evento("resend-webhook.evento-recebido")).toMatchObject({
          nivel: "info",
          tipoEvento: "email.delivered",
          emailId: "deliv-id-123",
          createdAt: "2026-08-22T04:10:00.000Z",
        });

        expect(log.bruto()).not.toContain("outro@exemplo.com");
      } finally {
        log.restaurar();
      }
    });
  });
});
