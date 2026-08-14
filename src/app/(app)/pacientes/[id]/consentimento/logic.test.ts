import { describe, expect, it, vi, beforeEach } from "vitest";
import { registrarEventoConsentimento } from "./logic";
import { RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { traduzirErroDeConsentimento } from "@/lib/consent/erros";

// Mock das dependências externas
vi.mock("@/auth/require-role", () => ({
  requireRole: vi.fn(),
  RoleError: class RoleError extends Error {
    constructor() {
      super("RoleError");
      this.name = "RoleError";
    }
  },
}));

vi.mock("@/db/rls", () => ({
  withTenant: vi.fn(),
}));

vi.mock("@/lib/consent/erros", () => ({
  traduzirErroDeConsentimento: vi.fn(),
}));

describe("registrarEventoConsentimento - Tratamento de Erros", () => {
  const mockCtx = {} as TenantContext;
  const validPatientId = "123e4567-e89b-12d3-a456-426614174000"; // UUID válido
  const validEvent = { evento: "renovacao_maioridade" } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve re-lançar RoleError se o usuário não tiver permissão", async () => {
    // Simula a falha de permissão lançando RoleError dentro do withTenant
    // ou mesmo simulando que withTenant lance, já que a validação de role
    // ocorre antes, mas o catch envolve o withTenant
    vi.mocked(withTenant).mockRejectedValueOnce(new RoleError());

    await expect(
      registrarEventoConsentimento(mockCtx, validPatientId, validEvent)
    ).rejects.toThrow(RoleError);
  });

  it("deve capturar ErroDeValidacao e retornar a mensagem de erro", async () => {
    // ErroDeValidacao não é exportado, mas podemos forçar o withTenant a chamá-lo
    // ao fornecer um input inválido (ex: consentIdAlvo inválido na revogação)

    // Na revogação, consentIdAlvo = "invalido" vai estourar ErroDeValidacao
    // O withTenant precisa executar o callback para isso acontecer
    vi.mocked(withTenant).mockImplementation(async (_ctx, fn) => {
      // Passa um tx fake vazio, não importa porque a validação falha antes de usar o db
      return fn({} as any);
    });

    const result = await registrarEventoConsentimento(mockCtx, validPatientId, {
      evento: "revogacao",
      consentIdAlvo: "id-invalido-nao-uuid",
    });

    expect(result).toEqual({
      error: "Selecione qual consentimento será revogado.",
    });
  });

  it("deve usar o tradutor de erros para erros genéricos do banco", async () => {
    const errorDb = new Error("violação de constraint obscura do banco");
    vi.mocked(withTenant).mockRejectedValueOnce(errorDb);

    // Simula que o tradutor conseguiu identificar o erro
    vi.mocked(traduzirErroDeConsentimento).mockReturnValueOnce(
      "Erro traduzido e amigável para o operador."
    );

    const result = await registrarEventoConsentimento(mockCtx, validPatientId, validEvent);

    expect(result).toEqual({ error: "Erro traduzido e amigável para o operador." });
    expect(traduzirErroDeConsentimento).toHaveBeenCalledWith(errorDb);
  });

  it("deve usar mensagem fallback quando o tradutor não reconhece o erro", async () => {
    const erroDesconhecido = new Error("erro bizarro");
    vi.mocked(withTenant).mockRejectedValueOnce(erroDesconhecido);

    // Simula que o tradutor retornou null (não reconheceu o erro)
    vi.mocked(traduzirErroDeConsentimento).mockReturnValueOnce(null);

    const result = await registrarEventoConsentimento(mockCtx, validPatientId, validEvent);

    expect(result).toEqual({
      error: "Não foi possível registrar o evento de consentimento. Tente novamente.",
    });
  });
});
