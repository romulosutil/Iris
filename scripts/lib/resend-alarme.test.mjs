/**
 * #294 — testes do envio de e-mail de alarme automático de jobs de infra.
 * Cobre guardail de dados clínicos: o corpo NUNCA inclui paciente/categoria/
 * trecho, só contagem/timestamp/motivo operacional (§4.2.1).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  montarAssuntoAlarme,
  montarCorpoAlarme,
  enviarEmailAlarme,
} from "./resend-alarme.mjs";

// Mock de `resend`. Mesmo padrão do resend-rt.test.mjs: `function`, não arrow.
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: vi.fn() } };
  }),
}));

const BASE = {
  apiKey: "key_teste",
  fromEmail: "alarme@iris.example",
  destino: "ops@clinica.example",
  motivo: "billing_apurar_ciclo",
  detalhe: "Nenhuma varredura completou nos últimos 120 minutos.",
};

async function mockarResend(impl) {
  const { Resend } = await import("resend");
  Resend.mockImplementation(function () {
    return { emails: { send: impl } };
  });
}

describe("montarAssuntoAlarme", () => {
  test("inclui o motivo", () => {
    const assunto = montarAssuntoAlarme("billing_apurar_ciclo");
    expect(assunto).toContain("billing_apurar_ciclo");
    expect(assunto).toContain("alarme");
    expect(assunto).toContain("parado");
  });
});

describe("montarCorpoAlarme — guardrail clínico", () => {
  test("inclui motivo e detalhe", () => {
    const corpo = montarCorpoAlarme("billing_apurar_ciclo", "Timeout em 30min");
    expect(corpo).toContain("billing_apurar_ciclo");
    expect(corpo).toContain("Timeout em 30min");
  });

  test("nunca inclui marcadores clínicos (nome, paciente, categoria)", () => {
    const motivo = "billing_apurar_ciclo";
    const detalhe = "Nenhuma varredura completou nos últimos 120 minutos.";
    const corpo = montarCorpoAlarme(motivo, detalhe);

    // O detalhe operacional não contém dados clínicos — asserimos a ausência
    // deles no corpo como guardrail.
    expect(corpo).not.toMatch(/nome/i);
    expect(corpo).not.toMatch(/paciente/i);
    expect(corpo).not.toMatch(/categoria/i);
  });

  test("inclui referência ao runbook", () => {
    const corpo = montarCorpoAlarme("job_x", "detalhe");
    expect(corpo).toContain("infra/README.md");
    expect(corpo).toContain("runbook");
  });
});

describe("enviarEmailAlarme", () => {
  afterEach(() => vi.clearAllMocks());

  test("apiKey ausente retorna erro sem tentar importar resend", async () => {
    const resultado = await enviarEmailAlarme({
      ...BASE,
      apiKey: "",
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain("EMAIL_PROVIDER_API_KEY");

    // Verifica que nunca tentou importar resend (não há chamada no Resend mock).
    const { Resend } = await import("resend");
    expect(Resend).not.toHaveBeenCalled();
  });

  test("apiKey undefined retorna erro sem tentar importar resend", async () => {
    const resultado = await enviarEmailAlarme({
      ...BASE,
      apiKey: undefined,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain("EMAIL_PROVIDER_API_KEY");

    const { Resend } = await import("resend");
    expect(Resend).not.toHaveBeenCalled();
  });

  test("destino ausente retorna erro", async () => {
    const resultado = await enviarEmailAlarme({
      ...BASE,
      destino: "",
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain("ALARME_EMAIL_DESTINO");
  });

  test("destino undefined retorna erro", async () => {
    const resultado = await enviarEmailAlarme({
      ...BASE,
      destino: undefined,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain("ALARME_EMAIL_DESTINO");
  });

  test("envio com sucesso retorna ok=true e messageId", async () => {
    await mockarResend(
      vi.fn().mockResolvedValue({ data: { id: "msg_123" }, error: null }),
    );

    const resultado = await enviarEmailAlarme(BASE);

    expect(resultado.ok).toBe(true);
    expect(resultado.providerMessageId).toBe("msg_123");
  });

  test("erro do provedor retorna ok=false e mensagem de erro", async () => {
    await mockarResend(
      vi.fn().mockResolvedValue({
        data: null,
        error: { message: "invalid_email_address" },
      }),
    );

    const resultado = await enviarEmailAlarme(BASE);

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain("invalid_email_address");
  });

  test("exceção em runtime retorna ok=false", async () => {
    await mockarResend(vi.fn().mockRejectedValue(new Error("network failed")));

    const resultado = await enviarEmailAlarme(BASE);

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain("network failed");
  });

  test("email é enviado com os parâmetros corretos", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      data: { id: "msg_ok" },
      error: null,
    });
    await mockarResend(mockSend);

    await enviarEmailAlarme(BASE);

    expect(mockSend).toHaveBeenCalledWith({
      from: BASE.fromEmail,
      to: BASE.destino,
      subject: expect.stringContaining(BASE.motivo),
      html: expect.stringContaining(BASE.detalhe),
    });
  });
});
