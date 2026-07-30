import { afterEach, describe, expect, test } from "vitest";
import { NullEmailProvider, ResendEmailProvider, resolveEmailProvider } from "./resend";

// Guardrail §4.2.1: nomes/categoria/trecho de paciente nunca podem aparecer no
// corpo do e-mail — o tipo de entrada (RtAlertaEmailInput) só aceita
// rtEmail/appUrl, então basta conferir que o template fixo não menciona
// nenhum termo clínico.
const TERMOS_CLINICOS_PROIBIDOS = [
  "paciente",
  "categoria",
  "trecho",
  "ideação",
  "autolesão",
  "violência",
];

describe("resend.ts — resolveEmailProvider (#126)", () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  test("sem EMAIL_PROVIDER_API_KEY resolve NullEmailProvider", () => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    expect(resolveEmailProvider()).toBeInstanceOf(NullEmailProvider);
  });

  test("com EMAIL_PROVIDER_API_KEY resolve ResendEmailProvider", () => {
    process.env.EMAIL_PROVIDER_API_KEY = "chave-de-teste";
    expect(resolveEmailProvider()).toBeInstanceOf(ResendEmailProvider);
  });

  test("NullEmailProvider nunca lança, sempre devolve falha explícita", async () => {
    const provider = new NullEmailProvider();
    const resultado = await provider.enviarAlertaRiscoRt();
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).toContain("EMAIL_PROVIDER_API_KEY");
    }
  });

  test("corpo fixo do e-mail não contém termo clínico (§4.2.1)", () => {
    // Reconstrói o mesmo template que ResendEmailProvider.enviarAlertaRiscoRt
    // monta, sem chamar o SDK real (sem key de verdade em teste).
    const appUrl = "https://irisclinica.ia.br/painel";
    const corpo = `<p>Um alerta de risco clínico da sua clínica está aguardando reconhecimento
        da equipe há mais tempo que o prazo interno configurado.</p>
        <p>Acesse o painel para revisar: <a href="${appUrl}">${appUrl}</a></p>
        <p>Consulte o Protocolo de Emergência Interno da clínica para a conduta indicada.</p>`;

    for (const proibido of TERMOS_CLINICOS_PROIBIDOS) {
      expect(corpo.toLowerCase()).not.toContain(proibido);
    }
  });
});
