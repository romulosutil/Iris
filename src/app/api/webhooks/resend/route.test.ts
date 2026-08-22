import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Webhook } from "svix";
import { POST as handleWebhook } from "./route";
import { POST as handleHookAlias } from "@/app/api/hooks/resend/route";

describe("POST /api/webhooks/resend & /api/hooks/resend", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const wh = new Webhook(secret);

  beforeEach(() => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function criarRequisicao(
    url: string,
    payload: string,
    headers: Record<string, string> = {},
  ): Request {
    return new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: payload,
    });
  }

  it("retorna 401 para requisição sem assinatura Svix", async () => {
    const req = criarRequisicao(
      "https://irisclinica.ia.br/api/webhooks/resend",
      '{"type":"email.bounced"}',
    );
    const res = await handleWebhook(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "não autorizado" });
  });

  it("retorna 401 para requisição com assinatura Svix inválida", async () => {
    const req = criarRequisicao(
      "https://irisclinica.ia.br/api/webhooks/resend",
      '{"type":"email.bounced"}',
      {
        "svix-id": "msg_invalid",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,assinaturainvalida",
      },
    );
    const res = await handleWebhook(req);
    expect(res.status).toBe(401);
  });

  it("retorna 200 e loga aviso estruturado para email.bounced", async () => {
    const payload = JSON.stringify({
      type: "email.bounced",
      created_at: "2026-08-22T04:30:00.000Z",
      data: {
        email_id: "resend_msg_001",
        from: "notificacoes@irisclinica.ia.br",
        to: ["terapeuta@clinica.com.br"],
        subject: "Convite de acesso",
        bounce: {
          message: "Recipiente desconhecido",
          type: "hard_bounce",
        },
      },
    });
    const ts = new Date();
    const sig = wh.sign("msg_bounce_1", ts, payload);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const req = criarRequisicao(
      "https://irisclinica.ia.br/api/webhooks/resend",
      payload,
      {
        "svix-id": "msg_bounce_1",
        "svix-timestamp": String(Math.floor(ts.getTime() / 1000)),
        "svix-signature": sig,
      },
    );

    const res = await handleWebhook(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    expect(warnSpy).toHaveBeenCalledWith(
      "[resend-webhook] email.bounced",
      expect.objectContaining({
        type: "email.bounced",
        emailId: "resend_msg_001",
        createdAt: "2026-08-22T04:30:00.000Z",
        bounceType: "hard_bounce",
      }),
    );

    // Verificação de isolamento LGPD
    const loggedStr = JSON.stringify(warnSpy.mock.calls);
    expect(loggedStr).not.toContain("terapeuta@clinica.com.br");
    expect(loggedStr).not.toContain("Convite de acesso");
  });

  it("retorna 200 para email.complained através da rota alias /api/hooks/resend", async () => {
    const payload = JSON.stringify({
      type: "email.complained",
      created_at: "2026-08-22T04:35:00.000Z",
      data: {
        email_id: "resend_msg_002",
      },
    });
    const ts = new Date();
    const sig = wh.sign("msg_complaint_2", ts, payload);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const req = criarRequisicao(
      "https://irisclinica.ia.br/api/hooks/resend",
      payload,
      {
        "svix-id": "msg_complaint_2",
        "svix-timestamp": String(Math.floor(ts.getTime() / 1000)),
        "svix-signature": sig,
      },
    );

    const res = await handleHookAlias(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    expect(warnSpy).toHaveBeenCalledWith(
      "[resend-webhook] email.complained",
      expect.objectContaining({
        type: "email.complained",
        emailId: "resend_msg_002",
        createdAt: "2026-08-22T04:35:00.000Z",
      }),
    );
  });

  it("retorna 400 para corpo que não é JSON válido com assinatura válida", async () => {
    const payload = "corpo-invalido";
    const ts = new Date();
    const sig = wh.sign("msg_bad_json", ts, payload);

    const req = criarRequisicao(
      "https://irisclinica.ia.br/api/webhooks/resend",
      payload,
      {
        "svix-id": "msg_bad_json",
        "svix-timestamp": String(Math.floor(ts.getTime() / 1000)),
        "svix-signature": sig,
      },
    );

    const res = await handleWebhook(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "corpo inválido (JSON esperado)",
    });
  });
});
