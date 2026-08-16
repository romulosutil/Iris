import { describe, expect, it } from "vitest";
import { criarTemplateAvisoCancelamentoAssinatura } from "./templates";

describe("criarTemplateAvisoCancelamentoAssinatura", () => {
  const urlAssinatura = "https://irisclinica.ia.br/assinatura";

  it("renderiza template com débito em aberto formatado em BRL", () => {
    const { assunto, texto, html } = criarTemplateAvisoCancelamentoAssinatura({
      nomeResponsavel: "Dra. Helena",
      nomeClinica: "Clínica Crescer Bem",
      debitoCentavos: 1300,
      urlAssinatura,
    });

    expect(assunto).toContain("cancelada");
    expect(texto).toContain("Dra. Helena");
    expect(texto).toContain("Clínica Crescer Bem");
    expect(texto).toMatch(/R\$[\s\u00a0]*13,00/);
    expect(texto).toContain("somente-leitura");
    expect(texto).toContain(urlAssinatura);

    expect(html).toContain("Dra. Helena");
    expect(html).toContain("Clínica Crescer Bem");
    expect(html).toMatch(/R\$[\s\u00a0]*13,00/);
    expect(html).toContain("somente-leitura");
    expect(html).toContain(urlAssinatura);
  });

  it("renderiza template sem débito quando debitoCentavos for 0", () => {
    const { assunto, texto, html } = criarTemplateAvisoCancelamentoAssinatura({
      nomeResponsavel: "Dr. Carlos",
      nomeClinica: "Espaço Integrar",
      debitoCentavos: 0,
      urlAssinatura,
    });

    expect(assunto).toContain("cancelada");
    expect(texto).toContain("Dr. Carlos");
    expect(texto).toContain("Espaço Integrar");
    expect(texto).not.toContain("R$ 0,00");
    expect(texto).not.toContain("valor em aberto");
    expect(texto).toContain("somente-leitura");
    expect(texto).toContain(urlAssinatura);

    expect(html).toContain("Dr. Carlos");
    expect(html).toContain("Espaço Integrar");
    expect(html).not.toContain("R$ 0,00");
    expect(html).not.toContain("valor em aberto");
    expect(html).toContain("somente-leitura");
    expect(html).toContain(urlAssinatura);
  });

  it("trata ausência de nomeResponsavel usando saudação neutra", () => {
    const { texto, html } = criarTemplateAvisoCancelamentoAssinatura({
      nomeResponsavel: null,
      nomeClinica: "Clínica Progresso",
      debitoCentavos: 500,
      urlAssinatura,
    });

    expect(texto).toMatch(/^Olá!\n/);
    expect(html).toContain("Olá!");
  });

  it("escapa caracteres especiais de HTML no nome da clínica e responsável contra XSS", () => {
    const { html } = criarTemplateAvisoCancelamentoAssinatura({
      nomeResponsavel: "Maria <script>alert(1)</script>",
      nomeClinica: 'Clínica "A&B" <script>',
      debitoCentavos: 1000,
      urlAssinatura,
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Maria &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Clínica &quot;A&amp;B&quot; &lt;script&gt;");
  });
});
