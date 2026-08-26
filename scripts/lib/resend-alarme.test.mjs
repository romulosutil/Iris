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
import { verificarBilling, verificarEscalonamento } from "../alarme-jobs.mjs";

// Dublês de `sql` que devolvem a MESMA forma de linha que
// app_alarme_billing_atrasado/app_alarme_escalonamento_atrasado (0129)
// devolvem de verdade — as funções abaixo constroem o `detalhe` real
// interpolando essa linha, então o guardrail clínico exercita o template
// literal de produção, não uma string reconstruída à mão que nunca falharia
// se alguém adicionasse um dado clínico ao template.
function sqlDubleQueRetorna(linhas) {
  return function sql() {
    return Promise.resolve(linhas);
  };
}

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

  test("detalhe REAL de verificarBilling (problema) nunca inclui marcadores clínicos", async () => {
    const sql = sqlDubleQueRetorna([
      {
        total: 3,
        primeira_clinic_id: "11111111-1111-1111-1111-111111111111",
        primeiro_vencimento: "2026-08-25T10:00:00.000Z",
      },
    ]);
    const resultado = await verificarBilling(sql);
    const corpo = montarCorpoAlarme(resultado.motivo, resultado.detalhe);

    expect(resultado.estado).toBe("problema");
    // Prova que o teste exercita o template real de produção, não uma
    // string reconstruída à mão.
    expect(corpo).toContain("3 ciclo(s)");
    expect(corpo).toContain("11111111-1111-1111-1111-111111111111");

    expect(corpo).not.toMatch(/nome/i);
    expect(corpo).not.toMatch(/paciente/i);
    expect(corpo).not.toMatch(/categoria/i);
  });

  test("detalhe REAL de verificarEscalonamento (problema) nunca inclui marcadores clínicos", async () => {
    const sql = sqlDubleQueRetorna([
      {
        total: 2,
        primeira_clinic_id: "22222222-2222-2222-2222-222222222222",
        primeiro_vencimento: "2026-08-25T10:00:00.000Z",
      },
    ]);
    const resultado = await verificarEscalonamento(sql);
    const corpo = montarCorpoAlarme(resultado.motivo, resultado.detalhe);

    expect(resultado.estado).toBe("problema");
    expect(corpo).toContain("2 alerta(s)");
    expect(corpo).toContain("22222222-2222-2222-2222-222222222222");

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
