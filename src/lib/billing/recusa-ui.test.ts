import { describe, it, expect } from "vitest";
import { montarAvisoRecusa } from "./recusa-ui";

/**
 * D36 — a metade "o que a clínica vê" da tabela da #318.
 *
 * A régua de mutação está no §5.2 do plano: apagar o ramo de fallback derruba
 * SÓ o caso G0; apagar a frase de prazo derruba SÓ os testes de relógio.
 */
const BASE = {
  statusAssinatura: "past_due",
  pastDueDesde: new Date("2026-08-01T12:00:00Z"),
  carenciaDias: 10,
  timezone: "America/Sao_Paulo",
  agora: new Date("2026-08-05T12:00:00Z"),
  podeEditarDadosDaClinica: true,
};

describe("montarAvisoRecusa", () => {
  it("usa a copy da política em G1 e não cita o código do gateway", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "MAXIMUM_AMOUNT_EXCEEDED",
    });

    expect(aviso.grupo).toBe("G1");
    expect(aviso.texto).toContain(
      "limite que você definiu no app do seu banco",
    );
    expect(aviso.texto).not.toContain("MAXIMUM_AMOUNT_EXCEEDED");
    // G1 não tem CTA: a ação é fora do Iris.
    expect(aviso.ctaHref).toBeNull();
  });

  it("manda para os dados da clínica em G4 (documento divergente)", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYER_CPF_CNPJ_MISMATCH",
    });

    expect(aviso.grupo).toBe("G4");
    expect(aviso.ctaHref).toBe("/clinica/dados");
    expect(aviso.ctaLabel).toBe("Corrigir dados da clínica");
  });

  it("manda terapeuta para a assinatura em G4, nunca para /clinica/dados (I1)", () => {
    // `/clinica/dados` é `requireRole(ctx, "coordenador")` + `notFound()` — a
    // faixa é global, então terapeuta com este CTA levava 404.
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYER_CPF_CNPJ_MISMATCH",
      podeEditarDadosDaClinica: false,
    });

    expect(aviso.grupo).toBe("G4");
    expect(aviso.ctaHref).toBe("/assinatura");
    expect(aviso.ctaLabel).not.toBe("Corrigir dados da clínica");
  });

  it("manda para a assinatura em G3 (autorização morta)", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "RECURRING_PAYMENT_NOT_CONFIRMED",
      // G3 não carimba past_due: o desfecho dele é corte, não carência.
      statusAssinatura: "active",
      pastDueDesde: null,
    });

    expect(aviso.grupo).toBe("G3");
    expect(aviso.ctaHref).toBe("/assinatura");
    // Sem carência correndo, não há relógio para mostrar.
    expect(aviso.prazo).toBeNull();
  });

  it("usa copy genérica quando a política não tem copy (G0 do backstop)", () => {
    // `carimbarPorPrazo` grava `status='falhou'` com `recusa_codigo = NULL`.
    // Sem este ramo, o caminho MAIS silencioso do produto continua mudo.
    const aviso = montarAvisoRecusa({ ...BASE, recusaCodigo: null });

    expect(aviso.grupo).toBe("G0");
    // M2 — o texto descreve o fato (prazo vencido), não uma diligência que não
    // houve: o backstop de D+7 não pergunta nada ao banco.
    expect(aviso.texto).toContain(
      "Não recebemos a confirmação do débito automático",
    );
    expect(aviso.ctaHref).toBe("/assinatura");
  });

  it("nunca diz 'não conseguimos concluir a cobrança' quando já foi paga (M1, G8)", () => {
    // G8 (`PAYMENT_ALREADY_DONE`) tem `copy: null` como G0/G6/G7, mas por
    // motivo OPOSTO: a cobrança FOI liquidada. `montarAvisoRecusa` é pura e
    // exportada — hoje o caminho real nunca chama com G8 (o ciclo vira `pago`,
    // não `falhou`), mas nada além deste teste garante isso.
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_ALREADY_DONE",
    });

    expect(aviso.grupo).toBe("G8");
    expect(aviso.texto).not.toContain("Não recebemos a confirmação");
    expect(aviso.texto).toMatch(/já foi paga/i);
  });

  it("conta os dias restantes de carência em dias civis, com a data", () => {
    // 01/08 + 10 dias = 11/08; em 05/08 restam 6 dias.
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    expect(aviso.prazo).toBe(
      "Sua assinatura será cancelada em 6 dias (11/08/2026) se o pagamento não for concluído.",
    );
  });

  it("usa singular no penúltimo dia", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      agora: new Date("2026-08-10T12:00:00Z"),
    });

    expect(aviso.prazo).toBe(
      "Sua assinatura será cancelada em 1 dia (11/08/2026) se o pagamento não for concluído.",
    );
  });

  it("diz 'hoje' no último dia", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      agora: new Date("2026-08-11T12:00:00Z"),
    });

    expect(aviso.prazo).toBe(
      "Sua assinatura será cancelada hoje (11/08/2026) se o pagamento não for concluído.",
    );
  });

  it("com o prazo vencido, diz que o cancelamento é iminente", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      agora: new Date("2026-08-14T12:00:00Z"),
    });

    expect(aviso.prazo).toBe(
      "O prazo para regularizar venceu em 11/08/2026: sua assinatura será cancelada na próxima verificação de cobrança.",
    );
  });

  it("não mostra relógio quando a assinatura não está em carência", () => {
    const aviso = montarAvisoRecusa({
      ...BASE,
      recusaCodigo: "PAYMENT_OVERDUE",
      statusAssinatura: "active",
      pastDueDesde: null,
    });

    expect(aviso.prazo).toBeNull();
  });

  it("nunca fala em valor de mensalidade ou de teto", () => {
    for (const codigo of [
      "MAXIMUM_AMOUNT_EXCEEDED",
      "PAYMENT_OVERDUE",
      "RECURRING_PAYMENT_NOT_CONFIRMED",
      "PAYER_CPF_CNPJ_MISMATCH",
      "ACCOUNT_CLOSED",
      null,
    ]) {
      const aviso = montarAvisoRecusa({ ...BASE, recusaCodigo: codigo });
      expect(aviso.texto).not.toMatch(/R\$|reais/i);
    }
  });
});
