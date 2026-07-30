import { afterEach, describe, expect, test } from "vitest";
import {
  montarCorpoAlertaRt,
  NullEmailProvider,
  ResendEmailProvider,
  resolveEmailProvider,
} from "./resend";
import { montarCorpoAlertaRt as montarCorpoAlertaRtMjs } from "../../../scripts/lib/resend-rt.mjs";

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

  // Asserta contra o MESMO `montarCorpoAlertaRt` que o provider usa para montar
  // o html — não contra uma cópia do template no teste. Uma cópia passaria
  // verde mesmo se alguém interpolasse nome de paciente no código real, o que
  // deixaria o guardrail §4.2.1 sem cobertura nenhuma.
  test("corpo fixo do e-mail não contém termo clínico (§4.2.1)", () => {
    const corpo = montarCorpoAlertaRt("https://irisclinica.ia.br/painel");

    for (const proibido of TERMOS_CLINICOS_PROIBIDOS) {
      expect(corpo.toLowerCase()).not.toContain(proibido);
    }
  });

  // O adapter do motor de escalonamento é um espelho deste (roda em `node`
  // puro, não importa `.ts`). Duplicação só é segura se a divergência quebrar
  // o build — senão um dos dois corpos vaza dado clínico sem ninguém ver.
  test("corpo do espelho .mjs é idêntico ao do adapter TS", () => {
    const appUrl = "https://irisclinica.ia.br/painel";
    expect(montarCorpoAlertaRtMjs(appUrl)).toBe(montarCorpoAlertaRt(appUrl));
  });

  test("sem appUrl o envio é recusado com falha explícita, sem chamar o provedor", async () => {
    const provider = new ResendEmailProvider("re_chave_de_teste", "iris@example.com");
    const resultado = await provider.enviarAlertaRiscoRt({ rtEmail: "rt@example.com", appUrl: "" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).toContain("NEXT_PUBLIC_APP_URL");
    }
  });
});
