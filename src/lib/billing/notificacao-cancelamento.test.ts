import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock do módulo de email transacional
const mockEnviarEmailTransacional = vi.fn();
vi.mock("@/lib/email/transacional", () => ({
  enviarEmailTransacional: (...args: unknown[]) =>
    mockEnviarEmailTransacional(...args),
}));

// Mock do levantamento de débito
const mockLevantarDebito = vi.fn();
vi.mock("./debito", () => ({
  levantarDebito: (...args: unknown[]) => mockLevantarDebito(...args),
}));

// Mock da URL base
vi.mock("@/lib/app-url", () => ({
  getAppBaseUrl: () => "https://app.irisclinica.ia.br",
}));

// Mock do authDb
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockInnerJoin = vi.fn();

vi.mock("@/db/client", () => ({
  authDb: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fromArgs: unknown[]) => {
          mockFrom(...fromArgs);
          return {
            where: (...whereArgs: unknown[]) => {
              mockWhere(...whereArgs);
              return {
                limit: (...limitArgs: unknown[]) => mockLimit(...limitArgs),
              };
            },
            innerJoin: (...joinArgs: unknown[]) => {
              mockInnerJoin(...joinArgs);
              return {
                where: (...whereArgs: unknown[]) => {
                  mockWhere(...whereArgs);
                  return {
                    limit: (...limitArgs: unknown[]) => mockLimit(...limitArgs),
                  };
                },
              };
            },
          };
        },
      };
    },
  },
}));

const { notificarCancelamentoAssinatura } =
  await import("./notificacao-cancelamento");

describe("notificarCancelamentoAssinatura", () => {
  const clinicId = "11111111-1111-4111-8111-111111111111";
  const subscriptionId = "22222222-2222-4222-8222-222222222222";
  const responsavelId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    mockLevantarDebito.mockResolvedValue({
      totalCentavos: 1300,
      ancoraId: "cycle-1",
      outrosIds: [],
      providerChargeId: null,
    });
    mockEnviarEmailTransacional.mockResolvedValue({ enviado: true });
  });

  it("despacha e-mail para o responsavelContaId da clínica com o débito apurado", async () => {
    // 1ª chamada: busca clinic
    mockLimit.mockResolvedValueOnce([
      {
        nome: "Clínica Florescer",
        emailFinanceiro: null,
        responsavelContaId: responsavelId,
      },
    ]);
    // 2ª chamada: busca appUser do responsavelContaId
    mockLimit.mockResolvedValueOnce([
      {
        name: "Dra. Beatriz",
        email: "beatriz@florescer.com.br",
      },
    ]);

    const resultado = await notificarCancelamentoAssinatura(
      clinicId,
      subscriptionId,
    );

    expect(resultado).toEqual({ enviado: true });
    expect(mockLevantarDebito).toHaveBeenCalledWith(subscriptionId);
    expect(mockEnviarEmailTransacional).toHaveBeenCalledWith(
      expect.objectContaining({
        para: "beatriz@florescer.com.br",
        assunto: expect.stringContaining("cancelada"),
        texto: expect.stringMatching(/R\$[\s\u00a0]*13,00/),
        html: expect.stringContaining(
          "https://app.irisclinica.ia.br/assinatura",
        ),
      }),
    );
  });

  it("utiliza emailFinanceiro como fallback se responsavelContaId não existir", async () => {
    // 1ª chamada: busca clinic sem responsavelContaId mas com emailFinanceiro
    mockLimit.mockResolvedValueOnce([
      {
        nome: "Clínica Crescer",
        emailFinanceiro: "financeiro@crescer.com.br",
        responsavelContaId: null,
      },
    ]);

    const resultado = await notificarCancelamentoAssinatura(
      clinicId,
      subscriptionId,
    );

    expect(resultado).toEqual({ enviado: true });
    expect(mockEnviarEmailTransacional).toHaveBeenCalledWith(
      expect.objectContaining({
        para: "financeiro@crescer.com.br",
      }),
    );
  });

  it("utiliza coordenador da clínica se responsavelContaId e emailFinanceiro forem nulos", async () => {
    // 1ª chamada: clinic sem responsável nem email financeiro
    mockLimit.mockResolvedValueOnce([
      {
        nome: "Clínica Integrar",
        emailFinanceiro: null,
        responsavelContaId: null,
      },
    ]);
    // 2ª chamada: busca coordenador em userRole
    mockLimit.mockResolvedValueOnce([
      {
        name: "Coord. Marcelo",
        email: "marcelo@integrar.com.br",
      },
    ]);

    const resultado = await notificarCancelamentoAssinatura(
      clinicId,
      subscriptionId,
    );

    expect(resultado).toEqual({ enviado: true });
    expect(mockEnviarEmailTransacional).toHaveBeenCalledWith(
      expect.objectContaining({
        para: "marcelo@integrar.com.br",
      }),
    );
  });

  it("retorna { enviado: false } sem lançar exceção quando nenhum destinatário for encontrado", async () => {
    // 1ª chamada: clinic sem responsável nem email financeiro
    mockLimit.mockResolvedValueOnce([
      {
        nome: "Clínica Sem Contato",
        emailFinanceiro: null,
        responsavelContaId: null,
      },
    ]);
    // 2ª chamada: sem coordenador
    mockLimit.mockResolvedValueOnce([]);

    const resultado = await notificarCancelamentoAssinatura(
      clinicId,
      subscriptionId,
    );

    expect(resultado).toEqual({
      enviado: false,
      motivo: "destinatario_nao_encontrado",
    });
    expect(mockEnviarEmailTransacional).not.toHaveBeenCalled();
  });

  it("retorna { enviado: false } sem lançar exceção quando a clínica não existir", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const resultado = await notificarCancelamentoAssinatura(
      clinicId,
      subscriptionId,
    );

    expect(resultado).toEqual({
      enviado: false,
      motivo: "clinica_nao_encontrada",
    });
    expect(mockEnviarEmailTransacional).not.toHaveBeenCalled();
  });

  it("nunca lança exceção para o chamador mesmo se enviarEmailTransacional rejeitar", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        nome: "Clínica Teste",
        emailFinanceiro: "teste@teste.com",
        responsavelContaId: null,
      },
    ]);
    mockEnviarEmailTransacional.mockRejectedValueOnce(
      new Error("Falha catastrófica de rede"),
    );

    const resultado = await notificarCancelamentoAssinatura(
      clinicId,
      subscriptionId,
    );

    expect(resultado).toEqual({
      enviado: false,
      motivo: "excecao_capturada",
    });
  });
});
